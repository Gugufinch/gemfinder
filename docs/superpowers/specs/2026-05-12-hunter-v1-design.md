# Hunter v1 Design

**Date**: 2026-05-12
**Status**: Approved, pending spec review
**Phase**: Hunter v1 — the agent ingestion subsystem for Scout V3
**Related**:
- Scout V3 S0+S1 spec: `docs/superpowers/specs/2026-04-22-scout-v3-s0-s1-design.md`
- Scout V3 S0+S1 plan: `docs/superpowers/plans/2026-05-11-scout-v3-s0-s1.md`

## Context

Scout V3 shipped as a pre-engagement candidate queue with manual-add only. Greg explicitly requested next:

> "Get S3+ roadmap in motion for hunter — we should have an agent brain that cross references the other stages and makes sure new artists hunter finds are not in kickoff or live AND artists can be populated and added based on specific weights or parameters."

Hunter v1 collapses 3 originally-separate roadmap phases into one shippable feature:
- **S2** (weighted scoring + tuning UI)
- **S3** (first scraper source — MusicBrainz)
- **S5** (enrichment pipeline — limited subset for v1)

The result: a button Greg can click that runs an autonomous agent which searches MusicBrainz, enriches candidates via Spotify Web API + Steel browser-scraping, scores them against tunable weights, gates them through quality + dedup filters, and inserts top-ranked candidates into the Scout V3 queue.

## Product statement

Hunter answers one question:

> *"What new artists exist that I haven't seen yet, ranked by how well they match what I'm looking for?"*

The primary object is a **hunt run** — a parameterized search that produces a ranked batch of candidates. Each run is reproducible (criteria + weights snapshot), traceable (every candidate links back to the run that found them), and respects the global blocklist (no candidate already in Kickoff/Live/Rejected is surfaced).

## Roadmap context

Hunter v1 ships as the first agent inside the broader Scout V3 ecosystem.

| Phase | Scope | Status |
|---|---|---|
| Scout V3 S0+S1 | Candidate pool + manual entry + approve/reject | Shipped |
| **Hunter v1** | **MusicBrainz agent + Spotify enrichment + Steel website scrape + weighted scoring + run history** | **THIS SPEC** |
| Hunter v1.1 | Sliders-based weight tuning UI, IG/TikTok scraping (more Steel use), Spotify monthly listeners scrape | Future |
| Hunter v2 | Scheduled/always-on hunts, second agent (Bandcamp or Setlist.fm) | Future |
| Hunter v3 | Multi-agent orchestration, real Curator-vs-Performer classifier, weight presets per persona | Future |

## Key architectural decisions

1. **Hunter lives INSIDE Scout V3** — not a separate top-level workspace surface. Two new tabs (`Search` + `Runs`) join the existing `Queue` + `Rejection log`. Hunter is the engine that fills the candidate queue.

2. **Manual-trigger first, scheduled later** — v1 only supports user-triggered hunts ("click button → agent runs"). Scheduled/always-on mode is v2. The pipeline implementation is designed so the same agent handler can be wrapped in a cron trigger later.

3. **Async with run tracking from day one** — POST returns 202 with `runId`, agent runs in background via `setImmediate`, client polls for status. Run history is first-class via `hunter_runs` table. Long enrichment (with Steel scraping) means sync execution would block requests for minutes; async is mandatory.

4. **Three-source enrichment**: MusicBrainz (core artist data) + Spotify Web API (followers, popularity, genres) + Steel (one website scrape per candidate for contact extraction). Free or low-cost everywhere; designed to fit Steel's free tier.

5. **Hard quality gates + TOP_N selection** — every candidate must pass gates (genre match, living, reachable, not blocked) before scoring. Top N (default 25) by score get inserted.

6. **Contact-readiness fallback rule** — agent searches for direct email first (MB tags, website scrape). If no email found, accepts manager/agency. If neither, accepts social-only (verified active social URL). If no path at all, gate fails.

7. **Aggressive scrape caching** — Steel results cached 30 days by URL. Re-running hunts on similar criteria reuses cached scrapes for known artists, cutting quota burn dramatically.

8. **Weight snapshots on each run** — current weights are copied into `hunter_runs.weights_snapshot` at run start. Future weight tweaks don't re-score historical runs. Scores are permanent for their run's snapshot.

9. **Graceful degradation** — Steel quota exhaustion, Spotify API errors, or network timeouts mark candidates `enrichment_status: partial` and proceed without that data, never killing an entire run.

10. **Same feature flag as Scout V3** — Hunter is gated on the existing `featureFlags.scoutV3` flag. No separate Hunter flag in v1; future kill-switch can add one if needed.

## Files to create

