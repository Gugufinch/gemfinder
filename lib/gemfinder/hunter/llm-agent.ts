// lib/gemfinder/hunter/llm-agent.ts
//
// LLM-driven candidate discovery, powered by Google Gemini 2.0 Flash.
//
// Why Gemini over OpenAI:
// 1. FREE TIER — Gemini 2.0 Flash is free up to 1500 requests/day, ample
//    for Songfinch's volume. OpenAI was costing real money.
// 2. Built-in Google Search grounding — the model can actually browse the
//    web during the call, returning fresh, current info (today's Pitchfork
//    headline, this week's festival lineup, etc.) rather than just regurgitating
//    training data. This is the "agent browsing the web" feature Greg asked for.
//
// Set GEMINI_API_KEY in env (https://aistudio.google.com/apikey — free).

import { GoogleGenAI } from '@google/genai';
import type { HunterCriteria } from '@/lib/gemfinder/types';
import type { MBArtist } from '@/lib/gemfinder/hunter/musicbrainz';

let _client: GoogleGenAI | null = null;
function client(): GoogleGenAI {
  if (_client) return _client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'PLACEHOLDER_API_KEY') {
    throw new Error('[HUNTER_LLM] GEMINI_API_KEY not set (get a free key at https://aistudio.google.com/apikey)');
  }
  _client = new GoogleGenAI({ apiKey });
  return _client;
}

/**
 * Ask Gemini for ~50 emerging artists matching the criteria, grounded in
 * real Google Search results. Returns MBArtist-shaped objects so the existing
 * enrichment pipeline (Spotify search-by-name, top tracks, social scraping)
 * works unchanged.
 *
 * Returns up to 50 candidates. Orchestrator enriches + scores + top-N from these.
 */
export async function searchArtistsViaLLM(
  criteria: HunterCriteria,
  options?: { excludeNames?: string[] },
): Promise<MBArtist[]> {
  const excludeNames = options?.excludeNames ?? [];

  // Cache check: discovery results are cached for 12 hours by criteria
  // signature. Music journalism doesn't shift within hours so the cache hit
  // is safe; saves the entire Gemini discovery call on repeat hunts.
  // The cache stores the RAW LLM output (pre-exclusion-filter) so we can
  // re-apply the current excludeNames post-cache.
  if (!process.env.VITEST) {
    try {
      const cached = await getCachedDiscovery(criteria);
      if (cached) {
        console.log(`[HUNTER_LLM] cache HIT for criteria ${shortCriteriaKey(criteria)} — ${cached.length} candidates`);
        // Post-filter by current exclude list (cache may be older than the
        // current exclusion set, so re-apply to skip already-shown names).
        const excludeSet = new Set(excludeNames.map((n) => n.toLowerCase()));
        return cached.filter((a) => !excludeSet.has(a.name.toLowerCase()));
      }
    } catch (err) {
      console.warn('[HUNTER_LLM] cache read failed (continuing to live call):', err);
    }
  }

  const userPrompt = buildPrompt(criteria, excludeNames);

  // Try the lite model first (generous free-tier quota); on overload/503, retry
  // with exponential backoff; if all retries fail, fall back to the larger
  // gemini-2.5-flash (separate quota pool, less likely to be saturated at the
  // same moment).
  const responseText = await callGeminiWithRetry(userPrompt);

  // Gemini doesn't always return clean JSON when google-search is enabled —
  // it may wrap the JSON in markdown code fences or add commentary. Extract.
  const jsonStr = extractJsonObject(responseText);
  if (!jsonStr) {
    throw new Error(`[HUNTER_LLM] could not extract JSON from Gemini response (first 200 chars: ${responseText.slice(0, 200).replace(/\n/g, ' ')})`);
  }

  let parsed: { artists?: Array<{ name: string; genres?: string[]; rationale?: string }> };
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Recover from mid-stream syntax errors (unescaped quote in a rationale,
    // smart-quote, control char, etc.) by snipping back to the last complete
    // artist entry. Same approach as truncation-recovery — works for both.
    const recovered = recoverPartialArtists(jsonStr);
    if (recovered) {
      console.warn(`[HUNTER_LLM] JSON parse failed (${msg}) — recovered ${recovered.artists?.length ?? 0} complete artists before the bad position.`);
      parsed = recovered;
    } else {
      throw new Error(`[HUNTER_LLM] Gemini JSON parse failed: ${msg}`);
    }
  }

  const items = parsed.artists ?? [];
  if (!Array.isArray(items)) {
    throw new Error('[HUNTER_LLM] Gemini response missing artists array');
  }

  // Map LLM output → MBArtist shape. id is empty (no MB lookup), name comes
  // from the LLM. The enrichment Step 0 fetchArtistDetails is skipped for
  // empty id; Spotify search-by-name kicks in instead.
  const mapped: MBArtist[] = items
    .filter((a) => a && typeof a.name === 'string' && a.name.trim().length > 0)
    .map((a) => ({
      id: '',  // sentinel: "no MB lookup possible"
      name: a.name.trim(),
      type: 'Person' as const,
      tags: (a.genres ?? []).slice(0, 5).map((name) => ({ name: name.toLowerCase(), count: 1 })),
      _aiHint: typeof a.rationale === 'string' ? a.rationale : undefined,
    }));

  // Write to cache (fire-and-forget). Cache the PRE-exclusion-filter list so
  // future hits can apply the then-current exclude set.
  if (!process.env.VITEST && mapped.length > 0) {
    void putCachedDiscovery(criteria, mapped).catch((err) =>
      console.warn('[HUNTER_LLM] cache write failed:', err),
    );
  }

  // Post-filter by current exclude list (in case the LLM ignored the "don't
  // suggest these" instruction in the prompt and returned some anyway).
  const excludeSet = new Set(excludeNames.map((n) => n.toLowerCase()));
  return mapped.filter((a) => !excludeSet.has(a.name.toLowerCase()));
}

