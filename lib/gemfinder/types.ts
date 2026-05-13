export type AuthRole = 'admin' | 'editor' | 'viewer';

export interface AuthUserRecord {
  userId: string;
  email: string;
  passwordHash: string;
  role: AuthRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PublicAuthUser {
  userId: string;
  email: string;
  role: AuthRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PasswordResetTokenRecord {
  token: string;
  userId: string;
  email: string;
  expiresAt: string;
  createdAt: string;
}

export interface GmailConnectionRecord {
  userId: string;
  workspaceEmail: string;
  gmailEmail: string;
  refreshToken: string;
  scopes: string[];
  historyId: string;
  lastRefreshAt: string;
  lastSyncAt: string;
  tokenExpiresAt: string;
  lastError: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicGmailConnection {
  userId: string;
  workspaceEmail: string;
  gmailEmail: string;
  providerEmail: string;
  connected: boolean;
  scopes: string[];
  lastRefreshAt: string;
  lastSyncAt: string;
  tokenExpiresAt: string;
  lastError: string;
  createdAt: string;
  updatedAt: string;
}

export interface GmailThreadRecord {
  threadKey: string;
  projectId: string;
  artistName: string;
  artistKey: string;
  provider: 'gmail';
  externalThreadId: string;
  senderUserId: string;
  senderGmailEmail: string;
  subject: string;
  participants: string[];
  counterpartyEmail: string;
  snippet: string;
  lastMessageAt: string;
  lastInboundAt: string;
  lastOutboundAt: string;
  lastMessageDirection: 'inbound' | 'outbound' | 'none';
  threadOwnerUserId: string;
  status: 'open' | 'waiting' | 'closed';
  nextFollowUpAt: string;
  internalNote: string;
  internalNoteUpdatedAt: string;
  internalNoteUpdatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface GmailMessageRecord {
  messageKey: string;
  threadKey: string;
  projectId: string;
  artistName: string;
  provider: 'gmail';
  externalMessageId: string;
  externalThreadId: string;
  direction: 'inbound' | 'outbound';
  senderUserId: string;
  senderGmailEmail: string;
  actorUserId: string;
  actorEmail: string;
  senderEmail: string;
  fromName: string;
  toEmails: string[];
  ccEmails: string[];
  subject: string;
  snippet: string;
  bodyText: string;
  sentAt: string;
  syncedAt: string;
  messageIdHeader: string;
  inReplyTo: string;
}

// ============================================================================
// Scout V3 — pre-engagement candidate queue
// See docs/superpowers/specs/2026-04-22-scout-v3-s0-s1-design.md
// ============================================================================

export type ScoutContactType = 'direct' | 'manager' | 'agency' | 'booking';
export type ScoutArtistRole = 'performer' | 'curator' | 'both';
export type ScoutEnrichmentStatus = 'pending' | 'partial' | 'complete' | 'failed';

export type ScoutExtraLink = {
  label: string;
  url: string;
  followers?: number;
};

export type ScoutCandidate = {
  id: string;
  workspaceId: string;
  displayName: string;
  canonicalName: string;
  aliases: string[];

  // Platform identities
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
  extraLinks: ScoutExtraLink[];

  // Contact
  primaryEmail?: string;
  contactName?: string;
  contactEmail?: string;
  contactType?: ScoutContactType;

  // Metadata (nullable; filled by enrichment in S5)
  primaryGenre?: string;
  genres: string[];
  locations: string[];
  instagramFollowers?: number;
  tiktokFollowers?: number;
  spotifyMonthlyListeners?: number;
  youtubeSubscribers?: number;
  soundcloudFollowers?: number;
  hitTracks: string[];   // S0/S1: track names only. S5 may extend.
  curatorPageUrl?: string;
  artistRole?: ScoutArtistRole;
  aiSummary?: string;
  living?: boolean;

  // Provenance
  source: string;        // 'manual' | 'spotify' | 'bandcamp' | 'musicbrainz' | 'agent:<name>' etc.
  sourceUrl?: string;
  sourceExternalId?: string;
  addedBy: string;
  hunterRunId?: string;  // FK to hunter_runs.id when this candidate originated from a hunter run

  // Scoring (S2 populates; null at S0)
  score?: number;
  weightSnapshot?: Record<string, unknown>;

  // Enrichment
  enrichmentStatus: ScoutEnrichmentStatus;
  enrichmentError?: string;

  // Admin override (rare)
  identityOverride: boolean;
  identityOverrideNote?: string;

  createdAt: string;
  updatedAt: string;
};

export type ScoutRejectionReason =
  | 'already_signed'
  | 'wrong_genre'
  | 'no_contact'
  | 'too_big'
  | 'too_small'
  | 'not_viable'
  | 'dead'
  | 'duplicate'
  | 'other';

export type ScoutRejection = {
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

  // candidateSnapshot is opaque audit data — typed loosely so future
  // schema changes to ScoutCandidate don't break old snapshots on read.
  candidateSnapshot: Record<string, unknown>;

  reasonCode: ScoutRejectionReason;
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

export type BlocklistMatchedOn =
  | 'spotify_artist_id'
  | 'musicbrainz_id'
  | 'primary_email'
  | 'instagram_handle'
  | 'tiktok_handle'
  | 'youtube_handle'
  | 'soundcloud_handle'
  | 'canonical_name';

export type BlocklistMatch = {
  blocked: true;
  reason: 'kickoff' | 'live' | 'rejected' | 'candidate';
  matchedOn: BlocklistMatchedOn;
  matchedRecord: {
    id: string;
    displayName: string;
    location: string;
    stage?: string;
    owner?: string;
    addedAt?: string;
  };
};

export type BlocklistResult = BlocklistMatch | { blocked: false };

// ============================================================================
// Hunter v1 — agent ingestion subsystem for Scout V3
// See docs/superpowers/specs/2026-05-12-hunter-v1-design.md
// ============================================================================

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
  // source is set server-side; not user-selectable in v1.
  source?: HunterSource;
};

export type HunterRunErrorEntry = {
  candidateName?: string;
  stage: string;
  message: string;
};

export type HunterRunGatedReason = {
  candidateName?: string;
  reason: string;
};

export type HunterRunSummary = {
  fetched: number;
  skippedBlocked: number;
  gatedOut: number;
  scored: number;
  added: number;
  errors: HunterRunErrorEntry[];
  gatedReasons: HunterRunGatedReason[];
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
  displayName: string;
  musicbrainzId: string;
  country?: string;
  genres: string[];
  artistType?: string;
  isLiving: boolean;
  recentReleaseYear?: number;
  spotifyUrl?: string;
  spotifyArtistId?: string;
  bandcampUrl?: string;
  soundcloudHandle?: string;
  instagramHandle?: string;
  tiktokHandle?: string;
  youtubeHandle?: string;
  website?: string;
  spotifyFollowers?: number;
  spotifyPopularity?: number;
  spotifyGenres?: string[];
  instagramFollowers?: number;
  tiktokFollowers?: number;
  youtubeSubscribers?: number;
  soundcloudFollowers?: number;
  scrapedContactEmail?: string;
  scrapedManagerInfo?: string;
  scrapedToursInfo?: string;
  inferredRole: 'performer' | 'curator' | 'unknown';
  contactReadiness: 'direct' | 'manager' | 'agency' | 'booking' | 'social_only' | 'none';
};
