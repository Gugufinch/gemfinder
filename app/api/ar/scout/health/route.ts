// Scout V3 health probe — no auth required, returns environment + schema status.
// Hit this URL to debug deploy issues without needing to log in:
//   curl https://gemfinder-1qm5.onrender.com/api/ar/scout/health
// Or with a workspaceId to also test workspace-scoped queries:
//   curl https://gemfinder-1qm5.onrender.com/api/ar/scout/health?workspaceId=songfinch

import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, getScoutPool, getStats } from '@/lib/gemfinder/scout-candidate-store';
import { listWorkspaceProjects } from '@/lib/gemfinder/project-store';

type Check = { name: string; ok: boolean; detail?: string; error?: string };

export async function GET(req: NextRequest) {
  const checks: Check[] = [];
  let overallOk = true;

  const fail = (name: string, error: unknown, detail?: string) => {
    overallOk = false;
    checks.push({
      name,
      ok: false,
      detail,
      error: error instanceof Error ? error.message : String(error),
    });
  };
  const pass = (name: string, detail?: string) => {
    checks.push({ name, ok: true, detail });
  };

  // 1. Environment check
  if (!process.env.DATABASE_URL) {
    fail('env.DATABASE_URL', 'missing', 'DATABASE_URL must be set');
  } else {
    pass('env.DATABASE_URL', 'set');
  }

  // 2. Postgres connectivity
  try {
    const pool = getScoutPool();
    const result = await pool.query('select version() as v');
    const version = String(result.rows[0]?.v ?? '');
    pass('pg.connection', version.split(',')[0]);

    // 3. pgcrypto / gen_random_uuid availability
    try {
      const uuidResult = await pool.query('select gen_random_uuid() as u');
      pass('pg.gen_random_uuid', String(uuidResult.rows[0]?.u ?? '').slice(0, 8) + '…');
    } catch (err) {
      fail(
        'pg.gen_random_uuid',
        err,
        'extension pgcrypto may not be enabled; tables with default gen_random_uuid() will fail to create'
      );
    }
  } catch (err) {
    fail('pg.connection', err, 'cannot connect to DATABASE_URL');
  }

  // 4. Schema status
  try {
    await ensureSchema();
    pass('schema.scout_candidates', 'ready');
    pass('schema.scout_rejections', 'ready');
  } catch (err) {
    fail('schema.ensureSchema', err, 'CREATE TABLE failed — see pg error');
  }

  // 5. Workspace projects readable
  let workspaceCount = 0;
  let workspaceIdsSample: string[] = [];
  try {
    const projects = (await listWorkspaceProjects()) as Array<Record<string, unknown>>;
    workspaceCount = projects.length;
    workspaceIdsSample = projects.slice(0, 5).map((p) => String(p?.id ?? '')).filter(Boolean);
    pass('projects.list', `${workspaceCount} project rows; first ids: ${workspaceIdsSample.join(', ')}`);
  } catch (err) {
    fail('projects.list', err, 'listWorkspaceProjects() failed');
  }

  // 6. Optional workspace-scoped stats check
  const workspaceId = req.nextUrl.searchParams.get('workspaceId');
  if (workspaceId) {
    try {
      const stats = await getStats(workspaceId);
      pass(
        `stats[${workspaceId}]`,
        `pending=${stats.pendingCount}, rejected=${stats.rejectedCount}`
      );
    } catch (err) {
      fail(`stats[${workspaceId}]`, err);
    }
  }

  // 7. Build info
  pass('build.scout_v3', 'live');

  return NextResponse.json(
    {
      ok: overallOk,
      timestamp: new Date().toISOString(),
      checks,
      hint: workspaceId
        ? 'Workspace-scoped check included'
        : 'Pass ?workspaceId=<id> to also test workspace-scoped queries',
    },
    { status: overallOk ? 200 : 503 }
  );
}
