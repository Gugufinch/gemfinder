# Gem Finder Discovery Surface — S0 + S1 Foundation Design

**Date**: 2026-04-22
**Status**: Approved, pending spec review
**Phase**: S0 + S1 of a 7-phase Discovery roadmap
**Related**: [Scout V2 Operating Queue Spec](./../../scout-v2-operating-queue-spec.md)

## Context

Gem Finder currently provides four workspace surfaces per workspace:

- **Scout** — triage of pre-Kickoff talent (1,809 leads in the Songfinch workspace)
- **Kickoff** — active A&R work (1,686 records)
- **Live Roster** — launched campaigns (3 records)
- **Reports** — staff-level reporting

Scout was recently upgraded to V2 with decision state, review memory, and an action UI. However, V2 assumes leads already exist in the system. It does not answer: **where do new candidate artists come from?**

This spec addresses that gap by introducing a new **Discovery** surface upstream of Scout and Kickoff. Discovery is where candidate artists are reviewed and approved or rejected before entering the Kickoff pipeline. Rejected candidates go to a permanent log that blocks future re-surfacing.

## Product statement

Discovery answers one question immediately:

> *"Is this candidate artist worth pursuing, and have we seen them before?"*

The primary object is a **binary decision** (approve / reject), not a profile. Approvals graduate candidates into Kickoff at stage `prospect` and skip Scout triage (they are already qualified by virtue of the approve click). Rejections go to a permanent log that never re-surfaces.

## Full roadmap context

This spec covers **S0 + S1** of a 7-phase plan:

| Phase | Scope | Status |
|---|---|---|
| **S0** | Candidate pool data model + blocklist service | **THIS SPEC** |
| **S1** | Approve/Reject UI + rejection log + manual candidate entry | **THIS SPEC** |
| S2 | Weighted scoring + weight tuning UI | Future |
| S3 | First scraper source (recommended: MusicBrainz — cleanest data) | Future |
| S4 | Second + third scraper sources (Spotify, Bandcamp) | Future |
| S5 | Enrichment agent team (follower fill-in, AI summaries) | Future |
| S6 | Curator-vs-Performer classifier | Future |
| S7 | Scraper hardening + retry/healing (ongoing) | Future |

Each future phase gets its own brainstorm → spec → plan cycle.

## Architecture

### Core principle

Discovery is **strictly upstream** of Scout and Kickoff. It does not know about those surfaces' internals. On approve, a candidate graduates into the existing `sharedTalent` + kickoff record pipeline — identical to manual entry today. No coupling in the other direction.

### Component diagram

```
DISCOVERY SURFACE (new workspace tab)
 ├─ Queue tab (pending candidates)
 └─ Rejection log tab (permanent history)
        │
        │ approve → creates sharedTalent + kickoff record at stage 'prospect'
        │            with scoutDecision = 'qualified' (bypasses Scout triage)
        │            record appears in Kickoff, not Scout default view
        │
        │ reject  → moves to discovery_rejections (permanent blocklist)
        ▼
BLOCKLIST SERVICE (isBlocked)
 ├─ Checks: discovery_candidates (current pending)
 ├─ Checks: discovery_rejections (past rejected)
 ├─ Checks: sharedTalent in Kickoff (via workspace projects, in-memory)
 └─ Checks: Live Roster (via workspace projects, in-memory)
        │
        ▼
POSTGRES STORAGE
 ├─ discovery_candidates (ephemeral queue)
 └─ discovery_rejections (permanent memory)
```

### Key architectural decisions

1. **Discovery upstream, never downstream of Scout.** Scout does not know Discovery exists. Approval creates records at stage `prospect` with `scoutDecision = 'qualified'`, which Scout's default view hides via workflow filter.

2. **Blocklist as a service, not a field.** Single `isBlocked(workspaceId, identity)` function checks all four sources. Used on every candidate add (manual + agent-produced in S3+).

3. **Candidates ephemeral, rejections permanent.** `discovery_candidates` rows delete on approve/reject. `discovery_rejections` grows forever but stays small (~5 KB/row, queried rarely).

4. **Multi-field identity resolution.** A candidate matches existing records if ANY identity field collides: Spotify ID → MusicBrainz ID → primary email → IG handle → TikTok handle → YouTube handle → SoundCloud handle → canonical name (last resort, highest false-positive rate).

5. **Two storage modes.** SQL for candidates/rejections (volume, query needs). JSON in `project.settings.discoveryWeights` for weights/preferences (small, frequently-tuned — populated in S2, noted here for schema planning).

