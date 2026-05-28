import fs from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import type { ScoutCandidate, AuthUserRecord } from './types';

const LOCAL_PROJECTS_PATH =
  process.env.GEMFINDER_PROJECTS_PATH || path.join(process.cwd(), 'data', 'gemfinder-projects.local.json');
const WORKSPACE_STATE_KEY = 'workspace_projects';
const SNAPSHOT_LIMIT = 25;

let pool: Pool | null = null;
let schemaReady = false;

const SCHEMA_SQL = `
create table if not exists gemfinder_workspace_state (
  state_key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists gemfinder_workspace_snapshots (
  snapshot_id text primary key,
  state_key text not null,
  value jsonb not null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists gemfinder_workspace_snapshots_state_created_idx
  on gemfinder_workspace_snapshots (state_key, created_at desc);
`;

function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function useSsl(): boolean {
  const mode = String(process.env.DATABASE_SSL || '').trim().toLowerCase();
  if (['require', 'true', '1', 'yes'].includes(mode)) return true;
  return /sslmode=require/i.test(String(process.env.DATABASE_URL || ''));
}

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 8,
      ssl: useSsl() ? { rejectUnauthorized: false } : undefined
    });
  }
  return pool;
}

async function ensureSchema(): Promise<void> {
  if (!hasDatabase() || schemaReady) return;
  try {
    await getPool().query(SCHEMA_SQL);
    schemaReady = true;
    return;
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code || '') : '';
    const message = error instanceof Error ? error.message : String(error || '');
    const likelyPermissionIssue =
      code === '42501' ||
      /permission denied|insufficient privilege|read-only|must be owner/i.test(message);
    if (!likelyPermissionIssue) throw error;

    const existing = await getPool().query(
      `select to_regclass('public.gemfinder_workspace_state') as state_table,
              to_regclass('public.gemfinder_workspace_snapshots') as snapshots_table`
    );
    const row = existing.rows[0] || {};
    if (row.state_table && row.snapshots_table) {
      schemaReady = true;
      return;
    }
    throw error;
  }
}

