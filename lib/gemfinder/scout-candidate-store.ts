// lib/gemfinder/scout-candidate-store.ts
import { Pool } from 'pg';
import type { ScoutCandidate, ScoutRejection, ScoutRejectionReason } from './types';

const SCHEMA_SQL = `
create table if not exists scout_candidates (
  id                          uuid primary key default gen_random_uuid(),
  workspace_id                text not null,
  display_name                text not null,
  canonical_name              text not null,
  aliases                     jsonb not null default '[]'::jsonb,
  spotify_url                 text,
  spotify_artist_id           text,
  instagram_handle            text,
  tiktok_handle               text,
  youtube_handle              text,
  youtube_url                 text,
  soundcloud_handle           text,
  soundcloud_url              text,
  musicbrainz_id              text,
  bandcamp_url                text,
  extra_links                 jsonb not null default '[]'::jsonb,
  primary_email               text,
  contact_name                text,
  contact_email               text,
  contact_type                text,
  primary_genre               text,
  genres                      jsonb not null default '[]'::jsonb,
  locations                   jsonb not null default '[]'::jsonb,
  instagram_followers         bigint,
  tiktok_followers            bigint,
  spotify_monthly_listeners   bigint,
  youtube_subscribers         bigint,
  soundcloud_followers        bigint,
  hit_tracks                  jsonb not null default '[]'::jsonb,
  curator_page_url            text,
  artist_role                 text,
  ai_summary                  text,
  living                      boolean,
  source                      text not null,
  source_url                  text,
  source_external_id          text,
  added_by                    text not null,
  score                       numeric,
  weight_snapshot             jsonb,
  enrichment_status           text not null default 'pending',
  enrichment_error            text,
  identity_override           boolean not null default false,
  identity_override_note      text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists idx_scout_cand_workspace_created on scout_candidates (workspace_id, created_at desc);
create index if not exists idx_scout_cand_workspace_score on scout_candidates (workspace_id, score desc nulls last);
create index if not exists idx_scout_cand_canonical_name on scout_candidates (workspace_id, canonical_name);
create index if not exists idx_scout_cand_spotify_artist_id on scout_candidates (workspace_id, spotify_artist_id) where spotify_artist_id is not null;
create index if not exists idx_scout_cand_instagram_handle on scout_candidates (workspace_id, instagram_handle) where instagram_handle is not null;
create index if not exists idx_scout_cand_tiktok_handle on scout_candidates (workspace_id, tiktok_handle) where tiktok_handle is not null;
create index if not exists idx_scout_cand_youtube_handle on scout_candidates (workspace_id, youtube_handle) where youtube_handle is not null;
create index if not exists idx_scout_cand_soundcloud_handle on scout_candidates (workspace_id, soundcloud_handle) where soundcloud_handle is not null;
create index if not exists idx_scout_cand_musicbrainz_id on scout_candidates (workspace_id, musicbrainz_id) where musicbrainz_id is not null;
create index if not exists idx_scout_cand_primary_email on scout_candidates (workspace_id, primary_email) where primary_email is not null;

create table if not exists scout_rejections (
  id                          uuid primary key default gen_random_uuid(),
  workspace_id                text not null,
  display_name                text not null,
  canonical_name              text not null,
  spotify_url                 text,
  spotify_artist_id           text,
  instagram_handle            text,
  tiktok_handle               text,
  youtube_handle              text,
  soundcloud_handle           text,
  musicbrainz_id              text,
  bandcamp_url                text,
  primary_email               text,
  candidate_snapshot          jsonb not null,
  reason_code                 text not null,
  reason_note                 text,
  rejected_by                 text not null,
  rejected_at                 timestamptz not null default now()
);

create index if not exists idx_scout_rej_workspace_rejected_at on scout_rejections (workspace_id, rejected_at desc);
create index if not exists idx_scout_rej_canonical_name on scout_rejections (workspace_id, canonical_name);
create index if not exists idx_scout_rej_spotify_artist_id on scout_rejections (workspace_id, spotify_artist_id) where spotify_artist_id is not null;
create index if not exists idx_scout_rej_instagram_handle on scout_rejections (workspace_id, instagram_handle) where instagram_handle is not null;
create index if not exists idx_scout_rej_tiktok_handle on scout_rejections (workspace_id, tiktok_handle) where tiktok_handle is not null;
create index if not exists idx_scout_rej_youtube_handle on scout_rejections (workspace_id, youtube_handle) where youtube_handle is not null;
create index if not exists idx_scout_rej_soundcloud_handle on scout_rejections (workspace_id, soundcloud_handle) where soundcloud_handle is not null;
create index if not exists idx_scout_rej_musicbrainz_id on scout_rejections (workspace_id, musicbrainz_id) where musicbrainz_id is not null;
create index if not exists idx_scout_rej_primary_email on scout_rejections (workspace_id, primary_email) where primary_email is not null;

-- ============================================================================
-- Hunter v1 schemas
-- ============================================================================

CREATE TABLE IF NOT EXISTS hunter_runs (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        text not null,
  criteria            jsonb not null,
  weights_snapshot    jsonb not null,
  status              text not null default 'running',
  started_at          timestamptz not null default now(),
  completed_at        timestamptz,
  error_message       text,
  summary             jsonb not null default '{}'::jsonb,
  started_by          text not null
);

CREATE INDEX IF NOT EXISTS idx_hunter_runs_workspace_started
  ON hunter_runs (workspace_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_hunter_runs_status_started
  ON hunter_runs (status, started_at) WHERE status = 'running';

CREATE TABLE IF NOT EXISTS hunter_scrape_cache (
  id          uuid primary key default gen_random_uuid(),
  cache_key   text not null unique,
  scrape_url  text not null,
  result      jsonb not null,
  cached_at   timestamptz not null default now(),
  expires_at  timestamptz not null
);

CREATE INDEX IF NOT EXISTS idx_scrape_cache_expires ON hunter_scrape_cache (expires_at);

-- Idempotent column addition to existing scout_candidates table.
-- CREATE TABLE IF NOT EXISTS above is no-op on existing DBs; this ALTER
-- ensures the new column is added on production where the table predates Hunter.
ALTER TABLE scout_candidates
  ADD COLUMN IF NOT EXISTS hunter_run_id uuid;

-- Foreign key constraint (no IF NOT EXISTS support pre-pg9.6, use DO block):
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_scout_candidates_hunter_run'
  ) THEN
    ALTER TABLE scout_candidates
      ADD CONSTRAINT fk_scout_candidates_hunter_run
      FOREIGN KEY (hunter_run_id) REFERENCES hunter_runs(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_scout_cand_hunter_run
  ON scout_candidates (hunter_run_id) WHERE hunter_run_id IS NOT NULL;

-- ============================================================================
-- Hunter observability: per-phase activity events
-- ============================================================================
-- One row per "thing the agent did" — Spotify lookup attempted, IG scrape
-- returned, deep research succeeded/failed. The UI polls this for both
-- live hunter runs (real-time progress) and individual candidate re-enrichments
-- (so the operator can see WHY re-enrich did or didn't change anything).
--
-- run_id and candidate_id are both nullable + soft FKs — we deliberately
-- don't cascade-delete: a run can be purged and we still want to inspect
-- its events; a candidate can be deleted and its history persists as audit.

CREATE TABLE IF NOT EXISTS hunter_events (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  text not null,
  run_id        uuid,
  candidate_id  uuid,
  phase         text not null,
  status        text not null,
  message       text not null,
  data          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_hunter_events_workspace_candidate
  ON hunter_events (workspace_id, candidate_id, created_at DESC)
  WHERE candidate_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hunter_events_workspace_run
  ON hunter_events (workspace_id, run_id, created_at DESC)
  WHERE run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hunter_events_workspace_recent
  ON hunter_events (workspace_id, created_at DESC);

-- ============================================================================
-- Scout feedback: every approve/reject decision becomes a row here so we can
-- learn from operator behavior over time. Phase 1 = capture only; phase 2
-- will compute per-dimension weight adjustments from accumulated data.
-- ============================================================================
-- Each row records the candidate's state AT THE MOMENT of the decision:
-- the score, the per-dimension breakdown, key fields like spotify follower
-- count + genres + contact_readiness. This is the training data for future
-- weight learning. Snapshots are JSONB so the schema can evolve without
-- migrations.

CREATE TABLE IF NOT EXISTS scout_feedback (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        text not null,
  candidate_id        uuid,                   -- soft FK (candidate may be deleted)
  action              text not null,          -- 'approve' | 'reject'
  reason_code         text,                   -- for rejects: the SCOUT_V3_REJECT_REASONS code
  score_at_decision   real,
  dim_snapshot        jsonb not null default '{}'::jsonb,
  candidate_snapshot  jsonb not null default '{}'::jsonb,
  actor_email         text not null,
  created_at          timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_scout_feedback_workspace_action
  ON scout_feedback (workspace_id, action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scout_feedback_candidate
  ON scout_feedback (candidate_id)
  WHERE candidate_id IS NOT NULL;
`;

