import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
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
import { adminRouter } from "./routes/admin.js";

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
app.route("/admin", adminRouter);

// OpenAPI spec + Swagger UI
app.doc("/openapi.json", {
  openapi: "3.0.0",
  info: { title: "Bookmarks API", version: "1.0.0", description: "Self-hosted bookmarks manager API" },
  tags: [
    { name: "Folders", description: "Folder management" },
    { name: "Bookmarks", description: "Bookmark management" },
  ],
});
// Served under /api in production, so the spec lives at /api/openapi.json.
app.get("/docs", swaggerUI({ url: "/api/openapi.json" }));

// Global error handler
app.onError(globalErrorHandler);

// 404
app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "Route not found" } }, 404));

// Only start the server when run directly (not when imported by tests)
if (import.meta.main) {
  await runMigrations(sql);

  const publicDir = env.PUBLIC_DIR;

  // Single-image server: the API (mounted under /api, replacing the nginx
  // prefix strip) plus the built frontend served as static files. This
  // subsumes both the standalone nginx reverse proxy and the nginx that
  // used to serve the SPA.
  const server = new Hono();

  // Never cache the SPA shell (replaces the nginx no-cache header on index.html).
  server.use("*", async (c, next) => {
    await next();
    const contentType = c.res.headers.get("content-type") ?? "";
    if (contentType.includes("text/html")) {
      c.header("Cache-Control", "no-cache, no-store, must-revalidate");
    }
  });

  // Container liveness probe (kept at root for the Docker HEALTHCHECK).
  server.get("/health", (c) =>
    c.json({ status: "ok", timestamp: new Date().toISOString() })
  );

  // API under /api. nginx used to strip this prefix via proxy_pass.
  server.route("/api", app);

  // Vite emits content-hashed filenames under /assets — safe to cache forever.
  server.use("/assets/*", async (c, next) => {
    await next();
    if (c.res.ok) {
      c.header("Cache-Control", "public, max-age=31536000, immutable");
    }
  });

  // Static frontend, then SPA fallback to index.html for client-side routes.
  server.use("*", serveStatic({ root: publicDir }));
  server.get("*", serveStatic({ path: `${publicDir}/index.html` }));

  console.log(
    JSON.stringify({
      level: "info",
      message: `Bookmarks app listening on port ${env.PORT}`,
      env: env.NODE_ENV,
      publicDir,
    })
  );

  Bun.serve({ port: env.PORT, fetch: server.fetch });
}
