# syntax=docker/dockerfile:1

# Single-image build: compile the frontend, then run it from the Bun/Hono API,
# which also serves the built SPA. Replaces the separate frontend + nginx images.

# Stage 1: build the frontend
FROM oven/bun:1.3.14-alpine AS frontend-build
WORKDIR /fe
COPY frontend/package.json frontend/bun.lock* ./
RUN bun install --frozen-lockfile
COPY frontend/ ./
RUN bun run build

# Stage 2: API runtime that also serves the built frontend
FROM oven/bun:1.3.14-alpine AS production
WORKDIR /app

COPY api/package.json api/bun.lock* ./
RUN bun install --frozen-lockfile --production

COPY api/src ./src
COPY --from=frontend-build /fe/dist ./public

ENV PUBLIC_DIR=./public

USER bun

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["bun", "run", "src/index.ts"]
