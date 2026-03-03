import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserById } from '@/lib/gemfinder/auth-store';
import { getPrivateGmailConnectionByUserId, listWorkspaceGmailConnections } from '@/lib/gemfinder/gmail-store';

async function getActor(req: NextRequest) {
  const userId = req.cookies.get('ar_user')?.value || '';
  if (!userId) return null;
  return getAuthUserById(userId);
}

function gmailAvailable(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL));
}

export async function GET(req: NextRequest) {
  const actor = await getActor(req);
  if (!actor || !actor.active) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const connections = await listWorkspaceGmailConnections();
  const current = await getPrivateGmailConnectionByUserId(actor.userId);

  return NextResponse.json({
    ok: true,
    available: gmailAvailable(),
    currentUserId: actor.userId,
    currentUserConnected: !!current,
    currentUserGmail: current?.gmailEmail || '',
    currentConnection: current
      ? {
          connected: true,
          provider_email: current.gmailEmail,
          gmailEmail: current.gmailEmail,
          scopes: current.scopes || [],
          token_expires_at: current.tokenExpiresAt || '',
          last_refresh_at: current.lastRefreshAt || '',
          last_sync_at: current.lastSyncAt || '',
          last_error: current.lastError || '',
          updated_at: current.updatedAt || '',
        }
      : {
          connected: false,
          provider_email: '',
          gmailEmail: '',
          scopes: [],
          token_expires_at: '',
          last_refresh_at: '',
          last_sync_at: '',
          last_error: '',
          updated_at: '',
        },
    connections,
  });
}
