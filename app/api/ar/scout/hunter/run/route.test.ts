// app/api/ar/scout/hunter/run/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { signSession } from '@/lib/gemfinder/session';

// ─── Module mocks ─────────────────────────────────────────────────────────────
vi.mock('@/lib/gemfinder/auth-store', () => ({ getAuthUserById: vi.fn() }));
vi.mock('@/lib/gemfinder/project-store', () => ({ listWorkspaceProjects: vi.fn() }));
vi.mock('@/lib/gemfinder/hunter-runs-store', () => ({
  createRun: vi.fn(),
  listRunsByWorkspace: vi.fn(),
  sweepStaleRuns: vi.fn(),
}));
vi.mock('@/lib/gemfinder/hunter/weights-store', () => ({ getWeights: vi.fn() }));
vi.mock('@/lib/gemfinder/hunter/orchestrator', () => ({ runPipeline: vi.fn(() => Promise.resolve({})) }));

import { POST, GET } from './route';
import * as authStore from '@/lib/gemfinder/auth-store';
import * as projectStore from '@/lib/gemfinder/project-store';
import * as runsStore from '@/lib/gemfinder/hunter-runs-store';
import * as weightsStore from '@/lib/gemfinder/hunter/weights-store';
import * as orchestrator from '@/lib/gemfinder/hunter/orchestrator';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeReq(
  method: 'POST' | 'GET',
  {
    workspaceId = 'ws-1',
    body,
    userId = 'user-123',
  }: { workspaceId?: string | null; body?: unknown; userId?: string | null } = {}
): NextRequest {
  const url = new URL('http://localhost/api/ar/scout/hunter/run');
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

const FAKE_WEIGHTS = {
  version: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
  updatedBy: 'system:default',
  weights: {},
  gates: {},
  target_count_default: 25,
};

const VALID_BODY = { genres: ['indie pop'], targetCount: 10 };

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
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

  vi.mocked(runsStore.createRun).mockResolvedValue({ id: 'run-1' } as never);
  vi.mocked(runsStore.listRunsByWorkspace).mockResolvedValue([] as never);
  vi.mocked(runsStore.sweepStaleRuns).mockResolvedValue(0 as never);
  vi.mocked(weightsStore.getWeights).mockResolvedValue(FAKE_WEIGHTS as never);
  vi.mocked(orchestrator.runPipeline).mockResolvedValue({} as never);
});

// ─── POST tests ───────────────────────────────────────────────────────────────

