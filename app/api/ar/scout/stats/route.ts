import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserById } from '@/lib/gemfinder/auth-store';
import { listWorkspaceProjects } from '@/lib/gemfinder/project-store';
import { ensureSchema, getStats } from '@/lib/gemfinder/scout-candidate-store';

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

async function requireScoutV3Flag(workspaceId: string): Promise<boolean> {
  try {
    const projects = await listWorkspaceProjects();
    const proj = (projects as Array<Record<string, unknown>>).find((p) => p.id === workspaceId);
    const settings = (proj?.settings as Record<string, unknown>) || {};
    const flags = (settings.featureFlags as Record<string, unknown>) || {};
    return flags.scoutV3 !== false;
  } catch (err) {
    console.warn('[SCOUT_HUNT] feature-flag check failed:', err);
    return true;
  }
}

export async function GET(req: NextRequest) {
  const { actor, response } = await requireEditorActor(req);
  if (response || !actor) return response;

  const workspaceId = req.nextUrl.searchParams.get('workspaceId');
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

  if (!(await requireScoutV3Flag(workspaceId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    await ensureSchema();
    const stats = await getStats(workspaceId);
    return NextResponse.json({ ok: true, stats });
  } catch (err) {
    console.error('[SCOUT_HUNT] stats failed:', err);
    return NextResponse.json({ error: 'Failed to load stats' }, { status: 500 });
  }
}