| File | Purpose |
|---|---|
| `lib/gemfinder/hunter/orchestrator.ts` | Top-level: enqueue runs, dispatch pipeline, finalize |
| `lib/gemfinder/hunter/musicbrainz.ts` | MusicBrainz API client (rate-limited 1 req/sec, token bucket) |
| `lib/gemfinder/hunter/spotify.ts` | Spotify Web API client (Client Credentials flow, token cache) |
| `lib/gemfinder/hunter/steel.ts` | Steel browser API client (single-page scrape, quota-aware) |
| `lib/gemfinder/hunter/scrape-cache.ts` | `hunter_scrape_cache` table CRUD (30-day TTL) |
| `lib/gemfinder/hunter/enrichment.ts` | Per-candidate enrichment pipeline (MB → Spotify → Steel) |
| `lib/gemfinder/hunter/gates.ts` | Gate evaluation (genre/living/reachable/blocked) |
| `lib/gemfinder/hunter/scoring.ts` | Weighted score computation across 12 dimensions |
| `lib/gemfinder/hunter/weights-store.ts` | Get/set workspace weights in `project.settings.hunterWeights` |
| `lib/gemfinder/hunter-runs-store.ts` | `hunter_runs` CRUD, status transitions, stale sweeper |
| `app/api/ar/scout/hunter/run/route.ts` | POST = enqueue new run, GET = list runs |
| `app/api/ar/scout/hunter/run/[id]/route.ts` | GET status for one run |
| `app/api/ar/scout/hunter/weights/route.ts` | GET + PUT workspace weights config |
| Test files co-located with each module | vitest coverage |

## Files to modify

| File | Change |
|---|---|
| `lib/gemfinder/types.ts` | Add HunterRun, HunterCriteria, HunterWeights, HunterRunStatus, HunterRunSummary, HunterSource types |
| `lib/gemfinder/scout-candidate-store.ts` | Add `hunter_run_id` column to scout_candidates schema; extend SCHEMA_SQL |
| `app/ar/GemFinderApp.jsx` | Scout V3 surface gains Search tab + Runs tab; new render functions + state hooks |
| `app/api/ar/scout/health/route.ts` | (already done in eedc4a3) extended with Hunter env var + Spotify token checks |

## Non-goals for v1

- No scheduled / always-on / cron-based hunts (v2)
- No real-time Server-Sent Events for status streaming (v1 uses 5-sec polling)
- No second agent beyond MusicBrainz (Bandcamp, Setlist.fm, Songkick etc. are v2)
- No real Spotify monthly listeners scrape (deferred to v1.1; v1 uses followers + popularity only)
- No Instagram or TikTok follower scraping in v1 (steel quota conservation)
- No real Curator-vs-Performer classifier (v3); v1 uses heuristic from MB artist type
- No sliders/numbers weight tuning UI (v1 ships raw JSON editor; visual editor in v1.1)
- No saved-search presets (v1.1)
- No bulk-approve from a single run (v1.1)
- No run analytics dashboard / aggregate metrics view (v1.1)
- No per-candidate enrichment retries when run is incomplete (start fresh run instead)

## Architecture

### Component diagram

```
HUNTER SURFACE (new tabs in Scout V3 screen)
  ├ Queue tab          (existing — unchanged)
  ├ Rejection log tab  (existing — unchanged)
  ├ Search tab         — NEW: criteria form + Run hunt button
  └ Runs tab           — NEW: hunter_runs history table

       │ POST /api/ar/scout/hunter/run                  GET /api/ar/scout/hunter/run/[id]
       ▼                                                ▲
HUNTER ORCHESTRATOR (lib/gemfinder/hunter/orchestrator.ts)
  1. Load HunterWeights for workspace
  2. Insert hunter_runs row (status=running)
  3. Return 202 with { runId }
  4. setImmediate(() => pipeline(runId)).catch(failRun)
       │
       │ (async, fire-and-forget)
       ▼
PIPELINE (per run, runs in background)
  Phase A — MusicBrainz FETCH
    musicbrainz.searchArtists(criteria)
    Rate-limited token bucket (1 req/sec, shared singleton)
    Updates summary.fetched

  Phase B — ENRICH each candidate (concurrency: 8)
    enrichment.enrichCandidate(mbArtist)
      → MusicBrainz details (url-rels, release-groups, tags)
      → Spotify Web API /v1/artists/{id} (if MB has spotify URL)
          → followers.total, popularity, genres
      → Steel scrape of highest-priority URL (website > bandcamp > IG)
          → check scrape cache first; spend Steel session only if miss
          → extract: contact email, manager info, recency signals
      → Build EnrichedCandidate

  Phase C — GATE check
    gates.evaluateGates(enrichedCandidate, weights, isBlockedResult)
      → require_not_blocked  (calls isBlocked from scout-blocklist)
      → require_living       (MB life-span.end is null)
      → require_genre_match  (genres intersect weights.genre_fit.targetGenres)
      → require_reachable    (has email | manager | active social fallback)
    Failed gate → increment summary.gated_out, continue

  Phase D — SCORE (gate-passers only)
    scoring.computeScore(enrichedCandidate, weights)
      → For each weight dimension: compute 0-100 sub-score
      → If candidate lacks data for dimension: use dimension.missing_baseline
      → final = Σ(sub × dim.weight) / Σ(dim.weight)
    Returns { final: 0-100, perDimension: { ... } }

  Phase E — SORT + TOP_N
    Sort scored candidates by final score DESC
    Take top criteria.targetCount (default 25)

  Phase F — INSERT
    For each top-N candidate:
      → INSERT into scout_candidates with:
          source = "agent:hunter:musicbrainz"
          hunter_run_id = runId
          score = final
          weight_snapshot = run's weights JSONB
          enrichment_status = "partial" | "complete"
          (plus all enriched fields)
      → Increment summary.added

  Phase G — FINALIZE
    UPDATE hunter_runs SET status='complete', completed_at=NOW(), summary=...
```

### Pipeline guarantees

