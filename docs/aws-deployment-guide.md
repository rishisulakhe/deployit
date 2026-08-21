# Complete AWS Deployment Setup Guide

This guide walks you through deploying the Vercel Clone project on AWS from scratch.

## Prerequisites

Before starting, ensure you have:

1. **AWS Account** with billing enabled
2. **AWS CLI** installed and configured:
   ```bash
   aws --version
   aws configure
   # Enter your AWS Access Key ID, Secret Access Key, region (ap-south-2), and output format (json)
   ```
3. **Docker** installed and running
4. **Bun** installed (v1.3+)
5. **jq** installed (for parsing JSON)
6. **GitHub account** for OAuth

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Your Local Machine                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │Dashboard │  │api-server│  │orchestr. │  │   edge-proxy     │ │
│  │  :3000   │  │  :3001   │  │  :3003   │  │      :8000       │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘ │
│       │             │             │                  │          │
│       │      ┌──────┴──────┐      │                  │          │
│       │      │  PostgreSQL │      │                  │          │
│       │      │   (Docker)  │      │                  │          │
│       │      └─────────────┘      │                  │          │
│       │                           │                  │          │
│       └───────────────────────────┼──────────────────┘          │
│                                   │                             │
└───────────────────────────────────┼─────────────────────────────┘
                                    │
                              ┌─────┴─────┐
                              │   Redis   │
                              │  (Docker) │
                              └───────────┘
                                    
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
              ┌─────┴─────┐   ┌─────┴─────┐   ┌─────┴─────┐
              │  S3 Bucket│   │    ECR    │   │   ECS     │
              │ Artifacts │   │  Docker   │   │  Fargate  │
              │           │   │   Image   │   │  Builds   │
              └───────────┘   └───────────┘   └───────────┘
```

**What runs locally:**
- Dashboard (Next.js)
- API Server (Hono)
- Orchestrator (queue worker)
- Edge Proxy (serves deployed sites)
- PostgreSQL (Docker)
- Redis (Docker)
- Prometheus + Grafana (Docker)

**What runs on AWS:**
- S3 bucket (stores build artifacts)
- ECR repo (stores build-agent Docker image)
- ECS Fargate (runs builds)

---

## Step 1: GitHub OAuth Setup

1. Go to [GitHub OAuth Apps](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Fill in:
   - **Application name**: `Vercel Clone Local`
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: `http://localhost:3000/api/auth/callback/github`
4. Click **Register application**
5. Copy the **Client ID**
6. Click **Generate a new client secret**
7. Copy the **Client Secret**

Save these for `.env`:

```bash
GITHUB_CLIENT_ID="Ov23li..."
GITHUB_CLIENT_SECRET="72c1b2..."
```

---

## Step 2: Run AWS Setup Script

The `scripts/setup-aws.sh` script creates all necessary AWS resources.

```bash
cd /home/rishisulakhe/projects/vercel

# Make sure you're logged in
aws sts get-caller-identity

# Run the setup script
./scripts/setup-aws.sh
```

**What the script creates:**

| Resource | Purpose | Cost |
|----------|---------|------|
| S3 Bucket | Store build artifacts | ~$0.01/GB/month |
| ECR Repository | Store build-agent Docker image | ~$0.10/GB/month |
| ECS Cluster | Orchestrate build tasks | $0 (Fargate pay-per-task) |
| IAM Task Execution Role | Allow ECS to pull images | Free |
| IAM Task Role | Allow build-agent to write to S3 | Free |
| ECS Task Definition | Define build-agent container config | Free |
| CloudWatch Log Group | Store build logs | ~$0.50/GB |

**Script output example:**

