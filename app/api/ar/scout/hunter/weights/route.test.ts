// app/api/ar/scout/hunter/weights/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { signSession } from '@/lib/gemfinder/session';
import { __resetFeatureFlagCache } from '@/lib/gemfinder/feature-flags';

// ─── Module mocks ─────────────────────────────────────────────────────────────
vi.mock('@/lib/gemfinder/auth-store', () => ({ getAuthUserById: vi.fn() }));
vi.mock('@/lib/gemfinder/project-store', () => ({ listWorkspaceProjects: vi.fn() }));
vi.mock('@/lib/gemfinder/hunter/weights-store', () => ({
  getWeights: vi.fn(),
  setWeights: vi.fn(),
  DEFAULT_HUNTER_WEIGHTS: {
    version: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'system:default',
    weights: {
      instagram_followers:  { weight: 12, curve: 'log', min: 1000, max: 500000, missing_baseline: 50 },
      tiktok_followers:     { weight: 12, curve: 'log', min: 1000, max: 1000000, missing_baseline: 50 },
      youtube_subscribers:  { weight: 8,  curve: 'log', min: 1000, max: 1000000, missing_baseline: 50 },
      soundcloud_followers: { weight: 5,  curve: 'log', min: 500,  max: 100000, missing_baseline: 50 },
      spotify_followers:    { weight: 18, curve: 'log', min: 1000, max: 100000, missing_baseline: 50 },
      spotify_popularity:   { weight: 8,  curve: 'linear', min: 0, max: 100, missing_baseline: 50 },
      contact_readiness:    { weight: 12, values: { direct: 100, manager: 80, agency: 70, booking: 60, social_only: 40, none: 0 }, missing_baseline: 30 },
      genre_fit:            { weight: 15, targetGenres: ['indie pop', 'folk', 'singer-songwriter'], exact: 100, related: 60, none: 0 },
      geography:            { weight: 5,  targetRegions: ['US', 'CA', 'GB'], match: 100, other: 50 },
      role_match:           { weight: 8,  values: { performer: 100, curator: 100, both: 100, unknown: 60 } },
      recency:              { weight: 6,  curve: 'linear', min: 0, max: 100, missing_baseline: 50, days_window: 730 },
    },
    gates: {
      require_genre_match: true,
      require_living: true,
      require_reachable: true,
      require_not_blocked: true,
    },
    target_count_default: 25,
  },
}));

import { GET, PUT } from './route';
import * as authStore from '@/lib/gemfinder/auth-store';
import * as projectStore from '@/lib/gemfinder/project-store';
import * as weightsStore from '@/lib/gemfinder/hunter/weights-store';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeReq(
  method: 'GET' | 'PUT',
  {
    workspaceId = 'ws-1',
    body,
    userId = 'user-123',
  }: { workspaceId?: string | null; body?: unknown; userId?: string | null } = {}
): NextRequest {
  const url = new URL('http://localhost/api/ar/scout/hunter/weights');
  if (workspaceId) url.searchParams.set('workspaceId', workspaceId);

  const init: Record<string, unknown> = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }

  const req = new NextRequest(url, init);
  if (userId) {
    req.cookies.set('ar_user', signSession(userId));
  }
  return req;
}

// A valid complete HunterWeights body sourced from DEFAULT_HUNTER_WEIGHTS shape
const VALID_WEIGHTS_BODY = {
  version: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
  updatedBy: 'system:default',
  weights: {
    instagram_followers:  { weight: 12, curve: 'log',    min: 1000, max: 500000,  missing_baseline: 50 },
    tiktok_followers:     { weight: 12, curve: 'log',    min: 1000, max: 1000000, missing_baseline: 50 },
    youtube_subscribers:  { weight: 8,  curve: 'log',    min: 1000, max: 1000000, missing_baseline: 50 },
    soundcloud_followers: { weight: 5,  curve: 'log',    min: 500,  max: 100000,  missing_baseline: 50 },
    spotify_followers:    { weight: 18, curve: 'log',    min: 1000, max: 100000,  missing_baseline: 50 },
    spotify_popularity:   { weight: 8,  curve: 'linear', min: 0,    max: 100,     missing_baseline: 50 },
    contact_readiness:    { weight: 12, values: { direct: 100, manager: 80 }, missing_baseline: 30 },
    genre_fit:            { weight: 15, targetGenres: ['indie pop'], exact: 100, related: 60, none: 0 },
    geography:            { weight: 5,  targetRegions: ['US'], match: 100, other: 50 },
    role_match:           { weight: 8,  values: { performer: 100 } },
    recency:              { weight: 6,  curve: 'linear', min: 0, max: 100, missing_baseline: 50, days_window: 730 },
  },
  gates: {
    require_genre_match: true,
    require_living: true,
    require_reachable: true,
    require_not_blocked: true,
  },
  target_count_default: 25,
};

const FAKE_SAVED_WEIGHTS = { ...VALID_WEIGHTS_BODY, updatedAt: '2026-02-01T00:00:00.000Z', updatedBy: 'editor@example.com' };

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Audit #4: cached flag state would leak across tests.
  __resetFeatureFlagCache();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  // Default: active editor
  vi.mocked(authStore.getAuthUserById).mockResolvedValue({
    id: 'user-123',
    email: 'editor@example.com',
    role: 'editor',
    active: true,
  } as never);

  // Default: one workspace with no explicit scoutV3 flag (default-on)
  vi.mocked(projectStore.listWorkspaceProjects).mockResolvedValue([
    { id: 'ws-1', settings: {} },
  ] as never);

  vi.mocked(weightsStore.getWeights).mockResolvedValue(FAKE_SAVED_WEIGHTS as never);
  vi.mocked(weightsStore.setWeights).mockResolvedValue(undefined as never);
});

