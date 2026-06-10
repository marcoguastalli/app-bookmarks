import { Hono } from "hono";
import { sql } from "../db/client.js";

export const adminRouter = new Hono();

adminRouter.post("/reset", async (c) => {
  await sql`TRUNCATE TABLE bookmarks, folders`;
  return c.json({ ok: true });
});
