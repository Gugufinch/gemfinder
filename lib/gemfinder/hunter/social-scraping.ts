// lib/gemfinder/hunter/social-scraping.ts
//
// Fetches real Instagram + TikTok follower counts via Steel managed-browser.
// Uses the shared Steel semaphore (quota-safe on the free tier).
// Results are cached 30 days under ig:{handle} / tt:{handle} keys.

import { steelSem } from '@/lib/gemfinder/hunter/steel';
import { getCached, putCached } from '@/lib/gemfinder/hunter/scrape-cache';
import type { SteelScrapeResult } from '@/lib/gemfinder/hunter/steel';

// ---------------------------------------------------------------------------
// Follower-string parser
// ---------------------------------------------------------------------------

/**
 * parseFollowerString turns a raw count string from a meta tag or JSON field
 * into an integer.
 *
 * Handles:
 *   "1.2M Followers, ..." → 1200000
 *   "350K"                → 350000
 *   "12,400"              → 12400
 *   "1,234,567"           → 1234567
 *   "5.7M Followers"      → 5700000
 *   "abc" / "" / undefined → null
 */
export function parseFollowerString(raw: string | null | undefined): number | null {
  if (!raw) return null;

  // Strip everything after and including the first non-numeric character that
  // indicates a trailing label (e.g. " Followers, 350 Following...").
  // We only care about the leading number token.
  const token = raw.trim().split(/\s+/)[0];
  if (!token) return null;

  // Remove commas used as thousand separators
  const cleaned = token.replace(/,/g, '');

  const mSuffix = /^([\d.]+)[Mm]$/.exec(cleaned);
  if (mSuffix) {
    const n = parseFloat(mSuffix[1]);
    return isNaN(n) ? null : Math.round(n * 1_000_000);
  }

  const kSuffix = /^([\d.]+)[Kk]$/.exec(cleaned);
  if (kSuffix) {
    const n = parseFloat(kSuffix[1]);
    return isNaN(n) ? null : Math.round(n * 1_000);
  }

  const plain = parseInt(cleaned, 10);
  return isNaN(plain) ? null : plain;
}

// ---------------------------------------------------------------------------
// Steel fetch helper — shared by IG and TikTok
// ---------------------------------------------------------------------------

async function fetchHtml(url: string): Promise<string | null> {
  const apiKey = process.env.STEEL_API_KEY;
  if (!apiKey) {
    console.warn('[HUNTER_SOCIAL] STEEL_API_KEY not set; skipping scrape');
    return null;
  }

  await steelSem.acquire();
  try {
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 30_000);

    let res: Response;
    try {
      res = await fetch('https://api.steel.dev/v1/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url, returnHtml: true, timeout: 30_000 }),
        signal: ctrl.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn('[HUNTER_SOCIAL] network error fetching', url, err);
      return null;
    }
    clearTimeout(timeoutId);

    if (res.status === 429) {
      console.warn('[HUNTER_SOCIAL] 429 quota exhausted for', url);
      return null;
    }
    if (!res.ok) {
      console.warn(`[HUNTER_SOCIAL] HTTP ${res.status} for ${url}`);
      return null;
    }

    const body = await res.json().catch(() => null) as { pageHtml?: string } | null;
    if (!body?.pageHtml) {
      console.warn('[HUNTER_SOCIAL] empty response for', url);
      return null;
    }

    return body.pageHtml;
  } finally {
    steelSem.release();
  }
}

// ---------------------------------------------------------------------------
// Cache helpers — store as a SteelScrapeResult so we reuse the existing table.
// Cache key prefix prevents collisions with website scrapes.
// ---------------------------------------------------------------------------

const SOCIAL_WORKSPACE = '__social__';

function igCacheUrl(handle: string): string {
  return `ig:${handle}`;
}

function ttCacheUrl(handle: string): string {
  return `tt:${handle}`;
}

function ytCacheUrl(handle: string): string {
  return `yt:${handle}`;
}

