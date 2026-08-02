resource "aws_ecr_repository" "this" {
  for_each             = toset(var.services)
  name                 = "${var.name_prefix}/${each.value}"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = var.kms_key_arn
  }

  tags = merge(var.common_tags, { Name = "${var.name_prefix}/${each.value}" })
}

# Lifecycle: prune tagged images past 50, untagged past 1.
resource "aws_ecr_lifecycle_policy" "this" {
  for_each   = toset(var.services)
  repository = aws_ecr_repository.this[each.value].name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Drop untagged images after 1 day"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Keep at most 50 tagged images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 50
        }
        action = { type = "expire" }
      }
    ]
  })
}