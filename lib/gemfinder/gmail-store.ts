import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import type {
  GmailConnectionRecord,
  GmailMessageRecord,
  GmailThreadRecord,
  PublicGmailConnection,
} from '@/lib/gemfinder/types';

const LOCAL_GMAIL_STORE_PATH =
  process.env.GEMFINDER_GMAIL_STORE_PATH || path.join(process.cwd(), 'data', 'gemfinder-gmail.local.json');

type LocalGmailStore = {
  connections: GmailConnectionRecord[];
  threads: GmailThreadRecord[];
  messages: GmailMessageRecord[];
};

let pool: Pool | null = null;
let schemaReady = false;

const SCHEMA_SQL = `
create table if not exists gemfinder_gmail_connections (
  user_id text primary key,
  workspace_email text not null,
  gmail_email text not null,
  refresh_token_cipher text not null,
  scopes jsonb not null default '[]'::jsonb,
  history_id text not null default '',
  last_refresh_at timestamptz,
  last_sync_at timestamptz,
  token_expires_at timestamptz,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table gemfinder_gmail_connections add column if not exists last_refresh_at timestamptz;
alter table gemfinder_gmail_connections add column if not exists last_sync_at timestamptz;
alter table gemfinder_gmail_connections add column if not exists token_expires_at timestamptz;
alter table gemfinder_gmail_connections add column if not exists last_error text not null default '';

create table if not exists gemfinder_gmail_threads (
  thread_key text primary key,
  project_id text not null,
  artist_name text not null,
  artist_key text not null default '',
  provider text not null default 'gmail',
  external_thread_id text not null,
  sender_user_id text not null,
  sender_gmail_email text not null,
  subject text not null default '',
  participants jsonb not null default '[]'::jsonb,
  counterparty_email text not null default '',
  snippet text not null default '',
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_message_direction text not null default 'none',
  thread_owner_user_id text not null default '',
  status text not null default 'open',
  next_follow_up_at timestamptz,
  internal_note text not null default '',
  internal_note_updated_at timestamptz,
  internal_note_updated_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists gemfinder_gmail_threads_unique_mailbox
  on gemfinder_gmail_threads (project_id, provider, sender_user_id, external_thread_id);

create index if not exists gemfinder_gmail_threads_artist_idx
  on gemfinder_gmail_threads (project_id, artist_name, updated_at desc);

alter table gemfinder_gmail_threads add column if not exists artist_key text not null default '';
alter table gemfinder_gmail_threads add column if not exists counterparty_email text not null default '';
alter table gemfinder_gmail_threads add column if not exists last_inbound_at timestamptz;
alter table gemfinder_gmail_threads add column if not exists last_outbound_at timestamptz;
alter table gemfinder_gmail_threads add column if not exists last_message_direction text not null default 'none';
alter table gemfinder_gmail_threads add column if not exists thread_owner_user_id text not null default '';
alter table gemfinder_gmail_threads add column if not exists status text not null default 'open';
alter table gemfinder_gmail_threads add column if not exists next_follow_up_at timestamptz;
alter table gemfinder_gmail_threads add column if not exists internal_note text not null default '';
alter table gemfinder_gmail_threads add column if not exists internal_note_updated_at timestamptz;
alter table gemfinder_gmail_threads add column if not exists internal_note_updated_by text not null default '';

create table if not exists gemfinder_gmail_messages (
  message_key text primary key,
  thread_key text not null,
  project_id text not null,
  artist_name text not null,
  provider text not null default 'gmail',
  external_message_id text not null,
  external_thread_id text not null,
  direction text not null,
  sender_user_id text not null,
  sender_gmail_email text not null,
  actor_user_id text not null default '',
  actor_email text not null default '',
  sender_email text not null default '',
  from_name text not null default '',
  to_emails jsonb not null default '[]'::jsonb,
  cc_emails jsonb not null default '[]'::jsonb,
  subject text not null default '',
  snippet text not null default '',
  body_text text not null default '',
  sent_at timestamptz,
  synced_at timestamptz not null default now(),
  message_id_header text not null default '',
  in_reply_to text not null default '',
  created_at timestamptz not null default now()
);

create unique index if not exists gemfinder_gmail_messages_ext_idx
  on gemfinder_gmail_messages (provider, sender_user_id, external_message_id);

create index if not exists gemfinder_gmail_messages_thread_idx
  on gemfinder_gmail_messages (thread_key, sent_at desc, created_at desc);
`;

function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function useSsl(): boolean {
  const mode = String(process.env.DATABASE_SSL || '').trim().toLowerCase();
  if (['require', 'true', '1', 'yes'].includes(mode)) return true;
  return /sslmode=require/i.test(String(process.env.DATABASE_URL || ''));
}

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 8,
      ssl: useSsl() ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

