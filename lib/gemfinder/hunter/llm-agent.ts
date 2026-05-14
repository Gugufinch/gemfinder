import OpenAI from 'openai';
import type { HunterCriteria } from '@/lib/gemfinder/types';
import type { MBArtist } from '@/lib/gemfinder/hunter/musicbrainz';

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('[HUNTER_LLM] OPENAI_API_KEY not set');
  _client = new OpenAI({ apiKey });
  return _client;
}

/**
 * Ask OpenAI for ~50 emerging artists matching the criteria. Returns them
 * as MBArtist-shaped objects so the existing enrichment pipeline can
 * process them unchanged. mbid is empty (LLM doesn't know MB IDs) — the
 * enrichment's Spotify-search-by-name fallback handles the lookup.
 *
 * Returns up to 50 candidates. The orchestrator will enrich + score +
 * top-N from these.
 */
export async function searchArtistsViaLLM(criteria: HunterCriteria): Promise<MBArtist[]> {
  const prompt = buildPrompt(criteria);
  let response;
  try {
    response = await client().chat.completions.create({
      model: 'gpt-4o-mini',  // fast + cheap for structured-list tasks
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,  // some variety run-to-run
      max_completion_tokens: 4000,
    });
  } catch (err) {
    console.warn('[HUNTER_LLM] OpenAI call failed:', err);
    return [];
  }

  const content = response.choices[0]?.message?.content;
  if (!content) {
    console.warn('[HUNTER_LLM] empty response from OpenAI');
    return [];
  }

  let parsed: { artists?: Array<{ name: string; genres?: string[]; rationale?: string }> };
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    console.warn('[HUNTER_LLM] failed to parse OpenAI JSON:', err);
    return [];
  }

  const items = parsed.artists ?? [];
  if (!Array.isArray(items)) {
    console.warn('[HUNTER_LLM] artists field is not an array');
    return [];
  }

  // Map LLM output → MBArtist shape. id is empty (no MB lookup), name comes
  // from LLM, tags come from LLM-suggested genres. The enrichment Step 0
  // fetchArtistDetails will be skipped (we'll handle this in enrichment),
  // then Spotify search-by-name kicks in.
  return items
    .filter((a) => a && typeof a.name === 'string' && a.name.trim().length > 0)
    .map((a) => ({
      id: '',  // sentinel: "no MB lookup possible"
      name: a.name.trim(),
      type: 'Person' as const,  // best guess; enrichment will overwrite if Spotify finds different
      tags: (a.genres ?? []).slice(0, 5).map((name) => ({ name: name.toLowerCase(), count: 1 })),
      // Pass the LLM's rationale through as an aiHint so the candidate gets a
      // "why this artist?" line on the review card.
      _aiHint: typeof a.rationale === 'string' ? a.rationale : undefined,
      // 'life-span' omitted — LLM agent assumes living artists (this is the whole point)
      // relations + release-groups omitted — Step 0 in enrichment is a no-op for empty id
    }));
}

const SYSTEM_PROMPT = `You are an A&R discovery assistant for Songfinch, a personalized song service. Your job: given criteria like genre, region, role target, and follower range, list emerging-but-active MUSIC RECORDING ARTISTS who match.

HARD CONSTRAINTS (a candidate that violates any of these is WRONG):
- MUST be a music recording artist. NEVER suggest novelists, authors, audiobook narrators, voice actors, podcasters, classical composers, film score composers, or anyone whose primary work isn't recorded music for streaming/release.
- MUST be living. No deceased artists.
- MUST have released original music since 2020 (not just compilation re-releases, not just a 2024 deluxe edition of 1995 album).
- MUST have between 1,000 and 250,000 Spotify monthly listeners. Megastars (Bruce Springsteen, Taylor Swift, Bob Dylan tier) are unsignable. Below 1K listeners is below A&R-viable.
- MUST be a contemporary artist with active streaming presence — not a legacy/heritage act, not a session musician, not a "rock band from the 1960s" being marketed as catalog.

QUALITY:
- Pull from music journalism, blog rankings, festival lineups, year-end best-of lists, NPR Music, Pitchfork, FADER, The Fader, Stereogum, Brooklyn Vegan, etc.
- Variety matters: don't just list the same 25 "indie buzz" names every time. Vary across the requested genre/region.
- Include artists at different career stages within the 1K-250K listener band (some at 5K, some at 50K, some at 150K).
- If a criteria genre is genuinely broad (e.g., "rock"), include subgenres (indie rock, garage rock, post-punk, shoegaze, etc.).

OUTPUT:
- ALWAYS return valid JSON in the exact shape requested. No prose outside JSON.`;

function buildPrompt(criteria: HunterCriteria): string {
  const parts: string[] = [];
  parts.push(`Find ~50 emerging artists for Songfinch's A&R queue.\n`);
  parts.push(`Criteria:`);
  if (criteria.genres.length > 0) parts.push(`- Genres: ${criteria.genres.join(', ')}`);
  if (criteria.regions.length > 0) parts.push(`- Regions (ISO codes): ${criteria.regions.join(', ')}`);
  if (criteria.roleTarget !== 'both') parts.push(`- Role target: ${criteria.roleTarget}`);
  if (criteria.sizeBracket?.min) parts.push(`- Min Spotify followers: ${criteria.sizeBracket.min}`);
  if (criteria.sizeBracket?.max) parts.push(`- Max Spotify followers: ${criteria.sizeBracket.max} (HARD LIMIT — do not exceed)`);
  if (criteria.recency?.sinceYear) parts.push(`- Active since: ${criteria.recency.sinceYear}`);
  if (criteria.instrument) parts.push(`- Notable for: ${criteria.instrument}`);
  parts.push(`\nReturn JSON in this exact shape:`);
  parts.push(`{
  "artists": [
    {
      "name": "Artist Name",
      "genres": ["indie pop", "folk"],
      "rationale": "1-line why this artist fits the criteria"
    },
    ...
  ]
}`);
  parts.push(`\nList 50 distinct artists. Bias toward variety — don't just list the 25 most-mentioned indie buzz acts.`);
  return parts.join('\n');
}
