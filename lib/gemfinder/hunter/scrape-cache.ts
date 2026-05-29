// lib/gemfinder/hunter/scrape-cache.ts
import type { SteelScrapeResult } from './steel';
import { getScoutPool, ensureSchema } from '../scout-candidate-store';
import { normalizeUrl } from './steel';

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function cacheKey(workspaceId: string, url: string): string {
  return `${workspaceId}::${normalizeUrl(url)}`;
}

export async function getCached(workspaceId: string, url: string): Promise<SteelScrapeResult | null> {
  await ensureSchema();
  const key = cacheKey(workspaceId, url);
  const res = await getScoutPool().query(
    `SELECT result FROM hunter_scrape_cache WHERE cache_key = $1 AND expires_at > NOW() LIMIT 1`,
    [key]
  );
  if (!res.rows.length) return null;
  return res.rows[0].result as SteelScrapeResult;
}

export async function putCached(workspaceId: string, url: string, result: SteelScrapeResult): Promise<void> {
  await ensureSchema();
  const key = cacheKey(workspaceId, url);
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
  await getScoutPool().query(
    `INSERT INTO hunter_scrape_cache (cache_key, scrape_url, result, expires_at)
     VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (cache_key) DO UPDATE SET result = $3::jsonb, cached_at = NOW(), expires_at = $4`,
    [key, normalizeUrl(url), JSON.stringify(result), expiresAt]
  );
  // Lazy cleanup: run ~5% of writes to avoid hot-path DB load under burst
  if (Math.random() < 0.05) {
    await getScoutPool().query(`DELETE FROM hunter_scrape_cache WHERE expires_at < NOW()`);
  }
}
