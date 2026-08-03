# Architecture

## Overview

A self-hosted Vercel-style static site deployment platform on AWS. Users sign
in with GitHub, import a repository, and the platform builds it as an ECS
Fargate task, stores the artifacts in S3 (behind CloudFront), and serves them
on a subdomain via a reverse proxy.

## System Diagram

```mermaid
graph TB
    subgraph "Public Edge"
        ALB[ALB — TLS terminator<br/>path-based routing]
    end

    subgraph "Dashboard"
        DASH[Next.js 16<br/>shadcn UI<br/>:3000]
    end

    subgraph "API Layer"
        API[api-server<br/>Hono + Prisma<br/>:3001]
    end

    subgraph "Build Pipeline"
        QUEUE[(Redis<br/>build_queue)]
        ORCH[orchestrator<br/>BRPOP worker<br/>:3002 metrics]
        ECS[ECS Fargate<br/>build-agent task]
    end

    subgraph "Edge Serving"
        PROXY[edge-proxy<br/>Express :8000]
        CF[CloudFront<br/>CDN]
    end

    subgraph "Data Plane"
        RDS[(RDS PostgreSQL 16)]
        REDIS[(ElastiCache Redis 7)]
        S3[(S3 artifacts)]
    end

    subgraph "Observability"
        PROM[Prometheus]
        GRAF[Grafana]
        CW[CloudWatch<br/>alarms + logs]
    end

    Browser -->|*.app.domain| ALB
    Browser -->|app.domain| ALB
    ALB -->|/| DASH
    ALB -->|/api/*| API
    ALB -->|*.domain| PROXY

    DASH -->|REST + SSE| API
    API -->|Prisma| RDS
    API -->|RPUSH| QUEUE

    ORCH -->|BRPOP| QUEUE
    ORCH -->|RunTask| ECS
    ORCH -->|SQL status| RDS

    ECS -->|git clone| GitHub[(GitHub)]
    ECS -->|upload artifacts| S3
    ECS -->|publish logs| REDIS

    PROXY -->|slug lookup| RDS
    PROXY -->|cache| REDIS
    PROXY -->|reverse proxy| CF
    CF -->|fetch| S3

    API -->|/metrics| PROM
    ORCH -->|/metrics| PROM
    PROXY -->|/metrics| PROM
    PROM --> GRAF

    ECS -->|stdout| CW
    ORCH -->|alarms| CW
```

## Services

| Service | Runtime | Framework | Port | Role |
|---|---|---|---|---|
| `dashboard/` | Node 22 | Next.js 16 + React 19 + shadcn | 3000 | Web UI, GitHub OAuth callback, SSE log viewer |
| `api-server/` | Bun | Hono + Prisma 6 | 3001 | REST API + SSE: auth, projects, deployments, env-vars |
| `orchestrator/` | Bun | Worker script | 3002 | BRPOP queue → ECS RunTask → retry/DLQ → status updates |
| `build-agent/` | Bun | CLI (Fargate task) | — | git clone → detect PM → build → S3 upload → Redis logs |
| `edge-proxy/` | Bun | Express 5 + http-proxy | 8000 | subdomain → RDS lookup → CloudFront reverse proxy |

## Data Flow — Deploy Lifecycle

```
1. User clicks "Deploy" in dashboard
2. Dashboard → POST /api/projects/:id/deployments
3. api-server:
   - creates Deployment row (status=QUEUED) in RDS
   - decrypts user's GitHub token (KMS)
   - RPUSH build_queue {deploymentId, repo, branch, buildConfig, envVars, token}
4. orchestrator:
   - BRPOP build_queue
   - ecs:RunTask (Fargate) with env vars injected
   - updates Deployment status=RUNNING
   - polls DescribeTasks until STOPPED or 15-min timeout
5. build-agent (inside Fargate task):
   - git clone --depth 1 --branch <branch> <repo>
   - detect PM (pnpm-lock.yaml | yarn.lock | package-lock.json)
   - <pm> install && <pm> run build
   - walk BUILD_DIR → upload each file to S3 under projects/<projectId>/<deploymentId>/
   - publish each log line to Redis pub/sub channel logs:<deploymentId>
6. orchestrator:
   - on exit code 0 → status=SUCCESS
   - on non-zero → retry (up to 3 attempts) → DLQ
7. edge-proxy:
   - request hits *.domain → extract subdomain (slug)
   - Redis cache lookup (120s TTL) → RDS fallback
   - resolve latest SUCCESS deployment
   - reverse proxy to CloudFront → S3
   - strip AWS/cloud headers, white-label as vercel-clone-edge
8. dashboard SSE:
   - EventSource to /api/deployments/:id/logs/stream?token=<jwt>
   - api-server replays existing BuildLog rows from RDS
   - then forwards Redis pub/sub messages in real-time
```

