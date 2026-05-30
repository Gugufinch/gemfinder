// lib/gemfinder/scout-blocklist-query.ts
//
// Audit #6: single-query UNION ALL builder for isBlocked().
//
// THE BUG: the previous isBlocked() fired up to 16 sequential pg queries —
// 8 single-column-match probes against scout_candidates, then 8 against
// scout_rejections. Each one round-tripped the network. A single approve
// hit ~6-10 queries in practice; Hunter's 100-candidate batch fired ~1700.
//
// THE FIX: ONE statement built dynamically based on which identity fields
// are non-empty. Each match column has its own composite index
// `(workspace_id, column) where column is not null`, so each subquery is a
// single index probe + LIMIT 1. The planner runs them, the outer ORDER BY
// priority + LIMIT 1 picks the winner.
//
// Priority encoding — exactly matches the pre-rewrite contract:
//   priority = source * 100 + field_rank
//   source:    0 = scout_candidates, 1 = scout_rejections
//   field:     0..7 in MATCH_FIELDS order (spotify, mb, email, ig, tt, yt, sc, name)
// → "candidate match by spotify" = 0, "rejection match by canonical_name" = 107.

import type { CandidateIdentity, BlocklistMatchedOn } from './types';

const MATCH_FIELDS: Array<{
  identityKey: keyof CandidateIdentity;
  columnName: string;
  matchedOn: BlocklistMatchedOn;
}> = [
  { identityKey: 'spotifyArtistId',  columnName: 'spotify_artist_id', matchedOn: 'spotify_artist_id' },
  { identityKey: 'musicbrainzId',    columnName: 'musicbrainz_id',    matchedOn: 'musicbrainz_id' },
  { identityKey: 'primaryEmail',     columnName: 'primary_email',     matchedOn: 'primary_email' },
  { identityKey: 'instagramHandle',  columnName: 'instagram_handle',  matchedOn: 'instagram_handle' },
  { identityKey: 'tiktokHandle',     columnName: 'tiktok_handle',     matchedOn: 'tiktok_handle' },
  { identityKey: 'youtubeHandle',    columnName: 'youtube_handle',    matchedOn: 'youtube_handle' },
  { identityKey: 'soundcloudHandle', columnName: 'soundcloud_handle', matchedOn: 'soundcloud_handle' },
  { identityKey: 'canonicalName',    columnName: 'canonical_name',    matchedOn: 'canonical_name' },
];

export type BlocklistQueryRow = {
  id: string;
  display_name: string;
  source: 'candidate' | 'rejection';
  matched_on: BlocklistMatchedOn;
  priority: number;
  reason_code: string | null;
  rejected_at: Date | null;
};

export function buildBlocklistQuery(input: {
  workspaceId: string;
  identity: CandidateIdentity;
  excludeCandidateId?: string;
  includeRejections?: boolean;
}): { sql: string; params: unknown[] } {
  const { workspaceId, identity, excludeCandidateId, includeRejections } = input;
  const params: unknown[] = [workspaceId];
  // $1 is always workspace_id. We track the next placeholder index as we
  // accumulate identity values and the optional excludeCandidateId.
  let nextParam = 2;

  const subqueries: string[] = [];

  function bindValue(value: unknown): string {
    params.push(value);
    return `$${nextParam++}`;
  }

  // ─── Candidate subqueries (source priority 0) ────────────────────────────
  let excludePlaceholder: string | null = null;
  if (excludeCandidateId) {
    excludePlaceholder = bindValue(excludeCandidateId);
  }

  MATCH_FIELDS.forEach(({ identityKey, columnName, matchedOn }, idx) => {
    const value = identity[identityKey];
    if (!value || typeof value !== 'string') return;
    const valuePlaceholder = bindValue(value);
    const excludeClause = excludePlaceholder ? ` and id != ${excludePlaceholder}` : '';
    subqueries.push(
      `select id, display_name, 'candidate' as source, '${matchedOn}' as matched_on, ${idx} as priority, ` +
      `null::text as reason_code, null::timestamptz as rejected_at ` +
      `from scout_candidates ` +
      `where workspace_id = $1 and ${columnName} = ${valuePlaceholder}${excludeClause} ` +
      `limit 1`,
    );
  });

  // ─── Rejection subqueries (source priority 1, offset +100) ──────────────
  if (includeRejections !== false) {
    MATCH_FIELDS.forEach(({ identityKey, columnName, matchedOn }, idx) => {
      const value = identity[identityKey];
      if (!value || typeof value !== 'string') return;
      const valuePlaceholder = bindValue(value);
      subqueries.push(
        `select id, display_name, 'rejection' as source, '${matchedOn}' as matched_on, ${100 + idx} as priority, ` +
        `reason_code, rejected_at ` +
        `from scout_rejections ` +
        `where workspace_id = $1 and ${columnName} = ${valuePlaceholder} ` +
        `limit 1`,
      );
    });
  }

  // No identity-matchable fields → return a query that matches nothing.
  // The caller handles "no rows" as "not blocked," so this is fine.
  if (subqueries.length === 0) {
    return {
      sql: `select null::text as id, null::text as display_name, null::text as source, null::text as matched_on, 999 as priority, null::text as reason_code, null::timestamptz as rejected_at where false limit 1`,
      params: [workspaceId],  // workspace_id stays as $1 for shape consistency
    };
  }

  const sql =
    `select id, display_name, source, matched_on, priority, reason_code, rejected_at from (` +
    subqueries.join(' union all ') +
    `) matches ` +
    `order by priority ` +
    `limit 1`;

  return { sql, params };
}
