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
