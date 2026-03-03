import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserById } from '@/lib/gemfinder/auth-store';
import { gmailErrorMeta, gmailListMessageIds, refreshGoogleAccessToken } from '@/lib/gemfinder/gmail';
import { getPrivateGmailConnectionByUserId, updateGmailConnectionMetadata } from '@/lib/gemfinder/gmail-store';

export async function POST(req: NextRequest) {
  const userId = req.cookies.get('ar_user')?.value || '';
  const actor = userId ? await getAuthUserById(userId) : null;
  if (!actor || !actor.active) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (actor.role === 'viewer') {
    return NextResponse.json({ error: 'Editor or admin role required' }, { status: 403 });
  }

  const connection = await getPrivateGmailConnectionByUserId(actor.userId);
  if (!connection) {
    return NextResponse.json({ error: 'No Gmail mailbox connected for this user' }, { status: 404 });
  }

  try {
    const refreshed = await refreshGoogleAccessToken(connection.refreshToken);
    const refreshTime = new Date().toISOString();
    await updateGmailConnectionMetadata(connection.userId, {
      scopes: refreshed.scope.length ? refreshed.scope : connection.scopes,
      lastRefreshAt: refreshTime,
      tokenExpiresAt: refreshed.tokenExpiresAt || '',
      lastError: '',
    });
    const messageIds = await gmailListMessageIds(refreshed.accessToken, 5);
    return NextResponse.json({
      ok: true,
      connected: true,
      provider_email: connection.gmailEmail,
      sample_message_ids: messageIds,
      count: messageIds.length,
      scopes: refreshed.scope.length ? refreshed.scope : connection.scopes,
      token_expires_at: refreshed.tokenExpiresAt || '',
      last_refresh_at: refreshTime,
    });
  } catch (error) {
    const meta = gmailErrorMeta(error);
    await updateGmailConnectionMetadata(connection.userId, {
      lastError: meta.message,
    }).catch(() => null);
    return NextResponse.json(
      {
        error: meta.message,
        code: meta.code,
        details: meta.details,
      },
      { status: meta.status || 500 },
    );
  }
}
