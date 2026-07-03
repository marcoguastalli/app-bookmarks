# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This App Does

Self-hosted bookmarks manager: organize URLs into nested folders, deduplicate by normalized URL, and export/import as standard `bookmarks.html` (Netscape format, compatible with all browsers).

## Commands

### Running (recommended: Docker)
```bash
docker compose up --build        # all services at http://localhost
docker compose down -v           # stop and remove volumes
```

### Local development (outside Docker)
This branch runs as a **single process**: the API serves the built SPA, so there
is no separate Vite dev server (no HMR). Rebuild the frontend when it changes.
```bash
docker compose up postgres -d               # start only PostgreSQL

cd frontend && bun run build                 # build SPA → frontend/dist
cd ../api && PUBLIC_DIR=../frontend/dist bun run dev   # SPA + API on :3000
# App: http://localhost:3000  (API under /api, Swagger at /api/docs)
```

### API
```bash
cd api
bun install
bun run seed                     # seed DB with sample data
bun test                         # all tests
bun test:unit                    # no DB required
bun test:integration             # requires PostgreSQL
```

### Frontend
```bash
cd frontend
bun install
npm run build                    # production build + tsc check
npm run test:e2e                 # Playwright E2E (Chrome + Firefox)
```

## Architecture

**Single image** (`app-bookmarks`) — one Bun/Hono process serves both the API and
the built SPA. There is **no nginx** (dropped in this branch; see the top-level
`Dockerfile` and `docker-compose.yml`).

```
app-bookmarks (Hono on Bun, :3000)
  /api/*  → API routes (folders, bookmarks, export, import, admin) → PostgreSQL (:5432)
  /health → container liveness probe
  /*      → built React SPA from PUBLIC_DIR, with SPA fallback to index.html
```

The exported `app` in `api/src/index.ts` still mounts routes at the **root**
(`/folders`, …) so integration tests are unchanged; only the production/dev
bootstrap (guarded by `import.meta.main`) wraps it under `/api` and adds static
serving. Immutable caching is applied to `/assets/*` (content-hashed files) and
`no-cache` to the HTML shell — replacing what nginx used to do.

**API** (`api/src/`): Hono framework on Bun runtime. OpenAPI spec auto-generated via `@hono/zod-openapi`; Swagger UI at `/api/docs`. Routes in `routes/`, business logic in `services/`, Zod validation in every handler.

**Frontend** (`frontend/src/`): React 18 SPA with Tailwind CSS and TanStack Query. All API calls go through `api/client.ts` (base URL `/api`). State lives in React Query cache — no global store. Built with Vite; the `dist/` output is copied into the API image at build time and served from `PUBLIC_DIR` (default `./public`).

**Database**: PostgreSQL 17 with two tables (`folders`, `bookmarks`). Migrations run on startup from `api/src/db/migrations/`. Schema types in `api/src/db/schema.ts`.

## Key Design Decisions

**URL normalization** (`api/src/utils/normalize.ts`): lowercases scheme/host, strips default ports, removes tracking params (`utm_*`, `fbclid`, `gclid`), sorts remaining query params. The `normalized_url` column drives the unique constraint `(normalized_url, folder_id)`.

**Folder tree**: Built in-memory from a flat query — no recursive SQL. `GET /folders/tree` returns the full nested structure.

**Folder deletion**: `ON DELETE RESTRICT` by default (blocked if children exist); `DELETE /folders/:id?force=true` cascades. Bookmarks cascade automatically with their folder.

**Position ordering**: Gap-based integers (increments of 100); rebalances when gaps collapse.

**Export streaming**: `services/export.ts` uses an async generator to stream large Netscape HTML exports.

**Favicon fetch**: Non-blocking, fires on bookmark creation, populates `favicon_url`.

**Testing split**: Unit tests (`tests/unit/`) use no DB; integration tests (`tests/integration/`) use a separate `bookmarks_test` DB loaded from `api/.env.test` (via `bunfig.toml`).

## Environment Variables

Copy `api/.env.example` → `api/.env` for local dev. Copy `.env.example` → `.env` for Docker.

Key vars: `DATABASE_URL`, `PORT` (default 3000), `NODE_ENV`, `MAX_FOLDER_DEPTH` (default 10), `LOG_LEVEL`, `PUBLIC_DIR` (built SPA to serve; default `./public`, set to `../frontend/dist` for local dev).

For integration tests, create `api/.env.test` pointing to a separate `bookmarks_test` database.

## Deployment & Images

This branch (`no-nginx`) ships **one** container image instead of the two on
`main`. Built from the repo-root `Dockerfile` (multi-stage: build the frontend,
then copy `dist` into the Bun/Hono runtime as `./public`).

- **This branch** → `ghcr.io/marcoguastalli/app-bookmarks` (single image; SPA + API)
- **`main`** → `ghcr.io/marcoguastalli/app-bookmarks-api` + `…-frontend` (+ nginx)

Publishing is done by CI (`.github/workflows/docker-publish.yml`), which sets up
QEMU + Buildx on the GitHub runner and pushes a multi-arch manifest
(amd64 + arm64). On this branch it triggers on `v*` tags; the first release is the
git tag `v1.0.0-no-nginx` → image tags `1.0.0-no-nginx`, `latest`, `sha-<commit>`.
`release.sh` is a local/manual alternative (needs local Buildx + a `write:packages`
PAT). See the README's "Migration: dropping nginx" section for the full rationale.
