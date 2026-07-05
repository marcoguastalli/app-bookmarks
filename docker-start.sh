#!/usr/bin/env bash
#
# docker-start.sh — run the published single app-bookmarks image (SPA + API)
# together with a PostgreSQL container whose data lives in a host directory.
#
# The app runs its DB migrations on startup, so a fresh (empty) data dir gives you
# a clean schema with no data. Everything is plain `docker run` — no Compose.
#
# Usage:
#   ./docker-start.sh                 # start db + app (data in ~/temp/new-bookmarks)
#   ./docker-start.sh --seed          # start, then load sample data
#   ./docker-start.sh --fresh         # wipe the data dir first, then start (⚠ deletes data)
#   ./docker-start.sh --down          # stop & remove the containers + network (keeps data)
#   ./docker-start.sh -h | --help
#
# Override any setting via env vars, e.g.:
#   DATA_DIR=~/temp/mybm PORT=8080 DB_PASSWORD=s3cret ./docker-start.sh
#
set -euo pipefail

# ── config (override via env) ────────────────────────────────────────────────
DATA_DIR="${DATA_DIR:-$HOME/temp/new-bookmarks}"
PORT="${PORT:-80}"
IMAGE="${IMAGE:-ghcr.io/marcoguastalli/app-bookmarks:1.0.0-no-nginx}"
POSTGRES_IMAGE="${POSTGRES_IMAGE:-postgres:18.4-alpine3.24}"

DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-CHANGE_ME}"
DB_NAME="${DB_NAME:-bookmarks}"

NET="${NET:-bookmarks-net}"
DB_CONTAINER="${DB_CONTAINER:-bookmarks-db}"
APP_CONTAINER="${APP_CONTAINER:-app-bookmarks}"

# ── args ─────────────────────────────────────────────────────────────────────
SEED=false
FRESH=false
DOWN=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --seed)      SEED=true ;;
    --fresh)     FRESH=true ;;
    --down)      DOWN=true ;;
    -h|--help)   sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//; /^set -euo/d'; exit 0 ;;
    *)           echo "docker-start.sh: unknown argument '$1' (try --help)" >&2; exit 2 ;;
  esac
  shift
done

command -v docker >/dev/null || { echo "docker-start.sh: docker not found" >&2; exit 1; }

# Expand a leading ~ in DATA_DIR (env vars aren't tilde-expanded by the shell).
DATA_DIR="${DATA_DIR/#\~/$HOME}"

# ── teardown ─────────────────────────────────────────────────────────────────
if $DOWN; then
  echo "→ removing containers and network (data in $DATA_DIR is kept)"
  docker rm -f "$APP_CONTAINER" "$DB_CONTAINER" 2>/dev/null || true
  docker network rm "$NET" 2>/dev/null || true
  echo "✓ down"
  exit 0
fi

# ── fresh wipe (guarded) ─────────────────────────────────────────────────────
if $FRESH; then
  echo "⚠  --fresh: deleting $DATA_DIR"
  docker rm -f "$APP_CONTAINER" "$DB_CONTAINER" 2>/dev/null || true
  rm -rf "${DATA_DIR:?}"
fi

# ── up ───────────────────────────────────────────────────────────────────────
echo "→ data dir : $DATA_DIR"
echo "→ image    : $IMAGE"
echo "→ app URL  : http://localhost:$PORT"
mkdir -p "$DATA_DIR"

# Network (create if missing).
docker network inspect "$NET" >/dev/null 2>&1 || {
  echo "→ creating network '$NET'"
  docker network create "$NET" >/dev/null
}

# Remove any stale containers of the same name (this script owns them; data persists on the host).
docker rm -f "$APP_CONTAINER" "$DB_CONTAINER" 2>/dev/null || true

echo "→ starting PostgreSQL ($DB_CONTAINER)"
docker run -d --name "$DB_CONTAINER" \
  --network "$NET" \
  -e POSTGRES_USER="$DB_USER" \
  -e POSTGRES_PASSWORD="$DB_PASSWORD" \
  -e POSTGRES_DB="$DB_NAME" \
  -v "$DATA_DIR:/var/lib/postgresql" \
  "$POSTGRES_IMAGE" >/dev/null

echo -n "→ waiting for PostgreSQL to be ready"
for _ in $(seq 1 30); do
  if docker exec "$DB_CONTAINER" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
    echo " ✓"; break
  fi
  echo -n "."; sleep 2
done
if ! docker exec "$DB_CONTAINER" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
  echo; echo "✗ PostgreSQL did not become ready. Logs:" >&2
  docker logs --tail 30 "$DB_CONTAINER" >&2; exit 1
fi

echo "→ starting app ($APP_CONTAINER)"
docker run -d --name "$APP_CONTAINER" \
  --network "$NET" \
  -e DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@$DB_CONTAINER:5432/$DB_NAME" \
  -e NODE_ENV=production \
  -p "$PORT:3000" \
  "$IMAGE" >/dev/null

echo -n "→ waiting for app health"
for _ in $(seq 1 30); do
  status="$(docker inspect --format '{{.State.Health.Status}}' "$APP_CONTAINER" 2>/dev/null || echo starting)"
  [[ "$status" == "healthy" ]] && { echo " ✓"; break; }
  echo -n "."; sleep 2
done

if $SEED; then
  echo "→ seeding sample data"
  docker exec "$APP_CONTAINER" bun run seed
fi

echo
echo "✓ up — open http://localhost:$PORT   (API: /api, Swagger: /api/docs)"
echo "  logs:     docker logs -f $APP_CONTAINER"
echo "  stop/rm:  ./docker-start.sh --down   (keeps data in $DATA_DIR)"
