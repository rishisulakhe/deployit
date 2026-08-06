# Runbook — Troubleshooting

## Service won't start

### api-server

```
Error: Cannot find module '../generated/prisma/client'
```
→ Run `cd api-server && bunx prisma generate --schema=prisma/schema.prisma`

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```
→ Postgres isn't running. `docker compose up -d postgres`

```
Error: connect ECONNREFUSED 127.0.0.1:6379
```
→ Redis isn't running. `docker compose up -d redis`

### orchestrator

```
Error: ecs_runtask_no_task
```
→ ECS cluster/task definition not found. Check `ECS_CLUSTER` and
`ECS_BUILD_TASK_DEFINITION` env vars match Terraform outputs. This only
happens in AWS mode. In local mode (`ECS_BUILD_TASK_SUBNETS=""`), the
orchestrator spawns build-agent as a subprocess instead.

```
Error: EADDRINUSE :3001
```
→ The shared `PORT=3001` in `.env` is for api-server. The orchestrator
uses `ORCHESTRATOR_PORT=3003`. Ensure `ORCHESTRATOR_PORT` is set in `.env`.

```
Error: connect ECONNREFUSED 127.0.0.1:6379
```
→ Redis isn't running. `docker compose up -d redis`

### edge-proxy

```
Project not found (404)
```
→ No project with that slug exists in RDS, or the project is private /
unbuilt. Check `SELECT * FROM "Project" WHERE slug = '<slug>'` directly.

```
upstream_error (502)
```
→ CloudFront/S3 backend unreachable (AWS mode). Check
`EDGE_PROXY_BACKEND_BASE_URL` env var. In local mode, check that the
artifacts exist in `/tmp/vercel-clone-artifacts/`.

### dashboard

```
Redirect loop between /login and /dashboard
```
→ The session cookie isn't set or has expired. Clear cookies and re-login.
Also verify `NEXTAUTH_SECRET` and `JWT_SECRET` are set.

```
Login button shows "client_id=" empty
```
→ The dashboard reads `NEXT_PUBLIC_GITHUB_CLIENT_ID` (not `GITHUB_CLIENT_ID`).
Ensure both are set in `.env` and `dashboard/.env` symlink exists.

## Build pipeline issues

### Build stays in QUEUED forever

1. Check orchestrator is running: `curl localhost:3003/metrics`
2. Check queue depth: `curl localhost:3003/metrics | grep queue_depth`
3. Check Redis: `redis-cli LLEN build_queue`
4. If the orchestrator crashed, restart it and jobs will resume via BRPOP.

### Build FAILED after 3 retries (in DLQ)

1. Inspect the DLQ: `redis-cli LRANGE build_dlq 0 -1`
2. Parse the job JSON to find the deploymentId.
3. Check build logs: `GET /api/deployments/<id>/logs`
4. Common causes:
   - Wrong branch name (git clone fails)
   - Missing `package.json` in root dir
   - Build command exits non-zero (compile error in user code)
   - Build output directory wrong (default `dist`; many frameworks use `build/`)

### Build TIMEOUT after 15 minutes

- The ECS task timeout is 900 seconds (configurable via `ECS_BUILD_TIMEOUT_SECONDS`).
- In local mode, the subprocess timeout is also 900 seconds.
- Large installs or heavy builds may need more. Increase the env var.
- Check if the build is hanging on a prompt (e.g. `npm init` — should never
  happen with `--no-audit --no-fund` but custom scripts can prompt).

## Database issues

### Reset the database (dev only)

```bash
docker compose down -v
docker compose up -d postgres
cd api-server
bunx prisma migrate deploy --schema=prisma/schema.prisma
```

### Check migrations status

```bash
cd api-server
bunx prisma migrate status --schema=prisma/schema.prisma
```

## Redis issues

### Flush all data (dev only — destroys queue + cache)

```bash
docker compose exec redis redis-cli FLUSHALL
```

### Inspect queue contents

```bash
redis-cli LRANGE build_queue 0 -1  # pending jobs
redis-cli LRANGE build_dlq 0 -1     # dead-lettered jobs
redis-cli KEYS 'edge:slug:*'         # edge-proxy cache entries
```

## Observability

### Prometheus can't scrape targets

Open http://localhost:9090/targets — check if targets are UP. If
`host.docker.internal` doesn't resolve, ensure `extra_hosts:
host-gateway` is in docker-compose.yml (it is for Prometheus).

### Grafana dashboards not appearing

1. Check provisioning: `docker compose logs grafana | grep -i provisioning`
2. Verify dashboards are mounted:
   `docker compose exec grafana ls /var/lib/grafana/dashboards/`
3. Restart Grafana: `docker compose restart grafana`

### CloudWatch alarms not firing (prod)

Alarms need the resource to exist and be emitting metrics. Verify:
```bash
aws cloudwatch describe-alarms --alarm-name-prefix vercel-clone
```
Check that `rds_instance_identifier`, `redis_cluster_id`, `alb_arn_suffix`,
and `ecs_cluster_name` are correctly set in the Terraform cloudwatch module.

## Mode switching issues

### Switched to AWS mode but builds still run locally

Check that `ECS_BUILD_TASK_SUBNETS` is non-empty in `.env`. The orchestrator
uses this as the toggle: empty → local subprocess, non-empty → ECS RunTask.

### Switched back to local mode but edge-proxy returns 502

Check that `EDGE_PROXY_BACKEND_BASE_URL=""` in `.env`. If it's still set
to a CloudFront URL, edge-proxy will try to proxy to a non-existent
distribution. Also clear any cached entries: `redis-cli DEL edge:slug:*`

### Artifacts not found after switching modes

Local mode artifacts are in `/tmp/vercel-clone-artifacts/` — this directory
may have been cleared. Re-deploy the project to regenerate.