import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(3002),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  DATABASE_URL: z.string().default(
    "postgresql://vercel:vercel@localhost:5432/vercel?schema=public",
  ),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  BUILD_QUEUE: z.string().default("build_queue"),
  BUILD_DLQ: z.string().default("build_dlq"),

  AWS_REGION: z.string().default("ap-south-2"),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),

  // ECS Fargate build dispatch.
  ECS_CLUSTER: z.string().default("vercel-clone-dev"),
  ECS_BUILD_TASK_DEFINITION: z.string().default("vercel-clone-dev-build-agent"),
  ECS_BUILD_CONTAINER_NAME: z.string().default("build-agent"),
  // RunTask NetworkConfiguration awsvpc config:
  ECS_BUILD_SUBNETS: z.string().default(""),
  ECS_BUILD_SECURITY_GROUPS: z.string().default(""),

  // Total per-attempt timeout. Zero disables the timeout (debug only).
  ECS_BUILD_TIMEOUT_SECONDS: z.coerce.number().default(900),

  MAX_RETRIES: z.coerce.number().default(3),

  // Build-agent reads S3 destination from env injected on the task. The
  // orchestrator forwards these so the build-agent picks up the same bucket
  // without baking it into its task definition.
  S3_ARTIFACTS_BUCKET: z.string().default("vercel-clone-artifacts-dev"),
  S3_ARTIFACTS_PREFIX: z.string().default("projects"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error(
    "orchestrator: invalid environment:",
    parsed.error.flatten().fieldErrors,
  );
  process.exit(1);
}

export type OrchestratorEnv = z.infer<typeof schema>;
export const env: OrchestratorEnv = parsed.data;