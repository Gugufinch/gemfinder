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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists gemfinder_gmail_threads (
  thread_key text primary key,
  project_id text not null,
  artist_name text not null,
  provider text not null default 'gmail',
  external_thread_id text not null,
  sender_user_id text not null,
  sender_gmail_email text not null,
  subject text not null default '',
  participants jsonb not null default '[]'::jsonb,
  snippet text not null default '',
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists gemfinder_gmail_threads_unique_mailbox
  on gemfinder_gmail_threads (project_id, provider, sender_user_id, external_thread_id);

create index if not exists gemfinder_gmail_threads_artist_idx
  on gemfinder_gmail_threads (project_id, artist_name, updated_at desc);

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
    provider: 'gmail',
    externalThreadId: String(value.externalThreadId),
    senderUserId: String(value.senderUserId),
    senderGmailEmail: String(value.senderGmailEmail).trim().toLowerCase(),
    subject: String(value.subject || ''),
    participants: normalizeStringArray(value.participants),
    snippet: String(value.snippet || ''),
    lastMessageAt: normalizeIso(value.lastMessageAt) || now,
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
    connected: true,
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
    createdAt: normalizeIso(row.created_at) || new Date().toISOString(),
    updatedAt: normalizeIso(row.updated_at) || new Date().toISOString(),
  };
}

function mapDbThread(row: Record<string, unknown>): GmailThreadRecord {
  return {
    threadKey: String(row.thread_key),
    projectId: String(row.project_id),
    artistName: String(row.artist_name),
    provider: 'gmail',
    externalThreadId: String(row.external_thread_id),
    senderUserId: String(row.sender_user_id),
    senderGmailEmail: String(row.sender_gmail_email).trim().toLowerCase(),
    subject: String(row.subject || ''),
    participants: normalizeStringArray(row.participants),
    snippet: String(row.snippet || ''),
    lastMessageAt: normalizeIso(row.last_message_at) || new Date().toISOString(),
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
      user_id, workspace_email, gmail_email, refresh_token_cipher, scopes, history_id, created_at, updated_at
    )
    values ($1, $2, $3, $4, $5::jsonb, $6, $7::timestamptz, $8::timestamptz)
    on conflict (user_id)
    do update set
      workspace_email = excluded.workspace_email,
      gmail_email = excluded.gmail_email,
      refresh_token_cipher = excluded.refresh_token_cipher,
      scopes = excluded.scopes,
      history_id = excluded.history_id,
      updated_at = excluded.updated_at`,
    [
      normalized.userId,
      normalized.workspaceEmail,
      normalized.gmailEmail,
      encryptToken(normalized.refreshToken),
      JSON.stringify(normalized.scopes),
      normalized.historyId,
      normalized.createdAt,
      normalized.updatedAt,
    ],
  );
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

export async function upsertArtistInbox(
  thread: GmailThreadRecord,
  messages: GmailMessageRecord[],
): Promise<void> {
  const normalizedThread = normalizeThread(thread);
  if (!normalizedThread) throw new Error('Invalid Gmail thread');
  const normalizedMessages = messages.map(normalizeMessage).filter(Boolean) as GmailMessageRecord[];

  if (!hasDatabase()) {
    const local = await readLocalStore();
    const nextThreads = local.threads.filter((item) => item.threadKey !== normalizedThread.threadKey);
    nextThreads.push(normalizedThread);

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
      thread_key, project_id, artist_name, provider, external_thread_id, sender_user_id, sender_gmail_email,
      subject, participants, snippet, last_message_at, created_at, updated_at
    )
    values ($1, $2, $3, 'gmail', $4, $5, $6, $7, $8::jsonb, $9, $10::timestamptz, $11::timestamptz, $12::timestamptz)
    on conflict (thread_key)
    do update set
      subject = excluded.subject,
      participants = excluded.participants,
      snippet = excluded.snippet,
      last_message_at = excluded.last_message_at,
      updated_at = excluded.updated_at`,
    [
      normalizedThread.threadKey,
      normalizedThread.projectId,
      normalizedThread.artistName,
      normalizedThread.externalThreadId,
      normalizedThread.senderUserId,
      normalizedThread.senderGmailEmail,
      normalizedThread.subject,
      JSON.stringify(normalizedThread.participants),
      normalizedThread.snippet,
      normalizedThread.lastMessageAt,
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
