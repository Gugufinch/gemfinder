// app/api/ar/scout/hunter/run/[id]/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Module mocks ─────────────────────────────────────────────────────────────
vi.mock('@/lib/gemfinder/auth-store', () => ({ getAuthUserById: vi.fn() }));
vi.mock('@/lib/gemfinder/project-store', () => ({ listWorkspaceProjects: vi.fn() }));
vi.mock('@/lib/gemfinder/hunter-runs-store', () => ({
  getRun: vi.fn(),
  sweepStaleRuns: vi.fn(),
}));

import { GET } from './route';
import * as authStore from '@/lib/gemfinder/auth-store';
import * as projectStore from '@/lib/gemfinder/project-store';
import * as runsStore from '@/lib/gemfinder/hunter-runs-store';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeReq(
  {
    runId = 'run-1',
    workspaceId = 'ws-1',
    userId = 'user-123',
  }: { runId?: string; workspaceId?: string | null; userId?: string | null } = {}
): [NextRequest, { params: Promise<{ id: string }> }] {
  const url = new URL(`http://localhost/api/ar/scout/hunter/run/${runId}`);
  if (workspaceId) url.searchParams.set('workspaceId', workspaceId);

  const req = new NextRequest(url, { method: 'GET' });
  if (userId) {
    req.cookies.set('ar_user', userId);
  }

  const ctx = { params: Promise.resolve({ id: runId }) };
  return [req, ctx];
}

const FAKE_RUN = {
  id: 'run-1',
  workspaceId: 'ws-1',
  status: 'done',
  createdAt: '2026-01-01T00:00:00.000Z',
  results: [],
};

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
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

  vi.mocked(runsStore.getRun).mockResolvedValue(FAKE_RUN as never);
  vi.mocked(runsStore.sweepStaleRuns).mockResolvedValue(0 as never);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/ar/scout/hunter/run/[id]', () => {
  it('returns 401 when no ar_user cookie', async () => {
    const [req, ctx] = makeReq({ userId: null });
    const res = await GET(req, ctx);
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
    const [req, ctx] = makeReq();
    const res = await GET(req, ctx);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Editor or admin role required');
  });

  it('returns 400 when workspaceId is missing', async () => {
    const [req, ctx] = makeReq({ workspaceId: null });
    const res = await GET(req, ctx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('workspaceId query param is required');
  });

  it('returns 404 when scoutV3 feature flag is disabled', async () => {
    vi.mocked(projectStore.listWorkspaceProjects).mockResolvedValue([
      { id: 'ws-1', settings: { featureFlags: { scoutV3: false } } },
    ] as never);
    const [req, ctx] = makeReq();
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Not found');
  });

  it('returns 400 when run id is empty string', async () => {
    const url = new URL('http://localhost/api/ar/scout/hunter/run/?workspaceId=ws-1');
    const req = new NextRequest(url, { method: 'GET' });
    req.cookies.set('ar_user', 'user-123');
    const ctx = { params: Promise.resolve({ id: '' }) };
    const res = await GET(req, ctx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Run id is required');
  });

  it('returns 404 when getRun returns null', async () => {
    vi.mocked(runsStore.getRun).mockResolvedValue(null as never);
    const [req, ctx] = makeReq();
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Run not found');
  });

  it('returns 404 when run belongs to a different workspace', async () => {
    vi.mocked(runsStore.getRun).mockResolvedValue({
      ...FAKE_RUN,
      workspaceId: 'ws-other',
    } as never);
    const [req, ctx] = makeReq({ workspaceId: 'ws-1' });
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Run not found');
  });

  it('happy path: returns {ok: true, run} with status 200 and calls sweepStaleRuns', async () => {
    const [req, ctx] = makeReq();
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.run).toEqual(FAKE_RUN);
    expect(runsStore.sweepStaleRuns).toHaveBeenCalled();
  });

  it('still succeeds when sweepStaleRuns throws, and fires console.warn', async () => {
    const sweepError = new Error('sweep exploded');
    vi.mocked(runsStore.sweepStaleRuns).mockRejectedValue(sweepError);

    const [req, ctx] = makeReq();
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.run).toEqual(FAKE_RUN);
    expect(console.warn).toHaveBeenCalledWith(
      '[HUNTER_RUN_DETAIL] sweepStaleRuns failed:',
      sweepError
    );
  });
});
