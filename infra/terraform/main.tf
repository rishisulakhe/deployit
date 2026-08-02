# ---------------------------------------------------------------------------
# Module wiring. Resource lifecycles live inside modules under ./modules/.
# Keep this file to connections only.
# ---------------------------------------------------------------------------

locals {
  name_prefix = "${var.project}-${var.env}"

  common_tags = merge(var.tags, {
    Project = var.project
    Env     = var.env
  })
}

# Data source for available AZs in the chosen region.
data "aws_availability_zones" "available" {
  state = "available"
}

# ---------------------------------------------------------------------------
# Networking
# ---------------------------------------------------------------------------

module "vpc" {
  source      = "./modules/vpc"
  name_prefix = local.name_prefix
  vpc_cidr    = var.vpc_cidr
  az_names    = slice(data.aws_availability_zones.available.names, 0, var.az_count)
  common_tags = local.common_tags
}

# ---------------------------------------------------------------------------
# KMS (root key for S3 SSE + secrets-at-rest in api-server)
# ---------------------------------------------------------------------------

module "kms" {
  source      = "./modules/kms"
  name_prefix = local.name_prefix
  common_tags = local.common_tags
}

# ---------------------------------------------------------------------------
# Artifacts bucket (S3 + CloudFront in front) where build-agent uploads to.
# ---------------------------------------------------------------------------

module "s3" {
  source      = "./modules/s3"
  name_prefix = local.name_prefix
  kms_key_arn = module.kms.key_arn
  common_tags = local.common_tags
}

module "cloudfront" {
  source             = "./modules/cloudfront"
  name_prefix        = local.name_prefix
  origin_bucket_name = module.s3.artifacts_bucket_name
  origin_bucket_reg  = var.region
  price_class        = var.cloudfront_price_class
  common_tags        = local.common_tags
}

# ---------------------------------------------------------------------------
# Data plane: PostgreSQL + Redis
# ---------------------------------------------------------------------------

module "rds" {
  source            = "./modules/rds"
  name_prefix       = local.name_prefix
  vpc_id            = module.vpc.vpc_id
  subnet_ids        = module.vpc.private_subnet_ids
  allowed_sg_ids    = [module.ecs.security_group_id]
  instance_class    = var.rds_instance_class
  multi_az          = var.rds_multi_az
  allocated_storage = var.rds_allocated_storage
  kms_key_arn       = module.kms.key_arn
  common_tags       = local.common_tags
}

module "elasticache" {
  source         = "./modules/elasticache"
  name_prefix    = local.name_prefix
  vpc_id         = module.vpc.vpc_id
  subnet_ids     = module.vpc.private_subnet_ids
  allowed_sg_ids = [module.ecs.security_group_id, module.alb.security_group_id]
  node_type      = var.redis_node_type
  cluster_mode   = var.redis_cluster_mode
  common_tags    = local.common_tags
}

# ---------------------------------------------------------------------------
# Compute: ECR (image registry) + ECS (cluster + build-agent task)
# ---------------------------------------------------------------------------

module "ecr" {
  source      = "./modules/ecr"
  name_prefix = local.name_prefix
  services    = ["api-server", "orchestrator", "build-agent", "edge-proxy", "dashboard"]
  kms_key_arn = module.kms.key_arn
  common_tags = local.common_tags
}

module "ecs" {
  source                    = "./modules/ecs"
  name_prefix               = local.name_prefix
  vpc_id                    = module.vpc.vpc_id
  subnet_ids                = module.vpc.private_subnet_ids # build-agent runs private
  artifacts_bucket_arn      = module.s3.artifacts_bucket_arn
  artifacts_bucket_read_arn = module.s3.artifacts_read_arn
  kms_key_arn               = module.kms.key_arn
  build_agent_image_uri     = "${module.ecr.repository_urls["build-agent"]}:latest"
  common_tags               = local.common_tags
}

# ---------------------------------------------------------------------------
# Public edge: ALB (dashboard + api-server + edge-proxy)
# acm + route53 modules deferred per user choice (`dashboard_domain` empty).
# ---------------------------------------------------------------------------

module "alb" {
  source               = "./modules/alb"
  name_prefix          = local.name_prefix
  vpc_id               = module.vpc.vpc_id
  subnet_ids           = module.vpc.public_subnet_ids
  certificate_arn      = var.dashboard_acm_cert_arn
  allowed_ingest_cidrs = var.allowed_ingest_cidrs
  common_tags          = local.common_tags
}

# ---------------------------------------------------------------------------
# Observability: log groups + CloudWatch metric alarms
# ---------------------------------------------------------------------------

module "cloudwatch" {
  source        = "./modules/cloudwatch"
  name_prefix   = local.name_prefix
  services      = ["api-server", "orchestrator", "build-agent", "edge-proxy", "dashboard"]
  kms_key_arn   = module.kms.key_arn
  log_retention = 14
  common_tags   = local.common_tags
}