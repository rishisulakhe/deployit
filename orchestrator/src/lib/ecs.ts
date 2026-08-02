import {
  ECSClient,
  RunTaskCommand,
  DescribeTasksCommand,
  StopTaskCommand,
} from "@aws-sdk/client-ecs";
import { env } from "../env";

const credentials =
  env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined;

export const ecsClient = new ECSClient({
  region: env.AWS_REGION,
  ...(credentials ? { credentials } : {}),
});

export interface RunBuildTaskParams {
  deploymentId: string;
  projectId: string;
  slug: string;
  repoUrl: string;
  branch: string;
  rootDir: string;
  buildCommand: string;
  buildDir: string;
  userEnvVars: { key: string; value: string }[];
}

const MAX_ECS_ENV = 200; // hard ECS limit; be conservative.

export async function runBuildTask(params: RunBuildTaskParams): Promise<string> {
  const environment = [
    { name: "REPO_URL", value: params.repoUrl },
    { name: "BRANCH", value: params.branch },
    { name: "ROOT_DIR", value: params.rootDir },
    { name: "BUILD_COMMAND", value: params.buildCommand },
    { name: "BUILD_DIR", value: params.buildDir },
    { name: "DEPLOYMENT_ID", value: params.deploymentId },
    { name: "PROJECT_ID", value: params.projectId },
    { name: "SLUG", value: params.slug },
    { name: "REDIS_URL", value: env.REDIS_URL },
    { name: "S3_ARTIFACTS_BUCKET", value: env.S3_ARTIFACTS_BUCKET },
    { name: "S3_ARTIFACTS_PREFIX", value: env.S3_ARTIFACTS_PREFIX },
    { name: "AWS_REGION", value: env.AWS_REGION },
  ];

  let envCount = environment.length;
  for (const ev of params.userEnvVars) {
    if (envCount >= MAX_ECS_ENV) break; // drop overflow with warning
    environment.push({ name: ev.key, value: ev.value });
    envCount++;
  }

  const res = await ecsClient.send(
    new RunTaskCommand({
      cluster: env.ECS_CLUSTER,
      taskDefinition: env.ECS_BUILD_TASK_DEFINITION,
      launchType: "FARGATE",
      count: 1,
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: env.ECS_BUILD_SUBNETS.split(",").filter(Boolean),
          securityGroups: env.ECS_BUILD_SECURITY_GROUPS.split(",").filter(Boolean),
          assignPublicIp: "DISABLED",
        },
      },
      overrides: {
        containerOverrides: [
          {
            name: env.ECS_BUILD_CONTAINER_NAME,
            environment,
          },
        ],
      },
    }),
  );
  const tasks = res.tasks ?? [];
  const firstTask = tasks[0];
  if (!firstTask?.taskArn) {
    throw new Error("ecs_runtask_no_task");
  }
  return firstTask.taskArn;
}

export interface TaskStatus {
  state: string;
  exitCode?: number;
  stoppedReason?: string;
  stopCode?: string;
}

export async function describeTask(taskArn: string): Promise<TaskStatus | null> {
  const res = await ecsClient.send(
    new DescribeTasksCommand({
      cluster: env.ECS_CLUSTER,
      tasks: [taskArn],
    }),
  );
  const task = res.tasks?.[0];
  if (!task) return null;
  const container = task.containers?.[0];
  return {
    state: (task.lastStatus ?? "UNKNOWN") as string,
    exitCode: container?.exitCode,
    stoppedReason: task.stoppedReason ?? undefined,
    stopCode: task.stopCode ?? undefined,
  };
}

export async function stopTask(taskArn: string): Promise<void> {
  await ecsClient.send(
    new StopTaskCommand({
      cluster: env.ECS_CLUSTER,
      task: taskArn,
      reason: "orchestrator_timeout",
    }),
  );
}