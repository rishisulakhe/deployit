import { Redis } from "ioredis";
import { env } from "../env";

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 1,
  enableReadyCheck: true,
});

export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await redis.get(key).catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds = env.EDGE_PROXY_CACHE_TTL,
): Promise<void> {
  await redis
    .set(key, JSON.stringify(value), "EX", ttlSeconds)
    .catch(() => {});
}