// ─── GET tests ────────────────────────────────────────────────────────────────

describe('GET /api/ar/scout/hunter/weights', () => {
  it('returns 401 when no ar_user cookie', async () => {
    const req = makeReq('GET', { userId: null });
    const res = await GET(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Not authenticated');
  });

  it('returns 403 when user has viewer role', async () => {
    vi.mocked(authStore.getAuthUserById).mockResolvedValue({
      id: 'user-123',
      email: 'viewer@example.com',
      role: 'viewer',
      active: true,
    } as never);
    const req = makeReq('GET');
    const res = await GET(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Editor or admin role required');
  });

  it('returns 400 when workspaceId is missing', async () => {
    const req = makeReq('GET', { workspaceId: null });
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('workspaceId query param is required');
  });

  it('returns 404 when scoutV3 feature flag is disabled', async () => {
    vi.mocked(projectStore.listWorkspaceProjects).mockResolvedValue([
      { id: 'ws-1', settings: { featureFlags: { scoutV3: false } } },
    ] as never);
    const req = makeReq('GET');
    const res = await GET(req);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Not found');
  });

  it('happy path: returns {ok: true, weights} from getWeights', async () => {
    const req = makeReq('GET');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.weights).toEqual(FAKE_SAVED_WEIGHTS);
    expect(weightsStore.getWeights).toHaveBeenCalledWith('ws-1');
  });
});

// ─── PUT tests ────────────────────────────────────────────────────────────────

describe('PUT /api/ar/scout/hunter/weights', () => {
  it('returns 401 when no ar_user cookie', async () => {
    const req = makeReq('PUT', { userId: null, body: VALID_WEIGHTS_BODY });
    const res = await PUT(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Not authenticated');
  });

  it('returns 403 when user has viewer role', async () => {
    vi.mocked(authStore.getAuthUserById).mockResolvedValue({
      id: 'user-123',
      email: 'viewer@example.com',
      role: 'viewer',
      active: true,
    } as never);
    const req = makeReq('PUT', { body: VALID_WEIGHTS_BODY });
    const res = await PUT(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Editor or admin role required');
  });

  it('returns 400 when workspaceId is missing', async () => {
    const req = makeReq('PUT', { workspaceId: null, body: VALID_WEIGHTS_BODY });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('workspaceId query param is required');
  });

  it('returns 404 when scoutV3 feature flag is disabled', async () => {
    vi.mocked(projectStore.listWorkspaceProjects).mockResolvedValue([
      { id: 'ws-1', settings: { featureFlags: { scoutV3: false } } },
    ] as never);
    const req = makeReq('PUT', { body: VALID_WEIGHTS_BODY });
    const res = await PUT(req);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Not found');
  });

  it('returns 400 when body is invalid JSON', async () => {
    const url = new URL('http://localhost/api/ar/scout/hunter/weights?workspaceId=ws-1');
    const req = new NextRequest(url, {
      method: 'PUT',
      body: 'not-json{{{',
      headers: { 'Content-Type': 'application/json' },
    });
    req.cookies.set('ar_user', signSession('user-123'));
    const res = await PUT(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid weights');
  });

  it('returns 400 when a required dimension is missing (zod fail)', async () => {
    const badBody = { ...VALID_WEIGHTS_BODY, weights: { ...VALID_WEIGHTS_BODY.weights } };
    // Remove a required dimension
    const { instagram_followers: _removed, ...weightsWithout } = badBody.weights;
    badBody.weights = weightsWithout as typeof badBody.weights;

    const req = makeReq('PUT', { body: badBody });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid weights');
    expect(json.details).toBeDefined();
    expect(Array.isArray(json.details)).toBe(true);
  });

  it('returns 400 when target_count_default is less than 1 (zod fail)', async () => {
    const badBody = { ...VALID_WEIGHTS_BODY, target_count_default: 0 };
    const req = makeReq('PUT', { body: badBody });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid weights');
    expect(json.details).toBeDefined();
  });

  it('returns 400 when curve value is invalid (zod fail)', async () => {
    const badBody = {
      ...VALID_WEIGHTS_BODY,
      weights: {
        ...VALID_WEIGHTS_BODY.weights,
        instagram_followers: { ...VALID_WEIGHTS_BODY.weights.instagram_followers, curve: 'exponential' },
      },
    };
    const req = makeReq('PUT', { body: badBody });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid weights');
    expect(json.details).toBeDefined();
  });

  it('happy path: calls setWeights with parsed body + actor.email, returns updated weights', async () => {
    const req = makeReq('PUT', { body: VALID_WEIGHTS_BODY });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.weights).toEqual(FAKE_SAVED_WEIGHTS);

    expect(weightsStore.setWeights).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({ version: 1, target_count_default: 25 }),
      'editor@example.com'
    );
    // getWeights should be called after setWeights to return updated state
    expect(weightsStore.getWeights).toHaveBeenCalledWith('ws-1');
  });
});
