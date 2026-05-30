// app/api/ar/scout/hunter/run/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthUserById } from '@/lib/gemfinder/auth-store';
import { createRun, listRunsByWorkspace, sweepStaleRuns } from '@/lib/gemfinder/hunter-runs-store';
import { getWeights } from '@/lib/gemfinder/hunter/weights-store';
import { runPipeline } from '@/lib/gemfinder/hunter/orchestrator';
import { getSessionUserId } from '@/lib/gemfinder/session';
import { isScoutV3Enabled } from '@/lib/gemfinder/feature-flags';

// Inline auth helper — duplicated per existing scout route convention.
async function requireEditorActor(req: NextRequest) {
  const userId = getSessionUserId(req);
  const actor = userId ? await getAuthUserById(userId) : null;
  if (!actor || !actor.active) {
    return { actor: null, response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  }
  if (actor.role === 'viewer') {
    return { actor: null, response: NextResponse.json({ error: 'Editor or admin role required' }, { status: 403 }) };
  }
  return { actor, response: null };
}

// Inline feature flag helper — also duplicated by convention.
const criteriaSchema = z.object({
  genres: z.array(z.string()).min(0),
  regions: z.array(z.string()).optional().default([]),
  locations: z.array(z.string().min(1).max(80)).optional(),  // Free-text city/state (e.g., "Austin, TX")
  roleTarget: z.enum(['performer', 'curator', 'both', 'unknown']).default('both'),
  sizeBracket: z.object({ min: z.number().optional(), max: z.number().optional() }).optional(),
  recency: z.object({ sinceYear: z.number().optional() }).optional(),
  instrument: z.string().optional(),
  targetCount: z.number().int().min(1).max(100).default(25),
  minScore: z.number().min(0).max(100).optional(),
  source: z.enum(['musicbrainz', 'llm']).optional() });
// No min-filter requirement — hunts with zero criteria run on weights alone.

export async function POST(req: NextRequest) {
  const { actor, response } = await requireEditorActor(req);
  if (response || !actor) return response;

  const workspaceId = req.nextUrl.searchParams.get('workspaceId');
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId query param is required' }, { status: 400 });
  }
  if (!(await isScoutV3Enabled(workspaceId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = criteriaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid criteria', details: parsed.error.issues }, { status: 400 });
  }

  const weights = await getWeights(workspaceId);
  // Default to LLM-driven discovery — MusicBrainz returns megastars and
  // wrong-category entries (novelists, audiobook narrators) for broad
  // queries. Respects an explicit source if the caller set one.
  const criteria = { ...parsed.data, source: (parsed.data.source ?? 'llm') as 'llm' | 'musicbrainz' };
  const run = await createRun({
    workspaceId,
    criteria,
    weightsSnapshot: weights,
    startedBy: actor.email });

  // Fire-and-forget the pipeline. setImmediate returns an Immediate handle (NOT a Promise),
  // so the .catch must wrap the awaited promise inside the callback.
  setImmediate(() => {
    runPipeline({
      runId: run.id,
      workspaceId,
      criteria,
      weights,
      actorEmail: actor.email }).catch((err) => {
      console.error('[HUNTER_RUN] pipeline rejected', { runId: run.id, error: err });
      // Pipeline handles setRunStatus('failed') internally — this catch only
      // prevents an unhandled-promise-rejection from crashing Node.
    });
  });

  return NextResponse.json({ ok: true, runId: run.id }, { status: 202 });
}

export async function GET(req: NextRequest) {
  const { actor, response } = await requireEditorActor(req);
  if (response || !actor) return response;

  const workspaceId = req.nextUrl.searchParams.get('workspaceId');
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId query param is required' }, { status: 400 });
  }
  if (!(await isScoutV3Enabled(workspaceId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Defensive: sweep any stale 'running' rows older than 1h before listing.
  await sweepStaleRuns().catch((err) => console.warn('[HUNTER_RUN] sweepStaleRuns failed:', err));
  const runs = await listRunsByWorkspace(workspaceId);
  return NextResponse.json({ ok: true, runs });
}
