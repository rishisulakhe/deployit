# Runbook — Local Development

## Two Modes

| | Local mode | AWS mode |
|---|---|---|
| Builds | Subprocess | ECS Fargate |
| Artifacts | `/tmp/` | S3 |
| Cost | $0 | ~$1-2/day |

Switch modes by changing values in `.env`:
- **Local**: `S3_ARTIFACTS_BUCKET="local"`, `ECS_BUILD_TASK_SUBNETS=""`
- **AWS**: Run `scripts/setup-aws.sh` and fill in values

## Quick Start (Local Mode)

```bash
# 1. Install dependencies
bun install

# 2. Copy env template
cp .env.example .env
# Fill in GitHub OAuth values

# 3. Symlink .env
for svc in api-server orchestrator build-agent edge-proxy dashboard; do
  ln -sf ../.env $svc/.env
done

# 4. Start backing services
docker-compose up -d

# 5. Setup database
cd api-server
bunx prisma generate --schema=prisma/schema.prisma
bunx prisma migrate deploy --schema=prisma/schema.prisma
cd ..

# 6. Start services
bun run dev:api        # :3001
bun run dev:orch       # :3003
bun run dev:proxy      # :8000
bun run dev:dashboard  # :3000
```

## AWS Mode

```bash
# 1. Create AWS resources
./scripts/setup-aws.sh

# 2. Update .env with output values

# 3. Build & push Docker image
cd build-agent
aws ecr get-login-password --region ap-south-2 | \
  docker login --username AWS --password-stdin <account>.dkr.ecr.ap-south-2.amazonaws.com
docker build -t <ecr-uri>:latest .
docker push <ecr-uri>:latest
cd ..

# 4. Restart orchestrator
```

## Service URLs

| Service | URL |
|---|---|
| Dashboard | http://localhost:3000 |
| api-server | http://localhost:3001/healthz |
| Orchestrator | http://localhost:3003/metrics |
| Edge proxy | http://localhost:8000/healthz |
| Grafana | http://localhost:3002 |
| Prometheus | http://localhost:9090 |

## Common Issues

### Port conflict (Grafana vs orchestrator)

Orchestrator uses `ORCHESTRATOR_PORT=3003`. Change if needed.

### Login button shows empty client_id

Set `NEXT_PUBLIC_GITHUB_CLIENT_ID` in `.env`.

### Build succeeds but 404

- Check deployment status is SUCCESS
- Visit `http://localhost:8000/<slug>/`
- Verify artifacts in `/tmp/vercel-clone-artifacts/`
