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

export async function saveWorkspaceProjects(
  projects: unknown[],
  options?: { allowEmpty?: boolean; reason?: string }
): Promise<void> {
  const normalized = normalizeProjects(projects);
  const allowEmpty = !!options?.allowEmpty;

  if (!hasDatabase()) {
    const current = await readLocalProjects();
    if (!allowEmpty && current.length > 0 && normalized.length === 0) {
      throw new Error('Refusing to overwrite non-empty workspace with an empty project list');
    }
    await writeLocalProjects(normalized);
    return;
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
  await getPool().query(
    `insert into gemfinder_workspace_state (state_key, value, updated_at)
     values ($1, $2::jsonb, now())
     on conflict (state_key)
     do update set value = excluded.value, updated_at = now()`,
    [WORKSPACE_STATE_KEY, JSON.stringify({ projects: normalized })]
  );
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
