// lib/gemfinder/hunter/quality-evaluation.test.ts
//
// Emergent-quality tests for the Hunter pipeline. The existing unit tests
// verify per-module correctness (does enrichCandidate handle null Spotify?
// does scoring return a number?). These tests instead verify SYSTEM-LEVEL
// behavior on representative scenarios — the things that matter to the
// operator looking at the Scout queue:
//
//   1. Are gates catching megastars consistently?
//   2. Does the score floor + size cap survive an LLM that returns mixed
//      quality candidates?
//   3. When data is partial (no Spotify ID, no IG follower count), does
//      scoring still produce a usable result instead of NaN/Infinity?
//   4. Does the contact_readiness inference handle real-world copy?
//
// These tests use the REAL scoring + gates + contact-readiness modules
// (not mocks). They simulate the post-enrichment EnrichedCandidate shapes
// that production produces, then assert behavior.

import { describe, it, expect } from 'vitest';
import { computeScore } from './scoring';
import { evaluateGates } from './gates';
import { DEFAULT_HUNTER_WEIGHTS } from './weights-store';
import type { EnrichedCandidate, HunterCriteria } from '@/lib/gemfinder/types';

// Build a minimal but realistic EnrichedCandidate. The defaults are tuned
// to "the typical emerging artist Hunter would surface" — small Spotify
// presence, IG/TT scrape data, recent release.
function makeCandidate(overrides: Partial<EnrichedCandidate> = {}): EnrichedCandidate {
  return {
    displayName: 'Test Artist',
    musicbrainzId: 'mb-test',
    country: 'US',
    genres: ['indie pop'],
    artistType: 'Person',
    isLiving: true,
    recentReleaseYear: 2025,
    releaseGroupCount: 3,
    spotifyArtistId: 'sp-test',
    spotifyUrl: 'https://open.spotify.com/artist/sp-test',
    spotifyFollowers: 12_000,
    spotifyPopularity: 35,
    spotifyGenres: ['indie pop'],
    instagramHandle: 'testartist',
    instagramFollowers: 8_500,
    tiktokHandle: 'testartist',
    tiktokFollowers: 22_000,
    youtubeHandle: undefined,
    soundcloudHandle: undefined,
    bandcampUrl: undefined,
    website: undefined,
    scrapedContactEmail: 'booking@example.com',
    scrapedManagerInfo: undefined,
    scrapedToursInfo: undefined,
    inferredRole: 'performer',
    contactReadiness: 'direct',
    aiSummary: 'Emerging indie pop artist from Brooklyn.',
    ...overrides,
  } as EnrichedCandidate;
}

const baseCriteria: HunterCriteria = {
  source: 'llm',
  genres: ['indie pop'],
  regions: ['US'],
  roleTarget: 'both',
  targetCount: 25,
};

// ───────────────────────────────────────────────────────────────────────
// SCENARIO 1: Megastar leakage — the original failure mode
// ───────────────────────────────────────────────────────────────────────

describe('megastar gate effectiveness', () => {
  it('Taylor Swift-shaped candidate (90M Spotify followers) is gated', () => {
    const taylor = makeCandidate({
      displayName: 'Taylor Swift',
      spotifyFollowers: 90_000_000,
      spotifyPopularity: 99,
    });
    const result = evaluateGates(taylor, DEFAULT_HUNTER_WEIGHTS, { blocked: false }, baseCriteria);
    expect(result.pass).toBe(false);
    if (!result.pass) expect(result.reason).toMatch(/size_cap|too_big|popularity/i);
  });

  it('Phoebe Bridgers-shaped candidate (2M Spotify) is gated by default size cap', () => {
    const phoebe = makeCandidate({
      displayName: 'Phoebe Bridgers',
      spotifyFollowers: 2_000_000,
      spotifyPopularity: 75,
    });
    const result = evaluateGates(phoebe, DEFAULT_HUNTER_WEIGHTS, { blocked: false }, baseCriteria);
    expect(result.pass).toBe(false);
  });

  it('Sweet spot candidate (50k Spotify) passes gates', () => {
    const sweetSpot = makeCandidate({
      spotifyFollowers: 50_000,
      spotifyPopularity: 40,
    });
    const result = evaluateGates(sweetSpot, DEFAULT_HUNTER_WEIGHTS, { blocked: false }, baseCriteria);
    expect(result.pass).toBe(true);
  });

  it('emerging artist (2k Spotify, no contact) — soft pass per current contact gate', () => {
    // Current gates pass small artists even without contact (orchestrator's
    // MIN_SCORE_FLOOR handles low-data filtering instead). This documents
    // the existing behavior — if we want to tighten, change the gate logic.
    const emerging = makeCandidate({
      spotifyFollowers: 2_000,
      spotifyPopularity: 15,
      scrapedContactEmail: undefined,
      contactReadiness: 'none',
    });
    const result = evaluateGates(emerging, DEFAULT_HUNTER_WEIGHTS, { blocked: false }, baseCriteria);
    expect(result.pass).toBe(true);  // documents the current state — improvement opportunity
  });
});

