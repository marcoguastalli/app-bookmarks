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
| **App (SPA + API)** | Hono (TypeScript) + Bun serving the built React SPA | `oven/bun:1.3.14-alpine` |
| **Database** | PostgreSQL 18 | `postgres:18.4-alpine3.24` |
| **Frontend build** | React 18 + TypeScript + Vite | `oven/bun:1.3.14-alpine` (build stage) |
| **Admin UI** | pgAdmin 4 | `dpage/pgadmin4:9.16` (dev only) |

There is **no** `nginx` service and **no** standalone frontend image — the Vite
`dist/` bundle is copied into the app image at build time and served by Hono.

## Quick Start

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env, change POSTGRES_PASSWORD at minimum

# 2. Start postgres + app (builds the single app-bookmarks image)
docker compose up --build
#    …or include pgAdmin (dev profile):
docker compose --profile dev up --build

# 3. Access the app
# App (SPA):  http://localhost
# API:        http://localhost/api
# Swagger:    http://localhost/api/docs
# pgAdmin:    http://localhost:5050 (only with --profile dev)
```

Wait for the health check to pass (~15–30 seconds).

## Running from the Published Image (GHCR)

`docker compose up --build` builds the `app-bookmarks` image locally. To run the
**pre-built image** instead, pull it from GitHub Container Registry. CI publishes
every push to `no-nginx` with an **auto-versioned tag** — see [`.github/workflows/docker-publish.yml`](.github/workflows/docker-publish.yml):

| Image | Registry path | Visibility |
|-------|---------------|------------|
| **App (this branch)** | `ghcr.io/marcoguastalli/app-bookmarks` | public |
| API (main branch) | `ghcr.io/marcoguastalli/app-bookmarks-api` | public |
| Frontend (main branch) | `ghcr.io/marcoguastalli/app-bookmarks-frontend` | public |

**Every push to `no-nginx`** gets a semantic version tag (e.g., `1.2.31`, `1.2.32`, …).
Cutting a **git tag** (e.g., `v2.0.0`) creates a named release with `2.0`, `2.0.0`, and `latest`.
The image is **multi-arch** (linux/amd64 + linux/arm64), so it pulls natively on both
x86 and Apple Silicon — no `--platform` flag needed. Pin a specific version in production:

```bash
docker pull ghcr.io/marcoguastalli/app-bookmarks:1.2.31  # from branch push
docker pull ghcr.io/marcoguastalli/app-bookmarks:2.0.0   # from git tag v2.0.0
```

The packages are **public** — no `docker login` needed to pull.

> **Two services, not four.** Because the SPA and API share one image, the stack
> is just **postgres + app** (pgAdmin is dev-only). The only persistent state is
> the Postgres database. The repo's `docker-compose.yml` bind-mounts it to a
> host directory (`POSTGRES_DATA_DIR`, default `~/opt/docker/bookmarks-data/postgres`);
> the snippet below uses a named volume instead for portability.

Save this as `docker-compose.ghcr.yml` and run `docker compose -f docker-compose.ghcr.yml up -d`:

```yaml
services:
  postgres:
    image: postgres:18.4-alpine3.24
    restart: unless-stopped
    volumes:
      - postgres-data:/var/lib/postgresql:rw
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
`volumes:` entry for a bind-mount, e.g. `- "~/opt/docker/bookmarks-data:/var/lib/postgresql:rw"`.

### Plain `docker run` (no Compose) with a fresh host-mounted DB

> **Shortcut:** [`docker-control.sh`](docker-control.sh) does everything below for you —
> `./docker-control.sh` (add `--seed` for sample data, `--fresh` to wipe first,
> `--down` to tear down). Override defaults via env vars, e.g.
> `DATA_DIR=~/temp/mybm PORT=8080 ./docker-control.sh`.

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
  -v ~/temp/new-bookmarks:/var/lib/postgresql \
  postgres:18.4-alpine3.24

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
- **Mount at `/var/lib/postgresql` (not `…/data`)** — the Postgres 18 image moved
  its volume to `/var/lib/postgresql` and defaults `PGDATA` to the version-scoped
  subdir `/var/lib/postgresql/18/docker`. Since the data dir is a subdir of the
  mount root, this also avoids the macOS/Colima `initdb`/permission quirks that
  previously required a manual `PGDATA=…/pgdata`. Data lands in
  `~/temp/new-bookmarks/18/docker/`.
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

**CI publishes on every push to `no-nginx`** (the default branch). Every commit
automatically gets a **semantic version tag** (e.g., `1.2.31`, `1.2.32`, …). The workflow
(`.github/workflows/docker-publish.yml`) sets up QEMU + Buildx **on the GitHub runner**
and authenticates with the built-in `GITHUB_TOKEN` — nothing runs on your machine, and
no PAT is needed.

