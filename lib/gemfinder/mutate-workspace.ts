// lib/gemfinder/mutate-workspace.ts
//
// Audit #5: extend etag protection beyond the user-facing project PUT.
//
// THE BUG: three server-side flows (approve, Songfinch webhook, Hunter
// weights) each did the naive
//
//   const projects = await listWorkspaceProjects();
//   /* mutate one in memory */
//   await saveWorkspaceProjects(projects);
//
// pattern. If two of these flows raced — e.g. Dakota approves candidate A
// while Brad approves candidate B in the same workspace — both read the
// same baseline state, both mutate their own copy in memory, and whichever
// `saveWorkspaceProjects` lands last silently overwrites the other. The
// first approve looks fine to its requester (status 200), but the artist
// they added to Kickoff is gone.
//
// THE FIX: this helper. It does the full read-mutate-save round-trip with
// an etag (compare-and-swap on `updated_at`). If the etag is stale at
// save time, it RE-READS the latest state and RE-APPLIES the mutator
// against the fresh data. Both writers' intents survive.
//
// Why retry instead of returning 409: the user-facing project PUT does
// surface 409 because the user is in a UI that can show the conflict and
// reload. These three flows are server-side — the caller's intent is
// well-defined ("approve this candidate", "process this webhook event")
// and there's no human in the loop to disambiguate. Retry is correct.

import {
  listWorkspaceProjectsWithEtag,
  saveWorkspaceProjects,
  WorkspaceEtagConflictError,
} from './project-store';

const DEFAULT_MAX_RETRIES = 5;

/**
 * Mutate workspace projects atomically with etag-based optimistic locking
 * and automatic retry on conflict.
 *
 * @param mutator  Callback that mutates the projects array in place (or
 *                 pushes/splices) AND optionally returns metadata the caller
 *                 wants threaded through. Called fresh on every attempt — do
 *                 NOT capture stale data from the outer scope.
 * @param opts     `reason` is forwarded to saveWorkspaceProjects for the
 *                 snapshot log. `maxRetries` caps how many conflict retries
 *                 we attempt before bubbling — default 5, more than enough
 *                 for the realistic contention level (a few near-simultaneous
 *                 approves), but bounded so a permanently-contended workspace
 *                 surfaces as a real error instead of looping forever.
 */
export async function mutateWorkspaceProjects<T>(
  mutator: (projects: unknown[]) => T | Promise<T>,
  opts?: { reason?: string; maxRetries?: number },
): Promise<{ etag: string | null; result: T }> {
  const maxRetries = opts?.maxRetries ?? DEFAULT_MAX_RETRIES;
  let lastConflict: WorkspaceEtagConflictError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const { projects, etag } = await listWorkspaceProjectsWithEtag();

    // Run the mutator each attempt. Critical: this means the mutator must
    // be idempotent enough that re-applying it against a fresh state is
    // safe. For the audit's three callers — "add talent to kickoff",
    // "stamp webhook state", "set hunterWeights" — re-applying against
    // fresh data produces the right result, because each carries its own
    // identifying key (talentId / event_id / workspaceId).
    const result = await mutator(projects);

    try {
      const { etag: newEtag } = await saveWorkspaceProjects(projects, {
        reason: opts?.reason,
        expectedEtag: etag,
      });
      return { etag: newEtag, result };
    } catch (err) {
      if (err instanceof WorkspaceEtagConflictError) {
        lastConflict = err;
        // Loop back to re-read the latest state and re-apply the mutator.
        continue;
      }
      throw err;
    }
  }

  // Retry budget exhausted. Surface the last conflict so monitoring can
  // see the workspace is permanently contended.
  throw new Error(
    `mutateWorkspaceProjects: exceeded ${maxRetries} retries due to repeated etag conflicts. ` +
    `Last currentEtag=${lastConflict?.currentEtag ?? 'unknown'}.`,
  );
}
