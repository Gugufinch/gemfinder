// lib/gemfinder/hunter/deep-research.ts
//
// Per-candidate "deep research" agent. Given an artist name (from the
// discovery LLM), runs a SEPARATE Gemini call with Google Search grounding
// to verify the artist is real, find their location/contact/socials, and
// surface a current bio with press citations.
//
// This is the second agent in the chain: discovery returns ~30 names; deep
// research verifies & enriches each one in parallel. Results are cached for
// 30 days so re-runs hitting the same artists cost nothing.
//
// Why a separate agent: the discovery call asks for breadth (30 names + 1-line
// rationale each). Asking it for full detail per artist in the same call
// would blow the token budget AND make verification impossible — the model
// can't fact-check its own list-output in one pass. Two calls = breadth THEN
// depth.

import { GoogleGenAI } from '@google/genai';
import { getScoutPool, ensureSchema } from '../scout-candidate-store';

let _client: GoogleGenAI | null = null;
function client(): GoogleGenAI {
  if (_client) return _client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'PLACEHOLDER_API_KEY') {
    throw new Error('[HUNTER_DEEP] GEMINI_API_KEY not set');
  }
  _client = new GoogleGenAI({ apiKey });
  return _client;
}

// ---------------------------------------------------------------------------
// Result shape — what one deep-research call returns
// ---------------------------------------------------------------------------

export type DeepResearchResult = {
  verified: boolean;                   // is this a real recording artist?
  isLiving: boolean | null;            // alive + active? null = couldn't determine
  recentReleaseYear?: number;
  recentReleaseTitle?: string;
  location?: string;                   // free-text "Austin, TX"
  country?: string;                    // 2-letter ISO if findable
  genres: string[];
  spotifyUrl?: string;
  spotifyArtistId?: string;
  instagramHandle?: string;
  tiktokHandle?: string;
  youtubeHandle?: string;
  bandcampUrl?: string;
  website?: string;
  bookingEmail?: string;
  managerInfo?: string;
  bio?: string;                        // 1-2 sentence current bio grounded in real press
  citations: string[];                 // URLs Gemini grounded against
  researchedAt: string;                // ISO timestamp
};

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Deep-research one artist via Gemini + Google Search.
 *
 * Returns a DeepResearchResult, or null on any failure (graceful — the
 * orchestrator continues without enhanced data).
 *
 * Caches results in hunter_scrape_cache under key `deep:{normalizedName}`
 * with 30-day TTL.
 */
export async function researchArtist(
  workspaceId: string,
  name: string,
  hintGenres?: string[],
): Promise<DeepResearchResult | null> {
  const canonical = canonicalName(name);
  if (!canonical) return null;

  // Cache lookup first.
  try {
    const cached = await getCachedResearch(workspaceId, canonical);
    if (cached) return cached;
  } catch (err) {
    console.warn('[HUNTER_DEEP] cache read failed for', canonical, ':', err);
    // continue to live call
  }

  // Live call with retry on transient errors.
  let result: DeepResearchResult | null = null;
  try {
    result = await callGeminiDeepResearch(name, hintGenres);
  } catch (err) {
    console.warn('[HUNTER_DEEP] research failed for', canonical, ':', err instanceof Error ? err.message : String(err));
    return null;
  }

  if (!result) return null;

  // Write to cache (fire-and-forget — don't block the enrichment).
  void putCachedResearch(workspaceId, canonical, result).catch((err) =>
    console.warn('[HUNTER_DEEP] cache write failed:', err)
  );

  return result;
}

// ---------------------------------------------------------------------------
// Cache layer (piggybacks on hunter_scrape_cache table via JSONB)
// ---------------------------------------------------------------------------

const TTL_MS = 30 * 24 * 60 * 60 * 1000;

function canonicalName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function cacheKey(workspaceId: string, canonical: string): string {
  return `${workspaceId}::deep:${canonical}`;
}

export async function getCachedResearch(workspaceId: string, canonical: string): Promise<DeepResearchResult | null> {
  await ensureSchema();
  const key = cacheKey(workspaceId, canonical);
  const res = await getScoutPool().query(
    `SELECT result FROM hunter_scrape_cache WHERE cache_key = $1 AND expires_at > NOW() LIMIT 1`,
    [key],
  );
  if (!res.rows.length) return null;
  // The result column is JSONB; trust the shape stored under our prefix.
  return res.rows[0].result as DeepResearchResult;
}

async function putCachedResearch(workspaceId: string, canonical: string, result: DeepResearchResult): Promise<void> {
  await ensureSchema();
  const key = cacheKey(workspaceId, canonical);
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
  await getScoutPool().query(
    `INSERT INTO hunter_scrape_cache (cache_key, scrape_url, result, expires_at)
     VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (cache_key) DO UPDATE SET result = $3::jsonb, cached_at = NOW(), expires_at = $4`,
    [key, `deep://${canonical}`, JSON.stringify(result), expiresAt],
  );
}

// ---------------------------------------------------------------------------
// Gemini call
// ---------------------------------------------------------------------------

