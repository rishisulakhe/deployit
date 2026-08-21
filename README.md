# Vercel Clone (AWS + Local)

A self-hosted, Vercel-style static site hosting platform. Users authenticate
with GitHub, import a repository, and have it built and served. The build
backend runs as **ECS Fargate** tasks (AWS mode) or local subprocesses (local mode),
and artifacts are stored in **S3** or local filesystem.

> Built as a DevOps role interview project, improving on the Azure-based
> reference project [DeployIt](https://github.com/...) — see
> [docs/architecture.md](docs/architecture.md#comparison-with-deployit) for
> a full comparison.

## Architecture

```mermaid
graph TB
    subgraph Dashboard
        DASH["Next.js 16 + shadcn UI<br/>:3000"]
    end

    subgraph API["API Layer"]
        API["api-server<br/>Hono + Prisma<br/>:3001"]
    end

    subgraph Pipeline["Build Pipeline"]
        QUEUE[("Redis<br/>build_queue")]
        ORCH["orchestrator<br/>BRPOP worker<br/>:3003"]
        ECS["ECS Fargate<br/>build-agent task<br/>(or local subprocess)"]
    end

    subgraph Edge["Edge Serving"]
        PROXY["edge-proxy<br/>Express :8000"]
        S3[("S3 or /tmp/")]
    end

    subgraph Data["Data Plane"]
        RDS[("PostgreSQL<br/>(Docker)")]
        REDIS[("Redis<br/>(Docker)")]
    end

    DASH -->|REST + SSE| API
    API -->|Prisma| RDS
    API -->|RPUSH| QUEUE
    ORCH -->|BRPOP| QUEUE
    ORCH -->|RunTask or subprocess| ECS
    ECS -->|git clone| GitHub[("GitHub")]
    ECS -->|upload| S3
    PROXY -->|slug lookup| RDS
    PROXY -->|serve| S3
```

## Two Modes

| | Local mode | AWS mode |
|---|---|---|
| Builds | Subprocess | ECS Fargate |
| Artifacts | `/tmp/` | S3 bucket |
| Cost | $0 | ~$1-2/day |
| Setup | `docker-compose up` | `scripts/setup-aws.sh` |

## Quick Start (Local Mode)

```bash
# 1. Install dependencies
bun install

# 2. Copy env template
cp .env.example .env
# Edit .env — fill in GitHub OAuth values

# 3. Symlink .env into each service
for svc in api-server orchestrator build-agent edge-proxy dashboard; do
  ln -sf ../.env $svc/.env
done

# 4. Start backing services
docker-compose up -d  # postgres + redis + prometheus + grafana

# 5. Setup database
cd api-server
bunx prisma generate --schema=prisma/schema.prisma
bunx prisma migrate deploy --schema=prisma/schema.prisma
cd ..

# 6. Start all services
bun run dev:api        # :3001
bun run dev:orch       # :3003
bun run dev:proxy      # :8000
bun run dev:dashboard  # :3000
```

Open http://localhost:3000 → sign in with GitHub → deploy a project.

Deployed site: http://localhost:8000/`<slug>`/

## AWS Mode Setup

### Prerequisites

- AWS CLI configured: `aws configure`
- Docker installed
- `jq` installed

### Quick Setup

```bash
# 1. Create AWS resources (~5 min)
./scripts/setup-aws.sh

# 2. Update .env with output values:
#    S3_ARTIFACTS_BUCKET, ECS_CLUSTER, ECS_BUILD_TASK_SUBNETS, etc.

# 3. Build & push Docker image
cd build-agent
aws ecr get-login-password --region ap-south-2 | \
  docker login --username AWS --password-stdin <account>.dkr.ecr.ap-south-2.amazonaws.com
docker build -t <ecr-uri>:latest .
docker push <ecr-uri>:latest
cd ..

# 4. Restart orchestrator (it will now dispatch to ECS)
bun run dev:orch
```

## Services

| Package | Runtime | Port | Role |
|---|---|---|---|
| `dashboard/` | Node 22 | 3000 | Next.js 16 + shadcn UI, GitHub OAuth, SSE logs |
| `api-server/` | Bun | 3001 | Hono REST API + Prisma |
| `orchestrator/` | Bun | 3003 | Redis BRPOP → ECS/subprocess dispatcher |
| `build-agent/` | Bun | — | git clone → build → S3 upload |
| `edge-proxy/` | Bun | 8000 | Subdomain/path routing → S3 filesystem |

## Documentation

| Document | Description |
|---|---|---|
| [docs/architecture.md](docs/architecture.md) | System design, data flow, decision log |
| [docs/runbooks/local-dev.md](docs/runbooks/local-dev.md) | Development setup, troubleshooting |
| [docs/runbooks/deploy-project.md](docs/runbooks/deploy-project.md) | Deploying via UI or API |
| [docs/runbooks/secrets.md](docs/runbooks/secrets.md) | GitHub OAuth setup |
| [docs/runbooks/troubleshooting.md](docs/runbooks/troubleshooting.md) | Common issues |

## Project Phases

| Phase | Description |
|---|---|
| 1 | Docker-compose + Bun workspace monorepo |
| 2 | Backend services (api-server, orchestrator, build-agent, edge-proxy) |
| 3 | Dashboard (Next.js 16 + shadcn UI) |
| 4 | Observability (Grafana, Prometheus) |
| 5 | CI/CD (GitHub Actions) |
| 6 | Docs + runbooks |

## Key Improvements over DeployIt

| | DeployIt | Vercel Clone |
|---|---|---|
| Cloud | Azure (manual) | AWS (simple CLI) |
| Build agent | Single Docker host | ECS Fargate (serverless) |
| Build retries | None | 3× with DLQ |
| Package manager | npm only | Auto-detect pnpm/yarn/npm |
| Live logs | Polling (5s) | SSE (real-time) |
| Backend | Bundled in Next.js | Separate Hono api-server |
| Observability | None | Prometheus + Grafana |
| CI/CD | Pre-commit hook | GitHub Actions |

## License

MIT.
