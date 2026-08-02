variable "name_prefix" {
  type = string
}

variable "services" {
  type = list(string)
}

variable "kms_key_arn" {
  type = string
}

variable "log_retention" {
  type        = number
  description = "Days to retain logs."
  default     = 14
}

variable "common_tags" {
  type    = map(string)
  default = {}
}