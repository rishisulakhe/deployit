# Shared customer-managed KMS key. Used by S3 (SSE-KMS), RDS, ElastiCache,
# ECR, and api-server (encrypts the user's GitHub token + project env vars
# at rest). IAM roles are granted kms:Decrypt/GenerateDataKey in their own
# policies; the key policy here only ensures root account can manage it.

resource "aws_kms_key" "this" {
  description             = "${var.name_prefix} shared CMK (S3 SSE + app secrets + RDS + ECR)"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EnableRootAccountAccess"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "AllowAWSServices"
        Effect = "Allow"
        Principal = {
          Service = [
            "s3.${data.aws_region.current.name}.amazonaws.com",
            "rds.${data.aws_region.current.name}.amazonaws.com",
            "elasticache.${data.aws_region.current.name}.amazonaws.com",
            "ecr.${data.aws_region.current.name}.amazonaws.com",
            "logs.${data.aws_region.current.name}.amazonaws.com",
          ]
        }
        Action = [
          "kms:GenerateDataKey",
          "kms:GenerateDataKeyWithoutPlaintext",
          "kms:Decrypt",
          "kms:Encrypt",
          "kms:DescribeKey",
        ]
        Resource = "*"
      }
    ]
  })

  tags = merge(var.common_tags, { Name = "${var.name_prefix}-kms" })
}

resource "aws_kms_alias" "this" {
  name          = "alias/${var.name_prefix}"
  target_key_id = aws_kms_key.this.id
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}