// ---------------------------------------------------------------------------
// Discovery cache (DB-backed, 12h TTL)
// ---------------------------------------------------------------------------
// Stores raw LLM discovery results keyed by criteria signature. Reuses the
// hunter_scrape_cache table — the cache_key column gets a `discovery:` prefix.

const DISCOVERY_TTL_MS = 12 * 60 * 60 * 1000;

function shortCriteriaKey(criteria: HunterCriteria): string {
  const parts = [
    `g=${(criteria.genres ?? []).slice().sort().join(',')}`,
    `r=${(criteria.regions ?? []).slice().sort().join(',')}`,
    `l=${(criteria.locations ?? []).slice().sort().join(',')}`,
    `role=${criteria.roleTarget ?? 'both'}`,
    `tc=${criteria.targetCount ?? 25}`,
    `sb=${criteria.sizeBracket?.min ?? ''}-${criteria.sizeBracket?.max ?? ''}`,
    `y=${criteria.recency?.sinceYear ?? ''}`,
    `inst=${criteria.instrument ?? ''}`,
  ];
  return parts.join(';');
}

function discoveryCacheKey(criteria: HunterCriteria): string {
  return `discovery:${shortCriteriaKey(criteria)}`;
}

async function getCachedDiscovery(criteria: HunterCriteria): Promise<MBArtist[] | null> {
  // Dynamic import to keep this file free of pg imports for vitest setup.
  const { getScoutPool, ensureSchema } = await import('../scout-candidate-store');
  await ensureSchema();
  const key = discoveryCacheKey(criteria);
  const res = await getScoutPool().query(
    `SELECT result FROM hunter_scrape_cache WHERE cache_key = $1 AND expires_at > NOW() LIMIT 1`,
    [key],
  );
  if (!res.rows.length) return null;
  return res.rows[0].result as MBArtist[];
}

async function putCachedDiscovery(criteria: HunterCriteria, candidates: MBArtist[]): Promise<void> {
  const { getScoutPool, ensureSchema } = await import('../scout-candidate-store');
  await ensureSchema();
  const key = discoveryCacheKey(criteria);
  const expiresAt = new Date(Date.now() + DISCOVERY_TTL_MS).toISOString();
  await getScoutPool().query(
    `INSERT INTO hunter_scrape_cache (cache_key, scrape_url, result, expires_at)
     VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (cache_key) DO UPDATE SET result = $3::jsonb, cached_at = NOW(), expires_at = $4`,
    [key, `discovery://${shortCriteriaKey(criteria)}`, JSON.stringify(candidates), expiresAt],
  );
}

/**
 * Extract the first {...} object from a string, even if it's wrapped in markdown
 * fences, has commentary around it, has trailing text, OR is truncated mid-stream
 * (which happens when Gemini hits maxOutputTokens before finishing its JSON).
 *
 * Strategy:
 * 1. Look for a fenced ```json block first
 * 2. Otherwise find first { and walk to matching }
 * 3. If we reach EOF before the JSON closes, RECONSTRUCT: snip back to the last
 *    complete `}` in the artists array and append `]}` to close the structure.
 *    This recovers ~95% of a truncated response instead of failing entirely.
 */
