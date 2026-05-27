// lib/gemfinder/hunter/scoring.ts
import type {
  EnrichedCandidate,
  HunterWeights,
  HunterWeightLog,
  HunterWeightValueMap,
  HunterWeightGenre,
  HunterWeightGeography,
} from '@/lib/gemfinder/types';

// ---------------------------------------------------------------------------
// Per-dimension scorer helpers (exported for direct unit testing)
// ---------------------------------------------------------------------------

export function logScore(value: number | undefined, dim: HunterWeightLog): number {
  if (value === undefined || value === null) return dim.missing_baseline;
  // Degenerate-config guards FIRST — a config we can't math against (min === max,
  // or non-positive bounds that break Math.log10) should always return
  // missing_baseline, regardless of where `value` falls. Otherwise the
  // `value <= min` check would fire and return 0, masking the real problem.
  if (dim.min <= 0 || dim.max <= 0) return dim.missing_baseline;
  if (dim.min === dim.max) return dim.missing_baseline;
  if (value <= dim.min) return 0;
  if (value >= dim.max) return 100;
  const logMin = Math.log10(dim.min);
  const logMax = Math.log10(dim.max);
  const logVal = Math.log10(value);
  return Math.round(((logVal - logMin) / (logMax - logMin)) * 100);
}

export function linearScore(value: number | undefined, dim: HunterWeightLog): number {
  if (value === undefined || value === null) return dim.missing_baseline;
  // Degenerate config — see logScore for reasoning. Guard before the boundary checks.
  if (dim.min === dim.max) return dim.missing_baseline;
  if (value <= dim.min) return 0;
  if (value >= dim.max) return 100;
  return Math.round(((value - dim.min) / (dim.max - dim.min)) * 100);
}

export function valueMapScore(key: string | undefined, dim: HunterWeightValueMap): number {
  if (!key) return dim.missing_baseline ?? 50;
  return dim.values[key] ?? dim.missing_baseline ?? 50;
}

export function genreScore(candidateGenres: string[], dim: HunterWeightGenre): number {
  const targets = dim.targetGenres.map((g) => g.toLowerCase());
  const matches = candidateGenres.filter((g) => targets.includes(g.toLowerCase()));
  if (matches.length > 0) return dim.exact;
  return dim.none; // v1: no related-genre detection
}

export function geographyScore(country: string | undefined, dim: HunterWeightGeography): number {
  if (!country) return dim.other;
  return dim.targetRegions.includes(country) ? dim.match : dim.other;
}

export function recencyScore(
  year: number | undefined,
  dim: HunterWeightLog,
  // Optional: count of releases within the activity window. When > 1, applies
  // a multiplier (5% per additional release, capped at +20%) to reward
  // actively-releasing artists vs. one-and-done releases. Cap protects
  // against catalog spammers (singles-per-week artists) skewing the score.
  recentReleaseCount?: number,
): number {
  if (!year) return dim.missing_baseline;
  const yearsAgo = new Date().getFullYear() - year;
  const maxYears = (dim.days_window ?? 730) / 365;
  if (yearsAgo > maxYears) return 0;
  const baseScore = 100 * (1 - yearsAgo / maxYears);
  // Multiplier: 1.00 baseline, +0.05 per release beyond the first, max +0.20.
  // count=1 → 1.00, count=2 → 1.05, count=3 → 1.10, count=4 → 1.15, count≥5 → 1.20.
  const extraReleases = Math.max(0, (recentReleaseCount ?? 1) - 1);
  const multiplier = 1 + Math.min(0.20, extraReleases * 0.05);
  // Cap at 100 — multiplier can't push past the dimension ceiling. A single
  // current-year release scores 100; multiple current-year releases still
  // score 100 (no super-scoring), but a 1-year-stale + multiple-releases
  // shape can now reach where a 1-year-stale + single-release plateaus.
  return Math.round(Math.min(100, baseScore * multiplier));
}

// ---------------------------------------------------------------------------
// Dispatcher — routes each dimension key to the right scorer
// ---------------------------------------------------------------------------

type DimConfig =
  | HunterWeightLog
  | HunterWeightValueMap
  | HunterWeightGenre
  | HunterWeightGeography;

// Each `dimConfig as <T>` cast below is structurally safe: the dimKey ↔ config
// shape pairing is co-defined in HunterWeights (see types.ts), so an
// `instagram_followers` key is always paired with a HunterWeightLog config.
// If HunterWeights ever becomes polymorphic in shape, these casts need to
// move to runtime tagged-union checks.
function perDimensionScore(
  dimKey: string,
  candidate: EnrichedCandidate,
  dimConfig: DimConfig
): number {
  switch (dimKey) {
    case 'instagram_followers': {
      const d = dimConfig as HunterWeightLog;
      return d.curve === 'linear'
        ? linearScore(candidate.instagramFollowers, d)
        : logScore(candidate.instagramFollowers, d);
    }
    case 'tiktok_followers': {
      const d = dimConfig as HunterWeightLog;
      return d.curve === 'linear'
        ? linearScore(candidate.tiktokFollowers, d)
        : logScore(candidate.tiktokFollowers, d);
    }
    case 'youtube_subscribers': {
      const d = dimConfig as HunterWeightLog;
      return d.curve === 'linear'
        ? linearScore(candidate.youtubeSubscribers, d)
        : logScore(candidate.youtubeSubscribers, d);
    }
    case 'soundcloud_followers': {
      const d = dimConfig as HunterWeightLog;
      return d.curve === 'linear'
        ? linearScore(candidate.soundcloudFollowers, d)
        : logScore(candidate.soundcloudFollowers, d);
    }
    case 'spotify_followers': {
      const d = dimConfig as HunterWeightLog;
      return d.curve === 'linear'
        ? linearScore(candidate.spotifyFollowers, d)
        : logScore(candidate.spotifyFollowers, d);
    }
    case 'spotify_popularity': {
      const d = dimConfig as HunterWeightLog;
      return d.curve === 'linear'
        ? linearScore(candidate.spotifyPopularity, d)
        : logScore(candidate.spotifyPopularity, d);
    }
    case 'contact_readiness':
      return valueMapScore(candidate.contactReadiness, dimConfig as HunterWeightValueMap);
    case 'genre_fit':
      return genreScore(candidate.genres, dimConfig as HunterWeightGenre);
    case 'geography':
      return geographyScore(candidate.country, dimConfig as HunterWeightGeography);
    case 'role_match':
      return valueMapScore(candidate.inferredRole, dimConfig as HunterWeightValueMap);
    case 'recency':
      return recencyScore(
        candidate.recentReleaseYear,
        dimConfig as HunterWeightLog,
        candidate.recentReleaseCount,
      );
    default:
      // Fail loud on schema drift — a silent 0 would pull final scores down
      // without any signal that a new HunterWeights dim was added but not wired.
      throw new Error(`[SCORING] unknown HunterWeights dim key: ${dimKey}`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function computeScore(
  candidate: EnrichedCandidate,
  weights: HunterWeights
): { final: number; perDimension: Record<string, number> } {
  let totalWeight = 0;
  let weightedSum = 0;
  const perDimension: Record<string, number> = {};

  for (const [dimKey, dimConfig] of Object.entries(weights.weights)) {
    const rawScore = perDimensionScore(dimKey, candidate, dimConfig);
    weightedSum += rawScore * dimConfig.weight;
    totalWeight += dimConfig.weight;
    perDimension[dimKey] = rawScore;
  }

  const final = totalWeight === 0 ? 0 : Math.round(weightedSum / totalWeight);
  return { final, perDimension };
}
