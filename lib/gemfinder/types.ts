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
