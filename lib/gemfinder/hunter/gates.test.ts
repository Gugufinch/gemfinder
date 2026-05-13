import { describe, it, expect } from 'vitest';
import { evaluateGates } from '@/lib/gemfinder/hunter/gates';
import { DEFAULT_HUNTER_WEIGHTS } from '@/lib/gemfinder/hunter/weights-store';
import type { EnrichedCandidate, BlocklistResult, HunterWeights, HunterCriteria } from '@/lib/gemfinder/types';

// ---------------------------------------------------------------------------
// Minimal fixtures
// ---------------------------------------------------------------------------

const baseCandidate: EnrichedCandidate = {
  displayName: 'Test Artist',
  musicbrainzId: 'mb-123',
  genres: ['indie pop'],
  isLiving: true,
  inferredRole: 'performer',
  contactReadiness: 'direct',
};

const notBlocked: BlocklistResult = { blocked: false };

const blockedKickoff: BlocklistResult = {
  blocked: true,
  reason: 'kickoff',
  matchedOn: 'canonical_name',
  matchedRecord: {
    id: 'rec-1',
    displayName: 'Test Artist',
    location: 'kickoff',
  },
};

const blockedRejected: BlocklistResult = {
  blocked: true,
  reason: 'rejected',
  matchedOn: 'spotify_artist_id',
  matchedRecord: {
    id: 'rec-2',
    displayName: 'Test Artist',
    location: 'rejected',
  },
};

// Build a weights object with all gates disabled (useful for per-gate tests)
function withGates(overrides: Partial<HunterWeights['gates']>): HunterWeights {
  return {
    ...DEFAULT_HUNTER_WEIGHTS,
    gates: { ...DEFAULT_HUNTER_WEIGHTS.gates, ...overrides },
  };
}

// All gates off — baseline for isolated gate testing
const allOff = withGates({
  require_not_blocked: false,
  require_living: false,
  require_genre_match: false,
  require_reachable: false,
});

// ---------------------------------------------------------------------------
// require_not_blocked
// ---------------------------------------------------------------------------

describe('require_not_blocked', () => {
  const weights = withGates({
    require_not_blocked: true,
    require_living: false,
    require_genre_match: false,
    require_reachable: false,
  });

  it('returns pass:false with blocked:kickoff when candidate is blocked', () => {
    const result = evaluateGates(baseCandidate, weights, blockedKickoff);
    expect(result).toEqual({ pass: false, reason: 'blocked:kickoff' });
  });

  it('returns pass:false with blocked:rejected when candidate is rejected-blocked', () => {
    const result = evaluateGates(baseCandidate, weights, blockedRejected);
    expect(result).toEqual({ pass: false, reason: 'blocked:rejected' });
  });

  it('returns pass:true when candidate is not blocked', () => {
    const result = evaluateGates(baseCandidate, weights, notBlocked);
    expect(result).toEqual({ pass: true });
  });

  it('passes a blocked candidate when gate is disabled', () => {
    const result = evaluateGates(baseCandidate, allOff, blockedKickoff);
    expect(result).toEqual({ pass: true });
  });
});

// ---------------------------------------------------------------------------
// require_living
// ---------------------------------------------------------------------------

describe('require_living', () => {
  const weights = withGates({
    require_not_blocked: false,
    require_living: true,
    require_genre_match: false,
    require_reachable: false,
  });

  it('returns pass:false with reason "deceased" when isLiving is false', () => {
    const result = evaluateGates({ ...baseCandidate, isLiving: false }, weights, notBlocked);
    expect(result).toEqual({ pass: false, reason: 'deceased' });
  });

  it('returns pass:true when isLiving is true', () => {
    const result = evaluateGates({ ...baseCandidate, isLiving: true }, weights, notBlocked);
    expect(result).toEqual({ pass: true });
  });

  it('passes a deceased candidate when gate is disabled', () => {
    const result = evaluateGates({ ...baseCandidate, isLiving: false }, allOff, notBlocked);
    expect(result).toEqual({ pass: true });
  });
});