let pool: Pool | null = null;
let schemaReady = false;

// EXPORTED so route handlers can checkout clients for their own transactions
// (e.g. PATCH approve needs SELECT FOR UPDATE on candidate row).
// Single process-wide pool — never create new ones per request.
export function getScoutPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 8,
    });
  }
  return pool;
}

// Internal alias used by this module's own queries.
function getPool(): Pool {
  return getScoutPool();
}

export async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  await getPool().query(SCHEMA_SQL);
  schemaReady = true;
}

// snake_case → camelCase row mapping
function rowToCandidate(row: Record<string, unknown>): ScoutCandidate {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    displayName: row.display_name as string,
    canonicalName: row.canonical_name as string,
    aliases: row.aliases as string[],
    spotifyUrl: row.spotify_url as string | undefined,
    spotifyArtistId: row.spotify_artist_id as string | undefined,
    instagramHandle: row.instagram_handle as string | undefined,
    tiktokHandle: row.tiktok_handle as string | undefined,
    youtubeHandle: row.youtube_handle as string | undefined,
    youtubeUrl: row.youtube_url as string | undefined,
    soundcloudHandle: row.soundcloud_handle as string | undefined,
    soundcloudUrl: row.soundcloud_url as string | undefined,
    musicbrainzId: row.musicbrainz_id as string | undefined,
    bandcampUrl: row.bandcamp_url as string | undefined,
    extraLinks: row.extra_links as ScoutCandidate['extraLinks'],
    primaryEmail: row.primary_email as string | undefined,
    contactName: row.contact_name as string | undefined,
    contactEmail: row.contact_email as string | undefined,
    contactType: row.contact_type as ScoutCandidate['contactType'],
    primaryGenre: row.primary_genre as string | undefined,
    genres: row.genres as string[],
    locations: row.locations as string[],
    instagramFollowers: row.instagram_followers as number | undefined,
    tiktokFollowers: row.tiktok_followers as number | undefined,
    spotifyMonthlyListeners: row.spotify_monthly_listeners as number | undefined,
    youtubeSubscribers: row.youtube_subscribers as number | undefined,
    soundcloudFollowers: row.soundcloud_followers as number | undefined,
    hitTracks: row.hit_tracks as string[],
    curatorPageUrl: row.curator_page_url as string | undefined,
    artistRole: row.artist_role as ScoutCandidate['artistRole'],
    aiSummary: row.ai_summary as string | undefined,
    living: row.living as boolean | undefined,
    source: row.source as string,
    sourceUrl: row.source_url as string | undefined,
    sourceExternalId: row.source_external_id as string | undefined,
    addedBy: row.added_by as string,
    score: row.score as number | undefined,
    weightSnapshot: row.weight_snapshot as Record<string, unknown> | undefined,
    enrichmentStatus: row.enrichment_status as ScoutCandidate['enrichmentStatus'],
    enrichmentError: row.enrichment_error as string | undefined,
    identityOverride: row.identity_override as boolean,
    identityOverrideNote: row.identity_override_note as string | undefined,
    hunterRunId: row.hunter_run_id as string ?? undefined,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

function rowToRejection(row: Record<string, unknown>): ScoutRejection {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    displayName: row.display_name as string,
    canonicalName: row.canonical_name as string,
    spotifyUrl: row.spotify_url as string | undefined,
    spotifyArtistId: row.spotify_artist_id as string | undefined,
    instagramHandle: row.instagram_handle as string | undefined,
    tiktokHandle: row.tiktok_handle as string | undefined,
    youtubeHandle: row.youtube_handle as string | undefined,
    soundcloudHandle: row.soundcloud_handle as string | undefined,
    musicbrainzId: row.musicbrainz_id as string | undefined,
    bandcampUrl: row.bandcamp_url as string | undefined,
    primaryEmail: row.primary_email as string | undefined,
    candidateSnapshot: row.candidate_snapshot as Record<string, unknown>,
    reasonCode: row.reason_code as ScoutRejectionReason,
    reasonNote: row.reason_note as string | undefined,
    rejectedBy: row.rejected_by as string,
    rejectedAt: (row.rejected_at as Date).toISOString(),
  };
}

