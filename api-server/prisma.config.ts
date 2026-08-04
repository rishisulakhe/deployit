// prisma.config.ts — loaded by `bunx prisma migrate dev` and `prisma generate`.
// Loads .env from the monorepo root so DATABASE_URL is available.

import { config } from "dotenv";
import { resolve } from "node:path";
import { defineConfig, env } from "prisma/config";

config({ path: resolve(import.meta.dirname, "..", ".env") });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});