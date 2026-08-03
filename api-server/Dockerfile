# api-server — Hono on Bun. Exposes :3001.
FROM oven/bun:1-debian AS base

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --production --frozen-lockfile || bun install --production

COPY . .
RUN bunx prisma generate --schema=prisma/schema.prisma

USER bun
EXPOSE 3001
CMD ["bun", "src/index.ts"]