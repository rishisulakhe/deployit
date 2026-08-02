# Terraform — Vercel Clone on AWS

All AWS infrastructure for the platform is provisioned here. The layout is a
consumer-style set of modules in `modules/` wired together by `main.tf`.
Region: `ap-south-2` (Mumbai-Hyderabad).

## Module map

| Module         | Creates                                                                 |
| -------------- | ----------------------------------------------------------------------- |
| `vpc`          | VPC, 2-AZ public + private subnets, IGW, single NAT GW, route tables     |
| `kms`          | Customer-managed CMK with shared service/principal access                |
| `s3`           | Artifacts bucket (SSE-KMS, versioning, block-public, lifecycle rules)     |
| `cloudfront`   | CloudFront distribution in front of the S3 artifacts (OAC, SPA fallback) |
| `rds`          | PostgreSQL 16 (single-AZ dev, Multi-AZ prod), SG-restricted             |
| `elasticache`  | Redis 7 (single node dev, cluster-enabled prod), SG-restricted          |
| `ecr`          | One ECR repo per service, image-tag count lifecycle policy                |
| `ecs`          | Fargate cluster + `build-agent` task definition + IAM execution/task roles |
| `alb`          | ALB with HTTP/HTTPS listeners, 3 target groups (dashboard/api/proxy)    |
| `cloudwatch`   | One log group per service + metric alarms (queue depth, build failures)  |

ACM (wildcard TLS) and Route53 modules are deferred until a domain is owned —
the ALB ships HTTP-only in dev. When a real domain is available, set
`dashboard_domain` and `dashboard_acm_cert_arn` and uncomment the `acm` /
`route53` modules in `main.tf`.

## One-time bootstrap (state backend)

The S3 state bucket + DynamoDB lock table can't be created by Terraform, so
they are bootstrapped by hand ONCE. Run from any host with `awscli` configured
for `ap-south-2`:

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

Then `terraform init` will pick up `backend.tf` as-is.

## Apply flow

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars          # then tweak values
terraform init
terraform workspace new dev                            # one-time per env
terraform plan
terraform apply
```

For prod, switch to the prod workspace and override sizing:

```bash
terraform workspace new prod
# terraform.tfvars: env="prod", rds_multi_az=true, redis_cluster_mode=true,
#                   rds_instance_class="db.r6g.large", redis_node_type="cache.r6g.large",
#                   az_count=3, dashboard_domain="vercel.example.com"
terraform plan
terraform apply
```

## What each `output` is used for by the apps

| Output                       | Consumed by                       | Env var                 |
| ---------------------------- | --------------------------------- | ----------------------- |
| `s3_artifacts_bucket_name`   | build-agent, edge-proxy           | `S3_ARTIFACTS_BUCKET`    |
| `cloudfront_distribution_domain` | edge-proxy                    | `CLOUDFRONT_DOMAIN`     |
| `rds_endpoint`               | api-server                        | `DATABASE_URL`         |
| `redis_endpoint`             | api-server, orchestrator, edge-proxy | `REDIS_URL`          |
| `ecr_repository_urls`         | CI/CD push step                   | —                       |
| `ecs_cluster_name`            | orchestrator `RunTask` calls     | `ECS_CLUSTER`           |
| `ecs_build_task_definition_arn` | orchestrator `RunTask` calls   | `ECS_BUILD_TASK_DEFINITION` |
| `alb_dns_name`                | DNS / dashboard URL              | `NEXT_PUBLIC_API_BASE` etc. |
| `kms_key_id`                 | api-server (encrypts tokens + env vars) | `KMS_KEY_ID`        |

A Phase 5 CI/CD step renders these into `.env` and config files per service.