```
=== AWS Account: 297155701257 ===
=== Region: ap-south-2 ===

=== 1. Creating S3 bucket: deployit-rishi-artifacts ===
Bucket created.

=== 2. Creating ECR repository: vercel-clone/build-agent ===
ECR repo created.
ECR URI: 297155701257.dkr.ecr.ap-south-2.amazonaws.com/vercel-clone/build-agent

=== 3. Creating ECS cluster: vercel-clone ===
ECS cluster created.

=== 4. Creating IAM roles for ECS tasks ===
Task execution role created.
Task role created with S3 access.

=== 5. Registering ECS task definition ===
Task definition registered.

=== 6. Getting VPC subnet IDs ===
Default VPC: vpc-abc123
Subnets: subnet-aaa,subnet-bbb
Security Group: sg-ccc

==========================================
=== Setup Complete! ===
==========================================

Add these to your .env:

  S3_ARTIFACTS_BUCKET="deployit-rishi-artifacts"
  ECS_CLUSTER="vercel-clone"
  ECS_BUILD_TASK_DEFINITION="vercel-clone-build-agent"
  ECS_BUILD_TASK_SUBNETS="subnet-aaa,subnet-bbb"
  ECS_BUILD_TASK_SECURITY_GROUPS="sg-ccc"
  ECR_REPO="297155701257.dkr.ecr.ap-south-2.amazonaws.com/vercel-clone/build-agent"
```

---

## Step 3: Update .env File

Create/update your `.env` file:

```bash
cp .env.example .env
```

Edit `.env` and ensure these are set:

```bash
# --- GitHub OAuth ---
GITHUB_CLIENT_ID="Ov23liLuiYXJ3T4h87rX"
GITHUB_CLIENT_SECRET="72c1b2b89c687a1b6ce0c6dcf653d2bd18f927dd"
NEXT_PUBLIC_GITHUB_CLIENT_ID="Ov23liLuiYXJ3T4h87rX"
NEXT_PUBLIC_GITHUB_REDIRECT_URI="http://localhost:3000/api/auth/callback/github"
GITHUB_REDIRECT_URI="http://localhost:3000/api/auth/callback/github"
NEXTAUTH_SECRET="bjeOoKTmIIMEmTGch06kUpDVt++uG5T+4xFs1lV2grw="

# --- AWS (from setup-aws.sh output) ---
AWS_REGION="ap-south-2"
S3_ARTIFACTS_BUCKET="deployit-rishi-artifacts"
ECS_CLUSTER="vercel-clone"
ECS_BUILD_TASK_DEFINITION="vercel-clone-build-agent"
ECS_BUILD_TASK_SUBNETS="subnet-aaa,subnet-bbb"
ECS_BUILD_TASK_SECURITY_GROUPS="sg-ccc"
```

**Important:** Keep these as-is for AWS mode:
```bash
S3_ARTIFACTS_BUCKET="deployit-rishi-artifacts"  # NOT "local"
ECS_BUILD_TASK_SUBNETS="subnet-xxx"           # NOT empty
EDGE_PROXY_BACKEND_BASE_URL=""                 # empty = serve from S3 directly
```

---

## Step 4: Build & Push Docker Image

The build-agent runs as a Docker container on ECS Fargate.

```bash
# 1. Get your ECR URI (from setup-aws.sh output or .env)
ECR_URI="297155701257.dkr.ecr.ap-south-2.amazonaws.com/vercel-clone/build-agent"

# 2. Login to ECR
aws ecr get-login-password --region ap-south-2 | \
  docker login --username AWS --password-stdin 297155701257.dkr.ecr.ap-south-2.amazonaws.com

# You should see: "Login Succeeded"

# 3. Build the Docker image
cd build-agent
docker build -t $ECR_URI:latest .

# 4. Push to ECR
docker push $ECR_URI:latest

# 5. Verify the image is pushed
aws ecr describe-images \
  --repository-name vercel-clone/build-agent \
  --region ap-south-2

cd ..
```

**Note:** Rebuild and push whenever you change `build-agent/src/`.

---

## Step 5: Symlink .env for Each Service

Each service needs access to the root `.env`:

```bash
for svc in api-server orchestrator build-agent edge-proxy dashboard; do
  ln -sf ../.env $svc/.env
done
```

Verify:
```bash
ls -la api-server/.env dashboard/.env
# Should show: .env -> ../.env
```

---

## Step 6: Start Local Infrastructure

```bash
# Start PostgreSQL, Redis, Prometheus, Grafana
docker-compose up -d

# Verify all containers are running
docker-compose ps

# You should see 4 healthy containers:
# - vercel-clone-postgres
# - vercel-clone-redis  
# - vercel-clone-prometheus
# - vercel-clone-grafana
```

---

## Step 7: Setup Database

```bash
cd api-server

# Generate Prisma client
bunx prisma generate --schema=prisma/schema.prisma

# Run migrations
bunx prisma migrate deploy --schema=prisma/schema.prisma

# Verify connection
bunx prisma db pull --schema=prisma/schema.prisma

cd ..
```

