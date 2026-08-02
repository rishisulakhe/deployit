import { Redis } from "ioredis";
import { env } from "../env";

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

export async function blpopBuildQueue(timeout = 5): Promise<string | null> {
  const res = await redis.blpop(env.BUILD_QUEUE, timeout);
  return res ? res[1] : null;
}

export async function rpush(queue: string, msg: string): Promise<void> {
  await redis.rpush(queue, msg);
}

export async function queueDepth(): Promise<number> {
  return redis.llen(env.BUILD_QUEUE);
}