import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthUserById } from '@/lib/gemfinder/auth-store';
import { fetchGmailThread, refreshGoogleAccessToken, sendGmailMessage, threadToStoreRecords } from '@/lib/gemfinder/gmail';
import {
  getPrivateGmailConnectionByUserId,
  listArtistInbox,
  listWorkspaceGmailConnections,
  updateGmailConnectionMetadata,
  upsertArtistInbox,
} from '@/lib/gemfinder/gmail-store';

const schema = z.object({
  projectId: z.string().min(1).max(120),
  artistName: z.string().min(1).max(220),
  artistEmail: z.string().email().max(220),
  senderUserId: z.string().min(1).max(120),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(40000),
  threadKey: z.string().max(240).optional(),
  externalThreadId: z.string().max(240).optional(),
});

export async function POST(req: NextRequest) {
  const userId = req.cookies.get('ar_user')?.value || '';
  const actor = userId ? await getAuthUserById(userId) : null;
  if (!actor || !actor.active) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (actor.role === 'viewer') {
    return NextResponse.json({ error: 'Editor or admin role required' }, { status: 403 });
  }

  const payload = await req.json().catch(() => null);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid Gmail send payload', details: parsed.error.issues }, { status: 400 });
  }

  const sender = await getPrivateGmailConnectionByUserId(parsed.data.senderUserId);
  if (!sender) {
    return NextResponse.json({ error: 'Selected Gmail sender is not connected' }, { status: 404 });
  }

  const existingInbox = await listArtistInbox(parsed.data.projectId, parsed.data.artistName);
  const selectedThread = existingInbox.threads.find((item) =>
    item.threadKey === parsed.data.threadKey || item.externalThreadId === parsed.data.externalThreadId,
  );
  const selectedMessages = selectedThread
    ? existingInbox.messages.filter((item) => item.threadKey === selectedThread.threadKey)
    : [];
  const references = selectedMessages.map((item) => item.messageIdHeader).filter(Boolean).slice(-10);
  const inReplyTo = references[references.length - 1] || '';

  try {
    const refreshed = await refreshGoogleAccessToken(sender.refreshToken);
    const now = new Date().toISOString();
    await updateGmailConnectionMetadata(sender.userId, {
      scopes: refreshed.scope.length ? refreshed.scope : sender.scopes,
      lastRefreshAt: now,
      tokenExpiresAt: refreshed.tokenExpiresAt || '',
      lastError: '',
    });
    const sent = await sendGmailMessage({
      accessToken: refreshed.accessToken,
      to: parsed.data.artistEmail,
      subject: parsed.data.subject,
      body: parsed.data.body,
      externalThreadId: selectedThread?.externalThreadId || parsed.data.externalThreadId || '',
      inReplyTo,
      references,
    });
    const gmailThread = await fetchGmailThread(refreshed.accessToken, sent.threadId);
    const records = threadToStoreRecords({
      projectId: parsed.data.projectId,
      artistName: parsed.data.artistName,
      artistEmail: parsed.data.artistEmail,
      senderUserId: sender.userId,
      senderGmailEmail: sender.gmailEmail,
      actorUserId: actor.userId,
      actorEmail: actor.email,
      thread: gmailThread,
    });
    if (!records) {
      throw new Error('Could not mirror the sent Gmail thread into GEMFINDER');
    }
    await upsertArtistInbox(records.thread, records.messages);
    await updateGmailConnectionMetadata(sender.userId, {
      lastSyncAt: new Date().toISOString(),
      lastError: '',
    });
    const inbox = await listArtistInbox(parsed.data.projectId, parsed.data.artistName);
    const connections = await listWorkspaceGmailConnections();
    return NextResponse.json({
      ok: true,
      threadKey: records.thread.threadKey,
      externalThreadId: sent.threadId,
      senderGmailEmail: sender.gmailEmail,
      ...inbox,
      connections,
    });
  } catch (error) {
    await updateGmailConnectionMetadata(sender.userId, {
      lastError: error instanceof Error ? error.message : 'Could not send Gmail message',
    }).catch(() => null);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not send Gmail message' },
      { status: 500 },
    );
  }
}
