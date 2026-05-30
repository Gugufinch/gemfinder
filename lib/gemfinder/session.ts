// lib/gemfinder/session.ts
//
// HMAC-signed session cookies — fixes the SHA1-of-email forgery vulnerability
// caught by the security audit.
//
// BEFORE (broken): The `ar_user` cookie was literally the userId, which was
// derived from `sha1(email).slice(0,12)`. No secret, no signature, no expiry.
// Anyone who knew an admin's email could compute `user_<sha1(email)[0:12]>`
// in one line of Node, paste it into document.cookie, and become that admin.
// Every admin-gated endpoint (snapshots, team-users-audit, scout-feedback-
// summary, etc.) was effectively unguarded.
//
// AFTER: Cookie value is `<base64url(payload)>.<base64url(hmac)>` where:
//   payload = { uid, iat, exp }  (JSON)
//   hmac    = HMAC-SHA256(payload, AR_SESSION_SECRET)
//
// To forge a session an attacker now needs AR_SESSION_SECRET — which lives
// only in the server's env vars and is never sent over the wire.
//
// Cookie lifetime: 30 days, sliding window — every successful verify could
// re-sign with a fresh `exp` if we wanted, but for now we keep the cookie
// static until expiry to avoid per-request re-issuance overhead.

import crypto from 'node:crypto';
import type { NextRequest } from 'next/server';

const DEFAULT_EXPIRES_DAYS = 30;

/**
 * Returns the secret used to sign + verify session cookies. Reads from
 * `AR_SESSION_SECRET`. In production this MUST be set or the function throws
 * loud — that's intentional, a missing secret means anyone can forge admin
 * (the audit finding we're fixing).
 *
 * In non-production environments the function falls back to a hardcoded
 * dev value so local development + unit tests work out of the box. This
 * fallback is well-known and explicitly insecure — don't ship a build that
 * uses it.
 */
export function getSessionSecret(): string {
  const s = process.env.AR_SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (s && s.length < 32) {
    throw new Error(
      'AR_SESSION_SECRET is too short (need at least 32 chars). ' +
      'Generate one with: openssl rand -base64 48',
    );
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'AR_SESSION_SECRET must be set in production. ' +
      'Generate one with: openssl rand -base64 48',
    );
  }
  // Dev / test fallback. Same value across processes so tests round-trip.
  return 'gemfinder-dev-secret-do-not-use-in-prod-32+chars-padding-here';
}

type SessionPayload = {
  uid: string;  // userId
  iat: number;  // issued-at (unix seconds)
  exp: number;  // expiry (unix seconds)
};

/**
 * Sign a userId into a session cookie value. Caller is responsible for
 * setting the cookie via `response.cookies.set('ar_user', value, opts)` —
 * this function only produces the value.
 */
export function signSession(userId: string, opts?: { expiresInDays?: number }): string {
  if (!userId) throw new Error('signSession: userId is required');
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    uid: userId,
    iat: now,
    exp: now + (opts?.expiresInDays ?? DEFAULT_EXPIRES_DAYS) * 24 * 60 * 60,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${sig}`;
}

/**
 * Verify a session cookie value. Returns the parsed payload (with valid
 * userId + future expiry) if the signature checks out, or `null` for ANY
 * failure — tampered, expired, malformed, wrong secret, empty.
 *
 * Uses `crypto.timingSafeEqual` for the signature comparison to prevent
 * timing-based forgery (slow attacker observing how long each rejection
 * takes to learn the right signature byte-by-byte).
 */
export function verifySession(cookieValue: string | null | undefined): SessionPayload | null {
  if (!cookieValue || typeof cookieValue !== 'string') return null;
  const dot = cookieValue.indexOf('.');
  if (dot <= 0 || dot === cookieValue.length - 1) return null;
  const payloadB64 = cookieValue.slice(0, dot);
  const sigB64 = cookieValue.slice(dot + 1);

  const expected = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payloadB64)
    .digest('base64url');

  // Constant-time compare. Different-length buffers are not equal AND
  // crypto.timingSafeEqual throws on length mismatch, so we have to
  // reject that case ourselves first.
  if (sigB64.length !== expected.length) return null;
  let sigBuf: Buffer, expBuf: Buffer;
  try {
    sigBuf = Buffer.from(sigB64, 'base64url');
    expBuf = Buffer.from(expected, 'base64url');
  } catch {
    return null;
  }
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  // Signature is valid — now check payload semantics. Once we're past the
  // HMAC check we know the payload wasn't tampered with, so JSON parse
  // failure here means our own bug (we wrote bad JSON), not an attack.
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed as Partial<SessionPayload>;
  if (typeof p.uid !== 'string' || !p.uid) return null;
  if (typeof p.exp !== 'number') return null;
  if (typeof p.iat !== 'number') return null;
  if (p.exp < Math.floor(Date.now() / 1000)) return null;  // expired

  return p as SessionPayload;
}

/**
 * Read the `ar_user` cookie from a NextRequest, verify the HMAC, and
 * return the userId — or empty string if the cookie is missing, tampered,
 * expired, or otherwise invalid. Mirrors the shape the existing route
 * handlers were using (`const userId = req.cookies.get('ar_user')?.value
 * || ''`) so the migration is one-line-per-route.
 *
 * Callers should immediately follow up with `getAuthUserById(userId)` and
 * treat empty/null as "Not authenticated."
 */
export function getSessionUserId(req: NextRequest): string {
  const cookie = req.cookies.get('ar_user')?.value;
  const session = verifySession(cookie);
  return session?.uid ?? '';
}
