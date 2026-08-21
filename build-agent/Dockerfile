# Build agent image for ECS Fargate
# Contains: Bun runtime, Node.js (npm), git, and other build tools

FROM oven/bun:1-debian AS base

# Install build tools: git, Node.js (for npm), curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    ca-certificates \
    gnupg \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm and yarn globally (common package managers)
RUN npm install -g pnpm yarn

WORKDIR /app

# Install deps first to leverage Docker layer caching.
COPY package.json bun.lock* ./
RUN bun install --production --frozen-lockfile || bun install --production

COPY . .

# Run as non-root user (bun user exists in base image)
USER bun
CMD ["bun", "src/index.ts"]
