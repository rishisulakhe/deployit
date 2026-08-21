# Runbook — Deploying a Project

## Via Dashboard

1. Sign in at http://localhost:3000
2. Click **New Project**
3. Select a GitHub repo
4. Configure build settings
5. Click **Deploy**
6. Watch live logs
7. Click **Visit** when status = SUCCESS

## Via API

```bash
# Get token
TOKEN=$(curl -s -X POST http://localhost:3001/auth/github \
  -H 'Content-Type: application/json' \
  -d '{"code":"<github-code>"}' | jq -r .token)

# Create project
PROJECT_ID=$(curl -s -X POST http://localhost:3001/projects \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"My App","slug":"my-app",...}' | jq -r .project.id)

# Trigger deployment
curl -X POST http://localhost:3001/projects/$PROJECT_ID/deployments \
  -H "Authorization: Bearer $TOKEN"

# Stream logs
curl -N http://localhost:3001/deployments/<id>/logs/stream?token=$TOKEN
```

## Troubleshooting

### Build stays QUEUED

Check orchestrator is running: `curl localhost:3003/metrics`

### Build FAILED

Check DLQ: `redis-cli LRANGE build_dlq 0 -1`

### 404 on deployed site

- Verify status is SUCCESS
- Check edge-proxy: `curl localhost:8000/healthz`
- Verify slug: `redis-cli GET edge:slug:<slug>`
