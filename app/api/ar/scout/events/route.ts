// app/api/ar/scout/events/route.ts
//
// GET: list hunter activity events for the UI. Powers two views:
//   1. Per-candidate timeline — pass ?candidateId=X to see everything that
//      happened during the most-recent re-enrich (or hunter run that found
//      them). The Scout V3 candidate info modal polls this every 2 seconds
//      while a re-enrich is in flight.
//   2. Per-run streaming — pass ?runId=X for live progress of an ongoing
//      Hunter run. UI polls with ?since=<lastEventCreatedAt> for tail-style
//      append.
//
// Auth: any signed-in user (editor OR viewer) can read events. Read-only.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserById } from '@/lib/gemfinder/auth-store';
import { listWorkspaceProjects } from '@/lib/gemfinder/project-store';
import { listEvents } from '@/lib/gemfinder/scout-candidate-store';
import { getSessionUserId } from '@/lib/gemfinder/session';

async function requireActor(req: NextRequest) {
  const userId = getSessionUserId(req);
  const actor = userId ? await getAuthUserById(userId) : null;
  if (!actor || !actor.active) {
    return { actor: null, response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
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
    console.warn('[EVENTS] feature-flag check failed:', err);
    return true;
  }
}

export async function GET(req: NextRequest) {
  const { actor, response } = await requireActor(req);
  if (response || !actor) return response;

  const workspaceId = req.nextUrl.searchParams.get('workspaceId');
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId query param is required' }, { status: 400 });
  }
  if (!(await requireScoutV3Flag(workspaceId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const candidateId = req.nextUrl.searchParams.get('candidateId');
  const runId = req.nextUrl.searchParams.get('runId');
  const since = req.nextUrl.searchParams.get('since');
  const limitRaw = req.nextUrl.searchParams.get('limit');
  const limit = limitRaw ? parseInt(limitRaw, 10) : 100;

  // Sanity guard: callers must specify at least one filter dimension. Without
  // candidateId or runId, this would return ALL workspace events — useful for
  // an "everything that happened today" view we don't have yet. For now keep
  // strict so we don't accidentally hammer the DB.
  if (!candidateId && !runId) {
    return NextResponse.json(
      { error: 'either candidateId or runId is required' },
      { status: 400 },
    );
  }

  try {
    const events = await listEvents({
      workspaceId,
      candidateId,
      runId,
      since,
      limit,
    });
    return NextResponse.json({
      ok: true,
      events,
      count: events.length,
      // When the caller polled with `since`, also echo back the newest event's
      // timestamp so they can use it as the next `since` cursor. Saves a round
      // trip of "what was the last event I got?".
      newestAt: events.length > 0 ? events[events.length - 1].createdAt : null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[EVENTS] list failed:', err);
    return NextResponse.json({ error: `Events query failed: ${msg}` }, { status: 500 });
  }
}
