// Scout V3 health probe — no auth required, returns environment + schema status.
// Hit this URL to debug deploy issues without needing to log in:
//   curl https://gemfinder-1qm5.onrender.com/api/ar/scout/health
// Or with a workspaceId to also test workspace-scoped queries:
//   curl https://gemfinder-1qm5.onrender.com/api/ar/scout/health?workspaceId=songfinch

import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, getScoutPool, getStats } from '@/lib/gemfinder/scout-candidate-store';
import { listWorkspaceProjects } from '@/lib/gemfinder/project-store';
import { getWeights } from '@/lib/gemfinder/hunter/weights-store';

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

  // 7. Hunter schema checks
  try {
    const pool = getScoutPool();
    await pool.query('select 1 from hunter_runs limit 1');
    pass('schema.hunter_runs', 'ready');
  } catch (err) {
    fail('schema.hunter_runs', err, 'table missing; run ensureSchema()');
  }

  try {
    const pool = getScoutPool();
    await pool.query('select 1 from hunter_scrape_cache limit 1');
    pass('schema.hunter_scrape_cache', 'ready');
  } catch (err) {
    fail('schema.hunter_scrape_cache', err, 'table missing; run ensureSchema()');
  }

  // 7b. Optional Hunter weights check (gated on workspaceId)
  if (workspaceId) {
    try {
      const weights = await getWeights(workspaceId);
      if (weights.updatedBy === 'system:default') {
        pass(
          `workspace[${workspaceId}].hunterWeights`,
          'using DEFAULT_HUNTER_WEIGHTS (no custom config saved)'
        );
      } else {
        pass(
          `workspace[${workspaceId}].hunterWeights`,
          `custom weights configured (version=${weights.version}, target_count=${weights.target_count_default})`
        );
      }
    } catch (err) {
      fail(`workspace[${workspaceId}].hunterWeights`, err);
    }
  }

  // 8. Spotify / Steel / Gemini / Groq env vars
  const SPOTIFY_ID = process.env.SPOTIFY_CLIENT_ID;
  const SPOTIFY_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
  const STEEL_KEY = process.env.STEEL_API_KEY;
  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  const GROQ_KEY = process.env.GROQ_API_KEY;

  if (!GEMINI_KEY) {
    fail('env.GEMINI_API_KEY', 'missing', 'free key at https://aistudio.google.com/apikey');
  } else if (GEMINI_KEY === 'PLACEHOLDER_API_KEY') {
    fail('env.GEMINI_API_KEY', 'is literal placeholder string', 'replace with real key');
  } else if (GEMINI_KEY.trim() !== GEMINI_KEY) {
    fail('env.GEMINI_API_KEY', 'has leading/trailing whitespace', 'trim and re-save in Render env vars');
  } else if (!GEMINI_KEY.startsWith('AIza')) {
    fail('env.GEMINI_API_KEY', 'does not look like a Google API key (should start with AIza...)', 'check value');
  } else {
    pass('env.GEMINI_API_KEY', `set (${GEMINI_KEY.slice(0, 6)}…${GEMINI_KEY.slice(-4)})`);
  }

  // GROQ is optional — only used as a fallback when Gemini quota is exhausted.
  // Surface its presence so operators can see whether the fallback is wired.
  if (!GROQ_KEY) {
    pass('env.GROQ_API_KEY', 'not set (Groq fallback disabled; Gemini-only mode)');
  } else if (!GROQ_KEY.startsWith('gsk_')) {
    fail('env.GROQ_API_KEY', 'does not look like a Groq key (should start with gsk_)', 'check value');
  } else if (GROQ_KEY.trim() !== GROQ_KEY) {
    fail('env.GROQ_API_KEY', 'has leading/trailing whitespace', 'trim and re-save');
  } else {
    pass('env.GROQ_API_KEY', `set (${GROQ_KEY.slice(0, 6)}…${GROQ_KEY.slice(-4)}) — fallback enabled`);
  }

  if (!SPOTIFY_ID) {
    fail('env.SPOTIFY_CLIENT_ID', 'missing', 'add to Render env vars');
  } else {
    pass('env.SPOTIFY_CLIENT_ID', `set (${SPOTIFY_ID.slice(0, 6)}…${SPOTIFY_ID.slice(-4)})`);
  }
  if (!SPOTIFY_SECRET) {
    fail('env.SPOTIFY_CLIENT_SECRET', 'missing', 'add to Render env vars');
  } else {
    pass('env.SPOTIFY_CLIENT_SECRET', 'set (hidden)');
  }
  if (!STEEL_KEY) {
    fail('env.STEEL_API_KEY', 'missing', 'add to Render env vars');
  } else {
    pass('env.STEEL_API_KEY', `set (${STEEL_KEY.slice(0, 8)}…${STEEL_KEY.slice(-4)})`);
  }

  // 9. Spotify Client Credentials token exchange — proves Spotify creds actually work
  if (SPOTIFY_ID && SPOTIFY_SECRET) {
    try {
      const basicAuth = Buffer.from(`${SPOTIFY_ID}:${SPOTIFY_SECRET}`).toString('base64');
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
        signal: ctrl.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        fail(
          'spotify.token_exchange',
          `HTTP ${res.status}: ${errText.slice(0, 200)}`,
          'creds rejected by Spotify — check Client ID/Secret are correct and from the same app'
        );
      } else {
        const body = (await res.json()) as { access_token?: string; expires_in?: number };
        if (body.access_token) {
          pass('spotify.token_exchange', `OK · token expires in ${body.expires_in}s`);
        } else {
          fail('spotify.token_exchange', 'no access_token in response body');
        }
      }
    } catch (err) {
      fail('spotify.token_exchange', err, 'network or timeout reaching accounts.spotify.com');
    }
  }

  // 10. Build info
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
