import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "../env";
import { logger } from "../lib/logger";
import { errorHandler } from "./middleware/error";
import { healthz } from "./routes/healthz";
import { metricsRoutes } from "./routes/metrics";
import { auth } from "./routes/auth";
import { github } from "./routes/github";
import { projects } from "./routes/projects";
import { deployments } from "./routes/deployments";
import { envvars } from "./routes/envvars";
import { webhooks } from "./routes/webhooks";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

app.use("*", cors({
  origin: ["http://localhost:3000", "http://localhost:3001"],
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  exposeHeaders: ["Content-Type"],
  credentials: true,
}));

app.notFound((c) => c.json({ error: "not_found" }, 404));
app.onError(errorHandler);

app.route("/healthz", healthz);
app.route("/metrics", metricsRoutes);
app.route("/auth", auth);
app.route("/", github);
app.route("/", projects);
app.route("/", deployments);
app.route("/", envvars);
app.route("/webhooks", webhooks);

const port = env.PORT;
Bun.serve({ port, fetch: app.fetch });
logger.info("api-server listening", { port, env: env.NODE_ENV });