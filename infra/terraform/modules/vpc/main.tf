resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags                 = merge(var.common_tags, { Name = "${var.name_prefix}-vpc" })
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = merge(var.common_tags, { Name = "${var.name_prefix}-igw" })
}

# Public subnets — one per AZ.
resource "aws_subnet" "public" {
  count                   = length(var.az_names)
  vpc_id                  = aws_vpc.this.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 4, count.index)
  availability_zone       = var.az_names[count.index]
  map_public_ip_on_launch = true
  tags = merge(var.common_tags, {
    Name = "${var.name_prefix}-public-${count.index}"
    Tier = "public"
  })
}

# Private subnets — one per AZ, shifted index.
resource "aws_subnet" "private" {
  count             = length(var.az_names)
  vpc_id            = aws_vpc.this.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index + length(var.az_names))
  availability_zone = var.az_names[count.index]
  tags = merge(var.common_tags, {
    Name = "${var.name_prefix}-private-${count.index}"
    Tier = "private"
  })
}

# Single NAT GW in the first public subnet (cost saver for dev).
resource "aws_eip" "nat" {
  domain = "vpc"
  tags   = merge(var.common_tags, { Name = "${var.name_prefix}-nat-eip" })
}

resource "aws_nat_gateway" "this" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id
  depends_on    = [aws_internet_gateway.this]
  tags          = merge(var.common_tags, { Name = "${var.name_prefix}-nat" })
}

# Public route table — egress via IGW.
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  tags   = merge(var.common_tags, { Name = "${var.name_prefix}-public-rt" })
}

resource "aws_route" "public" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.this.id
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Private route table — egress via NAT GW.
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.this.id
  tags   = merge(var.common_tags, { Name = "${var.name_prefix}-private-rt" })
}

resource "aws_route" "private" {
  route_table_id         = aws_route_table.private.id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.this.id
}

resource "aws_route_table_association" "private" {
  count          = length(aws_subnet.private)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}