variable "name_prefix" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "certificate_arn" {
  type        = string
  description = "ACM cert arn for HTTPS. Empty = HTTP-only dev mode."
  default     = ""
}

variable "allowed_ingest_cidrs" {
  type = list(string)
}

variable "common_tags" {
  type    = map(string)
  default = {}
}