6. **API routes namespaced** under `/api/ar/discovery/` matching existing `/api/ar/*` patterns.

### Files to create

| File | Purpose |
|---|---|
| `db/migrations/XXXX-add-discovery-tables.sql` | Additive DB migration (candidates + rejections tables, indexes) |
| `lib/gemfinder/discovery-store.ts` | Candidate + rejection persistence |
| `lib/gemfinder/discovery-blocklist.ts` | Blocklist query service |
| `lib/gemfinder/discovery/identity.ts` | canonicalName, parseUrl, buildIdentity utilities |
| `lib/gemfinder/discovery/validation.ts` | zod schemas for candidate payload |
| `app/api/ar/discovery/candidates/route.ts` | GET, POST |
| `app/api/ar/discovery/candidates/[id]/route.ts` | PATCH (approve/reject/edit) |
| `app/api/ar/discovery/rejections/route.ts` | GET |
| `app/api/ar/discovery/stats/route.ts` | GET counts for nav badges |
| (Test files co-located alongside source) | vitest coverage |

### Files to modify

| File | Change |
|---|---|
| `app/ar/GemFinderApp.jsx` | Add Discovery nav card; add `screen === 'discovery'` branch; change Scout V2 default filter to hide `qualified + promoted` |
| `package.json` | Add vitest dev dependency + scripts |
| `lib/gemfinder/types.ts` | Add DiscoveryCandidate, DiscoveryRejection, CandidateIdentity, BlocklistResult types |

### Explicit non-goals for S0 + S1

- No scraping, no agent ingestion (S3+)
- No weight tuning UI or sophisticated scoring (S2)
- No enrichment pipeline / AI summaries / follower fill-in (S5)
- No curator-vs-performer classifier (S6)
- Time window filter is a simple date picker on `created_at`, not a "2026 releases" concept (requires enrichment data)
- Batch-review mode (approve 10 at once) deferred to S3 when agents produce volume
- Un-reject workflow — admin force-add covers the edge case

## Data Model

### Table: `discovery_candidates`

Ephemeral queue. Row deleted on approve or reject.

```sql
CREATE TABLE discovery_candidates (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id                TEXT NOT NULL,

  -- Identity (display + dedup)
  display_name                TEXT NOT NULL,
  canonical_name              TEXT NOT NULL,         -- lowercased, stripped
  aliases                     JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Platform identities
  spotify_url                 TEXT,
  spotify_artist_id           TEXT,
  instagram_handle            TEXT,                  -- normalized, no @
  tiktok_handle               TEXT,
  youtube_handle              TEXT,
  youtube_url                 TEXT,
  soundcloud_handle           TEXT,
  soundcloud_url              TEXT,
  musicbrainz_id              TEXT,
  bandcamp_url                TEXT,
  extra_links                 JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{label, url, followers?}]

  -- Contact
  primary_email               TEXT,
  contact_name                TEXT,
  contact_email               TEXT,
  contact_type                TEXT,                  -- direct|manager|agency|booking

  -- Metadata (nullable at S0, filled by enrichment later)
  primary_genre               TEXT,
  genres                      JSONB NOT NULL DEFAULT '[]'::jsonb,
  locations                   JSONB NOT NULL DEFAULT '[]'::jsonb,
  instagram_followers         BIGINT,
  tiktok_followers            BIGINT,
  spotify_monthly_listeners   BIGINT,
  youtube_subscribers         BIGINT,
  soundcloud_followers        BIGINT,
  hit_tracks                  JSONB NOT NULL DEFAULT '[]'::jsonb,
  curator_page_url            TEXT,
  artist_role                 TEXT,                  -- performer|curator|both (S6 populates)
  ai_summary                  TEXT,                  -- (S5 populates)
  living                      BOOLEAN,               -- (S3 viability check)

  -- Provenance
  source                      TEXT NOT NULL,         -- manual|spotify|bandcamp|musicbrainz|venue|bill|article|agent:<name>
  source_url                  TEXT,
  source_external_id          TEXT,
  added_by                    TEXT NOT NULL,         -- actor email, or agent name

  -- Scoring (S2 populates; null at S0)
  score                       NUMERIC,
  weight_snapshot             JSONB,                 -- weights at scoring time

  -- Enrichment (S5)
  enrichment_status           TEXT NOT NULL DEFAULT 'pending',  -- pending|partial|complete|failed
  enrichment_error            TEXT,

  -- Admin override (rare)
  identity_override           BOOLEAN NOT NULL DEFAULT FALSE,
  identity_override_note      TEXT,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_disco_cand_workspace_created    ON discovery_candidates (workspace_id, created_at DESC);
CREATE INDEX idx_disco_cand_workspace_score      ON discovery_candidates (workspace_id, score DESC NULLS LAST);
CREATE INDEX idx_disco_cand_canonical_name       ON discovery_candidates (workspace_id, canonical_name);
CREATE INDEX idx_disco_cand_spotify_artist_id    ON discovery_candidates (workspace_id, spotify_artist_id) WHERE spotify_artist_id IS NOT NULL;
CREATE INDEX idx_disco_cand_instagram_handle     ON discovery_candidates (workspace_id, instagram_handle) WHERE instagram_handle IS NOT NULL;
CREATE INDEX idx_disco_cand_tiktok_handle        ON discovery_candidates (workspace_id, tiktok_handle) WHERE tiktok_handle IS NOT NULL;
CREATE INDEX idx_disco_cand_youtube_handle       ON discovery_candidates (workspace_id, youtube_handle) WHERE youtube_handle IS NOT NULL;
CREATE INDEX idx_disco_cand_soundcloud_handle    ON discovery_candidates (workspace_id, soundcloud_handle) WHERE soundcloud_handle IS NOT NULL;
CREATE INDEX idx_disco_cand_musicbrainz_id       ON discovery_candidates (workspace_id, musicbrainz_id) WHERE musicbrainz_id IS NOT NULL;
CREATE INDEX idx_disco_cand_primary_email        ON discovery_candidates (workspace_id, primary_email) WHERE primary_email IS NOT NULL;
```

