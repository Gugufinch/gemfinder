import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserById } from '@/lib/gemfinder/auth-store';
import { ensureSchema, listRejectionsByWorkspace } from '@/lib/gemfinder/scout-candidate-store';

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

export async function GET(req: NextRequest) {
  const { actor, response } = await requireEditorActor(req);
  if (response || !actor) return response;

  const workspaceId = req.nextUrl.searchParams.get('workspaceId');
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50', 10);
  const offset = parseInt(req.nextUrl.searchParams.get('offset') || '0', 10);

  try {
    await ensureSchema();
    const rejections = await listRejectionsByWorkspace(workspaceId, { limit, offset });
    return NextResponse.json({ ok: true, rejections });
  } catch (err) {
    console.error('[SCOUT_HUNT] list rejections failed:', err);
    return NextResponse.json({ error: 'Failed to list rejections' }, { status: 500 });
  }
}
