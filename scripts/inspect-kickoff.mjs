#!/usr/bin/env node
// READ-ONLY diagnostic: is the Kickoff project's artist/contact data present in
// the live workspace state, and what do the snapshots show? No writes.

import pg from 'pg';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.error('Set DATABASE_URL'); process.exit(1); }

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

const artistsOf = (p) => Array.isArray(p?.artists) ? p.artists : [];
const nameOf = (p) => String(p?.name ?? p?.n ?? p?.id ?? '(unnamed)');

const run = async () => {
  await client.connect();

  // ── Live workspace state ──────────────────────────────────────────────
  const live = await client.query(
    "select value, updated_at from gemfinder_workspace_state where state_key = 'workspace_projects' limit 1",
  );
  if (!live.rows.length) {
    console.log('!! NO live workspace_projects row at all.');
  } else {
    const val = live.rows[0].value;
    const projects = Array.isArray(val?.projects) ? val.projects : [];
    console.log(`LIVE workspace_projects  (updated_at=${live.rows[0].updated_at?.toISOString?.() ?? live.rows[0].updated_at})`);
    console.log(`  projects: ${projects.length}`);
    for (const p of projects) {
      const arts = artistsOf(p);
      const sample = arts.slice(0, 6).map(a => String(a?.n ?? a?.name ?? '?')).join(', ');
      console.log(`   • ${nameOf(p)}  (id=${p?.id})  artists=${arts.length}${sample ? `  [${sample}${arts.length > 6 ? ', …' : ''}]` : ''}`);
      // pipeline / notes presence (Dakota's notes lived here)
      const pipelineKeys = p?.pipeline ? Object.keys(p.pipeline).length : 0;
      const noteKeys = p?.notes ? Object.keys(p.notes).length : 0;
      if (pipelineKeys || noteKeys) console.log(`       pipeline entries=${pipelineKeys}, notes=${noteKeys}`);
    }
  }

  // ── Snapshot history (recovery source if live is short) ───────────────
  console.log('');
  const snaps = await client.query(
    `select snapshot_id, reason, created_at,
            jsonb_array_length(value->'projects') as project_count
       from gemfinder_workspace_snapshots
      where state_key = 'workspace_projects'
      order by created_at desc
      limit 12`,
  ).catch(e => ({ rows: [], err: e.message }));
  console.log(`SNAPSHOTS (most recent 12):`);
  if (!snaps.rows.length) console.log('  (none)');
  for (const s of snaps.rows) {
    console.log(`   ${s.created_at?.toISOString?.() ?? s.created_at}  projects=${s.project_count}  reason=${s.reason ?? ''}  id=${s.snapshot_id}`);
  }

  // For the most recent few snapshots, show the Kickoff artist count so we can
  // see whether a richer (more-artists) version exists to restore from.
  console.log('');
  const recent = await client.query(
    `select snapshot_id, created_at, value
       from gemfinder_workspace_snapshots
      where state_key = 'workspace_projects'
      order by created_at desc limit 5`,
  ).catch(() => ({ rows: [] }));
  console.log('SNAPSHOT artist-counts per project (most recent 5):');
  for (const s of recent.rows) {
    const projects = Array.isArray(s.value?.projects) ? s.value.projects : [];
    const summary = projects.map(p => `${nameOf(p)}:${artistsOf(p).length}`).join('  ');
    console.log(`   ${s.created_at?.toISOString?.() ?? s.created_at}  → ${summary || '(no projects)'}`);
  }
};

run().catch(e => { console.error('ERROR:', e.message); process.exit(1); }).finally(() => client.end().catch(() => {}));
