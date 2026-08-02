variable "project" {
  type        = string
  description = "Short project name; used as the first segment of every AWS resource name."
  default     = "vercel-clone"
}

variable "env" {
  type        = string
  description = "Workspace/environment name. Use `dev` or `prod`. Affects sizing and high-availability flags."
  default     = "dev"

  validation {
    condition     = contains(["dev", "prod"], var.env)
    error_message = "env must be one of `dev` or `prod`."
  }
}

variable "region" {
  type        = string
  description = "AWS region. ap-south-2 = Mumbai-Hyderabad."
  default     = "ap-south-2"
}

variable "vpc_cidr" {
  type        = string
  description = "CIDR for the VPC."
  default     = "10.20.0.0/18"
}

variable "az_count" {
  type        = number
  description = "Number of AZs to use. ap-south-2 has 3 AZs."
  default     = 2
}

variable "rds_instance_class" {
  type        = string
  description = "RDS instance class. Cheaper in dev, bigger in prod."
  default     = "db.t4g.micro"
}

variable "rds_multi_az" {
  type        = bool
  description = "Make RDS Multi-AZ for HA (prod)."
  default     = false
}

variable "rds_allocated_storage" {
  type        = number
  description = "RDS allocated storage in GiB."
  default     = 20
}

variable "redis_node_type" {
  type        = string
  description = "ElastiCache node class."
  default     = "cache.t4g.micro"
}

variable "redis_cluster_mode" {
  type        = bool
  description = "Whether ElastiCache uses cluster mode (prod) vs a single shard (dev)."
  default     = false
}

variable "cloudfront_price_class" {
  type        = string
  description = "CloudFront price class. PriceClass_100 = cheaper (NA + EU only), PriceClass_200 = adds Asia/India."
  default     = "PriceClass_200"
}

variable "dashboard_acm_cert_arn" {
  type        = string
  description = "Wildcard ACM cert arn for ALB HTTPS. Empty in dev (TLS deferred)."
  default     = ""
}

variable "dashboard_domain" {
  type        = string
  description = "Apex domain (e.g. `vercel.example.com`). Empty in dev. Reserved for the route53 module once a domain is configured."
  default     = ""
}

variable "allowed_ingest_cidrs" {
  type        = list(string)
  description = "CIDRs allowed to reach the ALB. Default = internet."
  default     = ["0.0.0.0/0"]
}

variable "tags" {
  type        = map(string)
  description = "Additional tags merged with the provider-level default_tags."
  default     = {}
}