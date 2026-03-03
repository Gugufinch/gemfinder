import type { GmailMessageRecord, GmailThreadRecord } from '@/lib/gemfinder/types';
import { buildMessageKey, buildThreadKey } from '@/lib/gemfinder/gmail-store';

const GOOGLE_AUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];

type GmailTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

type GmailHeader = { name?: string; value?: string };
type GmailBody = { data?: string; attachmentId?: string; size?: number };
type GmailPart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: GmailBody;
  parts?: GmailPart[];
};
type GmailMessage = {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  payload?: GmailPart;
};
type GmailThread = {
  id?: string;
  historyId?: string;
  messages?: GmailMessage[];
  snippet?: string;
};

function requireEnv(name: string): string {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function appBaseUrl(origin?: string): string {
  return String(process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || origin || '').replace(/\/+$/, '');
}

function redirectUri(origin?: string): string {
  const base = appBaseUrl(origin);
  if (!base) throw new Error('Missing APP_URL or NEXT_PUBLIC_APP_URL');
  return `${base}/api/ar/gmail/callback`;
}

function base64UrlEncode(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64url');
}

function base64UrlDecode(value?: string): string {
  if (!value) return '';
  try {
    return Buffer.from(value, 'base64url').toString('utf8');
  } catch {
    return '';
  }
}

function cleanHeaderValue(value: string): string {
  return String(value || '').replace(/\r?\n/g, ' ').trim();
}

function getHeader(message: GmailMessage | GmailPart | undefined, name: string): string {
  const headers = 'payload' in (message || {}) ? (message as GmailMessage).payload?.headers : (message as GmailPart | undefined)?.headers;
  const hit = (headers || []).find((item) => String(item?.name || '').toLowerCase() === name.toLowerCase());
  return String(hit?.value || '');
}

function walkParts(part?: GmailPart): GmailPart[] {
  if (!part) return [];
  const childParts = (part.parts || []).flatMap((child) => walkParts(child));
  return [part, ...childParts];
}

function extractBodyText(message?: GmailMessage): string {
  const payload = message?.payload;
  if (!payload) return '';
  const parts = walkParts(payload);
  const plain = parts.find((part) => part.mimeType === 'text/plain' && part.body?.data);
  if (plain?.body?.data) return base64UrlDecode(plain.body.data).trim();
  const html = parts.find((part) => part.mimeType === 'text/html' && part.body?.data);
  if (html?.body?.data) {
    return base64UrlDecode(html.body.data)
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  if (payload.body?.data) return base64UrlDecode(payload.body.data).trim();
  return '';
}

function parseAddressList(value: string): string[] {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const match = item.match(/<([^>]+)>/);
      return (match?.[1] || item).trim().toLowerCase();
    });
}

