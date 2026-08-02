variable "name_prefix" {
  type = string
}

variable "origin_bucket_name" {
  type        = string
  description = "S3 bucket name backing the CloudFront distribution."
}

variable "origin_bucket_reg" {
  type        = string
  description = "Region of the S3 origin bucket."
}

variable "price_class" {
  type        = string
  description = "CloudFront price class."
  default     = "PriceClass_200"
}

variable "common_tags" {
  type    = map(string)
  default = {}
}