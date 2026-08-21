#!/bin/bash
# One-time AWS setup for Vercel Clone
# Run this script to create: S3 bucket, ECR repo, ECS cluster, IAM roles
#
# Prerequisites:
#   - AWS CLI configured (aws configure)
#   - jq installed
#   - Docker installed (for building/pushing images)
#
# Usage:
#   ./scripts/setup-aws.sh [--region ap-south-2] [--bucket vercel-clone-artifacts]
#
# After running, update your .env with the output values.

set -e

# Configurable defaults
REGION="${AWS_REGION:-ap-south-2}"
BUCKET_NAME="${BUCKET_NAME:-vercel-clone-artifacts}"
ECR_REPO="${ECR_REPO:-vercel-clone/build-agent}"
ECS_CLUSTER="${ECS_CLUSTER:-vercel-clone}"

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --region) REGION="$2"; shift 2 ;;
    --bucket) BUCKET_NAME="$2"; shift 2 ;;
    --help) echo "Usage: $0 [--region REGION] [--bucket BUCKET_NAME]"; exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "=== AWS Account: $AWS_ACCOUNT_ID ==="
echo "=== Region: $REGION ==="
echo ""

# 1. Create S3 bucket for artifacts
echo "=== 1. Creating S3 bucket: $BUCKET_NAME ==="
if aws s3api head-bucket --bucket "$BUCKET_NAME" --region "$REGION" 2>/dev/null; then
  echo "Bucket already exists, skipping..."
else
  if [[ "$REGION" == "us-east-1" ]]; then
    aws s3api create-bucket --bucket "$BUCKET_NAME" --region "$REGION"
  else
    aws s3api create-bucket \
      --bucket "$BUCKET_NAME" \
      --region "$REGION" \
      --create-bucket-configuration LocationConstraint="$REGION"
  fi
  echo "Bucket created."
fi

# Block public access
aws s3api put-public-access-block \
  --bucket "$BUCKET_NAME" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

echo "S3 bucket ready: s3://$BUCKET_NAME"
echo ""

# 2. Create ECR repository for build-agent
echo "=== 2. Creating ECR repository: $ECR_REPO ==="
ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO}"
if aws ecr describe-repositories --repository-names "$ECR_REPO" --region "$REGION" 2>/dev/null | jq -e '.repositories[0]' > /dev/null; then
  echo "ECR repo already exists, skipping..."
else
  aws ecr create-repository \
    --repository-name "$ECR_REPO" \
    --region "$REGION" \
    --image-scanning-configuration scanOnPush=true \
    --encryption-configuration encryptionType=AES256
  echo "ECR repo created."
fi
echo "ECR URI: $ECR_URI"
echo ""

# 3. Create ECS cluster
echo "=== 3. Creating ECS cluster: $ECS_CLUSTER ==="
if aws ecs describe-clusters --clusters "$ECS_CLUSTER" --region "$REGION" 2>/dev/null | jq -e '.clusters[0].status == "ACTIVE"' > /dev/null; then
  echo "ECS cluster already exists, skipping..."
else
  aws ecs create-cluster --cluster-name "$ECS_CLUSTER" --region "$REGION"
  echo "ECS cluster created."
fi
echo ""

# 4. Create IAM task execution role
echo "=== 4. Creating IAM roles for ECS tasks ==="
TASK_EXEC_ROLE="vercel-clone-task-exec-role"
TASK_ROLE="vercel-clone-task-role"

# Task execution role (for pulling images)
if aws iam get-role --role-name "$TASK_EXEC_ROLE" 2>/dev/null | jq -e '.Role' > /dev/null; then
  echo "Task execution role already exists, skipping..."
else
  aws iam create-role \
    --role-name "$TASK_EXEC_ROLE" \
    --assume-role-policy-document '{
      "Version": "2012-10-17",
      "Statement": [{"Effect": "Allow", "Principal": {"Service": "ecs-tasks.amazonaws.com"}, "Action": "sts:AssumeRole"}]
    }'
  aws iam attach-role-policy \
    --role-name "$TASK_EXEC_ROLE" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
  echo "Task execution role created."
fi

# Task role (for S3 access from build-agent)
if aws iam get-role --role-name "$TASK_ROLE" 2>/dev/null | jq -e '.Role' > /dev/null; then
  echo "Task role already exists, skipping..."
