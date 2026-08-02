resource "aws_db_subnet_group" "this" {
  name        = "${var.name_prefix}-db-subnet-group"
  description = "Subnet group for the ${var.name_prefix} RDS instance"
  subnet_ids  = var.subnet_ids
  tags        = merge(var.common_tags, { Name = "${var.name_prefix}-db-subnet-group" })
}

resource "aws_security_group" "this" {
  name        = "${var.name_prefix}-rds-sg"
  description = "Inbound Postgres from allowed security groups"
  vpc_id      = var.vpc_id
  tags        = merge(var.common_tags, { Name = "${var.name_prefix}-rds-sg" })
}

resource "aws_security_group_rule" "ingress" {
  count                    = length(var.allowed_sg_ids)
  security_group_id        = aws_security_group.this.id
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
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

resource "aws_db_parameter_group" "this" {
  name   = "${var.name_prefix}-pg16"
  family = "postgres16"

  parameter {
    name  = "log_connections"
    value = "1"
  }

  tags = merge(var.common_tags)
}

# Random master password, stored in SSM Parameter Store (SecureString, KMS-encrypted).
# The apps read it via IAM role at runtime (Phase 2 wiring).
resource "random_password" "master" {
  length  = 32
  special = true
}

resource "aws_ssm_parameter" "master_password" {
  name        = "/${var.name_prefix}/rds/master-password"
  description = "Master password for the ${var.name_prefix} RDS instance"
  type        = "SecureString"
  key_id      = var.kms_key_arn
  value       = random_password.master.result
  overwrite   = true
  tags        = merge(var.common_tags)
}

resource "aws_db_instance" "this" {
  identifier        = var.name_prefix
  engine            = "postgres"
  engine_version    = "16"
  instance_class    = var.instance_class
  allocated_storage = var.allocated_storage
  storage_type      = "gp3"
  storage_encrypted = true
  kms_key_id        = var.kms_key_arn

  db_name             = "vercel"
  username            = "vercel"
  password            = random_password.master.result
  multi_az            = var.multi_az
  publicly_accessible = false

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.this.id]
  parameter_group_name   = aws_db_parameter_group.this.name

  backup_retention_period = var.multi_az ? 7 : 1
  deletion_protection     = var.multi_az
  skip_final_snapshot     = true
  copy_tags_to_snapshot   = true

  tags = merge(var.common_tags, { Name = "${var.name_prefix}-rds" })
}