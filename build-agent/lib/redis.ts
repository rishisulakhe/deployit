import { Redis } from "ioredis";
import { env } from "../env";

const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1 });

export async function publishLog(
  deploymentId: string,
  line: string,
  stream: "stdout" | "stderr" = "stdout",
): Promise<void> {
  const message = JSON.stringify({ line, stream, ts: Date.now() });
  try {
    await redis.publish(`logs:${deploymentId}`, message);
  } catch (e) {
    // Log publisher should never crash the build; fall back to console.error.
    console.error("publishLog failed", (e as Error).message);
  }
}

export async function quit(): Promise<void> {
  await redis.quit().catch(() => {});
}