### Table: `discovery_rejections`

Permanent blocklist. Snapshots candidate at time of rejection.

```sql
CREATE TABLE discovery_rejections (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id                TEXT NOT NULL,

  -- Identity snapshot (same shape as candidates for blocklist parity)
  display_name                TEXT NOT NULL,
  canonical_name              TEXT NOT NULL,
  spotify_url                 TEXT,
  spotify_artist_id           TEXT,
  instagram_handle            TEXT,
  tiktok_handle               TEXT,
  youtube_handle              TEXT,
  soundcloud_handle           TEXT,
  musicbrainz_id              TEXT,
  bandcamp_url                TEXT,
  primary_email               TEXT,

  -- Full snapshot of rejected candidate (audit trail)
  candidate_snapshot          JSONB NOT NULL,

  -- Reason
  reason_code                 TEXT NOT NULL,         -- see reason codes below
  reason_note                 TEXT,
  rejected_by                 TEXT NOT NULL,
  rejected_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_disco_rej_workspace_rejected_at ON discovery_rejections (workspace_id, rejected_at DESC);
CREATE INDEX idx_disco_rej_canonical_name        ON discovery_rejections (workspace_id, canonical_name);
CREATE INDEX idx_disco_rej_spotify_artist_id     ON discovery_rejections (workspace_id, spotify_artist_id) WHERE spotify_artist_id IS NOT NULL;
CREATE INDEX idx_disco_rej_instagram_handle      ON discovery_rejections (workspace_id, instagram_handle) WHERE instagram_handle IS NOT NULL;
CREATE INDEX idx_disco_rej_tiktok_handle         ON discovery_rejections (workspace_id, tiktok_handle) WHERE tiktok_handle IS NOT NULL;
CREATE INDEX idx_disco_rej_youtube_handle        ON discovery_rejections (workspace_id, youtube_handle) WHERE youtube_handle IS NOT NULL;
CREATE INDEX idx_disco_rej_soundcloud_handle     ON discovery_rejections (workspace_id, soundcloud_handle) WHERE soundcloud_handle IS NOT NULL;
CREATE INDEX idx_disco_rej_musicbrainz_id        ON discovery_rejections (workspace_id, musicbrainz_id) WHERE musicbrainz_id IS NOT NULL;
CREATE INDEX idx_disco_rej_primary_email         ON discovery_rejections (workspace_id, primary_email) WHERE primary_email IS NOT NULL;
```

### Reason codes (initial set)

- `already_signed` — on another label / project
- `wrong_genre` — outside target genres
- `no_contact` — can't reach them
- `too_big` — beyond acquisition target
- `too_small` — below threshold
- `not_viable` — bot / fake / defunct
- `dead` — deceased
- `duplicate` — same artist under another name/handle
- `other` — freeform note required

