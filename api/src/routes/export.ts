import { Hono } from "hono";
import { stream } from "hono/streaming";
import { z } from "zod";
import { sql } from "../db/client.js";
import { generateBookmarksHtml } from "../services/export.js";
import { badRequest } from "../middleware/error.js";

const ExportBodySchema = z.object({
  folder_ids: z.array(z.string().uuid()).min(1),
});

export const exportRouter = new Hono();

exportRouter.post("/", async (c) => {
  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return badRequest(c, "Invalid JSON body");
  }

  const parsed = ExportBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return badRequest(c, "Validation failed", parsed.error.flatten().fieldErrors);
  }

  const { folder_ids } = parsed.data;

  // Validate all folder IDs exist
  const found: { id: string }[] = await sql`SELECT id FROM folders WHERE id = ANY(${folder_ids}::uuid[])`;
  if (found.length !== folder_ids.length) {
    return badRequest(c, "One or more folder IDs not found");
  }

  c.header("Content-Type", "text/html; charset=UTF-8");
  c.header("Content-Disposition", 'attachment; filename="bookmarks.html"');

  return stream(c, async (s) => {
    s.onAbort(() => {});
    for await (const chunk of generateBookmarksHtml(folder_ids, sql)) {
      await s.write(chunk);
    }
  });
});
