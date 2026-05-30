// app/api/ar/scout/hunter/run/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserById } from '@/lib/gemfinder/auth-store';
import { getRun, sweepStaleRuns, deleteRun } from '@/lib/gemfinder/hunter-runs-store';
import { listCandidatesByHunterRun } from '@/lib/gemfinder/scout-candidate-store';
import { getSessionUserId } from '@/lib/gemfinder/session';
import { isScoutV3Enabled } from '@/lib/gemfinder/feature-flags';

// Inline auth helper — duplicated per existing scout route convention.
async function requireEditorActor(req: NextRequest) {
  const userId = getSessionUserId(req);
  const actor = userId ? await getAuthUserById(userId) : null;
  if (!actor || !actor.active) {
    return { actor: null, response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  }
  if (actor.role === 'viewer') {
    return { actor: null, response: NextResponse.json({ error: 'Editor or admin role required' }, { status: 403 }) };
  }
  return { actor, response: null };
}

// Inline feature flag helper — also duplicated by convention.
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { actor, response } = await requireEditorActor(req);
  if (response || !actor) return response;

  const workspaceId = req.nextUrl.searchParams.get('workspaceId');
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId query param is required' }, { status: 400 });
  }
  if (!(await isScoutV3Enabled(workspaceId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { id: runId } = await ctx.params;
  if (!runId) {
    return NextResponse.json({ error: 'Run id is required' }, { status: 400 });
  }

  // Defensive: sweep stale runs before fetch, so polling clients see the
  // transition without waiting for the next cron tick. Failures don't block.
  await sweepStaleRuns().catch((err) => console.warn('[HUNTER_RUN_DETAIL] sweepStaleRuns failed:', err));

  const run = await getRun(runId);
  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }
  // Workspace isolation: a user from workspace A must not see workspace B's run.
  if (run.workspaceId !== workspaceId) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }

  // Inline the candidates this run produced so the UI can render them in the
  // run detail panel without a second round-trip. Failures degrade gracefully
  // (empty array) — operator can still see the run summary even if the
  // candidate fetch fails.
  let addedCandidates: Awaited<ReturnType<typeof listCandidatesByHunterRun>> = [];
  try {
    addedCandidates = await listCandidatesByHunterRun(workspaceId, runId);
  } catch (err) {
    console.warn('[HUNTER_RUN_DETAIL] listCandidatesByHunterRun failed:', err);
  }

  return NextResponse.json({ ok: true, run, addedCandidates });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { actor, response } = await requireEditorActor(req);
  if (response || !actor) return response;

  const workspaceId = req.nextUrl.searchParams.get('workspaceId');
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId query param is required' }, { status: 400 });
  }
  if (!(await isScoutV3Enabled(workspaceId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { id: runId } = await ctx.params;
  if (!runId) {
    return NextResponse.json({ error: 'Run id is required' }, { status: 400 });
  }

  // deleteRun is workspace-scoped — returns false if the run doesn't exist
  // OR belongs to a different workspace. Both cases collapse to 404 to
  // avoid leaking existence info across workspaces.
  const deleted = await deleteRun(runId, workspaceId);
  if (!deleted) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