export async function createCandidate(input: ScoutCandidate): Promise<ScoutCandidate> {
  const res = await getPool().query(
    `insert into scout_candidates (
      id, workspace_id, display_name, canonical_name, aliases,
      spotify_url, spotify_artist_id, instagram_handle, tiktok_handle, youtube_handle, youtube_url,
      soundcloud_handle, soundcloud_url, musicbrainz_id, bandcamp_url, extra_links,
      primary_email, contact_name, contact_email, contact_type,
      primary_genre, genres, locations,
      instagram_followers, tiktok_followers, spotify_monthly_listeners, youtube_subscribers, soundcloud_followers,
      hit_tracks, curator_page_url, artist_role, ai_summary, living,
      source, source_url, source_external_id, added_by,
      score, weight_snapshot, enrichment_status, enrichment_error,
      identity_override, identity_override_note, hunter_run_id,
      created_at, updated_at
    ) values (
      $1, $2, $3, $4, $5::jsonb,
      $6, $7, $8, $9, $10, $11,
      $12, $13, $14, $15, $16::jsonb,
      $17, $18, $19, $20,
      $21, $22::jsonb, $23::jsonb,
      $24, $25, $26, $27, $28,
      $29::jsonb, $30, $31, $32, $33,
      $34, $35, $36, $37,
      $38, $39::jsonb, $40, $41,
      $42, $43, $44,
      $45, $46
    ) returning *`,
    [
      input.id, input.workspaceId, input.displayName, input.canonicalName, JSON.stringify(input.aliases),
      input.spotifyUrl, input.spotifyArtistId, input.instagramHandle, input.tiktokHandle, input.youtubeHandle, input.youtubeUrl,
      input.soundcloudHandle, input.soundcloudUrl, input.musicbrainzId, input.bandcampUrl, JSON.stringify(input.extraLinks),
      input.primaryEmail, input.contactName, input.contactEmail, input.contactType,
      input.primaryGenre, JSON.stringify(input.genres), JSON.stringify(input.locations),
      input.instagramFollowers, input.tiktokFollowers, input.spotifyMonthlyListeners, input.youtubeSubscribers, input.soundcloudFollowers,
      JSON.stringify(input.hitTracks), input.curatorPageUrl, input.artistRole, input.aiSummary, input.living,
      input.source, input.sourceUrl, input.sourceExternalId, input.addedBy,
      input.score, input.weightSnapshot ? JSON.stringify(input.weightSnapshot) : null, input.enrichmentStatus, input.enrichmentError,
      input.identityOverride, input.identityOverrideNote, input.hunterRunId ?? null,
      input.createdAt, input.updatedAt,
    ]
  );
  return rowToCandidate(res.rows[0]);
}

