# Bun-based build agent image, executed as the ECS Fargate task.
#
# The orchestrator spawns a fresh task per build with all build config injected
# as env vars (see orchestrator/lib/ecs.ts). Env vars include REPO_URL with
# the user's GitHub token, BRANCH, ROOT_DIR, BUILD_COMMAND, BUILD_DIR,
# DEPLOYMENT_ID, PROJECT_ID, REDIS_URL, S3_ARTIFACTS_BUCKET, AWS_REGION.

FROM oven/bun:1-debian AS base

# git is required for cloning user repos.
RUN apt-get update && apt-get install -y --no-install-recommends \
    git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first to leverage Docker layer caching.
COPY package.json bun.lock* ./
RUN bun install --production --frozen-lockfile || bun install --production

COPY . .

USER bun
CMD ["bun", "src/index.ts"]