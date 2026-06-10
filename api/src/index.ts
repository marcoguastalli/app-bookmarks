import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { env } from "./env.js";
import { sql } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { globalErrorHandler } from "./middleware/error.js";
import { foldersRouter } from "./routes/folders.js";
import { bookmarksRouter } from "./routes/bookmarks.js";
import { exportRouter } from "./routes/export.js";
import { importRouter } from "./routes/import.js";

export const app = new OpenAPIHono();

// Middleware
app.use("*", cors());
app.use("*", logger());

// Health check
app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

// Routes
app.route("/folders", foldersRouter);
app.route("/bookmarks", bookmarksRouter);
app.route("/export", exportRouter);
app.route("/import", importRouter);

// OpenAPI spec + Swagger UI
app.doc("/openapi.json", {
  openapi: "3.0.0",
  info: { title: "Bookmarks API", version: "1.0.0", description: "Self-hosted bookmarks manager API" },
  tags: [
    { name: "Folders", description: "Folder management" },
    { name: "Bookmarks", description: "Bookmark management" },
  ],
});
app.get("/docs", swaggerUI({ url: "/openapi.json" }));

// Global error handler
app.onError(globalErrorHandler);

// 404
app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "Route not found" } }, 404));

// Only start the server when run directly (not when imported by tests)
if (import.meta.main) {
  await runMigrations(sql);

  console.log(
    JSON.stringify({
      level: "info",
      message: `Bookmarks API listening on port ${env.PORT}`,
      env: env.NODE_ENV,
    })
  );

  Bun.serve({ port: env.PORT, fetch: app.fetch });
}