- **Per-candidate error isolation**: try/catch wraps each candidate. One bad candidate (e.g., Steel scrape timeout on a single artist) doesn't fail the entire run. Errors collected into `summary.errors[]`.
- **Idempotency**: re-running same criteria re-fetches from MB but `isBlocked` filters out already-handled candidates (approved-in-Kickoff, rejected, still-pending in queue). Only genuinely-new artists make it through.
- **Workspace scoping enforced everywhere**: MusicBrainz returns global results; gates, scoring, blocklist, and storage all filter by workspaceId.
- **No silent failures**: every error path either updates the run status (`failed`/`stale`) with an error message, or surfaces in `summary.errors[]` while the run completes with `partial` status.

### Run state machine

```
running → complete   (happy path)
running → failed     (pipeline raised; error_message populated)
running → stale      (stale sweeper: status=running AND started_at < NOW() - 10min)
```

Terminal states: `complete`, `failed`, `stale`. Stale sweeper runs on every API call to `/api/ar/scout/hunter/run`:

```sql
UPDATE hunter_runs
SET status = 'stale', error_message = 'No heartbeat within 10 minutes'
WHERE status = 'running' AND started_at < NOW() - INTERVAL '10 minutes';
```

## Data Model

### Table: `hunter_runs`

```sql
CREATE TABLE IF NOT EXISTS hunter_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        TEXT NOT NULL,

  criteria            JSONB NOT NULL,        -- snapshot of HunterCriteria
  weights_snapshot    JSONB NOT NULL,        -- snapshot of HunterWeights at run start

  status              TEXT NOT NULL DEFAULT 'running',
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ,
  error_message       TEXT,

  summary             JSONB NOT NULL DEFAULT '{}'::jsonb,
  /* summary shape:
     { "fetched": int, "skipped_blocked": int, "gated_out": int,
       "scored": int, "added": int,
       "errors": [{ "candidateName": str, "stage": str, "message": str }] }
  */

  started_by          TEXT NOT NULL          -- actor email
);

CREATE INDEX IF NOT EXISTS idx_hunter_runs_workspace_started
  ON hunter_runs (workspace_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_hunter_runs_status_started
  ON hunter_runs (status, started_at) WHERE status = 'running';
```

### Table: `hunter_scrape_cache`

```sql
CREATE TABLE IF NOT EXISTS hunter_scrape_cache (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key       TEXT NOT NULL UNIQUE,        -- "<workspaceId>::<normalized_url>"
  scrape_url      TEXT NOT NULL,
  result          JSONB NOT NULL,
  cached_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL         -- DEFAULT NOW() + INTERVAL '30 days'
);

CREATE INDEX IF NOT EXISTS idx_scrape_cache_expires ON hunter_scrape_cache (expires_at);
CREATE INDEX IF NOT EXISTS idx_scrape_cache_key     ON hunter_scrape_cache (cache_key);
```

### Modifications to `scout_candidates`

```sql
ALTER TABLE scout_candidates
  ADD COLUMN IF NOT EXISTS hunter_run_id UUID,
  ADD CONSTRAINT fk_scout_candidates_hunter_run
    FOREIGN KEY (hunter_run_id) REFERENCES hunter_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_scout_cand_hunter_run
  ON scout_candidates (hunter_run_id) WHERE hunter_run_id IS NOT NULL;
```

`source` field convention extends:
- `manual` (existing)
- `agent:hunter:musicbrainz` (v1)
- `agent:hunter:spotify` / `agent:hunter:bandcamp` etc. (future agents)

### Workspace weights — `project.settings.hunterWeights` JSON

Stored alongside `featureFlags`. Per-workspace. No new table.

```json
{
  "version": 1,
  "updatedAt": "2026-05-12T09:00:00Z",
  "updatedBy": "greg@songfinch.com",
  "weights": {
    "instagram_followers":         { "weight": 12, "curve": "log", "min": 1000,  "max": 500000,  "missing_baseline": 50 },
    "tiktok_followers":            { "weight": 12, "curve": "log", "min": 1000,  "max": 1000000, "missing_baseline": 50 },
    "youtube_subscribers":         { "weight": 8,  "curve": "log", "min": 1000,  "max": 1000000, "missing_baseline": 50 },
    "soundcloud_followers":        { "weight": 5,  "curve": "log", "min": 500,   "max": 100000,  "missing_baseline": 50 },
    "spotify_followers":           { "weight": 18, "curve": "log", "min": 1000,  "max": 100000,  "missing_baseline": 50 },
    "spotify_popularity":          { "weight": 8,  "curve": "linear", "min": 0, "max": 100, "missing_baseline": 50 },
    "contact_readiness":           { "weight": 12, "values": { "direct": 100, "manager": 80, "agency": 70, "booking": 60, "social_only": 40, "none": 0 }, "missing_baseline": 30 },
    "genre_fit":                   { "weight": 15, "targetGenres": ["indie pop","folk","singer-songwriter"], "exact": 100, "related": 60, "none": 0 },
    "geography":                   { "weight": 5,  "targetRegions": ["US","CA","GB"], "match": 100, "other": 50 },
    "role_match":                  { "weight": 8,  "values": { "performer": 100, "curator": 100, "both": 100, "unknown": 60 } },
    "recency":                     { "weight": 6,  "curve": "linear", "days_window": 730, "missing_baseline": 50 }
  },
  "gates": {
    "require_genre_match": true,
    "require_living": true,
    "require_reachable": true,
    "require_not_blocked": true
  },
  "target_count_default": 25
}
```

