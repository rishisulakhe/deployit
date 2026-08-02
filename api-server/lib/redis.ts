import { Redis } from "ioredis";
import { env } from "../env";
import { registerCounter } from "./metrics";

// Single publisher client reused across requests. Sentinel values:
//   maxRetriesPerRequest: null to avoid throwing inside BLPOP context (only
//   matters for the orchestrator, not the api-server, but safe to set here too).
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

export const redisQueuePushes = registerCounter(
  "api_server_queue_pushes_total",
  "Total build_queue RPUSH operations",
);

export async function pushBuildJob(job: unknown): Promise<void> {
  await redis.rpush(env.BUILD_QUEUE, JSON.stringify(job));
  redisQueuePushes.inc();
}

// Subscribe helper: returns a dedicated Redis subscriber client for the given
// channel. The caller is responsible for `subscriber.disconnect()` on cleanup.
export async function subscribe(
  channel: string,
): Promise<Redis> {
  const subscriber = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  await subscriber.subscribe(channel);
  return subscriber;
}