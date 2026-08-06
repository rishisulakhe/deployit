# Runbook — Deploying a Project

## Via the Dashboard UI

1. Sign in at http://localhost:3000 (or your prod URL) with GitHub.
2. Click **New Project**.
3. Search and select a GitHub repository.
4. Configure:
   - **Project name** — display name
   - **Subdomain (slug)** — becomes `<slug>.app`
   - **Branch** — which branch to build (default: `main`)
   - **Root Directory** — if the project is in a subdirectory
   - **Build Command** — default `npm run build`
   - **Output Directory** — default `dist`
   - **Visibility** — Private (default) or Public
5. Click **Deploy**.
6. Watch live build logs on the deployment page (SSE stream).
7. Once status = SUCCESS, click **Visit** to view the deployed site.

> In **local mode**, the deployed site URL is `http://localhost:8000/<slug>/`.
> In **AWS mode**, it's `https://<slug>.<your-domain>` (or via the ALB).

## Via the API (curl)

```bash
# 1. Sign in to get a JWT
TOKEN=$(curl -s -X POST http://localhost:3001/auth/github \
  -H 'Content-Type: application/json' \
  -d '{"code":"<github-oauth-code>"}' | jq -r .token)

# 2. Create a project
PROJECT_ID=$(curl -s -X POST http://localhost:3001/projects \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "My App",
    "slug": "my-app",
    "repoOwner": "your-username",
    "repoName": "your-repo",
    "branch": "main",
    "buildCommand": "npm run build",
    "buildDir": "dist",
    "private": true
  }' | jq -r .project.id)

# 3. Trigger a deployment
curl -X POST http://localhost:3001/projects/$PROJECT_ID/deployments \
  -H "Authorization: Bearer $TOKEN"

# 4. Stream build logs (SSE)
curl -N http://localhost:3001/deployments/<deployment-id>/logs/stream?token=$TOKEN
```

## What happens behind the scenes

### AWS mode

```
dashboard → api-server → Redis queue → orchestrator
  → ECS Fargate build-agent → git clone → install → build → S3
  → edge-proxy serves it on <slug>.<domain>
```

### Local mode

```
dashboard → api-server → Redis queue → orchestrator
  → bun subprocess (build-agent) → git clone → install → build → /tmp/
  → edge-proxy serves it on localhost:8000/<slug>/
```

Logs stream from the build-agent to Redis pub/sub → api-server SSE → dashboard.

## Troubleshooting

### Build stays in QUEUED

The orchestrator may not be running. Check:
```bash
curl http://localhost:3003/metrics | grep queue_depth
```

### Build FAILED after retries

Check the DLQ for the job:
```bash
redis-cli LRANGE build_dlq 0 -1
```

Check ECS task logs in CloudWatch (AWS mode) or the orchestrator stdout (local mode).

### Deployed site returns 404

1. Verify the deployment status is SUCCESS in the dashboard.
2. Check edge-proxy is healthy:
   ```bash
   curl http://localhost:8000/healthz
   ```
3. In **local mode**, verify artifacts exist:
   `ls /tmp/vercel-clone-artifacts/projects/<projectId>/<deploymentId>/`
   In **AWS mode**, check S3 for the same path.
4. Check the slug matches: `redis-cli GET edge:slug:<your-slug>`
5. If private, the edge-proxy will return 404 by design.