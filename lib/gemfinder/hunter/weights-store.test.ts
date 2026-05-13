import { describe, it, expect, vi } from 'vitest';
import { getWeights, setWeights, DEFAULT_HUNTER_WEIGHTS } from './weights-store';

vi.mock('@/lib/gemfinder/project-store', () => ({
  listWorkspaceProjects: vi.fn(),
  saveWorkspaceProjects: vi.fn(),
}));

describe('DEFAULT_HUNTER_WEIGHTS', () => {
  it('has all required weight dimensions', () => {
    const w = DEFAULT_HUNTER_WEIGHTS.weights;
    expect(w.instagram_followers).toBeDefined();
    expect(w.tiktok_followers).toBeDefined();
    expect(w.youtube_subscribers).toBeDefined();
    expect(w.soundcloud_followers).toBeDefined();
    expect(w.spotify_followers).toBeDefined();
    expect(w.spotify_popularity).toBeDefined();
    expect(w.contact_readiness).toBeDefined();
    expect(w.genre_fit).toBeDefined();
    expect(w.geography).toBeDefined();
    expect(w.role_match).toBeDefined();
    expect(w.recency).toBeDefined();
  });

  it('has all 4 gates defined', () => {
    expect(DEFAULT_HUNTER_WEIGHTS.gates.require_genre_match).toBeDefined();
    expect(DEFAULT_HUNTER_WEIGHTS.gates.require_living).toBeDefined();
    expect(DEFAULT_HUNTER_WEIGHTS.gates.require_reachable).toBeDefined();
    expect(DEFAULT_HUNTER_WEIGHTS.gates.require_not_blocked).toBeDefined();
  });
});

describe('getWeights', () => {
  it('returns defaults when workspace has no hunterWeights', async () => {
    const { listWorkspaceProjects } = await import('@/lib/gemfinder/project-store');
    (listWorkspaceProjects as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: 'ws-1', settings: {} },
    ]);
    const w = await getWeights('ws-1');
    expect(w).toEqual(DEFAULT_HUNTER_WEIGHTS);
  });

  it('returns workspace weights when present', async () => {
    const custom = { ...DEFAULT_HUNTER_WEIGHTS, version: 2 };
    const { listWorkspaceProjects } = await import('@/lib/gemfinder/project-store');
    (listWorkspaceProjects as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: 'ws-1', settings: { hunterWeights: custom } },
    ]);
    const w = await getWeights('ws-1');
    expect(w.version).toBe(2);
  });
});
