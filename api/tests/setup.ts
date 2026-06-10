import postgres from "postgres";

// DATABASE_URL is loaded from .env.test via bunfig.toml
const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  throw new Error("DATABASE_URL must be set. Copy .env.test.example to .env.test");
}

export const testSql = postgres(DB_URL, { max: 5 });

export async function setupTestDb(): Promise<void> {
  const { runMigrations } = await import("../src/db/migrate.js");
  await runMigrations(testSql);
}

export async function cleanTestDb(): Promise<void> {
  await testSql`TRUNCATE TABLE bookmarks, folders RESTART IDENTITY CASCADE`;
}

export async function teardownTestDb(): Promise<void> {
  await testSql.end();
}