/**
 * Recover usable artists from JSON that's structurally complete but has a
 * mid-stream syntax error (e.g., an unescaped quote in a rationale at position
 * 5465). Walks backward from the last well-formed parse boundary.
 *
 * Strategy: progressively trim back to the last `},` (end of a complete artist
 * entry), append `]}` to close, and try parsing. If still fails, trim back to
 * the previous `},` and try again. Up to 50 backoffs.
 *
 * Returns the parsed object if recovery succeeds, or null if no prefix is
 * salvageable.
 */
function recoverPartialArtists(jsonStr: string): { artists?: Array<{ name: string; genres?: string[]; rationale?: string }> } | null {
  // Find the position of the first `"artists":[` so we know where to insert the close.
  const artistsMatch = jsonStr.match(/"artists"\s*:\s*\[/);
  if (!artistsMatch || artistsMatch.index === undefined) return null;
  const arrayStart = artistsMatch.index + artistsMatch[0].length;

  // Walk backward through the `},` boundaries, trying each candidate.
  let searchFrom = jsonStr.length;
  for (let attempt = 0; attempt < 50; attempt++) {
    const lastCloseObj = jsonStr.lastIndexOf('},', searchFrom);
    if (lastCloseObj < arrayStart) return null;
    const candidate = jsonStr.slice(0, lastCloseObj + 1) + ']}';
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && Array.isArray(parsed.artists)) {
        return parsed;
      }
    } catch {
      // try the previous `},`
    }
    searchFrom = lastCloseObj - 1;
  }
  return null;
}

function extractJsonObject(text: string): string | null {
  // Strip markdown code fences if present.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) return fenced[1].trim();

  // Otherwise find first { and walk to matching }.
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
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  // Truncation recovery: response got cut off mid-JSON. Walk backward from EOF
  // looking for the last clean `},` (end of a complete artist entry), then
  // close the array and outer object. We lose the last (partial) artist but
  // keep all the complete ones before it.
  const partial = text.slice(start);
  const lastCloseObj = partial.lastIndexOf('},');
  if (lastCloseObj > 0) {
    const recovered = partial.slice(0, lastCloseObj + 1) + ']}';
    // Quick validation: try parsing and bail if it's still broken.
    try {
      JSON.parse(recovered);
      return recovered;
    } catch {
      // Could not recover — fall through to null.
    }
  }
  return null;
}

/**
 * Call Gemini with retry-on-overload and a model fallback chain.
 *
 * Try sequence (each model gets 3 attempts with backoff):
 *   1. gemini-2.5-flash-lite (fastest, most generous quota)
 *   2. gemini-2.5-flash (heavier model, separate quota pool — used when lite is overloaded)
 *
 * Backoff: 2s → 5s → 10s. Total worst-case wait before failing over: 17s.
 *
 * Recovers from 503 UNAVAILABLE / overloaded / temporarily-unavailable errors
 * that Google returns during capacity spikes. Auth and quota errors fail
 * immediately (no retry) since they won't fix themselves.
 */
