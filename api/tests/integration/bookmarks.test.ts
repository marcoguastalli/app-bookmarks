import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { setupTestDb, cleanTestDb, teardownTestDb } from "../setup.js";
import app from "../../src/index.js";

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
  const res = await app.request(path, init);
  return { status: res.status, body: await res.json() };
}

async function createFolder(name = "Test Folder") {
  const { body } = await req("POST", "/folders", { name });
  return body as { id: string; name: string };
}

describe("POST /bookmarks", () => {
  it("creates a bookmark", async () => {
    const folder = await createFolder();
    const { status, body } = await req("POST", "/bookmarks", {
      folder_id: folder.id,
      title: "GitHub",
      url: "https://github.com",
    });
    expect(status).toBe(201);
    expect(body.title).toBe("GitHub");
    expect(body.normalized_url).toBe("https://github.com");
  });

  it("normalizes URL on creation", async () => {
    const folder = await createFolder();
    const { body } = await req("POST", "/bookmarks", {
      folder_id: folder.id,
      title: "Test",
      url: "https://EXAMPLE.COM/path/?utm_source=google",
    });
    expect(body.normalized_url).toBe("https://example.com/path");
  });

  it("prevents duplicate normalized URLs in same folder", async () => {
    const folder = await createFolder();
    await req("POST", "/bookmarks", {
      folder_id: folder.id,
      title: "Test",
      url: "https://example.com",
    });
    const { status } = await req("POST", "/bookmarks", {
      folder_id: folder.id,
      title: "Duplicate",
      url: "https://example.com?utm_source=x",
    });
    expect(status).toBe(409);
  });

  it("allows same URL in different folders", async () => {
    const f1 = await createFolder("Folder 1");
    const f2 = await createFolder("Folder 2");
    const url = "https://example.com";

    const { status: s1 } = await req("POST", "/bookmarks", { folder_id: f1.id, title: "T", url });
    const { status: s2 } = await req("POST", "/bookmarks", { folder_id: f2.id, title: "T", url });

    expect(s1).toBe(201);
    expect(s2).toBe(201);
  });

  it("returns 404 for non-existent folder", async () => {
    const { status } = await req("POST", "/bookmarks", {
      folder_id: "00000000-0000-0000-0000-000000000000",
      title: "Test",
      url: "https://example.com",
    });
    expect(status).toBe(404);
  });

  it("assigns gap-based position", async () => {
    const folder = await createFolder();
    const { body: b1 } = await req("POST", "/bookmarks", { folder_id: folder.id, title: "B1", url: "https://b1.com" });
    const { body: b2 } = await req("POST", "/bookmarks", { folder_id: folder.id, title: "B2", url: "https://b2.com" });
    expect(b1.position).toBe(100);
    expect(b2.position).toBe(200);
  });
});

describe("GET /bookmarks", () => {
  it("returns bookmarks filtered by folder_id", async () => {
    const f1 = await createFolder("F1");
    const f2 = await createFolder("F2");
    await req("POST", "/bookmarks", { folder_id: f1.id, title: "B1", url: "https://b1.com" });
    await req("POST", "/bookmarks", { folder_id: f2.id, title: "B2", url: "https://b2.com" });

    const { status, body } = await req("GET", `/bookmarks?folder_id=${f1.id}`);
    expect(status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].title).toBe("B1");
    expect(body.total).toBe(1);
  });

  it("paginates results", async () => {
    const folder = await createFolder();
    for (let i = 1; i <= 5; i++) {
      await req("POST", "/bookmarks", { folder_id: folder.id, title: `B${i}`, url: `https://b${i}.com` });
    }
    const { body } = await req("GET", `/bookmarks?folder_id=${folder.id}&limit=2&offset=0`);
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(5);
  });

  it("searches by title", async () => {
    const folder = await createFolder();
    await req("POST", "/bookmarks", { folder_id: folder.id, title: "GitHub", url: "https://github.com" });
    await req("POST", "/bookmarks", { folder_id: folder.id, title: "Google", url: "https://google.com" });

    const { body } = await req("GET", `/bookmarks?folder_id=${folder.id}&q=GitHub`);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].title).toBe("GitHub");
  });
});

describe("PUT /bookmarks/:id", () => {
  it("updates title and description", async () => {
    const folder = await createFolder();
    const { body: b } = await req("POST", "/bookmarks", { folder_id: folder.id, title: "Old", url: "https://example.com" });

    const { status, body } = await req("PUT", `/bookmarks/${b.id}`, {
      title: "New",
      description: "A description",
    });
    expect(status).toBe(200);
    expect(body.title).toBe("New");
    expect(body.description).toBe("A description");
  });

  it("moves bookmark to another folder", async () => {
    const f1 = await createFolder("F1");
    const f2 = await createFolder("F2");
    const { body: b } = await req("POST", "/bookmarks", { folder_id: f1.id, title: "B", url: "https://example.com" });

    const { status, body } = await req("PUT", `/bookmarks/${b.id}`, { folder_id: f2.id });
    expect(status).toBe(200);
    expect(body.folder_id).toBe(f2.id);
  });

  it("returns 404 for non-existent bookmark", async () => {
    const { status } = await req("PUT", "/bookmarks/00000000-0000-0000-0000-000000000000", {
      title: "Test",
    });
    expect(status).toBe(404);
  });
});

describe("DELETE /bookmarks/:id", () => {
  it("deletes a bookmark", async () => {
    const folder = await createFolder();
    const { body: b } = await req("POST", "/bookmarks", { folder_id: folder.id, title: "T", url: "https://example.com" });

    const { status } = await req("DELETE", `/bookmarks/${b.id}`);
    expect(status).toBe(204);

    const { body } = await req("GET", `/bookmarks?folder_id=${folder.id}`);
    expect(body.data).toHaveLength(0);
  });

  it("returns 404 for non-existent bookmark", async () => {
    const { status } = await req("DELETE", "/bookmarks/00000000-0000-0000-0000-000000000000");
    expect(status).toBe(404);
  });
});

describe("POST /bookmarks/deduplicate", () => {
  it("dry run returns count without deleting", async () => {
    const folder = await createFolder();
    await req("POST", "/bookmarks", { folder_id: folder.id, title: "B1", url: "https://example.com" });

    const { status, body } = await req("POST", "/bookmarks/deduplicate", { dry_run: true });
    expect(status).toBe(200);
    expect(typeof body.removed).toBe("number");
    expect(Array.isArray(body.duplicates)).toBe(true);
  });
});
