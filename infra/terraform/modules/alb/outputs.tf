output "dns_name" {
  value = aws_lb.this.dns_name
}

output "zone_id" {
  value = aws_lb.this.zone_id
}

output "arn" {
  value = aws_lb.this.arn
}

output "security_group_id" {
  value = aws_security_group.alb.id
}

output "dashboard_target_group_arn" {
  value = aws_lb_target_group.dashboard.arn
}

output "api_target_group_arn" {
  value = aws_lb_target_group.api_server.arn
}

output "edge_proxy_target_group_arn" {
  value = aws_lb_target_group.edge_proxy.arn
}

output "http_listener_arn" {
  value = aws_lb_listener.http.arn
}

output "arn_suffix" {
  value       = aws_lb.this.arn_suffix
  description = "ALB ARN suffix for CloudWatch metric dimensions."
}