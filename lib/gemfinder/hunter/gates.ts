// lib/gemfinder/hunter/gates.ts
// NOTE: BlocklistResult lives in types.ts (where it's defined), NOT in scout-blocklist.ts.
import type { HunterWeights, HunterCriteria, EnrichedCandidate, BlocklistResult } from '@/lib/gemfinder/types';

export type GateResult = { pass: true } | { pass: false; reason: string };

// Hard upper-bound on Spotify followers when criteria.sizeBracket.max is not set.
// 1M is wide enough to include mid-tier indie acts who might still take direct
// outreach (some bands at 500K-1M listeners still field commission inquiries).
// Operators can tighten this per-run via criteria.sizeBracket.max.
const DEFAULT_MAX_SPOTIFY_FOLLOWERS = 1_000_000;

// Backup megastar signal: MusicBrainz caps release-groups at 25 in the standard
// ?inc query. An artist with 20+ release groups is overwhelmingly likely to be
// established (Bruce Springsteen, Pearl Jam) — beyond A&R discovery range.
// This fires when we lack Spotify follower data (which happens often because
// MB doesn't reliably store Spotify relations). Crude but effective.
const MAX_RELEASE_GROUPS_FOR_DISCOVERY = 20;

// Minimum reach evidence required when the candidate is "unverified" (no MB
// ID, no Spotify ID match, no deep-research verification). Without this gate,
// phantom artists pulled from LLM hallucination land in the queue scoring ~68
// because the configuration-derived dimensions (genre fit, role match,
// recency) pull the weighted average up even when ALL reach data is missing.
//
// Threshold of 2 strikes a balance: a real emerging artist on Instagram +
// TikTok (but no Spotify match) passes; a name with zero verified social
// data does not. Reach dims counted: spotifyFollowers, instagramFollowers,
// tiktokFollowers, youtubeSubscribers, soundcloudFollowers (5 total).
const MIN_REACH_EVIDENCE_FOR_UNVERIFIED = 2;

/**
 * Count how many reach dimensions on a candidate have actual data (vs being
 * undefined/null). Number.isFinite is used so a stored 0 (rare but possible)
 * counts as "verified, just small" instead of being treated as missing.
 */
function countReachEvidence(candidate: EnrichedCandidate): number {
  let count = 0;
  if (Number.isFinite(candidate.spotifyFollowers)) count++;
  if (Number.isFinite(candidate.instagramFollowers)) count++;
  if (Number.isFinite(candidate.tiktokFollowers)) count++;
  if (Number.isFinite(candidate.youtubeSubscribers)) count++;
  if (Number.isFinite(candidate.soundcloudFollowers)) count++;
  return count;
}

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
  // Size gates: Spotify follower count is the AUTHORITATIVE signal when we
  // have it. The release-groups count is a FALLBACK proxy that only fires
  // when Spotify data is missing — otherwise we'd reject indie acts with
  // long catalogs (e.g., Pedro the Lion: 25 release groups but only ~30K
  // Spotify followers, very engageable).
  const sizeCap = criteria?.sizeBracket?.max ?? DEFAULT_MAX_SPOTIFY_FOLLOWERS;
  if (typeof candidate.spotifyFollowers === 'number') {
    if (candidate.spotifyFollowers > sizeCap) {
      return { pass: false, reason: `too_big:${candidate.spotifyFollowers.toLocaleString()}_followers` };
    }
    // We have authoritative size data — trust it. Skip the release-groups proxy.
  } else if (typeof candidate.releaseGroupCount === 'number' && candidate.releaseGroupCount >= MAX_RELEASE_GROUPS_FOR_DISCOVERY) {
    return { pass: false, reason: `too_established:${candidate.releaseGroupCount}_release_groups` };
  }
  // Size floor: reject too-small artists. Only fires when sizeBracket.min is
  // explicitly set (no default — most workspaces want to see emerging artists).
  if (criteria?.sizeBracket?.min && typeof candidate.spotifyFollowers === 'number' && candidate.spotifyFollowers < criteria.sizeBracket.min) {
    return { pass: false, reason: `too_small:${candidate.spotifyFollowers.toLocaleString()}_followers` };
  }
  if (g.require_reachable && candidate.contactReadiness === 'none') {
    return { pass: false, reason: 'no_contact' };
  }
  // Minimum-evidence gate (Bug 1 fix): for candidates that couldn't be
  // verified via MB/Spotify/deep-research, require at least N confirmed
  // reach dimensions. Without this, score-68 phantom artists ("Jermaine
  // Butler · LLM-sourced · no Spotify match · IG handle but never scraped")
  // pass MIN_SCORE_FLOOR=35 and pollute the queue. Verified candidates
  // (MB ID, Spotify match, or deep research found) bypass this — they're
  // real artists by definition even when scrape data is sparse.
  if (candidate.unverified) {
    const evidence = countReachEvidence(candidate);
    if (evidence < MIN_REACH_EVIDENCE_FOR_UNVERIFIED) {
      return {
        pass: false,
        reason: `low_evidence:unverified_with_${evidence}_reach_dims`,
      };
    }
  }
  return { pass: true };
}
