// lib/gemfinder/scout-blocklist-index.ts
//
// Audit #6: prefetched in-memory blocklist index for BATCH lookups.
//
// THE BUG: Hunter ran isBlocked() once per candidate inside a 100-wide
// concurrency loop. Each call did up to 16 sequential pg roundtrips. Net
// cost per run: ~1700 pg queries to answer ~100 "is this artist blocked?"
// questions — even though the blocklist data barely changes during a run.
//
// THE FIX: load the entire workspace's blocklist once (3 queries:
// candidates + rejections + projects), build Maps keyed by every match
// column, then answer lookups synchronously in O(1) each. For Hunter's
// 100-candidate batch: 1700 queries → 3.
//
// API:
//   const index = await buildBlocklistIndex(workspaceId);
//   for (const identity of identities) {
//     const result = matchAgainstIndex(index, identity, opts);
//     // ...
//   }
//
// The index is read-only and intentionally has no auto-refresh. Hunter's
// run lasts ~minutes; even at typical add-to-kickoff rates, missing a
// row added mid-run is fine — the score floor + final approve pass catch
// it. Long-running consumers should rebuild the index periodically.

import type { BlocklistResult, CandidateIdentity, BlocklistMatchedOn } from './types';
import { listWorkspaceProjects } from './project-store';
import { canonicalizeName } from './scout/identity';
import { getScoutPool } from './scout-candidate-store';

// Field order matches MATCH_FIELDS in scout-blocklist-query.ts — used as
// priority order when multiple fields would match the same identity.
const FIELD_PRIORITY: BlocklistMatchedOn[] = [
  'spotify_artist_id',
  'musicbrainz_id',
  'primary_email',
  'instagram_handle',
  'tiktok_handle',
  'youtube_handle',
  'soundcloud_handle',
  'canonical_name',
];

type CandidateEntry = { id: string; displayName: string };
type RejectionEntry = { id: string; displayName: string; reasonCode: string; rejectedAt: string };

export type BlocklistIndex = {
  workspaceId: string;
  candidatesByField: Record<BlocklistMatchedOn, Map<string, CandidateEntry>>;
  rejectionsByField: Record<BlocklistMatchedOn, Map<string, RejectionEntry>>;
  /** Workspace projects relevant to this workspace, normalized for fast scan. */
  projects: Array<{ id?: string; workspaceId?: string; artists?: Array<Record<string, unknown>> }>;
};

/**
 * Prefetch all blocklist sources for a workspace. Three pg/network calls
 * regardless of how many lookups follow. Returns an immutable index that
 * answers `matchAgainstIndex(index, identity, opts?)` synchronously.
 */
export async function buildBlocklistIndex(workspaceId: string): Promise<BlocklistIndex> {
  const pool = getScoutPool();
  const [candRes, rejRes, allProjects] = await Promise.all([
    pool.query(
      `select id, display_name,
              spotify_artist_id, musicbrainz_id, primary_email,
              instagram_handle, tiktok_handle, youtube_handle,
              soundcloud_handle, canonical_name
       from scout_candidates where workspace_id = $1`,
      [workspaceId],
    ),
    pool.query(
      `select id, display_name, reason_code, rejected_at,
              spotify_artist_id, musicbrainz_id, primary_email,
              instagram_handle, tiktok_handle, youtube_handle,
              soundcloud_handle, canonical_name
       from scout_rejections where workspace_id = $1`,
      [workspaceId],
    ),
    listWorkspaceProjects(),
  ]);

  const candidatesByField = emptyFieldMap<CandidateEntry>();
  for (const row of candRes.rows) {
    const entry: CandidateEntry = { id: String(row.id), displayName: String(row.display_name ?? '') };
    addToFieldMaps(candidatesByField, row, entry);
  }

  const rejectionsByField = emptyFieldMap<RejectionEntry>();
  for (const row of rejRes.rows) {
    const entry: RejectionEntry = {
      id: String(row.id),
      displayName: String(row.display_name ?? ''),
      reasonCode: String(row.reason_code ?? 'rejected'),
      rejectedAt: row.rejected_at instanceof Date ? row.rejected_at.toISOString() : String(row.rejected_at ?? ''),
    };
    addToFieldMaps(rejectionsByField, row, entry);
  }

  const projects = ((allProjects as Array<Record<string, unknown>>) ?? []).filter((project) => {
    const projWorkspaceId = String(project?.workspaceId ?? '');
    return projWorkspaceId === workspaceId || project?.id === workspaceId;
  }) as BlocklistIndex['projects'];

  return { workspaceId, candidatesByField, rejectionsByField, projects };
}

/**
 * Synchronous O(1) match against a prefetched index. Mirrors the pre-rewrite
 * isBlocked() semantics exactly — same priority order, same shape of
 * BlocklistResult, same handling of excludeCandidateId / includeRejections.
 */
