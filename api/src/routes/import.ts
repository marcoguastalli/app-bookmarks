import { Hono } from "hono";
import { z } from "zod";
import { sql } from "../db/client.js";
import { importBookmarks } from "../services/import.js";
import { badRequest, notFound } from "../middleware/error.js";

export const importRouter = new Hono();

importRouter.post("/", async (c) => {
  const querySchema = z.object({
    dryRun: z
      .string()
      .transform((v) => v === "true")
      .optional()
      .default("false"),
    folder_id: z.string().uuid(),
  });

  const query = querySchema.safeParse({
    dryRun: c.req.query("dryRun"),
    folder_id: c.req.query("folder_id"),
  });

  if (!query.success) {
    return badRequest(c, "folder_id (UUID) is required as query parameter", query.error.flatten());
  }

  const { dryRun, folder_id } = query.data;

  const [folder] = await sql`SELECT id FROM folders WHERE id = ${folder_id}`;
  if (!folder) return notFound(c, "Target folder");

  let html: string;
  const contentType = c.req.header("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const body = await c.req.parseBody();
    const file = body["file"];
    if (!file || typeof file === "string") {
      return badRequest(c, "Multipart field 'file' must be a file");
    }
    html = await (file as File).text();
  } else {
    html = await c.req.text();
  }

  if (!html.trim()) {
    return badRequest(c, "Request body is empty");
  }

  const result = await importBookmarks(html, folder_id, dryRun, sql);

  return c.json({ dry_run: dryRun, ...result }, 200);
});
