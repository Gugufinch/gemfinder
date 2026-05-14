import type { HunterWeights } from '@/lib/gemfinder/types';
import { listWorkspaceProjects, saveWorkspaceProjects } from '@/lib/gemfinder/project-store';

export const DEFAULT_HUNTER_WEIGHTS: HunterWeights = {
  version: 1,
  updatedAt: new Date().toISOString(),
  updatedBy: 'system:default',
  weights: {
    instagram_followers:    { weight: 12, curve: 'log', min: 1000, max: 500000, missing_baseline: 50 },
    tiktok_followers:       { weight: 12, curve: 'log', min: 1000, max: 1000000, missing_baseline: 50 },
    youtube_subscribers:    { weight: 8,  curve: 'log', min: 1000, max: 1000000, missing_baseline: 50 },
    soundcloud_followers:   { weight: 5,  curve: 'log', min: 500,  max: 100000, missing_baseline: 50 },
    spotify_followers:      { weight: 18, curve: 'log', min: 1000, max: 100000, missing_baseline: 50 },
    spotify_popularity:     { weight: 8,  curve: 'linear', min: 0, max: 100, missing_baseline: 50 },
    contact_readiness:      { weight: 12, values: { direct: 100, manager: 80, agency: 70, booking: 60, social_only: 40, none: 0 }, missing_baseline: 30 },
    genre_fit:              { weight: 15, targetGenres: ['indie pop', 'folk', 'singer-songwriter'], exact: 100, related: 60, none: 0 },
    geography:              { weight: 5,  targetRegions: ['US', 'CA', 'GB'], match: 100, other: 50 },
    role_match:             { weight: 8,  values: { performer: 100, curator: 100, both: 100, unknown: 60 } },
    recency:                { weight: 6,  curve: 'linear', min: 0, max: 100, missing_baseline: 50, days_window: 730 },
  },
  gates: {
    // Default gates are intentionally MINIMAL — soft preferences (genre fit,
    // contact readiness) are handled by SCORING (which uses workspace target
    // genres + contact_readiness weights to rank candidates), not by hard
    // filtering. The hard filters here only reject candidates we definitively
    // can't use: blocked, deceased.
    //
    // Operators can re-enable require_genre_match / require_reachable per
    // workspace via the ⚙ Edit weights modal if their use case warrants it.
    require_genre_match: false,
    require_living: true,
    require_reachable: false,
    require_not_blocked: true,
  },
  target_count_default: 25,
};

export async function getWeights(workspaceId: string): Promise<HunterWeights> {
  const projects = (await listWorkspaceProjects()) as Array<Record<string, unknown>>;
  const proj = projects.find((p) => p.id === workspaceId);
  if (!proj) return DEFAULT_HUNTER_WEIGHTS;
  const settings = (proj.settings as Record<string, unknown>) || {};
  const w = settings.hunterWeights as HunterWeights | undefined;
  return w || DEFAULT_HUNTER_WEIGHTS;
}

export async function setWeights(workspaceId: string, weights: HunterWeights, actorEmail: string): Promise<void> {
  const projects = (await listWorkspaceProjects()) as Array<Record<string, unknown>>;
  const proj = projects.find((p) => p.id === workspaceId);
  if (!proj) throw new Error(`[HUNTER_WEIGHTS] workspace ${workspaceId} not found`);
  const settings = (proj.settings as Record<string, unknown>) || {};
  settings.hunterWeights = {
    ...weights,
    updatedAt: new Date().toISOString(),
    updatedBy: actorEmail,
  };
  proj.settings = settings;
  await saveWorkspaceProjects(projects);
}
