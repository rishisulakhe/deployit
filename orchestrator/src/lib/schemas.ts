import { z } from "zod";

export const buildJobSchema = z.object({
  deploymentId: z.string().uuid(),
  projectId: z.string().uuid(),
  slug: z.string().min(1).max(80),
  repoOwner: z.string().min(1).max(100),
  repoName: z.string().min(1).max(100),
  branch: z.string().min(1).max(200),
  rootDir: z.string().max(500).default(""),
  buildCommand: z.string().max(500).default("npm run build"),
  buildDir: z.string().max(200).default("dist"),
  envVars: z
    .array(
      z.object({
        key: z.string().min(1).max(64),
        value: z.string().max(8192),
      }),
    )
    .default([]),
  githubToken: z.string(),
  attempt: z.number().int().min(0).default(0),
});

export type BuildJob = z.infer<typeof buildJobSchema>;