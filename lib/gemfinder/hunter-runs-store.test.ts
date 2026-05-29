// lib/gemfinder/hunter-runs-store.test.ts
//
// Integration-style tests with pg mocked — all CRUD paths are exercised
// without requiring a live Postgres instance. Mirrors the truncate-beforeEach
// pattern from scout-candidate-store.test.ts; the mock takes the place of
// the real pool so schema / row state is reset per test.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- pg mock -----------------------------------------------------------
// Pool must be a real constructor (regular function, not arrow) because
// scout-candidate-store calls `new Pool(...)`.

const mockQuery = vi.fn();

vi.mock('pg', () => {
  function MockPool() {
    return { query: mockQuery };
  }
  return {
    Pool: MockPool,
    // pg-init imports `types` for setTypeParser side-effects. Tests don't
    // care about parser output — just need the API to exist as a no-op so
    // the import doesn't crash.
    types: {
      setTypeParser: vi.fn(),
      getTypeParser: vi.fn(() => (v: unknown) => v),
    },
  };
});

// ---- store imports (after mock is in place) ----------------------------
import {
  createRun,
  getRun,
  listRunsByWorkspace,
  updateRunSummary,
  setRunStatus,
  sweepStaleRuns,
} from './hunter-runs-store';

import type { HunterRun, HunterCriteria, HunterWeights, HunterRunSummary } from '@/lib/gemfinder/types';

// ---- fixtures ----------------------------------------------------------

const WORKSPACE = 'ws-test-001';
const STARTED_BY = 'user@test.com';

function buildCriteria(overrides?: Partial<HunterCriteria>): HunterCriteria {
  return {
    genres: ['indie pop'],
    regions: ['US'],
    roleTarget: 'performer',
    targetCount: 25,
    ...overrides,
  };
}

function buildWeights(): HunterWeights {
  return {
    version: 1,
    updatedAt: '2026-05-13T00:00:00Z',
    updatedBy: 'system',
    weights: {
      instagram_followers:  { weight: 0.2, curve: 'log', min: 0, max: 100, missing_baseline: 0 },
      tiktok_followers:     { weight: 0.1, curve: 'log', min: 0, max: 100, missing_baseline: 0 },
      youtube_subscribers:  { weight: 0.1, curve: 'log', min: 0, max: 100, missing_baseline: 0 },
      soundcloud_followers: { weight: 0.05, curve: 'log', min: 0, max: 100, missing_baseline: 0 },
      spotify_followers:    { weight: 0.15, curve: 'log', min: 0, max: 100, missing_baseline: 0 },
      spotify_popularity:   { weight: 0.1, curve: 'linear', min: 0, max: 100, missing_baseline: 0 },
      contact_readiness:    { weight: 0.1, values: { direct: 1, indirect: 0.5, none: 0 } },
      genre_fit:            { weight: 0.1, targetGenres: ['indie pop'], exact: 1, related: 0.5, none: 0 },
      geography:            { weight: 0.05, targetRegions: ['US'], match: 1, other: 0.3 },
      role_match:           { weight: 0.05, values: { performer: 1, curator: 0.5, both: 0.8, unknown: 0.2 } },
      recency:              { weight: 0.1, curve: 'linear', min: 0, max: 10, missing_baseline: 0 },
    },
    gates: {
      require_genre_match: true,
      require_living: true,
      require_reachable: false,
      require_not_blocked: true,
    },
    target_count_default: 25,
  };
}

function buildRunRow(overrides?: Partial<Record<string, unknown>>): Record<string, unknown> {
  return {
    id: 'run-uuid-001',
    workspace_id: WORKSPACE,
    criteria: buildCriteria(),
    weights_snapshot: buildWeights(),
    status: 'running',
    started_at: new Date('2026-05-13T00:00:00Z'),
    completed_at: null,
    error_message: null,
    summary: { fetched: 0, skippedBlocked: 0, gatedOut: 0, scored: 0, added: 0, errors: [], gatedReasons: [] },
    started_by: STARTED_BY,
    ...overrides,
  };
}

// ---- setup -------------------------------------------------------------
// Default: any unmatched call returns empty-result. Tests override via
// mockImplementation or mockResolvedValueOnce for their specific queries.
// We DO NOT try to account for ensureSchema call counts since schemaReady
// is a singleton — after the first test it's a no-op (0 pool.query calls).

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ---- helpers -----------------------------------------------------------

/**
 * Configure mockQuery to return `returnValue` for the NEXT call whose SQL
 * includes `sqlFragment`, and the default `{ rows:[], rowCount:0 }` for all
 * other calls (including any schema call that may or may not fire).
 */
