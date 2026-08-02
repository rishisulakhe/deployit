import { Hono } from "hono";
import type { AppEnv } from "../types";

export const healthz = new Hono<AppEnv>();

healthz.get("/", (c) =>
  c.json({ ok: true, service: "api-server", ts: Date.now() }),
);