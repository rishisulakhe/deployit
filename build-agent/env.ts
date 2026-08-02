import { z } from "zod";

const schema = z.object({
  REPO_URL: z.string().min(1), // may not parse as URL — credentials embedded.
  BRANCH: z.string().min(1),
  ROOT_DIR: z.string().default(""),
  BUILD_COMMAND: z.string().default("npm run build"),
  BUILD_DIR: z.string().default("dist"),
  DEPLOYMENT_ID: z.string().uuid(),
  PROJECT_ID: z.string().uuid(),
  SLUG: z.string().default(""),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  S3_ARTIFACTS_BUCKET: z.string().min(1),
  S3_ARTIFACTS_PREFIX: z.string().default("projects"),
  AWS_REGION: z.string().default("ap-south-2"),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error(
    "build-agent: invalid environment:",
    parsed.error.flatten().fieldErrors,
  );
  process.exit(1);
}

export type BuildEnv = z.infer<typeof schema>;
export const env: BuildEnv = parsed.data;