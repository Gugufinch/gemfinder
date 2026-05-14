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

  let responseText: string | undefined;
  try {
    const result = await client().models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: SYSTEM_PROMPT + '\n\n' + userPrompt }] }],
      config: {
        // Google Search grounding — Gemini browses the web during the call.
        // The model returns artists informed by current music journalism,
        // festival announcements, etc. Free with the Gemini free tier.
        tools: [{ googleSearch: {} }],
        // Some variety run-to-run, but not chaotic.
        temperature: 0.7,
        // 50 artists × ~50 tokens each = ~2500 tokens for the list, plus
        // grounding overhead. 8K is comfortable headroom.
        maxOutputTokens: 8000,
      },
    });
    responseText = result.text;
  } catch (err) {
    console.warn('[HUNTER_LLM] Gemini call failed:', err);
    return [];
  }

  if (!responseText) {
    console.warn('[HUNTER_LLM] empty response from Gemini');
    return [];
  }

  // Gemini doesn't always return clean JSON when google-search is enabled —
  // it may wrap the JSON in markdown code fences or add commentary. Extract.
  const jsonStr = extractJsonObject(responseText);
  if (!jsonStr) {
    console.warn('[HUNTER_LLM] could not find JSON in Gemini response (first 200 chars):', responseText.slice(0, 200));
    return [];
  }

  let parsed: { artists?: Array<{ name: string; genres?: string[]; rationale?: string }> };
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    console.warn('[HUNTER_LLM] failed to parse Gemini JSON:', err);
    return [];
  }

  const items = parsed.artists ?? [];
  if (!Array.isArray(items)) {
    console.warn('[HUNTER_LLM] artists field is not an array');
    return [];
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
 * fences, has commentary around it, or has trailing text. Walks bracket depth
 * to find the matching close-brace.
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
  return null;
}

const SYSTEM_PROMPT = `You are an A&R discovery assistant for Songfinch, a personalized song service. Given criteria (genre, region, role target, follower range), use Google Search to find emerging-but-active MUSIC RECORDING ARTISTS who match.

You have access to Google Search. USE IT — search for current articles, year-end lists, festival lineups, and "best new artists" coverage from 2024-2025. Don't rely on training-data memory; ground your suggestions in real, current sources.

HARD CONSTRAINTS (a candidate that violates any of these is WRONG):
- MUST be a music recording artist. NEVER suggest novelists, authors, audiobook narrators, voice actors, podcasters, classical composers, film score composers, or anyone whose primary work isn't recorded music for streaming/release.
- MUST be living. No deceased artists.
- MUST have released original music since 2022 (not just compilation re-releases, not just a 2024 deluxe edition of an old album).
- MUST have between 1,000 and 100,000 Spotify monthly listeners. This is the Songfinch A&R sweet spot. Above 100K listeners, artists are agency-managed and don't take direct outreach — that's outside our range. Below 1K is below A&R-viable.
- MUST be a contemporary artist with active streaming presence — not a legacy/heritage act, not a session musician, not a "rock band from the 1960s" being marketed as catalog.

SEARCH STRATEGY:
- Search Pitchfork, FADER, NPR Music, Stereogum, Brooklyn Vegan, Paste, Consequence, Resident Advisor (for electronic) for "best new artists 2024" / "rising artists 2025" / "ones to watch" coverage.
- Search festival lineups for the requested region/genre — early-stage artists get unannounced or smaller-bill slots.
- Search Bandcamp's daily / weekly editorial picks for genre-specific emerging acts.
- For each artist you list, you should have actually seen them mentioned in a real article.

QUALITY:
- VARIETY: don't list the same 25 "indie buzz" names everyone knows. Mix career stages within the 1K-100K listener band.
- If a criteria genre is broad ("rock"), include subgenres (indie rock, post-punk, shoegaze, garage rock, etc.) and split your suggestions across them.
- Rationale per artist should reference SOMETHING SPECIFIC you found — a recent release, a press mention, a festival slot — not generic "rising indie act" filler.

OUTPUT:
- After your search, return ONLY a JSON object in the exact shape below. No prose outside the JSON, no markdown fences (or if you must use fences, use \`\`\`json).
- List ~50 artists.

{
  "artists": [
    {
      "name": "Artist Name",
      "genres": ["indie pop", "folk"],
      "rationale": "Specific reason grounded in real press/release info"
    }
  ]
}`;

function buildPrompt(criteria: HunterCriteria): string {
  const parts: string[] = [];
  parts.push('Find ~50 emerging artists for Songfinch\'s A&R queue.');
  parts.push('\nCriteria:');
  if (criteria.genres.length > 0) parts.push(`- Genres: ${criteria.genres.join(', ')}`);
  if (criteria.regions.length > 0) parts.push(`- Regions (ISO codes): ${criteria.regions.join(', ')}`);
  if (criteria.roleTarget !== 'both') parts.push(`- Role target: ${criteria.roleTarget}`);
  const minListeners = criteria.sizeBracket?.min ?? 1000;
  const maxListeners = criteria.sizeBracket?.max ?? 100_000;
  parts.push(`- Min Spotify monthly listeners: ${minListeners.toLocaleString()}`);
  parts.push(`- Max Spotify monthly listeners: ${maxListeners.toLocaleString()} (HARD LIMIT — do not exceed)`);
  if (criteria.recency?.sinceYear) parts.push(`- Active since: ${criteria.recency.sinceYear}`);
  if (criteria.instrument) parts.push(`- Notable for: ${criteria.instrument}`);
  parts.push('\nUse Google Search to find real, current candidates. Return the JSON specified in the system prompt.');
  return parts.join('\n');
}