Defaults seeded for Songfinch workspace on first read if missing. Greg can edit via raw JSON editor in v1.

### TypeScript types (added to `lib/gemfinder/types.ts`)

```typescript
export type HunterRoleTarget = 'performer' | 'curator' | 'both' | 'unknown';
export type HunterRunStatus = 'running' | 'complete' | 'failed' | 'stale';
export type HunterSource = 'musicbrainz' | 'spotify' | 'bandcamp';

export type HunterCriteria = {
  genres: string[];
  regions: string[];
  roleTarget: HunterRoleTarget;
  sizeBracket?: { min?: number; max?: number };
  recency?: { sinceYear?: number };
  instrument?: string;
  targetCount: number;
  source: HunterSource;
};

export type HunterRunErrorEntry = {
  candidateName?: string;
  stage: string;
  message: string;
};

export type HunterRunSummary = {
  fetched: number;
  skippedBlocked: number;
  gatedOut: number;
  scored: number;
  added: number;
  errors: HunterRunErrorEntry[];
};

export type HunterRun = {
  id: string;
  workspaceId: string;
  criteria: HunterCriteria;
  weightsSnapshot: HunterWeights;
  status: HunterRunStatus;
  startedAt: string;
  completedAt?: string;
  errorMessage?: string;
  summary: HunterRunSummary;
  startedBy: string;
};

// One shape per weight dimension type — easier for UI rendering and validation
export type HunterWeightLog = {
  weight: number;
  curve: 'log' | 'linear';
  min: number;
  max: number;
  missing_baseline: number;
  days_window?: number;
};

export type HunterWeightValueMap = {
  weight: number;
  values: Record<string, number>;
  missing_baseline?: number;
};

export type HunterWeightGenre = {
  weight: number;
  targetGenres: string[];
  exact: number;
  related: number;
  none: number;
};

export type HunterWeightGeography = {
  weight: number;
  targetRegions: string[];
  match: number;
  other: number;
};

export type HunterWeights = {
  version: number;
  updatedAt: string;
  updatedBy: string;
  weights: {
    instagram_followers:    HunterWeightLog;
    tiktok_followers:       HunterWeightLog;
    youtube_subscribers:    HunterWeightLog;
    soundcloud_followers:   HunterWeightLog;
    spotify_followers:      HunterWeightLog;
    spotify_popularity:     HunterWeightLog;
    contact_readiness:      HunterWeightValueMap;
    genre_fit:              HunterWeightGenre;
    geography:              HunterWeightGeography;
    role_match:             HunterWeightValueMap;
    recency:                HunterWeightLog;
  };
  gates: {
    require_genre_match: boolean;
    require_living: boolean;
    require_reachable: boolean;
    require_not_blocked: boolean;
  };
  target_count_default: number;
};

export type EnrichedCandidate = {
  // From MusicBrainz
  displayName: string;
  musicbrainzId: string;
  country?: string;
  genres: string[];
  artistType?: string;          // MB type field
  isLiving: boolean;
  recentReleaseYear?: number;

  // Platform identities (from MB url-rels)
  spotifyUrl?: string;
  spotifyArtistId?: string;
  bandcampUrl?: string;
  soundcloudHandle?: string;
  instagramHandle?: string;
  tiktokHandle?: string;
  youtubeHandle?: string;
  website?: string;

  // From Spotify Web API (if URL resolved)
  spotifyFollowers?: number;
  spotifyPopularity?: number;
  spotifyGenres?: string[];

  // From Steel scrape (if performed)
  scrapedContactEmail?: string;
  scrapedManagerInfo?: string;
  scrapedToursInfo?: string;

  // Computed
  inferredRole: 'performer' | 'curator' | 'unknown';
  contactReadiness: 'direct' | 'manager' | 'agency' | 'booking' | 'social_only' | 'none';
};
```

## Pipeline mechanics

### MusicBrainz client (`lib/gemfinder/hunter/musicbrainz.ts`)

```typescript
// Singleton rate-limiter: 1 token/sec, max 2 burst.
// All MB requests funnel through this throttle.

const BASE = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'Gemfinder-Hunter/1.0 (https://gemfinder-1qm5.onrender.com)';

export type MBArtist = {
  id: string;
  name: string;
  country?: string;
  type?: 'Person' | 'Group' | 'Orchestra' | 'Choir' | 'Character' | 'Other';
  'life-span'?: { begin?: string; end?: string };
  tags?: Array<{ name: string; count: number }>;
  'release-groups'?: Array<{ id: string; title: string; 'first-release-date'?: string }>;
  relations?: Array<{ type: string; url?: { resource: string } }>;
};

export async function searchArtists(criteria: HunterCriteria): Promise<MBArtist[]>;
export async function fetchArtistDetails(
  mbid: string,
  inc?: string[]
): Promise<MBArtist | null>;
```

Query construction: MB uses Lucene syntax. For `genres: ['indie pop','folk']` + `regions: ['US']` + `roleTarget: 'performer'`:

```
(tag:"indie pop" OR tag:"folk") AND country:US AND type:Person
```

Limit per request: 100. If results exceed, use offset pagination in future iterations.

User-Agent is required by MB (they 403 anonymous requests).

### Spotify Web API client (`lib/gemfinder/hunter/spotify.ts`)

