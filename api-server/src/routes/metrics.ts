import { Hono } from "hono";
import { renderPrometheus } from "../../lib/metrics";
import type { AppEnv } from "../types";

export const metricsRoutes = new Hono<AppEnv>();

metricsRoutes.get("/", (c) =>
  c.text(
    renderPrometheus(),
    200,
    { "Content-Type": "text/plain; version=0.0.4" },
  ),
);