import { createClient, type RedisClientType } from 'redis';

let client: RedisClientType | null = null;
let connecting: Promise<RedisClientType | null> | null = null;

export function hasRedis(): boolean {
  return Boolean(process.env.REDIS_URL);
}

export async function getRedisClient(): Promise<RedisClientType | null> {
  if (!hasRedis()) {
    return null;
  }

  if (client && client.isOpen) {
    return client;
  }

  if (connecting) {
    return connecting;
  }

  connecting = (async () => {
    try {
      client = createClient({
        url: process.env.REDIS_URL
      });
      client.on('error', () => {
        // Keep runtime resilient by falling back to memory cache.
      });
      await client.connect();
      return client;
    } catch {
      client = null;
      return null;
    } finally {
      connecting = null;
    }
  })();

  return connecting;
}
