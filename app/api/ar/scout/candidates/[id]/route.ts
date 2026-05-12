// app/api/ar/scout/candidates/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserById } from '@/lib/gemfinder/auth-store';
import {
  ensureSchema,
  getCandidate,
  deleteCandidate,
  updateCandidate,
  createRejection,
  getScoutPool,
} from '@/lib/gemfinder/scout-candidate-store';
import {
  addTalentToProject,
  listWorkspaceProjects,
  saveWorkspaceProjects,
} from '@/lib/gemfinder/project-store';
import { isBlocked } from '@/lib/gemfinder/scout-blocklist';
import { buildIdentity } from '@/lib/gemfinder/scout/identity';
import {
  approveSchema,
  rejectSchema,
  candidateEditSchema,
} from '@/lib/gemfinder/scout/validation';
import { v4 as uuidv4 } from 'uuid';
import type { ScoutRejection } from '@/lib/gemfinder/types';
import type { AuthUserRecord } from '@/lib/gemfinder/types';

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
    return Boolean(flags.scoutV3);
  } catch (err) {
    console.warn('[SCOUT_HUNT] feature-flag check failed:', err);
    return false;
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { actor, response } = await requireEditorActor(req);
  if (response || !actor) return response;

  const { id } = await params;
  const workspaceId = req.nextUrl.searchParams.get('workspaceId');
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

  if (!(await requireScoutV3Flag(workspaceId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  await ensureSchema();

  // Action dispatch: action = "approve" | "reject" | "edit"
  const { action } = body as { action?: string };

  if (action === 'approve') return handleApprove(workspaceId, id, body, actor);
  if (action === 'reject') return handleReject(workspaceId, id, body, actor);
  if (action === 'edit') return handleEdit(workspaceId, id, body, actor);

  return NextResponse.json({ error: 'Unknown action; expected approve|reject|edit' }, { status: 400 });
}

async function handleApprove(workspaceId: string, candidateId: string, body: unknown, actor: { email: string }) {
  const parsed = approveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid approve payload', details: parsed.error.issues }, { status: 400 });
  }
  const { projectId, note } = parsed.data;

  const candidate = await getCandidate(workspaceId, candidateId);
  if (!candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });

  // Re-check blocklist — Kickoff may have changed since candidate was added.
  const identity = buildIdentity({
    displayName: candidate.displayName,
    spotifyArtistId: candidate.spotifyArtistId,
    musicbrainzId: candidate.musicbrainzId,
    primaryEmail: candidate.primaryEmail,
    instagramHandle: candidate.instagramHandle,
    tiktokHandle: candidate.tiktokHandle,
    youtubeHandle: candidate.youtubeHandle,
    soundcloudHandle: candidate.soundcloudHandle,
    bandcampUrl: candidate.bandcampUrl,
  });
  const recheck = await isBlocked(workspaceId, identity, { excludeCandidateId: candidateId });
  if (recheck.blocked && recheck.reason !== 'rejected') {
    return NextResponse.json({ error: 'Now in Kickoff or Live since added', match: recheck }, { status: 409 });
  }

  // Wrap in a pg transaction with SELECT FOR UPDATE on the candidate row
  // to guarantee exactly-once approve under concurrent requests.
  // Uses the SHARED pool from scout-candidate-store — do not create new pools per request.
  const client = await getScoutPool().connect();

  try {
    await client.query('begin');

    // Lock the candidate row. If a parallel approve already deleted it,
    // SELECT returns 0 rows → 404. The lock is released on commit/rollback.
    const lockRes = await client.query(
      'select id from scout_candidates where workspace_id = $1 and id = $2 for update',
      [workspaceId, candidateId]
    );
    if (lockRes.rowCount === 0) {
      await client.query('rollback');
      return NextResponse.json({ error: 'Candidate not found (may have been handled concurrently)' }, { status: 404 });
    }

    // Add to Kickoff project (JSONB mutation via saveWorkspaceProjects).
    // This writes to a DIFFERENT table (gemfinder_workspace_state) than the
    // pg transaction, so it's NOT inside the transaction. Ordering per spec
    // "Graduation atomicity": JSONB write first, then candidate delete. If
    // delete fails after JSONB succeeds, we have a retryable duplicate state.
    const { talentId, artistRecord } = await addTalentToProject(
      workspaceId,
      projectId,
      candidate,
      actor as unknown as AuthUserRecord
    );

    // Write kickoffDecisionState[talentId] = qualified
    // (key name matches the post-migration shape — see Chunk 5 Task 1 Step 6)
    const projects = await listWorkspaceProjects();
    const project = (projects as Array<Record<string, unknown>>).find((p) => p.id === projectId);
    if (project) {
      const settings = (project.settings as Record<string, unknown>) || {};
      const decisionState = (settings.kickoffDecisionState as Record<string, unknown>) || {};
      decisionState[talentId] = {
        decision: 'qualified',
        decisionBy: actor.email,
        decisionAt: new Date().toISOString(),
        reviewCount: 1,
        lastReviewedBy: actor.email,
        lastReviewedAt: new Date().toISOString(),
        note: note || null,
      };
      settings.kickoffDecisionState = decisionState;
      project.settings = settings;
      await saveWorkspaceProjects(projects);
    }

    // Delete candidate row inside the locked transaction (exactly-once guarantee).
    await client.query(
      'delete from scout_candidates where workspace_id = $1 and id = $2',
      [workspaceId, candidateId]
    );
    await client.query('commit');

    console.log('[SCOUT_DECISION]', { action: 'approve', candidateId, talentId, projectId, actor: actor.email });
    return NextResponse.json({ ok: true, approvedTalentId: talentId, kickoffProjectId: projectId, kickoffRecordId: talentId, artistRecord });
  } catch (err) {
    await client.query('rollback').catch((rbErr) => console.warn('[SCOUT_HUNT] rollback failed:', rbErr));
    console.error('[SCOUT_HUNT] approve failed:', err);
    return NextResponse.json({ error: 'Approve failed' }, { status: 500 });
  } finally {
    client.release();
    // Do NOT call pool.end() — the pool is shared across the process.
  }
}

async function handleReject(workspaceId: string, candidateId: string, body: unknown, actor: { email: string }) {
  const parsed = rejectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid reject payload', details: parsed.error.issues }, { status: 400 });
  }
  const { reasonCode, reasonNote } = parsed.data;

  const candidate = await getCandidate(workspaceId, candidateId);
  if (!candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });

  const rejection: ScoutRejection = {
    id: uuidv4(),
    workspaceId,
    displayName: candidate.displayName,
    canonicalName: candidate.canonicalName,
    spotifyUrl: candidate.spotifyUrl,
    spotifyArtistId: candidate.spotifyArtistId,
    instagramHandle: candidate.instagramHandle,
    tiktokHandle: candidate.tiktokHandle,
    youtubeHandle: candidate.youtubeHandle,
    soundcloudHandle: candidate.soundcloudHandle,
    musicbrainzId: candidate.musicbrainzId,
    bandcampUrl: candidate.bandcampUrl,
    primaryEmail: candidate.primaryEmail,
    candidateSnapshot: candidate as unknown as Record<string, unknown>,
    reasonCode,
    reasonNote,
    rejectedBy: actor.email,
    rejectedAt: new Date().toISOString(),
  };

  try {
    await createRejection(rejection);
    await deleteCandidate(workspaceId, candidateId);
    console.log('[SCOUT_DECISION]', { action: 'reject', candidateId, reasonCode, actor: actor.email });
    return NextResponse.json({ ok: true, rejectionId: rejection.id });
  } catch (err) {
    console.error('[SCOUT_HUNT] reject failed:', err);
    return NextResponse.json({ error: 'Reject failed' }, { status: 500 });
  }
}

