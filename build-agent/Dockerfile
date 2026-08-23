# Build agent image for ECS Fargate
# Multi-stage with Alpine reduces base OS and Node layer footprint significantly
FROM oven/bun:1-alpine AS base

# Install git, nodejs, npm, and certificates in a single layer with no cache
RUN apk add --no-cache git curl ca-certificates nodejs npm

# Install pnpm and yarn, then wipe npm cache immediately
RUN npm install -g pnpm yarn && npm cache clean --force

WORKDIR /app

# Install deps first to leverage caching
COPY package.json bun.lock* ./
RUN (bun install --production --frozen-lockfile || bun install --production) \
    && rm -rf /root/.bun/install/cache

COPY . .

# Ensure app files belong to bun user in Alpine
RUN chown -R bun:bun /app

USER bun
CMD ["bun", "src/index.ts"]