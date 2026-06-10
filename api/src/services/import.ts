import { parse } from "node-html-parser";
import type { Sql } from "postgres";
import { normalizeUrl } from "../utils/normalize.js";
import type { ImportResult } from "../db/schema.js";

interface ParsedBookmark {
  type: "bookmark";
  title: string;
  url: string;
}

interface ParsedFolder {
  type: "folder";
  name: string;
  children: ParsedItem[];
}

type ParsedItem = ParsedBookmark | ParsedFolder;

function parseDL(dlNode: any): ParsedItem[] {
  const items: ParsedItem[] = [];
  const children = dlNode.childNodes ?? [];

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.nodeType !== 1) continue;
    const tag = child.tagName?.toUpperCase();

    if (tag === "DT") {
      const h3 = child.querySelector("h3") ?? child.querySelector("H3");
      const a = child.querySelector("a") ?? child.querySelector("A");

      if (h3) {
        const folder: ParsedFolder = {
          type: "folder",
          name: (h3.innerText ?? h3.rawText ?? "Untitled").trim() || "Untitled",
          children: [],
        };
        // Find the next DL sibling
        let j = i + 1;
        while (j < children.length) {
          const sib = children[j];
          if (sib.nodeType === 1) {
            if (sib.tagName?.toUpperCase() === "DL") {
              folder.children = parseDL(sib);
              i = j;
            }
            break;
          }
          j++;
        }
        items.push(folder);
      } else if (a) {
        const href = (a.getAttribute("href") ?? "").trim();
        const title =
          ((a.innerText ?? a.rawText ?? "").trim()) || href || "Untitled";
        if (href) {
          items.push({ type: "bookmark", title, url: href });
        }
      }
    }
  }

  return items;
}

export function parseNetscapeHtml(html: string): ParsedItem[] {
  try {
    const root = parse(html, { lowerCaseTagName: false, comment: false });
    const dl = root.querySelector("DL") ?? root.querySelector("dl");
    if (!dl) return [];
    return parseDL(dl);
  } catch {
    return [];
  }
}

async function getNextPosition(
  sql: Sql,
  table: "folders" | "bookmarks",
  parentCol: string,
  parentId: string
): Promise<number> {
  const rows = await sql.unsafe(
    `SELECT COALESCE(MAX(position), 0) + 100 AS next FROM ${table} WHERE ${parentCol} = $1`,
    [parentId]
  );
  return Number(rows[0]?.next ?? 100);
}

async function importItems(
  sql: Sql,
  items: ParsedItem[],
  targetFolderId: string,
  dryRun: boolean,
  result: ImportResult
): Promise<void> {
  for (const item of items) {
    if (item.type === "bookmark") {
      const normalized = normalizeUrl(item.url);
      try {
        const [existing] = await sql`
          SELECT id FROM bookmarks WHERE normalized_url = ${normalized} AND folder_id = ${targetFolderId}
        `;
        if (existing) {
          result.skipped++;
          result.warnings.push(`Skipped duplicate: ${item.url}`);
          continue;
        }
        if (!dryRun) {
          const pos = await getNextPosition(sql, "bookmarks", "folder_id", targetFolderId);
          await sql`
            INSERT INTO bookmarks (folder_id, title, url, normalized_url, position)
            VALUES (${targetFolderId}, ${item.title}, ${item.url}, ${normalized}, ${pos})
          `;
        }
        result.imported++;
      } catch (err: any) {
        result.skipped++;
        result.warnings.push(`Error importing ${item.url}: ${err.message}`);
      }
    } else if (item.type === "folder") {
      let folderId: string;
      if (dryRun) {
        // In dry run simulate folder existence
        result.imported++;
        await importItems(sql, item.children, targetFolderId, dryRun, result);
        continue;
      }
      const pos = await getNextPosition(sql, "folders", "parent_id", targetFolderId);
      const [created] = await sql`
        INSERT INTO folders (name, parent_id, position)
        VALUES (${item.name}, ${targetFolderId}, ${pos})
        RETURNING id
      `;
      folderId = created.id;
      result.imported++;
      await importItems(sql, item.children, folderId, dryRun, result);
    }
  }
}

export async function importBookmarks(
  html: string,
  targetFolderId: string,
  dryRun: boolean,
  sql: Sql
): Promise<ImportResult> {
  const items = parseNetscapeHtml(html);
  const result: ImportResult = { imported: 0, skipped: 0, warnings: [] };

  if (dryRun) {
    await importItems(sql, items, targetFolderId, true, result);
  } else {
    await sql.begin(async (tx) => {
      await importItems(tx, items, targetFolderId, false, result);
    });
  }

  return result;
}