### Versioning: Branch Pushes (Auto-versioned)

The `VERSION` file contains `MAJOR.MINOR` (e.g., `1.2`). The workflow computes
`PATCH = commit count`, so each push gets the next version:

```bash
# Every push to no-nginx auto-tags: 1.2.31, 1.2.32, 1.2.33, …
docker pull ghcr.io/marcoguastalli/app-bookmarks:1.2.31
docker pull ghcr.io/marcoguastalli/app-bookmarks:1.2.32  # next push
```

To bump `MAJOR.MINOR`, edit `VERSION` (e.g., `2.0`); the next push will tag `2.0.X`.

### Versioning: Git Tags (Named Releases)

Push a semver git tag to create a **named release** with `latest`:

```bash
git tag -a v2.0.0 -m "Release 2.0.0" && git push origin v2.0.0
# → image tags: 2.0.0, 2.0, latest, sha-<commit>

docker pull ghcr.io/marcoguastalli/app-bookmarks:2.0.0
docker pull ghcr.io/marcoguastalli/app-bookmarks:latest
```

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

- **Stage 1 (`frontend-build`)**: `oven/bun:1.3.14-alpine` — `bun install` +
  `bun run build` → `/fe/dist`.
- **Stage 2 (`production`)**: `oven/bun:1.3.14-alpine` — production API deps, copies
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

1. **Pin the image version** — every push to `no-nginx` auto-versions (e.g., `1.2.31`); use a specific version like `ghcr.io/marcoguastalli/app-bookmarks:1.2.31`, never `:latest` or `:no-nginx` in production
2. **Secrets management** — use `.env.production` (not in repo)
3. **Volume persistence** — DB and pgAdmin data are **host bind mounts**
   (`POSTGRES_DATA_DIR` / `PGADMIN_DATA_DIR`, default `~/opt/docker/bookmarks-data/*`).
   They survive `docker compose down -v` and even a Docker/Colima VM rebuild,
   and can be backed up with normal file tools (Time Machine, rsync)
4. **Network isolation** — services on the `app-network` bridge; only port 80 exposed externally (postgres is bound to `127.0.0.1` for local tooling)
5. **Restart policy** — `unless-stopped` (automatic recovery on crash)

### Production Checklist

- [ ] Change `POSTGRES_PASSWORD` in `.env`
- [ ] Set `NODE_ENV=production`
- [ ] Review `MAX_FOLDER_DEPTH` (default 10)
- [x] pgAdmin is behind the `dev` Compose profile — a plain `docker compose up` never starts it
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

These are manual — scheduled/rotated backups are still an open item, see
[Future Improvements](#future-improvements).

## Cleanup

```bash
docker compose down            # stop services
docker compose down --rmi all  # also remove images
```

DB and pgAdmin data live in **host directories** (`~/opt/docker/bookmarks-data/*` by
default), so even `down -v` does **not** delete them. To start truly fresh:
`rm -rf ~/opt/docker/bookmarks-data` (⚠️ DELETES DATA).

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

## Future Improvements

Known gaps, in rough priority order — not blocking, but worth doing:

- [ ] **Automate dependency/image bumps** — add [Renovate](https://docs.renovatebot.com/)
  (or Dependabot with the `docker` ecosystem) to watch the image tags pinned in
  `Dockerfile`, `docker-compose.yml`, `docker-control.sh`, and the README
  (`postgres`, `dpage/pgadmin4`, `oven/bun`). The 2026-07 upgrade round
  (Postgres 17→18, pgAdmin 9.12→9.16, Bun 1.2.5→1.3.14) was done manually and
  the images had drifted for months; a bot would have raised each bump as a PR.
  Remember postgres **major** bumps need a dump/restore (see note below).
- [ ] **Scheduled database backups** — the [Database Backups](#database-backups)
  commands are manual. Add a cron/launchd job or a small sidecar container that
  runs `pg_dump` on a schedule and rotates old dumps (e.g. keep 7 daily + 4
  weekly). The Netscape HTML export (`GET /api/export`) is a useful secondary,
  browser-importable backup of the bookmarks themselves.
- [ ] **Postgres major-version upgrades need a migration** — data files are not
  compatible across major versions: a volume initialized by PG *N* will not
  start under PG *N+1*. Procedure: `pg_dump` on the old version → wipe/replace
  the volume → restore on the new version (or use `pg_upgrade`). Since PG 18
  the official image mounts `/var/lib/postgresql` with a version-scoped data
  dir (`18/docker`), which makes future side-by-side `pg_upgrade` runs easier.
- [ ] **Adopt PG 18 niceties when useful** — e.g. `uuidv7()` for time-ordered
  primary keys on new tables. Nothing in the current schema requires action.

## License & Contributing

Open-source. Contributions welcome via pull requests.
