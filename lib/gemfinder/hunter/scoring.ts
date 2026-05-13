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
  if (value <= dim.min) return 0;
  if (value >= dim.max) return 100;
  const logMin = Math.log10(dim.min);
  const logMax = Math.log10(dim.max);
  const logVal = Math.log10(value);
  return Math.round(((logVal - logMin) / (logMax - logMin)) * 100);
}

export function linearScore(value: number | undefined, dim: HunterWeightLog): number {
  if (value === undefined || value === null) return dim.missing_baseline;
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

export function recencyScore(year: number | undefined, dim: HunterWeightLog): number {
  if (!year) return dim.missing_baseline;
  const yearsAgo = new Date().getFullYear() - year;
  const maxYears = (dim.days_window ?? 730) / 365;
  if (yearsAgo > maxYears) return 0;
  return Math.round(100 * (1 - yearsAgo / maxYears));
}

// ---------------------------------------------------------------------------
// Dispatcher — routes each dimension key to the right scorer
// ---------------------------------------------------------------------------

type DimConfig =
  | HunterWeightLog
  | HunterWeightValueMap
  | HunterWeightGenre
  | HunterWeightGeography;

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
      return recencyScore(candidate.recentReleaseYear, dimConfig as HunterWeightLog);
    default:
      return 0;
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
