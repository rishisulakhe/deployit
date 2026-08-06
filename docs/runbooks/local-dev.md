# Runbook — Local Development

## Two modes

This project works in two modes:

1. **Local-only** (default) — no AWS, no Terraform. Builds run as subprocesses,
   artifacts saved to `/tmp/`, edge-proxy serves from filesystem. Zero cost.
2. **AWS mode** — Terraform applied, builds on ECS Fargate, artifacts in real S3,
   edge-proxy proxies to CloudFront. ~$3-5/day. See
   [terraform.md](./terraform.md) for setup.

Switch modes by changing values in `.env` — no code changes needed.

## Prerequisites

- [Bun](https://bun.sh) 1.3+
- [Docker](https://docker.com) + Docker Compose
- [Terraform](https://terraform.io) 1.9+ (only for AWS mode)
- A GitHub OAuth App (Settings → Developer settings → OAuth Apps → New OAuth App)
  - Homepage URL: `http://localhost:3000`
  - Callback URL: `http://localhost:3000/api/auth/callback/github`

## First-time setup (local-only mode)

```bash
# 1. Install all workspace dependencies
bun install

# 2. Copy the env template and fill in GitHub OAuth values
cp .env.example .env
# Edit .env — at minimum fill in:
#   GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET
#   NEXT_PUBLIC_GITHUB_CLIENT_ID (same as GITHUB_CLIENT_ID)
#   NEXTAUTH_SECRET (generate with: openssl rand -base64 32)
# Local mode defaults are already correct:
#   S3_ARTIFACTS_BUCKET="local", ECS_BUILD_TASK_SUBNETS="",
#   EDGE_PROXY_BACKEND_BASE_URL=""

# 3. Symlink .env into each service directory
#    (Bun loads .env from CWD, not monorepo root)
for svc in api-server orchestrator build-agent edge-proxy dashboard; do
  ln -sf ../.env $svc/.env
done

# 4. Start backing services (Postgres, Redis, Prometheus, Grafana)
docker-compose up -d

# 5. Generate the Prisma client + run migrations
cd api-server
bunx prisma generate --schema=prisma/schema.prisma
bunx prisma migrate deploy --schema=prisma/schema.prisma
cd ..

# 6. Start all app services (each in its own terminal)
bun run dev:api        # api-server on :3001
bun run dev:orch       # orchestrator worker on :3003
bun run dev:proxy      # edge-proxy on :8000
bun run dev:dashboard  # Next.js on :3000
```

## Deploying a project (local mode)

1. Open http://localhost:3000 → sign in with GitHub
2. Click **New Project** → pick a repo → configure build → **Deploy**
3. The orchestrator spawns `bun src/index.ts` in `build-agent/` as a subprocess
4. Build-agent clones the repo, installs deps, builds, uploads to
   `/tmp/vercel-clone-artifacts/projects/<projectId>/<deploymentId>/`
5. Once status = SUCCESS, click **Visit** → opens `http://localhost:8000/<slug>/`
6. Edge-proxy serves files from the local filesystem

## Accessing services

| Service | URL |
|---|---|
| Dashboard | http://localhost:3000 |
| api-server health | http://localhost:3001/healthz |
| api-server metrics | http://localhost:3001/metrics |
| Orchestrator metrics | http://localhost:3003/metrics |
| Edge proxy | http://localhost:8000/healthz |
| Deployed site | http://localhost:8000/`<slug>`/ |
| Grafana | http://localhost:3002 (admin/admin) |
| Prometheus | http://localhost:9090 |

> **Note:** Grafana and the orchestrator both default to port 3002. Either
> change `GRAFANA_PORT=3004` in `.env` or the orchestrator uses
> `ORCHESTRATOR_PORT=3003` (already set).

## Grafana dashboards

Dashboards are auto-provisioned. Open Grafana → left sidebar → Dashboards →
"Vercel Clone" folder. Two dashboards:

1. **Build Overview** — queue depth, success/fail/retry, build duration,
   ECS errors, edge proxy cache hit ratio
2. **API Overview** — deploy triggers, auth rate, SSE connections, active requests

## Stopping

```bash
# Stop app services (Ctrl+C in each terminal)
docker-compose down        # stop containers, keep data
docker-compose down -v     # stop + wipe Postgres/Redis data (fresh start)
```

## Switching to AWS mode

See [terraform.md](./terraform.md) for full instructions. Quick summary:

```bash
cd infra/terraform
terraform apply -auto-approve

# Update .env with terraform outputs:
#   S3_ARTIFACTS_BUCKET, CLOUDFRONT_DOMAIN, ECS_BUILD_TASK_SUBNETS,
#   ECS_BUILD_TASK_SECURITY_GROUPS, KMS_KEY_ID, ECS_REDIS_URL,
#   EDGE_PROXY_BACKEND_BASE_URL

# Build & push build-agent to ECR:
cd build-agent
ECR_URI=$(cd ../infra/terraform && terraform output -raw ecr_repository_urls | jq -r '."build-agent"')
docker build -t $ECR_URI:latest . && docker push $ECR_URI:latest

# Restart services
```

## Switching back to local mode

After `terraform destroy`:

```bash
# Edit .env — reset these to local values:
#   S3_ARTIFACTS_BUCKET="local"
#   ECS_BUILD_TASK_SUBNETS=""
#   EDGE_PROXY_BACKEND_BASE_URL=""
#   CLOUDFRONT_DOMAIN=""
#   KMS_KEY_ID=""
#   ECS_REDIS_URL=""

# Restart services
```

## Common issues

### Prisma client not generated

```
Error: Cannot find module '../generated/prisma/client'
```

Fix: `cd api-server && bunx prisma generate --schema=prisma/schema.prisma`

### Port conflict (Grafana vs orchestrator)

Grafana defaults to 3002. The orchestrator uses `ORCHESTRATOR_PORT=3003`.
If you still have a conflict, change `GRAFANA_PORT=3004` in `.env`.

### Redis connection refused

Ensure the Redis container is running: `docker-compose ps redis`.
If not: `docker-compose up -d redis`

### Login button shows "client_id=" empty

The dashboard reads `NEXT_PUBLIC_GITHUB_CLIENT_ID` (not `GITHUB_CLIENT_ID`).
Ensure both are set in `.env` and the dashboard has a `.env` symlink.

### Build succeeds but deployed site returns 404

1. Check the deployment status is SUCCESS in the dashboard
2. In local mode, verify artifacts exist:
   `ls /tmp/vercel-clone-artifacts/projects/<projectId>/<deploymentId>/`
3. Check edge-proxy: `curl http://localhost:8000/healthz`
4. Visit `http://localhost:8000/<slug>/` (not `http://localhost:8000/<projectId>/`)
5. If the project is **private**, edge-proxy returns 404 by design

### Orchestrator says "EADDRINUSE" on port 3001

The shared `.env` has `PORT=3001` (for api-server). The orchestrator reads
`ORCHESTRATOR_PORT=3003` to override this. Ensure `ORCHESTRATOR_PORT` is set
in `.env`.