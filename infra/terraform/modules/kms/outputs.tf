output "key_id" {
  value = aws_kms_key.this.id
}

output "key_arn" {
  value = aws_kms_key.this.arn
}

output "alias" {
  value = aws_kms_alias.this.name
}