export async function getCandidate(workspaceId: string, id: string): Promise<ScoutCandidate | null> {
  const res = await getPool().query(
    `select * from scout_candidates where workspace_id = $1 and id = $2 limit 1`,
    [workspaceId, id]
  );
  return res.rows.length ? rowToCandidate(res.rows[0]) : null;
}

export async function listCandidatesByWorkspace(
  workspaceId: string,
  options?: { limit?: number; offset?: number; orderBy?: 'created_at' | 'score' }
): Promise<ScoutCandidate[]> {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  const orderBy = options?.orderBy === 'score' ? 'score desc nulls last, created_at desc' : 'created_at desc';
  const res = await getPool().query(
    `select * from scout_candidates where workspace_id = $1 order by ${orderBy} limit $2 offset $3`,
    [workspaceId, limit, offset]
  );
  return res.rows.map(rowToCandidate);
}

/**
 * List candidates inserted by a specific hunter run. Used by the run-detail
 * UI to show "what came out of this run" inline without forcing the user
 * to switch to the Queue tab and find them. Sorted by score desc so the
 * strongest hits surface first.
 *
 * Returns an empty array for unknown runIds (no error) — the UI handles
 * the empty case.
 */
/**
 * Return the canonical names of every artist we've EVER touched in this
 * workspace — pending queue, rejected, AND the candidate snapshots from
 * rejections (which preserve canonical name even after the candidate row
 * is gone). Feeds the LLM agent's "don't suggest these" memory so Gemini
 * stops returning the same buzzy names every hunt.
 *
 * Cap at 500 names to keep the prompt bounded — even if a workspace has
 * thousands of historic rejections, the LLM only needs to know "we already
 * have a lot of these tier 1 names" not the full list. We sort by most
 * recent to bias the dedup toward currently-relevant names.
 */
