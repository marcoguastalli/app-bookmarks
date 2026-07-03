# Bookmarks App — Self-Hosted Docker Setup (single-image / no nginx)

> ⚠️ **This is the `no-nginx` branch — a permanently separate release line.**
> It ships **one** container image (`app-bookmarks`, SPA + API in a single
> Bun/Hono process) and is **not merged into `main`**. `main` keeps the original
> **two-image + nginx** architecture (`app-bookmarks-api` + `app-bookmarks-frontend`
> behind an nginx reverse proxy). The two lines are maintained independently and
> published as distinct GHCR images — see [Tech Stack](#tech-stack) and
> [Migration: dropping nginx](#migration-dropping-nginx-what-changed-on-this-branch).

A self-hosted bookmark manager with a PostgreSQL backend, React frontend, and a
REST API built with Hono. **This branch (`no-nginx`) ships a single container
image** — one Bun/Hono process serves both the SPA and the API. The separate
frontend image and the nginx reverse proxy are gone.

**Key Features:**
- CRUD operations for bookmarks and folders (nested support)
- Global search across all folders (matches title and URL)
- Export to Netscape Bookmark Format (importable in Chrome, Firefox, Safari)
- Import bookmarks from browsers
- Bookmark deduplication
- **Single-image deployment** — SPA + API in one container (no nginx)
- Multi-arch container image (linux/amd64 + linux/arm64)

## Tech Stack

| Layer | Technology | Image |
|-------|-----------|-------|
| **App (SPA + API)** | Hono (TypeScript) + Bun serving the built React SPA | `oven/bun:1.2.5-alpine` |
| **Database** | PostgreSQL 17 | `postgres:17.8-alpine3.23` |
| **Frontend build** | React 18 + TypeScript + Vite | `oven/bun:1.2.5-alpine` (build stage) |
| **Admin UI** | pgAdmin 4 | `dpage/pgadmin4:9.12.0` (dev only) |

There is **no** `nginx` service and **no** standalone frontend image — the Vite
`dist/` bundle is copied into the app image at build time and served by Hono.

## Quick Start

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env, change POSTGRES_PASSWORD at minimum

# 2. Start all services (builds the single app-bookmarks image)
docker compose up --build

# 3. Access the app
# App (SPA):  http://localhost
# API:        http://localhost/api
# Swagger:    http://localhost/api/docs
# pgAdmin:    http://localhost:5050 (dev only)
```

Wait for the health check to pass (~15–30 seconds).

## Running from the Published Image (GHCR)

`docker compose up --build` builds the `app-bookmarks` image locally. To run the
**pre-built image** instead, pull it from GitHub Container Registry. CI publishes
it on `v*` tags — see [`.github/workflows/docker-publish.yml`](.github/workflows/docker-publish.yml):

| Image | Registry path | Visibility |
|-------|---------------|------------|
| **App (this branch)** | `ghcr.io/marcoguastalli/app-bookmarks` | public |
| API (main branch) | `ghcr.io/marcoguastalli/app-bookmarks-api` | public |
| Frontend (main branch) | `ghcr.io/marcoguastalli/app-bookmarks-frontend` | public |

Tags for the single image: `latest`, `1.0.0-no-nginx` (first release), and
`sha-<commit>`. The image is **multi-arch** (linux/amd64 + linux/arm64), so it
pulls natively on both x86 and Apple Silicon — no `--platform` flag needed. Pin a
version in production instead of `latest`:

```bash
docker pull ghcr.io/marcoguastalli/app-bookmarks:1.0.0-no-nginx
```

The packages are **public** — no `docker login` needed to pull.

> **Two services, not four.** Because the SPA and API share one image, the stack
> is just **postgres + app** (pgAdmin is dev-only). The only persistent state is
> the Postgres database in the named `postgres-data` volume.

Save this as `docker-compose.ghcr.yml` and run `docker compose -f docker-compose.ghcr.yml up -d`:

```yaml
services:
  postgres:
    image: postgres:17.8-alpine3.23
    restart: unless-stopped
    volumes:
      - postgres-data:/var/lib/postgresql/data:rw
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-CHANGE_ME}
      POSTGRES_DB: ${POSTGRES_DB:-bookmarks}
    networks: [app-network]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-postgres} -d ${POSTGRES_DB:-bookmarks}"]
      interval: 10s
      timeout: 5s
      retries: 5

  app:
    image: ghcr.io/marcoguastalli/app-bookmarks:1.0.0-no-nginx
    restart: unless-stopped
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD:-CHANGE_ME}@postgres:5432/${POSTGRES_DB:-bookmarks}
      PORT: 3000
      NODE_ENV: ${NODE_ENV:-production}
    ports:
      - "80:3000"
    networks: [app-network]
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  postgres-data:

