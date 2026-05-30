// lib/gemfinder/feature-flags.test.ts
//
// Pins Audit #4's contract: the feature-flag cache must
//   - hit memory after first read (kills the 15-routes-×-workspace-read hotspot)
//   - coalesce concurrent misses (no stampede when TTL just expired)
//   - refetch after TTL
//   - fail OPEN on backend errors (Scout V3 should keep serving traffic if
//     we briefly can't read pg)

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isScoutV3Enabled,
  __resetFeatureFlagCache,
  __setFeatureFlagFetcher,
} from './feature-flags';

beforeEach(() => {
  __resetFeatureFlagCache();
});

describe('isScoutV3Enabled — caching contract', () => {
  it('first call hits backend, second call within TTL hits cache (no second backend call)', async () => {
    const fetcher = vi.fn(async () => true);
    __setFeatureFlagFetcher(fetcher);

    expect(await isScoutV3Enabled('ws_1')).toBe(true);
    expect(await isScoutV3Enabled('ws_1')).toBe(true);
    expect(await isScoutV3Enabled('ws_1')).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('different workspaces get separate cache entries', async () => {
    const fetcher = vi.fn(async (ws: string) => ws === 'ws_a');
    __setFeatureFlagFetcher(fetcher);

    expect(await isScoutV3Enabled('ws_a')).toBe(true);
    expect(await isScoutV3Enabled('ws_b')).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(await isScoutV3Enabled('ws_a')).toBe(true);
    expect(await isScoutV3Enabled('ws_b')).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);  // both still cached
  });

  it('cache stores the EXACT value the backend returned, not "true if truthy"', async () => {
    // Regression guard: at one point the rewrite stored `Boolean(v)` and
    // accidentally coerced undefined → false. Keep the literal contract.
    const fetcher = vi.fn(async () => false);
    __setFeatureFlagFetcher(fetcher);

    expect(await isScoutV3Enabled('ws_off')).toBe(false);
    expect(await isScoutV3Enabled('ws_off')).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('isScoutV3Enabled — TTL', () => {
  it('refetches after TTL expires', async () => {
    vi.useFakeTimers();
    try {
      let counter = 0;
      const fetcher = vi.fn(async () => {
        counter += 1;
        return counter <= 1;  // first call: true; second call: false
      });
      __setFeatureFlagFetcher(fetcher);

      expect(await isScoutV3Enabled('ws_1')).toBe(true);
      vi.advanceTimersByTime(2_000);  // still in TTL
      expect(await isScoutV3Enabled('ws_1')).toBe(true);
      expect(fetcher).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(10_000);  // past 5s TTL
      expect(await isScoutV3Enabled('ws_1')).toBe(false);
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('isScoutV3Enabled — request coalescing', () => {
  it('concurrent callers during a single miss share ONE in-flight fetch', async () => {
    let resolveFetch!: (v: boolean) => void;
    const fetcher = vi.fn(async () => {
      return await new Promise<boolean>((r) => { resolveFetch = r; });
    });
    __setFeatureFlagFetcher(fetcher);

    // Kick off 5 concurrent calls. All should observe the same pending
    // fetch and share its eventual result. Without coalescing, this is the
    // stampede scenario the audit is closing.
    const p1 = isScoutV3Enabled('ws_1');
    const p2 = isScoutV3Enabled('ws_1');
    const p3 = isScoutV3Enabled('ws_1');
    const p4 = isScoutV3Enabled('ws_1');
    const p5 = isScoutV3Enabled('ws_1');

    // Resolve the single in-flight fetch.
    resolveFetch(true);
    const results = await Promise.all([p1, p2, p3, p4, p5]);

    expect(results).toEqual([true, true, true, true, true]);
    expect(fetcher).toHaveBeenCalledTimes(1);  // single backend hit, 5 readers served
  });

  it('after the in-flight fetch resolves, subsequent calls still hit cache (not refetch)', async () => {
    const fetcher = vi.fn(async () => true);
    __setFeatureFlagFetcher(fetcher);

    await Promise.all([
      isScoutV3Enabled('ws_1'),
      isScoutV3Enabled('ws_1'),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);

    await isScoutV3Enabled('ws_1');
    await isScoutV3Enabled('ws_1');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('isScoutV3Enabled — fail-open on backend errors', () => {
  it('returns true when fetcher throws (preserve current "if check fails, assume on" semantic)', async () => {
    const fetcher = vi.fn(async () => { throw new Error('pg down'); });
    __setFeatureFlagFetcher(fetcher);

    expect(await isScoutV3Enabled('ws_1')).toBe(true);
  });

  it('does NOT cache errors — a throw, then a recovered backend, returns the real value', async () => {
    let throwOnce = true;
    const fetcher = vi.fn(async () => {
      if (throwOnce) { throwOnce = false; throw new Error('transient'); }
      return false;
    });
    __setFeatureFlagFetcher(fetcher);

    expect(await isScoutV3Enabled('ws_1')).toBe(true);  // fail-open
    expect(await isScoutV3Enabled('ws_1')).toBe(false); // recovered, real value
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