export async function listKnownCanonicalNames(
  workspaceId: string,
  limit: number = 500,
): Promise<string[]> {
  // UNION across active candidates + rejections. Both store canonical_name.
  const res = await getPool().query(
    `(
       select canonical_name, created_at from scout_candidates
       where workspace_id = $1 and canonical_name is not null
     )
     union
     (
       select canonical_name, rejected_at as created_at from scout_rejections
       where workspace_id = $1 and canonical_name is not null
     )
     order by created_at desc
     limit $2`,
    [workspaceId, limit],
  );
  return res.rows.map((r) => r.canonical_name as string).filter(Boolean);
}

export async function listCandidatesByHunterRun(
  workspaceId: string,
  hunterRunId: string,
): Promise<ScoutCandidate[]> {
  const res = await getPool().query(
    `select * from scout_candidates
     where workspace_id = $1 and hunter_run_id = $2
     order by score desc nulls last, created_at desc`,
    [workspaceId, hunterRunId],
  );
  return res.rows.map(rowToCandidate);
}

export async function deleteCandidate(workspaceId: string, id: string): Promise<boolean> {
  const res = await getPool().query(
    `delete from scout_candidates where workspace_id = $1 and id = $2`,
    [workspaceId, id]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function updateCandidate(
  workspaceId: string,
  id: string,
  patch: Partial<ScoutCandidate>
): Promise<ScoutCandidate | null> {
  // Build SET clause dynamically; map camelCase → snake_case for known fields.
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  const camelToSnake: Record<string, string> = {
    displayName: 'display_name',
    canonicalName: 'canonical_name',
    aliases: 'aliases',
    spotifyUrl: 'spotify_url',
    spotifyArtistId: 'spotify_artist_id',
    instagramHandle: 'instagram_handle',
    tiktokHandle: 'tiktok_handle',
    youtubeHandle: 'youtube_handle',
    youtubeUrl: 'youtube_url',
    soundcloudHandle: 'soundcloud_handle',
    soundcloudUrl: 'soundcloud_url',
    musicbrainzId: 'musicbrainz_id',
    bandcampUrl: 'bandcamp_url',
    extraLinks: 'extra_links',
    primaryEmail: 'primary_email',
    contactName: 'contact_name',
    contactEmail: 'contact_email',
    contactType: 'contact_type',
    primaryGenre: 'primary_genre',
    genres: 'genres',
    locations: 'locations',
    instagramFollowers: 'instagram_followers',
    tiktokFollowers: 'tiktok_followers',
    spotifyMonthlyListeners: 'spotify_monthly_listeners',
    youtubeSubscribers: 'youtube_subscribers',
    soundcloudFollowers: 'soundcloud_followers',
    hitTracks: 'hit_tracks',
    curatorPageUrl: 'curator_page_url',
    artistRole: 'artist_role',
    aiSummary: 'ai_summary',
    living: 'living',
    source: 'source',
    sourceUrl: 'source_url',
    sourceExternalId: 'source_external_id',
    addedBy: 'added_by',
    score: 'score',
    weightSnapshot: 'weight_snapshot',
    enrichmentStatus: 'enrichment_status',
    enrichmentError: 'enrichment_error',
    identityOverride: 'identity_override',
    identityOverrideNote: 'identity_override_note',
  };
  const jsonbColumns = new Set(['aliases', 'extra_links', 'genres', 'locations', 'hit_tracks', 'weight_snapshot']);

  for (const [camelKey, value] of Object.entries(patch)) {
    const snakeKey = camelToSnake[camelKey];
    if (!snakeKey) continue;        // skip unknown fields
    if (jsonbColumns.has(snakeKey)) {
      fields.push(`${snakeKey} = $${i++}::jsonb`);
      values.push(value === undefined ? null : JSON.stringify(value));
    } else {
      fields.push(`${snakeKey} = $${i++}`);
      values.push(value);
    }
  }

  // Guard: refuse to write a no-op patch. If no mapped fields, return the
  // existing row unchanged rather than running an updated_at-only update
  // that silently looks like the patch was applied.
  if (fields.length === 0) {
    return getCandidate(workspaceId, id);
  }

  fields.push(`updated_at = now()`);

  values.push(workspaceId, id);
  const res = await getPool().query(
    `update scout_candidates set ${fields.join(', ')} where workspace_id = $${i++} and id = $${i++} returning *`,
    values
  );
  return res.rows.length ? rowToCandidate(res.rows[0]) : null;
}

export async function createRejection(input: ScoutRejection): Promise<ScoutRejection> {
  const res = await getPool().query(
    `insert into scout_rejections (
      id, workspace_id, display_name, canonical_name,
      spotify_url, spotify_artist_id, instagram_handle, tiktok_handle, youtube_handle, soundcloud_handle, musicbrainz_id, bandcamp_url, primary_email,
      candidate_snapshot, reason_code, reason_note, rejected_by, rejected_at
    ) values (
      $1, $2, $3, $4,
      $5, $6, $7, $8, $9, $10, $11, $12, $13,
      $14::jsonb, $15, $16, $17, $18
    ) returning *`,
    [
      input.id, input.workspaceId, input.displayName, input.canonicalName,
      input.spotifyUrl, input.spotifyArtistId, input.instagramHandle, input.tiktokHandle, input.youtubeHandle, input.soundcloudHandle, input.musicbrainzId, input.bandcampUrl, input.primaryEmail,
      JSON.stringify(input.candidateSnapshot), input.reasonCode, input.reasonNote, input.rejectedBy, input.rejectedAt,
    ]
  );
  return rowToRejection(res.rows[0]);
}

export async function listRejectionsByWorkspace(
  workspaceId: string,
  options?: { limit?: number; offset?: number }
): Promise<ScoutRejection[]> {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  const res = await getPool().query(
    `select * from scout_rejections where workspace_id = $1 order by rejected_at desc limit $2 offset $3`,
    [workspaceId, limit, offset]
  );
  return res.rows.map(rowToRejection);
}

export async function getStats(workspaceId: string): Promise<{ pendingCount: number; rejectedCount: number }> {
  const res = await getPool().query(
    `select
       (select count(*)::int from scout_candidates where workspace_id = $1) as pending,
       (select count(*)::int from scout_rejections where workspace_id = $1) as rejected`,
    [workspaceId]
  );
  return {
    pendingCount: Number(res.rows[0].pending),
    rejectedCount: Number(res.rows[0].rejected),
  };
}

// ============================================================================
// Hunter activity events — per-phase observability
// ============================================================================
//
// Why a separate table instead of stuffing into hunter_runs.summary:
//   - We want per-candidate granularity (re-enrich shows just that candidate's
//     events, not the whole run)
//   - We want appendable timeline ordering for streaming UIs
//   - We want events to survive a run being purged (audit trail)
//
// All writes are fire-and-forget — a logging failure must NEVER break the
// enrichment pipeline. Callers should not await emitEvent or handle its errors.

export type HunterEventPhase =
  | 'meta'           // pipeline-level: 'starting re-enrich', 'enrichment complete'
  | 'mb_fetch'       // MusicBrainz artist lookup
  | 'deep_research'  // Gemini verification + summary
  | 'spotify'        // Spotify artist resolution (by ID or by name search)
  | 'top_tracks'     // Spotify top tracks fetch
  | 'ig_scrape'      // Instagram follower scrape via Steel
  | 'tt_scrape'      // TikTok follower scrape via Steel
  | 'yt_scrape'      // YouTube subscriber scrape via Steel
  | 'sc_scrape'      // SoundCloud follower scrape via Steel
  | 'score'          // Score recomputation
  | 'cache';         // Cache hit/miss

export type HunterEventStatus = 'started' | 'success' | 'failed' | 'skipped';

export interface HunterEvent {
  id: string;
  workspaceId: string;
  runId: string | null;
  candidateId: string | null;
  phase: HunterEventPhase;
  status: HunterEventStatus;
  message: string;
  data: Record<string, unknown>;
  createdAt: string;
}

function rowToEvent(row: Record<string, unknown>): HunterEvent {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    runId: (row.run_id as string) || null,
    candidateId: (row.candidate_id as string) || null,
    phase: row.phase as HunterEventPhase,
    status: row.status as HunterEventStatus,
    message: row.message as string,
    data: (row.data as Record<string, unknown>) || {},
    createdAt: (row.created_at as Date).toISOString(),
  };
}

/**
 * Insert a hunter activity event. Fire-and-forget — never throws.
 *
 * Usage:
 *   emitEvent({ workspaceId, candidateId, phase: 'spotify', status: 'success',
 *               message: 'Matched by name', data: { spotifyArtistId: '...' } });
 *
 * If the DB write fails, we log a warning and swallow — the caller's
 * enrichment work continues unaffected.
 */
export async function emitEvent(input: {
  workspaceId: string;
  runId?: string | null;
  candidateId?: string | null;
  phase: HunterEventPhase;
  status: HunterEventStatus;
  message: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  try {
    await ensureSchema();
    await getPool().query(
      `INSERT INTO hunter_events (workspace_id, run_id, candidate_id, phase, status, message, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        input.workspaceId,
        input.runId ?? null,
        input.candidateId ?? null,
        input.phase,
        input.status,
        input.message.slice(0, 500), // hard cap to keep rows small
        JSON.stringify(input.data ?? {}),
      ]
    );
  } catch (err) {
    console.warn('[HUNTER_EVENT] insert failed (non-fatal):', err);
  }
}

// ============================================================================
// Scout feedback — learn-from-operator-decisions data layer
// ============================================================================

export interface ScoutFeedback {
  id: string;
  workspaceId: string;
  candidateId: string | null;
  action: 'approve' | 'reject';
  reasonCode: string | null;
  scoreAtDecision: number | null;
  dimSnapshot: Record<string, number>;
  candidateSnapshot: Record<string, unknown>;
  actorEmail: string;
  createdAt: string;
}

/**
 * Capture one approve/reject decision into the training-data table. Called
 * fire-and-forget from the approve/reject handlers — a logging failure must
 * NEVER block the operator's actual decision. Internal try/catch swallows
 * errors with a warning.
 */
export async function createFeedback(input: {
  workspaceId: string;
  candidateId: string | null;
  action: 'approve' | 'reject';
  reasonCode?: string | null;
  scoreAtDecision?: number | null;
  dimSnapshot?: Record<string, number>;
  candidateSnapshot?: Record<string, unknown>;
  actorEmail: string;
}): Promise<void> {
  try {
    await ensureSchema();
    await getPool().query(
      `INSERT INTO scout_feedback
       (workspace_id, candidate_id, action, reason_code, score_at_decision,
        dim_snapshot, candidate_snapshot, actor_email)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)`,
      [
        input.workspaceId,
        input.candidateId ?? null,
        input.action,
        input.reasonCode ?? null,
        input.scoreAtDecision ?? null,
        JSON.stringify(input.dimSnapshot ?? {}),
        JSON.stringify(input.candidateSnapshot ?? {}),
        input.actorEmail,
      ]
    );
  } catch (err) {
    console.warn('[SCOUT_FEEDBACK] insert failed (non-fatal):', err);
  }
}

/**
 * Aggregate feedback for an admin overview: approval rate, top-performing
 * dimensions, dim averages per outcome. Phase 1 surface — exact shape will
 * evolve as the weight-learning system gets built out.
 */
export async function summarizeFeedback(workspaceId: string): Promise<{
  totalDecisions: number;
  approvedCount: number;
  rejectedCount: number;
  approvalRate: number;          // 0..1
  averageScoreApproved: number | null;
  averageScoreRejected: number | null;
  topRejectionReasons: Array<{ reasonCode: string; count: number }>;
  dimAveragesApproved: Record<string, number>;  // dim → avg score among approved candidates
  dimAveragesRejected: Record<string, number>;  // dim → avg score among rejected candidates
}> {
  const pool = getPool();

  // Pull all feedback rows for this workspace. The dataset is bounded by
  // operator decisions (one row per approve/reject), so even after a year of
  // heavy usage we're well under 10k rows — single-query aggregation is fine.
  const res = await pool.query(
    `SELECT action, reason_code, score_at_decision, dim_snapshot
     FROM scout_feedback WHERE workspace_id = $1`,
    [workspaceId]
  );
  const rows = res.rows as Array<{
    action: 'approve' | 'reject';
    reason_code: string | null;
    score_at_decision: number | null;
    dim_snapshot: Record<string, number>;
  }>;

  const approved = rows.filter((r) => r.action === 'approve');
  const rejected = rows.filter((r) => r.action === 'reject');

  const avgScore = (subset: typeof rows) => {
    const scored = subset.filter((r) => typeof r.score_at_decision === 'number');
    if (!scored.length) return null;
    const sum = scored.reduce((acc, r) => acc + (r.score_at_decision ?? 0), 0);
    return Math.round((sum / scored.length) * 10) / 10;  // round to 1 decimal
  };

  // Top rejection reasons — sorted desc by count.
  const reasonCounts: Record<string, number> = {};
  for (const r of rejected) {
    const code = r.reason_code ?? 'unspecified';
    reasonCounts[code] = (reasonCounts[code] ?? 0) + 1;
  }
  const topRejectionReasons = Object.entries(reasonCounts)
    .map(([reasonCode, count]) => ({ reasonCode, count }))
    .sort((a, b) => b.count - a.count);

  // Per-dim averages across approved vs rejected. Helps surface "which
  // dimensions correlate with approval" — e.g., maybe TikTok followers is a
  // much stronger approval signal than Spotify followers in this workspace.
  const dimAverages = (subset: typeof rows): Record<string, number> => {
    const sums: Record<string, number> = {};
    const counts: Record<string, number> = {};
    for (const r of subset) {
      for (const [dim, val] of Object.entries(r.dim_snapshot ?? {})) {
        if (typeof val !== 'number') continue;
        sums[dim] = (sums[dim] ?? 0) + val;
        counts[dim] = (counts[dim] ?? 0) + 1;
      }
    }
    const result: Record<string, number> = {};
    for (const dim of Object.keys(sums)) {
      result[dim] = Math.round((sums[dim] / counts[dim]) * 10) / 10;
    }
    return result;
  };

  return {
    totalDecisions: rows.length,
    approvedCount: approved.length,
    rejectedCount: rejected.length,
    approvalRate: rows.length > 0 ? approved.length / rows.length : 0,
    averageScoreApproved: avgScore(approved),
    averageScoreRejected: avgScore(rejected),
    topRejectionReasons,
    dimAveragesApproved: dimAverages(approved),
    dimAveragesRejected: dimAverages(rejected),
  };
}

/**
 * Read events for the UI. Two query shapes:
 *   - { candidateId } — per-candidate timeline (used by candidate info modal)
 *   - { runId } — per-run streaming feed (used by Hunter run detail view)
 * Both support `since` for incremental polling.
 *
 * Order: when `since` is provided, returns ASC (so client can append to its
 * existing log); otherwise DESC (most recent first for historical view).
 */
export async function listEvents(opts: {
  workspaceId: string;
  candidateId?: string | null;
  runId?: string | null;
  since?: string | null;
  limit?: number;
}): Promise<HunterEvent[]> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const params: unknown[] = [opts.workspaceId];
  const where: string[] = ['workspace_id = $1'];
  let i = 2;
  if (opts.candidateId) {
    where.push(`candidate_id = $${i++}`);
    params.push(opts.candidateId);
  }
  if (opts.runId) {
    where.push(`run_id = $${i++}`);
    params.push(opts.runId);
  }
  if (opts.since) {
    where.push(`created_at > $${i++}`);
    params.push(opts.since);
  }
  const order = opts.since ? 'asc' : 'desc';
  params.push(limit);
  const res = await getPool().query(
    `SELECT * FROM hunter_events WHERE ${where.join(' AND ')} ORDER BY created_at ${order} LIMIT $${i}`,
    params
  );
  return res.rows.map(rowToEvent);
}