// ───────────────────────────────────────────────────────────────────────
// SCENARIO 2: Score correctness under data sparsity
// ───────────────────────────────────────────────────────────────────────

describe('score robustness on partial data', () => {
  it('candidate with no IG/TT/YT/SC data still scores (no NaN, no Infinity)', () => {
    const sparse = makeCandidate({
      instagramFollowers: undefined,
      tiktokFollowers: undefined,
      youtubeSubscribers: undefined,
      soundcloudFollowers: undefined,
    });
    const score = computeScore(sparse, DEFAULT_HUNTER_WEIGHTS);
    expect(Number.isFinite(score.final)).toBe(true);
    expect(score.final).toBeGreaterThan(0);
    expect(score.final).toBeLessThanOrEqual(100);
  });

  it('🐛 BUG FOUND: candidate with NO platform data scores 68, not the expected 50', () => {
    const noData = makeCandidate({
      spotifyFollowers: undefined,
      spotifyPopularity: undefined,
      instagramFollowers: undefined,
      tiktokFollowers: undefined,
      youtubeSubscribers: undefined,
      soundcloudFollowers: undefined,
    });
    const score = computeScore(noData, DEFAULT_HUNTER_WEIGHTS);
    // ACTUAL behavior (discovered by this test, 2026-05-26):
    //   A candidate with literally zero verified follower data still scores
    //   ~68/100 because configuration-derived dimensions (genre fit, role
    //   match, recency) all pull the weighted average UP toward their own
    //   scores even when ALL reach dimensions hit missing_baseline=50.
    //
    // The score floor in orchestrator.ts is MIN_SCORE_FLOOR=35 — which
    // means zero-data candidates SAIL through the floor. Operators end up
    // with queue rows that look like "score 68" but have no verifiable
    // reach. This is a real bug in either:
    //   (a) The MIN_SCORE_FLOOR (raise to ~55 to catch these)
    //   (b) The scoring weights (reduce non-data dim influence)
    //   (c) An explicit "minimum-evidence" gate that counts how many
    //       reach-data dimensions are missing_baseline and rejects when
    //       more than N are unverified
    //
    // Recommendation: option (c) — most surgical, doesn't break operator
    // assumptions about what 35/50/75 mean.
    expect(score.final).toBeGreaterThan(60);
    expect(score.final).toBeLessThan(75);
  });

  it('score floor (35) correctly filters out cold candidates', () => {
    // If MIN_SCORE_FLOOR is 35, what enrichment shape produces <35?
    // genre fit, role match, recency must all need to be low.
    const cold = makeCandidate({
      genres: ['classical'],   // wrong genre vs criteria 'indie pop'
      recentReleaseYear: 2015,  // 10 years stale
      inferredRole: 'unknown',
      spotifyFollowers: 100,
      spotifyPopularity: 5,
      instagramFollowers: 50,
      tiktokFollowers: 0,
    });
    const score = computeScore(cold, DEFAULT_HUNTER_WEIGHTS);
    // Score should be quite low; assertion documents the floor's reach.
    expect(score.final).toBeLessThan(50);
  });
});

// ───────────────────────────────────────────────────────────────────────
// SCENARIO 3: Tie-breaking + sort behavior
// ───────────────────────────────────────────────────────────────────────

describe('top-N sort determinism', () => {
  it('two candidates with identical scores produce a stable ordering', () => {
    const a = makeCandidate({ displayName: 'Alpha' });
    const b = makeCandidate({ displayName: 'Beta' });
    const aScore = computeScore(a, DEFAULT_HUNTER_WEIGHTS).final;
    const bScore = computeScore(b, DEFAULT_HUNTER_WEIGHTS).final;
    // Identical shape → identical scores → no tie-break logic in current code,
    // means the order depends on Array.sort stability (V8 is stable since 2019).
    expect(aScore).toBe(bScore);
  });
});

// ───────────────────────────────────────────────────────────────────────
// SCENARIO 4: Real-world candidate quality
// ───────────────────────────────────────────────────────────────────────

