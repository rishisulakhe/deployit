# Public-facing ALB. In dev (no TLS) it serves HTTP on :80 with path-based
# routing to dashboard / api-server / edge-proxy target groups. When an ACM
# cert is provided, :80 redirects to :443 and :443 does the routing.

resource "aws_lb" "this" {
  name               = var.name_prefix
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.subnet_ids

  enable_deletion_protection = false
  tags                       = merge(var.common_tags, { Name = "${var.name_prefix}-alb" })
}

resource "aws_security_group" "alb" {
  name        = "${var.name_prefix}-alb-sg"
  description = "Ingress to the ALB"
  vpc_id      = var.vpc_id
  tags        = merge(var.common_tags, { Name = "${var.name_prefix}-alb-sg" })
}

resource "aws_security_group_rule" "http_ingress" {
  security_group_id = aws_security_group.alb.id
  type              = "ingress"
  from_port         = 80
  to_port           = 80
  protocol          = "tcp"
  cidr_blocks       = var.allowed_ingest_cidrs
}

resource "aws_security_group_rule" "https_ingress" {
  count             = length(var.certificate_arn) > 0 ? 1 : 0
  security_group_id = aws_security_group.alb.id
  type              = "ingress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = var.allowed_ingest_cidrs
}

resource "aws_security_group_rule" "egress" {
  security_group_id = aws_security_group.alb.id
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
}

# ---------------------------------------------------------------------------
# Target groups
# ---------------------------------------------------------------------------

resource "aws_lb_target_group" "dashboard" {
  name        = "${var.name_prefix}-dashboard"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path    = "/"
    matcher = "200-399"
  }

  tags = merge(var.common_tags)
}

resource "aws_lb_target_group" "api_server" {
  name        = "${var.name_prefix}-api"
  port        = 3001
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path    = "/healthz"
    matcher = "200-399"
  }

  tags = merge(var.common_tags)
}

resource "aws_lb_target_group" "edge_proxy" {
  name        = "${var.name_prefix}-proxy"
  port        = 8000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path    = "/healthz"
    matcher = "200-399"
  }

  tags = merge(var.common_tags)
}

# ---------------------------------------------------------------------------
# Listeners + path-based rules
#
# When no cert is configured (dev):
#   :80 -> default forward to dashboard, with rule /api/* -> api-server,
#          rule /proxy/* -> edge-proxy.
# When a cert is configured (prod):
#   :80 -> redirect to :443.
#   :443 -> default forward to dashboard, with the same path rules.
# ---------------------------------------------------------------------------

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type             = length(var.certificate_arn) > 0 ? "redirect" : "forward"
    target_group_arn = length(var.certificate_arn) > 0 ? null : aws_lb_target_group.dashboard.arn

    dynamic "redirect" {
      for_each = length(var.certificate_arn) > 0 ? [1] : []
      content {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }
}

resource "aws_lb_listener" "https" {
  count             = length(var.certificate_arn) > 0 ? 1 : 0
  load_balancer_arn = aws_lb.this.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.dashboard.arn
  }
}

# Path-based rules attach to whichever listener actually serves traffic.
locals {
  active_listener_arn = length(var.certificate_arn) > 0 ? aws_lb_listener.https[0].arn : aws_lb_listener.http.arn
}

resource "aws_lb_listener_rule" "api" {
  listener_arn = local.active_listener_arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api_server.arn
  }

  condition {
    path_pattern {
      values = ["/api/*"]
    }
  }
}

resource "aws_lb_listener_rule" "proxy" {
  listener_arn = local.active_listener_arn
  priority     = 101

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.edge_proxy.arn
  }

  condition {
    path_pattern {
      values = ["/proxy/*"]
    }
  }
}