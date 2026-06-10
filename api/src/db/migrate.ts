import { readdir, readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { Sql } from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function waitForDb(sql: Sql, retries = 10, delayMs = 2000): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await sql`SELECT 1`;
      return;
    } catch {
      if (i === retries - 1) throw new Error("Database not ready after retries");
      console.log(`Waiting for database... (${i + 1}/${retries})`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

export async function runMigrations(sql: Sql): Promise<void> {
  await waitForDb(sql);

  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id     SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  const migrationsDir = join(__dirname, "migrations");
  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const [existing] =
      await sql`SELECT id FROM schema_migrations WHERE filename = ${file}`;
    if (existing) continue;

    const content = await readFile(join(migrationsDir, file), "utf-8");
    await sql.begin(async (tx) => {
      await tx.unsafe(content);
      await tx`INSERT INTO schema_migrations (filename) VALUES (${file})`;
    });
    console.log(`[migrate] Applied: ${file}`);
  }

  console.log("[migrate] All migrations up to date");
}
