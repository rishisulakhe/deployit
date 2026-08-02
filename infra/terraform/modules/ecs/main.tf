# ECS Fargate cluster that runs build-agent tasks.
# Note: dashboard / api-server / edge-proxy run as Fargate *services* attached
# to the ALB target groups; those services are added in Phase 5 CI/CD. This
# module only ships the cluster + security group + the build-agent task
# definition + the IAM roles it needs.

data "aws_region" "current" {}

resource "aws_ecs_cluster" "this" {
  name = var.name_prefix
  tags = merge(var.common_tags, { Name = "${var.name_prefix}-ecs" })

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

# Security group applied to all ECS tasks (build agents and future services).
# Inbound is open from any task within the same SG; outbound is open to
# reach S3 (VPC endpoint recommended later), RDS, and ElastiCache.
resource "aws_security_group" "tasks" {
  name        = "${var.name_prefix}-ecs-tasks-sg"
  description = "Security group for ECS Fargate tasks"
  vpc_id      = var.vpc_id
  tags        = merge(var.common_tags, { Name = "${var.name_prefix}-ecs-tasks-sg" })
}

resource "aws_security_group_rule" "tasks_egress" {
  security_group_id = aws_security_group.tasks.id
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
}

# ---------------------------------------------------------------------------
# Build-agent: IAM execution role (for ECR pull + CloudWatch log driver)
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "exec_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "build_exec" {
  name               = "${var.name_prefix}-build-agent-exec"
  assume_role_policy = data.aws_iam_policy_document.exec_assume.json
  tags               = merge(var.common_tags)
}

resource "aws_iam_role_policy_attachment" "build_exec_managed" {
  role       = aws_iam_role.build_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# ---------------------------------------------------------------------------
# Build-agent: IAM task role (permissions of the running container)
# ---------------------------------------------------------------------------

resource "aws_iam_role" "build_task" {
  name               = "${var.name_prefix}-build-agent-task"
  assume_role_policy = data.aws_iam_policy_document.exec_assume.json
  tags               = merge(var.common_tags)
}

resource "aws_iam_role_policy" "build_task_perms" {
  name = "${var.name_prefix}-build-agent-perms"
  role = aws_iam_role.build_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ArtifactsBucketObjects"
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:GetObjectVersion",
          "s3:ListBucket",
          "s3:DeleteObject",
          "s3:AbortMultipartUpload",
        ]
        Resource = [
          var.artifacts_bucket_arn,
          var.artifacts_bucket_read_arn,
        ]
      },
      {
        Sid    = "DecryptKMS"
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey",
          "kms:DescribeKey",
          "kms:Encrypt",
        ]
        Resource = [var.kms_key_arn]
      },
      {
        Sid    = "ReadProjectSecrets"
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters",
        ]
        # SSM SecretString params created in Phase 2 for per-deployment env vars.
        Resource = ["arn:aws:ssm:${data.aws_region.current.name}:*:parameter/${var.name_prefix}/*"]
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# Build-agent: Fargate task definition
# Env vars at runtime are passed via the orchestrator's RunTask call.
# ---------------------------------------------------------------------------

resource "aws_ecs_task_definition" "build_agent" {
  family                   = "${var.name_prefix}-build-agent"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "1024"
  memory                   = "2048"
  execution_role_arn       = aws_iam_role.build_exec.arn
  task_role_arn            = aws_iam_role.build_task.arn

  container_definitions = jsonencode([
    {
      name      = "build-agent"
      image     = var.build_agent_image_uri
      essential = true

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = "/aws/ecs/${var.name_prefix}/build-agent"
          "awslogs-region"        = data.aws_region.current.name
          "awslogs-stream-prefix" = "build"
        }
      }
    }
  ])

  tags = merge(var.common_tags, { Name = "${var.name_prefix}-build-agent-td" })
}