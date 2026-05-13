// lib/gemfinder/hunter/scoring.test.ts
import { describe, it, expect } from 'vitest';
import {
  logScore,
  linearScore,
  valueMapScore,
  genreScore,
  geographyScore,
  recencyScore,
  computeScore,
} from '@/lib/gemfinder/hunter/scoring';
import { DEFAULT_HUNTER_WEIGHTS } from '@/lib/gemfinder/hunter/weights-store';
import type {
  HunterWeightLog,
  HunterWeightValueMap,
  HunterWeightGenre,
  HunterWeightGeography,
  HunterWeights,
  EnrichedCandidate,
} from '@/lib/gemfinder/types';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const logDim: HunterWeightLog = {
  weight: 1,
  curve: 'log',
  min: 100,
  max: 10000,
  missing_baseline: 50,
};

const linearDim: HunterWeightLog = {
  weight: 1,
  curve: 'linear',
  min: 0,
  max: 100,
  missing_baseline: 50,
};

const valueMapDim: HunterWeightValueMap = {
  weight: 1,
  values: { direct: 100, manager: 80, none: 0 },
  missing_baseline: 30,
};

const genreDim: HunterWeightGenre = {
  weight: 1,
  targetGenres: ['Indie Pop', 'Folk'],
  exact: 100,
  related: 60,
  none: 0,
};

const geoDim: HunterWeightGeography = {
  weight: 1,
  targetRegions: ['US', 'CA', 'GB'],
  match: 100,
  other: 50,
};

const recencyDim: HunterWeightLog = {
  weight: 1,
  curve: 'linear',
  min: 0,
  max: 100,
  missing_baseline: 50,
  days_window: 730, // 2 years window
};

// ---------------------------------------------------------------------------
// logScore
// ---------------------------------------------------------------------------

