// lib/gemfinder/hunter/gates.ts
// NOTE: BlocklistResult lives in types.ts (where it's defined), NOT in scout-blocklist.ts.
import type { HunterWeights, EnrichedCandidate, BlocklistResult } from '@/lib/gemfinder/types';

export type GateResult = { pass: true } | { pass: false; reason: string };

export function evaluateGates(
  candidate: EnrichedCandidate,
  weights: HunterWeights,
  isBlockedResult: BlocklistResult
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
    const targets = weights.weights.genre_fit.targetGenres.map((t) => t.toLowerCase());
    const matched = candidate.genres.some((c) => targets.includes(c.toLowerCase()));
    if (!matched) return { pass: false, reason: 'genre_mismatch' };
  }
  if (g.require_reachable && candidate.contactReadiness === 'none') {
    return { pass: false, reason: 'no_contact' };
  }
  return { pass: true };
}
