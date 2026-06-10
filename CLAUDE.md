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
```bash
docker compose up postgres -d    # start only PostgreSQL

cd api && bun run dev            # API on :3000 (hot reload)
cd frontend && bun run dev       # frontend on :5173 (proxies /api → :3000)
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

```
nginx (:80) → /api/* → api (Hono, Bun, :3000) → PostgreSQL (:5432)
            → /*     → frontend (React, Vite, :5173 / nginx in Docker)
```

**API** (`api/src/`): Hono framework on Bun runtime. OpenAPI spec auto-generated via `@hono/zod-openapi`; Swagger UI at `/api/docs`. Routes in `routes/`, business logic in `services/`, Zod validation in every handler.

**Frontend** (`frontend/src/`): React 18 SPA with Tailwind CSS and TanStack Query. All API calls go through `api/client.ts`. State lives in React Query cache — no global store.

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

Key vars: `DATABASE_URL`, `PORT` (default 3000), `NODE_ENV`, `MAX_FOLDER_DEPTH` (default 10), `LOG_LEVEL`.

For integration tests, create `api/.env.test` pointing to a separate `bookmarks_test` database.
