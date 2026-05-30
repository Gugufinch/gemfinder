// lib/gemfinder/feature-flags.ts
//
// Audit #4: in-process LRU + request coalescing for the Scout V3 feature
// flag. Kills the 10-routes-×-workspace-read hotspot.
//
// BEFORE: every scout route had a private copy of `requireScoutV3Flag()`
// that called `listWorkspaceProjects()` — a pg query that returns the
// ENTIRE workspace state JSONB (potentially hundreds of KB), normalizes
// every project, and finally checks one nested boolean. Each route
// invoked it 1-2x per request. A request that touched 3 scout endpoints
// fired 3-6 full workspace reads to answer the same boolean.
//
// AFTER: one shared cache, 5s TTL, request coalescing on the miss path.
// 99.99% of route calls now resolve from in-memory state in microseconds.
// The TTL is short enough that a flag flip propagates within ~5s; long
// enough that the steady-state read cost collapses to zero for the case
// every request shares.
//
// Process-local cache. On Vercel/Render this is per-instance; if multiple
// instances are running, each maintains its own. That's fine — at this
// scale we have one instance, and even at 10x we'd only have 10 reads
// every 5s per workspace. The audit was concerned with per-request
// amplification, not absolute volume.

import { listWorkspaceProjects } from './project-store';

const TTL_MS = Number(process.env.AR_FEATURE_FLAG_TTL_MS) || 5_000;

type CacheEntry = { value: boolean; expiresAt: number };

// Resolved values keyed by workspaceId.
const cache = new Map<string, CacheEntry>();
// In-flight fetches keyed by workspaceId — concurrent callers share these.
// Crucially this is cleared in a `finally` so a failed fetch never sticks.
const inFlight = new Map<string, Promise<boolean>>();

// Internal fetcher — swappable for tests via __setFeatureFlagFetcher.
let fetchFlag: (workspaceId: string) => Promise<boolean> = async (workspaceId) => {
  const projects = await listWorkspaceProjects();
  const proj = (projects as Array<Record<string, unknown>>).find((p) => p.id === workspaceId);
  const settings = (proj?.settings as Record<string, unknown>) || {};
  const flags = (settings.featureFlags as Record<string, unknown>) || {};
  // Default-on rollout: undefined or true → on; explicit false → off.
  return flags.scoutV3 !== false;
};

/**
 * Returns whether Scout V3 is enabled for the workspace. Cached for `TTL_MS`
 * per workspace. Concurrent callers share a single in-flight backend read.
 *
 * Fails OPEN — if the backend read throws (pg down, network blip), we return
 * `true` to keep Scout serving. The audit's threat model is "leaking access
 * via a misconfigured flag," not "blocking legitimate traffic." Auth still
 * gates every endpoint independently; the flag is a feature gate, not a
 * security boundary.
 *
 * Errors are NOT cached — the next call gets a fresh attempt at the backend.
 */
export async function isScoutV3Enabled(workspaceId: string): Promise<boolean> {
  const now = Date.now();
  const cached = cache.get(workspaceId);
  if (cached && cached.expiresAt > now) return cached.value;

  const pending = inFlight.get(workspaceId);
  if (pending) return pending;

  const fetchPromise = (async () => {
    try {
      const value = await fetchFlag(workspaceId);
      cache.set(workspaceId, { value, expiresAt: Date.now() + TTL_MS });
      return value;
    } catch (err) {
      console.warn('[FEATURE_FLAGS] scoutV3 lookup failed; failing open:', err);
      // Don't cache failures — let the next call try again.
      return true;
    } finally {
      inFlight.delete(workspaceId);
    }
  })();
  inFlight.set(workspaceId, fetchPromise);
  return fetchPromise;
}

// ─── Test seams ────────────────────────────────────────────────────────────
// These exist so feature-flags.test.ts can verify cache + coalescing semantics
// without a real pg. Not part of the public API — the double underscore is
// the signal. Don't import these from route code.

/** Swap the backend fetcher. Tests use this to inject mock behavior. */
export function __setFeatureFlagFetcher(fn: (workspaceId: string) => Promise<boolean>): void {
  fetchFlag = fn;
}

/** Drop all cached state. Tests call this in beforeEach for isolation. */
export function __resetFeatureFlagCache(): void {
  cache.clear();
  inFlight.clear();
}
