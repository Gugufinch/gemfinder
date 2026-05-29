// app/api/ar/scout/candidates/[id]/reenrich/route.ts
//
// POST endpoint: re-run enrichment on an existing candidate. Useful when:
//   1. A candidate was enriched on an older code path (before deep-research,
//      before the Spotify search-by-name fallback, etc.) and has empty data
//   2. The Steel scrape failed at original-enrichment time and now might succeed
//   3. The operator just wants fresh data from current sources
//
// We DO NOT gate on deep research's `verified` here — the candidate is already
// in the queue (operator already kept them around), so a stale "not verified"
// signal shouldn't delete them. We just enrich whatever fields we can find.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserById } from '@/lib/gemfinder/auth-store';
import {
  getCandidate,
  updateCandidate,
  emitEvent,
} from '@/lib/gemfinder/scout-candidate-store';
import { listWorkspaceProjects } from '@/lib/gemfinder/project-store';
import { enrichCandidate } from '@/lib/gemfinder/hunter/enrichment';
import { getWeights } from '@/lib/gemfinder/hunter/weights-store';
import { computeScore } from '@/lib/gemfinder/hunter/scoring';
import type { MBArtist } from '@/lib/gemfinder/hunter/musicbrainz';
import type { ScoutCandidate } from '@/lib/gemfinder/types';

// Fields the re-enrich pipeline can touch — used to compute the per-field delta
// shown in the UI's "What just happened" panel. The label is human-readable.
// IMPORTANT: when you add a new patched field in the route below, add it here
// too — otherwise it won't appear in the delta and the operator will think
// "nothing changed" when something actually did.
type DeltaFieldSpec = {
  key: keyof ScoutCandidate;
  label: string;
  kind: 'text' | 'number' | 'array';
};
const DELTA_FIELDS: DeltaFieldSpec[] = [
  { key: 'spotifyUrl', label: 'Spotify URL', kind: 'text' },
  { key: 'spotifyArtistId', label: 'Spotify artist ID', kind: 'text' },
  { key: 'instagramHandle', label: 'Instagram handle', kind: 'text' },
  { key: 'tiktokHandle', label: 'TikTok handle', kind: 'text' },
  { key: 'youtubeHandle', label: 'YouTube handle', kind: 'text' },
  { key: 'soundcloudHandle', label: 'SoundCloud handle', kind: 'text' },
  { key: 'bandcampUrl', label: 'Bandcamp URL', kind: 'text' },
  { key: 'musicbrainzId', label: 'MusicBrainz ID', kind: 'text' },
  { key: 'primaryEmail', label: 'Booking email', kind: 'text' },
  { key: 'contactType', label: 'Contact type', kind: 'text' },
  { key: 'aiSummary', label: 'AI summary', kind: 'text' },
  { key: 'primaryGenre', label: 'Primary genre', kind: 'text' },
  { key: 'score', label: 'Score', kind: 'number' },
  { key: 'spotifyMonthlyListeners', label: 'Spotify listeners', kind: 'number' },
  { key: 'instagramFollowers', label: 'Instagram followers', kind: 'number' },
  { key: 'tiktokFollowers', label: 'TikTok followers', kind: 'number' },
  { key: 'youtubeSubscribers', label: 'YouTube subscribers', kind: 'number' },
  { key: 'soundcloudFollowers', label: 'SoundCloud followers', kind: 'number' },
  { key: 'genres', label: 'Genres', kind: 'array' },
];

type DeltaRow = {
  field: string;
  label: string;
  kind: 'text' | 'number' | 'array';
  before: string | number | string[] | null;
  after: string | number | string[] | null;
  changed: boolean;
  deltaNumeric?: number;
};