function parseFromHeader(value: string): { email: string; name: string } {
  const match = String(value || '').match(/^(.*?)(?:<([^>]+)>)?$/);
  const rawName = String(match?.[1] || '').replace(/["<>]/g, '').trim();
  const email = String(match?.[2] || value || '').replace(/["<>]/g, '').trim().toLowerCase();
  return {
    email,
    name: rawName || email,
  };
}

function sentAtForMessage(message: GmailMessage): string {
  const internalDate = Number(message.internalDate || 0);
  if (internalDate > 0) return new Date(internalDate).toISOString();
  const dateHeader = getHeader(message, 'Date');
  const parsed = dateHeader ? new Date(dateHeader) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return new Date().toISOString();
}

function subjectForThread(thread: GmailThread): string {
  const first = (thread.messages || [])[0];
  return cleanHeaderValue(getHeader(first, 'Subject') || '');
}

function latestSnippet(thread: GmailThread): string {
  const messages = thread.messages || [];
  const last = messages[messages.length - 1];
  return String(last?.snippet || thread.snippet || '').trim();
}

function participantsForThread(thread: GmailThread): string[] {
  const set = new Set<string>();
  (thread.messages || []).forEach((message) => {
    parseAddressList(getHeader(message, 'From')).forEach((item) => set.add(item));
    parseAddressList(getHeader(message, 'To')).forEach((item) => set.add(item));
    parseAddressList(getHeader(message, 'Cc')).forEach((item) => set.add(item));
  });
  return [...set].filter(Boolean);
}

function lastMessageAt(thread: GmailThread): string {
  const messages = thread.messages || [];
  const last = messages[messages.length - 1];
  return last ? sentAtForMessage(last) : new Date().toISOString();
}

async function googleFetch<T>(url: string, init: RequestInit, fallbackError: string): Promise<T> {
  const res = await fetch(url, init);
  const raw = await res.text();
  if (!res.ok) {
    try {
      const parsed = JSON.parse(raw);
      const message = parsed?.error?.message || parsed?.error_description || parsed?.error || fallbackError;
      throw new Error(message);
    } catch (error) {
      if (error instanceof Error && error.message !== `Unexpected token o in JSON at position 1`) throw error;
      throw new Error(fallbackError);
    }
  }
  return JSON.parse(raw) as T;
}

export function gmailScopes(): string[] {
  return [...GMAIL_SCOPES];
}

export function buildGoogleAuthUrl(state: string, origin?: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv('GOOGLE_CLIENT_ID'),
    redirect_uri: redirectUri(origin),
    response_type: 'code',
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    scope: gmailScopes().join(' '),
    state,
  });
  return `${GOOGLE_AUTH_BASE}?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string, origin?: string): Promise<GmailTokenResponse> {
  const params = new URLSearchParams({
    code,
    client_id: requireEnv('GOOGLE_CLIENT_ID'),
    client_secret: requireEnv('GOOGLE_CLIENT_SECRET'),
    redirect_uri: redirectUri(origin),
    grant_type: 'authorization_code',
  });
  return googleFetch<GmailTokenResponse>(
    GOOGLE_TOKEN_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    },
    'Google token exchange failed',
  );
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<{ accessToken: string; scope: string[] }> {
  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: requireEnv('GOOGLE_CLIENT_ID'),
    client_secret: requireEnv('GOOGLE_CLIENT_SECRET'),
    grant_type: 'refresh_token',
  });
  const data = await googleFetch<GmailTokenResponse>(
    GOOGLE_TOKEN_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    },
    'Google token refresh failed',
  );
  if (!data.access_token) throw new Error('Google token refresh did not return an access token');
  return {
    accessToken: data.access_token,
    scope: String(data.scope || '').split(/\s+/).filter(Boolean),
  };
}

export async function fetchGmailProfile(accessToken: string): Promise<{ emailAddress: string; historyId: string }> {
  const data = await googleFetch<{ emailAddress?: string; historyId?: string }>(
    `${GMAIL_API_BASE}/profile`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    'Could not load Gmail profile',
  );
  return {
    emailAddress: String(data.emailAddress || '').trim().toLowerCase(),
    historyId: String(data.historyId || ''),
  };
}

export async function gmailSearchThreadIds(accessToken: string, artistEmail: string, maxResults = 20): Promise<string[]> {
  const cleanEmail = String(artistEmail || '').trim().toLowerCase();
  if (!cleanEmail) return [];
  const q = `from:${cleanEmail} OR to:${cleanEmail} OR cc:${cleanEmail}`;
  const params = new URLSearchParams({
    q,
    maxResults: String(Math.max(1, Math.min(maxResults, 50))),
  });
  const data = await googleFetch<{ messages?: Array<{ threadId?: string }> }>(
    `${GMAIL_API_BASE}/messages?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    'Could not search Gmail messages',
  );
  return [...new Set((data.messages || []).map((item) => String(item.threadId || '')).filter(Boolean))];
}

export async function fetchGmailThread(accessToken: string, externalThreadId: string): Promise<GmailThread> {
  return googleFetch<GmailThread>(
    `${GMAIL_API_BASE}/threads/${encodeURIComponent(externalThreadId)}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    'Could not load Gmail thread',
  );
}

export function threadToStoreRecords(input: {
  projectId: string;
  artistName: string;
  senderUserId: string;
  senderGmailEmail: string;
  actorUserId?: string;
  actorEmail?: string;
  thread: GmailThread;
}): { thread: GmailThreadRecord; messages: GmailMessageRecord[] } {
  const { projectId, artistName, senderUserId, senderGmailEmail, actorUserId = '', actorEmail = '', thread } = input;
  const externalThreadId = String(thread.id || '');
  const threadKey = buildThreadKey(projectId, senderUserId, externalThreadId);
  const threadRecord: GmailThreadRecord = {
    threadKey,
    projectId,
    artistName,
    provider: 'gmail',
    externalThreadId,
    senderUserId,
    senderGmailEmail: senderGmailEmail.toLowerCase(),
    subject: subjectForThread(thread),
    participants: participantsForThread(thread),
    snippet: latestSnippet(thread),
    lastMessageAt: lastMessageAt(thread),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const messages = (thread.messages || []).map((message) => {
    const from = parseFromHeader(getHeader(message, 'From'));
    const toEmails = parseAddressList(getHeader(message, 'To'));
    const ccEmails = parseAddressList(getHeader(message, 'Cc'));
    const senderEmail = from.email.toLowerCase();
    const outbound = senderEmail === senderGmailEmail.toLowerCase();
    return {
      messageKey: buildMessageKey(senderUserId, String(message.id || '')),
      threadKey,
      projectId,
      artistName,
      provider: 'gmail' as const,
      externalMessageId: String(message.id || ''),
      externalThreadId,
      direction: outbound ? 'outbound' as const : 'inbound' as const,
      senderUserId,
      senderGmailEmail: senderGmailEmail.toLowerCase(),
      actorUserId: outbound ? actorUserId : '',
      actorEmail: outbound ? actorEmail.toLowerCase() : '',
      senderEmail,
      fromName: from.name,
      toEmails,
      ccEmails,
      subject: cleanHeaderValue(getHeader(message, 'Subject')),
      snippet: String(message.snippet || '').trim(),
      bodyText: extractBodyText(message),
      sentAt: sentAtForMessage(message),
      syncedAt: new Date().toISOString(),
      messageIdHeader: cleanHeaderValue(getHeader(message, 'Message-Id')),
      inReplyTo: cleanHeaderValue(getHeader(message, 'In-Reply-To')),
    };
  });

  return { thread: threadRecord, messages };
}

function buildMimeMessage(input: {
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string[];
}): string {
  const lines = [
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    `To: ${cleanHeaderValue(input.to)}`,
    `Subject: ${cleanHeaderValue(input.subject)}`,
  ];
  if (input.inReplyTo) lines.push(`In-Reply-To: ${cleanHeaderValue(input.inReplyTo)}`);
  if (input.references?.length) lines.push(`References: ${input.references.map(cleanHeaderValue).join(' ')}`);
  return `${lines.join('\r\n')}\r\n\r\n${String(input.body || '').replace(/\r?\n/g, '\r\n')}`;
}

export async function sendGmailMessage(input: {
  accessToken: string;
  to: string;
  subject: string;
  body: string;
  externalThreadId?: string;
  inReplyTo?: string;
  references?: string[];
}): Promise<{ id: string; threadId: string }> {
  const raw = base64UrlEncode(
    buildMimeMessage({
      to: input.to,
      subject: input.subject,
      body: input.body,
      inReplyTo: input.inReplyTo,
      references: input.references,
    }),
  );
  const payload = {
    raw,
    ...(input.externalThreadId ? { threadId: input.externalThreadId } : {}),
  };
  const data = await googleFetch<{ id?: string; threadId?: string }>(
    `${GMAIL_API_BASE}/messages/send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    'Could not send Gmail message',
  );
  if (!data.id || !data.threadId) throw new Error('Gmail send did not return message metadata');
  return { id: data.id, threadId: data.threadId };
}