```typescript
// Client Credentials flow. Token cached in memory for 55 min (token expires_in is 3600s).

export async function getAccessToken(): Promise<string>;
export async function getArtistById(spotifyArtistId: string): Promise<SpotifyArtist | null>;

type SpotifyArtist = {
  id: string;
  name: string;
  followers: { total: number };
  popularity: number;          // 0-100
  genres: string[];
  external_urls?: { spotify?: string };
};
```

Token exchange:
```
POST https://accounts.spotify.com/api/token
  Authorization: Basic base64(client_id:client_secret)
  Body: grant_type=client_credentials
  → { access_token, token_type: 'Bearer', expires_in: 3600 }
```

Artist lookup:
```
GET https://api.spotify.com/v1/artists/{spotify_artist_id}
  Authorization: Bearer <access_token>
```

Self-imposed rate limit: 3 req/sec (Spotify shared bucket).

### Steel client (`lib/gemfinder/hunter/steel.ts`)

```typescript
export async function scrapeWebsite(url: string): Promise<SteelScrapeResult | null>;

type SteelScrapeResult = {
  url: string;
  pageHtml: string;
  extractedFields?: {
    contactEmail?: string;
    managerInfo?: string;
    toursInfo?: string;
    socialLinks?: string[];
  };
  scrapedAt: string;
};
```

Steel API contract (subject to verification against their actual API docs):
```
POST https://api.steel.dev/v1/sessions
  Authorization: Bearer <STEEL_API_KEY>
  Body: { url, extractFields: ['contactEmail','managerInfo'], timeout: 30000 }
```

Per-candidate priority order for the ONE Steel scrape:
1. Artist's official website (from MB url-rels "official homepage" relationship)
2. Bandcamp page (if linked)
3. Linktree URL (from Spotify Web API external_urls if present)
4. Instagram profile (last resort)
5. Skip Steel if none exist — rely on MB+Spotify data only

Quota awareness: every Steel call wrapped in try/catch. 429 or 5xx → cache miss treated as "no scrape data," `enrichment_status: partial`. Run continues.

### Scrape cache (`lib/gemfinder/hunter/scrape-cache.ts`)

```typescript
export async function getCached(
  workspaceId: string,
  url: string
): Promise<SteelScrapeResult | null>;

export async function putCached(
  workspaceId: string,
  url: string,
  result: SteelScrapeResult
): Promise<void>;

export async function purgeExpired(): Promise<number>;
```

Lookup: `SELECT result FROM hunter_scrape_cache WHERE cache_key = $1 AND expires_at > NOW()`

Cache key: `${workspaceId}::${normalizeUrl(url)}`. URL normalization: lowercase scheme + host, strip trailing slashes, strip tracking params.

TTL: 30 days. Lazy garbage collection — on every put, also delete entries where `expires_at < NOW()`.

### Enrichment pipeline (`lib/gemfinder/hunter/enrichment.ts`)

```typescript
export async function enrichCandidate(
  workspaceId: string,
  mbArtist: MBArtist
): Promise<EnrichedCandidate>;
```

Per candidate, in order:
1. Extract MB core fields (name, country, type, life-span, tags, release-groups).
2. Compute `isLiving`: `!mbArtist['life-span']?.end`.
3. Compute `recentReleaseYear`: max year from release-groups' `first-release-date` field.
4. Extract platform URLs from `mbArtist.relations`: look for relations of type "spotify", "bandcamp", "soundcloud", "youtube", "official homepage". Parse identifiers.
5. If spotify URL → extract Spotify ID → call `spotify.getArtistById(id)` → merge followers/popularity/genres.
6. Determine highest-priority URL for Steel scrape (website > bandcamp > linktree > IG).
7. Check scrape cache for that URL. If miss, attempt Steel scrape (with graceful failure).
8. Compute `inferredRole` (heuristic): MB type Person/Group + has release-groups → performer; else → unknown.
9. Compute `contactReadiness`:
    - if `scrapedContactEmail` OR MB has email tag → `'direct'`
    - else if `scrapedManagerInfo` matches `Management:|Manager:|Agency:` pattern → `'manager'` (further refine to `'agency'` or `'booking'` if those keywords appear)
    - else if any social URL exists → `'social_only'`
    - else → `'none'`

Concurrency: enrich up to 8 candidates in parallel (per-pipeline run).

### Gates (`lib/gemfinder/hunter/gates.ts`)

```typescript
type GateResult = { pass: true } | { pass: false; reason: string };

export function evaluateGates(
  candidate: EnrichedCandidate,
  weights: HunterWeights,
  isBlockedResult: BlocklistResult
): GateResult;
```

Order (short-circuits on first failure):
1. **not_blocked**: `!isBlockedResult.blocked`
2. **living**: `candidate.isLiving === true`
3. **genre_match**: `candidate.genres.some(g => weights.genre_fit.targetGenres.includes(g.toLowerCase()))`
4. **reachable**: `candidate.contactReadiness !== 'none'`

Gate result + reason recorded in `summary.errors[]` for `gated_out` accounting.

### Scoring (`lib/gemfinder/hunter/scoring.ts`)

```typescript
export function computeScore(
  candidate: EnrichedCandidate,
  weights: HunterWeights
): { final: number; perDimension: Record<string, number> };
```

Per-dimension scoring functions:

