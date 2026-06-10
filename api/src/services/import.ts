import type { Sql } from "postgres";
import { normalizeUrl } from "../utils/normalize.js";
import type { ImportResult, ImportLog } from "../db/schema.js";

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

type Token =
  | { type: "open" }
  | { type: "close" }
  | { type: "folder"; name: string }
  | { type: "bookmark"; url: string; title: string };

function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  for (const raw of html.split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    if (/^<DL/i.test(line)) {
      tokens.push({ type: "open" });
    } else if (/^<\/DL/i.test(line)) {
      tokens.push({ type: "close" });
    } else if (/^<DT><H3/i.test(line)) {
      const m = line.match(/<H3[^>]*>([^<]*)<\/H3>/i);
      tokens.push({ type: "folder", name: (m?.[1] ?? "Untitled").trim() || "Untitled" });
    } else if (/^<DT><A\s/i.test(line)) {
      const href = line.match(/HREF="([^"]*)"/i)?.[1] ?? "";
      const title = line.match(/<A[^>]*>([^<]*)<\/A>/i)?.[1]?.trim() ?? "";
      if (href) tokens.push({ type: "bookmark", url: href, title: title || href });
    }
  }
  return tokens;
}

function buildTree(tokens: Token[], pos: number): { items: ParsedItem[]; pos: number } {
  const items: ParsedItem[] = [];
  while (pos < tokens.length) {
    const tok = tokens[pos];
    if (tok.type === "close") return { items, pos: pos + 1 };
    pos++;
    if (tok.type === "bookmark") {
      items.push({ type: "bookmark", url: tok.url, title: tok.title });
    } else if (tok.type === "folder") {
      if (pos < tokens.length && tokens[pos].type === "open") {
        const sub = buildTree(tokens, pos + 1);
        items.push({ type: "folder", name: tok.name, children: sub.items });
        pos = sub.pos;
      } else {
        items.push({ type: "folder", name: tok.name, children: [] });
      }
    }
  }
  return { items, pos };
}

export function parseNetscapeHtml(html: string): ParsedItem[] {
  try {
    const tokens = tokenize(html);
    // skip the root <DL> open token
    const start = tokens[0]?.type === "open" ? 1 : 0;
    return buildTree(tokens, start).items;
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
      if (!item.url) {
        const msg = `Missing URL`;
        result.skipped++;
        result.warnings.push(`Skipped "${item.title}": ${msg}`);
        result.logs.push({ action: "skipped", title: item.title, url: "", reason: msg });
        continue;
      }
      const normalized = normalizeUrl(item.url);
      try {
        const [existing] = await sql`
          SELECT id FROM bookmarks WHERE normalized_url = ${normalized} AND folder_id = ${targetFolderId}
        `;
        if (existing) {
          const msg = "Duplicate URL in this folder";
          result.skipped++;
          result.warnings.push(`Skipped duplicate: ${item.url}`);
          result.logs.push({ action: "skipped", title: item.title, url: item.url, reason: msg });
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
        result.logs.push({ action: "imported", title: item.title, url: item.url });
      } catch (err: any) {
        const msg = err.message;
        result.skipped++;
        result.warnings.push(`Error importing ${item.url}: ${msg}`);
        result.logs.push({ action: "skipped", title: item.title, url: item.url, reason: `Error: ${msg}` });
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
  const result: ImportResult = { imported: 0, skipped: 0, warnings: [], logs: [] };

  if (dryRun) {
    await importItems(sql, items, targetFolderId, true, result);
  } else {
    await sql.begin(async (tx) => {
      await importItems(tx, items, targetFolderId, false, result);
    });
  }

  return result;
}
