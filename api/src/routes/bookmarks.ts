import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { sql } from "../db/client.js";
import { normalizeUrl } from "../utils/normalize.js";
import { fetchFaviconUrl } from "../services/favicon.js";
import { notFound, conflict, badRequest } from "../middleware/error.js";
import type { Bookmark } from "../db/schema.js";

const BookmarkSchema = z.object({
  id: z.string().uuid(),
  folder_id: z.string().uuid(),
  title: z.string(),
  url: z.string(),
  normalized_url: z.string(),
  description: z.string().nullable(),
  favicon_url: z.string().nullable(),
  position: z.number().int(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

const CreateBookmarkSchema = z.object({
  folder_id: z.string().uuid(),
  title: z.string().min(1).max(2000),
  url: z.string().min(1),
  description: z.string().max(5000).optional().nullable(),
  position: z.number().int().optional(),
});

const UpdateBookmarkSchema = z.object({
  folder_id: z.string().uuid().optional(),
  title: z.string().min(1).max(2000).optional(),
  url: z.string().min(1).optional(),
  description: z.string().max(5000).nullable().optional(),
  favicon_url: z.string().nullable().optional(),
  position: z.number().int().optional(),
});

async function getNextPosition(folderId: string): Promise<number> {
  const rows = await sql`SELECT COALESCE(MAX(position), 0) + 100 AS next FROM bookmarks WHERE folder_id = ${folderId}`;
  return Number(rows[0]?.next ?? 100);
}

export const bookmarksRouter = new OpenAPIHono();

// GET /bookmarks
bookmarksRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    tags: ["Bookmarks"],
    summary: "List bookmarks",
    request: {
      query: z.object({
        folder_id: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(1000).default(100).optional(),
        offset: z.coerce.number().int().min(0).default(0).optional(),
        q: z.string().optional(),
      }),
    },
    responses: {
      200: {
        content: { "application/json": { schema: z.object({ data: z.array(BookmarkSchema), total: z.number() }) } },
        description: "List of bookmarks",
      },
    },
  }),
  async (c) => {
    const { folder_id, limit = 100, offset = 0, q } = c.req.valid("query");

    let rows: Bookmark[];
    let countRows: { count: string }[];

    if (folder_id && q) {
      const like = `%${q}%`;
      rows = await sql`SELECT * FROM bookmarks WHERE folder_id = ${folder_id} AND (title ILIKE ${like} OR url ILIKE ${like}) ORDER BY position, created_at LIMIT ${limit} OFFSET ${offset}`;
      countRows = await sql`SELECT COUNT(*)::text AS count FROM bookmarks WHERE folder_id = ${folder_id} AND (title ILIKE ${like} OR url ILIKE ${like})`;
    } else if (folder_id) {
      rows = await sql`SELECT * FROM bookmarks WHERE folder_id = ${folder_id} ORDER BY position, created_at LIMIT ${limit} OFFSET ${offset}`;
      countRows = await sql`SELECT COUNT(*)::text AS count FROM bookmarks WHERE folder_id = ${folder_id}`;
    } else if (q) {
      const like = `%${q}%`;
      rows = await sql`SELECT * FROM bookmarks WHERE title ILIKE ${like} OR url ILIKE ${like} ORDER BY position, created_at LIMIT ${limit} OFFSET ${offset}`;
      countRows = await sql`SELECT COUNT(*)::text AS count FROM bookmarks WHERE title ILIKE ${like} OR url ILIKE ${like}`;
    } else {
      rows = await sql`SELECT * FROM bookmarks ORDER BY folder_id, position, created_at LIMIT ${limit} OFFSET ${offset}`;
      countRows = await sql`SELECT COUNT(*)::text AS count FROM bookmarks`;
    }

    return c.json({ data: rows, total: Number(countRows[0].count) });
  }
);

