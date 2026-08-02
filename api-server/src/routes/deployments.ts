import { Hono } from "hono";
import { Redis } from "ioredis";
import prisma from "../../lib/prisma";
import { env } from "../../env";
import { pushBuildJob, subscribe } from "../../lib/redis";
import { decrypt } from "../../lib/kms";
import { registerCounter } from "../../lib/metrics";
import { logger } from "../../lib/logger";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

interface DecryptedEnvVar {
  key: string;
  value: string;
}

interface BuildJob {
  deploymentId: string;
  projectId: string;
  slug: string;
  repoOwner: string;
  repoName: string;
  branch: string;
  rootDir: string;
  buildCommand: string;
  buildDir: string;
  envVars: DecryptedEnvVar[];
  githubToken: string;
  attempt: number;
}

const deployCounter = registerCounter(
  "api_server_deployments_triggered_total",
  "Total deployments triggered via /projects/:id/deployments",
);
const sseConnections = registerCounter(
  "api_server_sse_connections_total",
  "Total SSE log stream connections opened",
);

export const deployments = new Hono<AppEnv>();
deployments.use("*", requireAuth);

// POST /projects/:id/deployments  — create a Deployment, push a BuildJob.
deployments.post("/projects/:id/deployments", async (c) => {
  const user = c.get("user");
  const project = await prisma.project.findFirst({
    where: { id: c.req.param("id"), userId: user.sub },
    include: { envVars: true },
  });
  if (!project) return c.json({ error: "not_found" }, 404);

  // Decrypt project env vars (so the orchestrator can inject them into ECS task env).
  const envVars: DecryptedEnvVar[] = project.envVars.length
    ? await Promise.all(
        project.envVars.map(async (v) => ({
          key: v.key,
          value: Buffer.from(await decrypt(Buffer.from(v.encryptedValue))).toString("utf8"),
        })),
      )
    : [];

  // Decrypt the user's GitHub token for the build-agent to clone with.
  let githubToken = "";
  const userRow = await prisma.user.findUnique({ where: { id: user.sub } });
  if (userRow?.encryptedToken) {
    githubToken = Buffer.from(await decrypt(Buffer.from(userRow.encryptedToken))).toString(
      "utf8",
    );
  }

  const deployment = await prisma.deployment.create({
    data: { projectId: project.id, status: "QUEUED" },
  });

  const job: BuildJob = {
    deploymentId: deployment.id,
    projectId: project.id,
    slug: project.slug,
    repoOwner: project.repoOwner,
    repoName: project.repoName,
    branch: project.branch,
    rootDir: project.rootDir ?? "",
    buildCommand: project.buildCommand ?? "npm run build",
    buildDir: project.buildDir ?? "dist",
    envVars,
    githubToken,
    attempt: 0,
  };

  await pushBuildJob(job);
  deployCounter.inc();
  logger.info("deployment_queued", {
    deploymentId: deployment.id,
    projectId: project.id,
    slug: project.slug,
  });
  return c.json({ deployment }, 201);
});

// GET /projects/:id/deployments — recent deployments for a project.
deployments.get("/projects/:id/deployments", async (c) => {
  const user = c.get("user");
  const project = await prisma.project.findFirst({
    where: { id: c.req.param("id"), userId: user.sub },
    select: { id: true },
  });
  if (!project) return c.json({ error: "not_found" }, 404);
  const items = await prisma.deployment.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return c.json({ deployments: items });
});

// GET /deployments/:id — single deployment.
deployments.get("/deployments/:id", async (c) => {
  const user = c.get("user");
  const deployment = await prisma.deployment.findUnique({
    where: { id: c.req.param("id") },
    include: { project: true },
  });
  if (!deployment || deployment.project.userId !== user.sub) {
    return c.json({ error: "not_found" }, 404);
  }
  return c.json({ deployment });
});

// GET /deployments/:id/logs — paginated historical logs (oldest first).
deployments.get("/deployments/:id/logs", async (c) => {
  const user = c.get("user");
  const deployment = await prisma.deployment.findUnique({
    where: { id: c.req.param("id") },
    include: { project: true },
  });
  if (!deployment || deployment.project.userId !== user.sub) {
    return c.json({ error: "not_found" }, 404);
  }
  const logs = await prisma.buildLog.findMany({
    where: { deploymentId: deployment.id },
    orderBy: { ts: "asc" },
    take: Number(c.req.query("limit") ?? 1000),
  });
  return c.json({ logs });
});

// GET /deployments/:id/logs/stream — Server-Sent Events live log stream.
//
// Client connect example (browser EventSource API):
//   new EventSource("/api/deployments/<id>/logs/stream?token=<jwt>")
// On connect, the stream first replays existing BuildLog rows from the DB and
// then forwards messages from the Redis pub/sub channel `logs:<deploymentId>`.
deployments.get("/deployments/:id/logs/stream", async (c) => {
  const user = c.get("user");
  const deploymentId = c.req.param("id");
  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    include: { project: true },
  });
  if (!deployment || deployment.project.userId !== user.sub) {
    return c.json({ error: "not_found" }, 404);
  }

  sseConnections.inc();
  const channel = `logs:${deploymentId}`;
  // Outer-scope holders so `cancel()` can clean them up — `ReadableStream`
  // `cancel()` doesn't receive the controller as an argument.
  let subscriber: Redis | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();

      // Replay existing logs from DB.
      try {
        const existing = await prisma.buildLog.findMany({
          where: { deploymentId },
          orderBy: { ts: "asc" },
          take: 5000,
        });
        for (const log of existing) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                line: log.line,
                stream: log.stream,
                ts: log.ts,
              })}\n\n`,
            ),
          );
        }
      } catch (err) {
        logger.warn("sse_log_replay_failed", {
          deploymentId,
          error: (err as Error).message,
        });
      }

      // Subscribe to Redis pub/sub.
      subscriber = await subscribe(channel);
      subscriber.on("message", (ch, message) => {
        if (ch !== channel) return;
        try {
          controller.enqueue(encoder.encode(`data: ${message}\n\n`));
        } catch {
          // controller closed (client gone); swallow.
        }
      });

      // Heartbeat every 15s so intermediaries don't drop the connection.
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          // swallowed
        }
      }, 15000);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      try { subscriber?.disconnect(); } catch { /* swallow */ }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});