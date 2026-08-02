output "cluster_name" {
  value = aws_ecs_cluster.this.name
}

output "cluster_arn" {
  value = aws_ecs_cluster.this.arn
}

output "security_group_id" {
  value = aws_security_group.tasks.id
}

output "build_agent_task_definition_arn" {
  value = aws_ecs_task_definition.build_agent.arn
}

output "build_agent_task_definition_family" {
  value = aws_ecs_task_definition.build_agent.family
}

output "build_agent_task_role_arn" {
  value = aws_iam_role.build_task.arn
}

output "build_agent_execution_role_arn" {
  value = aws_iam_role.build_exec.arn
}