---

## Step 8: Start All Services

Open **5 terminal windows/tabs** and run one command in each:

**Terminal 1 - API Server:**
```bash
bun run dev:api
# Runs on http://localhost:3001
```

**Terminal 2 - Orchestrator:**
```bash
bun run dev:orch
# Runs on http://localhost:3003
# This will dispatch builds to ECS Fargate
```

**Terminal 3 - Edge Proxy:**
```bash
bun run dev:proxy
# Runs on http://localhost:8000
# Serves deployed sites from S3
```

**Terminal 4 - Dashboard:**
```bash
bun run dev:dashboard
# Runs on http://localhost:3000
```

**Terminal 5 - For other commands:**
Keep free for running tests, builds, etc.

---

## Step 9: Deploy Your First Project

### Via Dashboard UI

1. Open http://localhost:3000
2. Click **Sign in with GitHub**
3. Authorize the app
4. Click **New Project**
5. Select a repository (must be public or your private repo)
6. Configure build settings:
   - **Branch**: `main` (or your default branch)
   - **Build command**: `npm run build` (or `pnpm build`, `yarn build`)
   - **Output directory**: `dist` (Vite default) or `build` (Create React App)
   - **Root directory**: `.` (or subdirectory if monorepo)
7. Click **Deploy**
8. Watch the live build logs
9. When status = **SUCCESS**, click **Visit**

Your deployed site: `http://localhost:8000/<project-slug>/`

### Via API (for automation)

```bash
# 1. Get auth token by signing in
# (This requires getting a GitHub OAuth code - use the dashboard for first-time setup)

# 2. Create project
curl -X POST http://localhost:3001/projects \
  -H "Authorization: Bearer <your-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Test App",
    "slug": "my-test-app",
    "repoOwner": "your-github-username",
    "repoName": "your-repo-name",
    "branch": "main",
    "buildCommand": "npm run build",
    "buildDir": "dist"
  }'

# 3. Trigger deployment
curl -X POST http://localhost:3001/projects/<project-id>/deployments \
  -H "Authorization: Bearer <your-jwt-token>"
```

---

## Step 10: Verify Everything Works

### Check Services Health

```bash
# API Server
curl http://localhost:3001/healthz
# {"ok":true,"service":"api-server","ts":...}

# Edge Proxy
curl http://localhost:8000/healthz
# {"ok":true,"service":"edge-proxy","ts":...}

# Orchestrator Metrics
curl http://localhost:3003/metrics
# Prometheus metrics output

# Database Connection
docker exec vercel-clone-postgres psql -U vercel -d vercel -c "SELECT count(*) FROM \"Project\";"
```

### Check AWS Resources

```bash
# S3 Bucket exists
aws s3 ls s3://deployit-rishi-artifacts --region ap-south-2

# Check for uploaded artifacts after a build
aws s3 ls s3://deployit-rishi-artifacts/projects/ --recursive --region ap-south-2

# ECR Image
aws ecr describe-images \
  --repository-name vercel-clone/build-agent \
  --region ap-south-2

# ECS Cluster
aws ecs describe-clusters \
  --clusters vercel-clone \
  --region ap-south-2

# Recent ECS Tasks (after a build)
aws ecs list-tasks \
  --cluster vercel-clone \
  --region ap-south-2
```

### Check Logs

```bash
# Build logs in CloudWatch (after deployment)
aws logs tail /ecs/vercel-clone/build-agent \
  --region ap-south-2 \
  --since 5m

# Or via Redis
redis-cli SUBSCRIBE logs:<deployment-id>
```

---

## How It Works

### Build Flow (AWS Mode)

```
1. User clicks Deploy
2. api-server creates Deployment row (status=QUEUED)
3. api-server RPUSH to Redis build_queue
4. orchestrator BRPOP from queue
5. orchestrator calls ECS RunTask (Fargate)
6. ECS pulls build-agent image from ECR
7. build-agent container starts:
   - git clone repo
   - detect package manager (npm/yarn/pnpm)
   - install dependencies
   - run build command
   - upload artifacts to S3
   - publish logs to Redis pub/sub
8. orchestrator polls ECS for task completion
9. On success: status=SUCCESS
10. edge-proxy serves from S3
```

### Request Flow

