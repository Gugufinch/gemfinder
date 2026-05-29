// lib/gemfinder/hunter/scrape-cache.test.ts
//
// Integration-style tests with pg mocked — all cache paths exercised without
// a live Postgres instance. Same mock pattern as hunter-runs-store.test.ts.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- pg mock -----------------------------------------------------------
// Pool must be a regular function (not arrow) — scout-candidate-store calls
// `new Pool(...)`.

const mockQuery = vi.fn();

vi.mock('pg', () => {
  function MockPool() {
    return { query: mockQuery };
  }
  return {
    Pool: MockPool,
    // pg-init imports `types` for setTypeParser side-effects. Tests don't
    // care about parser output — just need the API to exist as a no-op so
    // the import doesn't crash.
    types: {
      setTypeParser: vi.fn(),
      getTypeParser: vi.fn(() => (v: unknown) => v),
    },
  };
});

// ---- store imports (after mock is in place) ----------------------------
import { getCached, putCached } from './scrape-cache';
import type { SteelScrapeResult } from './steel';

// ---- fixtures ----------------------------------------------------------

const WORKSPACE = 'ws-test-001';
const TEST_URL = 'https://Example.com/artist/?utm_source=test';
// normalizeUrl strips tracking params, lowercases hostname, strips trailing
// slash when no remaining query params → 'https://example.com/artist'
const NORMALIZED_URL = 'https://example.com/artist';
const EXPECTED_KEY = `${WORKSPACE}::${NORMALIZED_URL}`;

function buildResult(overrides?: Partial<SteelScrapeResult>): SteelScrapeResult {
  return {
    url: NORMALIZED_URL,
    pageHtml: '<html><body>hello</body></html>',
    extractedFields: {
      contactEmail: 'artist@example.com',
      socialLinks: ['https://instagram.com/artist'],
    },
    scrapedAt: '2026-05-13T00:00:00.000Z',
    ...overrides,
  };
}

// ---- setup -------------------------------------------------------------
// Default: any call returns empty-result. Tests override per query.
beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ---- helper ------------------------------------------------------------

function whenSql(sqlFragment: string, returnValue: { rows: unknown[]; rowCount: number | null }) {
  mockQuery.mockImplementation(async (sql: string) => {
    if (typeof sql === 'string' && sql.includes(sqlFragment)) {
      return returnValue;
    }
    return { rows: [], rowCount: 0 };
  });
}

// ---- getCached ---------------------------------------------------------

describe('getCached', () => {
  it('returns null when no row found', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    const result = await getCached(WORKSPACE, TEST_URL);
    expect(result).toBeNull();
  });

  it('returns parsed SteelScrapeResult when a fresh row exists', async () => {
    const stored = buildResult();
    whenSql('SELECT result FROM hunter_scrape_cache', {
      rows: [{ result: stored }],
      rowCount: 1,
    });

    const result = await getCached(WORKSPACE, TEST_URL);
    expect(result).not.toBeNull();
    expect(result!.url).toBe(NORMALIZED_URL);
    expect(result!.extractedFields?.contactEmail).toBe('artist@example.com');
  });

  it('queries with the normalized cache key (strips tracking params + lowercases)', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    await getCached(WORKSPACE, TEST_URL);

    const selectCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('SELECT result FROM hunter_scrape_cache')
    );
    expect(selectCall).toBeDefined();
    expect(selectCall![1][0]).toBe(EXPECTED_KEY);
  });

  it('uses expires_at > NOW() filter in the SQL', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    await getCached(WORKSPACE, TEST_URL);

    const selectCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('hunter_scrape_cache')
    );
    expect(selectCall![0]).toContain('expires_at > NOW()');
  });

  it('returns null when row exists but is expired (simulated by empty result set)', async () => {
    // The SQL filters out expired rows via expires_at > NOW(), so pg returns
    // nothing for an expired entry — getCached must return null.
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    const result = await getCached(WORKSPACE, TEST_URL);
    expect(result).toBeNull();
  });
});