```typescript
function logScore(value: number | undefined, dim: HunterWeightLog): number {
  if (value === undefined || value === null) return dim.missing_baseline;
  if (value <= dim.min) return 0;
  if (value >= dim.max) return 100;
  const logMin = Math.log10(dim.min);
  const logMax = Math.log10(dim.max);
  const logVal = Math.log10(value);
  return Math.round(((logVal - logMin) / (logMax - logMin)) * 100);
}

function linearScore(value: number | undefined, dim: HunterWeightLog): number {
  if (value === undefined || value === null) return dim.missing_baseline;
  if (value <= dim.min) return 0;
  if (value >= dim.max) return 100;
  return Math.round(((value - dim.min) / (dim.max - dim.min)) * 100);
}

function valueMapScore(key: string | undefined, dim: HunterWeightValueMap): number {
  if (!key) return dim.missing_baseline ?? 50;
  return dim.values[key] ?? dim.missing_baseline ?? 50;
}

function genreScore(candidateGenres: string[], dim: HunterWeightGenre): number {
  const targets = dim.targetGenres.map((g) => g.toLowerCase());
  const matches = candidateGenres.filter((g) => targets.includes(g.toLowerCase()));
  if (matches.length > 0) return dim.exact;
  return dim.none;     // v1: no related-genre detection
}

function geographyScore(country: string | undefined, dim: HunterWeightGeography): number {
  if (!country) return dim.other;
  return dim.targetRegions.includes(country) ? dim.match : dim.other;
}

function recencyScore(year: number | undefined, dim: HunterWeightLog): number {
  if (!year) return dim.missing_baseline;
  const yearsAgo = new Date().getFullYear() - year;
  const maxYears = (dim.days_window ?? 730) / 365;
  if (yearsAgo > maxYears) return 0;
  return Math.round(100 * (1 - yearsAgo / maxYears));
}
```

Final score normalization:

```typescript
let totalWeight = 0;
let weightedSum = 0;

for (const [dimKey, dimConfig] of Object.entries(weights.weights)) {
  const rawScore = perDimensionScore(dimKey, candidate, dimConfig);  // 0-100
  weightedSum += rawScore * dimConfig.weight;
  totalWeight += dimConfig.weight;
  perDimension[dimKey] = rawScore;
}

const final = totalWeight === 0 ? 0 : Math.round(weightedSum / totalWeight);
return { final, perDimension };
```

## UI surfaces

### Scout V3 surface gains 2 tabs

Header summary updates: gains "N hunter runs today" pill alongside existing pending/rejected.

```
Scout V3 (existing)
  ├ Queue tab          (existing)
  ├ Rejection log tab  (existing)
  ├ Search tab         — NEW
  └ Runs tab           — NEW
```

### Search tab

Form fields:
- **Genres** — multi-chip input. "Use my target genres" button auto-fills from `weights.genre_fit.targetGenres`.
- **Regions** — multi-chip ISO country code input. Default empty = any.
- **Role target** — radio buttons: Performer / Curator / Both / Unknown ok.
- **Size bracket** — Spotify followers min/max (optional).
- **Recency** — `released since YYYY` dropdown.
- **Instrument** — free text (optional).
- **Target count** — number input, default 25.

Disabled "Run hunt" button until at least 1 genre OR region is set.

Save as preset → opens small modal: preset name → saves to `project.settings.hunterPresets[name]`. v1 supports presets storage but no preset-management UI beyond name+save+load.

After "Run hunt" click → POST `/api/ar/scout/hunter/run` → on 202 success, redirect to Runs tab with new run highlighted.

### Runs tab

Table of past hunts, newest first. Rows display:
- Status badge (running / complete / failed / stale)
- Criteria summary (genres / regions / role)
- Timing (started X ago)
- Summary counts (added · gated_out · blocked · errors)
- Action buttons: View N candidates (filters Queue tab) / Re-run with same criteria

Click row → expands inline with full details (criteria breakdown, weights snapshot summary, timeline of phase progress, errors list).

Polling: when any run is in `running` state, page polls `GET /api/ar/scout/hunter/run/[id]` every 5 sec.

### Candidate card updates (Queue tab)

Each candidate card gains a collapsed **Provenance** footer:
- Found via (source)
- Run name + position (e.g., "5 of 12 added")
- Steel scraped: yes/no
- Score breakdown (per-dimension scores in compact form)

Default-collapsed; click to expand. Shows enough detail for Greg to understand why a candidate ranked where they did, supporting weight-tuning iterations.

### Weight config

v1: raw JSON textarea + Save button at `GET/PUT /api/ar/scout/hunter/weights?workspaceId=<id>`.

Validated server-side via zod schema. Rejects malformed JSON with field-level error messages.

v1.1 will replace with form-based editor.

## Error handling

### Per-layer failure matrix