```
Browser → localhost:8000/<slug>/
        → edge-proxy (slug lookup in DB)
        → edge-proxy reads from S3
        → returns static files (HTML/JS/CSS/images)
```

---

## Cost Breakdown

| Resource | Configuration | Monthly Cost |
|----------|--------------|--------------|
| S3 | 1GB artifacts | ~$0.01 |
| ECR | 1GB Docker image | ~$0.10 |
| ECS Fargate | 1 vCPU, 2GB, ~50 builds/month @ 5min each | ~$1.00 |
| CloudWatch Logs | 1GB/month | ~$0.50 |
| Data Transfer | ~10GB/month | ~$0.90 |
| **Total** | | **~$2.50/month** |

**Ways to reduce cost:**
- Use smaller ECS task (256 CPU / 512 MB) for simple builds
- Reduce build timeout in .env
- Delete old S3 artifacts manually
- Use local mode for development

---

## Troubleshooting

### Build stays in QUEUED

Check orchestrator is running and can reach ECS:
```bash
curl http://localhost:3003/metrics | grep ecs
```

### Build FAILED after retries

Check ECS task logs:
```bash
aws logs tail /ecs/vercel-clone/build-agent \
  --region ap-south-2 \
  --since 30m
```

Check DLQ:
```bash
redis-cli LRANGE build_dlq 0 -1
```

### Timeout waiting for S3

If build-agent logs show "Waiting for S3 upload":
- Check ECS task has S3 permissions (IAM role)
- Check bucket exists: `aws s3 ls s3://deployit-rishi-artifacts`

### Docker push fails

Make sure you're logged in:
```bash
aws ecr get-login-password --region ap-south-2 | \
  docker login --username AWS --password-stdin 297155701257.dkr.ecr.ap-south-2.amazonaws.com
```

### GitHub auth fails

Verify `.env` has both:
```bash
GITHUB_CLIENT_ID="..."        # For server
NEXT_PUBLIC_GITHUB_CLIENT_ID="..."  # For client
```

And that symlinks exist:
```bash
ls -la dashboard/.env api-server/.env
```

---

## Cleanup (Stop Charges)

When done testing, remove AWS resources:

```bash
# Delete S3 bucket contents
aws s3 rm s3://deployit-rishi-artifacts --recursive --region ap-south-2

# Delete ECS service/cluster
aws ecs delete-cluster --cluster vercel-clone --region ap-south-2

# Delete ECR repo
aws ecr delete-repository \
  --repository-name vercel-clone/build-agent \
  --force \
  --region ap-south-2

# Delete IAM roles
aws iam delete-role-policy \
  --role-name vercel-clone-task-role \
  --policy-name VercelCloneS3Policy
aws iam delete-role --role-name vercel-clone-task-role
aws iam detach-role-policy \
  --role-name vercel-clone-task-exec-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
aws iam delete-role --role-name vercel-clone-task-exec-role

# Delete CloudWatch log group
aws logs delete-log-group \
  --log-group-name /ecs/vercel-clone/build-agent \
  --region ap-south-2

# Delete task definition (requires deregistering all revisions)
aws ecs list-task-definitions --family-prefix vercel-clone-build-agent
# Then for each revision:
aws ecs deregister-task-definition \
  --task-definition vercel-clone-build-agent:N \
  --region ap-south-2
```

---

## Switching Back to Local Mode

To use local mode (no AWS) after setting up AWS:

```bash
# Edit .env
S3_ARTIFACTS_BUCKET="local"
ECS_BUILD_TASK_SUBNETS=""
ECS_BUILD_TASK_SECURITY_GROUPS=""

# Restart orchestrator (it will now spawn subprocesses)
bun run dev:orch
```

---

## Next Steps

- Set up a custom domain (requires ALB + Route53)
- Add CloudFront CDN for faster global serving
- Set up monitoring/alerting in Grafana
- Configure CI/CD to auto-build/push Docker images

---

## Summary

You now have:
- ✅ GitHub OAuth working
- ✅ S3 bucket for artifact storage
- ✅ ECR repository with build-agent Docker image
- ✅ ECS cluster for running builds on Fargate
- ✅ Local PostgreSQL + Redis for app state
- ✅ Dashboard for deploying projects
- ✅ Edge proxy serving deployed sites

Total setup time: ~30 minutes
Ongoing cost: ~$2-3/month for occasional builds
