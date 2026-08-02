resource "aws_elasticache_subnet_group" "this" {
  name        = "${var.name_prefix}-redis-subnet-group"
  description = "Subnet group for ${var.name_prefix} Redis"
  subnet_ids  = var.subnet_ids
  tags        = merge(var.common_tags, { Name = "${var.name_prefix}-redis-subnet-group" })
}

resource "aws_security_group" "this" {
  name        = "${var.name_prefix}-redis-sg"
  description = "Inbound Redis from allowed security groups"
  vpc_id      = var.vpc_id
  tags        = merge(var.common_tags, { Name = "${var.name_prefix}-redis-sg" })
}

resource "aws_security_group_rule" "ingress" {
  count                    = length(var.allowed_sg_ids)
  security_group_id        = aws_security_group.this.id
  type                     = "ingress"
  from_port                = 6379
  to_port                  = 6379
  protocol                 = "tcp"
  source_security_group_id = var.allowed_sg_ids[count.index]
}

resource "aws_security_group_rule" "egress" {
  security_group_id = aws_security_group.this.id
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
}

# Single-node cluster for dev (cluster_mode=false).
resource "aws_elasticache_cluster" "single" {
  count                = var.cluster_mode ? 0 : 1
  cluster_id           = var.name_prefix
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.node_type
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.this.name
  security_group_ids   = [aws_security_group.this.id]
  tags                 = merge(var.common_tags, { Name = "${var.name_prefix}-redis" })
}

# Replication group with cluster mode for prod.
resource "aws_elasticache_replication_group" "cluster" {
  count                      = var.cluster_mode ? 1 : 0
  replication_group_id       = var.name_prefix
  description                = "Vercel clone Redis with cluster mode (prod)"
  engine                     = "redis"
  engine_version             = "7.1"
  node_type                  = var.node_type
  num_node_groups            = 3
  replicas_per_node_group    = 1
  multi_az_enabled           = true
  automatic_failover_enabled = true
  subnet_group_name          = aws_elasticache_subnet_group.this.name
  security_group_ids         = [aws_security_group.this.id]
  parameter_group_name       = "default.redis7"
  port                       = 6379
  at_rest_encryption_enabled = true
  tags                       = merge(var.common_tags, { Name = "${var.name_prefix}-redis" })
}

locals {
  # Single node: pick cache_nodes[0].address. Cluster mode: pick a configuration endpoint.
  endpoint_val = var.cluster_mode ? aws_elasticache_replication_group.cluster[0].configuration_endpoint_address : aws_elasticache_cluster.single[0].cache_nodes[0].address
}