function whenSql(sqlFragment: string, returnValue: { rows: unknown[]; rowCount: number | null }) {
  mockQuery.mockImplementation(async (sql: string) => {
    if (typeof sql === 'string' && sql.includes(sqlFragment)) {
      return returnValue;
    }
    return { rows: [], rowCount: 0 };
  });
}

// ---- createRun ---------------------------------------------------------

describe('createRun', () => {
  it('inserts a row with status=running and returns mapped HunterRun', async () => {
    const row = buildRunRow();
    whenSql('INSERT INTO hunter_runs', { rows: [row], rowCount: 1 });

    const run = await createRun({
      workspaceId: WORKSPACE,
      criteria: buildCriteria(),
      weightsSnapshot: buildWeights(),
      startedBy: STARTED_BY,
    });

    expect(run.id).toBe('run-uuid-001');
    expect(run.workspaceId).toBe(WORKSPACE);
    expect(run.status).toBe('running');
    expect(run.startedBy).toBe(STARTED_BY);
    expect(run.startedAt).toBe('2026-05-13T00:00:00.000Z');
    expect(run.completedAt).toBeUndefined();
    expect(run.summary.fetched).toBe(0);
    expect(run.summary.errors).toEqual([]);
  });

  it('passes workspaceId and startedBy in correct param positions', async () => {
    const row = buildRunRow();
    mockQuery.mockResolvedValue({ rows: [row], rowCount: 1 });

    await createRun({
      workspaceId: WORKSPACE,
      criteria: buildCriteria(),
      weightsSnapshot: buildWeights(),
      startedBy: STARTED_BY,
    });

    // Find the INSERT call (not schema call)
    const insertCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO hunter_runs')
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![1][0]).toBe(WORKSPACE);   // $1 workspace_id
    expect(insertCall![1][3]).toBe(STARTED_BY);  // $4 started_by
  });

  it('seeds summary with all zero fields', async () => {
    const row = buildRunRow();
    mockQuery.mockResolvedValue({ rows: [row], rowCount: 1 });

    await createRun({
      workspaceId: WORKSPACE,
      criteria: buildCriteria(),
      weightsSnapshot: buildWeights(),
      startedBy: STARTED_BY,
    });

    const insertCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO hunter_runs')
    );
    const summaryArg = JSON.parse(insertCall![1][4] as string) as HunterRunSummary;
    expect(summaryArg).toEqual({
      fetched: 0, skippedBlocked: 0, gatedOut: 0, scored: 0, added: 0,
      errors: [], gatedReasons: [],
    });
  });
});

// ---- getRun ------------------------------------------------------------

describe('getRun', () => {
  it('returns null when no row found', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    const result = await getRun('nonexistent-id');
    expect(result).toBeNull();
  });

  it('returns mapped HunterRun when row found', async () => {
    const row = buildRunRow({ id: 'run-abc' });
    whenSql('SELECT * FROM hunter_runs WHERE id', { rows: [row], rowCount: 1 });

    const run = await getRun('run-abc');
    expect(run).not.toBeNull();
    expect(run!.id).toBe('run-abc');
    expect(run!.workspaceId).toBe(WORKSPACE);
  });

  it('maps completed_at to ISO string when present', async () => {
    const completedDate = new Date('2026-05-13T01:00:00Z');
    const row = buildRunRow({ status: 'complete', completed_at: completedDate });
    whenSql('SELECT * FROM hunter_runs WHERE id', { rows: [row], rowCount: 1 });

    const run = await getRun('run-abc');
    expect(run!.status).toBe('complete');
    expect(run!.completedAt).toBe('2026-05-13T01:00:00.000Z');
  });
});

// ---- listRunsByWorkspace -----------------------------------------------

describe('listRunsByWorkspace', () => {
  it('returns empty array when no runs exist', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    const list = await listRunsByWorkspace(WORKSPACE);
    expect(list).toEqual([]);
  });

  it('returns multiple runs mapped from rows', async () => {
    const rows = [
      buildRunRow({ id: 'run-2', started_at: new Date('2026-05-13T02:00:00Z') }),
      buildRunRow({ id: 'run-1', started_at: new Date('2026-05-13T01:00:00Z') }),
    ];
    whenSql('SELECT * FROM hunter_runs WHERE workspace_id', { rows, rowCount: 2 });

    const list = await listRunsByWorkspace(WORKSPACE);
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe('run-2');
    expect(list[1].id).toBe('run-1');
  });

  it('passes custom limit to query', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    await listRunsByWorkspace(WORKSPACE, 10);

    const selectCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('SELECT * FROM hunter_runs WHERE workspace_id')
    );
    expect(selectCall![1][1]).toBe(10);
  });

  it('defaults limit to 50', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    await listRunsByWorkspace(WORKSPACE);

    const selectCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('SELECT * FROM hunter_runs WHERE workspace_id')
    );
    expect(selectCall![1][1]).toBe(50);
  });
});