function computeDelta(before: ScoutCandidate, after: ScoutCandidate): DeltaRow[] {
  return DELTA_FIELDS.map(({ key, label, kind }) => {
    const b = (before[key] ?? null) as string | number | string[] | null;
    const a = (after[key] ?? null) as string | number | string[] | null;
    let changed: boolean;
    if (kind === 'array') {
      const bs = Array.isArray(b) ? [...b].sort().join('|') : '';
      const as = Array.isArray(a) ? [...a].sort().join('|') : '';
      changed = bs !== as;
    } else {
      changed = b !== a;
    }
    const row: DeltaRow = { field: String(key), label, kind, before: b, after: a, changed };
    if (kind === 'number' && typeof b === 'number' && typeof a === 'number') {
      row.deltaNumeric = a - b;
    }
    return row;
  });
}

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
    return flags.scoutV3 !== false;
  } catch (err) {
    console.warn('[CAND_REENRICH] feature-flag check failed:', err);
    return true;
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { actor, response } = await requireEditorActor(req);
  if (response || !actor) return response;

  const workspaceId = req.nextUrl.searchParams.get('workspaceId');
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId query param is required' }, { status: 400 });
  }
  if (!(await requireScoutV3Flag(workspaceId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { id: candidateId } = await ctx.params;
  if (!candidateId) {
    return NextResponse.json({ error: 'candidate id is required' }, { status: 400 });
  }

  const candidate = await getCandidate(workspaceId, candidateId);
  if (!candidate) {
    return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
  }

  // Construct a minimal MBArtist from the existing candidate. The enrichment
  // pipeline will fetch fresh details from MB (if id is present), do the
  // deep-research call, hit Spotify search-by-name, scrape socials, etc.
  const mbShim: MBArtist = {
    id: candidate.musicbrainzId || '',
    name: candidate.displayName,
    country: candidate.locations?.[0],  // best-effort hint
    tags: (candidate.genres || []).map((g) => ({ name: g, count: 1 })),
  };

  let enriched;
  try {
    // Pass candidateId so every phase emits a hunter_events row tied to this
    // candidate — that's what powers the "Activity log" panel in the UI.
    enriched = await enrichCandidate(workspaceId, mbShim, { candidateId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // The deep-research agent throws "not-a-recording-artist" if Gemini's
    // verification says the name isn't a real musician. For re-enrich we
    // DON'T treat this as fatal — candidate is already in the queue, just
    // means we couldn't refresh data. Log and report back.
    if (msg.includes('not-a-recording-artist')) {
      return NextResponse.json({
        ok: false,
        error: 'Deep research could not verify this name as a recording artist. Candidate left as-is — consider rejecting manually.',
      }, { status: 422 });
    }
    console.error('[CAND_REENRICH] enrichment crashed:', err);
    return NextResponse.json({ error: `Re-enrichment failed: ${msg}` }, { status: 500 });
  }

  // Recompute score with the current workspace weights.
  const weights = await getWeights(workspaceId);
  const score = computeScore(enriched, weights);

  // Build the patch. Only overwrite fields with NON-EMPTY new values — we don't
  // want a stale Steel scrape returning null to erase the original data.
  const patch: Parameters<typeof updateCandidate>[2] = {};
  const set = <K extends keyof typeof patch>(key: K, value: typeof patch[K]) => {
    if (value !== undefined && value !== null && value !== '') {
      patch[key] = value;
    }
  };

  set('spotifyUrl', enriched.spotifyUrl);
  set('spotifyArtistId', enriched.spotifyArtistId);
  set('instagramHandle', enriched.instagramHandle);
  set('tiktokHandle', enriched.tiktokHandle);
  set('youtubeHandle', enriched.youtubeHandle);
  set('soundcloudHandle', enriched.soundcloudHandle);
  set('bandcampUrl', enriched.bandcampUrl);
  set('musicbrainzId', enriched.musicbrainzId);
  set('primaryEmail', enriched.scrapedContactEmail);
  if (enriched.contactReadiness !== 'none' && enriched.contactReadiness !== 'social_only') {
    set('contactType', enriched.contactReadiness);
  }
  set('aiSummary', enriched.aiSummary);
  if (typeof enriched.spotifyFollowers === 'number') set('spotifyMonthlyListeners', enriched.spotifyFollowers);
  if (typeof enriched.instagramFollowers === 'number') set('instagramFollowers', enriched.instagramFollowers);
  if (typeof enriched.tiktokFollowers === 'number') set('tiktokFollowers', enriched.tiktokFollowers);
  if (typeof enriched.youtubeSubscribers === 'number') set('youtubeSubscribers', enriched.youtubeSubscribers);
  if (typeof enriched.soundcloudFollowers === 'number') set('soundcloudFollowers', enriched.soundcloudFollowers);
  if (enriched.genres && enriched.genres.length > 0) {
    set('primaryGenre', enriched.genres[0]);
    set('genres', enriched.genres);
  }
  patch.score = score.final;
  patch.weightSnapshot = {
    ...score.perDimension,
    ...(enriched.topTracks ? { _topTracks: enriched.topTracks } : {}),
    ...(enriched.spotifyImageUrl ? { _imageUrl: enriched.spotifyImageUrl } : {}),
  };
  patch.enrichmentStatus = (enriched.scrapedContactEmail || enriched.spotifyArtistId) ? 'complete' : 'partial';
  patch.updatedAt = new Date().toISOString();

  const updated = await updateCandidate(workspaceId, candidateId, patch);
  if (!updated) {
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }

  // Compute what actually changed vs. the pre-re-enrich snapshot. This is what
  // gives the operator visibility — "your re-enrich found 2 new things and
  // updated 3 follower counts" instead of the old silent success.
  const deltaRows = computeDelta(candidate, updated);
  const changedRows = deltaRows.filter((r) => r.changed);
  const delta = {
    fields: deltaRows,
    totalChanged: changedRows.length,
    totalUnchanged: deltaRows.length - changedRows.length,
    lastSeenAt: candidate.updatedAt,
    summary: changedRows.length === 0
      ? 'No fields changed — all data on file was already current.'
      : `${changedRows.length} field${changedRows.length === 1 ? '' : 's'} updated.`,
  };

  // Emit a final summary event so the activity-log panel can render a
  // "✓ Re-enrich complete" capstone row that ties together everything below it.
  void emitEvent({
    workspaceId,
    candidateId,
    phase: 'meta',
    status: 'success',
    message: delta.summary,
    data: {
      changedFields: changedRows.map((r) => r.field),
      totalChanged: delta.totalChanged,
    },
  });

  return NextResponse.json({ ok: true, candidate: updated, delta });
}