async function ensureSchema(): Promise<void> {
  if (!hasDatabase() || schemaReady) return;
  await getPool().query(SCHEMA_SQL);
  schemaReady = true;
}

function tokenSecret(): string {
  return String(process.env.GEMFINDER_GMAIL_TOKEN_SECRET || process.env.GMAIL_TOKEN_SECRET || '').trim();
}

function keyFromSecret(): Buffer {
  return crypto.createHash('sha256').update(tokenSecret()).digest();
}

function encryptToken(refreshToken: string): string {
  const clean = String(refreshToken || '').trim();
  if (!clean) return '';
  const secret = tokenSecret();
  if (!secret) return `plain:${clean}`;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFromSecret(), iv);
  const encrypted = Buffer.concat([cipher.update(clean, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

function decryptToken(value: string): string {
  const raw = String(value || '');
  if (!raw) return '';
  if (raw.startsWith('plain:')) return raw.slice(6);
  if (!raw.startsWith('enc:')) return raw;
  const secret = tokenSecret();
  if (!secret) throw new Error('Missing GMAIL_TOKEN_SECRET for encrypted Gmail tokens');
  const [, ivB64, tagB64, bodyB64] = raw.split(':');
  if (!ivB64 || !tagB64 || !bodyB64) throw new Error('Invalid encrypted Gmail token');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    keyFromSecret(),
    Buffer.from(ivB64, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(bodyB64, 'base64url')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

function emptyStore(): LocalGmailStore {
  return { connections: [], threads: [], messages: [] };
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

function normalizeIso(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function normalizeConnection(value: Partial<GmailConnectionRecord>): GmailConnectionRecord | null {
  if (!value.userId || !value.workspaceEmail || !value.gmailEmail || !value.refreshToken) return null;
  const now = new Date().toISOString();
  return {
    userId: String(value.userId),
    workspaceEmail: String(value.workspaceEmail).trim().toLowerCase(),
    gmailEmail: String(value.gmailEmail).trim().toLowerCase(),
    refreshToken: String(value.refreshToken),
    scopes: normalizeStringArray(value.scopes),
    historyId: String(value.historyId || ''),
    lastRefreshAt: normalizeIso(value.lastRefreshAt),
    lastSyncAt: normalizeIso(value.lastSyncAt),
    tokenExpiresAt: normalizeIso(value.tokenExpiresAt),
    lastError: String(value.lastError || ''),
    createdAt: normalizeIso(value.createdAt) || now,
    updatedAt: normalizeIso(value.updatedAt) || now,
  };
}

function normalizeThread(value: Partial<GmailThreadRecord>): GmailThreadRecord | null {
  if (!value.threadKey || !value.projectId || !value.artistName || !value.externalThreadId || !value.senderUserId || !value.senderGmailEmail) {
    return null;
  }
  const now = new Date().toISOString();
  return {
    threadKey: String(value.threadKey),
    projectId: String(value.projectId),
    artistName: String(value.artistName),
    artistKey: String(value.artistKey || ''),
    provider: 'gmail',
    externalThreadId: String(value.externalThreadId),
    senderUserId: String(value.senderUserId),
    senderGmailEmail: String(value.senderGmailEmail).trim().toLowerCase(),
    subject: String(value.subject || ''),
    participants: normalizeStringArray(value.participants),
    counterpartyEmail: String(value.counterpartyEmail || '').trim().toLowerCase(),
    snippet: String(value.snippet || ''),
    lastMessageAt: normalizeIso(value.lastMessageAt) || now,
    lastInboundAt: normalizeIso(value.lastInboundAt),
    lastOutboundAt: normalizeIso(value.lastOutboundAt),
    lastMessageDirection: value.lastMessageDirection === 'inbound' || value.lastMessageDirection === 'outbound' ? value.lastMessageDirection : 'none',
    threadOwnerUserId: String(value.threadOwnerUserId || ''),
    status: value.status === 'waiting' || value.status === 'closed' ? value.status : 'open',
    nextFollowUpAt: normalizeIso(value.nextFollowUpAt),
    internalNote: String(value.internalNote || ''),
    internalNoteUpdatedAt: normalizeIso(value.internalNoteUpdatedAt),
    internalNoteUpdatedBy: String(value.internalNoteUpdatedBy || ''),
    createdAt: normalizeIso(value.createdAt) || now,
    updatedAt: normalizeIso(value.updatedAt) || now,
  };
}

function normalizeMessage(value: Partial<GmailMessageRecord>): GmailMessageRecord | null {
  if (!value.messageKey || !value.threadKey || !value.projectId || !value.artistName || !value.externalMessageId || !value.externalThreadId || !value.senderUserId || !value.senderGmailEmail) {
    return null;
  }
  const now = new Date().toISOString();
  return {
    messageKey: String(value.messageKey),
    threadKey: String(value.threadKey),
    projectId: String(value.projectId),
    artistName: String(value.artistName),
    provider: 'gmail',
    externalMessageId: String(value.externalMessageId),
    externalThreadId: String(value.externalThreadId),
    direction: value.direction === 'inbound' ? 'inbound' : 'outbound',
    senderUserId: String(value.senderUserId),
    senderGmailEmail: String(value.senderGmailEmail).trim().toLowerCase(),
    actorUserId: String(value.actorUserId || ''),
    actorEmail: String(value.actorEmail || '').trim().toLowerCase(),
    senderEmail: String(value.senderEmail || '').trim().toLowerCase(),
    fromName: String(value.fromName || ''),
    toEmails: normalizeStringArray(value.toEmails),
    ccEmails: normalizeStringArray(value.ccEmails),
    subject: String(value.subject || ''),
    snippet: String(value.snippet || ''),
    bodyText: String(value.bodyText || ''),
    sentAt: normalizeIso(value.sentAt) || now,
    syncedAt: normalizeIso(value.syncedAt) || now,
    messageIdHeader: String(value.messageIdHeader || ''),
    inReplyTo: String(value.inReplyTo || ''),
  };
}

async function readLocalStore(): Promise<LocalGmailStore> {
  try {
    const raw = await fs.readFile(LOCAL_GMAIL_STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<LocalGmailStore>;
    return {
      connections: Array.isArray(parsed.connections)
        ? parsed.connections.map(normalizeConnection).filter(Boolean) as GmailConnectionRecord[]
        : [],
      threads: Array.isArray(parsed.threads)
        ? parsed.threads.map(normalizeThread).filter(Boolean) as GmailThreadRecord[]
        : [],
      messages: Array.isArray(parsed.messages)
        ? parsed.messages.map(normalizeMessage).filter(Boolean) as GmailMessageRecord[]
        : [],
    };
  } catch {
    return emptyStore();
  }
}

async function writeLocalStore(store: LocalGmailStore): Promise<void> {
  await fs.mkdir(path.dirname(LOCAL_GMAIL_STORE_PATH), { recursive: true });
  await fs.writeFile(LOCAL_GMAIL_STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function toPublicConnection(value: GmailConnectionRecord): PublicGmailConnection {
  return {
    userId: value.userId,
    workspaceEmail: value.workspaceEmail,
    gmailEmail: value.gmailEmail,
    providerEmail: value.gmailEmail,
    connected: true,
    scopes: value.scopes,
    lastRefreshAt: value.lastRefreshAt,
    lastSyncAt: value.lastSyncAt,
    tokenExpiresAt: value.tokenExpiresAt,
    lastError: value.lastError,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function mapDbConnection(row: Record<string, unknown>): GmailConnectionRecord {
  return {
    userId: String(row.user_id),
    workspaceEmail: String(row.workspace_email).trim().toLowerCase(),
    gmailEmail: String(row.gmail_email).trim().toLowerCase(),
    refreshToken: decryptToken(String(row.refresh_token_cipher || '')),
    scopes: normalizeStringArray(row.scopes),
    historyId: String(row.history_id || ''),
    lastRefreshAt: normalizeIso(row.last_refresh_at),
    lastSyncAt: normalizeIso(row.last_sync_at),
    tokenExpiresAt: normalizeIso(row.token_expires_at),
    lastError: String(row.last_error || ''),
    createdAt: normalizeIso(row.created_at) || new Date().toISOString(),
    updatedAt: normalizeIso(row.updated_at) || new Date().toISOString(),
  };
}

function mapDbThread(row: Record<string, unknown>): GmailThreadRecord {
  return {
    threadKey: String(row.thread_key),
    projectId: String(row.project_id),
    artistName: String(row.artist_name),
    artistKey: String(row.artist_key || ''),
    provider: 'gmail',
    externalThreadId: String(row.external_thread_id),
    senderUserId: String(row.sender_user_id),
    senderGmailEmail: String(row.sender_gmail_email).trim().toLowerCase(),
    subject: String(row.subject || ''),
    participants: normalizeStringArray(row.participants),
    counterpartyEmail: String(row.counterparty_email || '').trim().toLowerCase(),
    snippet: String(row.snippet || ''),
    lastMessageAt: normalizeIso(row.last_message_at) || new Date().toISOString(),
    lastInboundAt: normalizeIso(row.last_inbound_at),
    lastOutboundAt: normalizeIso(row.last_outbound_at),
    lastMessageDirection: row.last_message_direction === 'inbound' || row.last_message_direction === 'outbound' ? row.last_message_direction : 'none',
    threadOwnerUserId: String(row.thread_owner_user_id || ''),
    status: row.status === 'waiting' || row.status === 'closed' ? row.status : 'open',
    nextFollowUpAt: normalizeIso(row.next_follow_up_at),
    internalNote: String(row.internal_note || ''),
    internalNoteUpdatedAt: normalizeIso(row.internal_note_updated_at),
    internalNoteUpdatedBy: String(row.internal_note_updated_by || ''),
    createdAt: normalizeIso(row.created_at) || new Date().toISOString(),
    updatedAt: normalizeIso(row.updated_at) || new Date().toISOString(),
  };
}

function mapDbMessage(row: Record<string, unknown>): GmailMessageRecord {
  return {
    messageKey: String(row.message_key),
    threadKey: String(row.thread_key),
    projectId: String(row.project_id),
    artistName: String(row.artist_name),
    provider: 'gmail',
    externalMessageId: String(row.external_message_id),
    externalThreadId: String(row.external_thread_id),
    direction: row.direction === 'inbound' ? 'inbound' : 'outbound',
    senderUserId: String(row.sender_user_id),
    senderGmailEmail: String(row.sender_gmail_email).trim().toLowerCase(),
    actorUserId: String(row.actor_user_id || ''),
    actorEmail: String(row.actor_email || '').trim().toLowerCase(),
    senderEmail: String(row.sender_email || '').trim().toLowerCase(),
    fromName: String(row.from_name || ''),
    toEmails: normalizeStringArray(row.to_emails),
    ccEmails: normalizeStringArray(row.cc_emails),
    subject: String(row.subject || ''),
    snippet: String(row.snippet || ''),
    bodyText: String(row.body_text || ''),
    sentAt: normalizeIso(row.sent_at) || new Date().toISOString(),
    syncedAt: normalizeIso(row.synced_at) || new Date().toISOString(),
    messageIdHeader: String(row.message_id_header || ''),
    inReplyTo: String(row.in_reply_to || ''),
  };
}

export function buildThreadKey(projectId: string, senderUserId: string, externalThreadId: string): string {
  return `gmail:${projectId}:${senderUserId}:${externalThreadId}`;
}

export function buildMessageKey(senderUserId: string, externalMessageId: string): string {
  return `gmail:${senderUserId}:${externalMessageId}`;
}

export async function listWorkspaceGmailConnections(): Promise<PublicGmailConnection[]> {
  if (!hasDatabase()) {
    const local = await readLocalStore();
    return local.connections.map(toPublicConnection).sort((a, b) => a.workspaceEmail.localeCompare(b.workspaceEmail));
  }

  await ensureSchema();
  const res = await getPool().query('select * from gemfinder_gmail_connections order by workspace_email asc');
  return res.rows.map((row) => toPublicConnection(mapDbConnection(row)));
}

export async function listWorkspacePrivateGmailConnections(): Promise<GmailConnectionRecord[]> {
  if (!hasDatabase()) {
    const local = await readLocalStore();
    return local.connections.sort((a, b) => a.workspaceEmail.localeCompare(b.workspaceEmail));
  }

  await ensureSchema();
  const res = await getPool().query('select * from gemfinder_gmail_connections order by workspace_email asc');
  return res.rows.map((row) => mapDbConnection(row));
}

export async function getPrivateGmailConnectionByUserId(userId: string): Promise<GmailConnectionRecord | null> {
  if (!userId) return null;
  if (!hasDatabase()) {
    const local = await readLocalStore();
    return local.connections.find((item) => item.userId === userId) || null;
  }

  await ensureSchema();
  const res = await getPool().query('select * from gemfinder_gmail_connections where user_id = $1 limit 1', [String(userId)]);
  return res.rows[0] ? mapDbConnection(res.rows[0]) : null;
}

export async function upsertGmailConnection(value: GmailConnectionRecord): Promise<void> {
  const normalized = normalizeConnection(value);
  if (!normalized) throw new Error('Invalid Gmail connection');

  if (!hasDatabase()) {
    const local = await readLocalStore();
    const next = local.connections.filter((item) => item.userId !== normalized.userId);
    next.push(normalized);
    await writeLocalStore({ ...local, connections: next });
    return;
  }

  await ensureSchema();
  await getPool().query(
    `insert into gemfinder_gmail_connections (
      user_id, workspace_email, gmail_email, refresh_token_cipher, scopes, history_id,
      last_refresh_at, last_sync_at, token_expires_at, last_error, created_at, updated_at
    )
    values ($1, $2, $3, $4, $5::jsonb, $6, $7::timestamptz, $8::timestamptz, $9::timestamptz, $10, $11::timestamptz, $12::timestamptz)
    on conflict (user_id)
    do update set
      workspace_email = excluded.workspace_email,
      gmail_email = excluded.gmail_email,
      refresh_token_cipher = excluded.refresh_token_cipher,
      scopes = excluded.scopes,
      history_id = excluded.history_id,
      last_refresh_at = excluded.last_refresh_at,
      last_sync_at = excluded.last_sync_at,
      token_expires_at = excluded.token_expires_at,
      last_error = excluded.last_error,
      updated_at = excluded.updated_at`,
    [
      normalized.userId,
      normalized.workspaceEmail,
      normalized.gmailEmail,
      encryptToken(normalized.refreshToken),
      JSON.stringify(normalized.scopes),
      normalized.historyId,
      normalized.lastRefreshAt || null,
      normalized.lastSyncAt || null,
      normalized.tokenExpiresAt || null,
      normalized.lastError,
      normalized.createdAt,
      normalized.updatedAt,
    ],
  );
}

export async function updateGmailConnectionMetadata(
  userId: string,
  changes: Partial<Omit<GmailConnectionRecord, 'userId'>>,
): Promise<GmailConnectionRecord | null> {
  if (!userId) return null;
  const existing = await getPrivateGmailConnectionByUserId(userId);
  if (!existing) return null;
  const merged = normalizeConnection({
    ...existing,
    ...changes,
    userId: existing.userId,
    workspaceEmail: changes.workspaceEmail ?? existing.workspaceEmail,
    gmailEmail: changes.gmailEmail ?? existing.gmailEmail,
    refreshToken: changes.refreshToken ?? existing.refreshToken,
    scopes: changes.scopes ?? existing.scopes,
    historyId: changes.historyId ?? existing.historyId,
    lastRefreshAt: changes.lastRefreshAt !== undefined ? changes.lastRefreshAt : existing.lastRefreshAt,
    lastSyncAt: changes.lastSyncAt !== undefined ? changes.lastSyncAt : existing.lastSyncAt,
    tokenExpiresAt: changes.tokenExpiresAt !== undefined ? changes.tokenExpiresAt : existing.tokenExpiresAt,
    lastError: changes.lastError !== undefined ? changes.lastError : existing.lastError,
    createdAt: existing.createdAt,
    updatedAt: changes.updatedAt || new Date().toISOString(),
  });
  if (!merged) return null;
  await upsertGmailConnection(merged);
  return merged;
}

export async function deleteGmailConnection(userId: string): Promise<void> {
  if (!userId) return;
  if (!hasDatabase()) {
    const local = await readLocalStore();
    await writeLocalStore({
      ...local,
      connections: local.connections.filter((item) => item.userId !== userId),
    });
    return;
  }

  await ensureSchema();
  await getPool().query('delete from gemfinder_gmail_connections where user_id = $1', [String(userId)]);
}

export async function listArtistInbox(projectId: string, artistName: string): Promise<{ threads: GmailThreadRecord[]; messages: GmailMessageRecord[] }> {
  if (!projectId || !artistName) return { threads: [], messages: [] };

  if (!hasDatabase()) {
    const local = await readLocalStore();
    const threads = local.threads
      .filter((item) => item.projectId === projectId && item.artistName === artistName)
      .sort((a, b) => (b.lastMessageAt || '').localeCompare(a.lastMessageAt || ''));
    const threadKeys = new Set(threads.map((item) => item.threadKey));
    const messages = local.messages
      .filter((item) => threadKeys.has(item.threadKey))
      .sort((a, b) => (a.sentAt || '').localeCompare(b.sentAt || ''));
    return { threads, messages };
  }

  await ensureSchema();
  const [threadsRes, messagesRes] = await Promise.all([
    getPool().query(
      'select * from gemfinder_gmail_threads where project_id = $1 and artist_name = $2 order by last_message_at desc nulls last, updated_at desc',
      [projectId, artistName],
    ),
    getPool().query(
      'select * from gemfinder_gmail_messages where project_id = $1 and artist_name = $2 order by sent_at asc nulls last, created_at asc',
      [projectId, artistName],
    ),
  ]);
  return {
    threads: threadsRes.rows.map((row) => mapDbThread(row)),
    messages: messagesRes.rows.map((row) => mapDbMessage(row)),
  };
}

export async function listProjectInbox(projectId: string): Promise<{ threads: GmailThreadRecord[] }> {
  if (!projectId) return { threads: [] };

  if (!hasDatabase()) {
    const local = await readLocalStore();
    const threads = local.threads
      .filter((item) => item.projectId === projectId)
      .sort((a, b) => (b.lastMessageAt || '').localeCompare(a.lastMessageAt || ''));
    return { threads };
  }

  await ensureSchema();
  const res = await getPool().query(
    'select * from gemfinder_gmail_threads where project_id = $1 order by last_message_at desc nulls last, updated_at desc',
    [projectId],
  );
  return { threads: res.rows.map((row) => mapDbThread(row)) };
}

export async function listThreadMessages(threadKey: string): Promise<GmailMessageRecord[]> {
  if (!threadKey) return [];

  if (!hasDatabase()) {
    const local = await readLocalStore();
    return local.messages
      .filter((item) => item.threadKey === threadKey)
      .sort((a, b) => (a.sentAt || '').localeCompare(b.sentAt || ''));
  }

  await ensureSchema();
  const res = await getPool().query(
    'select * from gemfinder_gmail_messages where thread_key = $1 order by sent_at asc nulls last, created_at asc',
    [threadKey],
  );
  return res.rows.map((row) => mapDbMessage(row));
}

export async function listThreadMessagesForKeys(threadKeys: string[]): Promise<GmailMessageRecord[]> {
  const keys = Array.from(new Set((threadKeys || []).map((item) => String(item || "").trim()).filter(Boolean)));
  if (!keys.length) return [];

  if (!hasDatabase()) {
    const local = await readLocalStore();
    const keySet = new Set(keys);
    return local.messages
      .filter((item) => keySet.has(item.threadKey))
      .sort((a, b) => (a.sentAt || '').localeCompare(b.sentAt || ''));
  }

  await ensureSchema();
  const res = await getPool().query(
    'select * from gemfinder_gmail_messages where thread_key = any($1::text[]) order by sent_at asc nulls last, created_at asc',
    [keys],
  );
  return res.rows.map((row) => mapDbMessage(row));
}

export async function upsertArtistInbox(
  thread: GmailThreadRecord,
  messages: GmailMessageRecord[],
): Promise<void> {
  const normalizedThread = normalizeThread(thread);
  if (!normalizedThread) throw new Error('Invalid Gmail thread');
  const normalizedMessages = messages.map(normalizeMessage).filter(Boolean) as GmailMessageRecord[];

  if (!hasDatabase()) {
    const local = await readLocalStore();
    const existingThread = local.threads.find((item) => item.threadKey === normalizedThread.threadKey) || null;
    const mergedThread = {
      ...existingThread,
      ...normalizedThread,
      threadOwnerUserId: normalizedThread.threadOwnerUserId || existingThread?.threadOwnerUserId || '',
      status: normalizedThread.status || existingThread?.status || 'open',
      nextFollowUpAt: normalizedThread.nextFollowUpAt || existingThread?.nextFollowUpAt || '',
      internalNote: normalizedThread.internalNote || existingThread?.internalNote || '',
      internalNoteUpdatedAt: normalizedThread.internalNoteUpdatedAt || existingThread?.internalNoteUpdatedAt || '',
      internalNoteUpdatedBy: normalizedThread.internalNoteUpdatedBy || existingThread?.internalNoteUpdatedBy || '',
    };
    const nextThreads = local.threads.filter((item) => item.threadKey !== normalizedThread.threadKey);
    nextThreads.push(mergedThread);

    const messageMap = new Map(local.messages.map((item) => [item.messageKey, item]));
    normalizedMessages.forEach((item) => {
      messageMap.set(item.messageKey, item);
    });

    await writeLocalStore({
      connections: local.connections,
      threads: nextThreads,
      messages: [...messageMap.values()],
    });
    return;
  }

  await ensureSchema();
  const db = getPool();
  await db.query(
    `insert into gemfinder_gmail_threads (
      thread_key, project_id, artist_name, artist_key, provider, external_thread_id, sender_user_id, sender_gmail_email,
      subject, participants, counterparty_email, snippet, last_message_at, last_inbound_at, last_outbound_at,
      last_message_direction, thread_owner_user_id, status, next_follow_up_at, internal_note, internal_note_updated_at, internal_note_updated_by, created_at, updated_at
    )
    values ($1, $2, $3, $4, 'gmail', $5, $6, $7, $8, $9::jsonb, $10, $11, $12::timestamptz, $13::timestamptz, $14::timestamptz, $15, $16, $17, $18::timestamptz, $19, $20::timestamptz, $21, $22::timestamptz, $23::timestamptz)
    on conflict (thread_key)
    do update set
      artist_key = excluded.artist_key,
      subject = excluded.subject,
      participants = excluded.participants,
      counterparty_email = excluded.counterparty_email,
      snippet = excluded.snippet,
      last_message_at = excluded.last_message_at,
      last_inbound_at = excluded.last_inbound_at,
      last_outbound_at = excluded.last_outbound_at,
      last_message_direction = excluded.last_message_direction,
      updated_at = excluded.updated_at`,
    [
      normalizedThread.threadKey,
      normalizedThread.projectId,
      normalizedThread.artistName,
      normalizedThread.artistKey,
      normalizedThread.externalThreadId,
      normalizedThread.senderUserId,
      normalizedThread.senderGmailEmail,
      normalizedThread.subject,
      JSON.stringify(normalizedThread.participants),
      normalizedThread.counterpartyEmail,
      normalizedThread.snippet,
      normalizedThread.lastMessageAt,
      normalizedThread.lastInboundAt || null,
      normalizedThread.lastOutboundAt || null,
      normalizedThread.lastMessageDirection,
      normalizedThread.threadOwnerUserId,
      normalizedThread.status,
      normalizedThread.nextFollowUpAt || null,
      normalizedThread.internalNote,
      normalizedThread.internalNoteUpdatedAt || null,
      normalizedThread.internalNoteUpdatedBy,
      normalizedThread.createdAt,
      normalizedThread.updatedAt,
    ],
  );

  for (const item of normalizedMessages) {
    await db.query(
      `insert into gemfinder_gmail_messages (
        message_key, thread_key, project_id, artist_name, provider, external_message_id, external_thread_id, direction,
        sender_user_id, sender_gmail_email, actor_user_id, actor_email, sender_email, from_name,
        to_emails, cc_emails, subject, snippet, body_text, sent_at, synced_at, message_id_header, in_reply_to
      )
      values ($1, $2, $3, $4, 'gmail', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15::jsonb, $16, $17, $18, $19::timestamptz, $20::timestamptz, $21, $22)
      on conflict (message_key)
      do update set
        direction = excluded.direction,
        actor_user_id = excluded.actor_user_id,
        actor_email = excluded.actor_email,
        sender_email = excluded.sender_email,
        from_name = excluded.from_name,
        to_emails = excluded.to_emails,
        cc_emails = excluded.cc_emails,
        subject = excluded.subject,
        snippet = excluded.snippet,
        body_text = excluded.body_text,
        sent_at = excluded.sent_at,
        synced_at = excluded.synced_at,
        message_id_header = excluded.message_id_header,
        in_reply_to = excluded.in_reply_to`,
      [
        item.messageKey,
        item.threadKey,
        item.projectId,
        item.artistName,
        item.externalMessageId,
        item.externalThreadId,
        item.direction,
        item.senderUserId,
        item.senderGmailEmail,
        item.actorUserId,
        item.actorEmail,
        item.senderEmail,
        item.fromName,
        JSON.stringify(item.toEmails),
        JSON.stringify(item.ccEmails),
        item.subject,
        item.snippet,
        item.bodyText,
        item.sentAt,
        item.syncedAt,
        item.messageIdHeader,
        item.inReplyTo,
      ],
    );
  }
}

export async function updateGmailThreadWorkflow(
  threadKey: string,
  changes: Partial<Pick<GmailThreadRecord, 'threadOwnerUserId' | 'status' | 'nextFollowUpAt' | 'internalNote'>>,
  actorLabel = '',
): Promise<GmailThreadRecord | null> {
  if (!threadKey) return null;
  const noteTouched = changes.internalNote !== undefined;
  const now = new Date().toISOString();

  if (!hasDatabase()) {
    const local = await readLocalStore();
    const existing = local.threads.find((item) => item.threadKey === threadKey);
    if (!existing) return null;
    const updated = normalizeThread({
      ...existing,
      threadOwnerUserId: changes.threadOwnerUserId !== undefined ? String(changes.threadOwnerUserId || '') : existing.threadOwnerUserId,
      status: changes.status !== undefined ? changes.status : existing.status,
      nextFollowUpAt: changes.nextFollowUpAt !== undefined ? changes.nextFollowUpAt : existing.nextFollowUpAt,
      internalNote: noteTouched ? String(changes.internalNote || '') : existing.internalNote,
      internalNoteUpdatedAt: noteTouched ? now : existing.internalNoteUpdatedAt,
      internalNoteUpdatedBy: noteTouched ? actorLabel : existing.internalNoteUpdatedBy,
      updatedAt: now,
    });
    if (!updated) return null;
    await writeLocalStore({
      ...local,
      threads: local.threads.map((item) => (item.threadKey === threadKey ? updated : item)),
    });
    return updated;
  }

  await ensureSchema();
  const db = getPool();
  const existingRes = await db.query('select * from gemfinder_gmail_threads where thread_key = $1 limit 1', [threadKey]);
  const existing = existingRes.rows[0] ? mapDbThread(existingRes.rows[0]) : null;
  if (!existing) return null;
  const merged = normalizeThread({
    ...existing,
    threadOwnerUserId: changes.threadOwnerUserId !== undefined ? String(changes.threadOwnerUserId || '') : existing.threadOwnerUserId,
    status: changes.status !== undefined ? changes.status : existing.status,
    nextFollowUpAt: changes.nextFollowUpAt !== undefined ? changes.nextFollowUpAt : existing.nextFollowUpAt,
    internalNote: noteTouched ? String(changes.internalNote || '') : existing.internalNote,
    internalNoteUpdatedAt: noteTouched ? now : existing.internalNoteUpdatedAt,
    internalNoteUpdatedBy: noteTouched ? actorLabel : existing.internalNoteUpdatedBy,
    updatedAt: now,
  });
  if (!merged) return null;
  const res = await db.query(
    `update gemfinder_gmail_threads
      set thread_owner_user_id = $2,
          status = $3,
          next_follow_up_at = $4::timestamptz,
          internal_note = $5,
          internal_note_updated_at = $6::timestamptz,
          internal_note_updated_by = $7,
          updated_at = now()
      where thread_key = $1
      returning *`,
    [
      threadKey,
      merged.threadOwnerUserId,
      merged.status,
      merged.nextFollowUpAt || null,
      merged.internalNote,
      merged.internalNoteUpdatedAt || null,
      merged.internalNoteUpdatedBy,
    ],
  );
  return res.rows[0] ? mapDbThread(res.rows[0]) : null;
}

export async function deleteGmailThreads(threadKeys: string[]): Promise<number> {
  const keys = Array.from(new Set((threadKeys || []).map((item) => String(item || '').trim()).filter(Boolean)));
  if (!keys.length) return 0;

  if (!hasDatabase()) {
    const local = await readLocalStore();
    const keySet = new Set(keys);
    const nextThreads = local.threads.filter((item) => !keySet.has(item.threadKey));
    const nextMessages = local.messages.filter((item) => !keySet.has(item.threadKey));
    const deletedCount = local.threads.length - nextThreads.length;
    if (deletedCount > 0) {
      await writeLocalStore({
        ...local,
        threads: nextThreads,
        messages: nextMessages,
      });
    }
    return deletedCount;
  }

  await ensureSchema();
  const db = getPool();
  await db.query('delete from gemfinder_gmail_messages where thread_key = any($1::text[])', [keys]);
  const res = await db.query('delete from gemfinder_gmail_threads where thread_key = any($1::text[])', [keys]);
  return Number(res.rowCount || 0);
}

export async function relabelGmailArtist(projectId: string, previousArtistName: string, nextArtistName: string): Promise<void> {
  const prevName = String(previousArtistName || '').trim();
  const nextName = String(nextArtistName || '').trim();
  if (!projectId || !prevName || !nextName || prevName === nextName) return;

  const nextKey = nextName
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(ft|feat|featuring)\b\.?/g, ' ')
    .replace(/[^a-z0-9]/g, '')
    .trim();

  if (!hasDatabase()) {
    const local = await readLocalStore();
    const nextThreads = local.threads.map((item) =>
      item.projectId === projectId && item.artistName === prevName
        ? normalizeThread({ ...item, artistName: nextName, artistKey: nextKey, updatedAt: new Date().toISOString() }) || item
        : item,
    );
    const nextMessages = local.messages.map((item) =>
      item.projectId === projectId && item.artistName === prevName
        ? normalizeMessage({ ...item, artistName: nextName, syncedAt: new Date().toISOString() }) || item
        : item,
    );
    await writeLocalStore({ ...local, threads: nextThreads, messages: nextMessages });
    return;
  }

  await ensureSchema();
  const db = getPool();
  await db.query(
    `update gemfinder_gmail_threads
        set artist_name = $3,
            artist_key = $4,
            updated_at = now()
      where project_id = $1 and artist_name = $2`,
    [projectId, prevName, nextName, nextKey],
  );
  await db.query(
    `update gemfinder_gmail_messages
        set artist_name = $3,
            synced_at = now()
      where project_id = $1 and artist_name = $2`,
    [projectId, prevName, nextName],
  );
}