// POST /bookmarks
bookmarksRouter.openapi(
  createRoute({
    method: "post",
    path: "/",
    tags: ["Bookmarks"],
    summary: "Create a bookmark",
    request: {
      body: { content: { "application/json": { schema: CreateBookmarkSchema } }, required: true },
    },
    responses: {
      201: { content: { "application/json": { schema: BookmarkSchema } }, description: "Created bookmark" },
      400: { content: { "application/json": { schema: z.object({ error: z.any() }) } }, description: "Bad request" },
      409: { content: { "application/json": { schema: z.object({ error: z.any() }) } }, description: "Conflict" },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");

    const [folder] = await sql`SELECT id FROM folders WHERE id = ${body.folder_id}`;
    if (!folder) return notFound(c, "Folder") as any;

    const normalized = normalizeUrl(body.url);

    const [dup] = await sql`
      SELECT id FROM bookmarks WHERE normalized_url = ${normalized} AND folder_id = ${body.folder_id}
    `;
    if (dup) return conflict(c, "Bookmark with this URL already exists in this folder") as any;

    const position = body.position ?? (await getNextPosition(body.folder_id));

    const [bookmark] = await sql`
      INSERT INTO bookmarks (folder_id, title, url, normalized_url, description, position)
      VALUES (${body.folder_id}, ${body.title}, ${body.url}, ${normalized}, ${body.description ?? null}, ${position})
      RETURNING *
    `;

    // Async favicon fetch — non-blocking
    fetchFaviconUrl(body.url).then(async (faviconUrl) => {
      if (faviconUrl) {
        await sql`UPDATE bookmarks SET favicon_url = ${faviconUrl}, updated_at = NOW() WHERE id = ${bookmark.id}`;
      }
    }).catch(() => {});

    return c.json(bookmark, 201);
  }
);

// POST /bookmarks/deduplicate
bookmarksRouter.openapi(
  createRoute({
    method: "post",
    path: "/deduplicate",
    tags: ["Bookmarks"],
    summary: "Find and remove duplicate bookmarks across all folders",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({ dry_run: z.boolean().default(false).optional() }),
          },
        },
        required: false,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({ removed: z.number(), duplicates: z.array(z.any()) }),
          },
        },
        description: "Deduplication result",
      },
    },
  }),
  async (c) => {
    const body = c.req.valid("json") ?? {};
    const dryRun = body.dry_run ?? false;

    // Find bookmarks with duplicate normalized_url within the same folder
    const dupes: Bookmark[] = await sql`
      SELECT b.*
      FROM bookmarks b
      WHERE (b.normalized_url, b.folder_id) IN (
        SELECT normalized_url, folder_id
        FROM bookmarks
        GROUP BY normalized_url, folder_id
        HAVING COUNT(*) > 1
      )
      ORDER BY b.folder_id, b.normalized_url, b.created_at
    `;

    // Keep the first (oldest) of each group, remove the rest
    const toRemove: string[] = [];
    const seen = new Map<string, boolean>();
    for (const b of dupes) {
      const key = `${b.folder_id}:${b.normalized_url}`;
      if (!seen.has(key)) {
        seen.set(key, true);
      } else {
        toRemove.push(b.id);
      }
    }

    if (!dryRun && toRemove.length > 0) {
      await sql`DELETE FROM bookmarks WHERE id = ANY(${toRemove}::uuid[])`;
    }

    return c.json({ removed: toRemove.length, duplicates: dupes });
  }
);

// GET /bookmarks/:id
bookmarksRouter.openapi(
  createRoute({
    method: "get",
    path: "/:id",
    tags: ["Bookmarks"],
    summary: "Get a bookmark",
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: { content: { "application/json": { schema: BookmarkSchema } }, description: "Bookmark" },
      404: { content: { "application/json": { schema: z.object({ error: z.any() }) } }, description: "Not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const [bookmark] = await sql`SELECT * FROM bookmarks WHERE id = ${id}`;
    if (!bookmark) return notFound(c, "Bookmark") as any;
    return c.json(bookmark);
  }
);

// PUT /bookmarks/:id
bookmarksRouter.openapi(
  createRoute({
    method: "put",
    path: "/:id",
    tags: ["Bookmarks"],
    summary: "Update a bookmark",
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { "application/json": { schema: UpdateBookmarkSchema } }, required: true },
    },
    responses: {
      200: { content: { "application/json": { schema: BookmarkSchema } }, description: "Updated bookmark" },
      404: { content: { "application/json": { schema: z.object({ error: z.any() }) } }, description: "Not found" },
      409: { content: { "application/json": { schema: z.object({ error: z.any() }) } }, description: "Conflict" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    const [existing] = await sql`SELECT * FROM bookmarks WHERE id = ${id}`;
    if (!existing) return notFound(c, "Bookmark") as any;

    if (body.folder_id) {
      const [folder] = await sql`SELECT id FROM folders WHERE id = ${body.folder_id}`;
      if (!folder) return notFound(c, "Folder") as any;
    }

    let normalized = existing.normalized_url;
    if (body.url) {
      normalized = normalizeUrl(body.url);
      const targetFolder = body.folder_id ?? existing.folder_id;
      const [dup] = await sql`
        SELECT id FROM bookmarks WHERE normalized_url = ${normalized} AND folder_id = ${targetFolder} AND id != ${id}
      `;
      if (dup) return conflict(c, "Bookmark with this URL already exists in this folder") as any;
    }

    const [updated] = await sql`
      UPDATE bookmarks SET
        folder_id      = COALESCE(${body.folder_id ?? null}, folder_id),
        title          = COALESCE(${body.title ?? null}, title),
        url            = COALESCE(${body.url ?? null}, url),
        normalized_url = COALESCE(${body.url ? normalized : null}, normalized_url),
        description    = CASE WHEN ${body.description !== undefined} THEN ${body.description ?? null} ELSE description END,
        favicon_url    = CASE WHEN ${body.favicon_url !== undefined} THEN ${body.favicon_url ?? null} ELSE favicon_url END,
        position       = COALESCE(${body.position ?? null}, position),
        updated_at     = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    return c.json(updated);
  }
);

// DELETE /bookmarks/:id
bookmarksRouter.openapi(
  createRoute({
    method: "delete",
    path: "/:id",
    tags: ["Bookmarks"],
    summary: "Delete a bookmark",
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      204: { description: "Deleted" },
      404: { content: { "application/json": { schema: z.object({ error: z.any() }) } }, description: "Not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const [bookmark] = await sql`SELECT id FROM bookmarks WHERE id = ${id}`;
    if (!bookmark) return notFound(c, "Bookmark") as any;
    await sql`DELETE FROM bookmarks WHERE id = ${id}`;
    return c.body(null, 204);
  }
);
