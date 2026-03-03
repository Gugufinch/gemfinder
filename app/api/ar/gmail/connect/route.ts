import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserById } from '@/lib/gemfinder/auth-store';
import { buildGoogleAuthUrl } from '@/lib/gemfinder/gmail';

type GmailStatePayload = {
  nonce: string;
  userId: string;
  returnTo: string;
  issuedAt: string;
};

function firstHeaderValue(value: string | null): string {
  return String(value || '')
    .split(',')[0]
    .trim();
}

function requestOrigin(req: NextRequest): string {
  const forwardedProto = firstHeaderValue(req.headers.get('x-forwarded-proto'));
  const forwardedHost = firstHeaderValue(req.headers.get('x-forwarded-host'));
  const directHost = firstHeaderValue(req.headers.get('host'));
  const urlOrigin = new URL(req.url).origin.replace(/\/+$/, '');
  const proto = forwardedProto || req.nextUrl.protocol.replace(/:$/, '') || 'https';
  const host = forwardedHost || directHost;
  if (host) return `${proto}://${host}`.replace(/\/+$/, '');
  return urlOrigin;
}

function encodeState(payload: GmailStatePayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function safeReturnTo(value: string): string {
  if (!value || !value.startsWith('/ar')) return '/ar';
  return value;
}

export async function GET(req: NextRequest) {
  const userId = req.cookies.get('ar_user')?.value || '';
  if (!userId) {
    return NextResponse.redirect(new URL('/ar?gmail=auth_required', req.url));
  }
  const actor = await getAuthUserById(userId);
  if (!actor || !actor.active) {
    return NextResponse.redirect(new URL('/ar?gmail=auth_required', req.url));
  }
  if (actor.role === 'viewer') {
    return NextResponse.redirect(new URL('/ar?gmail=forbidden', req.url));
  }

  const returnTo = safeReturnTo(req.nextUrl.searchParams.get('returnTo') || '/ar');
  const statePayload: GmailStatePayload = {
    nonce: crypto.randomBytes(16).toString('hex'),
    userId: actor.userId,
    returnTo,
    issuedAt: new Date().toISOString(),
  };
  const state = encodeState(statePayload);

  let authUrl = '';
  try {
    authUrl = buildGoogleAuthUrl(state, requestOrigin(req));
  } catch {
    return NextResponse.redirect(new URL('/ar?gmail=not_configured', req.url));
  }

  const res = NextResponse.redirect(authUrl);
  res.cookies.set('ar_gmail_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 10,
  });
  return res;
}