networks:
  app-network:
    driver: bridge
```

To persist the database on the host instead of a named volume, swap the postgres
`volumes:` entry for a bind-mount, e.g. `- "~/bookmarks-data:/var/lib/postgresql/data:rw"`.

### Plain `docker run` (no Compose) with a fresh host-mounted DB

The `app-bookmarks` image is **not** a self-contained `docker run` — it's the
SPA + API and still needs a PostgreSQL container to talk to. To spin up a fresh
database stored on the host (here `~/temp/new-bookmarks`) plus the app, run the
two containers on a shared network. The app runs its migrations on startup, so an
empty host dir yields a clean schema with no data.

```bash
# 0. Fresh host dir for the DB + a network for the two containers to talk
mkdir -p ~/temp/new-bookmarks
docker network create bookmarks-net

# 1. PostgreSQL — data bind-mounted to ~/temp/new-bookmarks
docker run -d --name bookmarks-db \
  --network bookmarks-net \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=CHANGE_ME \
  -e POSTGRES_DB=bookmarks \
  -e PGDATA=/var/lib/postgresql/data/pgdata \
  -v ~/temp/new-bookmarks:/var/lib/postgresql/data \
  postgres:17.8-alpine3.23

# 2. The app (single image: SPA + API). Migrations run on startup.
docker run -d --name app-bookmarks \
  --network bookmarks-net \
  -e DATABASE_URL=postgresql://postgres:CHANGE_ME@bookmarks-db:5432/bookmarks \
  -e NODE_ENV=production \
  -p 80:3000 \
  ghcr.io/marcoguastalli/app-bookmarks:1.0.0-no-nginx