| Layer | Failure | Behavior |
|---|---|---|
| MusicBrainz | 429 rate limit | Wait 5s, retry up to 3x. Fail run if all retries 429. |
| MusicBrainz | 5xx | Retry once after 2s. Fail run if still 5xx. |
| MusicBrainz | Network timeout (10s) | Treat as 5xx. |
| MusicBrainz | 0 results | Complete run with `summary.fetched: 0`. Not an error. |
| Spotify | 401 (token expired mid-run) | Refresh client_credentials token, retry once. |
| Spotify | 429 | Respect Retry-After. Retry once. If still 429, skip Spotify for this candidate. |
| Spotify | 404 (artist not found) | Skip Spotify data for this candidate. |
| Spotify | Network timeout | Skip Spotify, continue. |
| Steel | 429 / quota | Skip Steel for this candidate. Mark `enrichment_status: partial`. Log warning in errors. |
| Steel | Session timeout | Same as 429. |
| Steel | Page load failed | Same as 429. |
| Steel | API key invalid | Fail run early with clear error message. |
| Postgres | Connection lost | Retry once. Abort run if still failing. |
| Postgres | Concurrent transaction | SELECT FOR UPDATE on hunter_runs row prevents conflicts. |
| Workspace JSONB | listWorkspaceProjects fails | Abort run before pipeline. |
| Invalid criteria | Empty genres AND empty regions | 400 at API boundary. |
| Invalid criteria | Invalid targetCount | Clamp to [1, 100]. |

### Per-candidate error isolation

Each candidate's enrichment + scoring wrapped in try/catch. Failure increments `summary.errors[]` with `{ candidateName, stage, message }`. Run completes with `status: complete` (or `partial` if any errors). Single-candidate failure does NOT kill the run.

### Logging conventions

Prefixes for grep:
- `[HUNTER]` — general
- `[HUNTER_MB]` — MusicBrainz
- `[HUNTER_SPOTIFY]` — Spotify
- `[HUNTER_STEEL]` — Steel (sessions, cache hits/misses)
- `[HUNTER_SCORE]` — score computation (debug)
- `[HUNTER_RUN]` — run lifecycle

Structured fields: workspaceId, runId, candidate name.

## Testing

### Unit tests (vitest, mock at fetch boundary)

```
lib/gemfinder/hunter/
├── musicbrainz.test.ts     — query construction, response parsing, rate-limit math
├── spotify.test.ts          — token cache, refresh, artist endpoint
├── steel.test.ts            — request shape, cache hit/miss, 429 fallback
├── scrape-cache.test.ts     — TTL, expired purge, key normalization
├── enrichment.test.ts       — MB + Spotify merge, role inference, contact readiness logic
├── gates.test.ts            — every gate variant + each failure reason
├── scoring.test.ts          — every dimension scorer + final normalization
└── orchestrator.test.ts     — state machine transitions, summary updates, per-candidate isolation
```

Coverage target: 85%+ of hunter module code paths.

### Integration tests

```
app/api/ar/scout/hunter/run/route.test.ts:
  - POST creates run row + returns 202 with runId
  - POST validates criteria (400 on empty genres+regions)
  - POST auth check (401 / 403)
  - POST feature flag check (404 if flag off)
  - GET lists runs by workspace (newest first)

app/api/ar/scout/hunter/run/[id]/route.test.ts:
  - GET returns run status + summary
  - GET 404 for unknown id
  - Stale sweeper marks runs as stale on read

End-to-end pipeline test (with mocked external HTTP):
  - Mock MB to return 5 artists
  - Mock Spotify to return data for 3 of them
  - Mock Steel: succeed for 2, 429 for 1, network error for 1
  - Pipeline runs to completion
  - Assert: hunter_runs status=complete, scout_candidates has top N
  - Assert: per-candidate enrichment_status reflects external API outcomes
  - Assert: provenance fields populated correctly
```

### Manual smoke checklist

1. With env vars set, run small hunt (`indie pop / US / target=5`)
2. Verify run row created, status transitions running → complete within 1-2 min
3. Verify candidates appear in queue with `source: agent:hunter:musicbrainz`
4. Verify provenance footer shows run + score breakdown
5. Verify "Re-run with same criteria" produces another run with `skipped_blocked > added` (blocklist working)
6. Verify candidate approve/reject flow works on Hunter-produced candidates same as manual
7. Verify Spotify credentials missing → run completes with `enrichment_status: partial`, no crash
8. Verify Steel quota simulation → same graceful degrade

### Health endpoint extension (already shipped in eedc4a3)

`/api/ar/scout/health` now checks:
- env.SPOTIFY_CLIENT_ID, env.SPOTIFY_CLIENT_SECRET, env.STEEL_API_KEY presence
- spotify.token_exchange functional check (real token from accounts.spotify.com)

Adds in this spec's implementation:
- `hunter_runs` schema status
- `hunter_scrape_cache` schema status
- workspace `hunterWeights` config presence (returns "default" if not set)

## Rollout / Deployment

### Pre-launch checklist

- [x] `DATABASE_URL` — Postgres
- [x] `pgcrypto` extension / `gen_random_uuid()`
- [x] `SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET` in Render env
- [x] Spotify token exchange verified working
- [x] `STEEL_API_KEY` in Render env
- [ ] Schema migrations land via `ensureSchema()` on first request
- [ ] Default `hunterWeights` seeded for Songfinch workspace
- [ ] Smoke hunt produces real candidates

### Deploy order

1. Implementation lands on `main` — Render auto-deploys
2. First request to `/api/ar/scout/hunter/*` triggers `ensureSchema()` → creates 2 new tables + adds `hunter_run_id` column
3. Greg runs smoke test hunt
4. Verify candidates appear in queue with full provenance
5. Iterate based on first-run learnings

### Rollback plan

Same pattern as Scout V3:
- Hunter is gated on existing `featureFlags.scoutV3` flag (no separate flag in v1)
- To disable Hunter quickly: deploy commit that hides Hunter tabs OR add `featureFlags.hunter` flag
- Full rollback: revert commits, schema stays (additive only, no data loss)

