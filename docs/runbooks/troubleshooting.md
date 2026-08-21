# Runbook — Troubleshooting

## Service won't start

### api-server

```
Cannot find module '../generated/prisma/client'
```
→ `cd api-server && bunx prisma generate`

```
ECONNREFUSED 127.0.0.1:5432
```
→ `docker-compose up -d postgres`

### orchestrator

```
EADDRINUSE :3001
```
→ Set `ORCHESTRATOR_PORT=3003` in `.env`

### edge-proxy

```
Project not found (404)
```
→ Check slug in DB or Redis cache

## Build issues

### Stays in QUEUED

- Check orchestrator: `curl localhost:3003/metrics`
- Check Redis: `redis-cli LLEN build_queue`

### FAILED after retries

- Inspect DLQ: `redis-cli LRANGE build_dlq 0 -1`
- Check logs via API or dashboard

### TIMEOUT

- Increase `ECS_BUILD_TIMEOUT_SECONDS`
- Check for hanging prompts in build

## Database

```bash
# Reset
docker-compose down -v
docker-compose up -d postgres
cd api-server && bunx prisma migrate deploy
```

## Redis

```bash
# Flush
docker-compose exec redis redis-cli FLUSHALL

# Inspect queue
redis-cli LRANGE build_queue 0 -1
redis-cli LRANGE build_dlq 0 -1
```