function normalizeProjects(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

async function readLocalProjects(): Promise<unknown[]> {
  try {
    const raw = await fs.readFile(LOCAL_PROJECTS_PATH, 'utf8');
    const parsed = JSON.parse(raw) as { projects?: unknown[] } | unknown[];
    if (Array.isArray(parsed)) return normalizeProjects(parsed);
    return normalizeProjects(parsed?.projects);
  } catch {
    return [];
  }
}

async function writeLocalProjects(projects: unknown[]): Promise<void> {
  await fs.mkdir(path.dirname(LOCAL_PROJECTS_PATH), { recursive: true });
  await fs.writeFile(LOCAL_PROJECTS_PATH, JSON.stringify({ projects }, null, 2), 'utf8');
}

async function readCurrentWorkspacePayload(): Promise<{ projects: unknown[] } | null> {
  if (!hasDatabase()) {
    return { projects: await readLocalProjects() };
  }

  await ensureSchema();
  const res = await getPool().query('select value from gemfinder_workspace_state where state_key = $1 limit 1', [WORKSPACE_STATE_KEY]);
  const value = res.rows[0]?.value as { projects?: unknown[] } | undefined;
  if (!value) return null;
  return { projects: normalizeProjects(value?.projects) };
}

async function saveWorkspaceSnapshot(value: { projects: unknown[] }, reason?: string): Promise<void> {
  if (!hasDatabase()) return;
  await ensureSchema();
  const snapshotId = `${WORKSPACE_STATE_KEY}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  await getPool().query(
    `insert into gemfinder_workspace_snapshots (snapshot_id, state_key, value, reason)
     values ($1, $2, $3::jsonb, $4)`,
    [snapshotId, WORKSPACE_STATE_KEY, JSON.stringify(value), reason || null]
  );
  await getPool().query(
    `delete from gemfinder_workspace_snapshots
     where snapshot_id in (
       select snapshot_id
       from gemfinder_workspace_snapshots
       where state_key = $1
       order by created_at desc
       offset $2
     )`,
    [WORKSPACE_STATE_KEY, SNAPSHOT_LIMIT]
  );
}

export async function listWorkspaceProjects(): Promise<unknown[]> {
  if (!hasDatabase()) {
    return readLocalProjects();
  }

  await ensureSchema();
  const res = await getPool().query('select value from gemfinder_workspace_state where state_key = $1 limit 1', [WORKSPACE_STATE_KEY]);
  const value = res.rows[0]?.value as { projects?: unknown[] } | undefined;
  return normalizeProjects(value?.projects);
}

/**
 * Read both the projects AND a concurrency-control etag derived from the
 * workspace state's updated_at timestamp. Returns null etag when there's no
 * stored state yet (first-time setup) — callers should treat null as "no
 * version to check against; first writer wins."
 *
 * The etag is the ISO timestamp of the last update. It's monotonically
 * non-decreasing on a single workspace row, which is exactly what optimistic
 * locking wants: client sends "I'm changing the version I saw at T1"; server
 * compares "is my current updated_at still T1?"; if no, someone else wrote
 * since T1 and the client's view is stale.
 */
export async function listWorkspaceProjectsWithEtag(): Promise<{ projects: unknown[]; etag: string | null }> {
  if (!hasDatabase()) {
    return { projects: await readLocalProjects(), etag: null };
  }

  await ensureSchema();
  const res = await getPool().query(
    'select value, updated_at from gemfinder_workspace_state where state_key = $1 limit 1',
    [WORKSPACE_STATE_KEY]
  );
  const row = res.rows[0] as { value?: { projects?: unknown[] }; updated_at?: Date } | undefined;
  if (!row) return { projects: [], etag: null };
  return {
    projects: normalizeProjects(row.value?.projects),
    etag: row.updated_at ? row.updated_at.toISOString() : null,
  };
}

/**
 * Thrown by saveWorkspaceProjects when the caller's expectedEtag doesn't
 * match the server's current state. The current etag is attached so the
 * caller (the PUT route handler) can include it in the 409 response without
 * a second DB roundtrip.
 */
export class WorkspaceEtagConflictError extends Error {
  readonly isConflict = true;
  readonly currentEtag: string | null;
  readonly currentProjects: unknown[];
  constructor(currentEtag: string | null, currentProjects: unknown[]) {
    super('Workspace state changed since this client loaded it; please reload and reapply your changes');
    this.name = 'WorkspaceEtagConflictError';
    this.currentEtag = currentEtag;
    this.currentProjects = currentProjects;
  }
}

export async function saveWorkspaceProjects(
  projects: unknown[],
  options?: { allowEmpty?: boolean; reason?: string; expectedEtag?: string | null }
): Promise<{ etag: string | null }> {
  const normalized = normalizeProjects(projects);
  const allowEmpty = !!options?.allowEmpty;

  if (!hasDatabase()) {
    const current = await readLocalProjects();
    if (!allowEmpty && current.length > 0 && normalized.length === 0) {
      throw new Error('Refusing to overwrite non-empty workspace with an empty project list');
    }
    await writeLocalProjects(normalized);
    // No DB → no etag; callers in this mode are typically tests or local dev.
    return { etag: null };
  }

  await ensureSchema();
  const current = await readCurrentWorkspacePayload();
  const currentProjects = normalizeProjects(current?.projects);
  if (!allowEmpty && currentProjects.length > 0 && normalized.length === 0) {
    throw new Error('Refusing to overwrite non-empty workspace with an empty project list');
  }
  if (currentProjects.length > 0) {
    await saveWorkspaceSnapshot({ projects: currentProjects }, options?.reason || 'before_save');
  }

  // Optimistic-locking path: when caller provides expectedEtag, the UPDATE
  // includes WHERE updated_at = $expected. That's an atomic compare-and-swap
  // at the DB layer — no concurrent writer can sneak between our check and
  // our write. If the etag has moved on, rowCount === 0 and we throw the
  // conflict error with the current state attached so the route handler can
  // return it in the 409 response (no extra round trip).
  if (options?.expectedEtag !== undefined) {
    const result = await getPool().query(
      `update gemfinder_workspace_state
       set value = $2::jsonb, updated_at = now()
       where state_key = $1 and updated_at = $3
       returning updated_at`,
      [WORKSPACE_STATE_KEY, JSON.stringify({ projects: normalized }), options.expectedEtag]
    );
    if (result.rowCount === 0) {
      // Either (a) row doesn't exist yet (first save), or (b) stale etag.
      // Distinguish by checking if a row exists at all.
      const currentRow = await getPool().query(
        'select updated_at from gemfinder_workspace_state where state_key = $1',
        [WORKSPACE_STATE_KEY]
      );
      if (currentRow.rows.length === 0) {
        // First save — no row to conflict with. Insert fresh.
        const inserted = await getPool().query(
          `insert into gemfinder_workspace_state (state_key, value, updated_at)
           values ($1, $2::jsonb, now())
           returning updated_at`,
          [WORKSPACE_STATE_KEY, JSON.stringify({ projects: normalized })]
        );
        return { etag: (inserted.rows[0].updated_at as Date).toISOString() };
      }
      // Stale etag — pull current state so the route can echo it in the
      // 409 response, letting the client reload without an extra GET.
      throw new WorkspaceEtagConflictError(
        (currentRow.rows[0].updated_at as Date).toISOString(),
        currentProjects,
      );
    }
    return { etag: (result.rows[0].updated_at as Date).toISOString() };
  }

  // Legacy path (no expectedEtag): unchanged upsert. Existing callers like
  // the scout-candidate approve/reject and addTalentToProject still use
  // this. Migrating them to optimistic-lock is a separate task — they're
  // server-side so the race surface is much smaller (only the route handler
  // can write, not concurrent operators).
  const upsertResult = await getPool().query(
    `insert into gemfinder_workspace_state (state_key, value, updated_at)
     values ($1, $2::jsonb, now())
     on conflict (state_key)
     do update set value = excluded.value, updated_at = now()
     returning updated_at`,
    [WORKSPACE_STATE_KEY, JSON.stringify({ projects: normalized })]
  );
  return { etag: (upsertResult.rows[0].updated_at as Date).toISOString() };
}

export async function listWorkspaceProjectSnapshots(limit = 10): Promise<Array<{ snapshotId: string; createdAt: string; reason: string | null; projectCount: number }>> {
  if (!hasDatabase()) return [];
  await ensureSchema();
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 10));
  const res = await getPool().query(
    `select snapshot_id, created_at, reason, value
     from gemfinder_workspace_snapshots
     where state_key = $1
     order by created_at desc
     limit $2`,
    [WORKSPACE_STATE_KEY, safeLimit]
  );
  return res.rows.map(row => ({
    snapshotId: String(row.snapshot_id),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    reason: row.reason ?? null,
    projectCount: normalizeProjects((row.value as { projects?: unknown[] } | undefined)?.projects).length,
  }));
}

/**
 * Fetch ONE snapshot's full payload by snapshot_id. Unlike the list function
 * which strips down to metadata for cheap browsing, this returns the entire
 * projects JSONB blob — used for both raw-extract recovery (curl + grep for
 * notes) and the restore flow (read snapshot → write it back as live state).
 *
 * Returns null if the snapshot doesn't exist OR there's no database
 * configured (local dev mode without DATABASE_URL).
 */
export async function getWorkspaceSnapshotById(
  snapshotId: string
): Promise<{
  snapshotId: string;
  createdAt: string;
  reason: string | null;
  projects: unknown[];
} | null> {
  if (!hasDatabase()) return null;
  await ensureSchema();
  const res = await getPool().query(
    `select snapshot_id, created_at, reason, value
     from gemfinder_workspace_snapshots
     where state_key = $1 and snapshot_id = $2
     limit 1`,
    [WORKSPACE_STATE_KEY, snapshotId]
  );
  const row = res.rows[0] as
    | { snapshot_id: string; created_at: Date | string; reason: string | null; value: { projects?: unknown[] } }
    | undefined;
  if (!row) return null;
  return {
    snapshotId: String(row.snapshot_id),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    reason: row.reason ?? null,
    projects: normalizeProjects(row.value?.projects),
  };
}

/**
 * Restore a snapshot as the live workspace state.
 *
 * Reversibility design: BEFORE the write, captures the current state as a
 * fresh snapshot tagged "before_restore:<targetSnapshotId>". This means
 * every restore is itself reversible — if Dakota's snapshot turns out to
 * be wrong, the admin can immediately restore the just-before-restore
 * snapshot to undo. No data is ever truly destroyed by this flow.
 *
 * Uses the SAME saveWorkspaceProjects path as a regular save, so the
 * etag invariants hold: the live state's updated_at advances, any
 * concurrent client gets a 409 next time it tries to save with a stale
 * etag, and gets prompted to reload to see the restored state.
 *
 * Returns the new etag (live state's new updated_at) so the caller can
 * surface it back to the client.
 */
export async function restoreWorkspaceSnapshot(
  snapshotId: string,
  options?: { reason?: string }
): Promise<{ etag: string | null; restoredProjectCount: number }> {
  if (!hasDatabase()) {
    throw new Error('Snapshot restore requires DATABASE_URL');
  }
  const snapshot = await getWorkspaceSnapshotById(snapshotId);
  if (!snapshot) {
    throw new Error(`Snapshot not found: ${snapshotId}`);
  }
  // saveWorkspaceProjects(..., { reason }) captures a fresh snapshot of the
  // CURRENT pre-restore state under the reason we provide here — that's
  // what makes the restore reversible. No expectedEtag because restores
  // are admin-only deliberate writes; we don't want a concurrent operator
  // save to 409 the restore.
  const reason = options?.reason || `restore_from:${snapshotId}`;
  const result = await saveWorkspaceProjects(snapshot.projects, { reason });
  return {
    etag: result.etag,
    restoredProjectCount: snapshot.projects.length,
  };
}

export async function addTalentToProject(
  workspaceId: string,
  projectId: string,
  candidate: ScoutCandidate,
  actor: AuthUserRecord
): Promise<{ talentId: string; artistRecord: Record<string, unknown> }> {
  const projects = await listWorkspaceProjects();
  const project = projects.find((p: unknown) => (p as { id?: string }).id === projectId) as Record<string, unknown> | undefined;
  if (!project) {
    throw new Error(`Project ${projectId} not found in workspace ${workspaceId}`);
  }

  const artistRecord: Record<string, unknown> = {
    n: candidate.displayName,
    e: candidate.primaryEmail,
    soc: candidate.instagramHandle,
    spotify: candidate.spotifyUrl,
    stage: 'prospect',
    genre: candidate.primaryGenre,
    locations: candidate.locations,
    contactType: candidate.contactType,
    contactName: candidate.contactName,
    contactEmail: candidate.contactEmail,
    discoveredVia: candidate.source,
    addedBy: actor.email,
    addedAt: new Date().toISOString(),
  };

  const artists = ((project.artists as Record<string, unknown>[]) || []).slice();
  artists.push(artistRecord);
  (project as Record<string, unknown>).artists = artists;

  await saveWorkspaceProjects(projects);

  return {
    talentId: candidate.displayName,
    artistRecord,
  };
}
