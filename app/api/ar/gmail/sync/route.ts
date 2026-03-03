import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthUserById } from '@/lib/gemfinder/auth-store';
import { fetchGmailThread, gmailSearchThreadIds, refreshGoogleAccessToken, threadToStoreRecords } from '@/lib/gemfinder/gmail';
import {
  getPrivateGmailConnectionByUserId,
  listArtistInbox,
  listWorkspaceGmailConnections,
  listWorkspacePrivateGmailConnections,
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
      const { accessToken } = await refreshGoogleAccessToken(connection.refreshToken);
      const threadIds = await gmailSearchThreadIds(accessToken, parsed.data.artistEmail, 12);
      for (const threadId of threadIds) {
        const gmailThread = await fetchGmailThread(accessToken, threadId);
        const records = threadToStoreRecords({
          projectId: parsed.data.projectId,
          artistName: parsed.data.artistName,
          senderUserId: connection.userId,
          senderGmailEmail: connection.gmailEmail,
          thread: gmailThread,
        });
        await upsertArtistInbox(records.thread, records.messages);
      }
      syncedUsers.push(connection.gmailEmail);
    } catch (error) {
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
