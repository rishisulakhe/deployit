variable "name_prefix" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "allowed_sg_ids" {
  type        = list(string)
  description = "Security group ids allowed to reach the database on 5432."
}

variable "instance_class" {
  type = string
}

variable "multi_az" {
  type = bool
}

variable "allocated_storage" {
  type = number
}

variable "kms_key_arn" {
  type = string
}

variable "common_tags" {
  type    = map(string)
  default = {}
}