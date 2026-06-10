import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { setupTestDb, cleanTestDb, teardownTestDb } from "../setup.js";
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

async function req(method: string, path: string, body?: unknown) {
  const init: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body) init.body = JSON.stringify(body);
  return app.request(path, init);
}

async function createFolder(name = "Test", parentId?: string) {
  const res = await req("POST", "/folders", { name, ...(parentId ? { parent_id: parentId } : {}) });
  return (await res.json()) as { id: string };
}

async function createBookmark(folderId: string, title: string, url: string) {
  const res = await req("POST", "/bookmarks", { folder_id: folderId, title, url });
  return (await res.json()) as { id: string };
}

describe("POST /export", () => {
  it("returns a valid Netscape Bookmark HTML file", async () => {
    const folder = await createFolder("Work");
    await createBookmark(folder.id, "GitHub", "https://github.com");
    await createBookmark(folder.id, "Hacker News", "https://news.ycombinator.com");

    const res = await req("POST", "/export", { folder_ids: [folder.id] });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("content-disposition")).toContain("bookmarks.html");

    const html = await res.text();
    expect(html).toContain("<!DOCTYPE NETSCAPE-Bookmark-file-1>");
    expect(html).toContain("https://github.com");
    expect(html).toContain("GitHub");
    expect(html).toContain("Work");
  });

  it("includes nested folders in output", async () => {
    const parent = await createFolder("Parent");
    const child = await createFolder("Child", parent.id);
    await createBookmark(child.id, "Bun", "https://bun.sh");

    const res = await req("POST", "/export", { folder_ids: [parent.id] });
    const html = await res.text();

    expect(html).toContain("Parent");
    expect(html).toContain("Child");
    expect(html).toContain("https://bun.sh");
  });

  it("escapes HTML in titles and URLs", async () => {
    const folder = await createFolder('Folder <script>alert("xss")</script>');
    await createBookmark(folder.id, '<b>Bold</b> & "Quotes"', "https://example.com");

    const res = await req("POST", "/export", { folder_ids: [folder.id] });
    const html = await res.text();

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&amp;");
    expect(html).toContain("&lt;");
  });

  it("returns 400 for empty folder_ids", async () => {
    const res = await req("POST", "/export", { folder_ids: [] });
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-existent folder IDs", async () => {
    const res = await req("POST", "/export", {
      folder_ids: ["00000000-0000-0000-0000-000000000000"],
    });
    expect(res.status).toBe(400);
  });

  it("includes ADD_DATE and LAST_MODIFIED for folders", async () => {
    const folder = await createFolder("Dated Folder");

    const res = await req("POST", "/export", { folder_ids: [folder.id] });
    const html = await res.text();

    expect(html).toMatch(/ADD_DATE="\d+"/);
    expect(html).toMatch(/LAST_MODIFIED="\d+"/);
  });
});
