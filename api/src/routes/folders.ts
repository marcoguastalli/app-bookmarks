import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { sql } from "../db/client.js";
import { env } from "../env.js";
import type { Folder, FolderTree } from "../db/schema.js";
import { notFound, conflict, badRequest, errorResponse } from "../middleware/error.js";

const FolderSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  parent_id: z.string().uuid().nullable(),
  position: z.number().int(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

const FolderTreeSchema: z.ZodType<any> = z.lazy(() =>
  FolderSchema.extend({ children: z.array(FolderTreeSchema) })
);

const CreateFolderSchema = z.object({
  name: z.string().min(1).max(255),
  parent_id: z.string().uuid().nullable().optional(),
  position: z.number().int().optional(),
});

const UpdateFolderSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  parent_id: z.string().uuid().nullable().optional(),
  position: z.number().int().optional(),
});

function buildTree(folders: Folder[]): FolderTree[] {
  const map = new Map<string, FolderTree>();
  for (const f of folders) map.set(f.id, { ...f, children: [] });
  const roots: FolderTree[] = [];
  for (const f of folders) {
    const node = map.get(f.id)!;
    if (f.parent_id) {
      const parent = map.get(f.parent_id);
      if (parent) parent.children.push(node);
      else roots.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

async function getFolderDepth(parentId: string): Promise<number> {
  let depth = 0;
  let current: string | null = parentId;
  while (current) {
    depth++;
    const [row] = await sql`SELECT parent_id FROM folders WHERE id = ${current}`;
    if (!row) break;
    current = row.parent_id;
  }
  return depth;
}

async function isCyclic(folderId: string, newParentId: string): Promise<boolean> {
  let current: string | null = newParentId;
  while (current) {
    if (current === folderId) return true;
    const [row] = await sql`SELECT parent_id FROM folders WHERE id = ${current}`;
    if (!row) break;
    current = row.parent_id;
  }
  return false;
}

async function getNextPosition(parentId: string | null): Promise<number> {
  const rows =
    parentId !== null
      ? await sql`SELECT COALESCE(MAX(position), 0) + 100 AS next FROM folders WHERE parent_id = ${parentId}`
      : await sql`SELECT COALESCE(MAX(position), 0) + 100 AS next FROM folders WHERE parent_id IS NULL`;
  return Number(rows[0]?.next ?? 100);
}

export const foldersRouter = new OpenAPIHono();

// GET /folders
foldersRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    tags: ["Folders"],
    summary: "List folders",
    request: {
      query: z.object({
        limit: z.coerce.number().int().min(1).max(1000).default(100).optional(),
        offset: z.coerce.number().int().min(0).default(0).optional(),
        parent_id: z.string().uuid().optional(),
      }),
    },
    responses: {
      200: {
        content: { "application/json": { schema: z.object({ data: z.array(FolderSchema), total: z.number() }) } },
        description: "List of folders",
      },
    },
  }),
  async (c) => {
    const { limit = 100, offset = 0, parent_id } = c.req.valid("query");
    let rows: Folder[];
    let countRows: { count: string }[];

    if (parent_id !== undefined) {
      rows = await sql`SELECT * FROM folders WHERE parent_id = ${parent_id} ORDER BY position, created_at LIMIT ${limit} OFFSET ${offset}`;
      countRows = await sql`SELECT COUNT(*)::text AS count FROM folders WHERE parent_id = ${parent_id}`;
    } else {
      rows = await sql`SELECT * FROM folders ORDER BY position, created_at LIMIT ${limit} OFFSET ${offset}`;
      countRows = await sql`SELECT COUNT(*)::text AS count FROM folders`;
    }

    return c.json({ data: rows, total: Number(countRows[0].count) });
  }
);

// GET /folders/tree
foldersRouter.openapi(
  createRoute({
    method: "get",
    path: "/tree",
    tags: ["Folders"],
    summary: "Get folder tree",
    responses: {
      200: {
        content: { "application/json": { schema: z.object({ data: z.array(z.any()) }) } },
        description: "Nested folder tree",
      },
    },
  }),
  async (c) => {
    const folders: Folder[] = await sql`SELECT * FROM folders ORDER BY position, created_at`;
    return c.json({ data: buildTree(folders) });
  }
);