async function callGeminiWithRetry(userPrompt: string): Promise<string> {
  const FALLBACK_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'];
  const BACKOFF_MS = process.env.VITEST ? [0, 0, 0] : [2000, 5000, 10000];

  let lastErrMsg = 'unknown';
  let quotaExhausted = false;

  for (const model of FALLBACK_MODELS) {
    for (let attempt = 0; attempt < BACKOFF_MS.length; attempt++) {
      try {
        const result = await client().models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: SYSTEM_PROMPT + '\n\n' + userPrompt }] }],
          config: {
            tools: [{ googleSearch: {} }],
            temperature: 0.7,
            maxOutputTokens: 12000,
          },
        });
        const text = result.text;
        if (!text) {
          throw new Error('Gemini returned empty response (model may have been filtered)');
        }
        if (model !== FALLBACK_MODELS[0] || attempt > 0) {
          console.warn(`[HUNTER_LLM] succeeded on ${model} (attempt ${attempt + 1}/${BACKOFF_MS.length})`);
        }
        return text;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        lastErrMsg = msg;

        if (/API key not valid|API_KEY_INVALID/i.test(msg)) {
          throw new Error('[HUNTER_LLM] GEMINI_API_KEY is invalid — get a fresh key at https://aistudio.google.com/apikey');
        }
        // Quota error: don't retry on THIS model, but try next Gemini model
        // (separate quota pool) and then fall through to Groq if both exhausted.
        if (/quota|RESOURCE_EXHAUSTED/i.test(msg)) {
          quotaExhausted = true;
          console.warn(`[HUNTER_LLM] ${model} quota exhausted; moving to next provider`);
          break;
        }
        if (/not found|404/i.test(msg) && /model/i.test(msg)) {
          console.warn(`[HUNTER_LLM] ${model} returned 404, skipping to next fallback`);
          break;
        }

        const isOverload = /503|UNAVAILABLE|overload|high demand|temporarily/i.test(msg);
        const isNetwork = /ECONNRESET|ETIMEDOUT|fetch failed|network/i.test(msg);
        if (!isOverload && !isNetwork) {
          console.warn(`[HUNTER_LLM] ${model} attempt ${attempt + 1} unretriable error:`, msg);
          break;
        }

        if (attempt < BACKOFF_MS.length - 1) {
          const wait = BACKOFF_MS[attempt];
          console.warn(`[HUNTER_LLM] ${model} attempt ${attempt + 1} got ${isOverload ? 'overload' : 'network err'}, retrying in ${wait}ms`);
          await new Promise((r) => setTimeout(r, wait));
        } else {
          console.warn(`[HUNTER_LLM] ${model} exhausted ${BACKOFF_MS.length} retries — falling back to next model`);
        }
      }
    }
  }

  // Gemini chain exhausted. Try Groq as a final fallback (Llama 3.3 70B,
  // separate quota pool of 14,400/day). No web grounding here — Groq is
  // text-only — but Llama 3.3 has solid music knowledge from training.
  // Quality is "good not great" relative to grounded Gemini, but it keeps
  // the agent running when Gemini quota is hit.
  if (process.env.GROQ_API_KEY) {
    try {
      console.warn(`[HUNTER_LLM] Falling back to Groq (Gemini ${quotaExhausted ? 'quota exhausted' : 'unavailable'})`);
      const text = await callGroq(SYSTEM_PROMPT + '\n\n' + userPrompt);
      if (text) return text;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[HUNTER_LLM] Groq fallback also failed:', msg);
      lastErrMsg = `Gemini: ${lastErrMsg} | Groq: ${msg}`;
    }
  } else if (quotaExhausted) {
    lastErrMsg += ' (set GROQ_API_KEY for free fallback — 14,400/day on llama-3.3-70b)';
  }

  throw new Error(`[HUNTER_LLM] All LLM providers exhausted. Last error: ${lastErrMsg}`);
}

/**
 * Call Groq's Llama 3.3 70B via their OpenAI-compatible Chat Completions API.
 *
 * Pure text generation — no web grounding (Groq doesn't expose native search).
 * Used as a fallback when Gemini quota / availability fails. Llama 3.3 70B
 * has strong music knowledge from training; the trade-off is "good but not
 * current" vs. Gemini's grounded "great and current."
 *
 * Returns the response text on success, throws on failure. Caller handles
 * the JSON-extract step (same parser path as Gemini).
 */
async function callGroq(fullPrompt: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');

  // Single 90-sec timeout — Groq is FAST (Llama 3.3 70B at 200+ tok/sec),
  // a normal response is <10 sec. If we're past 90s something's broken.
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), 90_000);
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content:
              'IMPORTANT: You do NOT have web search. Use your training knowledge of emerging music artists. ' +
              'Still verify what you suggest is real to the best of your knowledge. ' +
              'Bias toward artists you have STRONG training-data evidence for (Pitchfork-covered acts, year-end-list staples, Bandcamp editorial picks). ' +
              'Skip artists you only vaguely recall — accuracy > breadth.',
          },
          { role: 'user', content: fullPrompt },
        ],
        temperature: 0.7,
        max_tokens: 8000,
        response_format: { type: 'json_object' },
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timeoutId);

    if (res.status === 401) {
      throw new Error('GROQ_API_KEY is invalid — get a fresh key at https://console.groq.com/keys');
    }
    if (res.status === 429) {
      throw new Error('Groq rate limit hit (free tier is 14,400/day on llama-3.3-70b-versatile)');
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Groq HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const body = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = body.choices?.[0]?.message?.content;
    if (!text) throw new Error('Groq returned empty completion');
    return text;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Groq call timed out (90s)');
    }
    throw err;
  }
}