// ---------------------------------------------------------------------------
// require_genre_match
// ---------------------------------------------------------------------------

describe('require_genre_match', () => {
  // DEFAULT_HUNTER_WEIGHTS targetGenres: ['indie pop', 'folk', 'singer-songwriter']
  const weights = withGates({
    require_not_blocked: false,
    require_living: false,
    require_genre_match: true,
    require_reachable: false,
  });

  it('passes when candidate genres overlap targetGenres', () => {
    const result = evaluateGates({ ...baseCandidate, genres: ['indie pop'] }, weights, notBlocked);
    expect(result).toEqual({ pass: true });
  });

  it('passes with partial overlap (at least one match)', () => {
    const result = evaluateGates({ ...baseCandidate, genres: ['metal', 'folk'] }, weights, notBlocked);
    expect(result).toEqual({ pass: true });
  });

  it('returns pass:false with reason "genre_mismatch" when no genre matches', () => {
    const result = evaluateGates({ ...baseCandidate, genres: ['death metal', 'grindcore'] }, weights, notBlocked);
    expect(result).toEqual({ pass: false, reason: 'genre_mismatch' });
  });

  it('returns pass:false when candidate genres is empty', () => {
    const result = evaluateGates({ ...baseCandidate, genres: [] }, weights, notBlocked);
    expect(result).toEqual({ pass: false, reason: 'genre_mismatch' });
  });

  it('is case-insensitive — candidate "Indie" matches target "indie pop"? no — but "Indie Pop" matches "indie pop"', () => {
    const result = evaluateGates({ ...baseCandidate, genres: ['Indie Pop'] }, weights, notBlocked);
    expect(result).toEqual({ pass: true });
  });

  it('is case-insensitive — target has "FOLK", candidate has "folk" → pass', () => {
    const upperTargetWeights: HunterWeights = {
      ...DEFAULT_HUNTER_WEIGHTS,
      weights: {
        ...DEFAULT_HUNTER_WEIGHTS.weights,
        genre_fit: {
          ...DEFAULT_HUNTER_WEIGHTS.weights.genre_fit,
          targetGenres: ['INDIE POP', 'FOLK'],
        },
      },
      gates: {
        require_not_blocked: false,
        require_living: false,
        require_genre_match: true,
        require_reachable: false,
      },
    };
    const result = evaluateGates({ ...baseCandidate, genres: ['folk'] }, upperTargetWeights, notBlocked);
    expect(result).toEqual({ pass: true });
  });

  it('passes a genre-mismatched candidate when gate is disabled', () => {
    const result = evaluateGates({ ...baseCandidate, genres: ['death metal'] }, allOff, notBlocked);
    expect(result).toEqual({ pass: true });
  });
});

// ---------------------------------------------------------------------------
// require_reachable
// ---------------------------------------------------------------------------

describe('require_reachable', () => {
  const weights = withGates({
    require_not_blocked: false,
    require_living: false,
    require_genre_match: false,
    require_reachable: true,
  });

  it('returns pass:false with reason "no_contact" when contactReadiness is "none"', () => {
    const result = evaluateGates({ ...baseCandidate, contactReadiness: 'none' }, weights, notBlocked);
    expect(result).toEqual({ pass: false, reason: 'no_contact' });
  });

  it('passes when contactReadiness is "social_only"', () => {
    const result = evaluateGates({ ...baseCandidate, contactReadiness: 'social_only' }, weights, notBlocked);
    expect(result).toEqual({ pass: true });
  });

  it('passes when contactReadiness is "direct"', () => {
    const result = evaluateGates({ ...baseCandidate, contactReadiness: 'direct' }, weights, notBlocked);
    expect(result).toEqual({ pass: true });
  });

  it('passes when contactReadiness is "manager"', () => {
    const result = evaluateGates({ ...baseCandidate, contactReadiness: 'manager' }, weights, notBlocked);
    expect(result).toEqual({ pass: true });
  });

  it('passes a "none" candidate when gate is disabled', () => {
    const result = evaluateGates({ ...baseCandidate, contactReadiness: 'none' }, allOff, notBlocked);
    expect(result).toEqual({ pass: true });
  });
});

