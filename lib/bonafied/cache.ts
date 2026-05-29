type CacheEntry = {
  expiresAt: number;
  value: unknown;
};

const CACHE_KEY = '__bonafied_cache_v1__';

function getCacheMap(): Map<string, CacheEntry> {
  const g = globalThis as typeof globalThis & { [CACHE_KEY]?: Map<string, CacheEntry> };
  if (!g[CACHE_KEY]) {
    g[CACHE_KEY] = new Map<string, CacheEntry>();
  }
  return g[CACHE_KEY] as Map<string, CacheEntry>;
}

export async function getCached<T>(key: string): Promise<T | null> {
  const map = getCacheMap();
  const hit = map.get(key);
  if (!hit) return null;

  if (Date.now() > hit.expiresAt) {
    map.delete(key);
    return null;
  }

  return hit.value as T;
}

export async function setCached<T>(key: string, value: T, ttlMs = 20_000): Promise<void> {
  const map = getCacheMap();
  map.set(key, {
    value,
    expiresAt: Date.now() + Math.max(0, ttlMs),
  });
}

export async function invalidateByPrefix(prefix: string): Promise<void> {
  const map = getCacheMap();
  for (const key of map.keys()) {
    if (key.startsWith(prefix)) {
      map.delete(key);
    }
  }
}
