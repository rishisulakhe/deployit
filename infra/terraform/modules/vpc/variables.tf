variable "name_prefix" {
  type        = string
  description = "Prefix for resource names (e.g. vercel-clone-dev)."
}

variable "vpc_cidr" {
  type        = string
  description = "VPC CIDR."
}

variable "az_names" {
  type        = list(string)
  description = "Availability zone names to use."
}

variable "common_tags" {
  type    = map(string)
  default = {}
}