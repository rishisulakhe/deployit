import { z } from "zod";

// Permissive env: only PORT/REDIS/JWT_SECRET are hard required. Most other
// values have defaults suitable for local `docker compose up` development.
const schema = z.object({
  PORT: z.coerce.number().default(3001),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  DATABASE_URL: z
    .string()
    .default("postgresql://vercel:vercel@localhost:5432/vercel?schema=public"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  BUILD_QUEUE: z.string().default("build_queue"),
  BUILD_DLQ: z.string().default("build_dlq"),

  // GitHub OAuth — empty strings are OK in dev (auth route returns 502 if you
  // actually try to call it without configuring them).
  GITHUB_CLIENT_ID: z.string().default(""),
  GITHUB_CLIENT_SECRET: z.string().default(""),
  GITHUB_REDIRECT_URI: z.string().default("http://localhost:3000/api/auth/callback/github"),

  // Hono JWT signing secret. In dev we use a default for convenience; in prod
  // this MUST be set to a strong random value.
  JWT_SECRET: z.string().min(16).default("dev-insecure-jwt-secret-change-me"),

  // AWS credentials (optional — for ECS/S3 integration)
  AWS_REGION: z.string().default("ap-south-2"),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),

  NODE_ENV: z.string().default("development"),
});

export type Env = z.infer<typeof schema>;

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error(
    "api-server: invalid environment variables:",
    parsed.error.flatten().fieldErrors,
  );
  process.exit(1);
}

export const env: Env = parsed.data;