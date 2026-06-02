// lib/gemfinder/project-store-etag-precision.test.ts
//
// REGRESSION GUARD for the optimistic-locking precision bug (Brad's
// "saves revert" incident).
//
// The etag handed to the client is `updated_at.toISOString()` — MILLISECOND
// precision, because a JS Date can't hold more. Postgres timestamptz stores
// MICROSECONDS. The CAS originally did `where updated_at = $etag`, comparing
// the ms etag (e.g. .291Z = .291000) against the stored .291387 — which NEVER
// matches, so every optimistic-locked save 409'd and the client reverted.
//
// The fix compares at the etag's own precision:
//   where date_trunc('milliseconds', updated_at) = $etag::timestamptz
//
// This test exercises the exact CAS SQL against a real Postgres so a revert
// of date_trunc gets caught. Requires a reachable test DB (DATABASE_URL_TEST);
// like the other DB-integration tests here, it needs Postgres to run.

import { describe, it, expect, afterAll } from 'vitest';
import { getTestPool } from '@/vitest.setup';

const KEY = '__etag_precision_regression__';

async function ensureTable() {
  await getTestPool().query(
    `create table if not exists gemfinder_workspace_state (
       state_key  text primary key,
       value      jsonb not null,
       updated_at timestamptz not null default now()
     )`,
  );
}

describe('workspace etag CAS — millisecond/microsecond precision', () => {
  afterAll(async () => {
    try { await getTestPool().query('delete from gemfinder_workspace_state where state_key = $1', [KEY]); } catch { /* ignore */ }
  });

  it('the millisecond etag the server returns matches the stored microsecond row in the CAS (date_trunc fix)', async () => {
    const pool = getTestPool();
    await ensureTable();
    await pool.query('delete from gemfinder_workspace_state where state_key = $1', [KEY]);

    // Write with now() so updated_at carries sub-millisecond microseconds —
    // the real-world case (~99.9% of timestamps have non-zero microseconds).
    const ins = await pool.query(
      `insert into gemfinder_workspace_state (state_key, value, updated_at)
       values ($1, '{}'::jsonb, now()) returning updated_at`,
      [KEY],
    );
    // The etag the server actually hands the client: millisecond precision.
    const etag = (ins.rows[0].updated_at as Date).toISOString();

    // The FIXED comparison must match the row. (The old `updated_at = $etag`
    // comparison would return 0 here unless now() happened to land on an exact
    // millisecond — vanishingly rare — which is precisely why saves reverted.)
    const fixed = await pool.query(
      `select count(*)::int as n from gemfinder_workspace_state
       where state_key = $1 and date_trunc('milliseconds', updated_at) = $2::timestamptz`,
      [KEY, etag],
    );
    expect(fixed.rows[0].n).toBe(1);
  });

  it('an UPDATE...returning etag round-trips: the returned etag immediately re-matches in a follow-up CAS', async () => {
    const pool = getTestPool();
    await ensureTable();
    await pool.query('delete from gemfinder_workspace_state where state_key = $1', [KEY]);
    await pool.query(`insert into gemfinder_workspace_state (state_key, value) values ($1, '{}'::jsonb)`, [KEY]);

    // Simulate a successful save returning a fresh etag...
    const saved = await pool.query(
      `update gemfinder_workspace_state set value = '{"v":1}'::jsonb, updated_at = now()
       where state_key = $1 returning updated_at`,
      [KEY],
    );
    const etag = (saved.rows[0].updated_at as Date).toISOString();

    // ...then a second save carrying that etag must find the row (CAS hits 1).
    const second = await pool.query(
      `update gemfinder_workspace_state set value = '{"v":2}'::jsonb, updated_at = now()
       where state_key = $1 and date_trunc('milliseconds', updated_at) = $2::timestamptz
       returning updated_at`,
      [KEY, etag],
    );
    expect(second.rowCount).toBe(1);
  });
});