### TypeScript types (added to `lib/gemfinder/types.ts`)

```typescript
export type DiscoveryCandidate = {
  id: string;
  workspaceId: string;
  displayName: string;
  canonicalName: string;
  aliases: string[];
  spotifyUrl?: string;
  spotifyArtistId?: string;
  instagramHandle?: string;
  tiktokHandle?: string;
  youtubeHandle?: string;
  youtubeUrl?: string;
  soundcloudHandle?: string;
  soundcloudUrl?: string;
  musicbrainzId?: string;
  bandcampUrl?: string;
  extraLinks: { label: string; url: string; followers?: number }[];
  primaryEmail?: string;
  contactName?: string;
  contactEmail?: string;
  contactType?: "direct" | "manager" | "agency" | "booking";
  primaryGenre?: string;
  genres: string[];
  locations: string[];
  instagramFollowers?: number;
  tiktokFollowers?: number;
  spotifyMonthlyListeners?: number;
  youtubeSubscribers?: number;
  soundcloudFollowers?: number;
  hitTracks: string[];
  curatorPageUrl?: string;
  artistRole?: "performer" | "curator" | "both";
  aiSummary?: string;
  living?: boolean;
  source: string;
  sourceUrl?: string;
  sourceExternalId?: string;
  addedBy: string;
  score?: number;
  weightSnapshot?: Record<string, unknown>;
  enrichmentStatus: "pending" | "partial" | "complete" | "failed";
  enrichmentError?: string;
  identityOverride: boolean;
  identityOverrideNote?: string;
  createdAt: string;
  updatedAt: string;
};

export type DiscoveryRejectionReason =
  | "already_signed"
  | "wrong_genre"
  | "no_contact"
  | "too_big"
  | "too_small"
  | "not_viable"
  | "dead"
  | "duplicate"
  | "other";

export type DiscoveryRejection = {
  id: string;
  workspaceId: string;
  displayName: string;
  canonicalName: string;
  spotifyUrl?: string;
  spotifyArtistId?: string;
  instagramHandle?: string;
  tiktokHandle?: string;
  youtubeHandle?: string;
  soundcloudHandle?: string;
  musicbrainzId?: string;
  bandcampUrl?: string;
  primaryEmail?: string;
  candidateSnapshot: DiscoveryCandidate;
  reasonCode: DiscoveryRejectionReason;
  reasonNote?: string;
  rejectedBy: string;
  rejectedAt: string;
};

export type CandidateIdentity = {
  displayName: string;
  canonicalName: string;
  spotifyArtistId?: string;
  musicbrainzId?: string;
  primaryEmail?: string;
  instagramHandle?: string;
  tiktokHandle?: string;
  youtubeHandle?: string;
  soundcloudHandle?: string;
  bandcampUrl?: string;
};

export type BlocklistMatch = {
  blocked: true;
  reason: "kickoff" | "live" | "rejected" | "candidate";
  matchedOn:
    | "spotify_artist_id"
    | "musicbrainz_id"
    | "primary_email"
    | "instagram_handle"
    | "tiktok_handle"
    | "youtube_handle"
    | "soundcloud_handle"
    | "canonical_name";
  matchedRecord: {
    id: string;
    displayName: string;
    location: string;    // e.g., "Kickoff · Engaged"
    stage?: string;
    owner?: string;
    addedAt?: string;
  };
};

export type BlocklistResult = BlocklistMatch | { blocked: false };
```

### Blocklist service signature

```typescript
// lib/gemfinder/discovery-blocklist.ts
export async function isBlocked(
  workspaceId: string,
  identity: CandidateIdentity,
  options?: {
    excludeCandidateId?: string;   // for edit flow
    includeRejections?: boolean;   // defaults true
  }
): Promise<BlocklistResult>;
```

### Match priority (returns on first hit; does not enumerate all collisions)

1. `spotify_artist_id` — most stable, platform IDs never change
2. `musicbrainz_id` — authoritative but sparse
3. `primary_email` — stable when present
4. `instagram_handle` — stable
5. `tiktok_handle` — stable
6. `youtube_handle` — stable
7. `soundcloud_handle` — stable
8. `canonical_name` — last resort, high false-positive rate

### Sources checked (in order)

