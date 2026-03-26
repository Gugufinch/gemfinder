import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthUserById } from '@/lib/gemfinder/auth-store';
import { listWorkspaceProjectSnapshots, listWorkspaceProjects, saveWorkspaceProjects } from '@/lib/gemfinder/project-store';
import { notifySlackOnStageTransitions } from '@/lib/gemfinder/slack';

const updateSchema = z.object({
  projects: z.array(z.unknown())
});

async function getActor(req: NextRequest) {
  const userId = req.cookies.get('ar_user')?.value || '';
  if (!userId) return null;
  return getAuthUserById(userId);
}

export async function GET(req: NextRequest) {
  const actor = await getActor(req);
  if (!actor || !actor.active) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const projects = await listWorkspaceProjects();
  const snapshots = actor.role === 'admin' ? await listWorkspaceProjectSnapshots(5) : [];
  return NextResponse.json({ ok: true, projects, snapshots });
}

export async function PUT(req: NextRequest) {
  const actor = await getActor(req);
  if (!actor || !actor.active) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
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
  try {
    await saveWorkspaceProjects(parsed.data.projects, {
      allowEmpty: req.headers.get('x-gemfinder-allow-empty') === 'true' && actor.role === 'admin',
      reason: `api_put:${actor.email}`
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Project save failed' },
      { status: 409 }
    );
  }
  void notifySlackOnStageTransitions({
    previousProjects,
    nextProjects: parsed.data.projects,
    actorEmail: actor.email
  });
  return NextResponse.json({ ok: true, count: parsed.data.projects.length });
}
