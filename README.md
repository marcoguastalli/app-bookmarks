# Bookmarks App — Self-Hosted Docker Setup

A self-hosted bookmark manager with PostgreSQL backend, React frontend, and REST API built with Hono.

**Key Features:**
- CRUD operations for bookmarks and folders (nested support)
- Export to Netscape Bookmark Format (importable in Chrome, Firefox, Safari)
- Import bookmarks from browsers
- Bookmark deduplication
- Full Docker orchestration

## Tech Stack

| Layer | Technology | Image |
|-------|-----------|-------|
| **API** | Hono (TypeScript) + Bun | `oven/bun:1.2.5-alpine` |
| **Database** | PostgreSQL 17 | `postgres:17.8-alpine3.23` |
| **Frontend** | React 18 + TypeScript + Vite | `oven/bun:1.2.5-alpine` (build) → `nginx:1.26.3-alpine` (runtime) |
| **Reverse Proxy** | Nginx | `nginx:1.26.3-alpine` |
| **Admin UI** | pgAdmin 4 | `dpage/pgadmin4:9.12.0` (dev only) |

## Quick Start

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env, change POSTGRES_PASSWORD at minimum

# 2. Start all services
docker-compose up

# 3. Access the app
# Frontend:  http://localhost
# API:       http://localhost/api
# pgAdmin:   http://localhost:5050 (dev only)
```

Wait for health checks to pass (~15–30 seconds). Frontend loads once API is ready.

## Running from Published Images (GHCR)

`docker-compose up --build` builds the `api` and `frontend` images locally. To run
**pre-built images** instead, pull them from GitHub Container Registry. CI publishes
two images on every push to `main` (and on `v*` tags) — see
[`.github/workflows/docker-publish.yml`](.github/workflows/docker-publish.yml):

| Image | Registry path |
|-------|---------------|
| **API** | `ghcr.io/marcoguastalli/app-bookmarks-api` |
| **Frontend** | `ghcr.io/marcoguastalli/app-bookmarks-frontend` |

Tags: `latest` (default branch), `main`, `sha-<commit>`, and `1.2.3` / `1.2` for `v*` tags.

> **Not a single-container app.** Unlike the Carousel project (one self-contained
> nginx image you can `docker run` directly), this app is a 4-service stack —
> postgres + api + frontend + nginx — that must share a network. So there is no
> single `docker run` equivalent; use Compose. Likewise there is no host
> image-volume to mount: the only persistent state is the Postgres database, which
> lives in the named `postgres-data` volume.

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

  api:
    image: ghcr.io/marcoguastalli/app-bookmarks-api:latest
    restart: unless-stopped
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD:-CHANGE_ME}@postgres:5432/${POSTGRES_DB:-bookmarks}
      PORT: 3000
      NODE_ENV: ${NODE_ENV:-production}
    networks: [app-network]
    depends_on:
      postgres:
        condition: service_healthy

  frontend:
    image: ghcr.io/marcoguastalli/app-bookmarks-frontend:latest
    restart: unless-stopped
    networks: [app-network]

  nginx:
    image: nginx:1.26.3-alpine
    restart: unless-stopped
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    networks: [app-network]
    depends_on:
      - api
      - frontend

volumes:
  postgres-data:

networks:
  app-network:
    driver: bridge
```

If the packages are **private**, authenticate first:
`echo <token> | docker login ghcr.io -u marcoguastalli --password-stdin`.

To persist the database on the host instead of a named volume, swap the postgres
`volumes:` entry for a bind-mount, e.g. `- "~/bookmarks-data:/var/lib/postgresql/data:rw"`.

## Publishing Images (`release.sh`)

CI publishes on every push to `main` and on `v*` tags. To **publish a versioned
release manually** — e.g. cut a build from your machine without pushing a tag —
use [`release.sh`](release.sh) at the repo root. It builds the `api` and
`frontend` images, tags each with a **version + `latest`**, and pushes a
**multi-arch manifest (amd64 + arm64)** so the images pull on both Apple Silicon
and x86 hosts.