1. **Candidates table** — `discovery_candidates WHERE workspace_id = $1 AND (identity match)` — excludes `options.excludeCandidateId` when editing
2. **Rejections table** — `discovery_rejections WHERE workspace_id = $1 AND (identity match)` — skippable via `options.includeRejections = false`
3. **Kickoff + Live** — queries workspace projects via existing `project-store`, flattens `projects[].artists[]` into identity records, matches in JavaScript. Scale-appropriate at current ~2k artists. SQL upgrade path available if/when this becomes a bottleneck.

## Flows

### Flow A — Manual Add Candidate

```
User clicks [+ Add candidate]
  ↓
Modal opens:
  • Paste URL (auto-fills from Spotify / IG / TikTok / YouTube / SoundCloud / Bandcamp / MusicBrainz)
  • Manual fields (name required, all else optional)
  • Extra links: repeating {label, url} rows
  ↓
Client-side: normalize identity (canonical name, parse URLs → IDs/handles)
  ↓
POST /api/ar/discovery/candidates
  ↓
Server:
  1. zod validation → 400 on failure with field errors
  2. Build CandidateIdentity
  3. isBlocked(workspaceId, identity)
     ├─ Blocked: 409 with matchedRecord info → Flow D
     └─ Clear: INSERT row, 201 with created candidate
  ↓
UI: close modal, prepend new row to queue, flash "Added"
```

### URL parsing (client-side, instant feedback)

- `https://open.spotify.com/artist/{id}` → `spotifyArtistId`, `spotifyUrl`
- `https://www.instagram.com/{handle}/` → `instagramHandle`
- `https://www.tiktok.com/@{handle}` → `tiktokHandle`
- `https://www.youtube.com/@{handle}` → `youtubeHandle`
- `https://soundcloud.com/{handle}` → `soundcloudHandle`, `soundcloudUrl`
- `https://{slug}.bandcamp.com/` → `bandcampUrl`
- `https://musicbrainz.org/artist/{mbid}` → `musicbrainzId`
- Any other URL → adds to `extraLinks` with inferred label

### Flow B — Approve Candidate

```
User clicks [✓ Approve]
  ↓
Modal:
  • Project dropdown (defaults to last-used per user via localStorage)
  • Optional note (carries as scoutDecisionNote in Kickoff record)
  • [Cancel] [✓ Approve into Kickoff]
  ↓
PATCH /api/ar/discovery/candidates/[id]
  Body: { action: "approve", projectId, note? }
  ↓
Server transaction:
  BEGIN
    1. SELECT candidate FOR UPDATE (row lock → exactly-once guarantee)
    2. 404 if not found (second user's parallel approve gets this)
    3. Re-check isBlocked() — Kickoff state may have changed since add
       409 if now blocked (e.g., user added to Kickoff via another path mid-flight)
    4. Call project-store.addTalentToProject(projectId, candidatePayload):
       • Creates or merges sharedTalent identity
       • Creates kickoff record at stage 'prospect'
       • Preserves: socials, contact, genre, location, source, addedBy
       • Sets discoveredVia = candidate.source
    5. Write workspaceScoutState[newTalentId] = {
         decision: "qualified",
         decisionBy: approvingActor,
         decisionAt: NOW(),
         reviewCount: 1,
         lastReviewedBy: approvingActor,
         lastReviewedAt: NOW(),
         note: note || null
       }
    6. DELETE FROM discovery_candidates WHERE id = $1
  COMMIT
  ↓
Return { approvedTalentId, kickoffProjectId, kickoffRecordId }
  ↓
UI: remove row, flash "Approved → ready in Kickoff", offer [Open in Kickoff] button
```

### Flow C — Reject Candidate

```
User clicks [✗ Reject]
  ↓
Modal:
  • Reason dropdown (9 preset codes + "Other")
  • Optional note (required if reason = "other")
  • [Cancel] [✗ Reject]
  ↓
PATCH /api/ar/discovery/candidates/[id]
  Body: { action: "reject", reasonCode, reasonNote? }
  ↓
Server transaction:
  BEGIN
    1. SELECT candidate FOR UPDATE
    2. 404 if not found
    3. INSERT into discovery_rejections (
         identity fields copied,
         candidate_snapshot = full row as JSONB,
         reason_code, reason_note,
         rejected_by = session.actor,
         rejected_at = NOW()
       )
    4. DELETE FROM discovery_candidates WHERE id = $1
  COMMIT
  ↓
Return { rejectionId }
  ↓
UI: remove row, flash "Rejected → in rejection log"
```

### Flow D — Blocklist Collision (Add or Edit)

