# One log group per service; the dashboard and the api-server also write to
# stdout, picked up by CloudWatch via the awsvpc/Fargate log driver.
# Metric/alarms added in Phase 4.

resource "aws_cloudwatch_log_group" "this" {
  for_each          = toset(var.services)
  name              = "/aws/ecs/${var.name_prefix}/${each.value}"
  retention_in_days = var.log_retention
  kms_key_id        = var.kms_key_arn
  tags              = merge(var.common_tags, { Service = each.value })
}

# Phase 1 placeholder alarms — these reference dimensions that don't exist yet
# until services are publishing custom metrics. They are disabled here and wired
# in Phase 4 once we have real prometheus/cloudwatch exporters running.