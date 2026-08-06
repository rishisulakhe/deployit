# Runbook — Terraform (AWS Provisioning)

## Lifecycle overview

```
bootstrap (one-time) → init → apply → build & push image → update .env → use
                                                                        ↓
                                                              destroy (stop charges)
                                                                        ↓
                                                            reset .env to local mode
```

## One-time bootstrap (state backend)

The S3 state bucket + DynamoDB lock table can't be created by Terraform.
Run ONCE from any host with `awscli` configured for `ap-south-2`:

```bash
REGION=ap-south-2
STATE_BUCKET=vercel-clone-tfstate
LOCK_TABLE=vercel-clone-tfstate-lock

aws s3api create-bucket \
  --bucket "$STATE_BUCKET" --region "$REGION" \
  --create-bucket-configuration LocationConstraint="$REGION"

aws s3api put-bucket-versioning \
  --bucket "$STATE_BUCKET" \
  --versioning-configuration Status=Enabled

aws s3api put-bucket-encryption --bucket "$STATE_BUCKET" \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

aws s3api put-public-access-block --bucket "$STATE_BUCKET" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

aws dynamodb create-table \
  --table-name "$LOCK_TABLE" --region "$REGION" \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

## Provision infrastructure (apply)

```bash
cd infra/terraform

# One-time: create dev workspace
terraform workspace new dev       # skip if already exists

# Initialize (downloads providers, connects to S3 backend)
terraform init

# Preview changes
terraform plan

# Provision everything (~10 min)
terraform apply -auto-approve
```

This creates 82+ resources: VPC, subnets, NAT gateway, KMS key, S3 bucket,
CloudFront distribution, RDS PostgreSQL, ElastiCache Redis, ECR repos,
ECS cluster + task definition, ALB, CloudWatch alarms + SNS topic.

## Build & push the build-agent Docker image

The build-agent runs as a Docker container on ECS Fargate. After the first
`terraform apply`, you need to build and push the image to ECR:

```bash
# Get the ECR URI from Terraform outputs
cd infra/terraform
ECR_URI=$(terraform output -raw ecr_repository_urls | jq -r '."build-agent"')
echo $ECR_URI
# → 297155701257.dkr.ecr.ap-south-2.amazonaws.com/vercel-clone-dev-build-agent

# Login to ECR
aws ecr get-login-password --region ap-south-2 | \
  docker login --username AWS --password-stdin \
  297155701257.dkr.ecr.ap-south-2.amazonaws.com

# Build & push
cd ../build-agent   # or cd ../../build-agent from infra/terraform
docker build -t $ECR_URI:latest .
docker push $ECR_URI:latest
```

> **Rebuild after code changes**: any change to `build-agent/src/` requires
> rebuilding and pushing the image before ECS will pick it up.

## Update .env with Terraform outputs

After `terraform apply`, capture the outputs and update `.env`:

```bash
cd infra/terraform
terraform output
```

Key outputs to copy into the project root `.env`:

| Terraform output | .env variable | Example value |
|---|---|---|
| `s3_artifacts_bucket_name` | `S3_ARTIFACTS_BUCKET` | `vercel-clone-dev-artifacts` |
| `cloudfront_distribution_domain` | `CLOUDFRONT_DOMAIN` | `d123abc.cloudfront.net` |
| `cloudfront_distribution_domain` | `EDGE_PROXY_BACKEND_BASE_URL` | `https://d123abc.cloudfront.net` |
| `private_subnet_ids` | `ECS_BUILD_TASK_SUBNETS` | `subnet-abc123,subnet-def456` |
| (from AWS console or output) | `ECS_BUILD_TASK_SECURITY_GROUPS` | `sg-abc123` |
| `kms_key_id` | `KMS_KEY_ID` | `arn:aws:kms:ap-south-2:...:key/...` |
| `redis_endpoint` | `ECS_REDIS_URL` | `redis://vercel-clone-dev.xxx.cache.amazonaws.com:6379` |

After updating `.env`, restart all services.

## What the outputs give you

After `terraform output`:

```
s3_artifacts_bucket_name  = "vercel-clone-dev-artifacts"
cloudfront_distribution_domain = "d123abc.cloudfront.net"
rds_endpoint              = "vercel-clone-dev.xxx.ap-south-2.rds.amazonaws.com:5432"
redis_endpoint            = "vercel-clone-dev.xxx.0001.ap-south-2.cache.amazonaws.com"
ecr_repository_urls       = {"api-server" = "...", "build-agent" = "...", ...}
ecs_cluster_name           = "vercel-clone-dev"
ecs_build_task_definition_arn = "arn:aws:ecs:..."
alb_dns_name               = "vercel-clone-dev-alb-xxx.ap-south-2.elb.amazonaws.com"
kms_key_id                = "arn:aws:kms:ap-south-2:...:key/..."
sns_alerts_topic_arn      = "arn:aws:sns:ap-south-2:...:vercel-clone-dev-alerts"
```

## Using AWS mode

After `terraform apply` + ECR push + `.env` update, restart all services:

```bash
bun run dev:api        # connects to RDS (if you have SSM tunnel) or local Postgres
bun run dev:orch       # dispatches to real ECS Fargate
bun run dev:proxy      # proxies to real CloudFront
bun run dev:dashboard  # Next.js
```

> **Note on RDS access**: RDS and ElastiCache are in private subnets. To
> connect api-server/orchestrator from your local machine, you need an SSM
> port-forward tunnel through a bastion EC2. Without the Session Manager
> Plugin (no sudo), you can still use local Docker Postgres for the api-server
> while orchestrator dispatches real ECS builds. The build-agent inside ECS
> can reach RDS/ElastiCache directly.

## Tearing down (stop charges)

**Run this when you're done testing for the day.** It destroys all AWS
resources (~5 min) and stops all charges:

```bash
cd infra/terraform
terraform destroy -auto-approve
```

After destroying, switch `.env` back to local mode:

```
S3_ARTIFACTS_BUCKET="local"
ECS_BUILD_TASK_SUBNETS=""
EDGE_PROXY_BACKEND_BASE_URL=""
CLOUDFRONT_DOMAIN=""
KMS_KEY_ID=""
ECS_REDIS_URL=""
```

Restart services and you're back in local-only mode ($0).

### Full cleanup (including state backend)

Only do this if you're completely done with the project:

```bash
cd infra/terraform
terraform destroy -auto-approve
aws s3 rb s3://vercel-clone-tfstate --force
aws dynamodb delete-table --table-name vercel-clone-tfstate-lock --region ap-south-2
```

## Prod workspace

```bash
terraform workspace new prod
# Edit terraform.tfvars:
#   env = "prod"
#   rds_multi_az = true
#   redis_cluster_mode = true
#   rds_instance_class = "db.r6g.large"
#   redis_node_type = "cache.r6g.large"
#   az_count = 3
#   dashboard_domain = "vercel.example.com"
#   dashboard_acm_cert_arn = "arn:aws:acm:ap-south-2:123456789012:certificate/..."
terraform plan
terraform apply
```

## CI/CD integration

The `terraform.yml` GitHub Actions workflow runs `plan` on PRs and `apply`
on merge to main. Required secrets:

- `AWS_ROLE_TO_ASSUME` — IAM role ARN with OIDC trust for `repo:org/vercel:*`
- `TF_STATE_BUCKET` — the state bucket name (replaces the hardcoded default in backend.tf)
- `TF_STATE_LOCK_TABLE` — the lock table name