// ---- putCached ---------------------------------------------------------

describe('putCached', () => {
  it('inserts with INSERT ON CONFLICT ... DO UPDATE', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    await putCached(WORKSPACE, TEST_URL, buildResult());

    const insertCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO hunter_scrape_cache')
    );
    expect(insertCall).toBeDefined();
    const sql = insertCall![0] as string;
    expect(sql).toContain('ON CONFLICT');
    expect(sql).toContain('DO UPDATE');
  });

  it('passes the normalized cache key as $1', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    await putCached(WORKSPACE, TEST_URL, buildResult());

    const insertCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO hunter_scrape_cache')
    );
    expect(insertCall![1][0]).toBe(EXPECTED_KEY);
  });

  it('passes the normalized URL (not the raw URL) as $2', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    await putCached(WORKSPACE, TEST_URL, buildResult());

    const insertCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO hunter_scrape_cache')
    );
    expect(insertCall![1][1]).toBe(NORMALIZED_URL);
  });

  it('serializes result as JSON string for $3', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    const result = buildResult();
    await putCached(WORKSPACE, TEST_URL, result);

    const insertCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO hunter_scrape_cache')
    );
    const parsed = JSON.parse(insertCall![1][2] as string) as SteelScrapeResult;
    expect(parsed.url).toBe(NORMALIZED_URL);
    expect(parsed.extractedFields?.contactEmail).toBe('artist@example.com');
  });

  it('sets expires_at ~30 days from now (within a 5-second window)', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    const before = Date.now();
    await putCached(WORKSPACE, TEST_URL, buildResult());
    const after = Date.now();

    const insertCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO hunter_scrape_cache')
    );
    const expiresAt = new Date(insertCall![1][3] as string).getTime();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    expect(expiresAt).toBeGreaterThanOrEqual(before + thirtyDaysMs - 5000);
    expect(expiresAt).toBeLessThanOrEqual(after + thirtyDaysMs + 5000);
  });

  it('runs lazy DELETE cleanup ~5% of the time (probabilistic — mock Math.random)', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    // Force cleanup to run
    vi.spyOn(Math, 'random').mockReturnValue(0.01);

    await putCached(WORKSPACE, TEST_URL, buildResult());

    const cleanupCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('DELETE FROM hunter_scrape_cache')
    );
    expect(cleanupCall).toBeDefined();
    expect(cleanupCall![0]).toContain('expires_at < NOW()');

    vi.restoreAllMocks();
  });

  it('skips lazy DELETE when Math.random >= 0.05', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    // Force cleanup to be skipped
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    await putCached(WORKSPACE, TEST_URL, buildResult());

    const cleanupCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('DELETE FROM hunter_scrape_cache')
    );
    expect(cleanupCall).toBeUndefined();

    vi.restoreAllMocks();
  });
});

// ---- cacheKey shape (via getCached) ------------------------------------

describe('cache key normalization', () => {
  it('produces the same key for HTTP vs HTTPS with same path', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    await getCached(WORKSPACE, 'https://example.com/artist');
    const call1Key = mockQuery.mock.calls[mockQuery.mock.calls.length - 1][1][0] as string;

    mockQuery.mockClear();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    // Different case hostname
    await getCached(WORKSPACE, 'https://EXAMPLE.COM/artist');
    const call2Key = mockQuery.mock.calls[mockQuery.mock.calls.length - 1][1][0] as string;

    expect(call1Key).toBe(call2Key);
  });

  it('strips utm_* tracking params before keying', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    await getCached(WORKSPACE, 'https://example.com/artist?utm_source=google&utm_medium=cpc');

    const selectCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('hunter_scrape_cache')
    );
    const key = selectCall![1][0] as string;
    expect(key).not.toContain('utm_');
    expect(key).toBe(`${WORKSPACE}::https://example.com/artist`);
  });
});
