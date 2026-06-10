# Bookmarks App

A self-hosted bookmarks manager that runs entirely in Docker. Organize URLs into folders, manage them through a web UI, and export them as a standard `bookmarks.html` file importable by any browser.

## Features

- Folder tree with unlimited nesting (configurable max depth)
- Full CRUD for folders and bookmarks
- URL normalization and deduplication
- Export to Netscape Bookmark Format (`bookmarks.html`) — importable in Chrome, Firefox, Safari
- Import from browser-exported `bookmarks.html`
- Dry-run import preview
- Auto-fetched favicons
- OpenAPI spec + Swagger UI at `/api/docs`
- Streaming export, pagination, search

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | [Bun](https://bun.sh) 1.2.5 |
| API | [Hono](https://hono.dev) 4.7 |
| Database | PostgreSQL 17.8 |
| Frontend | React 18 + TypeScript + Vite 6 |
| Styling | Tailwind CSS 3 |
| Proxy | Nginx 1.26.3 |
| Tests | Bun test + Playwright |

## Project Structure

```
app-bookmarks/
├── docker-compose.yml          # All services
├── nginx.conf                  # Reverse proxy config
├── .env.example                # Environment template
├── api/                        # Hono REST API
│   ├── src/
│   │   ├── index.ts            # App entry point
│   │   ├── env.ts              # Env validation (Zod)
│   │   ├── db/
│   │   │   ├── client.ts       # Postgres client
│   │   │   ├── migrate.ts      # Migration runner
│   │   │   ├── schema.ts       # TypeScript types
│   │   │   ├── seed.ts         # Dev seed data
│   │   │   └── migrations/
│   │   │       └── 001_initial.sql
│   │   ├── routes/
│   │   │   ├── folders.ts
│   │   │   ├── bookmarks.ts
│   │   │   ├── export.ts
│   │   │   └── import.ts
│   │   ├── services/
│   │   │   ├── export.ts       # Netscape HTML generator
│   │   │   ├── import.ts       # Netscape HTML parser
│   │   │   └── favicon.ts      # Favicon auto-fetch
│   │   ├── utils/
│   │   │   └── normalize.ts    # URL normalization
│   │   └── middleware/
│   │       └── error.ts        # Consistent error responses
│   ├── tests/
│   │   ├── setup.ts
│   │   ├── unit/
│   │   └── integration/
│   ├── bunfig.toml
│   ├── package.json
│   └── Dockerfile
└── frontend/                   # React SPA
    ├── src/
    │   ├── main.tsx
    │   ├── App.tsx
    │   ├── types/
    │   ├── api/
    │   └── components/
    │       ├── FolderTree.tsx
    │       ├── BookmarkList.tsx
    │       ├── ExportPanel.tsx
    │       ├── ImportPanel.tsx
    │       ├── BookmarkForm.tsx
    │       ├── FolderForm.tsx
    │       └── Modal.tsx
    ├── tests/e2e/
    ├── playwright.config.ts
    ├── package.json
    └── Dockerfile
```

---

## Setup

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose v2
- [Bun](https://bun.sh) 1.2+ (for local development and running tests)
- [Node.js](https://nodejs.org) 22+ (for Playwright E2E tests)

### 1. Clone and configure environment

```bash
git clone <repo-url>
cd app-bookmarks

# Create the root env file
cp .env.example .env
```

Edit `.env` if you want to change default credentials:

```dotenv
POSTGRES_USER=postgres
POSTGRES_PASSWORD=admin123four
POSTGRES_DB=bookmarks
```

---

## Running with Docker (Production)

Build and start all services:

```bash
docker compose up --build
```

The app is available at:

| Service | URL |
|---------|-----|
| Frontend | http://localhost |
| API | http://localhost/api |
| Swagger UI | http://localhost/api/docs |
| pgAdmin | http://localhost:5050 |

Stop all services:

```bash
docker compose down
```

Stop and remove volumes (deletes all data):

```bash
docker compose down -v
```

---

## Local Development

Run the API and frontend outside of Docker for hot reload.

### API

```bash
cd api

# Install dependencies
bun install

# Copy and edit env file
cp .env.example .env
# Set DATABASE_URL to point at your running postgres:
# DATABASE_URL=postgresql://postgres:admin123four@localhost:5432/bookmarks

# Start postgres only (needed for local dev)
docker compose up postgres -d

# Run API with hot reload
bun run dev
```

The API is now available at `http://localhost:3000`.

Migrations run automatically on startup.

Seed the database with sample data:

```bash
bun run seed
```

### Frontend

```bash
cd frontend

# Install dependencies
bun install   # or: npm install

# Start Vite dev server (proxies /api to localhost:3000)
bun run dev   # or: npm run dev
```

The frontend dev server is available at `http://localhost:5173`.

The Vite dev server automatically proxies `/api/*` to the API at `http://localhost:3000`.

---

## API Reference

Full interactive documentation is available at `/api/docs` when the app is running.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/folders` | List folders (paginated) |
| `GET` | `/folders/tree` | Full nested folder tree |
| `POST` | `/folders` | Create a folder |
| `PUT` | `/folders/:id` | Update a folder (rename, move, reorder) |
| `DELETE` | `/folders/:id` | Delete a folder (`?force=true` to cascade) |
| `GET` | `/bookmarks` | List bookmarks (`?folder_id=`, `?q=`, `?limit=`, `?offset=`) |
| `GET` | `/bookmarks/:id` | Get a bookmark |
| `POST` | `/bookmarks` | Create a bookmark |
| `PUT` | `/bookmarks/:id` | Update a bookmark |
| `DELETE` | `/bookmarks/:id` | Delete a bookmark |
| `POST` | `/bookmarks/deduplicate` | Find and remove duplicates (`{ dry_run: true }`) |
| `POST` | `/export` | Download `bookmarks.html` (`{ folder_ids: string[] }`) |
| `POST` | `/import` | Import `bookmarks.html` (`?folder_id=`, `?dryRun=true`) |
| `GET` | `/docs` | Swagger UI |
| `GET` | `/openapi.json` | OpenAPI 3.0 spec |

### Error Format

All errors use a consistent JSON shape:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Folder not found",
    "details": {}
  }
}
```

---

## Testing

### Unit Tests (no database required)

```bash
cd api
bun run test:unit
```

Tests cover: URL normalization, HTML escaping in export, Netscape HTML parser.

### Integration Tests (requires PostgreSQL)

Integration tests run against a real database. Set up a test database first:

```bash
# Start postgres
docker compose up postgres -d

# Create the test database
docker exec docker-postgres psql -U postgres -c "CREATE DATABASE bookmarks_test;"

# Copy and configure the test env file
cp api/.env.test.example api/.env.test
# .env.test already points to bookmarks_test by default
```

Run the tests:

```bash
cd api
bun run test:integration
```

Run all API tests:

```bash
cd api
bun test
```

### E2E Tests (Playwright)

E2E tests require the full app running (API + frontend).

```bash
# Option A: run against Docker
docker compose up --build -d

# Option B: run API and frontend locally (see Local Development above)

# Install Playwright browsers (first time only)
cd frontend
npm install
npx playwright install

# Run E2E tests
npm run test:e2e
```

By default, Playwright targets `http://localhost:5173`. Set `BASE_URL` to point at a different instance:

```bash
BASE_URL=http://localhost npm run test:e2e
```

View the HTML test report:

```bash
npx playwright show-report
```

---

## Environment Variables

### Root `.env`

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_USER` | `postgres` | PostgreSQL user |
| `POSTGRES_PASSWORD` | `admin123four` | PostgreSQL password |
| `POSTGRES_DB` | `bookmarks` | Database name |
| `PGADMIN_DEFAULT_EMAIL` | `pgadmin4@pgadmin.org` | pgAdmin login email |
| `PGADMIN_DEFAULT_PASSWORD` | `admin123four` | pgAdmin login password |
| `PGADMIN_PORT` | `5050` | pgAdmin host port |
| `NODE_ENV` | `production` | API environment |
| `MAX_FOLDER_DEPTH` | `10` | Maximum folder nesting depth |
| `LOG_LEVEL` | `info` | API log level (`debug`, `info`, `warn`, `error`) |

### `api/.env` (local development)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Full PostgreSQL connection string |
| `PORT` | API listen port (default: `3000`) |
| `NODE_ENV` | `development` \| `production` \| `test` |
| `MAX_FOLDER_DEPTH` | Maximum folder nesting depth |
| `LOG_LEVEL` | Log level |

### `api/.env.test` (integration tests)

Copy from `api/.env.test.example` and set `DATABASE_URL` to a test database:

```dotenv
DATABASE_URL=postgresql://postgres:admin123four@localhost:5432/bookmarks_test
PORT=3001
NODE_ENV=test
MAX_FOLDER_DEPTH=10
LOG_LEVEL=error
```

---

## Data Model

### Folder

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `name` | text | Required |
| `parent_id` | UUID | Nullable, FK → folders(id) ON DELETE RESTRICT |
| `position` | integer | Gap-based ordering (increments of 100) |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### Bookmark

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `folder_id` | UUID | Required, FK → folders(id) ON DELETE CASCADE |
| `title` | text | Required |
| `url` | text | Required |
| `normalized_url` | text | Derived from url, used for deduplication |
| `description` | text | Nullable |
| `favicon_url` | text | Nullable, auto-fetched asynchronously |
| `position` | integer | Gap-based ordering |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**Unique constraint:** `(normalized_url, folder_id)` — prevents duplicate URLs within the same folder.

---

## URL Normalization Rules

When a bookmark is saved, its URL is normalized before storage to enable deduplication:

- Lowercase scheme and host
- Remove default ports (80 for http, 443 for https)
- Strip tracking query parameters: `utm_*`, `fbclid`, `gclid`, `msclkid`, `_ga`, `ref`, `igshid`, `mc_eid`
- Sort remaining query parameters (for deterministic comparison)
- Remove trailing slash (except root `/`)

Example: `https://EXAMPLE.COM/path/?utm_source=google&q=hello` → `https://example.com/path?q=hello`

---

## Export Format

Exported files follow the [Netscape Bookmark Format](https://learn.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/platform-apis/aa753582(v=vs.85)) and can be imported directly into Chrome, Firefox, and Safari.

```html
<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1700000000" LAST_MODIFIED="1700000000">Work</H3>
    <DL><p>
        <DT><A HREF="https://github.com" ADD_DATE="1700000000">GitHub</A>
    </DL><p>
</DL><p>
```

All user-provided content is HTML-escaped to prevent XSS.

---

## Database Migrations

Migrations run automatically on API startup. Migration files live in `api/src/db/migrations/` and are named with a numeric prefix for ordering (e.g., `001_initial.sql`). Applied migrations are tracked in the `schema_migrations` table.

To add a migration, create a new file:

```bash
touch api/src/db/migrations/002_add_tags.sql
```

It will be applied automatically the next time the API starts.

---

## pgAdmin

pgAdmin is available at `http://localhost:5050`.

Default credentials:
- **Email:** `pgadmin4@pgadmin.org`
- **Password:** `admin123four`

To connect to the database, add a new server with:
- **Host:** `postgres`
- **Port:** `5432`
- **Username:** `postgres`
- **Password:** `admin123four`