// ---------------------------------------------------------------------------
// All gates pass end-to-end
// ---------------------------------------------------------------------------

describe('all gates pass', () => {
  it('returns pass:true when all gates are enabled and candidate satisfies all', () => {
    const weights = withGates({
      require_not_blocked: true,
      require_living: true,
      require_genre_match: true,
      require_reachable: true,
    });
    const result = evaluateGates(baseCandidate, weights, notBlocked);
    expect(result).toEqual({ pass: true });
  });
});

// ---------------------------------------------------------------------------
// Gate ordering: first failure wins
// ---------------------------------------------------------------------------

describe('gate ordering', () => {
  it('reports blocked (first gate) when candidate is both blocked AND deceased', () => {
    const weights = withGates({
      require_not_blocked: true,
      require_living: true,
      require_genre_match: true,
      require_reachable: true,
    });
    const candidate: EnrichedCandidate = {
      ...baseCandidate,
      isLiving: false,
    };
    const result = evaluateGates(candidate, weights, blockedKickoff);
    expect(result).toEqual({ pass: false, reason: 'blocked:kickoff' });
  });

  it('reports deceased (second gate) when alive check fails but not blocked', () => {
    const weights = withGates({
      require_not_blocked: true,
      require_living: true,
      require_genre_match: true,
      require_reachable: true,
    });
    const candidate: EnrichedCandidate = {
      ...baseCandidate,
      isLiving: false,
      contactReadiness: 'none',
    };
    const result = evaluateGates(candidate, weights, notBlocked);
    expect(result).toEqual({ pass: false, reason: 'deceased' });
  });

  it('reports genre_mismatch (third gate) before no_contact (fourth gate)', () => {
    const weights = withGates({
      require_not_blocked: true,
      require_living: true,
      require_genre_match: true,
      require_reachable: true,
    });
    const candidate: EnrichedCandidate = {
      ...baseCandidate,
      isLiving: true,
      genres: ['death metal'],
      contactReadiness: 'none',
    };
    const result = evaluateGates(candidate, weights, notBlocked);
    expect(result).toEqual({ pass: false, reason: 'genre_mismatch' });
  });

  // ---------------------------------------------------------------------------
  // criteria.genres takes precedence over weights.genre_fit.targetGenres
  // ---------------------------------------------------------------------------
  // The pre-fix behavior used workspace target genres for the gate, which broke
  // searches where the user's criteria genres differed from the workspace
  // defaults (e.g., "rock" search vs. "indie pop/folk/singer-songwriter" target).
  describe('genre gate uses criteria.genres when provided', () => {
    const baseCriteria: HunterCriteria = {
      genres: ['rock', 'alternative'],
      regions: [],
      roleTarget: 'both',
      targetCount: 25,
    };

    it('passes when candidate genres match criteria.genres (rock), even if workspace targets are indie pop', () => {
      const weights = withGates({ require_genre_match: true });
      // Workspace targetGenres is indie pop / folk / singer-songwriter, but
      // user searched for rock — the rock-tagged candidate should PASS.
      const rockCandidate: EnrichedCandidate = { ...baseCandidate, genres: ['rock', 'classic rock'] };
      expect(evaluateGates(rockCandidate, weights, notBlocked, baseCriteria)).toEqual({ pass: true });
    });

    it('rejects when candidate genres DO NOT match criteria.genres', () => {
      const weights = withGates({ require_genre_match: true });
      const jazzCandidate: EnrichedCandidate = { ...baseCandidate, genres: ['jazz'] };
      expect(evaluateGates(jazzCandidate, weights, notBlocked, baseCriteria)).toEqual({ pass: false, reason: 'genre_mismatch' });
    });

    it('falls back to weights.genre_fit.targetGenres when criteria.genres is empty (region-only search)', () => {
      const weights = withGates({ require_genre_match: true });
      const regionOnlyCriteria: HunterCriteria = { genres: [], regions: ['US'], roleTarget: 'both', targetCount: 25 };
      const indieCandidate: EnrichedCandidate = { ...baseCandidate, genres: ['indie pop'] };  // matches workspace targets
      expect(evaluateGates(indieCandidate, weights, notBlocked, regionOnlyCriteria)).toEqual({ pass: true });
    });
  });

  // ---------------------------------------------------------------------------
  // size cap gate (NEW)
  // ---------------------------------------------------------------------------
  describe('size cap gate (sizeBracket.max)', () => {
    const baseCriteria: HunterCriteria = { genres: ['rock'], regions: [], roleTarget: 'both', targetCount: 25 };

    it('rejects candidate above the default cap (500K) when criteria.sizeBracket.max is not set', () => {
      const weights = withGates({ require_genre_match: false });
      // 5M followers — definitely a megastar
      const megastar: EnrichedCandidate = { ...baseCandidate, genres: ['rock'], spotifyFollowers: 5_000_000 };
      const result = evaluateGates(megastar, weights, notBlocked, baseCriteria);
      expect(result.pass).toBe(false);
      if (!result.pass) expect(result.reason).toMatch(/^too_big:/);
    });

    it('respects an explicit criteria.sizeBracket.max', () => {
      const weights = withGates({ require_genre_match: false });
      const criteria: HunterCriteria = { ...baseCriteria, sizeBracket: { max: 50_000 } };
      const candidate: EnrichedCandidate = { ...baseCandidate, genres: ['rock'], spotifyFollowers: 100_000 };
      const result = evaluateGates(candidate, weights, notBlocked, criteria);
      expect(result.pass).toBe(false);
      if (!result.pass) expect(result.reason).toMatch(/^too_big:/);
    });

    it('passes when candidate is below the cap', () => {
      const weights = withGates({ require_genre_match: false });
      const indie: EnrichedCandidate = { ...baseCandidate, genres: ['rock'], spotifyFollowers: 10_000 };
      expect(evaluateGates(indie, weights, notBlocked, baseCriteria)).toEqual({ pass: true });
    });

    it('passes when spotifyFollowers is undefined (no data = benefit of the doubt)', () => {
      const weights = withGates({ require_genre_match: false });
      const unknownSize: EnrichedCandidate = { ...baseCandidate, genres: ['rock'] };  // no spotifyFollowers
      expect(evaluateGates(unknownSize, weights, notBlocked, baseCriteria)).toEqual({ pass: true });
    });
  });

  // ---------------------------------------------------------------------------
  // size floor gate (NEW)
  // ---------------------------------------------------------------------------
  describe('size floor gate (sizeBracket.min)', () => {
    it('rejects candidate below the explicit floor', () => {
      const weights = withGates({ require_genre_match: false });
      const criteria: HunterCriteria = { genres: ['rock'], regions: [], roleTarget: 'both', targetCount: 25, sizeBracket: { min: 5000 } };
      const tiny: EnrichedCandidate = { ...baseCandidate, genres: ['rock'], spotifyFollowers: 500 };
      const result = evaluateGates(tiny, weights, notBlocked, criteria);
      expect(result.pass).toBe(false);
      if (!result.pass) expect(result.reason).toMatch(/^too_small:/);
    });

    it('does not fire when sizeBracket.min is not set (no default floor)', () => {
      const weights = withGates({ require_genre_match: false });
      const criteria: HunterCriteria = { genres: ['rock'], regions: [], roleTarget: 'both', targetCount: 25 };
      const tiny: EnrichedCandidate = { ...baseCandidate, genres: ['rock'], spotifyFollowers: 100 };
      expect(evaluateGates(tiny, weights, notBlocked, criteria)).toEqual({ pass: true });
    });
  });
});
