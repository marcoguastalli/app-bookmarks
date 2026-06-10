import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { setupTestDb, cleanTestDb, teardownTestDb, testSql } from "../setup.js";
import { app } from "../../src/index.js";

beforeAll(async () => {
  await setupTestDb();
});

beforeEach(async () => {
  await cleanTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

const NETSCAPE_HTML = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
    <DT><H3>Dev</H3>
    <DL><p>
        <DT><A HREF="https://bun.sh">Bun</A>
        <DT><A HREF="https://hono.dev">Hono</A>
    </DL><p>
    <DT><A HREF="https://github.com">GitHub</A>
</DL><p>`;

async function createFolder(name = "Import Target") {
  const res = await app.request("/folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return (await res.json()) as { id: string };
}

async function importRequest(html: string, folderId: string, dryRun = false) {
  const url = `/import?folder_id=${folderId}${dryRun ? "&dryRun=true" : ""}`;
  return app.request(url, {
    method: "POST",
    headers: { "Content-Type": "text/html" },
    body: html,
  });
}

describe("POST /import", () => {
  it("imports bookmarks and folders", async () => {
    const folder = await createFolder();
    const res = await importRequest(NETSCAPE_HTML, folder.id);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.imported).toBeGreaterThan(0);
    expect(body.skipped).toBe(0);
  });

  it("dry run does not persist data", async () => {
    const folder = await createFolder();
    await importRequest(NETSCAPE_HTML, folder.id, true);

    const rows = await testSql`SELECT COUNT(*)::int AS count FROM bookmarks WHERE folder_id = ${folder.id}`;
    expect(Number(rows[0].count)).toBe(0);
  });

  it("dry run returns summary", async () => {
    const folder = await createFolder();
    const res = await importRequest(NETSCAPE_HTML, folder.id, true);
    const body = await res.json();
    expect(body.dry_run).toBe(true);
    expect(typeof body.imported).toBe("number");
    expect(typeof body.skipped).toBe("number");
    expect(Array.isArray(body.warnings)).toBe(true);
  });

  it("skips duplicate URLs and adds to warnings", async () => {
    const folder = await createFolder();
    // First import
    await importRequest(NETSCAPE_HTML, folder.id);
    // Second import (all bookmarks are now duplicates)
    const res = await importRequest(NETSCAPE_HTML, folder.id);
    const body = await res.json();
    expect(body.skipped).toBeGreaterThan(0);
    expect(body.warnings.length).toBeGreaterThan(0);
  });

  it("returns 400 when folder_id is missing", async () => {
    const res = await app.request("/import", {
      method: "POST",
      headers: { "Content-Type": "text/html" },
      body: NETSCAPE_HTML,
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent target folder", async () => {
    const res = await importRequest(NETSCAPE_HTML, "00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });

  it("handles empty HTML gracefully", async () => {
    const folder = await createFolder();
    const res = await importRequest("<DL></DL>", folder.id);
    const body = await res.json();
    expect(body.imported).toBe(0);
    expect(body.skipped).toBe(0);
  });
});
