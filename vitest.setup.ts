import { afterAll, beforeAll } from 'vitest';
import { Pool, type PoolClient } from 'pg';

// Tests connect to DATABASE_URL_TEST (a dedicated test DB) — never production.
// Falls back to a default local pg URL if unset, so devs can run tests
// against their local pg without configuring env.

const TEST_DATABASE_URL =
  process.env.DATABASE_URL_TEST ||
  'postgres://postgres:postgres@localhost:5432/gemfinder_test';

let testPool: Pool | null = null;

export function getTestPool(): Pool {
  if (!testPool) {
    testPool = new Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
  }
  return testPool;
}

beforeAll(async () => {
  // Try to reach the test DB. If unreachable (no local pg installed),
  // log a warning but DON'T throw — non-DB tests should still be able to run.
  // Tests that actually require pg will fail with a clear error when they
  // try to query.
  try {
    const pool = getTestPool();
    await pool.query('select 1');
    // Ensure DATABASE_URL points at the test DB during test runs so the
    // production-code modules (which read DATABASE_URL) connect to the same
    // place as our test fixtures.
    process.env.DATABASE_URL = TEST_DATABASE_URL;
  } catch (err) {
    console.warn(
      `[TEST] Postgres test DB unreachable at ${TEST_DATABASE_URL}. ` +
      `Pure-JS tests will run; DB-dependent tests will fail. ` +
      `Set DATABASE_URL_TEST or start a local pg with a "gemfinder_test" database to enable.`,
      err instanceof Error ? err.message : err
    );
  }
});

afterAll(async () => {
  if (testPool) await testPool.end();
});

// Per-test transaction helper — tests can wrap their work in
// withTransaction(async (client) => { ... }) and the transaction is
// rolled back automatically, giving free test isolation.
//
// NOTE: withTransaction rolls back on the test pool. If a SUT uses its
// own pool (like scout-candidate-store via Pool() at module init), rolls
// won't propagate to that pool's writes. For those tests, use a
// truncate-beforeEach pattern instead.
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = getTestPool();
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    return result;
  } finally {
    await client.query('rollback').catch(err => console.warn('[TEST] rollback failed:', err));
    client.release();
  }
}
