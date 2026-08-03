# Runbook — Terraform (AWS Provisioning)

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

## Dev workspace

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform workspace new dev       # one-time
terraform plan
terraform apply
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

Copy these into the `.env` files for each service.

## Tearing down

```bash
terraform destroy
docker compose down -v
aws s3 rb s3://vercel-clone-tfstate --force
aws dynamodb delete-table --table-name vercel-clone-tfstate-lock
```