else
  aws iam create-role \
    --role-name "$TASK_ROLE" \
    --assume-role-policy-document '{
      "Version": "2012-10-17",
      "Statement": [{"Effect": "Allow", "Principal": {"Service": "ecs-tasks.amazonaws.com"}, "Action": "sts:AssumeRole"}]
    }'
  # Grant S3 put/get on artifacts bucket
  aws iam put-role-policy \
    --role-name "$TASK_ROLE" \
    --policy-name VercelCloneS3Policy \
    --policy-document "{
      \"Version\": \"2012-10-17\",
      \"Statement\": [
        {
          \"Effect\": \"Allow\",
          \"Action\": [\"s3:PutObject\", \"s3:GetObject\", \"s3:ListBucket\"],
          \"Resource\": [\"arn:aws:s3:::$BUCKET_NAME\", \"arn:aws:s3:::$BUCKET_NAME/*\"]
        }
      ]
    }"
  echo "Task role created with S3 access."
fi

TASK_EXEC_ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/${TASK_EXEC_ROLE}"
TASK_ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/${TASK_ROLE}"
echo ""

# 5. Register ECS task definition
echo "=== 5. Registering ECS task definition ==="
TASK_DEF_FAMILY="vercel-clone-build-agent"
aws ecs register-task-definition \
  --family "$TASK_DEF_FAMILY" \
  --region "$REGION" \
  --network-mode awsvpc \
  --requires-compatibilities FARGATE \
  --cpu "1024" \
  --memory "2048" \
  --execution-role-arn "$TASK_EXEC_ROLE_ARN" \
  --task-role-arn "$TASK_ROLE_ARN" \
  --container-definitions '[
    {
      "name": "build-agent",
      "image": "'"$ECR_URI"':latest",
      "essential": true,
      "environment": [
        {"name": "S3_ARTIFACTS_BUCKET", "value": "'"$BUCKET_NAME"'"},
        {"name": "S3_ARTIFACTS_PREFIX", "value": "projects"}
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/vercel-clone/build-agent",
          "awslogs-region": "'"$REGION"'",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]'

echo "Task definition registered."
echo ""

# 6. Get VPC subnet IDs (use default VPC)
echo "=== 6. Getting VPC subnet IDs ==="
DEFAULT_VPC=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true --region "$REGION" --query 'Vpcs[0].VpcId' --output text)
if [[ "$DEFAULT_VPC" == "None" || -z "$DEFAULT_VPC" ]]; then
  echo "ERROR: No default VPC found. Create a VPC in AWS console or specify subnets manually."
  exit 1
fi

SUBNETS=$(aws ec2 describe-subnets \
  --filters Name=vpc-id,Values="$DEFAULT_VPC" Name=default-for-az,Values=true \
  --region "$REGION" \
  --query 'Subnets[*].SubnetId' --output text | tr '\t' ',')

SECURITY_GROUP=$(aws ec2 describe-security-groups \
  --filters Name=vpc-id,Values="$DEFAULT_VPC" Name=group-name,Values=default \
  --region "$REGION" \
  --query 'SecurityGroups[0].GroupId' --output text)

echo "Default VPC: $DEFAULT_VPC"
echo "Subnets: $SUBNETS"
echo "Security Group: $SECURITY_GROUP"
echo ""

# 7. Build and push Docker image
echo "=== 7. Building & pushing Docker image ==="
echo "Run these commands:"
echo ""
echo "  cd build-agent"
echo "  aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
echo "  docker build -t $ECR_URI:latest ."
echo "  docker push $ECR_URI:latest"
echo "  cd .."
echo ""

# Summary
echo "=========================================="
echo "=== Setup Complete! ==="
echo "=========================================="
echo ""
echo "Add these to your .env:"
echo ""
echo "  S3_ARTIFACTS_BUCKET=\"$BUCKET_NAME\""
echo "  ECS_CLUSTER=\"$ECS_CLUSTER\""
echo "  ECS_BUILD_TASK_DEFINITION=\"$TASK_DEF_FAMILY\""
echo "  ECS_BUILD_TASK_SUBNETS=\"$SUBNETS\""
echo "  ECS_BUILD_TASK_SECURITY_GROUPS=\"$SECURITY_GROUP\""
echo "  ECR_REPO=\"$ECR_URI\""
echo ""
echo "After building & pushing the Docker image, restart your services."
