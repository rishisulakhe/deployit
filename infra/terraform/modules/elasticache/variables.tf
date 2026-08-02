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
  type = list(string)
}

variable "node_type" {
  type = string
}

variable "cluster_mode" {
  type = bool
}

variable "common_tags" {
  type    = map(string)
  default = {}
}