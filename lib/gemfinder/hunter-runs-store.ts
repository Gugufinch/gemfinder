// lib/gemfinder/hunter-runs-store.ts
import type { HunterRun, HunterRunStatus, HunterRunSummary, HunterCriteria, HunterWeights } from '@/lib/gemfinder/types';
import { getScoutPool, ensureSchema } from './scout-candidate-store';

export async function createRun(input: {
  workspaceId: string;
  criteria: HunterCriteria;
  weightsSnapshot: HunterWeights;
  startedBy: string;
}): Promise<HunterRun> {
  await ensureSchema();
  const res = await getScoutPool().query(
    `INSERT INTO hunter_runs (workspace_id, criteria, weights_snapshot, status, started_by, summary)
     VALUES ($1, $2::jsonb, $3::jsonb, 'running', $4, $5::jsonb)
     RETURNING *`,
    [
      input.workspaceId,
      JSON.stringify(input.criteria),
      JSON.stringify(input.weightsSnapshot),
      input.startedBy,
      JSON.stringify({ fetched: 0, skippedBlocked: 0, gatedOut: 0, scored: 0, added: 0, errors: [], gatedReasons: [] }),
    ]
  );
  return rowToRun(res.rows[0]);
}

export async function getRun(id: string): Promise<HunterRun | null> {
  await ensureSchema();
  const res = await getScoutPool().query(`SELECT * FROM hunter_runs WHERE id = $1`, [id]);
  return res.rows.length ? rowToRun(res.rows[0]) : null;
}

export async function listRunsByWorkspace(workspaceId: string, limit = 50): Promise<HunterRun[]> {
  await ensureSchema();
  const res = await getScoutPool().query(
    `SELECT * FROM hunter_runs WHERE workspace_id = $1 ORDER BY started_at DESC LIMIT $2`,
    [workspaceId, limit]
  );
  return res.rows.map(rowToRun);
}

// ─── Audit #7: run-summary write path ─────────────────────────────────────
//
// THE PRE-FIX BUG: `updateRunSummary` looped Object.entries(patch) and
// fired ONE pg query per key. Hunter's hot loop calls it with 5 keys per
// candidate (the cumulative-counter snapshot) — for a 100-candidate run
// that's 500 pg roundtrips during enrichment alone, fire-and-forget,
// stampeding the connection pool.
//
// THE FIX (two changes):
//   1. ONE query per call via `summary = summary || $patch::jsonb`. Postgres
//      merges top-level keys atomically per row. Any number of keys in the
//      patch → still one statement.
//   2. queueRunSummaryPatch() collects patches in process and flushes after
//      a debounce window. The 100 per-candidate calls coalesce to ~5 writes
//      across the run, since enrichment takes seconds and the window is
//      500ms.
//
// Awaited `updateRunSummary(...)` callers — phase boundaries that NEED the
// write to land before continuing — still get exact, synchronous semantics:
// the queued patch (if any) is flushed first, then the awaited patch is
// applied in ONE additional merge.

type RunSummaryPatch = Partial<HunterRunSummary>;
const pendingByRun = new Map<string, RunSummaryPatch>();
const timersByRun = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_MS = Number(process.env.AR_RUN_SUMMARY_DEBOUNCE_MS) || 500;

function mergePending(id: string, patch: RunSummaryPatch): void {
  const existing = pendingByRun.get(id) ?? {};
  pendingByRun.set(id, { ...existing, ...patch });
}

async function writeRunSummary(id: string, patch: RunSummaryPatch): Promise<void> {
  // Skip the round-trip for empty patches — `summary || '{}'::jsonb` is a
  // no-op at the data level but still costs a pg call. Match the pre-fix
  // behavior where an empty patch fired zero queries.
  if (!patch || Object.keys(patch).length === 0) return;
  await getScoutPool().query(
    `UPDATE hunter_runs SET summary = summary || $1::jsonb WHERE id = $2`,
    [JSON.stringify(patch), id]
  );
}

