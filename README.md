# Vercel Clone (on AWS)

A self-hosted, Vercel-style static site hosting platform. Users authenticate
with GitHub, import a repository, and have it built and served on a subdomain.
The build backend runs as **AWS ECS Fargate** tasks, artifacts are stored in
**S3 + CloudFront**, the queue/cache uses **ElastiCache Redis**, and the
database is **RDS PostgreSQL**. The whole cloud layer is provisioned with
**Terraform**.

## Architecture

```
                   ┌──────────────────────────────────────────┐
   Browser ───────►│  Route53  (*.vercel.example.com)         │
                   └─────────────────────┬─────────────────────┘
                                         │
                  ┌──────────────────────▼────────────────────────┐
                  │ ALB (TLS off)  dashboard / api / edge-proxy      │
                  └──┬───────────┬───────────────┬───────────────┬──┘
                     │           │               │               │
        *.domain ────┘    /api/* ─┘       app host┘               │
                     │           │                                    │
              ┌──────▼─────┐  ┌──▼──────────┐                       │
              │ edge-proxy │  │  dashboard   │                       │
              │ (Express)  │  │  (Next 16)   │                       │
              │ -> CloudFr │  │  NextAuth    │                       │
              └──────┬─────┘  └──────┬───────┘                       │
                     │               │ REST + SSE                    │
                     │               ▼                                │
                     │       ┌───────────────────┐                    │
                     │       │   api-server      │                    │
                     │       │   Hono + Prisma   │  /metrics          │
                     │       └─────┬─────────────┘                    │
                     │             │ RPUSH build_queue                │
                     │             ▼                                   │
                     │       ┌───────────────────┐                    │
                     │       │ orchestrator      │  Brpop + retries   │
                     │       └─────┬─────────────┘                    │
                     │             │ RunTask                           │
                     │             ▼                                   │
                     │       ┌───────────────────┐                    │
                     │       │ ECS Fargate       │                    │
                     │       │ build-agent       │                    │
                     │       │  clone+build+S3    │                    │
                     │       └─────┬─────────────┘                    │
                     │             │                                   │
                     ▼             ▼                                   │
              ┌──────────────────────────┐  ┌────────────────────┐
              │   CloudFront → S3          │  │   ElastiCache Redis │
              │   (deployed artifacts)     │  │   RDS PostgreSQL    │
              └──────────────────────────┘  └────────────────────┘
```

## Services (monorepo)

| Package                              | Runtime | Stack                          | Port | Role                                   |
| ------------------------------------ | ------- | ------------------------------ | ---- | -------------------------------------- |
| `dashboard/`                         | Node    | Next.js 16, React 19, shadcn   | 3000 | Web UI + NextAuth (GitHub OAuth)       |
| `api-server/`                        | Bun     | Hono + Prisma + RDS Postgres    | 3001 | Backend (REST + SSE), dispatches builds|
| `orchestrator/`                      | Bun     | Worker + AWS ECS SDK            | —    | BRPOP queue, RunTask + retries + DLQ   |
| `build-agent/`                       | Bun     | Docker image run on Fargate     | —    | git clone → detect PM → build → S3     |
| `edge-proxy/`                        | Bun     | Express + http-proxy            | 8000 | subdomain → CloudFront reverse proxy   |

## AWS infrastructure (Terraform)

All cloud resources in `infra/terraform/`, provisioned via modules. Region:
`ap-south-2` (Hyderabad). Modules:

`vpc` · `s3` · `kms` · `secrets` · `rds` · `elasticache` · `ecr` · `ecs` ·
`alb` · `acm` · `route53` · `cloudfront` · `cloudwatch`

Workspaces: `default` (dev), `prod` (Multi-AZ RDS, Redis cluster, larger
Fargate tasks, CloudFront with WAF).

## Phased plan

- **Phase 0**  Repo reorganization into a Bun workspace monorepo.
- **Phase 1**  Terraform infra + `docker-compose.yml` for local dev.
- **Phase 2**  Backend (api-server, orchestrator, build-agent).
- **Phase 3**  Frontend (dashboard).
- **Phase 4**  Observability (Prometheus + Grafana + CloudWatch alarms).
- **Phase 5**  CI/CD (GitHub Actions: lint / test / terraform plan / push).
- **Phase 6**  Docs + runbooks.

## Local development

```bash
bun install                                     # installs all workspaces
cp .env.example .env                            # then fill in real values
docker compose up -d postgres redis             # start backing services
bun run dev:api                                 # api-server on :3001
bun run dev:orch                                # orchestrator worker
bun run dev:proxy                                # edge-proxy on :8000
bun run dev:dashboard                            # Next.js on :3000
```

## License

MIT.