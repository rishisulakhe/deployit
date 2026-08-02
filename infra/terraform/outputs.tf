output "s3_artifacts_bucket_id" {
  value       = module.s3.artifacts_bucket_id
  description = "Bucket where build-agent writes deployed artifacts."
}

output "s3_artifacts_bucket_name" {
  value = module.s3.artifacts_bucket_name
}

output "cloudfront_distribution_domain" {
  value       = module.cloudfront.distribution_domain
  description = "CloudFront domain name that edge-proxy reverses to."
}

output "rds_endpoint" {
  value       = module.rds.endpoint
  description = "RDS PostgreSQL endpoint (host:port) — set this as DATABASE_URL host."
}

output "rds_db_name" {
  value = module.rds.db_name
}

output "redis_endpoint" {
  value       = module.elasticache.endpoint
  description = "ElastiCache Redis primary endpoint — set this as REDIS_URL host."
}

output "ecr_repository_urls" {
  value       = module.ecr.repository_urls
  description = "Map of service name -> ECR repository URL."
}

output "ecs_cluster_name" {
  value = module.ecs.cluster_name
}

output "ecs_build_task_definition_arn" {
  value = module.ecs.build_agent_task_definition_arn
}

output "alb_dns_name" {
  value       = module.alb.dns_name
  description = "Public DNS name of the application load balancer."
}

output "alb_zone_id" {
  value = module.alb.zone_id
}

output "kms_key_id" {
  value       = module.kms.key_id
  description = "KMS key id used by api-server to encrypt tokens and env vars at rest."
}

output "vpc_id" {
  value = module.vpc.vpc_id
}

output "private_subnet_ids" {
  value = module.vpc.private_subnet_ids
}

output "public_subnet_ids" {
  value = module.vpc.public_subnet_ids
}