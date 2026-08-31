// prisma.config.ts — loaded by `bunx prisma migrate dev` and `prisma generate`.
// Loads .env from the monorepo root so DATABASE_URL is available.
//
// CI has no .env (gitignored), so DATABASE_URL falls back to a placeholder —
// `prisma generate` never opens a connection, it only needs the schema.

import { config } from "dotenv";
import { resolve } from "node:path";
import { defineConfig } from "prisma/config";

config({ path: resolve(import.meta.dirname, "..", ".env") });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://ci:ci@localhost:5432/ci-placeholder",
  },
});