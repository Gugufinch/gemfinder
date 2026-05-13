// lib/gemfinder/hunter/gates.ts
// NOTE: BlocklistResult lives in types.ts (where it's defined), NOT in scout-blocklist.ts.
import type { HunterWeights, HunterCriteria, EnrichedCandidate, BlocklistResult } from '@/lib/gemfinder/types';

export type GateResult = { pass: true } | { pass: false; reason: string };

// Hard upper-bound on Spotify followers when criteria.sizeBracket.max is not set.
// Above this, the artist is too big for A&R discovery — we'd waste time
// pretending we could engage them. Tuned for Songfinch's pre-engagement queue.
const DEFAULT_MAX_SPOTIFY_FOLLOWERS = 500_000;

export function evaluateGates(
  candidate: EnrichedCandidate,
  weights: HunterWeights,
  isBlockedResult: BlocklistResult,
  criteria?: HunterCriteria
): GateResult {
  const g = weights.gates;
  if (g.require_not_blocked && isBlockedResult.blocked) {
    // BlocklistResult is a discriminated union: { blocked: true, reason: 'kickoff' | 'live' | 'rejected' | 'candidate', ... }
    const source = isBlockedResult.blocked ? isBlockedResult.reason : 'unknown';
    return { pass: false, reason: `blocked:${source}` };
  }
  if (g.require_living && !candidate.isLiving) {
    return { pass: false, reason: 'deceased' };
  }
  if (g.require_genre_match) {
    // Genre gate uses the PER-RUN criteria genres (what the user typed in the
    // Search form). The workspace's weights.genre_fit.targetGenres is used for
    // SCORING only — it's a preference, not a hard filter. If criteria.genres
    // is empty (region-only search), fall back to workspace targets so we
    // still have SOME genre signal.
    const targets = (criteria?.genres?.length ? criteria.genres : weights.weights.genre_fit.targetGenres)
      .map((t) => t.toLowerCase());
    const matched = candidate.genres.some((c) => targets.includes(c.toLowerCase()));
    if (!matched) return { pass: false, reason: 'genre_mismatch' };
  }
  // Size cap: reject megastars. Uses criteria.sizeBracket.max if set, else
  // a global default. Only fires when we have confirmed follower data —
  // missing data passes (no benefit of doubt for an unknown ⇒ enriched
  // candidates that lack Spotify data won't be size-gated).
  const sizeCap = criteria?.sizeBracket?.max ?? DEFAULT_MAX_SPOTIFY_FOLLOWERS;
  if (typeof candidate.spotifyFollowers === 'number' && candidate.spotifyFollowers > sizeCap) {
    return { pass: false, reason: `too_big:${candidate.spotifyFollowers.toLocaleString()}_followers` };
  }
  // Size floor: reject too-small artists. Only fires when sizeBracket.min is
  // explicitly set (no default — most workspaces want to see emerging artists).
  if (criteria?.sizeBracket?.min && typeof candidate.spotifyFollowers === 'number' && candidate.spotifyFollowers < criteria.sizeBracket.min) {
    return { pass: false, reason: `too_small:${candidate.spotifyFollowers.toLocaleString()}_followers` };
  }
  if (g.require_reachable && candidate.contactReadiness === 'none') {
    return { pass: false, reason: 'no_contact' };
  }
  return { pass: true };
}
