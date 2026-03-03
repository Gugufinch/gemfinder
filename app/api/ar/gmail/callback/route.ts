import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserById } from '@/lib/gemfinder/auth-store';
import { exchangeGoogleCode, fetchGmailProfile } from '@/lib/gemfinder/gmail';
import { getPrivateGmailConnectionByUserId, upsertGmailConnection } from '@/lib/gemfinder/gmail-store';

type GmailStatePayload = {
  nonce: string;
  userId: string;
  returnTo: string;
  issuedAt: string;
};

function decodeState(value: string): GmailStatePayload | null {
  try {
    const decoded = Buffer.from(String(value || ''), 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as Partial<GmailStatePayload>;
    if (!parsed?.nonce || !parsed?.userId) return null;
    return {
      nonce: String(parsed.nonce),
      userId: String(parsed.userId),
      returnTo: String(parsed.returnTo || '/ar'),
      issuedAt: String(parsed.issuedAt || ''),
    };
  } catch {
    return null;
  }
}

function addQuery(pathname: string, key: string, value: string): string {
  const url = new URL(pathname, 'https://gemfinder.local');
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code') || '';
  const state = req.nextUrl.searchParams.get('state') || '';
  const cookieState = req.cookies.get('ar_gmail_state')?.value || '';
  const parsedState = decodeState(cookieState);
  const clearAndRedirect = (path: string) => {
    const res = NextResponse.redirect(new URL(path, req.nextUrl.origin));
    res.cookies.set('ar_gmail_state', '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
    return res;
  };

  if (!code || !state || !cookieState || state !== cookieState || !parsedState) {
    return clearAndRedirect('/ar?gmail=state_error');
  }

  const actor = await getAuthUserById(parsedState.userId);
  if (!actor || !actor.active) {
    return clearAndRedirect('/ar?gmail=auth_required');
  }

  try {
    const tokens = await exchangeGoogleCode(code, req.nextUrl.origin);
    const existing = await getPrivateGmailConnectionByUserId(actor.userId);
    const refreshToken = String(tokens.refresh_token || existing?.refreshToken || '').trim();
    if (!refreshToken) {
      return clearAndRedirect(addQuery(parsedState.returnTo || '/ar', 'gmail', 'missing_refresh_token'));
    }
    const profile = await fetchGmailProfile(String(tokens.access_token || ''));
    await upsertGmailConnection({
      userId: actor.userId,
      workspaceEmail: actor.email,
      gmailEmail: profile.emailAddress,
      refreshToken,
      scopes: String(tokens.scope || '').split(/\s+/).filter(Boolean),
      historyId: profile.historyId,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return clearAndRedirect(addQuery(parsedState.returnTo || '/ar', 'gmail', 'connected'));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'google_oauth_failed';
    return clearAndRedirect(addQuery(parsedState.returnTo || '/ar', 'gmail_error', message));
  }
}
