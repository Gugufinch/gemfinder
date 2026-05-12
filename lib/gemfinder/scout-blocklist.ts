// lib/gemfinder/scout-blocklist.ts
import type { BlocklistResult, CandidateIdentity, BlocklistMatchedOn } from './types';
import { listWorkspaceProjects } from './project-store';
import { canonicalizeName } from './scout/identity';
import { getScoutPool } from './scout-candidate-store';

// Match priority: stable IDs first, name last.
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

export async function isBlocked(
  workspaceId: string,
  identity: CandidateIdentity,
  options?: { excludeCandidateId?: string; includeRejections?: boolean }
): Promise<BlocklistResult> {
  const pool = getScoutPool();

  // --- Source 1: scout_candidates table ---
  for (const { identityKey, columnName, matchedOn } of MATCH_FIELDS) {
    const value = identity[identityKey];
    if (!value) continue;

    const query = options?.excludeCandidateId
      ? `select id, display_name from scout_candidates where workspace_id = $1 and ${columnName} = $2 and id != $3 limit 1`
      : `select id, display_name from scout_candidates where workspace_id = $1 and ${columnName} = $2 limit 1`;
    const params: unknown[] = options?.excludeCandidateId
      ? [workspaceId, value, options.excludeCandidateId]
      : [workspaceId, value];

    const res = await pool.query(query, params);
    if (res.rows.length) {
      return {
        blocked: true,
        reason: 'candidate',
        matchedOn,
        matchedRecord: {
          id: res.rows[0].id as string,
          displayName: res.rows[0].display_name as string,
          location: 'Pending in Scout V3',
        },
      };
    }
  }

  // --- Source 2: scout_rejections table (skippable) ---
  if (options?.includeRejections !== false) {
    for (const { identityKey, columnName, matchedOn } of MATCH_FIELDS) {
      const value = identity[identityKey];
      if (!value) continue;

      const res = await pool.query(
        `select id, display_name, reason_code, rejected_at from scout_rejections where workspace_id = $1 and ${columnName} = $2 limit 1`,
        [workspaceId, value]
      );
      if (res.rows.length) {
        const row = res.rows[0];
        return {
          blocked: true,
          reason: 'rejected',
          matchedOn,
          matchedRecord: {
            id: row.id as string,
            displayName: row.display_name as string,
            location: `Rejected (${row.reason_code as string})`,
            addedAt: (row.rejected_at as Date).toISOString(),
          },
        };
      }
    }
  }

  // --- Source 3: Workspace projects JSONB (in-memory scan) ---
  // Covers Kickoff + Live records via listWorkspaceProjects().
  try {
    const projects = await listWorkspaceProjects();
    for (const project of projects) {
      const artists = (project as { artists?: Array<Record<string, unknown>> })?.artists ?? [];
      for (const artist of artists) {
        const artistName   = String(artist?.n     ?? '');
        const artistEmail  = String(artist?.e     ?? '').toLowerCase();
        const artistInsta  = String(artist?.soc   ?? '').replace(/^@/, '');
        const artistSpotify = String(artist?.spotify ?? '');
        const artistStage  = String(artist?.stage ?? 'prospect');
        const reason: 'kickoff' | 'live' = artistStage === 'live' ? 'live' : 'kickoff';

        if (identity.canonicalName && artistName) {
          const artistCanonical = canonicalizeName(artistName);
          if (artistCanonical === identity.canonicalName) {
            return {
              blocked: true,
              reason,
              matchedOn: 'canonical_name',
              matchedRecord: {
                id: artistName,
                displayName: artistName,
                location: `Kickoff · ${artistStage}`,
                stage: artistStage,
              },
            };
          }
        }
        if (identity.primaryEmail && artistEmail === identity.primaryEmail) {
          return {
            blocked: true,
            reason,
            matchedOn: 'primary_email',
            matchedRecord: {
              id: artistName,
              displayName: artistName,
              location: `Kickoff · ${artistStage}`,
              stage: artistStage,
            },
          };
        }
        if (identity.instagramHandle && artistInsta === identity.instagramHandle) {
          return {
            blocked: true,
            reason,
            matchedOn: 'instagram_handle',
            matchedRecord: {
              id: artistName,
              displayName: artistName,
              location: `Kickoff · ${artistStage}`,
              stage: artistStage,
            },
          };
        }
        if (identity.spotifyArtistId && artistSpotify.includes(identity.spotifyArtistId)) {
          return {
            blocked: true,
            reason,
            matchedOn: 'spotify_artist_id',
            matchedRecord: {
              id: artistName,
              displayName: artistName,
              location: `Kickoff · ${artistStage}`,
              stage: artistStage,
            },
          };
        }
      }
    }
  } catch (err) {
    console.warn('[SCOUT_BLOCKLIST] kickoff/live scan failed:', err);
  }

  return { blocked: false };
}
