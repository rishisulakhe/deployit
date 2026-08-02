output "artifacts_bucket_id" {
  value = aws_s3_bucket.artifacts.id
}

output "artifacts_bucket_name" {
  value = aws_s3_bucket.artifacts.bucket
}

output "artifacts_bucket_arn" {
  value = aws_s3_bucket.artifacts.arn
}

output "artifacts_read_arn" {
  # Convenience: the S3 object ARN prefix to drop into IAM policy Resource lists.
  value = "${aws_s3_bucket.artifacts.arn}/*"
}