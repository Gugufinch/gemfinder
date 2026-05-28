// lib/gemfinder/project-store-etag.test.ts
//
// Tests the etag concurrency-control surface added to fix the last-write-
// wins race that caused Dakota's saves to be silently overwritten. Focused
// on the contract surface (WorkspaceEtagConflictError shape, type signatures)
// rather than the SQL path — the SQL path requires a live Postgres and is
// covered by the existing integration tests in scout-candidate-store.test.ts.

import { describe, it, expect } from 'vitest';
import { WorkspaceEtagConflictError } from './project-store';

describe('WorkspaceEtagConflictError — the conflict error contract', () => {
  it('is an Error subclass so callers can catch it generically', () => {
    const e = new WorkspaceEtagConflictError('2026-05-26T12:00:00.000Z', []);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('WorkspaceEtagConflictError');
  });

  it('carries the current etag for the route to echo in the 409 response', () => {
    const e = new WorkspaceEtagConflictError('2026-05-26T12:00:00.000Z', []);
    expect(e.currentEtag).toBe('2026-05-26T12:00:00.000Z');
  });

  it('carries the current projects so the client can reload without a separate GET', () => {
    const currentProjects = [{ id: 'p1', name: 'Songfinch (latest)' }];
    const e = new WorkspaceEtagConflictError('2026-05-26T12:00:00.000Z', currentProjects);
    expect(e.currentProjects).toEqual(currentProjects);
  });

  it('has the isConflict flag for narrowed catch logic in the route handler', () => {
    const e = new WorkspaceEtagConflictError(null, []);
    expect(e.isConflict).toBe(true);
  });

  it('accepts null currentEtag for the "row does not exist yet" edge case', () => {
    // First-ever save: there's no prior state for the etag to anchor against.
    // The conflict path still has to construct cleanly even if no etag exists.
    const e = new WorkspaceEtagConflictError(null, []);
    expect(e.currentEtag).toBeNull();
  });

  it('provides a human-readable error message for the toast', () => {
    const e = new WorkspaceEtagConflictError('2026-05-26T12:00:00.000Z', []);
    expect(e.message).toContain('changed since this client loaded it');
  });
});

describe('etag concurrency design invariants', () => {
  it('🐛 BUG FIX SCENARIO: documents the race the etag system prevents', () => {
    // This test exists to document the failure mode in case future refactors
    // accidentally drop the optimistic-locking check. The scenario:
    //
    //   T1: Dakota loads workspace state. Server returns etag=A.
    //   T2: Greg loads workspace state. Server also returns etag=A.
    //   T3: Dakota saves changes. PUT carries if-match=A.
    //       Server compares: A === A → updates, returns new etag=B.
    //   T4: Greg saves DIFFERENT changes. PUT still carries if-match=A
    //       (Greg's client hasn't received B because he hasn't refreshed).
    //       Server compares: A === B? No → throws WorkspaceEtagConflictError.
    //       Greg's client receives 409 with currentProjects + currentEtag=B,
    //       reloads, shows toast, Greg reapplies his changes.
    //
    // Without the etag system, T4 would silently overwrite T3, exactly as
    // happened to Dakota.
    //
    // The error class's existence + shape IS the documentation of this
    // contract. If a future refactor removes WorkspaceEtagConflictError,
    // this test breaks, alerting the maintainer.
    const conflict = new WorkspaceEtagConflictError('B', [{ id: 'p1' }]);
    expect(conflict).toBeInstanceOf(WorkspaceEtagConflictError);
    expect(conflict.currentEtag).toBe('B');
    expect(conflict.currentProjects).toHaveLength(1);
  });
});
