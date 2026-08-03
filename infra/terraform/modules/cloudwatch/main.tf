# ---------------------------------------------------------------------------
# CloudWatch: log groups + metric alarms for the production stack.
#
# The Prometheus-style custom metrics (queue depth, build success/failed) are
# exposed by the orchestrator on /metrics and scraped by Prometheus for the
# Grafana dashboards. These CloudWatch alarms cover infrastructure-level
# signals that AWS natively produces without needing a custom exporter:
#   - RDS CPU / connections / free storage
#   - ElastiCache CPU / memory / evictions
#   - ALB 5xx rate and target-level 5xx
#   - ECS Fargate task failure rate
# SNS notification is wired once a `alert_sns_topic_arn` variable is supplied.
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "this" {
  for_each          = toset(var.services)
  name              = "/aws/ecs/${var.name_prefix}/${each.value}"
  retention_in_days = var.log_retention
  kms_key_id        = var.kms_key_arn
  tags              = merge(var.common_tags, { Service = each.value })
}

# ---------------------------------------------------------------------------
# SNS topic for alarm notifications (subscribed via email/Lambda/Slack later)
# ---------------------------------------------------------------------------

resource "aws_sns_topic" "alerts" {
  name = "${var.name_prefix}-alerts"
  tags = merge(var.common_tags)
}

# ---------------------------------------------------------------------------
# RDS Alarms
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "rds_cpu_high" {
  alarm_name          = "${var.name_prefix}-rds-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 60
  statistic           = "Average"
  threshold           = var.rds_cpu_threshold
  alarm_description   = "RDS CPU has exceeded ${var.rds_cpu_threshold}% for 2+ minutes"
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBInstanceIdentifier = var.rds_instance_identifier
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = merge(var.common_tags)
}

resource "aws_cloudwatch_metric_alarm" "rds_connections_high" {
  alarm_name          = "${var.name_prefix}-rds-connections-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = 60
  statistic           = "Average"
  threshold           = var.rds_connections_threshold
  alarm_description   = "RDS connection count exceeds ${var.rds_connections_threshold} for 3+ minutes"
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBInstanceIdentifier = var.rds_instance_identifier
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = merge(var.common_tags)
}

resource "aws_cloudwatch_metric_alarm" "rds_free_storage_low" {
  alarm_name          = "${var.name_prefix}-rds-free-storage-low"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = 60
  statistic           = "Average"
  threshold           = var.rds_free_storage_threshold_bytes
  alarm_description   = "RDS free storage below ${var.rds_free_storage_threshold_bytes / 1073741824} GiB"
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBInstanceIdentifier = var.rds_instance_identifier
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = merge(var.common_tags)
}

# ---------------------------------------------------------------------------
# ElastiCache Alarms
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "redis_cpu_high" {
  alarm_name          = "${var.name_prefix}-redis-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = 60
  statistic           = "Average"
  threshold           = var.redis_cpu_threshold
  alarm_description   = "ElastiCache CPU exceeds ${var.redis_cpu_threshold}% for 2+ minutes"
  treat_missing_data  = "notBreaching"

  dimensions = {
    CacheClusterId = var.redis_cluster_id
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = merge(var.common_tags)
}

resource "aws_cloudwatch_metric_alarm" "redis_evictions" {
  alarm_name          = "${var.name_prefix}-redis-evictions"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 5
  metric_name         = "Evictions"
  namespace           = "AWS/ElastiCache"
  period              = 60
  statistic           = "Sum"
  threshold           = var.redis_evictions_threshold
  alarm_description   = "ElastiCache evictions > ${var.redis_evictions_threshold} over 5 minutes"
  treat_missing_data  = "notBreaching"

  dimensions = {
    CacheClusterId = var.redis_cluster_id
  }

  alarm_actions = [aws_sns_topic.alerts.arn]

  tags = merge(var.common_tags)
}

# ---------------------------------------------------------------------------
# ALB Alarms — 5xx rate and rejected connections
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "alb_5xx_high" {
  alarm_name          = "${var.name_prefix}-alb-5xx-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "HTTPCode_ELB_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Sum"
  threshold           = var.alb_5xx_threshold
  alarm_description   = "ALB returning >${var.alb_5xx_threshold} 5xx responses per minute for 2+ minutes"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = var.alb_arn_suffix
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = merge(var.common_tags)
}

# ---------------------------------------------------------------------------
# ECS Fargate — task stopped with non-zero exit (provisioning failure, OOM, etc.)
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "ecs_task_failures" {
  alarm_name          = "${var.name_prefix}-ecs-task-failure-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "TaskCount"
  namespace           = "ECS/ContainerInsights"
  period              = 60
  statistic           = "Sum"
  threshold           = var.ecs_task_failure_threshold
  alarm_description   = "ECS tasks in STOPPED state with non-zero exit code exceed ${var.ecs_task_failure_threshold}/min for 3+ minutes — may indicate build-agent OOM or image pull failures"
  treat_missing_data  = "notBreaching"

  dimensions = {
    ClusterName          = var.ecs_cluster_name
    TaskDefinitionFamily = var.ecs_build_task_family
  }

  alarm_actions = [aws_sns_topic.alerts.arn]

  tags = merge(var.common_tags)
}