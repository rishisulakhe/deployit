# Runbook — Local Development

## Prerequisites

- [Bun](https://bun.sh) 1.3+
- [Docker](https://docker.com) + Docker Compose
- [Terraform](https://terraform.io) 1.9+ (only for AWS deployment)

## First-time setup

```bash
# 1. Install all workspace dependencies
bun install

# 2. Copy the env template and fill in values
cp .env.example .env
# Edit .env — at minimum set DATABASE_URL and REDIS_URL to match docker-compose

# 3. Start backing services (Postgres, Redis, Prometheus, Grafana)
docker compose up -d

# 4. Generate the Prisma client + run migrations
cd api-server
bunx prisma generate --schema=prisma/schema.prisma
bunx prisma migrate deploy --schema=prisma/schema.prisma
cd ..

# 5. Start all app services (each in its own terminal)
bun run dev:api        # api-server on :3001
bun run dev:orch       # orchestrator on :3002 (metrics)
bun run dev:proxy      # edge-proxy on :8000
bun run dev:dashboard  # Next.js on :3000
```

## Accessing services

| Service | URL |
|---|---|
| Dashboard | http://localhost:3000 |
| api-server health | http://localhost:3001/healthz |
| api-server metrics | http://localhost:3001/metrics |
| Orchestrator metrics | http://localhost:3002/metrics |
| Edge proxy | http://localhost:8000/healthz |
| Grafana | http://localhost:3002 (admin/admin) — note: may conflict with orchestrator; change GRAFANA_PORT in .env |
| Prometheus | http://localhost:9090 |

## Grafana dashboards

Dashboards are auto-provisioned. Open Grafana → left sidebar → Dashboards →
"Vercel Clone" folder. Two dashboards:

1. **Build Overview** — queue depth, success/fail/retry, build duration,
   ECS errors, edge proxy cache hit ratio
2. **API Overview** — deploy triggers, auth rate, SSE connections, active requests

## Stopping

```bash
docker compose down        # stop containers, keep data
docker compose down -v     # stop + wipe Postgres/Redis data
```

## Common issues

### Prisma client not generated

```
Error: Cannot find module '../generated/prisma/client'
```

Fix: `cd api-server && bunx prisma generate --schema=prisma/schema.prisma`

### Port conflict (Grafana vs orchestrator)

Both default to 3002. Change `GRAFANA_PORT=3003` in `.env` and
`docker compose up -d grafana` again.

### Redis connection refused

Ensure the Redis container is running: `docker compose ps redis`.
If not: `docker compose up -d redis`.