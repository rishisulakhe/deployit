variable "name_prefix" {
  type = string
}

variable "services" {
  type        = list(string)
  description = "Service names; one ECR repo is created per service."
}

variable "kms_key_arn" {
  type = string
}

variable "common_tags" {
  type    = map(string)
  default = {}
}