describe('POST /api/ar/scout/hunter/run', () => {
  it('returns 401 when no ar_user cookie', async () => {
    const req = makeReq('POST', { userId: null, body: VALID_BODY });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Not authenticated');
  });

  it('returns 401 when getAuthUserById returns null', async () => {
    vi.mocked(authStore.getAuthUserById).mockResolvedValue(null as never);
    const req = makeReq('POST', { body: VALID_BODY });
    const res = await POST(req);
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
    const req = makeReq('POST', { body: VALID_BODY });
    const res = await POST(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Editor or admin role required');
  });

  it('returns 400 when workspaceId is missing', async () => {
    const req = makeReq('POST', { workspaceId: null, body: VALID_BODY });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('workspaceId query param is required');
  });

  it('returns 404 when scoutV3 feature flag is disabled', async () => {
    vi.mocked(projectStore.listWorkspaceProjects).mockResolvedValue([
      { id: 'ws-1', settings: { featureFlags: { scoutV3: false } } },
    ] as never);
    const req = makeReq('POST', { body: VALID_BODY });
    const res = await POST(req);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Not found');
  });

  it('returns 400 when body is invalid JSON', async () => {
    const url = new URL('http://localhost/api/ar/scout/hunter/run?workspaceId=ws-1');
    const req = new NextRequest(url, {
      method: 'POST',
      body: 'not-json{{{',
      headers: { 'Content-Type': 'application/json' },
    });
    req.cookies.set('ar_user', signSession('user-123'));
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid criteria');
  });

  it('accepts a hunt with NO genres/regions/locations (weight-only hunt)', async () => {
    // Previously required at least one of (genres, regions). Now valid — the
    // LLM agent uses workspace weights to discover candidates without explicit filters.
    const req = makeReq('POST', { body: { genres: [], regions: [], targetCount: 10 } });
    const res = await POST(req);
    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it('returns 400 when targetCount exceeds max of 100', async () => {
    const req = makeReq('POST', { body: { genres: ['folk'], targetCount: 200 } });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid criteria');
    expect(json.details).toBeDefined();
  });

  it('happy path: returns 202 with runId and calls createRun + runPipeline', async () => {
    const req = makeReq('POST', { body: VALID_BODY });
    const res = await POST(req);
    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.runId).toBe('run-1');

    expect(runsStore.createRun).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      criteria: expect.objectContaining({ genres: ['indie pop'], source: 'llm' }),
      weightsSnapshot: FAKE_WEIGHTS,
      startedBy: 'editor@example.com',
    });

    // Let setImmediate fire
    await new Promise((r) => setImmediate(r));

    expect(orchestrator.runPipeline).toHaveBeenCalledWith({
      runId: 'run-1',
      workspaceId: 'ws-1',
      criteria: expect.objectContaining({ genres: ['indie pop'], source: 'llm' }),
      weights: FAKE_WEIGHTS,
      actorEmail: 'editor@example.com',
    });
  });

  it('returns 202 even when runPipeline rejects, and logs error', async () => {
    const pipelineError = new Error('pipeline exploded');
    vi.mocked(orchestrator.runPipeline).mockRejectedValue(pipelineError);

    const req = makeReq('POST', { body: VALID_BODY });
    const res = await POST(req);

    // Route returns 202 before pipeline starts
    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.ok).toBe(true);

    // Wait for setImmediate + rejection
    await new Promise((r) => setImmediate(r));
    // Additional tick for the rejection handler
    await new Promise((r) => setImmediate(r));

    expect(console.error).toHaveBeenCalledWith(
      '[HUNTER_RUN] pipeline rejected',
      expect.objectContaining({ runId: 'run-1', error: pipelineError })
    );
  });

  it('targetCount defaults to 25 when not provided', async () => {
    const req = makeReq('POST', { body: { genres: ['folk'] } });
    const res = await POST(req);
    expect(res.status).toBe(202);
    expect(runsStore.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        criteria: expect.objectContaining({ targetCount: 25 }),
      })
    );
  });
});

// ─── GET tests ────────────────────────────────────────────────────────────────

describe('GET /api/ar/scout/hunter/run', () => {
  it('returns 401 when not authenticated', async () => {
    const req = makeReq('GET', { userId: null });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 when workspaceId is missing', async () => {
    const req = makeReq('GET', { workspaceId: null });
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('workspaceId query param is required');
  });

  it('returns 404 when feature flag is disabled', async () => {
    vi.mocked(projectStore.listWorkspaceProjects).mockResolvedValue([
      { id: 'ws-1', settings: { featureFlags: { scoutV3: false } } },
    ] as never);
    const req = makeReq('GET');
    const res = await GET(req);
    expect(res.status).toBe(404);
  });

  it('happy path: returns runs and calls sweepStaleRuns', async () => {
    const fakeRuns = [{ id: 'run-1', workspaceId: 'ws-1', status: 'done' }];
    vi.mocked(runsStore.listRunsByWorkspace).mockResolvedValue(fakeRuns as never);

    const req = makeReq('GET');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.runs).toEqual(fakeRuns);
    expect(runsStore.sweepStaleRuns).toHaveBeenCalled();
  });

  it('still returns runs when sweepStaleRuns throws, and logs a warning', async () => {
    vi.mocked(runsStore.sweepStaleRuns).mockRejectedValue(new Error('sweep failed'));

    const req = makeReq('GET');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(console.warn).toHaveBeenCalledWith(
      '[HUNTER_RUN] sweepStaleRuns failed:',
      expect.any(Error)
    );
  });
});
