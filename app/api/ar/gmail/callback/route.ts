import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserById } from '@/lib/gemfinder/auth-store';
import { exchangeGoogleCode, fetchGmailProfile, gmailErrorMeta, tokenExpiryFromSeconds } from '@/lib/gemfinder/gmail';
import { getPrivateGmailConnectionByUserId, updateGmailConnectionMetadata, upsertGmailConnection } from '@/lib/gemfinder/gmail-store';

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

function addQueries(pathname: string, params: Record<string, string | undefined>): string {
  let next = pathname;
  Object.entries(params).forEach(([key, value]) => {
    if (!value) return;
    next = addQuery(next, key, value);
  });
  return next;
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code') || '';
  const state = req.nextUrl.searchParams.get('state') || '';
  const googleError = req.nextUrl.searchParams.get('error') || '';
  const googleErrorDescription = req.nextUrl.searchParams.get('error_description') || '';
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

  if (googleError) {
    const message =
      googleError === 'access_denied'
        ? 'Google blocked this mailbox. Use an allowed songfinch.com account for this internal OAuth app.'
        : decodeURIComponent(googleErrorDescription || googleError);
    return clearAndRedirect(
      addQueries(parsedState.returnTo || '/ar', {
        gmail_error: message,
        gmail_error_code: googleError,
        gmail_error_details: googleErrorDescription || '',
      }),
    );
  }

  const actor = await getAuthUserById(parsedState.userId);
  if (!actor || !actor.active) {
    return clearAndRedirect('/ar?gmail=auth_required');
  }

  try {
    const tokens = await exchangeGoogleCode(code, req.nextUrl.origin);
    if (!tokens.access_token) {
      throw new Error('Google token exchange did not return an access token');
    }
    const existing = await getPrivateGmailConnectionByUserId(actor.userId);
    const refreshToken = String(tokens.refresh_token || existing?.refreshToken || '').trim();
    if (!refreshToken) {
      await updateGmailConnectionMetadata(actor.userId, {
        lastError: 'No refresh token returned; ensure prompt=consent + access_type=offline.',
      }).catch(() => null);
      return clearAndRedirect(
        addQueries(parsedState.returnTo || '/ar', {
          gmail: 'missing_refresh_token',
          gmail_error: 'No refresh token returned; ensure prompt=consent + access_type=offline.',
          gmail_error_code: 'missing_refresh_token',
        }),
      );
    }
    const profile = await fetchGmailProfile(tokens.access_token);
    const now = new Date().toISOString();
    const grantedScopes = String(tokens.scope || '')
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);
    await upsertGmailConnection({
      userId: actor.userId,
      workspaceEmail: actor.email,
      gmailEmail: profile.emailAddress,
      refreshToken,
      scopes: grantedScopes,
      historyId: profile.historyId,
      lastRefreshAt: now,
      lastSyncAt: existing?.lastSyncAt || '',
      tokenExpiresAt: tokenExpiryFromSeconds(tokens.expires_in),
      lastError: '',
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: now,
    });
    return clearAndRedirect(addQuery(parsedState.returnTo || '/ar', 'gmail', 'connected'));
  } catch (error) {
    const meta = gmailErrorMeta(error);
    await updateGmailConnectionMetadata(actor.userId, {
      lastError: meta.message,
    }).catch(() => null);
    return clearAndRedirect(
      addQueries(parsedState.returnTo || '/ar', {
        gmail_error: meta.message,
        gmail_error_code: meta.code,
        gmail_error_details: meta.details,
      }),
    );
  }
}