```

Then open **http://localhost**. The image is public, so no `docker login` needed.

Notes:
- **`PGDATA=…/pgdata` (a subdirectory)** — on macOS/Colima bind mounts, pointing
  `PGDATA` at a subdir of the mount avoids `initdb`/permission quirks that occur
  when Postgres inits directly on the mount root. Data lands in
  `~/temp/new-bookmarks/pgdata/`.
- **Change the password** (`CHANGE_ME`) in both commands — it must match in the DB
  and in `DATABASE_URL`.
- **Port** — using `-p 80:3000`; if 80 is taken use e.g. `-p 8080:3000` →
  http://localhost:8080.
- **Seed data** — none (clean DB). Load the sample data with
  `docker exec -it app-bookmarks bun run seed`.

Verify / logs:

```bash
docker logs -f app-bookmarks     # "listening on port 3000" + "migrations up to date"
curl http://localhost/health
```

Teardown (keeps the DB files on disk):

```bash
docker rm -f app-bookmarks bookmarks-db
docker network rm bookmarks-net
# To start over truly fresh, also: rm -rf ~/temp/new-bookmarks
```

## Publishing Images

**CI is the primary path.** [`.github/workflows/docker-publish.yml`](.github/workflows/docker-publish.yml)
builds and pushes the image on `v*` tags (and manual `workflow_dispatch`). It sets
up QEMU + Buildx **on the GitHub runner** and authenticates with the built-in
`GITHUB_TOKEN` — nothing runs on your machine, and no PAT is needed. To cut a
release:

```bash
git tag -a v1.1.0 -m "…" && git push origin v1.1.0   # → image tags 1.1.0, 1.1, latest
```

The first release on this branch was the git tag `v1.0.0-no-nginx`
(→ `1.0.0-no-nginx`, `latest`, `sha-<commit>`).

**`release.sh` is a local/manual alternative.** It builds from the repo-root
`Dockerfile` and pushes the single `ghcr.io/marcoguastalli/app-bookmarks` image as
a multi-arch manifest. It requires a **local Buildx** plugin and a PAT with
`write:packages`:

```bash
echo <PAT> | docker login ghcr.io -u marcoguastalli --password-stdin
./release.sh              # version from api/package.json
./release.sh 1.2.3        # explicit version
./release.sh --sha        # version = git short SHA
./release.sh --no-push    # build locally only (single-arch --load)
./release.sh --help       # full usage
```

> Note: on a fresh macOS + Colima setup the Homebrew `docker` CLI does **not**
> bundle Buildx. Install it with `brew install docker-buildx` and symlink it into
> `~/.docker/cli-plugins/docker-buildx`. This is only needed for the local
> `release.sh` path — CI does not touch your machine.

## Migration: dropping nginx (what changed on this branch)

Previously the stack was four services — **postgres + api + frontend + nginx** —
producing **two** app images (`app-bookmarks-api`, `app-bookmarks-frontend`) plus
a standalone `nginx` reverse proxy. Two separate things used nginx: the reverse
proxy, and the frontend image (nginx serving the static SPA).

This branch collapses that to **one** image:

- **`api/src/index.ts`** — the production/dev bootstrap wraps the API app under
  `/api` (nginx used to strip that prefix) and serves the built SPA from
  `PUBLIC_DIR` via Hono's `serveStatic`, with a SPA fallback to `index.html`.
  Content-hashed `/assets/*` get `Cache-Control: immutable`; the HTML shell gets
  `no-cache`. The exported `app` still mounts routes at the root, so the
  integration tests are unchanged.
  - **Gotcha handled:** Hono's `compress()` middleware was tried but removed — the
    Bun build in the runtime image doesn't expose `CompressionStream`, so it threw
    a 500 on any request advertising `Accept-Encoding` (i.e. every browser).
- **`Dockerfile`** (repo root) — multi-stage: stage 1 runs the Vite build, stage 2
  is the Bun/Hono runtime with `dist` copied to `./public` (`PUBLIC_DIR`).
- **`docker-compose.yml`** — `nginx` and `frontend` services removed; the `api`
  service builds the root Dockerfile, is named `app-bookmarks`, and publishes on
  `80:3000`.
- **Removed files:** `nginx.conf`, `frontend/Dockerfile`, `frontend/nginx.conf`,
  and the per-service `.dockerignore`s (superseded by a root `.dockerignore`).
- **`.github/workflows/docker-publish.yml`** — dropped the api/frontend matrix;
  builds the single `app-bookmarks` image and triggers on `v*` tags.

Trade-offs: no nginx edge tuning, and no Vite HMR in local dev (the API serves the
pre-built SPA — rebuild the frontend when it changes). In exchange: one image, one
process, a much simpler deployment.

## Environment Variables

Create `.env` from `.env.example`:

```bash
# Required — change in production!
POSTGRES_PASSWORD=your_secure_password

# Optional
NODE_ENV=production                # or development
MAX_FOLDER_DEPTH=10                # nesting limit
LOG_LEVEL=info                     # debug, info, warn, error
PUBLIC_DIR=./public                # built SPA to serve (../frontend/dist for local dev)
PGADMIN_DEFAULT_PASSWORD=your_pass # dev only
```

**Database URL** is auto-constructed: `postgresql://postgres:PASSWORD@postgres:5432/bookmarks`

## Architecture

```
┌─────────────────────────────────────┐
│         User Browser                 │
│      http://localhost:80             │
└─────────────────┬───────────────────┘
                  │
        ┌─────────▼──────────────────┐
        │  app-bookmarks             │
        │  Hono on Bun  (:3000)      │
        │                            │
        │  /api/*  → API routes      │
        │  /health → liveness        │
        │  /*      → React SPA        │
        │            (static + SPA   │
        │             fallback)      │
        └─────────────┬──────────────┘
                      │
              ┌───────▼───────────┐
              │  PostgreSQL:5432  │
              │  (bookmarks DB)   │
              └───────────────────┘
```

**Routing (all handled by Hono in one process):**
- `GET /` → React SPA (served from `PUBLIC_DIR`)
- `GET /api/*` → API routes (folders, bookmarks, export, import, admin)
- `POST /api/import` → bookmark import
- `GET /api/export` → bookmarks.html download
- `GET /health` → container liveness probe

## Dockerfile Details (`Dockerfile`, repo root)

- **Stage 1 (`frontend-build`)**: `oven/bun:1.2.5-alpine` — `bun install` +
  `bun run build` → `/fe/dist`.
- **Stage 2 (`production`)**: `oven/bun:1.2.5-alpine` — production API deps, copies
  `api/src` and `--from=frontend-build /fe/dist` → `./public`. Runs as the
  non-root `bun` user.
- **Entrypoint**: `CMD ["bun", "run", "src/index.ts"]`
- **Port**: 3000 (published as `80:3000` in Compose)
- **Healthcheck**: `GET /health`, 15s interval, 3 retries
- **`PUBLIC_DIR=./public`** set in the image so Hono knows where the SPA lives.

## Health Checks

Startup sequence:

```
1. postgres ready? → pg_isready
2. app ready?      → GET /health
```

Docker Compose waits for `postgres` health before starting `app`.

## Development

This branch runs as a **single process** — the API serves the built SPA, so there
is no Vite dev server (no HMR). Rebuild the frontend when it changes.

```bash
docker compose up postgres -d               # start only PostgreSQL

# Build the SPA, then run the app (serves SPA + API on :3000)
cd frontend && bun run build
cd ../api && PUBLIC_DIR=../frontend/dist bun run dev
# App: http://localhost:3000  (API under /api, Swagger at /api/docs)
```

### API tasks

```bash
cd api
bun run seed          # seed DB with sample data
bun test              # all tests
bun test:unit         # no DB required
bun test:integration  # requires PostgreSQL
```

Database migrations run automatically on startup (see `api/src/db/migrate.ts`).

### Frontend tasks

```bash
cd frontend
bun run build         # production build + tsc check
bun run test:e2e      # Playwright E2E (Chromium + Firefox)
```

## Production Deployment

1. **Pin the image version** — use `ghcr.io/marcoguastalli/app-bookmarks:1.0.0-no-nginx`, not `:latest`
2. **Secrets management** — use `.env.production` (not in repo)
3. **Volume persistence** — the `postgres-data` named volume survives restarts
4. **Network isolation** — services on the `app-network` bridge; only port 80 exposed
5. **Restart policy** — `unless-stopped` (automatic recovery on crash)

### Production Checklist

- [ ] Change `POSTGRES_PASSWORD` in `.env`
- [ ] Set `NODE_ENV=production`
- [ ] Review `MAX_FOLDER_DEPTH` (default 10)
- [ ] Remove pgAdmin from docker-compose (dev only)
- [ ] Test the health check: `docker compose ps` shows `app` healthy
- [ ] Backup database: `docker exec docker-postgres pg_dump -U postgres bookmarks > backup.sql`

## Networking

Services communicate via Docker DNS (automatic):

```
App → Database:  postgresql://postgres:PASSWORD@postgres:5432/bookmarks
```

Service names resolve automatically within `app-network`.

## Logs

```bash
docker compose logs -f            # all services, follow
docker compose logs -f app        # the single app image (SPA + API)
docker compose logs -f postgres
docker compose logs --tail=100 app
```

## Database Backups

```bash
# Backup
docker exec docker-postgres pg_dump -U postgres bookmarks > backup.sql

# Restore
docker exec -i docker-postgres psql -U postgres bookmarks < backup.sql

# Via compose
docker compose exec -T postgres pg_dump -U postgres bookmarks > backup.sql
```

## Cleanup

```bash
docker compose down            # stop services
docker compose down -v         # stop + remove volumes (⚠️ DELETES DATA)
docker compose down -v --rmi all   # also remove images
```

## Troubleshooting

### Services not starting?

```bash
docker compose ps
docker compose logs postgres
docker compose logs app
```

### App can't connect to the database?

```bash
docker compose logs postgres | grep "ready to accept"
docker compose restart app
```

### SPA loads but API calls fail (or "Internal Server Error")?

```bash
# Check the single app image's logs — it serves both SPA and API
docker compose logs app | tail -50
# API is mounted under /api; verify directly:
curl http://localhost/api/folders/tree
```

### Database migrations failed?

```bash
docker compose logs app | grep -i migration
docker compose down && docker compose up
```

## API Endpoints

See Swagger UI: `http://localhost/api/docs`

```bash
# Health check (root, for the container probe)
curl http://localhost/health

# List all folders
curl http://localhost/api/folders

# Get folder tree (nested)
curl http://localhost/api/folders/tree

# Create folder
curl -X POST http://localhost/api/folders \
  -H "Content-Type: application/json" \
  -d '{"name":"Work","parentId":null}'

# Export bookmarks
curl "http://localhost/api/export?folderIds=<uuid>" -o bookmarks.html

# Import bookmarks
curl -X POST http://localhost/api/import \
  -F "file=@bookmarks.html" \
  -F "targetFolderId=<uuid>"
```

## License & Contributing

Open-source. Contributions welcome via pull requests.