async function handleEdit(workspaceId: string, candidateId: string, body: unknown, actor: { email: string }) {
  const parsed = candidateEditSchema.safeParse({ ...body as Record<string, unknown>, action: undefined });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid edit payload', details: parsed.error.issues }, { status: 400 });
  }

  const existing = await getCandidate(workspaceId, candidateId);
  if (!existing) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });

  // Re-run blocklist check excluding self.
  const merged = { ...existing, ...parsed.data };
  const identity = buildIdentity({
    displayName: merged.displayName,
    spotifyArtistId: merged.spotifyArtistId,
    musicbrainzId: merged.musicbrainzId,
    primaryEmail: merged.primaryEmail,
    instagramHandle: merged.instagramHandle,
    tiktokHandle: merged.tiktokHandle,
    youtubeHandle: merged.youtubeHandle,
    soundcloudHandle: merged.soundcloudHandle,
    bandcampUrl: merged.bandcampUrl,
  });
  const collision = await isBlocked(workspaceId, identity, { excludeCandidateId: candidateId });
  if (collision.blocked) {
    return NextResponse.json({ error: 'Edit creates a collision', match: collision }, { status: 409 });
  }

  try {
    const updated = await updateCandidate(workspaceId, candidateId, parsed.data);
    return NextResponse.json({ ok: true, candidate: updated });
  } catch (err) {
    console.error('[SCOUT_HUNT] edit failed:', err);
    return NextResponse.json({ error: 'Edit failed' }, { status: 500 });
  }
}
