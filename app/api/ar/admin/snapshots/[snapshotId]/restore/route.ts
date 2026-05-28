// app/api/ar/admin/snapshots/[snapshotId]/restore/route.ts
//
// POST: write a snapshot back as the live workspace state. Used to recover
// from concurrent-write data loss (e.g., Dakota's overwritten Kickoff notes)
// before the etag enforcement was live, or to roll back accidental admin
// actions.
//
// Reversibility: restoreWorkspaceSnapshot internally captures a
// "before_restore" snapshot of the current state first, so a wrong restore
// can be undone by restoring THAT snapshot in turn. No data is destroyed.
//
// Admin-only. Stateful (writes).

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserById } from '@/lib/gemfinder/auth-store';
import { restoreWorkspaceSnapshot } from '@/lib/gemfinder/project-store';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ snapshotId: string }> },
) {
  const userId = req.cookies.get('ar_user')?.value || '';
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
    // Tag the reason with the actor's email so the audit trail in
    // gemfinder_workspace_snapshots tells us not just WHEN but WHO restored.
    const result = await restoreWorkspaceSnapshot(snapshotId, {
      reason: `restore_from:${snapshotId}:by:${actor.email}`,
    });
    console.log('[SNAPSHOT_RESTORE]', {
      snapshotId,
      actor: actor.email,
      restoredProjectCount: result.restoredProjectCount,
    });
    return NextResponse.json({
      ok: true,
      etag: result.etag,
      restoredProjectCount: result.restoredProjectCount,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[SNAPSHOT_RESTORE] failed:', err);
    // 404-ish if the snapshot didn't exist; 500 otherwise.
    const status = msg.startsWith('Snapshot not found') ? 404 : 500;
    return NextResponse.json({ error: `Snapshot restore failed: ${msg}` }, { status });
  }
}
