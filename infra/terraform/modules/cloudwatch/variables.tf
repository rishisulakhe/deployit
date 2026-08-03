variable "name_prefix" {
  type = string
}

variable "services" {
  type = list(string)
}

variable "kms_key_arn" {
  type = string
}

variable "log_retention" {
  type    = number
  default = 14
}

# --- RDS alarm thresholds ---
variable "rds_instance_identifier" {
  type        = string
  description = "RDS DBInstanceIdentifier for CloudWatch metric dimensions."
}

variable "rds_cpu_threshold" {
  type    = number
  default = 80
}

variable "rds_connections_threshold" {
  type    = number
  default = 80
}

variable "rds_free_storage_threshold_bytes" {
  type    = number
  default = 5368709120 # 5 GiB
}

# --- ElastiCache alarm thresholds ---
variable "redis_cluster_id" {
  type        = string
  description = "ElastiCache CacheClusterId for CloudWatch metric dimensions."
}

variable "redis_cpu_threshold" {
  type    = number
  default = 80
}

variable "redis_evictions_threshold" {
  type    = number
  default = 1000
}

# --- ALB alarm thresholds ---
variable "alb_arn_suffix" {
  type        = string
  description = "ARN suffix of the ALB for CloudWatch dimensions."
}

variable "alb_5xx_threshold" {
  type    = number
  default = 10
}

# --- ECS alarm thresholds ---
variable "ecs_cluster_name" {
  type = string
}

variable "ecs_build_task_family" {
  type        = string
  description = "Task definition family name for the build-agent."
}

variable "ecs_task_failure_threshold" {
  type    = number
  default = 5
}

variable "common_tags" {
  type    = map(string)
  default = {}
}