variable "name_prefix" {
  type = string
}

variable "kms_key_arn" {
  type        = string
  description = "KMS key arn for SSE-KMS on the artifacts bucket."
}

variable "common_tags" {
  type    = map(string)
  default = {}
}