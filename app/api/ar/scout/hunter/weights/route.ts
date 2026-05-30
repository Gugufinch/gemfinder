// app/api/ar/scout/hunter/weights/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthUserById } from '@/lib/gemfinder/auth-store';
import { getWeights, setWeights } from '@/lib/gemfinder/hunter/weights-store';
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
// ─── Zod schema ───────────────────────────────────────────────────────────────

const weightLogSchema = z.object({
  weight: z.number(),
  curve: z.enum(['log', 'linear']),
  min: z.number(),
  max: z.number(),
  missing_baseline: z.number(),
  days_window: z.number().optional() });

const weightValueMapSchema = z.object({
  weight: z.number(),
  values: z.record(z.string(), z.number()),
  missing_baseline: z.number().optional() });

const weightGenreSchema = z.object({
  weight: z.number(),
  targetGenres: z.array(z.string()),
  exact: z.number(),
  related: z.number(),
  none: z.number() });

const weightGeoSchema = z.object({
  weight: z.number(),
  targetRegions: z.array(z.string()),
  match: z.number(),
  other: z.number() });

const hunterWeightsSchema = z.object({
  version: z.number(),
  updatedAt: z.string(),
  updatedBy: z.string(),
  weights: z.object({
    instagram_followers:  weightLogSchema,
    tiktok_followers:     weightLogSchema,
    youtube_subscribers:  weightLogSchema,
    soundcloud_followers: weightLogSchema,
    spotify_followers:    weightLogSchema,
    spotify_popularity:   weightLogSchema,
    contact_readiness:    weightValueMapSchema,
    genre_fit:            weightGenreSchema,
    geography:            weightGeoSchema,
    role_match:           weightValueMapSchema,
    recency:              weightLogSchema }),
  gates: z.object({
    require_genre_match:  z.boolean(),
    require_living:       z.boolean(),
    require_reachable:    z.boolean(),
    require_not_blocked:  z.boolean() }),
  target_count_default: z.number().int().min(1).max(500) });

// ─── Route handlers ───────────────────────────────────────────────────────────

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

  const weights = await getWeights(workspaceId);
  return NextResponse.json({ ok: true, weights });
}

export async function PUT(req: NextRequest) {
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
  const parsed = hunterWeightsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid weights', details: parsed.error.issues }, { status: 400 });
  }

  await setWeights(workspaceId, parsed.data, actor.email);
  const updated = await getWeights(workspaceId);
  return NextResponse.json({ ok: true, weights: updated });
}