// POST /folders
foldersRouter.openapi(
  createRoute({
    method: "post",
    path: "/",
    tags: ["Folders"],
    summary: "Create a folder",
    request: {
      body: { content: { "application/json": { schema: CreateFolderSchema } }, required: true },
    },
    responses: {
      201: { content: { "application/json": { schema: FolderSchema } }, description: "Created folder" },
      400: { content: { "application/json": { schema: z.object({ error: z.any() }) } }, description: "Bad request" },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const parentId = body.parent_id ?? null;

    if (parentId) {
      const [parent] = await sql`SELECT id FROM folders WHERE id = ${parentId}`;
      if (!parent) return notFound(c, "Parent folder") as any;

      const depth = await getFolderDepth(parentId);
      if (depth >= env.MAX_FOLDER_DEPTH) {
        return badRequest(c, `Maximum folder depth of ${env.MAX_FOLDER_DEPTH} exceeded`) as any;
      }
    }

    const position = body.position ?? (await getNextPosition(parentId));
    const [folder] =
      parentId !== null
        ? await sql`INSERT INTO folders (name, parent_id, position) VALUES (${body.name}, ${parentId}, ${position}) RETURNING *`
        : await sql`INSERT INTO folders (name, position) VALUES (${body.name}, ${position}) RETURNING *`;

    return c.json(folder, 201);
  }
);

// PUT /folders/:id
foldersRouter.openapi(
  createRoute({
    method: "put",
    path: "/:id",
    tags: ["Folders"],
    summary: "Update a folder",
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { "application/json": { schema: UpdateFolderSchema } }, required: true },
    },
    responses: {
      200: { content: { "application/json": { schema: FolderSchema } }, description: "Updated folder" },
      400: { content: { "application/json": { schema: z.object({ error: z.any() }) } }, description: "Bad request" },
      404: { content: { "application/json": { schema: z.object({ error: z.any() }) } }, description: "Not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    const [existing] = await sql`SELECT * FROM folders WHERE id = ${id}`;
    if (!existing) return notFound(c, "Folder") as any;

    if (body.parent_id !== undefined) {
      const newParentId = body.parent_id;

      if (newParentId === id) {
        return badRequest(c, "A folder cannot be its own parent") as any;
      }

      if (newParentId !== null) {
        const [parent] = await sql`SELECT id FROM folders WHERE id = ${newParentId}`;
        if (!parent) return notFound(c, "Parent folder") as any;

        if (await isCyclic(id, newParentId)) {
          return badRequest(c, "Cyclic parent relationship detected") as any;
        }

        const depth = await getFolderDepth(newParentId);
        if (depth >= env.MAX_FOLDER_DEPTH) {
          return badRequest(c, `Maximum folder depth of ${env.MAX_FOLDER_DEPTH} exceeded`) as any;
        }
      }
    }

    const [updated] = await sql`
      UPDATE folders SET
        name       = COALESCE(${body.name ?? null}, name),
        parent_id  = CASE WHEN ${body.parent_id !== undefined} THEN ${body.parent_id ?? null} ELSE parent_id END,
        position   = COALESCE(${body.position ?? null}, position),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    return c.json(updated);
  }
);

// DELETE /folders/:id
foldersRouter.openapi(
  createRoute({
    method: "delete",
    path: "/:id",
    tags: ["Folders"],
    summary: "Delete a folder",
    request: {
      params: z.object({ id: z.string().uuid() }),
      query: z.object({ force: z.coerce.boolean().default(false).optional() }),
    },
    responses: {
      204: { description: "Deleted" },
      400: { content: { "application/json": { schema: z.object({ error: z.any() }) } }, description: "Bad request" },
      404: { content: { "application/json": { schema: z.object({ error: z.any() }) } }, description: "Not found" },
      409: { content: { "application/json": { schema: z.object({ error: z.any() }) } }, description: "Conflict" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const { force = false } = c.req.valid("query");

    const [folder] = await sql`SELECT id FROM folders WHERE id = ${id}`;
    if (!folder) return notFound(c, "Folder") as any;

    const [childCount] = await sql`SELECT COUNT(*)::int AS count FROM folders WHERE parent_id = ${id}`;
    const [bookmarkCount] = await sql`SELECT COUNT(*)::int AS count FROM bookmarks WHERE folder_id = ${id}`;

    const hasChildren = Number(childCount.count) > 0;
    const hasBookmarks = Number(bookmarkCount.count) > 0;

    if ((hasChildren || hasBookmarks) && !force) {
      return errorResponse(
        c,
        409,
        "FOLDER_NOT_EMPTY",
        "Folder is not empty. Use ?force=true to cascade delete.",
        { children: Number(childCount.count), bookmarks: Number(bookmarkCount.count) }
      ) as any;
    }

    if (force && hasChildren) {
      // Cascade delete children recursively via DB constraints + manual recursion
      await deleteFolderCascade(id);
    } else {
      await sql`DELETE FROM folders WHERE id = ${id}`;
    }

    return c.body(null, 204);
  }
);

async function deleteFolderCascade(folderId: string): Promise<void> {
  const children: { id: string }[] = await sql`SELECT id FROM folders WHERE parent_id = ${folderId}`;
  for (const child of children) {
    await deleteFolderCascade(child.id);
  }
  await sql`DELETE FROM folders WHERE id = ${folderId}`;
}
