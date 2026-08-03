# edge-proxy — Express reverse proxy on Bun. Exposes :8000.
FROM oven/bun:1-debian AS base

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --production --frozen-lockfile || bun install --production

COPY . .

USER bun
EXPOSE 8000
CMD ["bun", "src/index.ts"]