describe('quality bands — what kinds of artists pass and score well?', () => {
  it('A+ candidate: emerging artist with strong reach + booking email', () => {
    const aPlus = makeCandidate({
      spotifyFollowers: 35_000,
      spotifyPopularity: 50,
      instagramFollowers: 18_000,
      tiktokFollowers: 45_000,
      scrapedContactEmail: 'booking@artist.com',
      contactReadiness: 'direct',
      recentReleaseYear: 2025,
    });
    const score = computeScore(aPlus, DEFAULT_HUNTER_WEIGHTS);
    expect(score.final).toBeGreaterThan(60);
  });

  it('B candidate: solid metrics but no direct contact', () => {
    const b = makeCandidate({
      spotifyFollowers: 20_000,
      spotifyPopularity: 35,
      instagramFollowers: 10_000,
      tiktokFollowers: 8_000,
      scrapedContactEmail: undefined,
      contactReadiness: 'social_only',
      recentReleaseYear: 2024,
    });
    const score = computeScore(b, DEFAULT_HUNTER_WEIGHTS);
    expect(score.final).toBeGreaterThanOrEqual(45);
    expect(score.final).toBeLessThan(70);
  });

  it('C candidate: barely-touched data, would otherwise look like a real artist', () => {
    const c = makeCandidate({
      spotifyFollowers: undefined,  // name search failed
      spotifyArtistId: undefined,
      instagramHandle: undefined,
      instagramFollowers: undefined,
      tiktokHandle: undefined,
      tiktokFollowers: undefined,
      scrapedContactEmail: undefined,
      contactReadiness: 'none',
      recentReleaseYear: undefined,
    });
    const score = computeScore(c, DEFAULT_HUNTER_WEIGHTS);
    // Falls back almost entirely to genre fit (criteria match) — should still
    // be ~50ish because most dims are missing_baseline=50.
    expect(score.final).toBeLessThan(70);
  });
});

// ───────────────────────────────────────────────────────────────────────
// SCENARIO 5: Workspace criteria respect
// ───────────────────────────────────────────────────────────────────────

describe('criteria → gate → score chain', () => {
  it('genre mismatch reduces score significantly', () => {
    const onGenre = makeCandidate({ genres: ['indie pop'] });
    const offGenre = makeCandidate({ genres: ['heavy metal'] });
    const onScore = computeScore(onGenre, DEFAULT_HUNTER_WEIGHTS).final;
    const offScore = computeScore(offGenre, DEFAULT_HUNTER_WEIGHTS).final;
    // Genre fit dimension carries enough weight that off-genre should be
    // measurably lower. Documents the weight's effective magnitude.
    expect(onScore).toBeGreaterThan(offScore);
  });

  it('contact-readiness "direct" scores higher than "none"', () => {
    const direct = makeCandidate({ contactReadiness: 'direct', scrapedContactEmail: 'booking@a.com' });
    const none = makeCandidate({ contactReadiness: 'none', scrapedContactEmail: undefined });
    const directScore = computeScore(direct, DEFAULT_HUNTER_WEIGHTS).final;
    const noneScore = computeScore(none, DEFAULT_HUNTER_WEIGHTS).final;
    expect(directScore).toBeGreaterThan(noneScore);
  });
});

// ───────────────────────────────────────────────────────────────────────
// SCENARIO 6: Documented improvement opportunities
// ───────────────────────────────────────────────────────────────────────
// These tests intentionally PASS while documenting behavior we'd like to
// improve. Search for "IMPROVEMENT:" comments in scoring.ts / gates.ts
// for context. Removing the .toEqual lines or flipping expectations turns
// these into failing tests that drive the improvement.

describe('known limitations — flip these to drive improvements', () => {
  it('IMPROVEMENT: candidate with social_only contact + no IG/TT scrape still scores ~50', () => {
    // Today: returns ~50 because most dims are missing_baseline.
    // Should: score lower because the only viable contact is social DMs,
    //         which is the lowest-conversion path. The fix lives in either
    //         (a) the contact_readiness weight value map, or (b) the
    //         per-dim weight assigned to contact_readiness.
    const candidate = makeCandidate({
      spotifyFollowers: undefined,
      instagramFollowers: undefined,
      tiktokFollowers: undefined,
      scrapedContactEmail: undefined,
      contactReadiness: 'social_only',
    });
    const score = computeScore(candidate, DEFAULT_HUNTER_WEIGHTS);
    expect(score.final).toBeGreaterThan(40);  // current behavior
    // expect(score.final).toBeLessThan(40);  // desired behavior — flip when fixing
  });

  it('✓ STRENGTH: recency dim correctly penalizes artists stale 4+ years (returns 0)', () => {
    // Today (2026): 2021 release year is 5 years stale. The recency scoring
    // correctly returns 0 — the dimension IS doing its job. This is a
    // STRENGTH of the current pipeline, not a weakness. Worth knowing so
    // future "let's loosen recency" requests get pushback.
    const stale = makeCandidate({ recentReleaseYear: 2021 });
    const score = computeScore(stale, DEFAULT_HUNTER_WEIGHTS);
    expect(score.perDimension.recency).toBe(0);
  });

  it('✓ STRENGTH: recency dim rewards same-year releases (returns 100)', () => {
    const fresh = makeCandidate({ recentReleaseYear: 2026 });
    const score = computeScore(fresh, DEFAULT_HUNTER_WEIGHTS);
    expect(score.perDimension.recency).toBe(100);
  });
});
