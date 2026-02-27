import { getRedisClient } from '@/lib/bonafied/redis';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const CACHE = new Map<string, CacheEntry<unknown>>();

export async function getCached<T>(key: string): Promise<T | null> {
  const redis = await getRedisClient();
  if (redis) {
    try {
      const raw = await redis.get(key);
      if (!raw) {
        return null;
      }
      return JSON.parse(raw) as T;
    } catch {
      // fall through to memory cache
    }
  }

  const hit = CACHE.get(key);
  if (!hit) {
    return null;
  }
  if (Date.now() > hit.expiresAt) {
    CACHE.delete(key);
    return null;
  }
  return hit.value as T;
}

export async function setCached<T>(key: string, value: T, ttlMs: number): Promise<void> {
  const redis = await getRedisClient();
  if (redis) {
    try {
      await redis.set(key, JSON.stringify(value), {
        PX: ttlMs
      });
      return;
    } catch {
      // fall through to memory cache
    }
  }

  CACHE.set(key, {
    value,
    expiresAt: Date.now() + ttlMs
  });
}

export async function invalidateByPrefix(prefix: string): Promise<void> {
  const redis = await getRedisClient();
  if (redis) {
    try {
      const scanner = redis.scanIterator({
        MATCH: `${prefix}*`,
        COUNT: 100
      });
      for await (const key of scanner) {
        await redis.del(key);
      }
    } catch {
      // continue into memory invalidation
    }
  }

  for (const key of CACHE.keys()) {
    if (key.startsWith(prefix)) {
      CACHE.delete(key);
    }
  }
}
