import fs from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';

const LOCAL_PROJECTS_PATH =
  process.env.GEMFINDER_PROJECTS_PATH || path.join(process.cwd(), 'data', 'gemfinder-projects.local.json');
const WORKSPACE_STATE_KEY = 'workspace_projects';

let pool: Pool | null = null;
let schemaReady = false;

const SCHEMA_SQL = `
create table if not exists gemfinder_workspace_state (
  state_key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
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
  await getPool().query(SCHEMA_SQL);
  schemaReady = true;
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

export async function listWorkspaceProjects(): Promise<unknown[]> {
  if (!hasDatabase()) {
    return readLocalProjects();
  }

  await ensureSchema();
  const res = await getPool().query('select value from gemfinder_workspace_state where state_key = $1 limit 1', [WORKSPACE_STATE_KEY]);
  const value = res.rows[0]?.value as { projects?: unknown[] } | undefined;
  return normalizeProjects(value?.projects);
}

export async function saveWorkspaceProjects(projects: unknown[]): Promise<void> {
  const normalized = normalizeProjects(projects);

  if (!hasDatabase()) {
    await writeLocalProjects(normalized);
    return;
  }

  await ensureSchema();
  await getPool().query(
    `insert into gemfinder_workspace_state (state_key, value, updated_at)
     values ($1, $2::jsonb, now())
     on conflict (state_key)
     do update set value = excluded.value, updated_at = now()`,
    [WORKSPACE_STATE_KEY, JSON.stringify({ projects: normalized })]
  );
}
