output "endpoint" {
  value = local.endpoint_val
}

output "security_group_id" {
  value = aws_security_group.this.id
}

output "cluster_id" {
  value       = var.cluster_mode ? aws_elasticache_replication_group.cluster[0].replication_group_id : aws_elasticache_cluster.single[0].id
  description = "ElastiCache CacheClusterId for CloudWatch metric dimensions."
}