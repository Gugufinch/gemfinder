// lib/gemfinder/scout-blocklist.ts
//
// Audit #6: ~16 sequential pg queries → 1 UNION-ALL statement.
//
// The MATCH_FIELDS priority order is now encoded in scout-blocklist-query.ts
// (one source of truth). The workspace JSONB scan (source 3) is delegated to
// scout-blocklist-index.ts so the single-call and batch paths share logic.
//
// For batch use (Hunter, bulk import), prefer `buildBlocklistIndex` from
// './scout-blocklist-index' — same workspace fetched once, then synchronous
// O(1) lookups per identity. This isBlocked() wrapper is for one-off use
// (approve, edit) where prefetch overhead would dominate.

import type { BlocklistResult, CandidateIdentity } from './types';
import { listWorkspaceProjects } from './project-store';
import { getScoutPool } from './scout-candidate-store';
import { buildBlocklistQuery, type BlocklistQueryRow } from './scout-blocklist-query';
import { matchAgainstIndex, type BlocklistIndex } from './scout-blocklist-index';

export async function isBlocked(
  workspaceId: string,
  identity: CandidateIdentity,
  options?: { excludeCandidateId?: string; includeRejections?: boolean }
): Promise<BlocklistResult> {
  const pool = getScoutPool();

  // ─── Sources 1 + 2: scout_candidates + scout_rejections (ONE query) ──────
  const { sql, params } = buildBlocklistQuery({
    workspaceId,
    identity,
    excludeCandidateId: options?.excludeCandidateId,
    includeRejections: options?.includeRejections,
  });
  const res = await pool.query(sql, params);
  const row = res.rows[0] as BlocklistQueryRow | undefined;
  if (row?.id) {
    if (row.source === 'candidate') {
      return {
        blocked: true,
        reason: 'candidate',
        matchedOn: row.matched_on,
        matchedRecord: {
          id: row.id,
          displayName: row.display_name,
          location: 'Pending in Scout V3',
        },
      };
    }
    return {
      blocked: true,
      reason: 'rejected',
      matchedOn: row.matched_on,
      matchedRecord: {
        id: row.id,
        displayName: row.display_name,
        location: `Rejected (${row.reason_code ?? 'rejected'})`,
        addedAt: row.rejected_at instanceof Date ? row.rejected_at.toISOString() : String(row.rejected_at ?? ''),
      },
    };
  }

  // ─── Source 3: workspace projects JSONB scan ─────────────────────────────
  // Reuse the index's matcher so source-3 logic lives in ONE place. We
  // build a tiny index containing only the projects branch — the SQL
  // sources are already handled above, so empty Maps for those.
  try {
    const allProjects = await listWorkspaceProjects();
    const projects = ((allProjects as Array<Record<string, unknown>>) ?? []).filter((project) => {
      const projWorkspaceId = String(project?.workspaceId ?? '');
      return projWorkspaceId === workspaceId || project?.id === workspaceId;
    }) as BlocklistIndex['projects'];
    const stubIndex: BlocklistIndex = {
      workspaceId,
      candidatesByField: emptyCandidateFieldMap(),
      rejectionsByField: emptyRejectionFieldMap(),
      projects,
    };
    const r = matchAgainstIndex(stubIndex, identity, options);
    if (r.blocked) return r;
  } catch (err) {
    console.warn('[SCOUT_BLOCKLIST] kickoff/live scan failed:', err);
  }

  return { blocked: false };
}

function emptyCandidateFieldMap(): BlocklistIndex['candidatesByField'] {
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

function emptyRejectionFieldMap(): BlocklistIndex['rejectionsByField'] {
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

// Re-export the batch API so existing imports of `isBlocked` can sit next
// to the index API without a second import path.
export { buildBlocklistIndex, matchAgainstIndex } from './scout-blocklist-index';
export type { BlocklistIndex } from './scout-blocklist-index';
