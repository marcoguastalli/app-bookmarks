import type { Sql } from "postgres";
import type { Folder, FolderTree, Bookmark } from "../db/schema.js";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function toUnixSeconds(d: Date): number {
  return Math.floor(d.getTime() / 1000);
}

function buildTree(folders: Folder[]): FolderTree[] {
  const map = new Map<string, FolderTree>();
  for (const f of folders) {
    map.set(f.id, { ...f, children: [] });
  }
  const roots: FolderTree[] = [];
  for (const f of folders) {
    const node = map.get(f.id)!;
    if (f.parent_id) {
      const parent = map.get(f.parent_id);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }
  return roots;
}

async function* writeFolder(
  folder: FolderTree,
  bookmarksByFolder: Map<string, Bookmark[]>,
  depth: number
): AsyncGenerator<string> {
  const indent = "    ".repeat(depth);
  const addDate = toUnixSeconds(folder.created_at);
  const lastMod = toUnixSeconds(folder.updated_at);

  yield `${indent}<DT><H3 ADD_DATE="${addDate}" LAST_MODIFIED="${lastMod}">${escapeHtml(folder.name)}</H3>\n`;
  yield `${indent}<DL><p>\n`;

  const items = bookmarksByFolder.get(folder.id) ?? [];
  for (const b of items) {
    const bDate = toUnixSeconds(b.created_at);
    yield `${indent}    <DT><A HREF="${escapeHtml(b.url)}" ADD_DATE="${bDate}">${escapeHtml(b.title)}</A>\n`;
  }

  for (const child of folder.children) {
    yield* writeFolder(child, bookmarksByFolder, depth + 1);
  }

  yield `${indent}</DL><p>\n`;
}

export async function* generateBookmarksHtml(
  folderIds: string[],
  sql: Sql
): AsyncGenerator<string> {
  // Collect all relevant folder IDs (including descendants)
  const allFolders: Folder[] = await sql`SELECT * FROM folders ORDER BY position, created_at`;
  const allBookmarks: Bookmark[] = await sql`SELECT * FROM bookmarks ORDER BY folder_id, position, created_at`;

  // Build full tree to resolve descendants
  const fullTree = buildTree(allFolders);
  const folderIdSet = new Set(folderIds);

  function collectIds(node: FolderTree): void {
    folderIdSet.add(node.id);
    for (const child of node.children) collectIds(child);
  }

  function filterTree(nodes: FolderTree[]): FolderTree[] {
    const result: FolderTree[] = [];
    for (const node of nodes) {
      if (folderIds.includes(node.id)) {
        collectIds(node);
        result.push(node);
      } else {
        const filteredChildren = filterTree(node.children);
        if (filteredChildren.length > 0) {
          result.push({ ...node, children: filteredChildren });
        }
      }
    }
    return result;
  }

  const selectedTree = filterTree(fullTree);

  const bookmarksByFolder = new Map<string, Bookmark[]>();
  for (const b of allBookmarks) {
    if (!folderIdSet.has(b.folder_id)) continue;
    const arr = bookmarksByFolder.get(b.folder_id) ?? [];
    arr.push(b);
    bookmarksByFolder.set(b.folder_id, arr);
  }

  yield `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n`;
  yield `<!-- This is an automatically generated file.\n`;
  yield `     It will be read and overwritten.\n`;
  yield `     DO NOT EDIT! -->\n`;
  yield `<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n`;
  yield `<TITLE>Bookmarks</TITLE>\n`;
  yield `<H1>Bookmarks</H1>\n`;
  yield `<DL><p>\n`;

  for (const folder of selectedTree) {
    yield* writeFolder(folder, bookmarksByFolder, 1);
  }

  yield `</DL><p>\n`;
}
