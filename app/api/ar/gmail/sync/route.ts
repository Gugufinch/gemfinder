import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthUserById } from '@/lib/gemfinder/auth-store';
import { fetchGmailThread, gmailSearchThreadIds, refreshGoogleAccessToken, threadToStoreRecords } from '@/lib/gemfinder/gmail';
import {
  buildThreadKey,
  deleteGmailThreads,
  getPrivateGmailConnectionByUserId,
  listArtistInbox,
  listWorkspaceGmailConnections,
  listWorkspacePrivateGmailConnections,
  updateGmailConnectionMetadata,
  upsertArtistInbox,
} from '@/lib/gemfinder/gmail-store';

const schema = z.object({
  projectId: z.string().min(1).max(120),
  artistName: z.string().min(1).max(220),
  artistEmail: z.string().email().max(220),
  senderUserId: z.string().max(120).optional(),
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
    return NextResponse.json({ error: 'Invalid sync payload', details: parsed.error.issues }, { status: 400 });
  }

  const targets = parsed.data.senderUserId
    ? [await getPrivateGmailConnectionByUserId(parsed.data.senderUserId)].filter(Boolean)
    : await listWorkspacePrivateGmailConnections();

  const syncedUsers: string[] = [];
  const errors: string[] = [];

  for (const connection of targets) {
    if (!connection) continue;
    try {
      const refreshed = await refreshGoogleAccessToken(connection.refreshToken);
      const refreshTime = new Date().toISOString();
      await updateGmailConnectionMetadata(connection.userId, {
        scopes: refreshed.scope.length ? refreshed.scope : connection.scopes,
        lastRefreshAt: refreshTime,
        tokenExpiresAt: refreshed.tokenExpiresAt || '',
        lastError: '',
      });
      const threadIds = await gmailSearchThreadIds(refreshed.accessToken, parsed.data.artistEmail, 12);
      for (const threadId of threadIds) {
        const gmailThread = await fetchGmailThread(refreshed.accessToken, threadId);
        const records = threadToStoreRecords({
          projectId: parsed.data.projectId,
          artistName: parsed.data.artistName,
          artistEmail: parsed.data.artistEmail,
          senderUserId: connection.userId,
          senderGmailEmail: connection.gmailEmail,
          thread: gmailThread,
        });
        if (!records) {
          await deleteGmailThreads([buildThreadKey(parsed.data.projectId, connection.userId, String(gmailThread.id || threadId))]);
          continue;
        }
        await upsertArtistInbox(records.thread, records.messages);
      }
      await updateGmailConnectionMetadata(connection.userId, {
        lastSyncAt: new Date().toISOString(),
        lastError: '',
      });
      syncedUsers.push(connection.gmailEmail);
    } catch (error) {
      await updateGmailConnectionMetadata(connection.userId, {
        lastError: error instanceof Error ? error.message : 'Sync failed',
      }).catch(() => null);
      errors.push(`${connection.gmailEmail}: ${error instanceof Error ? error.message : 'Sync failed'}`);
    }
  }

  const inbox = await listArtistInbox(parsed.data.projectId, parsed.data.artistName);
  const connections = await listWorkspaceGmailConnections();
  return NextResponse.json({
    ok: true,
    syncedUsers,
    errors,
    ...inbox,
    connections,
  });
}
