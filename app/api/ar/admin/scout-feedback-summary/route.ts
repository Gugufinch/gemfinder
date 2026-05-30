// app/api/ar/admin/scout-feedback-summary/route.ts
//
// GET: aggregate operator approve/reject decisions per workspace. Phase 1 of
// the adaptive-weight-learning system — capture-only, no automated tuning.
//
// Tells the admin:
//   - How many decisions have been made (training data volume)
//   - Approval rate (the headline "is the agent finding good candidates" number)
//   - Average score of approved vs rejected candidates (calibration check —
//     if approved-avg < rejected-avg the score is anti-correlated with quality)
//   - Top rejection reasons (operator pain points)
//   - Per-dimension score averages split by outcome — surfaces which dims
//     correlate with approval (the seed signal for future weight tuning)
//
// Auth: admin role required. Read-only.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserById } from '@/lib/gemfinder/auth-store';
import { summarizeFeedback } from '@/lib/gemfinder/scout-candidate-store';
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

  const workspaceId = req.nextUrl.searchParams.get('workspaceId');
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId query param is required' }, { status: 400 });
  }

  try {
    const summary = await summarizeFeedback(workspaceId);

    // Compute a "dim correlation" insight: dims where approved-avg significantly
    // exceeds rejected-avg are the strongest approval signals; the reverse
    // suggests the dim is mis-weighted or anti-correlated. We surface this as
    // a sorted hint so admins see at a glance which dims to up-weight or
    // down-weight.
    const dimSignals: Array<{ dim: string; approvedAvg: number; rejectedAvg: number; delta: number }> = [];
    const allDims = new Set([
      ...Object.keys(summary.dimAveragesApproved),
      ...Object.keys(summary.dimAveragesRejected),
    ]);
    for (const dim of allDims) {
      const approvedAvg = summary.dimAveragesApproved[dim] ?? 0;
      const rejectedAvg = summary.dimAveragesRejected[dim] ?? 0;
      dimSignals.push({ dim, approvedAvg, rejectedAvg, delta: approvedAvg - rejectedAvg });
    }
    dimSignals.sort((a, b) => b.delta - a.delta);

    return NextResponse.json({
      ok: true,
      workspaceId,
      summary,
      dimSignals,
      interpretation: {
        // Plain-language interpretation hints. Helps the admin without
        // requiring statistical intuition.
        dataVolumeReady:
          summary.totalDecisions >= 30
            ? 'sufficient'
            : summary.totalDecisions >= 10
              ? 'minimal'
              : 'insufficient',
        scoreCalibration:
          summary.averageScoreApproved !== null && summary.averageScoreRejected !== null
            ? summary.averageScoreApproved > summary.averageScoreRejected + 5
              ? 'well-calibrated'
              : summary.averageScoreApproved < summary.averageScoreRejected - 5
                ? 'inverted'
                : 'weak'
            : 'insufficient_data',
        strongestPositiveDim: dimSignals[0]?.dim ?? null,
        strongestNegativeDim: dimSignals[dimSignals.length - 1]?.dim ?? null,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[FEEDBACK_SUMMARY] failed:', err);
    return NextResponse.json({ error: `Feedback summary failed: ${msg}` }, { status: 500 });
  }
}
