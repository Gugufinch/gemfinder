// app/api/ar/admin/snapshots/route.ts
//
// GET: list snapshot metadata (snapshotId, createdAt, reason, projectCount)
// for the most recent N snapshots (default 25, max 50). Existing
// /api/ar/projects endpoint also includes snapshots but caps at 5 for the
// initial-load payload — this endpoint is the bigger view for the admin
// snapshot browser.
//
// Admin-only. Read-only.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserById } from '@/lib/gemfinder/auth-store';
import { listWorkspaceProjectSnapshots } from '@/lib/gemfinder/project-store';
import { getSessionUserId } from '@/lib/gemfinder/session';

export async function GET(req: NextRequest) {
  const userId = getSessionUserId(req);
  const actor = userId ? await getAuthUserById(userId) : null;
  if (!actor || !actor.active) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (actor.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  // Cap at 50 to keep payloads small even if the admin opens the modal
  // hourly. Default 25 matches the SNAPSHOT_LIMIT retention in the store.
  const limitParam = req.nextUrl.searchParams.get('limit');
  const limit = Math.max(1, Math.min(50, parseInt(limitParam || '25', 10) || 25));

  try {
    const snapshots = await listWorkspaceProjectSnapshots(limit);
    return NextResponse.json({ ok: true, snapshots });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[SNAPSHOTS_LIST] failed:', err);
    return NextResponse.json({ error: `Snapshot list failed: ${msg}` }, { status: 500 });
  }
}
