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

export async function updateRunSummary(id: string, patch: Partial<HunterRunSummary>): Promise<void> {
  for (const [key, value] of Object.entries(patch)) {
    await getScoutPool().query(
      `UPDATE hunter_runs SET summary = jsonb_set(summary, $1, $2::jsonb) WHERE id = $3`,
      [`{${key}}`, JSON.stringify(value), id]
    );
  }
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
