// lib/gemfinder/hunter-runs-summary-queue.test.ts
//
// Audit #7: pins the queue/debounce/merge contract that replaces the
// previous "one query per patch key" loop.
//
// THE BUGS:
//   1. Loop-per-key sent N pg queries per call. Hot-loop ships 5 fields × 100
//      candidates = 500 queries during enrichment.
//   2. No debounce — every per-candidate progress write hit pg.
//
// THE FIX (this module):
//   - queueRunSummaryPatch(): merges patches in memory, debounces to ~1
//     query per 500ms window
//   - updateRunSummary(): awaited callers get an immediate flush + write
//     in ONE query (single `summary || $patch::jsonb` merge)
//   - flushRunSummaryQueue(): explicit flush for shutdown / test isolation

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We force-mock the pg layer so this test can verify call shape +
// debounce semantics without a database.
//
// Stable pool reference: `getScoutPool()` is called inside `writeRunSummary`
// on every flush. If the mock returned a fresh `{query: vi.fn()}` per call,
// each flush would land on a different mock and the test couldn't count
// across flushes. Hold the pool + query mocks at module scope. Typed
// generic so TS knows the call args are (sql, params).
const mockQuery = vi.fn(async (..._args: unknown[]) => ({ rows: [], rowCount: 0 }));
const mockPool = { query: mockQuery };
vi.mock('./scout-candidate-store', () => ({
  ensureSchema: vi.fn(async () => {}),
  getScoutPool: vi.fn(() => mockPool),
}));

import {
  updateRunSummary,
  queueRunSummaryPatch,
  flushRunSummaryQueue,
  __resetRunSummaryQueue,
} from './hunter-runs-store';
import { getScoutPool } from './scout-candidate-store';

beforeEach(() => {
  __resetRunSummaryQueue();
  vi.clearAllMocks();
});

afterEach(() => {
  __resetRunSummaryQueue();
});

function lastQueryArgs(): { sql: string; params: unknown[] } | null {
  const calls = mockQuery.mock.calls;
  if (!calls.length) return null;
  const last = calls[calls.length - 1];
  return { sql: String(last[0]), params: (last[1] ?? []) as unknown[] };
}
function queryCallCount(): number {
  return mockQuery.mock.calls.length;
}

describe('updateRunSummary — ONE query per call, jsonb merge semantics', () => {
  it('🚀 a single multi-key patch fires ONE query, not N (was N queries pre-fix)', async () => {
    await updateRunSummary('run_1', {
      fetched: 100,
      scored: 12,
      gatedOut: 4,
      added: 8,
    });
    expect(queryCallCount()).toBe(1);
  });

  it('uses jsonb merge operator `||` so any number of keys collapse into one statement', async () => {
    await updateRunSummary('run_1', { fetched: 100, scored: 12 });
    const args = lastQueryArgs()!;
    expect(args.sql).toMatch(/summary\s*=\s*summary\s*\|\|/i);
    // The whole patch is shipped as ONE jsonb param.
    const patch = JSON.parse(args.params[0] as string);
    expect(patch).toEqual({ fetched: 100, scored: 12 });
  });

  it('flushes any pending queued patch BEFORE applying the awaited patch so no progress is lost', async () => {
    queueRunSummaryPatch('run_1', { gatedReasons: [{ candidateName: 'A', reason: 'low_score' }] });
    // The queued patch has not flushed yet — confirm.
    expect(queryCallCount()).toBe(0);
    await updateRunSummary('run_1', { fetched: 100 });
    // ONE query lands containing BOTH patches merged.
    expect(queryCallCount()).toBe(1);
    const patch = JSON.parse(lastQueryArgs()!.params[0] as string);
    expect(patch.fetched).toBe(100);
    expect(patch.gatedReasons).toEqual([{ candidateName: 'A', reason: 'low_score' }]);
  });
});

describe('queueRunSummaryPatch — debounce, merge, coalesce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does NOT hit pg immediately — defers the write', () => {
    queueRunSummaryPatch('run_1', { scored: 1 });
    expect(queryCallCount()).toBe(0);
  });

  it('writes ONCE after the debounce window, regardless of how many patches arrived', async () => {
    // Simulate Hunter's hot loop: 100 candidates each call queue.
    for (let i = 1; i <= 100; i++) {
      queueRunSummaryPatch('run_1', {
        scored: i,
        gatedReasons: Array.from({ length: i }, (_, k) => ({ candidateName: `c${k}`, reason: 'low' })),
      });
    }
    expect(queryCallCount()).toBe(0);  // still nothing pre-flush
    vi.advanceTimersByTime(600);       // past the 500ms window
    await vi.runAllTimersAsync();
    expect(queryCallCount()).toBe(1);  // 100 calls → 1 write
    const patch = JSON.parse(lastQueryArgs()!.params[0] as string);
    expect(patch.scored).toBe(100);    // last-write-wins for scalars (correct)
    expect(patch.gatedReasons.length).toBe(100);  // full array
  });

  it('patches across windows are independent — each window flushes one write', async () => {
    queueRunSummaryPatch('run_1', { scored: 5 });
    vi.advanceTimersByTime(600);
    await vi.runAllTimersAsync();
    expect(queryCallCount()).toBe(1);

    queueRunSummaryPatch('run_1', { scored: 10 });
    vi.advanceTimersByTime(600);
    await vi.runAllTimersAsync();
    expect(queryCallCount()).toBe(2);
  });

  it('per-run isolation: queueing run_A does not start a timer for run_B', async () => {
    queueRunSummaryPatch('run_A', { scored: 1 });
    vi.advanceTimersByTime(600);
    await vi.runAllTimersAsync();
    expect(queryCallCount()).toBe(1);  // only run_A flushed
    const sql = lastQueryArgs()!.sql;
    const params = lastQueryArgs()!.params;
    expect(params).toContain('run_A');
    expect(sql).toMatch(/where\s+id\s*=/i);
  });

  it('later patches override earlier scalar keys (last-write-wins, correct for cumulative counters)', async () => {
    queueRunSummaryPatch('run_1', { scored: 5 });
    queueRunSummaryPatch('run_1', { scored: 6 });
    queueRunSummaryPatch('run_1', { scored: 7 });
    vi.advanceTimersByTime(600);
    await vi.runAllTimersAsync();
    const patch = JSON.parse(lastQueryArgs()!.params[0] as string);
    expect(patch.scored).toBe(7);
  });
});

describe('flushRunSummaryQueue — explicit drain', () => {
  it('forces an immediate flush + clears the pending timer', async () => {
    vi.useFakeTimers();
    try {
      queueRunSummaryPatch('run_1', { scored: 9 });
      expect(queryCallCount()).toBe(0);
      await flushRunSummaryQueue('run_1');
      expect(queryCallCount()).toBe(1);
      // The timer that was scheduled should be cancelled — advancing past it
      // does NOT fire another write.
      vi.advanceTimersByTime(2000);
      await vi.runAllTimersAsync();
      expect(queryCallCount()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('no-op when nothing is pending', async () => {
    await flushRunSummaryQueue('run_nonexistent');
    expect(queryCallCount()).toBe(0);
  });
});
