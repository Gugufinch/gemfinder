// lib/gemfinder/mutate-workspace.test.ts
//
// Pins Audit #5's contract: the new mutateWorkspaceProjects helper must
//   - call the mutator with a fresh read of the latest state
//   - save with the matching etag (compare-and-swap)
//   - retry on WorkspaceEtagConflictError (not surface 409 to the caller —
//     these are server-side flows where the caller's intent is well-defined)
//   - re-call the mutator on retry with the NEW state, so the mutation is
//     re-applied against current data (not the stale data it just lost the
//     race against)
//   - propagate non-conflict errors verbatim
//   - cap retries so a permanently-contended row eventually surfaces

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Force-mock the underlying I/O so we can drive races deterministically.
vi.mock('@/lib/gemfinder/project-store', async () => {
  const actual = await vi.importActual<typeof import('@/lib/gemfinder/project-store')>(
    '@/lib/gemfinder/project-store',
  );
  return {
    ...actual,
    listWorkspaceProjectsWithEtag: vi.fn(),
    saveWorkspaceProjects: vi.fn(),
  };
});

import { mutateWorkspaceProjects } from './mutate-workspace';
import {
  listWorkspaceProjectsWithEtag,
  saveWorkspaceProjects,
  WorkspaceEtagConflictError,
} from '@/lib/gemfinder/project-store';

const list = vi.mocked(listWorkspaceProjectsWithEtag);
const save = vi.mocked(saveWorkspaceProjects);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('mutateWorkspaceProjects — happy path', () => {
  it('reads with etag, calls mutator, saves with same etag, returns new etag + mutator result', async () => {
    list.mockResolvedValueOnce({ projects: [{ id: 'a' }], etag: 'v1' });
    save.mockResolvedValueOnce({ etag: 'v2' });

    const out = await mutateWorkspaceProjects((projects) => {
      (projects[0] as Record<string, unknown>).name = 'updated';
      return { didWhat: 'updated a' };
    });

    expect(out.etag).toBe('v2');
    expect(out.result).toEqual({ didWhat: 'updated a' });
    expect(save).toHaveBeenCalledWith(
      [{ id: 'a', name: 'updated' }],
      expect.objectContaining({ expectedEtag: 'v1' }),
    );
  });

  it('supports an async mutator (mutator may need to query other systems)', async () => {
    list.mockResolvedValueOnce({ projects: [], etag: 'v1' });
    save.mockResolvedValueOnce({ etag: 'v2' });

    const out = await mutateWorkspaceProjects(async (projects) => {
      await Promise.resolve();
      projects.push({ id: 'new', name: 'added async' });
      return 'done';
    });

    expect(out.result).toBe('done');
    expect(save).toHaveBeenCalledWith(
      [{ id: 'new', name: 'added async' }],
      expect.objectContaining({ expectedEtag: 'v1' }),
    );
  });

  it('passes opts.reason through to saveWorkspaceProjects', async () => {
    list.mockResolvedValueOnce({ projects: [], etag: 'v1' });
    save.mockResolvedValueOnce({ etag: 'v2' });

    await mutateWorkspaceProjects(() => null, { reason: 'songfinch_webhook:abc' });

    expect(save).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ reason: 'songfinch_webhook:abc' }),
    );
  });
});

describe('mutateWorkspaceProjects — retry on etag conflict', () => {
  it('retries on WorkspaceEtagConflictError with the FRESH read + RE-APPLIES the mutator', async () => {
    // Attempt 1: read v1, save fails with conflict (current is v2).
    // Attempt 2: read v2 (fresh), save succeeds → v3.
    // The mutator must be CALLED AGAIN on the fresh state — otherwise we'd
    // overwrite the concurrent writer's changes with stale data.
    list
      .mockResolvedValueOnce({ projects: [{ id: 'a', count: 0 }], etag: 'v1' })
      .mockResolvedValueOnce({ projects: [{ id: 'a', count: 5 }], etag: 'v2' });  // concurrent writer bumped count to 5
    save
      .mockRejectedValueOnce(new WorkspaceEtagConflictError('v2', [{ id: 'a', count: 5 }]))
      .mockResolvedValueOnce({ etag: 'v3' });

    const mutator = vi.fn((projects) => {
      const proj = projects[0] as Record<string, number>;
      proj.count = proj.count + 1;
      return proj.count;
    });

    const out = await mutateWorkspaceProjects(mutator);

    expect(mutator).toHaveBeenCalledTimes(2);  // called once per attempt
    expect(out.result).toBe(6);  // 5 (concurrent) + 1 (this writer)
    expect(out.etag).toBe('v3');
    // Verify the final save included BOTH the concurrent writer's bump AND ours
    expect(save).toHaveBeenLastCalledWith(
      [{ id: 'a', count: 6 }],
      expect.objectContaining({ expectedEtag: 'v2' }),
    );
  });

  it('eventually throws when retries are exhausted (caps so permanent contention surfaces)', async () => {
    // Always-conflict scenario.
    list.mockResolvedValue({ projects: [], etag: 'v1' });
    save.mockRejectedValue(new WorkspaceEtagConflictError('v2', []));

    await expect(
      mutateWorkspaceProjects(() => null, { maxRetries: 2 }),
    ).rejects.toThrow(/exceeded.*retries|conflict/i);

    // maxRetries=2 → 1 initial attempt + 2 retries = 3 save attempts total
    expect(save).toHaveBeenCalledTimes(3);
  });

  it('default retry budget is finite (does not loop forever)', async () => {
    list.mockResolvedValue({ projects: [], etag: 'v1' });
    save.mockRejectedValue(new WorkspaceEtagConflictError('v2', []));

    await expect(mutateWorkspaceProjects(() => null)).rejects.toThrow();
    expect(save.mock.calls.length).toBeLessThanOrEqual(20);  // sanity cap
    expect(save.mock.calls.length).toBeGreaterThan(1);
  });
});

describe('mutateWorkspaceProjects — error propagation', () => {
  it('non-conflict errors from save are thrown verbatim, no retry', async () => {
    list.mockResolvedValueOnce({ projects: [], etag: 'v1' });
    const pgDown = new Error('connection terminated unexpectedly');
    save.mockRejectedValueOnce(pgDown);

    await expect(mutateWorkspaceProjects(() => null)).rejects.toThrow(pgDown);
    expect(save).toHaveBeenCalledTimes(1);  // no retry on non-conflict
  });

  it('errors from list are thrown verbatim, no retry', async () => {
    const pgDown = new Error('cannot acquire connection');
    list.mockRejectedValueOnce(pgDown);

    await expect(mutateWorkspaceProjects(() => null)).rejects.toThrow(pgDown);
    expect(save).not.toHaveBeenCalled();
  });

  it('errors from the mutator are thrown verbatim, no retry, no save', async () => {
    list.mockResolvedValueOnce({ projects: [], etag: 'v1' });

    await expect(
      mutateWorkspaceProjects(() => { throw new Error('mutator failed'); }),
    ).rejects.toThrow('mutator failed');
    expect(save).not.toHaveBeenCalled();
  });
});