// ---- updateRunSummary --------------------------------------------------

describe('updateRunSummary', () => {
  it('calls jsonb_set for each patched key', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    await updateRunSummary('run-001', { fetched: 10, scored: 5 });

    const updateCalls = mockQuery.mock.calls.filter(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('jsonb_set')
    );
    expect(updateCalls).toHaveLength(2);

    const keys = updateCalls.map((c) => c[1][0] as string);
    expect(keys).toContain('{fetched}');
    expect(keys).toContain('{scored}');
  });

  it('encodes the value as JSON in param slot 2', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    await updateRunSummary('run-001', { fetched: 42 });

    const updateCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('jsonb_set')
    );
    expect(JSON.parse(updateCall![1][1] as string)).toBe(42);
  });

  it('is a no-op when patch is empty', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    await updateRunSummary('run-001', {});

    const updateCalls = mockQuery.mock.calls.filter(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('jsonb_set')
    );
    expect(updateCalls).toHaveLength(0);
  });
});

// ---- setRunStatus ------------------------------------------------------

describe('setRunStatus', () => {
  it('includes NOW() in SQL for terminal statuses', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    for (const status of ['complete', 'failed', 'stale'] as const) {
      mockQuery.mockClear();
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
      await setRunStatus('run-001', status);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('NOW()');
    }
  });

  it('uses NULL (not NOW()) for completed_at when status is running', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    await setRunStatus('run-001', 'running');
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('NULL');
    expect(sql).not.toContain('NOW()');
  });

  it('passes errorMessage in param slot 2 (index 1)', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    await setRunStatus('run-001', 'failed', { errorMessage: 'boom' });
    expect(mockQuery.mock.calls[0][1][1]).toBe('boom');
  });

  it('passes null for errorMessage when not provided', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    await setRunStatus('run-001', 'complete');
    expect(mockQuery.mock.calls[0][1][1]).toBeNull();
  });
});

// ---- sweepStaleRuns ----------------------------------------------------

describe('sweepStaleRuns', () => {
  it('returns the number of stale runs swept (rowCount)', async () => {
    whenSql('UPDATE hunter_runs', {
      rows: [{ id: 'r1' }, { id: 'r2' }],
      rowCount: 2,
    });

    const count = await sweepStaleRuns();
    expect(count).toBe(2);
  });

  it('returns 0 when no stale runs exist', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    const count = await sweepStaleRuns();
    expect(count).toBe(0);
  });

  it('targets only running rows older than 10 minutes', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    await sweepStaleRuns();

    const updateCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE hunter_runs')
    );
    expect(updateCall).toBeDefined();
    const sql = updateCall![0] as string;
    expect(sql).toContain("status = 'running'");
    expect(sql).toContain("INTERVAL '10 minutes'");
    expect(sql).toContain("status = 'stale'");
  });

  it('handles pg returning null rowCount gracefully (returns 0)', async () => {
    whenSql('UPDATE hunter_runs', { rows: [], rowCount: null });

    const count = await sweepStaleRuns();
    expect(count).toBe(0);
  });
});

// ---- rowToRun mapper (via getRun) --------------------------------------

describe('rowToRun mapper (via getRun)', () => {
  it('maps snake_case db fields to camelCase HunterRun fields', async () => {
    const row = buildRunRow({
      id: 'map-test',
      workspace_id: 'ws-map',
      error_message: 'some error',
    });
    whenSql('SELECT * FROM hunter_runs WHERE id', { rows: [row], rowCount: 1 });

    const run = await getRun('map-test');
    expect(run!.workspaceId).toBe('ws-map');
    expect(run!.errorMessage).toBe('some error');
  });

  it('leaves errorMessage null when db value is null', async () => {
    const row = buildRunRow({ error_message: null });
    whenSql('SELECT * FROM hunter_runs WHERE id', { rows: [row], rowCount: 1 });

    const run = await getRun('any');
    expect(run!.errorMessage == null).toBe(true);
  });

  it('maps summary JSONB to HunterRunSummary shape', async () => {
    const summary = {
      fetched: 10, skippedBlocked: 2, gatedOut: 1, scored: 7, added: 5,
      errors: [{ stage: 'enrich', message: 'oops' }],
      gatedReasons: [{ reason: 'genre_mismatch' }],
    };
    const row = buildRunRow({ summary });
    whenSql('SELECT * FROM hunter_runs WHERE id', { rows: [row], rowCount: 1 });

    const run = await getRun('any');
    expect(run!.summary.fetched).toBe(10);
    expect(run!.summary.errors).toHaveLength(1);
    expect(run!.summary.gatedReasons[0].reason).toBe('genre_mismatch');
  });
});