export function matchAgainstIndex(
  index: BlocklistIndex,
  identity: CandidateIdentity,
  opts?: { excludeCandidateId?: string; includeRejections?: boolean },
): BlocklistResult {
  // ─── Source 1: scout_candidates ──────────────────────────────────────────
  for (const field of FIELD_PRIORITY) {
    const value = identity[fieldToIdentityKey(field)];
    if (!value || typeof value !== 'string') continue;
    const hit = index.candidatesByField[field].get(value);
    if (hit && hit.id !== opts?.excludeCandidateId) {
      return {
        blocked: true,
        reason: 'candidate',
        matchedOn: field,
        matchedRecord: {
          id: hit.id,
          displayName: hit.displayName,
          location: 'Pending in Scout V3',
        },
      };
    }
  }

  // ─── Source 2: scout_rejections ──────────────────────────────────────────
  if (opts?.includeRejections !== false) {
    for (const field of FIELD_PRIORITY) {
      const value = identity[fieldToIdentityKey(field)];
      if (!value || typeof value !== 'string') continue;
      const hit = index.rejectionsByField[field].get(value);
      if (hit) {
        return {
          blocked: true,
          reason: 'rejected',
          matchedOn: field,
          matchedRecord: {
            id: hit.id,
            displayName: hit.displayName,
            location: `Rejected (${hit.reasonCode})`,
            addedAt: hit.rejectedAt,
          },
        };
      }
    }
  }

  // ─── Source 3: workspace projects JSONB scan ─────────────────────────────
  for (const project of index.projects) {
    const artists = project?.artists ?? [];
    for (const artist of artists) {
      const artistName    = String(artist?.n     ?? '');
      const artistEmail   = String(artist?.e     ?? '').toLowerCase();
      const artistInsta   = String(artist?.soc   ?? '').replace(/^@/, '');
      const artistSpotify = String(artist?.spotify ?? '');
      const artistStage   = String(artist?.stage ?? 'prospect');
      const reason: 'kickoff' | 'live' = artistStage === 'live' ? 'live' : 'kickoff';

      if (identity.canonicalName && artistName) {
        const artistCanonical = canonicalizeName(artistName);
        if (artistCanonical === identity.canonicalName) {
          return makeJsonbHit(artistName, artistStage, reason, 'canonical_name');
        }
      }
      if (identity.primaryEmail && artistEmail === identity.primaryEmail) {
        return makeJsonbHit(artistName, artistStage, reason, 'primary_email');
      }
      if (identity.instagramHandle && artistInsta === identity.instagramHandle) {
        return makeJsonbHit(artistName, artistStage, reason, 'instagram_handle');
      }
      if (identity.spotifyArtistId && artistSpotify.includes(identity.spotifyArtistId)) {
        return makeJsonbHit(artistName, artistStage, reason, 'spotify_artist_id');
      }
    }
  }

  return { blocked: false };
}

// ─── helpers ──────────────────────────────────────────────────────────────

function emptyFieldMap<T>(): Record<BlocklistMatchedOn, Map<string, T>> {
  return {
    spotify_artist_id:  new Map(),
    musicbrainz_id:     new Map(),
    primary_email:      new Map(),
    instagram_handle:   new Map(),
    tiktok_handle:      new Map(),
    youtube_handle:     new Map(),
    soundcloud_handle:  new Map(),
    canonical_name:     new Map(),
  };
}

function addToFieldMaps<T>(
  fieldMap: Record<BlocklistMatchedOn, Map<string, T>>,
  row: Record<string, unknown>,
  entry: T,
): void {
  for (const field of FIELD_PRIORITY) {
    const value = row[field];
    if (typeof value === 'string' && value) {
      // First occurrence wins. Realistically each value is unique within a
      // workspace anyway, but if duplicates exist, the row inserted earlier
      // is the "older" record we'd want to point to.
      if (!fieldMap[field].has(value)) {
        fieldMap[field].set(value, entry);
      }
    }
  }
}

function fieldToIdentityKey(field: BlocklistMatchedOn): keyof CandidateIdentity {
  switch (field) {
    case 'spotify_artist_id':  return 'spotifyArtistId';
    case 'musicbrainz_id':     return 'musicbrainzId';
    case 'primary_email':      return 'primaryEmail';
    case 'instagram_handle':   return 'instagramHandle';
    case 'tiktok_handle':      return 'tiktokHandle';
    case 'youtube_handle':     return 'youtubeHandle';
    case 'soundcloud_handle':  return 'soundcloudHandle';
    case 'canonical_name':     return 'canonicalName';
  }
}

function makeJsonbHit(
  artistName: string,
  artistStage: string,
  reason: 'kickoff' | 'live',
  matchedOn: BlocklistMatchedOn,
): BlocklistResult {
  return {
    blocked: true,
    reason,
    matchedOn,
    matchedRecord: {
      id: artistName,
      displayName: artistName,
      location: `Kickoff · ${artistStage}`,
      stage: artistStage,
    },
  };
}
