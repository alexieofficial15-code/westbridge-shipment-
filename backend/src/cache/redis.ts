import { Redis } from "ioredis";
import { env } from "../config/env.js";

/**
 * Shared cache for all backend servers. Optional: when REDIS_URL is not set
 * every helper is a no-op and requests go straight to MongoDB.
 */
export const redis: Redis | null = env.REDIS_URL
  ? new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2 })
  : null;

redis?.on("error", (error: Error) => {
  console.error("[redis]", error.message);
});

// A cache problem must never break a request, so failures fall through to the database.

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    // ignored on purpose
  }
}

export async function cacheDelete(key: string): Promise<void> {
  if (!redis) return;
  try {
    await redis.del(key);
  } catch {
    // ignored on purpose
  }
}
