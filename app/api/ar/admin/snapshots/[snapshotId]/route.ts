// app/api/ar/admin/snapshots/[snapshotId]/route.ts
//
// GET: return a single snapshot's full payload (the entire projects JSONB
// blob), for admin recovery / inspection workflows.
//
// This is the endpoint Greg uses to recover Dakota's overwritten notes:
//   1. GET /api/ar/admin/snapshots (lists 25 recent with metadata only)
//   2. Pick one based on timestamp
//   3. GET /api/ar/admin/snapshots/<that-id> → full JSON, grep for notes
//
// Admin-only. Read-only.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserById } from '@/lib/gemfinder/auth-store';
import { getWorkspaceSnapshotById } from '@/lib/gemfinder/project-store';
import { getSessionUserId } from '@/lib/gemfinder/session';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ snapshotId: string }> },
) {
  const userId = getSessionUserId(req);
  const actor = userId ? await getAuthUserById(userId) : null;
  if (!actor || !actor.active) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (actor.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { snapshotId } = await ctx.params;
  if (!snapshotId) {
    return NextResponse.json({ error: 'snapshotId is required' }, { status: 400 });
  }

  try {
    const snapshot = await getWorkspaceSnapshotById(snapshotId);
    if (!snapshot) {
      return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      snapshot,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[SNAPSHOT_GET] failed:', err);
    return NextResponse.json({ error: `Snapshot fetch failed: ${msg}` }, { status: 500 });
  }
}
