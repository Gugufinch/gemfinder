// app/api/ar/scout/hunter/run/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserById } from '@/lib/gemfinder/auth-store';
import { listWorkspaceProjects } from '@/lib/gemfinder/project-store';
import { getRun, sweepStaleRuns } from '@/lib/gemfinder/hunter-runs-store';

// Inline auth helper — duplicated per existing scout route convention.
async function requireEditorActor(req: NextRequest) {
  const userId = req.cookies.get('ar_user')?.value || '';
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
async function requireScoutV3Flag(workspaceId: string): Promise<boolean> {
  try {
    const projects = await listWorkspaceProjects();
    const proj = (projects as Array<Record<string, unknown>>).find((p) => p.id === workspaceId);
    const settings = (proj?.settings as Record<string, unknown>) || {};
    const flags = (settings.featureFlags as Record<string, unknown>) || {};
    return flags.scoutV3 !== false;
  } catch (err) {
    console.warn('[HUNTER_RUN_DETAIL] feature-flag check failed:', err);
    return true;  // fail open — auth still required
  }
}

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
  if (!(await requireScoutV3Flag(workspaceId))) {
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

  return NextResponse.json({ ok: true, run });
}
