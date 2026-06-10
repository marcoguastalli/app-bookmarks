import { sql } from "./client.js";
import { normalizeUrl } from "../utils/normalize.js";

export async function seed(): Promise<void> {
  console.log("[seed] Seeding development data...");

  await sql`DELETE FROM bookmarks`;
  await sql`DELETE FROM folders`;

  const [work] = await sql`
    INSERT INTO folders (name, position) VALUES ('Work', 100) RETURNING id
  `;
  const [personal] = await sql`
    INSERT INTO folders (name, position) VALUES ('Personal', 200) RETURNING id
  `;
  const [devTools] = await sql`
    INSERT INTO folders (name, parent_id, position) VALUES ('Dev Tools', ${work.id}, 100) RETURNING id
  `;

  const workBookmarks = [
    { folder_id: work.id, title: "GitHub", url: "https://github.com", position: 100 },
    { folder_id: work.id, title: "Linear", url: "https://linear.app", position: 200 },
  ];
  const devBookmarks = [
    { folder_id: devTools.id, title: "Bun", url: "https://bun.sh", position: 100 },
    { folder_id: devTools.id, title: "Hono", url: "https://hono.dev", position: 200 },
    { folder_id: devTools.id, title: "Vite", url: "https://vitejs.dev", position: 300 },
  ];
  const personalBookmarks = [
    { folder_id: personal.id, title: "Hacker News", url: "https://news.ycombinator.com", position: 100 },
    { folder_id: personal.id, title: "MDN Web Docs", url: "https://developer.mozilla.org", position: 200 },
  ];

  for (const b of [...workBookmarks, ...devBookmarks, ...personalBookmarks]) {
    await sql`
      INSERT INTO bookmarks (folder_id, title, url, normalized_url, position)
      VALUES (${b.folder_id}, ${b.title}, ${b.url}, ${normalizeUrl(b.url)}, ${b.position})
    `;
  }

  console.log("[seed] Done");
  await sql.end();
}

await seed();
