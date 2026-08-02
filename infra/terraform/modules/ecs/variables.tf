variable "name_prefix" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "artifacts_bucket_arn" {
  type = string
}

variable "artifacts_bucket_read_arn" {
  type        = string
  description = "Bucket arn prefix 'arn:aws:s3:::bucket-name/*' for IAM Resource."
}

variable "kms_key_arn" {
  type = string
}

variable "build_agent_image_uri" {
  type        = string
  description = "ECR image URI for the build-agent (used in the Fargate task definition)."
}

variable "common_tags" {
  type    = map(string)
  default = {}
}