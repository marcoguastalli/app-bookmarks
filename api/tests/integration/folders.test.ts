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
  const res = await app.request(path, init);
  return { status: res.status, body: await res.json() };
}

describe("GET /folders/tree", () => {
  it("returns empty tree when no folders", async () => {
    const { status, body } = await req("GET", "/folders/tree");
    expect(status).toBe(200);
    expect(body.data).toEqual([]);
  });

  it("returns nested tree", async () => {
    const { body: f1 } = await req("POST", "/folders", { name: "Parent" });
    await req("POST", "/folders", { name: "Child", parent_id: f1.id });

    const { status, body } = await req("GET", "/folders/tree");
    expect(status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].children).toHaveLength(1);
    expect(body.data[0].children[0].name).toBe("Child");
  });
});

describe("POST /folders", () => {
  it("creates a root folder", async () => {
    const { status, body } = await req("POST", "/folders", { name: "Work" });
    expect(status).toBe(201);
    expect(body.name).toBe("Work");
    expect(body.parent_id).toBeNull();
    expect(body.id).toBeDefined();
  });

  it("creates a nested folder", async () => {
    const { body: parent } = await req("POST", "/folders", { name: "Parent" });
    const { status, body } = await req("POST", "/folders", { name: "Child", parent_id: parent.id });
    expect(status).toBe(201);
    expect(body.parent_id).toBe(parent.id);
  });

  it("rejects missing name", async () => {
    const { status } = await req("POST", "/folders", {});
    expect(status).toBe(400);
  });

  it("rejects non-existent parent_id", async () => {
    const { status } = await req("POST", "/folders", {
      name: "Child",
      parent_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(status).toBe(404);
  });

  it("assigns gap-based positions", async () => {
    const { body: f1 } = await req("POST", "/folders", { name: "First" });
    const { body: f2 } = await req("POST", "/folders", { name: "Second" });
    expect(f1.position).toBe(100);
    expect(f2.position).toBe(200);
  });
});

describe("PUT /folders/:id", () => {
  it("renames a folder", async () => {
    const { body: f } = await req("POST", "/folders", { name: "Old Name" });
    const { status, body } = await req("PUT", `/folders/${f.id}`, { name: "New Name" });
    expect(status).toBe(200);
    expect(body.name).toBe("New Name");
  });

  it("moves a folder under a new parent", async () => {
    const { body: p1 } = await req("POST", "/folders", { name: "Parent 1" });
    const { body: p2 } = await req("POST", "/folders", { name: "Parent 2" });
    const { body: child } = await req("POST", "/folders", { name: "Child", parent_id: p1.id });

    const { status, body } = await req("PUT", `/folders/${child.id}`, { parent_id: p2.id });
    expect(status).toBe(200);
    expect(body.parent_id).toBe(p2.id);
  });

  it("prevents cyclic relationships", async () => {
    const { body: parent } = await req("POST", "/folders", { name: "Parent" });
    const { body: child } = await req("POST", "/folders", { name: "Child", parent_id: parent.id });

    const { status } = await req("PUT", `/folders/${parent.id}`, { parent_id: child.id });
    expect(status).toBe(400);
  });

  it("prevents self-referencing", async () => {
    const { body: f } = await req("POST", "/folders", { name: "Folder" });
    const { status } = await req("PUT", `/folders/${f.id}`, { parent_id: f.id });
    expect(status).toBe(400);
  });

  it("returns 404 for non-existent folder", async () => {
    const { status } = await req("PUT", "/folders/00000000-0000-0000-0000-000000000000", {
      name: "Test",
    });
    expect(status).toBe(404);
  });
});

describe("DELETE /folders/:id", () => {
  it("deletes an empty folder", async () => {
    const { body: f } = await req("POST", "/folders", { name: "Empty" });
    const { status } = await req("DELETE", `/folders/${f.id}`);
    expect(status).toBe(204);
  });

  it("returns 409 when folder has bookmarks and no force", async () => {
    const { body: f } = await req("POST", "/folders", { name: "HasBookmarks" });
    await req("POST", "/bookmarks", { folder_id: f.id, title: "Test", url: "https://test.com" });

    const { status, body } = await req("DELETE", `/folders/${f.id}`);
    expect(status).toBe(409);
    expect(body.error.code).toBe("FOLDER_NOT_EMPTY");
  });

  it("cascade deletes with ?force=true", async () => {
    const { body: f } = await req("POST", "/folders", { name: "HasBookmarks" });
    await req("POST", "/bookmarks", { folder_id: f.id, title: "Test", url: "https://test.com" });

    const { status } = await req("DELETE", `/folders/${f.id}?force=true`);
    expect(status).toBe(204);
  });

  it("returns 404 for non-existent folder", async () => {
    const { status } = await req("DELETE", "/folders/00000000-0000-0000-0000-000000000000");
    expect(status).toBe(404);
  });
});