const SYSTEM_PROMPT = `You are an A&R scout for Songfinch. Use Google Search to find emerging recording artists matching the criteria. Search Pitchfork, FADER, Stereogum, NPR Music, Brooklyn Vegan year-end and "best new" lists from 2024-2025; festival lineups; Bandcamp editorial picks.

MUST be:
- A living music recording artist (NOT novelists, voice actors, classical composers)
- Active with releases since 2022
- 1,000 to 1,000,000 Spotify monthly listeners (we want emerging-to-mid-tier; megastars >1M are agency-locked)
- VERIFIABLE: you must be able to cite at least ONE of: a Spotify artist URL, a MusicBrainz ID, an Instagram/TikTok handle they actively use, or a recent press article (Pitchfork, FADER, Stereogum, NPR, etc.) that names them by their exact artist name. If you cannot cite any of these, SKIP that name and find another. Do NOT invent names or pad the list with plausible-sounding artists you can't verify. Returning fewer real candidates is better than returning made-up ones.

Variety: don't repeat the same indie-buzz names. Mix career stages in the 1K-100K range. For broad genres, span subgenres.

Per artist, the rationale MUST include the verification source — e.g., "Pitchfork 2024 review of [album]" or "active IG @handle with [N] followers" or "open.spotify.com/artist/[id]". Generic "rising act" filler with no citable source is rejected. KEEP RATIONALES UNDER 50 WORDS — one tight sentence with the citation.

Output ONLY this JSON, no prose, no markdown fences. spotifyUrl is optional but include it when you have it (the downstream pipeline will Spotify-search by name as a fallback):
{"artists":[{"name":"...","genres":["..."],"spotifyUrl":"https://open.spotify.com/artist/... or null","rationale":"specific real reason WITH verification source"}]}`;

function buildPrompt(criteria: HunterCriteria, excludeNames: string[] = []): string {
  const parts: string[] = [];
  // Ask for roughly 2x targetCount plus a small buffer, capped at 50. This
  // scales discovery to the actual demand instead of always burning the same
  // ~30-name compute regardless of how many the operator wants. Buffer covers
  // candidates that will get gated out (blocked, low-score, deceased, etc).
  const askCount = Math.min(50, Math.max(10, (criteria.targetCount ?? 25) * 2 + 5));
  parts.push(`Find ~${askCount} emerging artists for Songfinch's A&R queue.`);
  parts.push('\nCriteria:');
  const hasGenres = criteria.genres.length > 0;
  const hasRegions = criteria.regions.length > 0;
  const hasLocations = criteria.locations && criteria.locations.length > 0;
  if (!hasGenres && !hasRegions && !hasLocations) {
    // Weight-only hunt — no explicit filters. Tell the LLM to surface a varied
    // mix of emerging artists across genres + regions, biased toward "rising
    // right now" press coverage. Operator's workspace weights will rank them.
    parts.push('- (No explicit genre/region/location filter — return a varied mix of currently-rising emerging artists across diverse genres and regions)');
  }
  if (hasGenres) parts.push(`- Genres: ${criteria.genres.join(', ')}`);
  if (hasRegions) parts.push(`- Country regions (ISO codes): ${criteria.regions.join(', ')}`);
  if (criteria.locations && criteria.locations.length > 0) parts.push(`- Specific locations (cities/states/neighborhoods — bias results heavily toward artists actually based here): ${criteria.locations.join(', ')}`);
  if (criteria.roleTarget !== 'both') parts.push(`- Role target: ${criteria.roleTarget}`);
  const minListeners = criteria.sizeBracket?.min ?? 1000;
  const maxListeners = criteria.sizeBracket?.max ?? 1_000_000;
  parts.push(`- Min Spotify monthly listeners: ${minListeners.toLocaleString()}`);
  parts.push(`- Max Spotify monthly listeners: ${maxListeners.toLocaleString()} (HARD LIMIT — do not exceed)`);
  if (criteria.recency?.sinceYear) parts.push(`- Active since: ${criteria.recency.sinceYear}`);
  if (criteria.instrument) parts.push(`- Notable for: ${criteria.instrument}`);

  // Memory: prevent re-suggesting names we've already shown the operator. The
  // blocklist still catches dupes downstream, but excluding them at the LLM
  // level saves enrichment compute AND forces more variety in the results
  // (Gemini tends to default to the same 20-30 buzzy names without nudging).
  if (excludeNames.length > 0) {
    // Cap at 200 to keep the prompt token cost reasonable. Most relevant
    // (recent) names are at the head of the list because the SQL sorts desc.
    const excludeList = excludeNames.slice(0, 200).join(', ');
    parts.push(`\nALREADY IN OUR SYSTEM — DO NOT SUGGEST THESE (we have ${excludeNames.length} known artists; ${excludeNames.length > 200 ? 'first 200 listed' : 'all listed'}):\n${excludeList}`);
    parts.push('\nFind DIFFERENT emerging artists — ones we have not seen yet. Variety matters; reach beyond the top-tier indie buzz names.');
  }

  parts.push('\nUse Google Search to find real, current candidates. Return the JSON specified in the system prompt.');
  return parts.join('\n');
}