describe('logScore', () => {
  it('returns missing_baseline when value is undefined', () => {
    expect(logScore(undefined, logDim)).toBe(50);
  });

  it('returns missing_baseline when value is null', () => {
    expect(logScore(null as unknown as undefined, logDim)).toBe(50);
  });

  it('returns 0 when value <= min', () => {
    expect(logScore(100, logDim)).toBe(0);
    expect(logScore(50, logDim)).toBe(0);
  });

  it('returns 100 when value >= max', () => {
    expect(logScore(10000, logDim)).toBe(100);
    expect(logScore(99999, logDim)).toBe(100);
  });

  it('returns 50 for midpoint on log scale (1000 between 100 and 10000)', () => {
    // log10(100)=2, log10(10000)=4, log10(1000)=3 → midpoint → 50
    expect(logScore(1000, logDim)).toBe(50);
  });

  it('returns a value between 0 and 100 for an interior value', () => {
    const result = logScore(500, logDim);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(100);
  });

  it('returns missing_baseline for degenerate config (min === max)', () => {
    // log10(min) === log10(max) → would produce NaN. Guard kicks in.
    const degenerate: HunterWeightLog = { weight: 1, curve: 'log', min: 1000, max: 1000, missing_baseline: 50 };
    expect(logScore(500, degenerate)).toBe(50);
  });

  it('returns missing_baseline when min or max is non-positive (Math.log10 undefined)', () => {
    const zeroMin: HunterWeightLog = { weight: 1, curve: 'log', min: 0, max: 100, missing_baseline: 50 };
    const negMax: HunterWeightLog = { weight: 1, curve: 'log', min: 1, max: -100, missing_baseline: 50 };
    expect(logScore(50, zeroMin)).toBe(50);
    expect(logScore(50, negMax)).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// linearScore
// ---------------------------------------------------------------------------

describe('linearScore', () => {
  it('returns missing_baseline when value is undefined', () => {
    expect(linearScore(undefined, linearDim)).toBe(50);
  });

  it('returns 0 when value <= min', () => {
    expect(linearScore(0, linearDim)).toBe(0);
    expect(linearScore(-5, linearDim)).toBe(0);
  });

  it('returns 100 when value >= max', () => {
    expect(linearScore(100, linearDim)).toBe(100);
    expect(linearScore(200, linearDim)).toBe(100);
  });

  it('returns 50 for midpoint on linear scale (50 between 0 and 100)', () => {
    expect(linearScore(50, linearDim)).toBe(50);
  });

  it('returns 25 for value one-quarter through range', () => {
    expect(linearScore(25, linearDim)).toBe(25);
  });

  it('returns missing_baseline for degenerate config (min === max)', () => {
    const degenerate: HunterWeightLog = { weight: 1, curve: 'linear', min: 50, max: 50, missing_baseline: 50 };
    expect(linearScore(25, degenerate)).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// valueMapScore
// ---------------------------------------------------------------------------

describe('valueMapScore', () => {
  it('returns mapped value for a known key', () => {
    expect(valueMapScore('direct', valueMapDim)).toBe(100);
    expect(valueMapScore('manager', valueMapDim)).toBe(80);
    expect(valueMapScore('none', valueMapDim)).toBe(0);
  });

  it('returns missing_baseline for an unknown key', () => {
    expect(valueMapScore('agency', valueMapDim)).toBe(30);
  });

  it('returns missing_baseline when key is undefined', () => {
    expect(valueMapScore(undefined, valueMapDim)).toBe(30);
  });

  it('returns default 50 when missing_baseline is absent and key unknown', () => {
    const dimNoBaseline: HunterWeightValueMap = {
      weight: 1,
      values: { performer: 100 },
    };
    expect(valueMapScore('unknown_key', dimNoBaseline)).toBe(50);
    expect(valueMapScore(undefined, dimNoBaseline)).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// genreScore
// ---------------------------------------------------------------------------

describe('genreScore', () => {
  it('returns exact score when there is a match', () => {
    expect(genreScore(['indie pop'], genreDim)).toBe(100);
  });

  it('is case-insensitive for matching', () => {
    expect(genreScore(['INDIE POP'], genreDim)).toBe(100);
    expect(genreScore(['Folk'], genreDim)).toBe(100);
  });

  it('returns none score when no genres match', () => {
    expect(genreScore(['jazz', 'metal'], genreDim)).toBe(0);
  });

  it('returns none score for empty candidate genres', () => {
    expect(genreScore([], genreDim)).toBe(0);
  });

  it('returns exact when at least one genre matches even with non-matching ones', () => {
    expect(genreScore(['jazz', 'folk'], genreDim)).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// geographyScore
// ---------------------------------------------------------------------------

describe('geographyScore', () => {
  it('returns match score when country is in targetRegions', () => {
    expect(geographyScore('US', geoDim)).toBe(100);
    expect(geographyScore('GB', geoDim)).toBe(100);
  });

  it('returns other score when country is not in targetRegions', () => {
    expect(geographyScore('AU', geoDim)).toBe(50);
    expect(geographyScore('DE', geoDim)).toBe(50);
  });

  it('returns other score when country is undefined', () => {
    expect(geographyScore(undefined, geoDim)).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// recencyScore
// ---------------------------------------------------------------------------
// Note: We compute expected values relative to the actual current year at
// test runtime (new Date().getFullYear()) to avoid timezone/fake-timer issues.

describe('recencyScore', () => {
  it('returns missing_baseline when year is undefined', () => {
    expect(recencyScore(undefined, recencyDim)).toBe(50);
  });

  it('returns 0 when release year is beyond the days_window (> 2 years ago)', () => {
    // days_window=730 → maxYears=2; anything older than 2 years → 0
    const currentYear = new Date().getFullYear();
    expect(recencyScore(currentYear - 3, recencyDim)).toBe(0);
  });

  it('returns 100 for current year (0 years ago)', () => {
    // yearsAgo = 0 → score = round(100 * (1 - 0/2)) = 100
    const currentYear = new Date().getFullYear();
    expect(recencyScore(currentYear, recencyDim)).toBe(100);
  });

  it('returns 50 for a release exactly halfway through the window (1 year ago)', () => {
    // yearsAgo = 1; maxYears = 2; score = round(100 * (1 - 1/2)) = 50
    const currentYear = new Date().getFullYear();
    expect(recencyScore(currentYear - 1, recencyDim)).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// computeScore — integration tests
// ---------------------------------------------------------------------------

function makeMinimalCandidate(overrides: Partial<EnrichedCandidate> = {}): EnrichedCandidate {
  return {
    displayName: 'Test Artist',
    musicbrainzId: 'abc123',
    genres: [],
    isLiving: true,
    inferredRole: 'unknown',
    contactReadiness: 'none',
    ...overrides,
  };
}

describe('computeScore — integration', () => {
  it('returns correct shape for minimal (empty) candidate', () => {
    const candidate = makeMinimalCandidate();
    const result = computeScore(candidate, DEFAULT_HUNTER_WEIGHTS);
    expect(typeof result.final).toBe('number');
    expect(result.final).toBeGreaterThanOrEqual(0);
    expect(result.final).toBeLessThanOrEqual(100);
    expect(typeof result.perDimension).toBe('object');
  });

  it('all dimension keys from weights appear in perDimension', () => {
    const candidate = makeMinimalCandidate();
    const result = computeScore(candidate, DEFAULT_HUNTER_WEIGHTS);
    const weightKeys = Object.keys(DEFAULT_HUNTER_WEIGHTS.weights);
    for (const key of weightKeys) {
      expect(result.perDimension).toHaveProperty(key);
      expect(result.perDimension[key]).toBeGreaterThanOrEqual(0);
      expect(result.perDimension[key]).toBeLessThanOrEqual(100);
    }
    expect(Object.keys(result.perDimension).length).toBe(weightKeys.length);
  });

  it('strong candidate scores >= 70 with expected per-dimension values', () => {
    const currentYear = new Date().getFullYear();
    const candidate = makeMinimalCandidate({
      spotifyFollowers: 200000,      // above max 100000 → 100
      genres: ['indie pop'],         // exact match → 100
      country: 'US',                 // in targetRegions → 100
      contactReadiness: 'direct',    // 100
      inferredRole: 'performer',     // 100
      recentReleaseYear: currentYear, // current year → 100
      spotifyPopularity: 100,
    });

    const result = computeScore(candidate, DEFAULT_HUNTER_WEIGHTS);
    expect(result.final).toBeGreaterThanOrEqual(70);
    expect(result.perDimension.spotify_followers).toBe(100);
    expect(result.perDimension.geography).toBe(100);
    expect(result.perDimension.contact_readiness).toBe(100);
  });

  it('weak candidate scores <= 45 with expected per-dimension values', () => {
    // missing_baseline=50 for all undefined social fields pulls score up to ~38
    // genre mismatch and no contact are 0, but missing data baselines keep final moderate-low
    const candidate = makeMinimalCandidate({
      genres: ['jazz'],              // no genre match in DEFAULT_HUNTER_WEIGHTS → 0
      country: undefined,            // geography → other = 50
      contactReadiness: 'none',      // 0
      inferredRole: 'unknown',       // 60 (per default weights)
      spotifyFollowers: undefined,   // missing_baseline = 50
      spotifyPopularity: undefined,  // missing_baseline = 50
    });

    const result = computeScore(candidate, DEFAULT_HUNTER_WEIGHTS);
    expect(result.final).toBeLessThanOrEqual(45);
    expect(result.perDimension.genre_fit).toBe(0);
    expect(result.perDimension.contact_readiness).toBe(0);
    // spotifyFollowers undefined → missing_baseline = 50
    expect(result.perDimension.spotify_followers).toBe(50);
  });

  it('returns final=0 when all weights are 0 (no div-by-zero NaN)', () => {
    const zeroWeights: HunterWeights = {
      ...DEFAULT_HUNTER_WEIGHTS,
      weights: Object.fromEntries(
        Object.entries(DEFAULT_HUNTER_WEIGHTS.weights).map(([k, v]) => [k, { ...v, weight: 0 }])
      ) as HunterWeights['weights'],
    };
    const candidate = makeMinimalCandidate();
    const result = computeScore(candidate, zeroWeights);
    expect(result.final).toBe(0);
    expect(Number.isNaN(result.final)).toBe(false);
  });

  it('weighted average correctness with 2-dim custom weights', () => {
    // spotify_followers weight=10 → candidate has 200000 (above max 100000) → rawScore=100
    // genre_fit weight=20 → genres=['jazz'] → no match → rawScore=0
    // all others weight=0 so they don't contribute
    const customWeights: HunterWeights = {
      ...DEFAULT_HUNTER_WEIGHTS,
      weights: {
        ...Object.fromEntries(
          Object.entries(DEFAULT_HUNTER_WEIGHTS.weights).map(([k, v]) => [k, { ...v, weight: 0 }])
        ),
        spotify_followers: { ...DEFAULT_HUNTER_WEIGHTS.weights.spotify_followers, weight: 10 },
        genre_fit: { ...DEFAULT_HUNTER_WEIGHTS.weights.genre_fit, weight: 20 },
      } as HunterWeights['weights'],
    };

    const candidate = makeMinimalCandidate({
      spotifyFollowers: 200000,
      genres: ['jazz'],
    });

    const result = computeScore(candidate, customWeights);
    // weightedSum = 100*10 + 0*20 = 1000; totalWeight = 10+20 = 30; final = round(1000/30) = 33
    expect(result.final).toBe(33);
    expect(result.perDimension.spotify_followers).toBe(100);
    expect(result.perDimension.genre_fit).toBe(0);
  });

  it('throws on unknown dim key — fail loud on schema drift', () => {
    // Simulate someone adding a new dim to HunterWeights.weights without wiring the dispatcher.
    // The throw prevents silent-0 scoring from polluting weighted averages.
    const driftedWeights = {
      ...DEFAULT_HUNTER_WEIGHTS,
      weights: {
        ...DEFAULT_HUNTER_WEIGHTS.weights,
        // Intentionally injecting an unrecognized key — the outer `as HunterWeights`
        // cast keeps tsc happy; the runtime throw is what we're verifying.
        new_unwired_dim: { weight: 5, curve: 'log', min: 1, max: 100, missing_baseline: 50 },
      },
    } as HunterWeights;

    const candidate = makeMinimalCandidate();
    expect(() => computeScore(candidate, driftedWeights)).toThrow(/unknown HunterWeights dim key: new_unwired_dim/);
  });
});
