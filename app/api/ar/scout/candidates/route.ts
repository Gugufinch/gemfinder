// app/api/ar/scout/candidates/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserById } from '@/lib/gemfinder/auth-store';
import { candidateCreateSchema } from '@/lib/gemfinder/scout/validation';
import { buildIdentity } from '@/lib/gemfinder/scout/identity';
import { isBlocked } from '@/lib/gemfinder/scout-blocklist';
import {
  ensureSchema,
  createCandidate,
  listCandidatesByWorkspace,
} from '@/lib/gemfinder/scout-candidate-store';
import { canonicalizeName } from '@/lib/gemfinder/scout/identity';
import { v4 as uuidv4 } from 'uuid';
import type { ScoutCandidate } from '@/lib/gemfinder/types';

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

export async function POST(req: NextRequest) {
  const { actor, response } = await requireEditorActor(req);
  if (response || !actor) return response;

  const workspaceId = req.nextUrl.searchParams.get('workspaceId');
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId query param is required' }, { status: 400 });
  }

  const payload = await req.json().catch(() => null);
  const parsed = candidateCreateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid candidate payload', details: parsed.error.issues },
      { status: 400 }
    );
  }

  const identity = buildIdentity({
    displayName: parsed.data.displayName,
    spotifyArtistId: parsed.data.spotifyArtistId,
    musicbrainzId: parsed.data.musicbrainzId,
    primaryEmail: parsed.data.primaryEmail,
    instagramHandle: parsed.data.instagramHandle,
    tiktokHandle: parsed.data.tiktokHandle,
    youtubeHandle: parsed.data.youtubeHandle,
    soundcloudHandle: parsed.data.soundcloudHandle,
    bandcampUrl: parsed.data.bandcampUrl,
  });

  await ensureSchema();
  const blocklistResult = await isBlocked(workspaceId, identity);
  if (blocklistResult.blocked) {
    return NextResponse.json(
      { error: 'Already tracked', match: blocklistResult },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const candidate: ScoutCandidate = {
    id: uuidv4(),
    workspaceId,
    displayName: parsed.data.displayName,
    canonicalName: canonicalizeName(parsed.data.displayName),
    aliases: parsed.data.aliases || [],
    spotifyUrl: parsed.data.spotifyUrl,
    spotifyArtistId: parsed.data.spotifyArtistId,
    instagramHandle: parsed.data.instagramHandle,
    tiktokHandle: parsed.data.tiktokHandle,
    youtubeHandle: parsed.data.youtubeHandle,
    youtubeUrl: parsed.data.youtubeUrl,
    soundcloudHandle: parsed.data.soundcloudHandle,
    soundcloudUrl: parsed.data.soundcloudUrl,
    musicbrainzId: parsed.data.musicbrainzId,
    bandcampUrl: parsed.data.bandcampUrl,
    extraLinks: parsed.data.extraLinks || [],
    primaryEmail: parsed.data.primaryEmail,
    contactName: parsed.data.contactName,
    contactEmail: parsed.data.contactEmail,
    contactType: parsed.data.contactType,
    primaryGenre: parsed.data.primaryGenre,
    genres: parsed.data.genres || [],
    locations: parsed.data.locations || [],
    instagramFollowers: parsed.data.instagramFollowers,
    tiktokFollowers: parsed.data.tiktokFollowers,
    spotifyMonthlyListeners: parsed.data.spotifyMonthlyListeners,
    youtubeSubscribers: parsed.data.youtubeSubscribers,
    soundcloudFollowers: parsed.data.soundcloudFollowers,
    hitTracks: parsed.data.hitTracks || [],
    curatorPageUrl: parsed.data.curatorPageUrl,
    artistRole: parsed.data.artistRole,
    aiSummary: parsed.data.aiSummary,
    living: parsed.data.living,
    source: parsed.data.source || 'manual',
    sourceUrl: parsed.data.sourceUrl,
    sourceExternalId: parsed.data.sourceExternalId,
    addedBy: actor.email,
    enrichmentStatus: 'pending',
    identityOverride: false,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const created = await createCandidate(candidate);
    console.log('[SCOUT_HUNT] candidate added', { id: created.id, addedBy: actor.email });
    return NextResponse.json({ ok: true, candidate: created }, { status: 201 });
  } catch (err) {
    console.error('[SCOUT_HUNT] candidate creation failed:', err);
    return NextResponse.json({ error: 'Failed to create candidate' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { actor, response } = await requireEditorActor(req);
  if (response || !actor) return response;

  const workspaceId = req.nextUrl.searchParams.get('workspaceId');
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId query param is required' }, { status: 400 });
  }

  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50', 10);
  const offset = parseInt(req.nextUrl.searchParams.get('offset') || '0', 10);
  const orderBy = (req.nextUrl.searchParams.get('orderBy') as 'created_at' | 'score') || 'created_at';

  await ensureSchema();
  const candidates = await listCandidatesByWorkspace(workspaceId, { limit, offset, orderBy });
  return NextResponse.json({ ok: true, candidates });
}