/**
 * Queue a debounced run-summary patch. Patches accumulate in memory across
 * calls within the debounce window; one merged write fires when the window
 * closes. Safe to call fire-and-forget — there is no Promise to await
 * (caller never blocks). Use this from the per-candidate hot loop.
 */
export function queueRunSummaryPatch(id: string, patch: RunSummaryPatch): void {
  mergePending(id, patch);
  if (timersByRun.has(id)) return;
  const timer = setTimeout(() => {
    void flushRunSummaryQueue(id).catch((err) =>
      console.warn('[HUNTER_RUNS] debounced summary flush failed:', err)
    );
  }, DEBOUNCE_MS);
  timersByRun.set(id, timer);
}

/**
 * Force-flush any pending queued patch for this run. Resolves AFTER the
 * write has been sent to pg. Idempotent — no-op when nothing is pending.
 *
 * Called automatically by `updateRunSummary` so callers awaiting a final
 * state don't need to manage flushing themselves.
 */
export async function flushRunSummaryQueue(id: string): Promise<void> {
  const timer = timersByRun.get(id);
  if (timer) {
    clearTimeout(timer);
    timersByRun.delete(id);
  }
  const pending = pendingByRun.get(id);
  if (!pending) return;
  pendingByRun.delete(id);
  await writeRunSummary(id, pending);
}

/**
 * Apply a patch to the run summary and AWAIT the result. Flushes any
 * pending queued patch first so its data is never lost — see the audit
 * note above. ONE pg query for the combined patch.
 */
export async function updateRunSummary(id: string, patch: RunSummaryPatch): Promise<void> {
  mergePending(id, patch);
  await flushRunSummaryQueue(id);
}

/**
 * Test seam: clear all queued patches + cancel pending timers. Tests that
 * exercise the queue should call this in `beforeEach` for isolation —
 * same pattern as the feature-flag cache reset.
 */
export function __resetRunSummaryQueue(): void {
  for (const timer of timersByRun.values()) clearTimeout(timer);
  timersByRun.clear();
  pendingByRun.clear();
}

export async function setRunStatus(
  id: string,
  status: HunterRunStatus,
  opts: { errorMessage?: string } = {}
): Promise<void> {
  const isTerminal = status !== 'running';
  await getScoutPool().query(
    `UPDATE hunter_runs SET status = $1, completed_at = ${isTerminal ? 'NOW()' : 'NULL'}, error_message = $2 WHERE id = $3`,
    [status, opts.errorMessage ?? null, id]
  );
}

export async function sweepStaleRuns(): Promise<number> {
  await ensureSchema();
  const res = await getScoutPool().query(
    `UPDATE hunter_runs
     SET status = 'stale', error_message = 'No heartbeat within 10 minutes', completed_at = NOW()
     WHERE status = 'running' AND started_at < NOW() - INTERVAL '10 minutes'
     RETURNING id`
  );
  return res.rowCount ?? 0;
}

/**
 * Delete a single hunter_runs row, workspace-scoped for safety.
 * Returns true if a row was deleted, false if not found (or wrong workspace).
 * Candidates inserted by this run keep their hunter_run_id reference
 * (FK is ON DELETE SET NULL per the schema), so deleting a run doesn't
 * cascade-delete its outputs from the Scout queue.
 */
export async function deleteRun(id: string, workspaceId: string): Promise<boolean> {
  await ensureSchema();
  const res = await getScoutPool().query(
    `DELETE FROM hunter_runs WHERE id = $1 AND workspace_id = $2 RETURNING id`,
    [id, workspaceId]
  );
  return (res.rowCount ?? 0) > 0;
}

function rowToRun(row: Record<string, unknown>): HunterRun {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    criteria: row.criteria as HunterCriteria,
    weightsSnapshot: row.weights_snapshot as HunterWeights,
    status: row.status as HunterRunStatus,
    startedAt: (row.started_at as Date).toISOString(),
    completedAt: row.completed_at ? (row.completed_at as Date).toISOString() : undefined,
    errorMessage: row.error_message as string | undefined,
    summary: row.summary as HunterRunSummary,
    startedBy: row.started_by as string,
  };
}
