import { spawn, type ChildProcess } from "node:child_process";
import * as path from "node:path";
import { env } from "../env";
import { logger } from "./logger";

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

export interface TaskStatus {
  state: string;
  exitCode?: number;
  stoppedReason?: string;
  stopCode?: string;
}

export function isLocalMode(): boolean {
  return env.ECS_BUILD_TASK_SUBNETS.length === 0;
}

// ── Local subprocess tracking ────────────────────────────────────────────────

const children = new Map<string, ChildProcess>();
const exitCodes = new Map<string, number>();

function trackChild(taskArn: string, child: ChildProcess) {
  children.set(taskArn, child);
  child.on("exit", (code) => {
    exitCodes.set(taskArn, code ?? 1);
    children.delete(taskArn);
  });
  child.on("error", () => {
    exitCodes.set(taskArn, 1);
    children.delete(taskArn);
  });
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function runBuildTask(params: RunBuildTaskParams): Promise<string> {
  if (isLocalMode()) {
    return runLocalBuild(params);
  }
  return runEcsBuild(params);
}

export async function describeTask(taskArn: string): Promise<TaskStatus | null> {
  if (taskArn.startsWith("local:")) {
    const exitCode = exitCodes.get(taskArn);
    if (exitCode !== undefined) {
      return {
        state: "STOPPED",
        exitCode,
        stoppedReason: exitCode === 0 ? "success" : "build_failed",
      };
    }
    return { state: "RUNNING" };
  }
  return describeEcsTask(taskArn);
}

export async function stopTask(taskArn: string): Promise<void> {
  if (taskArn.startsWith("local:")) {
    const child = children.get(taskArn);
    if (child) child.kill("SIGTERM");
    return;
  }
  await stopEcsTask(taskArn);
}

// ── Local build ──────────────────────────────────────────────────────────────

async function runLocalBuild(params: RunBuildTaskParams): Promise<string> {
  const buildAgentDir = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "../../../build-agent",
  );

  const childEnv: Record<string, string> = {
    ...process.env,
    REPO_URL: params.repoUrl,
    BRANCH: params.branch,
    ROOT_DIR: params.rootDir,
    BUILD_COMMAND: params.buildCommand,
    BUILD_DIR: params.buildDir,
    DEPLOYMENT_ID: params.deploymentId,
    PROJECT_ID: params.projectId,
    SLUG: params.slug,
    REDIS_URL: env.ECS_REDIS_URL || env.REDIS_URL,
    S3_ARTIFACTS_BUCKET: env.S3_ARTIFACTS_BUCKET,
    S3_ARTIFACTS_PREFIX: env.S3_ARTIFACTS_PREFIX,
    AWS_REGION: env.AWS_REGION,
  };

  for (const ev of params.userEnvVars) {
    childEnv[ev.key] = ev.value;
  }

  logger.info("local_build_started", {
    deploymentId: params.deploymentId,
    buildAgentDir,
  });

  const child = spawn("bun", ["src/index.ts"], {
    cwd: buildAgentDir,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const taskArn = `local:${child.pid ?? 0}`;

  child.stdout?.on("data", (data: Buffer) => {
    for (const line of data.toString().split("\n")) {
      if (line.trim()) logger.info("build_agent", { deploymentId: params.deploymentId, line });
    }
  });
  child.stderr?.on("data", (data: Buffer) => {
    for (const line of data.toString().split("\n")) {
      if (line.trim()) logger.warn("build_agent", { deploymentId: params.deploymentId, line });
    }
  });

  trackChild(taskArn, child);
  return taskArn;
}

// ── ECS Fargate build (prod) ─────────────────────────────────────────────────

function makeEcsClient() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ECSClient } = require("@aws-sdk/client-ecs");
  const credentials =
    env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
      ? { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY }
      : undefined;
  return new ECSClient({ region: env.AWS_REGION, ...(credentials ? { credentials } : {}) });
}

async function runEcsBuild(params: RunBuildTaskParams): Promise<string> {
  const ecsClient = makeEcsClient();
  const { RunTaskCommand } = await import("@aws-sdk/client-ecs");

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

  for (const ev of params.userEnvVars) {
    if (environment.length >= 200) break;
    environment.push({ name: ev.key, value: ev.value });
  }

  const res = await ecsClient.send(
    new RunTaskCommand({
      cluster: env.ECS_CLUSTER,
      taskDefinition: env.ECS_BUILD_TASK_DEFINITION,
      launchType: "FARGATE",
      count: 1,
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: env.ECS_BUILD_TASK_SUBNETS.split(",").filter(Boolean),
          securityGroups: env.ECS_BUILD_TASK_SECURITY_GROUPS.split(",").filter(Boolean),
          assignPublicIp: "ENABLED",
        },
      },
      overrides: {
        containerOverrides: [{ name: env.ECS_BUILD_CONTAINER_NAME, environment }],
      },
    }),
  );
  const taskArn = res.tasks?.[0]?.taskArn;
  if (!taskArn) throw new Error("ecs_runtask_no_task");
  return taskArn;
}

async function describeEcsTask(taskArn: string): Promise<TaskStatus | null> {
  const ecsClient = makeEcsClient();
  const { DescribeTasksCommand } = await import("@aws-sdk/client-ecs");
  const res = await ecsClient.send(
    new DescribeTasksCommand({ cluster: env.ECS_CLUSTER, tasks: [taskArn] }),
  );
  const task = res.tasks?.[0];
  if (!task) return null;
  return {
    state: (task.lastStatus ?? "UNKNOWN") as string,
    exitCode: task.containers?.[0]?.exitCode,
    stoppedReason: task.stoppedReason ?? undefined,
    stopCode: task.stopCode ?? undefined,
  };
}

async function stopEcsTask(taskArn: string): Promise<void> {
  const ecsClient = makeEcsClient();
  const { StopTaskCommand } = await import("@aws-sdk/client-ecs");
  await ecsClient.send(
    new StopTaskCommand({ cluster: env.ECS_CLUSTER, task: taskArn, reason: "orchestrator_timeout" }),
  );
}