const DEEP_SYSTEM_PROMPT = `You are a music industry researcher. Use Google Search to investigate a specific artist and return ONLY a JSON object with verified information.

CRITICAL: If you cannot find evidence the person is a real music recording artist (e.g., they're an author, voice actor, or namesake who isn't a musician), return verified:false. Don't fabricate.

For each artist, search for:
- Their Spotify page (to verify identity + get spotifyUrl)
- Recent press / reviews / Bandcamp pages
- Their own website / linktree
- Their socials

OUTPUT ONLY this JSON shape, no prose, no markdown fences:
{
  "verified": true,
  "isLiving": true,
  "recentReleaseYear": 2024,
  "recentReleaseTitle": "Album name",
  "location": "Austin, TX",
  "country": "US",
  "genres": ["indie rock", "shoegaze"],
  "spotifyUrl": "https://open.spotify.com/artist/...",
  "instagramHandle": "handle",
  "tiktokHandle": "handle",
  "youtubeHandle": "handle",
  "bandcampUrl": "https://...",
  "website": "https://...",
  "bookingEmail": "booking@example.com",
  "managerInfo": "Manager Name / Agency",
  "bio": "1-2 sentence current bio with a specific recent press mention",
  "citations": ["https://pitchfork.com/...", "..."]
}

Omit fields you can't verify. Leave string fields as empty string or omit. Keep bio under 60 words.`;

async function callGeminiDeepResearch(name: string, hintGenres?: string[]): Promise<DeepResearchResult | null> {
  const genreHint = hintGenres && hintGenres.length > 0
    ? ` (Discovery agent's genre hint: ${hintGenres.join(', ')} — verify or correct)`
    : '';
  const userPrompt = `Research the music artist "${name}"${genreHint}.\n\nReturn the JSON specified.`;

  const FALLBACK_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'];
  const BACKOFF_MS = process.env.VITEST ? [0, 0] : [1500, 4000];

  let lastErr = 'unknown';

  for (const model of FALLBACK_MODELS) {
    for (let attempt = 0; attempt < BACKOFF_MS.length; attempt++) {
      try {
        const result = await client().models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: DEEP_SYSTEM_PROMPT + '\n\n' + userPrompt }] }],
          config: {
            tools: [{ googleSearch: {} }],
            temperature: 0.3,  // lower than discovery — we want verification, not creativity
            maxOutputTokens: 2000,
          },
        });
        const text = result.text;
        if (!text) {
          lastErr = 'empty response';
          continue;
        }
        const parsed = parseDeepResearchJson(text);
        if (parsed) return { ...parsed, researchedAt: new Date().toISOString() };
        lastErr = 'JSON parse failed';
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        lastErr = msg;
        // Same retry semantics as the discovery agent.
        if (/API key not valid|API_KEY_INVALID/i.test(msg)) {
          throw new Error('[HUNTER_DEEP] GEMINI_API_KEY is invalid');
        }
        if (/quota|RESOURCE_EXHAUSTED/i.test(msg)) {
          throw new Error('[HUNTER_DEEP] Gemini quota exceeded');
        }
        const isRetriable = /503|UNAVAILABLE|overload|high demand|ECONNRESET|fetch failed|network/i.test(msg);
        if (!isRetriable) break;
        if (attempt < BACKOFF_MS.length - 1) {
          await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
        }
      }
    }
  }
  console.warn(`[HUNTER_DEEP] all retries exhausted for "${name}": ${lastErr}`);
  return null;
}

// ---------------------------------------------------------------------------
// JSON extraction (same defensive pattern as llm-agent — Gemini's grounded
// output occasionally wraps in fences or includes prose around the JSON)
// ---------------------------------------------------------------------------

function parseDeepResearchJson(text: string): Omit<DeepResearchResult, 'researchedAt'> | null {
  // 1. Try markdown-fenced JSON first
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) {
    try {
      const obj = JSON.parse(fenced[1].trim());
      return normalizeDeepResearchObject(obj);
    } catch {
      // fall through
    }
  }

  // 2. Find the first {...} balanced-brace block
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          const obj = JSON.parse(text.slice(start, i + 1));
          return normalizeDeepResearchObject(obj);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Coerce the raw parsed JSON into our DeepResearchResult shape. Drops fields
 * that aren't strings/numbers/arrays-of-strings; trims whitespace; lowercases
 * 2-letter country codes; etc.
 */
function normalizeDeepResearchObject(raw: unknown): Omit<DeepResearchResult, 'researchedAt'> | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const str = (v: unknown): string | undefined => {
    if (typeof v !== 'string') return undefined;
    const t = v.trim();
    return t.length > 0 ? t : undefined;
  };
  const num = (v: unknown): number | undefined => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = parseInt(v, 10);
      return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
  };
  const strArr = (v: unknown): string[] => {
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim());
  };

  return {
    verified: r.verified === true,
    isLiving: typeof r.isLiving === 'boolean' ? r.isLiving : null,
    recentReleaseYear: num(r.recentReleaseYear),
    recentReleaseTitle: str(r.recentReleaseTitle),
    location: str(r.location),
    country: str(r.country)?.toUpperCase().slice(0, 2),
    genres: strArr(r.genres),
    spotifyUrl: str(r.spotifyUrl),
    spotifyArtistId: str(r.spotifyArtistId),
    instagramHandle: str(r.instagramHandle)?.replace(/^@/, ''),
    tiktokHandle: str(r.tiktokHandle)?.replace(/^@/, ''),
    youtubeHandle: str(r.youtubeHandle)?.replace(/^@/, ''),
    bandcampUrl: str(r.bandcampUrl),
    website: str(r.website),
    bookingEmail: str(r.bookingEmail),
    managerInfo: str(r.managerInfo),
    bio: str(r.bio),
    citations: strArr(r.citations),
  };
}

// Export for tests
export { canonicalName, parseDeepResearchJson, normalizeDeepResearchObject };
