// app/api/ar/admin/team-users-audit/route.ts
//
// GET: audit every workspace project's teamUsers state against the baseline.
//
// Why this exists: when a workspace customizes its proj.teamUsers, the old
// UI used that array as a REPLACEMENT for DEFAULT_TEAM_USERS. If someone
// renamed a team member or partially edited the list, baseline names could
// silently drop (this is how Greg disappeared from the Songfinch Kickoff
// Owner filter). The augmented-roster fix shipped in 195bdbc makes the
// dropdown additive, but the underlying workspace data is still stale —
// admins should be able to see at a glance which workspaces are out of
// sync and choose to remediate.
//
// Response shape:
//   {
//     baseline: ["Greg", "Vinny", ...],
//     totalProjects: N,
//     customizedCount: N,
//     audits: [
//       {
//         projectId,
//         projectName,
//         hasCustomTeam: bool,
//         teamUsers: [...],          // stored array (null/empty → uses baseline)
//         missingFromBaseline: [...], // baseline names NOT in this workspace's array
//         extras: [...],              // names in this array NOT in baseline (custom specialists)
//         isOutOfSync: bool           // true iff missingFromBaseline.length > 0
//       },
//       ...
//     ]
//   }
//
// Auth: admin role required. Read-only.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserById } from '@/lib/gemfinder/auth-store';
import { listWorkspaceProjects } from '@/lib/gemfinder/project-store';
import { getSessionUserId } from '@/lib/gemfinder/session';

// MUST stay in sync with DEFAULT_TEAM_USERS in app/ar/GemFinderApp.jsx.
// If you add or remove names there, mirror it here. Worth a small risk of
// drift to avoid the JSX file having to import server-only modules.
const DEFAULT_TEAM_USERS = ['Greg', 'Vinny', 'Brad', 'Jen', 'JB', 'Dakota'];

export async function GET(req: NextRequest) {
  const userId = getSessionUserId(req);
  const actor = userId ? await getAuthUserById(userId) : null;
  if (!actor || !actor.active) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (actor.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const projects = (await listWorkspaceProjects()) as Array<Record<string, unknown>>;
    const baselineSet = new Set(DEFAULT_TEAM_USERS.map((u) => u.toLowerCase()));

    const audits = projects.map((p) => {
      const teamUsers = Array.isArray(p.teamUsers) ? (p.teamUsers as string[]) : [];
      const hasCustomTeam = teamUsers.length > 0;
      const teamSet = new Set(teamUsers.map((u) => u.toLowerCase()));

      // Names in baseline but NOT in this workspace's array — these are the
      // "ghost dropped" team members (the bug we're hunting for).
      const missingFromBaseline = hasCustomTeam
        ? DEFAULT_TEAM_USERS.filter((u) => !teamSet.has(u.toLowerCase()))
        : []; // no custom array → falls back to baseline, nothing missing

      // Names in this workspace's array but NOT in baseline — workspace-
      // specific specialists. Useful to know about but not a bug.
      const extras = hasCustomTeam
        ? teamUsers.filter((u) => !baselineSet.has(u.toLowerCase()))
        : [];

      return {
        projectId: p.id,
        projectName: p.name || '(unnamed)',
        hasCustomTeam,
        teamUsers,
        missingFromBaseline,
        extras,
        isOutOfSync: missingFromBaseline.length > 0,
      };
    });

    const customizedCount = audits.filter((a) => a.hasCustomTeam).length;
    const outOfSyncCount = audits.filter((a) => a.isOutOfSync).length;

    return NextResponse.json({
      ok: true,
      baseline: DEFAULT_TEAM_USERS,
      totalProjects: projects.length,
      customizedCount,
      outOfSyncCount,
      audits,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[TEAM_AUDIT] failed:', err);
    return NextResponse.json({ error: `Audit failed: ${msg}` }, { status: 500 });
  }
}
