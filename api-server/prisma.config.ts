// prisma.config.ts — loaded by `bunx prisma migrate dev` and `prisma generate`.
// Loads .env from the api-server/ directory so DATABASE_URL is available.

import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: ".env" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"] ?? "",
  },
});