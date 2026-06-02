#!/usr/bin/env node
// READ-ONLY: how often is the workspace state being written (= etag churn),
// and by whom? Snapshots are created before each save, so snapshot frequency
// ≈ write frequency ≈ how fast the optimistic-locking etag is invalidated.

import pg from 'pg';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const run = async () => {
  await client.connect();

  const live = await client.query(
    "select updated_at from gemfinder_workspace_state where state_key='workspace_projects' limit 1");
  console.log('LIVE state updated_at:', live.rows[0]?.updated_at?.toISOString?.() ?? live.rows[0]?.updated_at);

  const now = await client.query('select now() as now');
  console.log('DB now:           ', now.rows[0].now.toISOString());
  console.log('');

  // Write frequency by reason, last 2 hours
  const byReason = await client.query(`
    select coalesce(split_part(reason,':',1),'(none)') as writer,
           count(*)::int as writes,
           min(created_at) as first, max(created_at) as last
      from gemfinder_workspace_snapshots
     where state_key='workspace_projects' and created_at > now() - interval '2 hours'
     group by 1 order by 2 desc`);
  console.log('WRITES in last 2h by source:');
  if (!byReason.rows.length) console.log('  (none — workspace not written in last 2h)');
  for (const r of byReason.rows) {
    console.log(`  ${String(r.writer).padEnd(22)} ${String(r.writes).padStart(4)} writes   ${r.first.toISOString()} → ${r.last.toISOString()}`);
  }
  console.log('');

  // Most recent 20 writes with gaps
  const recent = await client.query(`
    select reason, created_at from gemfinder_workspace_snapshots
     where state_key='workspace_projects'
     order by created_at desc limit 20`);
  console.log('LAST 20 writes (newest first) — gap = seconds since previous:');
  let prev = null;
  for (const r of recent.rows) {
    const t = r.created_at;
    const gap = prev ? ((prev - t) / 1000).toFixed(1) + 's' : '—';
    console.log(`  ${t.toISOString()}  (+${gap})  ${r.reason ?? ''}`);
    prev = t;
  }
};
run().catch(e => { console.error('ERR:', e.message); process.exit(1); }).finally(() => client.end().catch(()=>{}));
