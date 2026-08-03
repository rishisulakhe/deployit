# Vercel Clone (on AWS)

A self-hosted, Vercel-style static site hosting platform. Users authenticate
with GitHub, import a repository, and have it built and served on a subdomain.
The build backend runs as **AWS ECS Fargate** tasks, artifacts are stored in
**S3 + CloudFront**, the queue/cache uses **ElastiCache Redis**, and the
database is **RDS PostgreSQL**. The whole cloud layer is provisioned with
**Terraform**.

> Built as a DevOps role interview project, improving on the Azure-based
> reference project [DeployIt](https://github.com/...) — see
> [docs/architecture.md](docs/architecture.md#comparison-with-deployit) for
> a full comparison.

## Architecture

```mermaid
graph TB
    subgraph Public["Public Edge"]
        ALB["ALB — path-based routing"]
    end

    subgraph Dashboard["Dashboard"]
        DASH["Next.js 16 + shadcn UI<br/>:3000"]
    end

    subgraph API["API Layer"]
        API["api-server<br/>Hono + Prisma<br/>:3001"]
    end

    subgraph Pipeline["Build Pipeline"]
        QUEUE[("Redis<br/>build_queue")]
        ORCH["orchestrator<br/>BRPOP worker<br/>:3002 metrics"]
        ECS["ECS Fargate<br/>build-agent task"]
    end

    subgraph Edge["Edge Serving"]
        PROXY["edge-proxy<br/>Express :8000"]
        CF["CloudFront CDN"]
    end

    subgraph Data["Data Plane"]
        RDS[("RDS PostgreSQL 16")]
        REDIS[("ElastiCache Redis 7")]
        S3[("S3 artifacts")]
    end

    subgraph Obs["Observability"]
        PROM["Prometheus"]
        GRAF["Grafana"]
        CW["CloudWatch alarms + logs"]
    end

    Browser -->|app.domain| ALB
    Browser -->|*.domain| ALB
    ALB -->|/| DASH
    ALB -->|/api/*| API
    ALB -->|*.domain| PROXY

    DASH -->|REST + SSE| API
    API -->|Prisma| RDS
    API -->|RPUSH| QUEUE

    ORCH -->|BRPOP| QUEUE
    ORCH -->|RunTask| ECS
    ORCH -->|status| RDS

    ECS -->|git clone| GitHub[("GitHub")]
    ECS -->|upload| S3
    ECS -->|publish logs| REDIS

    PROXY -->|slug lookup| RDS
    PROXY -->|cache| REDIS
    PROXY -->|reverse proxy| CF
    CF -->|fetch| S3

    API -.->|/metrics| PROM
    ORCH -.->|/metrics| PROM
    PROXY -.->|/metrics| PROM
    PROM --> GRAF
    ECS -->|stdout| CW
    ORCH -->|alarms| CW
```

See **[docs/architecture.md](docs/architecture.md)** for the full system design,
data flow, security model, and decision log.

## Services (Bun workspace monorepo)

| Package | Runtime | Stack | Port | Role |
|---|---|---|---|---|
| `dashboard/` | Node 22 | Next.js 16, React 19, shadcn UI | 3000 | Web UI, GitHub OAuth callback, SSE log viewer |
| `api-server/` | Bun | Hono + Prisma 6 + RDS | 3001 | REST API + SSE: auth, projects, deployments, env vars |
| `orchestrator/` | Bun | AWS ECS SDK | 3002 | BRPOP queue → ECS RunTask → retry/DLQ → status updates |
| `build-agent/` | Bun | Docker image (Fargate task) | — | git clone → detect PM → build → S3 upload → Redis logs |
| `edge-proxy/` | Bun | Express 5 + http-proxy | 8000 | subdomain → RDS lookup → CloudFront reverse proxy |

## AWS infrastructure (Terraform)

All cloud resources in `infra/terraform/`, provisioned via 10 modular Terraform
modules. Region: `ap-south-2` (Hyderabad).

| Module | Resources |
|---|---|
| `vpc` | VPC, 2-AZ public+private subnets, IGW, NAT GW |
| `kms` | Customer-managed CMK (S3 SSE + app secrets + RDS + ECR) |
| `s3` | Artifacts bucket (versioned, SSE-KMS, block-public, lifecycle) |
| `cloudfront` | CDN distribution with OAC, SPA fallback, PriceClass_200 |
| `rds` | PostgreSQL 16 (Single-AZ dev / Multi-AZ prod) |
| `elasticache` | Redis 7 (single-node dev / cluster-mode prod) |
| `ecr` | 5 repos with lifecycle policies |
| `ecs` | Fargate cluster + build-agent task definition + IAM roles |
| `alb` | ALB with HTTP listener (dev) / HTTPS redirect (prod), 3 target groups |
| `cloudwatch` | Log groups per service + 7 metric alarms + SNS alert topic |

Workspaces: `dev` (single-AZ, no TLS) and `prod` (Multi-AZ RDS, Redis cluster,
ACM wildcard cert, Route53 records).

See **[docs/runbooks/terraform.md](docs/runbooks/terraform.md)** for full
provisioning instructions.

## Quick start (local dev)

```bash
bun install                                     # install all workspace deps
cp .env.example .env                            # copy env template, fill in values
docker compose up -d                            # postgres + redis + prometheus + grafana
cd api-server && bunx prisma generate --schema=prisma/schema.prisma && bunx prisma migrate deploy --schema=prisma/schema.prisma && cd ..
bun run dev:api                                 # api-server on :3001
bun run dev:orch                               # orchestrator worker on :3002
bun run dev:proxy                              # edge-proxy on :8000
bun run dev:dashboard                          # Next.js on :3000
```

Open http://localhost:3000 to use the dashboard.

| Service | URL |
|---|---|
| Dashboard | http://localhost:3000 |
| api-server | http://localhost:3001/healthz |
| Orchestrator metrics | http://localhost:3002/metrics |
| Edge proxy | http://localhost:8000/healthz |
| Grafana | http://localhost:3002 (admin/admin) |
| Prometheus | http://localhost:9090 |

See **[docs/runbooks/local-dev.md](docs/runbooks/local-dev.md)** for full
setup details and common issues.

## Documentation

| Document | Description |
|---|---|
| [docs/architecture.md](docs/architecture.md) | System design, Mermaid diagram, data flow, security model, decision log, DeployIt comparison |
| [docs/runbooks/local-dev.md](docs/runbooks/local-dev.md) | Local development setup, Grafana dashboards, troubleshooting |
| [docs/runbooks/terraform.md](docs/runbooks/terraform.md) | AWS provisioning, workspaces, CI/CD integration, teardown |
| [docs/runbooks/deploy-project.md](docs/runbooks/deploy-project.md) | Deploying a project via UI or API, build lifecycle |
| [docs/runbooks/secrets.md](docs/runbooks/secrets.md) | GitHub OAuth, KMS encryption, AWS credentials, SNS alerts |
| [docs/runbooks/troubleshooting.md](docs/runbooks/troubleshooting.md) | Service startup, build pipeline, database, Redis, observability |

## Project phases

| Phase | Commit | Description |
|---|---|---|
| 0 | `09c1c5a` | Repo reorg — Bun workspace monorepo, directory renames, stubs |
| 1 | `c5d92b2` | Terraform infra (10 modules) + docker-compose for local dev |
| 2 | `bbe8ebc` | Backend — all 4 services (api-server, orchestrator, build-agent, edge-proxy) |
| 3 | `86d2ae0` | Frontend — Next.js 16 + shadcn UI, GitHub OAuth, SSE logs |
| 4 | `2efc852` | Observability — Grafana dashboards, Prometheus rules, CloudWatch alarms |
| 5 | `efd220b` | CI/CD — GitHub Actions (lint/test, terraform plan, build-push to ECR) |
| 6 | this | Docs + runbooks — architecture, decision log, 5 runbooks |

## Key improvements over DeployIt

| | DeployIt | Vercel Clone |
|---|---|---|
| Cloud | Azure (manual) | AWS (Terraform IaC) |
| Build agent | Single Docker host (dockerode) | AWS ECS Fargate (serverless) |
| Build retries | None | 3× with dead-letter queue |
| Package manager | npm only | Auto-detect pnpm/yarn/npm |
| Secrets | Plaintext in DB | KMS-encrypted at rest |
| Live logs | Polling (5s interval) | SSE (real-time) |
| Backend | Bundled in Next.js | Separate Hono api-server |
| IaC | None | Terraform (10 modules, 2 workspaces) |
| Observability | None | Prometheus + Grafana + CloudWatch alarms |
| CDN | Direct S3 proxy | CloudFront + OAC |

## Security note

An Upstash Redis password was committed to git history in an early commit
(`30f24a0`). It has been removed from the current codebase, but the history
still contains it. See
[docs/runbooks/secrets.md](docs/runbooks/secrets.md#rotating-the-upstash-redis-password-from-the-original-build-server)
for rotation instructions before making the repo public.

## License

MIT.