# Remote state lives in an S3 bucket with a DynamoDB lock table.
#
# The state bucket + lock table must be created ONCE by hand before the first
# `terraform init`. See `README.md` for the manual one-time bootstrap commands.
# Until that bucket exists, comment this block out and use local state.

terraform {
  backend "s3" {
    bucket         = "vercel-clone-tfstate" # create this manually (see README.md)
    key            = "infra/terraform.tfstate"
    region         = "ap-south-2"
    dynamodb_table = "vercel-clone-tfstate-lock"
    encrypt        = true
  }
}