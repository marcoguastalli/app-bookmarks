# Stage 1: build
FROM oven/bun:1.2.5-alpine AS builder

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# Stage 2: serve with nginx
FROM nginx:1.26.3-alpine AS production

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s \
  CMD wget -qO- http://127.0.0.1/ || exit 1
