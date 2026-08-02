# CloudFront distribution in front of the S3 artifacts bucket, with Origin
# Access Control (OAC). The bucket policy granting CloudFront read access is
# configured here (not in the s3 module) because it needs the distribution ARN
# as a condition, which is only known after this resource is created.

locals {
  origin_id   = "${var.name_prefix}-s3-origin"
  origin_host = "${var.origin_bucket_name}.s3.${var.origin_bucket_reg}.amazonaws.com"
  origin_arn  = "arn:aws:s3:::${var.origin_bucket_name}"
}

resource "aws_cloudfront_origin_access_control" "this" {
  name                              = "${var.name_prefix}-oac"
  description                       = "OAC for the S3 artifacts bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "this" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = var.price_class
  comment             = "${var.name_prefix} build artifacts CDN"
  aliases             = [] # Add the wildcard alias when the route53 module ships.

  origin {
    domain_name              = local.origin_host
    origin_id                = local.origin_id
    origin_access_control_id = aws_cloudfront_origin_access_control.this.id
  }

  default_cache_behavior {
    target_origin_id       = local.origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]
    compress               = true
    min_ttl                = 0
    default_ttl            = 60
    max_ttl                = 3600

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
  }

  # SPA fallback: any missing path returns index.html with 200 so client-side
  # routers take over.
  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = merge(var.common_tags, { Name = "${var.name_prefix}-cdn" })
}

# Grant the CloudFront service principal read access via OAC.
resource "aws_s3_bucket_policy" "artifacts_for_cf" {
  bucket = var.origin_bucket_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontServicePrincipalReadOnly"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${local.origin_arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.this.arn
          }
        }
      }
    ]
  })
}