```
Server returns 409 with match payload
  ↓
UI shows collision modal:
┌──────────────────────────────────────────────┐
│  ⚠ Already tracked                           │
│  "[Name]" matches a record in [location].    │
│  Matched on: [match type]                    │
│  Current: [Kickoff · Engaged / etc.]         │
│  Owner: [X]                                  │
│  [Open existing]  [Cancel]                   │
│  ─────                                       │
│  (Admin only) Force add with override note:  │
│  [_________________________]                 │
│  [Force add anyway]                          │
└──────────────────────────────────────────────┘
```

Force-add: admin role required (403 otherwise), override note required, creates candidate with `identity_override = true`.

### Flow E — Edit Candidate

Same modal shape as Add, pre-filled. On save:

- Re-runs `isBlocked(workspaceId, identity, { excludeCandidateId: self.id })`
- Collision → Flow D modal with option to revert changes
- Clean → UPDATE row

### Flow F — Agent-Produced Candidate (S3+ preview)

```
Agent produces candidate batch (future)
  ↓
For each candidate:
  1. Build CandidateIdentity
  2. isBlocked(workspaceId, identity)
  3. Blocked → log skip reason, continue (no user error)
  4. Clear → INSERT with source = "agent:<name>", addedBy = "agent:<name>"
  ↓
Batch log:
  [DISCOVERY_AGENT] musicbrainz-scraper batch complete:
    added 47, skipped 12 (3 kickoff, 2 live, 6 rejected, 1 candidate dup)
```

**Critical**: agents never call approve/reject. Approval is always a human decision.

## UI

### Navigation placement

Workspace dashboard adds **Open Discovery** card alongside Scout / Kickoff / Live Roster / Reports.

