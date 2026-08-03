# orchestrator — BRPOP worker on Bun. No exposed HTTP port by default
# (metrics on :3002 are served by Bun.serve inside the process).
FROM oven/bun:1-debian AS base

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --production --frozen-lockfile || bun install --production

COPY . .

USER bun
CMD ["bun", "src/index.ts"]