```bash
# 1. Log in — pushing needs a PAT with `write:packages`
echo <PAT> | docker login ghcr.io -u marcoguastalli --password-stdin

# 2. Release
./release.sh              # version each image from its own package.json (default)
./release.sh 1.2.3        # force version 1.2.3 for both images
./release.sh --sha        # version = git short SHA (immutable, traceable)
./release.sh --tag        # version = `git describe --tags`
./release.sh api 1.2.3    # only the api image, at 1.2.3
./release.sh --no-push    # build locally only (single-arch, loads into docker)
./release.sh --no-latest  # push the version tag only, leave `latest` untouched
./release.sh --help       # full usage
```

**Cutting a version:** bump `version` in `api/package.json` and/or
`frontend/package.json`, then run `./release.sh` (versions are read per-component
from each `package.json`). Or skip the edit and pass an explicit version, e.g.
`./release.sh 1.3.0`.

Notes:
- The first `--push` run creates a one-time `docker-container` buildx builder
  named `bookmarks-builder` (required for multi-arch). It's reused afterwards.
- `--no-push` produces a **single-arch** local image (your host's arch) — buildx
  cannot `--load` a multi-arch manifest into the local daemon. Fine for local
  testing; use the default push for releases.
- Your `gh` CLI token (`repo`, `read:org`) is **not** enough to push — mint a
  classic PAT with `write:packages` for `docker login`.

## Environment Variables

Create `.env` from `.env.example`:

```bash
# Required — change in production!
POSTGRES_PASSWORD=your_secure_password

# Optional
NODE_ENV=production                # or development
MAX_FOLDER_DEPTH=10                # nesting limit
LOG_LEVEL=info                     # debug, info, warn, error
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
         ┌────────▼────────┐
         │  nginx:80       │
         │  reverse proxy  │
         └────┬────────┬───┘
              │        │
       ┌──────▼──┐  ┌──▼────────────┐
       │ API     │  │ Frontend      │
       │ :3000   │  │ (React SPA)   │
       └──────┬──┘  └────────────────┘
              │
         ┌────▼──────────────┐
         │   PostgreSQL:5432 │
         │   (bookmarks DB)  │
         └───────────────────┘
```

**Routing:**
- `GET /` → frontend (React SPA, served by nginx)
- `GET /api/*` → API (Hono, running on port 3000)
- `POST /api/import` → bookmark import
- `GET /api/export` → bookmarks.html download

## Dockerfile Details

### API (`api/Dockerfile`)

- **Single stage**: Bun includes build tools at runtime; not a bloat concern for small API
- **Production deps only**: `bun install --production`
- **Entrypoint**: `CMD ["bun", "run", "src/index.ts"]`
- **Port**: 3000
- **Healthcheck**: `GET /health` with 15s interval, 3 retries

### Frontend (`frontend/Dockerfile`)

- **Stage 1 (build)**: Bun + TypeScript compiler + Vite
  - Compiles React + Vite bundle → `/app/dist`
- **Stage 2 (runtime)**: `nginx:1.26.3-alpine`
  - Serves static `/dist` with SPA fallback (`try_files → index.html`)
  - Asset caching: 1-year expiry for versioned files (`.js`, `.css`)
  - Port: 80

### Reverse Proxy (`docker-compose.yml`, nginx service)

- Terminates HTTP on port 80
- Strips `/api` prefix: `/api/health` → `http://api:3000/health`
- Proxies everything else to frontend
- Handles CORS headers (configured in nginx.conf)

## Health Checks

All services implement liveness probes. Startup sequence:

```
1. postgres ready? → pg_isready
2. api ready? → GET /health
3. frontend ready? → HTTP 200
4. nginx ready? → GET /health
```

Retries: 3–5, interval: 10–15s. Docker Compose waits for `postgres` and `api` health before starting dependent services.

## Development

### API Development

```bash
cd api

# Watch mode (hot reload)
bun run dev

# Tests
bun test              # all tests
bun test:unit         # unit tests only
bun test:integration  # integration tests

# Seed database (dev data)
bun run seed
```

Database migrations run automatically on startup (see `api/src/db/migrate.ts`).

### Frontend Development

```bash
cd frontend

# Dev server (hot reload, :5173)
bun run dev

# Production build
bun run build

# Preview production build
bun run preview

# E2E tests (Playwright)
bun run test:e2e
```

## Production Deployment

1. **Pin image versions** ✓ (all tags explicit, no `:latest`)
2. **Secrets management** — use `.env.production` (not in repo)
   ```bash
   # Never commit production secrets
   git add .env.example
   git add .env.production.local && echo ".env.production.local" >> .gitignore
   ```
3. **Volume persistence** — named volumes survive container restarts
   - `postgres-data` — database files
   - `pgadmin-data` — pgAdmin config (remove for production)
4. **Network isolation** — all services on `app-network` bridge; no exposed ports except 80
5. **Restart policy** — `unless-stopped` (automatic recovery on crash)

### Production Checklist

- [ ] Change `POSTGRES_PASSWORD` in `.env`
- [ ] Set `NODE_ENV=production`
- [ ] Review `MAX_FOLDER_DEPTH` (default 10, adjust as needed)
- [ ] Remove pgAdmin from docker-compose (dev only)
- [ ] Use Docker secrets or external `.env.production` file
- [ ] Test health checks: `docker-compose ps` shows all healthy
- [ ] Backup database: `docker exec docker-postgres pg_dump -U postgres bookmarks > backup.sql`

## Networking

Services communicate via Docker DNS (automatic):

```
API → Database:  postgresql://postgres:PASSWORD@postgres:5432/bookmarks
Nginx → API:     http://api:3000
Nginx → Frontend: http://frontend:80
```

No manual IP configuration needed. Service names resolve automatically within the `app-network`.

## Logs

View logs from all services:

```bash
# All services, follow
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f postgres
docker-compose logs -f frontend
docker-compose logs -f nginx

# Last 100 lines
docker-compose logs --tail=100 api
```

## Database Backups

### Backup

```bash
docker exec docker-postgres pg_dump -U postgres bookmarks > backup.sql
```

### Restore

```bash
docker exec -i docker-postgres psql -U postgres bookmarks < backup.sql
```

### Backup with docker-compose

```bash
docker-compose exec -T postgres pg_dump -U postgres bookmarks > backup.sql
```

## Cleanup

### Stop All Services

```bash
docker-compose down
```

### Stop + Remove Volumes (⚠️ DELETES DATA)

```bash
docker-compose down -v
```

### Remove Everything (containers, volumes, images)

```bash
docker-compose down -v --rmi all
```

## Troubleshooting

### Services Not Starting?

```bash
# Check status
docker-compose ps

# Check logs
docker-compose logs postgres
docker-compose logs api
```

### API can't connect to database?

```bash
# Verify PostgreSQL is ready
docker-compose logs postgres | grep "ready to accept"

# Restart API
docker-compose restart api
```

### Frontend not loading?

```bash
# Check nginx logs
docker-compose logs nginx

# Verify frontend built successfully
docker-compose logs frontend
```

### Database migrations failed?

```bash
# Check API startup logs
docker-compose logs api | grep -i migration

# Re-run migrations (API restart)
docker-compose down && docker-compose up
```

## Differences from Carousel Project

| Aspect | Carousel | Bookmarks App |
|--------|----------|---------------|
| **Package manager** | pnpm | Bun |
| **Runtime** | Node 22 | Bun 1.2.5 |
| **Backend** | None (static site) | Hono API + PostgreSQL |
| **Frontend build** | Vite | Vite (Bun) |
| **Orchestration** | Single Dockerfile | Full docker-compose |
| **Database** | None | PostgreSQL 17 |
| **Reverse proxy** | Baked into image | Separate nginx service |
| **Nginx version** | `:alpine` (unversioned) | `1.26.3-alpine` (pinned) |

## API Endpoints

See Swagger UI: `http://localhost/api/docs`

**Examples:**

```bash
# Health check
curl http://localhost/api/health

# List all folders
curl http://localhost/api/folders

# Get folder tree (nested)
curl http://localhost/api/folders/tree

# Create folder
curl -X POST http://localhost/api/folders \
  -H "Content-Type: application/json" \
  -d '{"name":"Work","parentId":null}'

# Export bookmarks
curl http://localhost/api/export?folderIds=<uuid> \
  -o bookmarks.html

# Import bookmarks
curl -X POST http://localhost/api/import \
  -F "file=@bookmarks.html" \
  -F "targetFolderId=<uuid>"
```

## License & Contributing

Open-source. Contributions welcome via pull requests.