- **Color**: blue (distinguishes from Scout's orange)
- **Position**: first in lifecycle order (Discovery → Scout → Kickoff → Live Roster → Reports)
- **Badge**: pending count fetched via `GET /api/ar/discovery/stats`

### Discovery screen structure

```
← Songfinch
DISCOVERY
Songfinch · Discovery
Find new artists not yet in Kickoff or Live.

[N pending] [M rejected] [K approved today] [J blocked]

Discovery Actions:
[+ Add candidate]  [Export CSV]

Tabs: [Queue · N]  [Rejection log · M]

Filters (Queue tab):
Search · Source · Genre · Artist role · Date added · Enrichment status · Contact type

Sort: [Newest ▼]  View: [Cards | Table]

[rows]

[Load more]
```

### Candidate card (Cards view)

```
┌────────────────────────────────────────────────────────────────┐
│  [Name]  [Role badge]  [Source badge]  [Score pill — S2+]      │
│  IG: @X · N    TikTok: @X · N    YouTube: @X · N               │
│  Spotify: N monthly   SoundCloud: N                            │
│  Contact: email (type)  ·  Location                            │
│  Genre: primary · secondary                                    │
│  AI summary: [S5 populates]                                    │
│  Added via [source] ([actor]) · [time ago] · enrichment: X     │
│  [View externally ↗]  [✓ Approve]  [✗ Reject]  [✏ Edit]        │
└────────────────────────────────────────────────────────────────┘
```

### Candidate table row (Table view)

Columns: Name | Role | IG | TikTok | Spotify | YT | SC | Contact | Genre | Source | Added | Actions

Actions cell: `[✓][✗][…]` — ellipsis opens details drawer.

### Modals

- **Add Candidate**: paste-URL mode + manual-form mode. Extra links as repeating {label, url} rows.
- **Approve**: project dropdown (smart-default to last-used), optional note, confirmation.
- **Reject**: reason dropdown (9 codes), optional note (required if "other").
- **Collision**: match details, [Open existing] + [Cancel] + admin-only [Force add with note].
- **Edit**: same as Add, pre-filled, re-runs blocklist on save.

### Rejection log tab

Read-only table: date, name, reason badge, note, rejected by. Sortable, searchable, filter by reason + date range. No un-reject affordance in UI. Re-adding a rejected artist hits the blocklist and requires admin force-add.

### Empty states

- Nothing in queue → "No candidates yet. Add one manually or wait for agents."
- Filters hide everything → "No matches. Reset filters." + reset button
- Rejection log empty → "No rejections yet. They appear here when you pass on a candidate."

### Style tokens (reuses existing)

- Card surface: `cS`
- Action buttons: `actionBtn(active, tint)` with tints: neutral, accent, good, warn, danger
- Pill badges: `mkP(condition, fg, bg)` with existing color tokens
- Approve button: `"accent"` tint
- Reject button: `"danger"` tint
- Score pill: green (>70), amber (40–70), gray (unscored)
- Role badge: blue (performer), purple (curator), teal (both), gray (unknown)

### Scout V2 default filter change (2-line follow-up)

Scout V2's default workflow filter changes from `"all"` → hides `qualified + promoted` decisions. Keeps Discovery-approved records out of Scout's triage queue. Users can flip the filter to "all" to see everything.

## Error Handling

### Error taxonomy

| Category | Example | HTTP | UX response |
|---|---|---|---|
| Validation | Missing name, malformed URL | 400 | Inline field errors on form |
| Blocklist collision (add) | Spotify ID matches Kickoff | 409 | Collision modal with match details |
| Blocklist collision (edit) | Edit now collides | 409 | Same modal, revert option |
| Already-handled race | Two users approve same | 404 | Toast, remove row |
| Not found | Row deleted mid-session | 404 | Toast, remove row |
| Forbidden | Non-admin force-add | 403 | Toast, modal stays |
| DB timeout | Blocklist query > 5s | 504 | Retry affordance |
| DB connection | pg down | 503 | Banner + retry button |
| Transaction rollback | Approve mid-fail | 500 | Toast, row stays, user retries |
| Network drop | Client offline | n/a | Toast, preserve form state |

### Guarantees

1. **Exactly-once approve**: `SELECT FOR UPDATE` + `DELETE` in single transaction
2. **Blocklist re-check on approve**: Kickoff may have changed between add and approve
3. **Rejections never lost**: rejection INSERT happens before candidate DELETE in same transaction
4. **No silent catches**: per `CLAUDE.md` convention, fire-and-forget uses `.catch(err => console.warn('[DISCOVERY] ...', err))` — never `.catch(() => {})`
5. **All errors logged** with `[DISCOVERY]`, `[DISCOVERY_BLOCKLIST]`, `[DISCOVERY_DECISION]`, or `[DISCOVERY_AGENT]` prefixes

### Auth + permissions

- All `/api/ar/discovery/*` routes require a valid session
- Workspace scoping on every query — user cannot access other workspaces' data
- Force-add endpoint requires `role === 'admin'` on the user record
- Rejection log is read-only in UI for all users (no un-reject affordance)

## Testing

### Test runner: vitest (new addition)

Added to `package.json`:

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest"
}
```

### Unit tests (required S0)

Co-located `*.test.ts` files for:

- `lib/gemfinder/discovery/identity.test.ts` — canonicalizeName, parseUrl (every platform), buildIdentity, normalize handles
- `lib/gemfinder/discovery-blocklist.test.ts` — every match type + no-match + excludeCandidateId + skip-rejections option
- `lib/gemfinder/discovery/validation.test.ts` — zod schema coverage

**Coverage target**: 90%+ of blocklist + identity code paths.

### Integration tests (required S1)

- `app/api/ar/discovery/candidates/route.test.ts`:
  - POST happy path
  - POST collision (4 variants: kickoff, live, rejected, candidate)
  - POST validation failure
  - POST auth failure
  - GET with each filter
- `app/api/ar/discovery/candidates/[id]/route.test.ts`:
  - PATCH approve happy
  - PATCH approve with re-check collision (state changed mid-flight)
  - PATCH approve concurrent race (two parallel requests, one wins via SELECT FOR UPDATE)
  - PATCH reject happy + log verification
  - PATCH edit with blocklist re-check
- `app/api/ar/discovery/rejections/route.test.ts`:
  - GET with filters
  - Auth check

### Manual test plan

See **Manual test checklist** at the end of this document.

### Deferred testing

- E2E (Playwright) → S1 later or S2
- Load/performance tests on blocklist → S3 when agent volume justifies
- Visual regression → not S0-S1 scope

## Observability

- `[DISCOVERY]` prefix for general operations
- `[DISCOVERY_BLOCKLIST]` for blocklist queries (slow-query warnings > 500ms)
- `[DISCOVERY_DECISION]` for approve/reject events (structured log with candidateId, actor, projectId)
- `[DISCOVERY_AGENT]` for agent-produced candidate batches (S3+)
- Request-level metrics: pending count, approvals today, rejections today via `/api/ar/discovery/stats` endpoint (used by nav badge and dashboard counters)

## Rollout / rollback

### Deploy order

1. DB migration (additive, deploys alone)
2. API routes + backend code (not reachable until UI exists)
3. UI + nav entry (feature-flag gated)
4. Flip flag for Songfinch workspace
5. Monitor `[DISCOVERY_*]` logs for errors
6. Flip on for other workspaces as trust grows

### Feature flag

`project.settings.featureFlags.discovery = true | false`. Default off. Controls:

- Discovery nav card visibility on workspace landing
- Access to Discovery screen (returns 404 if flag off)
- Candidate API routes (return 404 if flag off for workspace)

### Rollback

1. Flip feature flag off → surface disappears, backend becomes unreachable
2. Drop tables → full reset (no data loss elsewhere; migration is additive)
3. Revert code commits

## Deferred to later phases

| Phase | Feature | Reason deferred |
|---|---|---|
| S2 | Weight tuning UI + smarter scoring | Need real candidates to tune against |
| S2 | `project.settings.discoveryWeights` JSON | Part of S2 UI |
| S3 | First scraper (MusicBrainz) | Build working flow before agents |
| S3 | Batch-review mode | Not needed until agents produce volume |
| S4 | Spotify scraper | S3 hardens the pattern first |
| S4 | Bandcamp scraper | Same |
| S5 | Enrichment agent team | Needs S3 data first |
| S5 | AI summaries | Same |
| S5 | Follower fill-in | Same |
| S6 | Curator-vs-Performer classifier | Needs enrichment data |
| S7 | Scraper hardening + retry | Ongoing maintenance |
| Future | Un-reject workflow | Admin force-add covers it |
| Future | Time-window enrichment (2026 releases) | Needs release-date enrichment |

## Open questions

- Agent authentication: how do agents authenticate to POST candidates? (Defer to S3 design.)
- Should the Discovery nav badge update live or on page load? (UX polish, S1 late.)
- Rate limiting on manual-add to prevent accidental double-submits? (Low risk at current usage; note for S1 polish.)
- Should we track a `discovered_via` chain field so agent-to-agent attribution is preserved? (S3 question.)

## Manual test checklist

Run through after implementation:

### Add flow

- [ ] Paste Spotify URL → fields auto-fill (name, Spotify ID, URL)
- [ ] Paste IG URL → IG handle extracted
- [ ] Paste TikTok URL → TikTok handle extracted
- [ ] Paste YouTube URL → YouTube handle extracted
- [ ] Paste SoundCloud URL → SoundCloud handle + URL extracted
- [ ] Paste Bandcamp URL → Bandcamp URL set
- [ ] Paste MusicBrainz URL → MBID extracted
- [ ] Manual add without URLs works (name only)
- [ ] Extra links row add/remove works
- [ ] Submit without name shows field error
- [ ] Adding a name that matches existing Kickoff record shows collision modal

### Approve flow

- [ ] Approve modal shows project dropdown
- [ ] Default selection = last used project (or workspace default on first run)
- [ ] Approve creates Kickoff record at stage "prospect"
- [ ] Approved record does NOT appear in Scout default queue (filter excludes "qualified")
- [ ] Approved record DOES appear in Kickoff
- [ ] Scout workflow filter flipped to "all" shows approved record with "Qualified" badge

### Reject flow

- [ ] Reason dropdown shows 9 preset codes + "Other"
- [ ] Selecting "Other" requires a note (submit disabled without)
- [ ] Reject moves candidate to rejection log
- [ ] Rejection log shows date, name, reason, note, rejected by
- [ ] Re-adding rejected artist hits collision with reason="rejected"

### Collision / edit

- [ ] Adding candidate matching Kickoff shows collision modal, details correct
- [ ] Adding candidate matching Live shows collision modal
- [ ] Adding candidate matching pending candidate shows collision
- [ ] Admin force-add requires override note
- [ ] Non-admin sees no force-add button
- [ ] Editing candidate identity to collision triggers modal
- [ ] Editing identity back to original clears warning

### UX + empty states

- [ ] Empty queue shows CTA
- [ ] All-filters-zero shows reset button
- [ ] Nav badge pending-count updates after add/approve/reject

### Auth + permissions

- [ ] Unauthenticated user redirected from Discovery
- [ ] User from different workspace cannot see other workspaces' candidates
- [ ] Force-add as non-admin returns 403

### Edge cases

- [ ] Two parallel approves → one succeeds, other gets 404
- [ ] Network drop during submit → retry works, no duplicate
- [ ] Candidate with no identity fields except name still creates (no blocklist match on name-only when unique)
- [ ] Blocklist query taking > 5s shows retry UI (simulate with network throttle)
