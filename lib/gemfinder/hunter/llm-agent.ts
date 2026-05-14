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
export async function searchArtistsViaLLM(criteria: HunterCriteria): Promise<MBArtist[]> {
  const userPrompt = buildPrompt(criteria);

  // Infrastructure errors (auth failure, quota exceeded, model unavailable)
  // THROW so the orchestrator catches them and pushes a visible 'mb_fetch'
  // error to the run summary. The previous "return [] on error" was silent —
  // operators saw runs complete with fetched=0 and had no idea why.
  let responseText: string | undefined;
  try {
    const result = await client().models.generateContent({
      // gemini-2.5-flash-lite has the most generous free-tier quota and handles
      // grounding+structured-output cleanly with a sub-2s response time.
      model: 'gemini-2.5-flash-lite',
      contents: [{ role: 'user', parts: [{ text: SYSTEM_PROMPT + '\n\n' + userPrompt }] }],
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.7,
        // 30 artists × ~250 tokens each = ~7500 tokens. 12K is headroom.
        maxOutputTokens: 12000,
      },
    });
    responseText = result.text;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[HUNTER_LLM] Gemini call failed:', err);
    // Surface specific failure modes with actionable messages.
    if (/API key not valid|API_KEY_INVALID/i.test(msg)) {
      throw new Error('[HUNTER_LLM] GEMINI_API_KEY is invalid — get a fresh key at https://aistudio.google.com/apikey');
    }
    if (/quota|RESOURCE_EXHAUSTED/i.test(msg)) {
      throw new Error('[HUNTER_LLM] Gemini quota exceeded — free tier is 1500 req/day. Wait or rotate the key.');
    }
    if (/not found|404/i.test(msg) && /model/i.test(msg)) {
      throw new Error('[HUNTER_LLM] Gemini model not available — Google may have rotated. Update the model name in llm-agent.ts.');
    }
    throw new Error(`[HUNTER_LLM] Gemini call failed: ${msg}`);
  }

  if (!responseText) {
    throw new Error('[HUNTER_LLM] Gemini returned empty response (model may have been filtered or rate-limited)');
  }

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
    throw new Error(`[HUNTER_LLM] Gemini JSON parse failed: ${msg}`);
  }

  const items = parsed.artists ?? [];
  if (!Array.isArray(items)) {
    throw new Error('[HUNTER_LLM] Gemini response missing artists array');
  }

  // Map LLM output → MBArtist shape. id is empty (no MB lookup), name comes
  // from the LLM. The enrichment Step 0 fetchArtistDetails is skipped for
  // empty id; Spotify search-by-name kicks in instead.
  return items
    .filter((a) => a && typeof a.name === 'string' && a.name.trim().length > 0)
    .map((a) => ({
      id: '',  // sentinel: "no MB lookup possible"
      name: a.name.trim(),
      type: 'Person' as const,
      tags: (a.genres ?? []).slice(0, 5).map((name) => ({ name: name.toLowerCase(), count: 1 })),
      // Pass the LLM's rationale (now grounded in real web search) through as
      // an aiHint → becomes the "💬 Why this artist?" line on the review card.
      _aiHint: typeof a.rationale === 'string' ? a.rationale : undefined,
    }));
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

const SYSTEM_PROMPT = `You are an A&R scout for Songfinch. Use Google Search to find emerging recording artists matching the criteria. Search Pitchfork, FADER, Stereogum, NPR Music, Brooklyn Vegan year-end and "best new" lists from 2024-2025; festival lineups; Bandcamp editorial picks.

MUST be:
- A living music recording artist (NOT novelists, voice actors, classical composers)
- Active with releases since 2022
- 1,000 to 1,000,000 Spotify monthly listeners (we want emerging-to-mid-tier; megastars >1M are agency-locked)

Variety: don't repeat the same indie-buzz names. Mix career stages in the 1K-100K range. For broad genres, span subgenres.

Per artist, rationale should reference what you actually found in search (a 2024 review, a festival slot, a recent EP). Generic "rising act" filler is rejected. KEEP RATIONALES UNDER 40 WORDS — one tight sentence, not a paragraph.

Output ONLY this JSON, no prose, no markdown fences:
{"artists":[{"name":"...","genres":["..."],"rationale":"specific real reason"}]}`;

function buildPrompt(criteria: HunterCriteria): string {
  const parts: string[] = [];
  parts.push('Find ~30 emerging artists for Songfinch\'s A&R queue.');
  parts.push('\nCriteria:');
  if (criteria.genres.length > 0) parts.push(`- Genres: ${criteria.genres.join(', ')}`);
  if (criteria.regions.length > 0) parts.push(`- Regions (ISO codes): ${criteria.regions.join(', ')}`);
  if (criteria.roleTarget !== 'both') parts.push(`- Role target: ${criteria.roleTarget}`);
  const minListeners = criteria.sizeBracket?.min ?? 1000;
  const maxListeners = criteria.sizeBracket?.max ?? 1_000_000;
  parts.push(`- Min Spotify monthly listeners: ${minListeners.toLocaleString()}`);
  parts.push(`- Max Spotify monthly listeners: ${maxListeners.toLocaleString()} (HARD LIMIT — do not exceed)`);
  if (criteria.recency?.sinceYear) parts.push(`- Active since: ${criteria.recency.sinceYear}`);
  if (criteria.instrument) parts.push(`- Notable for: ${criteria.instrument}`);
  parts.push('\nUse Google Search to find real, current candidates. Return the JSON specified in the system prompt.');
  return parts.join('\n');
}
