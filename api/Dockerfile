FROM oven/bun:1.2.5-alpine

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --production

COPY . .

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["bun", "run", "src/index.ts"]
