output "endpoint" {
  value = aws_db_instance.this.endpoint
}

output "endpoint_host" {
  value = aws_db_instance.this.address
}

output "endpoint_port" {
  value = aws_db_instance.this.port
}

output "db_name" {
  value = aws_db_instance.this.db_name
}

output "db_username" {
  value = aws_db_instance.this.username
}

output "security_group_id" {
  value = aws_security_group.this.id
}

output "ssm_password_parameter" {
  value = aws_ssm_parameter.master_password.name
}