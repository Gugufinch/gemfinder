// lib/gemfinder/session.test.ts
//
// Pins the security contract of session.ts. If any of these tests start
// failing, the HMAC-signed cookie is no longer secure — either an attacker
// could forge a session, or legitimate sessions stopped working. Both are
// release-blocking.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { signSession, verifySession, getSessionUserId } from './session';

// Force a known dev secret across all tests so the cookies round-trip
// deterministically. Without this, NODE_ENV=test would use the same
// dev fallback but the tests should explicitly own that.
const TEST_SECRET = 'test-secret-must-be-at-least-32-characters-long-to-pass-check';

beforeEach(() => {
  process.env.AR_SESSION_SECRET = TEST_SECRET;
});

afterEach(() => {
  delete process.env.AR_SESSION_SECRET;
});

describe('signSession + verifySession round-trip', () => {
  it('signs a userId then verifies returns the same userId', () => {
    const cookie = signSession('user_abc123');
    const verified = verifySession(cookie);
    expect(verified).not.toBeNull();
    expect(verified!.uid).toBe('user_abc123');
  });

  it('signed cookie has the expected <payload>.<sig> shape', () => {
    const cookie = signSession('user_x');
    const parts = cookie.split('.');
    expect(parts).toHaveLength(2);
    expect(parts[0].length).toBeGreaterThan(0);
    expect(parts[1].length).toBeGreaterThan(0);
  });

  it('throws when signing empty userId — refuses to issue invalid session', () => {
    expect(() => signSession('')).toThrow(/userId is required/);
  });

  it('default expiry is 30 days', () => {
    const before = Math.floor(Date.now() / 1000);
    const cookie = signSession('user_a');
    const after = Math.floor(Date.now() / 1000);
    const verified = verifySession(cookie);
    const thirtyDays = 30 * 24 * 60 * 60;
    expect(verified!.exp).toBeGreaterThanOrEqual(before + thirtyDays);
    expect(verified!.exp).toBeLessThanOrEqual(after + thirtyDays);
  });

  it('expiry overridable via opts.expiresInDays', () => {
    const cookie = signSession('user_a', { expiresInDays: 1 });
    const verified = verifySession(cookie);
    const oneDay = 24 * 60 * 60;
    expect(verified!.exp - verified!.iat).toBe(oneDay);
  });
});

describe('forgery resistance — the audit-finding cases', () => {
  it('🐛 BUG FIX: cookie that is just a userId (the old broken format) is rejected', () => {
    // The pre-fix code accepted ar_user=user_abc123 (raw userId) as
    // authentic. If anyone forges that against the new system, it must fail
    // because the cookie has no signature.
    expect(verifySession('user_abc123')).toBeNull();
  });

  it('🐛 BUG FIX: cookie with tampered payload but recomputed signature using a DIFFERENT secret is rejected', () => {
    // Attacker tries to sign with their own secret. Must fail because our
    // server uses AR_SESSION_SECRET which they don't have.
    process.env.AR_SESSION_SECRET = 'attacker-controlled-secret-also-32-chars-long-here-xx';
    const attackerCookie = signSession('user_admin');
    process.env.AR_SESSION_SECRET = TEST_SECRET;
    expect(verifySession(attackerCookie)).toBeNull();
  });

  it('cookie with tampered payload (bytes flipped, signature unchanged) is rejected', () => {
    const original = signSession('user_a');
    const [_payload, sig] = original.split('.');
    // Replace payload with one for a different user but keep the original sig.
    const tampered = Buffer.from(JSON.stringify({
      uid: 'user_admin',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 1000,
    })).toString('base64url');
    expect(verifySession(`${tampered}.${sig}`)).toBeNull();
  });

  it('cookie with malformed structure (no dot, single part, three parts) is rejected', () => {
    expect(verifySession('no-dot-at-all')).toBeNull();
    expect(verifySession('two..dots')).toBeNull();
    expect(verifySession('three.dots.in.this')).toBeNull();
    expect(verifySession('')).toBeNull();
    expect(verifySession(null)).toBeNull();
    expect(verifySession(undefined)).toBeNull();
  });

  it('cookie with valid signature but expired exp is rejected', () => {
    // Manually craft a cookie that has already expired but a valid HMAC,
    // to make sure the exp check actually runs.
    const past = Math.floor(Date.now() / 1000) - 1000;
    const payload = Buffer.from(JSON.stringify({
      uid: 'user_a', iat: past - 10, exp: past,
    })).toString('base64url');
    const crypto = require('node:crypto');
    const sig = crypto.createHmac('sha256', TEST_SECRET).update(payload).digest('base64url');
    expect(verifySession(`${payload}.${sig}`)).toBeNull();
  });

  it('cookie with valid signature but no uid is rejected', () => {
    const future = Math.floor(Date.now() / 1000) + 1000;
    const payload = Buffer.from(JSON.stringify({
      iat: Math.floor(Date.now() / 1000), exp: future,
    })).toString('base64url');
    const crypto = require('node:crypto');
    const sig = crypto.createHmac('sha256', TEST_SECRET).update(payload).digest('base64url');
    expect(verifySession(`${payload}.${sig}`)).toBeNull();
  });
});

describe('getSessionUserId helper — extracts userId from NextRequest cookie', () => {
  function makeReq(cookieValue?: string) {
    return {
      cookies: {
        get: (name: string) =>
          name === 'ar_user' && cookieValue ? { value: cookieValue } : undefined,
      },
    } as Parameters<typeof getSessionUserId>[0];
  }

  it('returns userId when cookie is valid', () => {
    const cookie = signSession('user_xyz');
    expect(getSessionUserId(makeReq(cookie))).toBe('user_xyz');
  });

  it('returns empty string when cookie is missing', () => {
    expect(getSessionUserId(makeReq())).toBe('');
  });

  it('returns empty string when cookie is forged (no signature)', () => {
    expect(getSessionUserId(makeReq('user_admin'))).toBe('');
  });

  it('returns empty string when cookie is expired', () => {
    const past = Math.floor(Date.now() / 1000) - 1000;
    const payload = Buffer.from(JSON.stringify({
      uid: 'user_a', iat: past - 10, exp: past,
    })).toString('base64url');
    const crypto = require('node:crypto');
    const sig = crypto.createHmac('sha256', TEST_SECRET).update(payload).digest('base64url');
    expect(getSessionUserId(makeReq(`${payload}.${sig}`))).toBe('');
  });
});