## AWS Infrastructure (Terraform)

All provisioned via Terraform modules in `infra/terraform/modules/`:

| Module | Resources |
|---|---|
| `vpc` | VPC, 2-AZ public+private subnets, IGW, NAT GW |
| `kms` | Customer-managed CMK (S3 SSE + app secrets + RDS + ECR) |
| `s3` | Artifacts bucket (versioned, SSE-KMS, block-public, lifecycle) |
| `cloudfront` | CDN distribution with OAC, SPA fallback, PriceClass_200 |
| `rds` | PostgreSQL 16 (Single-AZ dev / Multi-AZ prod), SG-restricted |
| `elasticache` | Redis 7 (single-node dev / cluster-mode prod) |
| `ecr` | 5 repos with lifecycle policies (prune untagged >1d, keep 50 tags) |
| `ecs` | Fargate cluster + build-agent task definition + IAM roles |
| `alb` | ALB with HTTP listener (dev) / HTTPS redirect (prod), 3 target groups |
| `cloudwatch` | Log groups per service + 7 metric alarms + SNS alert topic |

Workspaces: `dev` (single-AZ, no TLS) and `prod` (Multi-AZ RDS, Redis cluster,
ACM wildcard cert, Route53 records).

## Security

- **GitHub tokens**: encrypted at rest with KMS (`User.encryptedToken`, `Bytes` column)
- **Project env vars**: encrypted at rest with KMS (`EnvVar.encryptedValue`, `Bytes` column)
- **Session JWT**: httpOnly cookie, 7-day TTL, signed with `JWT_SECRET`
- **S3**: block-all-public, SSE-KMS, accessed only via CloudFront OAC or IAM role
- **RDS / ElastiCache**: private subnets only, SG-restricted to ECS task SG
- **ECS task role**: scoped to S3 PutObject + KMS Decrypt + SSM GetParameter only
- **CI/CD**: AWS OIDC for keyless auth (no long-lived AWS keys in GitHub secrets)

## Decision Log

| Decision | Rationale |
|---|---|
| Bun over Node | Faster startup, smaller Docker images, native TS support. Build-agent benefits most (ephemeral Fargate cold-start) |
| Hono over Express for api-server | Types-first, smaller, modern. Express kept for edge-proxy (http-proxy ecosystem) |
| ECS Fargate over dockerode-on-host | Serverless build jobs — no host to manage, auto-scales, pay-per-second. DeployIt's single-host Docker approach doesn't scale |
| Separate api-server over Next.js server actions | Decoupled backend scales/deploys/observes independently. DeployIt bundled everything in Next.js |
| Retry + DLQ | DeployIt's biggest gap — failed builds were silently lost. We retry 3× then dead-letter |
| SSE over polling for logs | Real-time UX without polling overhead. DeployIt polled every 5s |
| Prisma + raw pg | Prisma for api-server (types, migrations). Raw pg for orchestrator/edge-proxy (lightweight, no codegen) |
| KMS encryption for secrets | DeployIt stored GitHub tokens and env vars in plaintext. We encrypt at rest |
| Terraform IaC | DeployIt had zero IaC. Full Terraform with modules, workspaces, and CI integration |
| CloudFront in front of S3 | CDN caching, SPA fallback, OAC (no bucket public access). DeployIt proxied S3 directly |
| Auto-detect PM (npm/yarn/pnpm) | DeployIt hard-coded `npm install`. We detect lockfiles and use the right tool |
| Prometheus + Grafana + CloudWatch | Three-tier observability: app metrics (Prom), dashboards (Grafana), infra alarms (CloudWatch) |

## Comparison with DeployIt

| | DeployIt | Vercel Clone (this project) |
|---|---|---|
| Cloud | Azure (manual) | AWS (Terraform IaC) |
| Build agent | Single Docker host (dockerode) | AWS ECS Fargate (serverless) |
| Build retries | None | 3× with DLQ |
| Package manager | npm only | Auto-detect pnpm/yarn/npm |
| Secrets | Plaintext in DB | KMS-encrypted at rest |
| Live logs | Polling (5s interval) | SSE (real-time) |
| Backend | Bundled in Next.js (server actions) | Separate Hono api-server |
| IaC | None | Terraform (10 modules, 2 workspaces) |
| Observability | None | Prometheus + Grafana + CloudWatch alarms |
| CI/CD | Pre-commit hook | GitHub Actions (lint + terraform + build-push) |
| CDN | Direct S3 proxy | CloudFront + OAC |
| Build timeout | 2 minutes | 15 minutes |