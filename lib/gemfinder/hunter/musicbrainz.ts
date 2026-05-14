import type { HunterCriteria } from '@/lib/gemfinder/types';

const BASE = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'Gemfinder-Hunter/1.0 (https://gemfinder-1qm5.onrender.com)';

export type MBArtist = {
  id: string;
  name: string;
  country?: string;
  type?: string;
  'life-span'?: { begin?: string; end?: string };
  tags?: Array<{ name: string; count: number }>;
  'release-groups'?: Array<{ id: string; title: string; 'first-release-date'?: string }>;
  relations?: Array<{ type: string; url?: { resource: string } }>;
  // Internal: LLM-generated rationale, populated by llm-agent. Carried through
  // enrichment to become the candidate's aiSummary (the "why this artist?"
  // line on the review card). Empty for MB-sourced candidates.
  _aiHint?: string;
};

// Process-wide token bucket: 1 req/sec.
let lastRequestAt = 0;
const MIN_INTERVAL_MS = 1000;

async function acquireToken(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - elapsed));
  }
  lastRequestAt = Date.now();
}

function escapeForLucene(s: string): string {
  // Escape Lucene special chars: + - & | ! ( ) { } [ ] ^ " ~ * ? : \ /
  return s.replace(/(["\\(){}\[\]^~*?:!])/g, '\\$1');
}

export function buildSearchQuery(criteria: HunterCriteria): string {
  const parts: string[] = [];

  if (criteria.genres.length > 0) {
    const genreClauses = criteria.genres.map((g) => `tag:"${escapeForLucene(g)}"`);
    parts.push(`(${genreClauses.join(' OR ')})`);
  }

  if (criteria.regions.length > 0) {
    const regionClauses = criteria.regions.map((r) => `country:${escapeForLucene(r)}`);
    parts.push(`(${regionClauses.join(' OR ')})`);
  }

  if (criteria.roleTarget === 'performer') {
    parts.push('(type:Person OR type:Group)');
  } else if (criteria.roleTarget === 'curator') {
    parts.push('type:Other');
  }

  // Filter out disbanded groups and deceased performers at the MB-query level.
  // Without this, ~half of "rock + US" results are historical acts (Grateful
  // Dead, Miles Davis, etc.). The `ended` field is a boolean MB exposes on
  // artist records. Default to excluding them — Hunter is for live/active
  // artists. (Operators can drop this in v1.1 by adding a criteria flag.)
  parts.push('ended:false');

  return parts.length > 0 ? parts.join(' AND ') : '*';
}

/**
 * Search MB with TIERED offset — start deep (skip past megastars) and step
 * back if the result set is sparse.
 *
 * Empirical probe (rock + US): mid-tier candidates don't appear until offset
 * 1000+, hit 90% mid-tier at offset 3000. For broad genres we want to start
 * deep. For niche queries (where MB has few total results), we step back.
 */
const TIERED_OFFSETS = [2000, 500, 0];
const MIN_RESULTS_PER_TIER = 30;

export async function searchArtists(criteria: HunterCriteria, fixedOffset?: number): Promise<MBArtist[]> {
  if (fixedOffset !== undefined) {
    return searchArtistsAtOffset(criteria, fixedOffset);
  }
  for (const offset of TIERED_OFFSETS) {
    const results = await searchArtistsAtOffset(criteria, offset);
    if (results.length >= MIN_RESULTS_PER_TIER) {
      return results;
    }
    // Sparse result set — try a shallower offset.
  }
  // All tiers exhausted; return whatever the last (offset=0) tier produced.
  return searchArtistsAtOffset(criteria, 0);
}

async function searchArtistsAtOffset(criteria: HunterCriteria, offset: number): Promise<MBArtist[]> {
  const query = buildSearchQuery(criteria);
  const url = `${BASE}/artist?query=${encodeURIComponent(query)}&fmt=json&limit=100&offset=${offset}`;

  let retries = 0;
  const maxRetries = 3;

  while (retries <= maxRetries) {
    await acquireToken();
    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'application/json',
        },
      });
    } catch (err) {
      if (retries < maxRetries) {
        retries++;
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      throw new Error(`[HUNTER_MB] network error: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (res.status === 429) {
      if (retries < maxRetries) {
        retries++;
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      throw new Error('[HUNTER_MB] rate limit exceeded (429) after 3 retries');
    }

    if (res.status >= 500) {
      if (retries < maxRetries) {
        retries++;
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      throw new Error(`[HUNTER_MB] server error: ${res.status}`);
    }

    if (!res.ok) {
      throw new Error(`[HUNTER_MB] HTTP ${res.status}`);
    }

    const body = (await res.json()) as { artists?: MBArtist[] };
    return body.artists ?? [];
  }

  // Unreachable in practice but satisfies TypeScript control flow.
  return [];
}

export async function fetchArtistDetails(
  mbid: string,
  inc: string[] = ['url-rels', 'release-groups', 'tags'],
): Promise<MBArtist | null> {
  const url = `${BASE}/artist/${encodeURIComponent(mbid)}?inc=${inc.join('+')}&fmt=json`;
  await acquireToken();
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
    },
  });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`[HUNTER_MB] fetchArtistDetails HTTP ${res.status}`);
  }
  return (await res.json()) as MBArtist;
}
