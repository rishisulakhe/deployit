output "log_group_names" {
  value = { for k, lg in aws_cloudwatch_log_group.this : k => lg.name }
}

output "sns_alerts_topic_arn" {
  value       = aws_sns_topic.alerts.arn
  description = "SNS topic subscribed to by all CloudWatch alarms."
}

output "alarm_names" {
  value = {
    rds_cpu          = aws_cloudwatch_metric_alarm.rds_cpu_high.alarm_name
    rds_connections  = aws_cloudwatch_metric_alarm.rds_connections_high.alarm_name
    rds_free_storage = aws_cloudwatch_metric_alarm.rds_free_storage_low.alarm_name
    redis_cpu        = aws_cloudwatch_metric_alarm.redis_cpu_high.alarm_name
    redis_evictions  = aws_cloudwatch_metric_alarm.redis_evictions.alarm_name
    alb_5xx          = aws_cloudwatch_metric_alarm.alb_5xx_high.alarm_name
    ecs_task_failure = aws_cloudwatch_metric_alarm.ecs_task_failures.alarm_name
  }
}