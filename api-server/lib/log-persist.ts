import { Redis } from "ioredis";
import { env } from "../env";
import prisma from "./prisma";
import { logger } from "./logger";

// Background worker that subscribes to logs:* channels and persists
// each log line to the BuildLog table for historical replay.
let subscriber: Redis | null = null;

export async function startLogPersistWorker(): Promise<void> {
  subscriber = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  
  // Use psubscribe for pattern matching (logs:*)
  await subscriber.psubscribe("logs:*");
  
  subscriber.on("pmessage", async (pattern, channel, message) => {
    if (!channel.startsWith("logs:")) return;
    
    const deploymentId = channel.slice(5); // "logs:".length
    if (!deploymentId) return;
    
    try {
      const parsed = JSON.parse(message) as { line: string; stream?: string; ts?: number };
      await prisma.buildLog.create({
        data: {
          deploymentId,
          line: parsed.line,
          stream: parsed.stream ?? "stdout",
          ts: parsed.ts ? new Date(parsed.ts) : new Date(),
        },
      });
    } catch (e) {
      logger.warn("log_persist_failed", {
        deploymentId,
        error: (e as Error).message,
        message: message.slice(0, 100),
      });
    }
  });
  
  subscriber.on("error", (e) => {
    logger.error("log_persist_worker_error", { error: e.message });
  });
  
  logger.info("log_persist_worker_started");
}

export async function stopLogPersistWorker(): Promise<void> {
  if (subscriber) {
    await subscriber.punsubscribe("logs:*");
    await subscriber.quit();
    subscriber = null;
    logger.info("log_persist_worker_stopped");
  }
}
