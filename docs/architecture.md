# Architecture

## Overview

A self-hosted Vercel-style static site deployment platform. Users sign in with
GitHub, import a repository, and the platform builds it. Builds run as ECS
Fargate tasks (AWS mode) or local subprocesses (local mode), artifacts are stored
in S3 or `/tmp/`.

## System Diagram

```mermaid
graph TB
    subgraph Dashboard
        DASH["Next.js 16<br/>shadcn UI<br/>:3000"]
    end

    subgraph API["API Layer"]
        API["api-server<br/>Hono + Prisma<br/>:3001"]
    end

    subgraph Pipeline["Build Pipeline"]
        QUEUE[(Redis<br/>build_queue)]
        ORCH["orchestrator<br/>BRPOP worker<br/>:3003"]
        ECS["ECS Fargate<br/>(or subprocess)"]
    end

    subgraph Edge["Edge Serving"]
        PROXY["edge-proxy<br/>Express :8000"]
        S3[(S3 or /tmp)]
    end

    subgraph Data["Data Plane"]
        PG[(PostgreSQL)]
        REDIS[(Redis)]
    end

    DASH -->|REST + SSE| API
    API -->|Prisma| PG
    API -->|RPUSH| QUEUE
    ORCH -->|BRPOP| QUEUE
    ORCH -->|RunTask/spawn| ECS
    ECS -->|git clone| GitHub[(GitHub)]
    ECS -->|upload| S3
    PROXY -->|slug lookup| PG
    PROXY -->|serve| S3
```

## Services

| Service | Runtime | Port | Role |
|---|---|---|---|
| `dashboard/` | Node 22 | 3000 | Web UI, GitHub OAuth, SSE logs |
| `api-server/` | Bun | 3001 | REST API + SSE |
| `orchestrator/` | Bun | 3003 | Queue → ECS or subprocess |
| `build-agent/` | Bun | — | git clone → build → upload |
| `edge-proxy/` | Bun | 8000 | Subdomain/path routing |

## Data Flow — Deploy Lifecycle

```
1. User clicks "Deploy"
2. Dashboard → POST /api/projects/:id/deployments
3. api-server:
   - creates Deployment (status=QUEUED)
   - RPUSH build_queue {deploymentId, repo, ...}
4. orchestrator:
   - BRPOP build_queue
   - if ECS_SUBNETS set: ecs:RunTask
   - else: spawn build-agent subprocess
   - update status=RUNNING
5. build-agent:
   - git clone
   - detect PM → install → build
   - if S3_BUCKET="local": write to /tmp/
   - else: upload to S3
   - publish logs to Redis pub/sub
6. orchestrator:
   - on exit 0: status=SUCCESS
   - on non-zero: retry (up to 3) → DLQ
7. edge-proxy:
   - request hits /<slug>/
   - lookup project by slug → resolve deployment
   - serve from S3 or /tmp/
```

## Security

- **GitHub tokens**: stored as base64 in DB (demo only — not encrypted)
- **Session JWT**: httpOnly cookie, 7-day TTL
- **S3**: private bucket, accessed via IAM role
- **ECS task role**: scoped to S3 PutObject only

## Decision Log

| Decision | Rationale |
|---|---|
| Bun over Node | Faster startup, smaller images, native TS |
| Hono over Express | Types-first, modern, smaller |
| ECS Fargate | Serverless builds, auto-scales |
| Local subprocess fallback | Zero-cost dev mode |
| Separate api-server | Independent scaling/deploys |
| SSE for logs | Real-time, no polling |
| Prisma + raw pg | Type-safe + lightweight options |
| No Terraform | Simpler setup — single shell script |

## Comparison with DeployIt

| | DeployIt | Vercel Clone |
|---|---|---|
| Cloud | Azure (manual) | AWS (simple CLI) |
| Build agent | Single Docker host | ECS Fargate |
| Build retries | None | 3× with DLQ |
| Package manager | npm only | Auto-detect |
| Live logs | Polling (5s) | SSE |
| Backend | Bundled | Separate api-server |
| Observability | None | Prometheus + Grafana |
