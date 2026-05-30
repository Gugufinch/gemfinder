// app/api/ar/scout/candidates/bulk/route.ts
//
// POST: bulk-add multiple candidates (typically from a CSV paste). Each row
// goes through the SAME validation + blocklist + insert path as the single-
// add endpoint, but the response returns a detailed per-row outcome so the
// operator can see exactly what worked and what didn't.
//
// Body shape:
//   { candidates: Array<CandidateCreatePayload> }
//
// Response shape:
//   {
//     ok: true,
//     summary: { total, succeeded, duplicates, validationErrors, errors },
//     results: Array<{ rowIndex, status, candidateId?, reason?, details? }>
//   }
//
// Each row's `status` is one of:
//   - "success"           — inserted, candidateId present
//   - "duplicate"         — caught by blocklist; reason + matchedRecord
//   - "validation_error"  — zod rejected; details = zod issues
//   - "error"             — DB/internal; details = error message

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserById } from '@/lib/gemfinder/auth-store';
import { candidateCreateSchema } from '@/lib/gemfinder/scout/validation';
import { buildIdentity, canonicalizeName } from '@/lib/gemfinder/scout/identity';
import { isBlocked } from '@/lib/gemfinder/scout-blocklist';
import { ensureSchema, createCandidate } from '@/lib/gemfinder/scout-candidate-store';
import { v4 as uuidv4 } from 'uuid';
import type { ScoutCandidate } from '@/lib/gemfinder/types';
import { getSessionUserId } from '@/lib/gemfinder/session';
import { isScoutV3Enabled } from '@/lib/gemfinder/feature-flags';

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

const MAX_BULK_SIZE = 500;

type RowResult =
  | { rowIndex: number; status: 'success'; candidateId: string; displayName: string }
  | { rowIndex: number; status: 'duplicate'; displayName: string; reason: string; matchedRecord: unknown }
  | { rowIndex: number; status: 'validation_error'; displayName: string; details: unknown }
  | { rowIndex: number; status: 'error'; displayName: string; details: string };

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

  const payload = await req.json().catch(() => null);
  if (!payload || !Array.isArray(payload.candidates)) {
    return NextResponse.json({ error: 'Body must be { candidates: [...] }' }, { status: 400 });
  }
  if (payload.candidates.length === 0) {
    return NextResponse.json({ error: 'No candidates provided' }, { status: 400 });
  }
  if (payload.candidates.length > MAX_BULK_SIZE) {
    return NextResponse.json(
      { error: `Bulk size cannot exceed ${MAX_BULK_SIZE}. Split into smaller batches.` },
      { status: 400 },
    );
  }

  await ensureSchema();

  const results: RowResult[] = [];
  // Process sequentially so blocklist hits between rows in the same batch
  // also count (e.g., "Wednesday" listed twice in CSV → first goes through,
  // second hits the now-inserted record).
  for (let i = 0; i < payload.candidates.length; i++) {
    const row = payload.candidates[i];
    const displayName = typeof row?.displayName === 'string' ? row.displayName.slice(0, 80) : '(no name)';

    const parsed = candidateCreateSchema.safeParse(row);
    if (!parsed.success) {
      results.push({
        rowIndex: i,
        status: 'validation_error',
        displayName,
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message })) });
      continue;
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
      bandcampUrl: parsed.data.bandcampUrl });

    try {
      const blocklistResult = await isBlocked(workspaceId, identity);
      if (blocklistResult.blocked) {
        results.push({
          rowIndex: i,
          status: 'duplicate',
          displayName: parsed.data.displayName,
          reason: blocklistResult.reason,
          matchedRecord: blocklistResult.matchedRecord });
        continue;
      }
    } catch (err) {
      results.push({
        rowIndex: i,
        status: 'error',
        displayName: parsed.data.displayName,
        details: `Blocklist check failed: ${err instanceof Error ? err.message : String(err)}` });
      continue;
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
      source: parsed.data.source || 'csv-bulk',
      sourceUrl: parsed.data.sourceUrl,
      sourceExternalId: parsed.data.sourceExternalId,
      addedBy: actor.email,
      enrichmentStatus: 'pending',
      identityOverride: false,
      createdAt: now,
      updatedAt: now };

    try {
      const inserted = await createCandidate(candidate);
      results.push({
        rowIndex: i,
        status: 'success',
        candidateId: inserted.id,
        displayName: inserted.displayName });
    } catch (err) {
      results.push({
        rowIndex: i,
        status: 'error',
        displayName: parsed.data.displayName,
        details: `Insert failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  // Aggregate summary
  const summary = {
    total: results.length,
    succeeded: results.filter((r) => r.status === 'success').length,
    duplicates: results.filter((r) => r.status === 'duplicate').length,
    validationErrors: results.filter((r) => r.status === 'validation_error').length,
    errors: results.filter((r) => r.status === 'error').length };

  return NextResponse.json({ ok: true, summary, results });
}
