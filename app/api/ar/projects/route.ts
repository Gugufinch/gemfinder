import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthUserById } from '@/lib/gemfinder/auth-store';
import {
  listWorkspaceProjectSnapshots,
  listWorkspaceProjects,
  listWorkspaceProjectsWithEtag,
  saveWorkspaceProjects,
  WorkspaceEtagConflictError,
} from '@/lib/gemfinder/project-store';
import { notifySlackOnProjectTransitions } from '@/lib/gemfinder/slack';

const updateSchema = z.object({
  projects: z.array(z.unknown())
});

async function getActor(req: NextRequest) {
  const userId = req.cookies.get('ar_user')?.value || '';
  if (!userId) return null;
  return getAuthUserById(userId);
}

function matchesExpectedActor(req: NextRequest, actor: { userId: string; email: string } | null) {
  const expectedActorId = String(req.headers.get('x-gemfinder-expected-actor-id') || '').trim();
  const expectedActorEmail = String(req.headers.get('x-gemfinder-expected-actor-email') || '').trim().toLowerCase();
  if (!expectedActorId && !expectedActorEmail) return true;
  if (!actor) return false;
  if (expectedActorId && actor.userId !== expectedActorId) return false;
  if (expectedActorEmail && actor.email.toLowerCase() !== expectedActorEmail) return false;
  return true;
}

export async function GET(req: NextRequest) {
  const actor = await getActor(req);
  if (!actor || !actor.active) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Return projects + etag (= current updated_at). Client tracks the etag and
  // sends it back on PUT as x-gemfinder-if-match for optimistic concurrency.
  // Without this, two users editing the workspace concurrently can clobber
  // each other (which is exactly what caused Dakota's saves to vanish when
  // another session saved after hers).
  const { projects, etag } = await listWorkspaceProjectsWithEtag();
  const snapshots = actor.role === 'admin' ? await listWorkspaceProjectSnapshots(5) : [];
  return NextResponse.json({ ok: true, projects, etag, snapshots });
}

export async function PUT(req: NextRequest) {
  const actor = await getActor(req);
  if (!actor || !actor.active) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (!matchesExpectedActor(req, actor)) {
    return NextResponse.json(
      {
        error:
          'Your signed-in account changed while this page was open. Refresh GemFinder or sign in again before saving.',
      },
      { status: 409 }
    );
  }
  if (actor.role !== 'admin' && actor.role !== 'editor') {
    return NextResponse.json({ error: 'Editor or admin role required' }, { status: 403 });
  }

  const payload = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid project payload', details: parsed.error.issues }, { status: 400 });
  }

  const previousProjects = await listWorkspaceProjects();

  // Optional optimistic-locking etag from client. Header is intentionally a
  // custom name (not standard If-Match) so it never collides with HTTP cache
  // semantics — this is application-level concurrency control. Absent header
  // = legacy callers (Songfinch webhook, older clients) that bypass the
  // check. Present header = client opts in to conflict detection.
  const expectedEtagHeader = req.headers.get('x-gemfinder-if-match');
  const expectedEtag = expectedEtagHeader === null ? undefined : expectedEtagHeader;

  let saveResult: { etag: string | null };
  try {
    saveResult = await saveWorkspaceProjects(parsed.data.projects, {
      allowEmpty: req.headers.get('x-gemfinder-allow-empty') === 'true' && actor.role === 'admin',
      reason: `api_put:${actor.email}`,
      expectedEtag,
    });
  } catch (error) {
    // Conflict path: another writer updated state after this client loaded
    // it. Return 409 with the current state attached so the client can
    // reload without a separate GET round trip + reapply their changes.
    if (error instanceof WorkspaceEtagConflictError) {
      return NextResponse.json(
        {
          error: error.message,
          conflict: true,
          currentEtag: error.currentEtag,
          currentProjects: error.currentProjects,
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Project save failed' },
      { status: 409 }
    );
  }
  await notifySlackOnProjectTransitions({
    previousProjects,
    nextProjects: parsed.data.projects,
    actorEmail: actor.email
  });
  return NextResponse.json({
    ok: true,
    count: parsed.data.projects.length,
    etag: saveResult.etag,
  });
}