function scCacheUrl(handle: string): string {
  return `sc:${handle}`;
}

function htmlToFakeScrapeResult(html: string, url: string): SteelScrapeResult {
  return { url, pageHtml: html, scrapedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Instagram follower extraction
// ---------------------------------------------------------------------------

function extractInstagramFollowers(html: string): number | null {
  // Strategy 1: <meta name="description" content="1.2M Followers, ..." />
  const metaMatch = /<meta\s[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i.exec(html)
    ?? /<meta\s[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i.exec(html);
  if (metaMatch) {
    const followersRe = /([\d,.]+[KkMm]?)\s*Followers/i.exec(metaMatch[1]);
    if (followersRe) {
      const n = parseFollowerString(followersRe[1]);
      if (n !== null) return n;
    }
  }

  // Strategy 2: JSON-LD block containing followerCount
  const jsonLdMatches = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of jsonLdMatches) {
    try {
      const obj = JSON.parse(match[1]) as Record<string, unknown>;
      const count = obj.followerCount ?? (obj.interactionStatistic as Record<string, unknown>)?.userInteractionCount;
      if (typeof count === 'number') return count;
      if (typeof count === 'string') {
        const n = parseFollowerString(count);
        if (n !== null) return n;
      }
    } catch {
      // ignore parse errors
    }
  }

  // Strategy 3: inline JSON like "edge_followed_by":{"count":12400}
  const edgeMatch = /"edge_followed_by"\s*:\s*\{\s*"count"\s*:\s*(\d+)/.exec(html);
  if (edgeMatch) {
    const n = parseInt(edgeMatch[1], 10);
    if (!isNaN(n)) return n;
  }

  return null;
}

// ---------------------------------------------------------------------------
// TikTok follower extraction
// ---------------------------------------------------------------------------

function extractTikTokFollowers(html: string): number | null {
  // Strategy 1: meta description "X Followers" / "X fans"
  const metaMatch = /<meta\s[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i.exec(html)
    ?? /<meta\s[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i.exec(html);
  if (metaMatch) {
    const followersRe = /([\d,.]+[KkMm]?)\s*(?:Followers|fans)/i.exec(metaMatch[1]);
    if (followersRe) {
      const n = parseFollowerString(followersRe[1]);
      if (n !== null) return n;
    }
  }

  // Strategy 2: inline JSON "followerCount":12400 (number)
  const jsonNumberMatch = /"followerCount"\s*:\s*(\d+)/.exec(html);
  if (jsonNumberMatch) {
    const n = parseInt(jsonNumberMatch[1], 10);
    if (!isNaN(n)) return n;
  }

  // Strategy 3: inline JSON "followerCount":"12400" (string)
  const jsonStringMatch = /"followerCount"\s*:\s*"([^"]+)"/.exec(html);
  if (jsonStringMatch) {
    const n = parseFollowerString(jsonStringMatch[1]);
    if (n !== null) return n;
  }

  // Strategy 4: stats JSON "statsV2":{"followerCount":"12400"}
  const statsMatch = /"statsV2"\s*:\s*\{[^}]*"followerCount"\s*:\s*"([^"]+)"/.exec(html);
  if (statsMatch) {
    const n = parseFollowerString(statsMatch[1]);
    if (n !== null) return n;
  }

  return null;
}

// ---------------------------------------------------------------------------
// YouTube subscriber extraction
// ---------------------------------------------------------------------------

export function extractYouTubeSubscribers(html: string): number | null {
  // Strategy 1: ytInitialData has subscriberCountText.simpleText or .runs[0].text
  //   Examples: "12.4K subscribers", "1.2M subscribers", "934 subscribers"
  // We match BOTH the simpleText form and the runs form because YouTube
  // randomly picks between them depending on locale + rendering path.
  const simpleTextMatch = /"subscriberCountText"\s*:\s*\{[^}]*"simpleText"\s*:\s*"([^"]+)"/.exec(html);
  if (simpleTextMatch) {
    const n = parseFollowerString(simpleTextMatch[1]);
    if (n !== null) return n;
  }
  const runsMatch = /"subscriberCountText"\s*:\s*\{[^}]*"runs"\s*:\s*\[\s*\{\s*"text"\s*:\s*"([^"]+)"/.exec(html);
  if (runsMatch) {
    const n = parseFollowerString(runsMatch[1]);
    if (n !== null) return n;
  }

  // Strategy 2: meta tag <meta itemprop="subscriberCount" content="12400">
  const metaMatch = /<meta\s[^>]*itemprop=["']subscriberCount["'][^>]*content=["'](\d+)["']/i.exec(html)
    ?? /<meta\s[^>]*content=["'](\d+)["'][^>]*itemprop=["']subscriberCount["']/i.exec(html);
  if (metaMatch) {
    const n = parseInt(metaMatch[1], 10);
    if (!isNaN(n)) return n;
  }

  // Strategy 3: meta description hint ("Subscribe to my channel · 12K subscribers")
  const descMatch = /<meta\s[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i.exec(html);
  if (descMatch) {
    const subRe = /([\d,.]+[KkMm]?)\s*subscribers/i.exec(descMatch[1]);
    if (subRe) {
      const n = parseFollowerString(subRe[1]);
      if (n !== null) return n;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// SoundCloud follower extraction
// ---------------------------------------------------------------------------

export function extractSoundCloudFollowers(html: string): number | null {
  // Strategy 1: hydration JSON. SoundCloud injects a __sc_hydration block at
  // the bottom of the page with the artist profile object containing
  // "followers_count":12400. This is the most reliable signal — meta tags
  // are inconsistent across user vs band profiles.
  const hydrationMatch = /"followers_count"\s*:\s*(\d+)/.exec(html);
  if (hydrationMatch) {
    const n = parseInt(hydrationMatch[1], 10);
    if (!isNaN(n)) return n;
  }

  // Strategy 2: meta tag <meta property="soundcloud:user:followers_count" content="12400">
  const metaMatch = /<meta\s[^>]*property=["']soundcloud:user:followers_count["'][^>]*content=["'](\d+)["']/i.exec(html);
  if (metaMatch) {
    const n = parseInt(metaMatch[1], 10);
    if (!isNaN(n)) return n;
  }

  // Strategy 3: description-style fallback ("950 followers")
  const descMatch = /<meta\s[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i.exec(html);
  if (descMatch) {
    const fRe = /([\d,.]+[KkMm]?)\s*Followers/i.exec(descMatch[1]);
    if (fRe) {
      const n = parseFollowerString(fRe[1]);
      if (n !== null) return n;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function fetchInstagramFollowers(handle: string): Promise<number | null> {
  const url = `https://www.instagram.com/${handle}/`;
  const cacheKey = igCacheUrl(handle);

  // Cache check
  let cached: SteelScrapeResult | null = null;
  try {
    cached = await getCached(SOCIAL_WORKSPACE, cacheKey);
  } catch (err) {
    console.warn('[HUNTER_SOCIAL] IG cache lookup failed for', handle, err);
  }

  let html: string | null = null;
  if (cached) {
    html = cached.pageHtml;
  } else {
    try {
      html = await fetchHtml(url);
    } catch (err) {
      console.warn('[HUNTER_SOCIAL] IG fetch failed for', handle, err);
      return null;
    }
    if (html) {
      const result = htmlToFakeScrapeResult(html, cacheKey);
      putCached(SOCIAL_WORKSPACE, cacheKey, result).catch((err) =>
        console.warn('[HUNTER_SOCIAL] IG putCached failed for', handle, err)
      );
    }
  }

  if (!html) return null;

  const followers = extractInstagramFollowers(html);
  if (followers === null) {
    console.warn('[HUNTER_SOCIAL] IG no follower count found for', handle);
  }
  return followers;
}

export async function fetchTiktokFollowers(handle: string): Promise<number | null> {
  const url = `https://www.tiktok.com/@${handle}`;
  const cacheKey = ttCacheUrl(handle);

  // Cache check
  let cached: SteelScrapeResult | null = null;
  try {
    cached = await getCached(SOCIAL_WORKSPACE, cacheKey);
  } catch (err) {
    console.warn('[HUNTER_SOCIAL] TT cache lookup failed for', handle, err);
  }

  let html: string | null = null;
  if (cached) {
    html = cached.pageHtml;
  } else {
    try {
      html = await fetchHtml(url);
    } catch (err) {
      console.warn('[HUNTER_SOCIAL] TT fetch failed for', handle, err);
      return null;
    }
    if (html) {
      const result = htmlToFakeScrapeResult(html, cacheKey);
      putCached(SOCIAL_WORKSPACE, cacheKey, result).catch((err) =>
        console.warn('[HUNTER_SOCIAL] TT putCached failed for', handle, err)
      );
    }
  }

  if (!html) return null;

  const followers = extractTikTokFollowers(html);
  if (followers === null) {
    console.warn('[HUNTER_SOCIAL] TT no follower count found for', handle);
  }
  return followers;
}

export async function fetchYoutubeSubscribers(handle: string): Promise<number | null> {
  // YouTube handles can be /@name (new) or /channel/UC... (legacy). The handle
  // we get from MB/LLM is the @-stripped form. Use /@handle which YouTube
  // redirects appropriately for both old and new channel URLs.
  const url = `https://www.youtube.com/@${handle}`;
  const cacheKey = ytCacheUrl(handle);

  let cached: SteelScrapeResult | null = null;
  try {
    cached = await getCached(SOCIAL_WORKSPACE, cacheKey);
  } catch (err) {
    console.warn('[HUNTER_SOCIAL] YT cache lookup failed for', handle, err);
  }

  let html: string | null = null;
  if (cached) {
    html = cached.pageHtml;
  } else {
    try {
      html = await fetchHtml(url);
    } catch (err) {
      console.warn('[HUNTER_SOCIAL] YT fetch failed for', handle, err);
      return null;
    }
    if (html) {
      const result = htmlToFakeScrapeResult(html, cacheKey);
      putCached(SOCIAL_WORKSPACE, cacheKey, result).catch((err) =>
        console.warn('[HUNTER_SOCIAL] YT putCached failed for', handle, err)
      );
    }
  }

  if (!html) return null;

  const subs = extractYouTubeSubscribers(html);
  if (subs === null) {
    console.warn('[HUNTER_SOCIAL] YT no subscriber count found for', handle);
  }
  return subs;
}

export async function fetchSoundcloudFollowers(handle: string): Promise<number | null> {
  const url = `https://soundcloud.com/${handle}`;
  const cacheKey = scCacheUrl(handle);

  let cached: SteelScrapeResult | null = null;
  try {
    cached = await getCached(SOCIAL_WORKSPACE, cacheKey);
  } catch (err) {
    console.warn('[HUNTER_SOCIAL] SC cache lookup failed for', handle, err);
  }

  let html: string | null = null;
  if (cached) {
    html = cached.pageHtml;
  } else {
    try {
      html = await fetchHtml(url);
    } catch (err) {
      console.warn('[HUNTER_SOCIAL] SC fetch failed for', handle, err);
      return null;
    }
    if (html) {
      const result = htmlToFakeScrapeResult(html, cacheKey);
      putCached(SOCIAL_WORKSPACE, cacheKey, result).catch((err) =>
        console.warn('[HUNTER_SOCIAL] SC putCached failed for', handle, err)
      );
    }
  }

  if (!html) return null;

  const followers = extractSoundCloudFollowers(html);
  if (followers === null) {
    console.warn('[HUNTER_SOCIAL] SC no follower count found for', handle);
  }
  return followers;
}
