import { z } from "zod";

const schema = z.object({
  EDGE_PROXY_PORT: z.coerce.number().default(8000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  DATABASE_URL: z.string().default(
    "postgresql://vercel:vercel@localhost:5432/vercel?schema=public",
  ),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // Backend base URL edge-proxy reverses to. In prod this is the CloudFront
  // distribution domain. In dev (no CloudFront) point at the S3 website URL.
  EDGE_PROXY_BACKEND_BASE_URL: z
    .string()
    .default("https://deployit-outputsrishi.s3.ap-south-2.amazonaws.com/__outputs"),

  // Cache TTL (seconds) for subdomain -> project lookups in Redis.
  EDGE_PROXY_CACHE_TTL: z.coerce.number().default(120),

  // URL of the not-found app for unknown/private/unbuilt projects.
  EDGE_PROXY_NOT_FOUND_URL: z
    .string()
    .default(""),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error(
    "edge-proxy: invalid environment:",
    parsed.error.flatten().fieldErrors,
  );
  process.exit(1);
}

export type EdgeEnv = z.infer<typeof schema>;
export const env: EdgeEnv = parsed.data;