### Cost monitoring (post-launch)

- **Render**: existing pricing, no change
- **Spotify Web API**: free, 180 req/min cap not concerning at our scale
- **Steel**: free tier — monitor usage via Steel dashboard. Knobs to reduce burn: lower default target_count, extend cache TTL, conditionally skip Steel for low-priority candidates
- **MusicBrainz**: free, self-imposed 1 req/sec limit

### Observability

Hunter run summaries persist in `hunter_runs.summary`. Each run queryable for analytics:

```sql
-- "How many candidates have I approved from Hunter in the last 30 days?"
SELECT COUNT(*) FROM scout_candidates c
JOIN hunter_runs r ON c.hunter_run_id = r.id
WHERE r.completed_at > NOW() - INTERVAL '30 days';
```

Future v1.1: surface aggregates as a Hunter analytics view.

## Deferred to later phases

| Phase | Feature | Reason deferred |
|---|---|---|
| v1.1 | Sliders-based weight tuning UI | Need real usage data to inform design |
| v1.1 | Spotify monthly listeners scrape (Steel) | Adds Steel quota burn; v1 has Spotify followers + popularity |
| v1.1 | Instagram + TikTok follower scrape (Steel) | Steel quota conservation |
| v1.1 | Saved-search preset management UI | v1 supports storage, no full UI |
| v1.1 | Bulk-approve from single run | UX polish |
| v1.1 | Run analytics dashboard | Need usage data first |
| v2 | Scheduled / always-on hunts (cron) | Infrastructure cost; manual sufficient for v1 |
| v2 | Second agent (Bandcamp, Setlist.fm, Songkick) | One source at a time; harden MB first |
| v2 | Server-Sent Events for run status | Polling fine at v1 scale |
| v3 | Real Curator-vs-Performer classifier (LLM-based) | v1 uses heuristic |
| v3 | Multi-agent orchestration | Single source v1 |

## Open questions

- **Steel API exact contract**: My pseudocode assumes `POST /v1/sessions` with `extractFields`. Verify against Steel's actual API docs during implementation. May need to adjust to their actual endpoint structure.
- **Spotify rate limit specifics**: Their shared bucket details aren't precisely documented. Self-imposed 3 req/sec is conservative. May need to tune up or down based on actual 429 frequency.
- **Default `hunterWeights` seeding**: Should defaults be hardcoded as a constant (current plan) or stored in DB on first request to workspace? Hardcoded is simpler; stored allows future migration.
- **Long-running hunt UX**: If a hunt takes 5+ min due to many candidates needing Steel scrapes, polling at 5-sec intervals is wasteful. Consider exponential backoff (5s → 10s → 20s) for long-running polls in v1.1.

## Manual test checklist

Run through after implementation:

### Setup
- [ ] Spotify Client ID + Secret in Render env vars
- [ ] Steel API key in Render env vars
- [ ] `/api/ar/scout/health` returns 200 with all checks passing including Hunter-specific

### Search tab
- [ ] Open Scout V3 → see new Search + Runs tabs
- [ ] Click Search tab → form renders
- [ ] "Run hunt" disabled until genre or region set
- [ ] "Use my target genres" auto-fills from weights config
- [ ] Submit minimal criteria (1 genre, 1 region) → redirected to Runs tab with new run highlighted

### Runs tab
- [ ] New run appears with status "running"
- [ ] Status updates via polling (5 sec)
- [ ] Run completes within 1-3 min for small target counts
- [ ] Summary shows fetched / gated_out / added counts
- [ ] Click row expands inline detail
- [ ] "View N candidates" link filters Queue tab
- [ ] "Re-run with same criteria" pre-fills Search tab

### Pipeline verification
- [ ] MusicBrainz returns expected artist counts for known queries
- [ ] Spotify enrichment fills `spotifyFollowers` + `spotifyPopularity` for ~60% of candidates
- [ ] Steel scrape attempted for top-priority URL per candidate
- [ ] Scrape cache hits on second run with same criteria
- [ ] Candidates inserted with `source: agent:hunter:musicbrainz` + `hunter_run_id` populated
- [ ] Score breakdown visible in provenance footer

### Gates working
- [ ] Genre mismatch candidate filtered out (gated_out increments)
- [ ] Deceased artist filtered out (MB end_date present)
- [ ] Already-in-Kickoff artist filtered out (skipped_blocked increments)
- [ ] Artist with no contact path filtered out

### Error handling
- [ ] Run with intentionally bad Spotify creds → completes with `partial` status, warnings in errors[]
- [ ] Run during Steel outage → individual candidates skip Steel gracefully
- [ ] MB returns 429 (simulated) → run retries up to 3x, fails with clear error_message
- [ ] Process restart mid-run → run becomes `stale` via sweeper

### Weights
- [ ] `GET /api/ar/scout/hunter/weights?workspaceId=<id>` returns current config
- [ ] PUT with valid JSON saves and reflects in next run
- [ ] PUT with invalid JSON returns 400 with field-level errors

### Edge cases
- [ ] Empty criteria → 400 with clear message
- [ ] Target count > 100 → clamped to 100, no error
- [ ] MB returns 0 results → run completes with `summary.fetched: 0`, no candidates added
- [ ] Run with target=1 → exactly 1 candidate added
- [ ] Concurrent hunts (start 2 back-to-back) → both complete independently
