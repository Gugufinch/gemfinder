// lib/gemfinder/auth-policy.test.ts
//
// Pins Audit #3's contract: the four policy decisions that gate signup must
// fail CLOSED. If any of these regress to fail-open behavior, a fresh prod
// deploy with unset env vars becomes a takeover surface — first registrant
// becomes admin, no allowlist enforcement.
//
// We test these as pure functions extracted from auth-store so the policy
// is auditable in isolation, independent of the pg/local store plumbing.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isSelfSignupEnabled,
  isAllowedForSelfSignup,
  isAllowedEmail,
  decideSignupRole,
} from './auth-policy';

beforeEach(() => {
  delete process.env.AR_SELF_SIGNUP;
  delete process.env.AR_ALLOWED_EMAILS;
  delete process.env.AR_DEFAULT_ADMIN_EMAILS;
});

afterEach(() => {
  delete process.env.AR_SELF_SIGNUP;
  delete process.env.AR_ALLOWED_EMAILS;
  delete process.env.AR_DEFAULT_ADMIN_EMAILS;
});

describe('isSelfSignupEnabled — fail closed (Audit #3a)', () => {
  it('🐛 BUG FIX: env var unset → false (was true, the audit finding)', () => {
    expect(isSelfSignupEnabled()).toBe(false);
  });

  it('env var empty string → false', () => {
    process.env.AR_SELF_SIGNUP = '';
    expect(isSelfSignupEnabled()).toBe(false);
  });

  it('explicit "true" → true', () => {
    process.env.AR_SELF_SIGNUP = 'true';
    expect(isSelfSignupEnabled()).toBe(true);
  });

  it('explicit "1" → true', () => {
    process.env.AR_SELF_SIGNUP = '1';
    expect(isSelfSignupEnabled()).toBe(true);
  });

  it('explicit "false" → false', () => {
    process.env.AR_SELF_SIGNUP = 'false';
    expect(isSelfSignupEnabled()).toBe(false);
  });

  it('explicit "off" → false', () => {
    process.env.AR_SELF_SIGNUP = 'off';
    expect(isSelfSignupEnabled()).toBe(false);
  });

  it('whitespace + casing is tolerated for explicit yes', () => {
    process.env.AR_SELF_SIGNUP = '  TRUE  ';
    expect(isSelfSignupEnabled()).toBe(true);
  });
});

describe('isAllowedForSelfSignup — fail closed (Audit #3b)', () => {
  it('🐛 BUG FIX: empty allowlist + self-signup → false (was true, the audit finding)', () => {
    expect(isAllowedForSelfSignup('anyone@evil.com')).toBe(false);
  });

  it('empty string env → false', () => {
    process.env.AR_ALLOWED_EMAILS = '';
    expect(isAllowedForSelfSignup('anyone@evil.com')).toBe(false);
  });

  it('whitespace-only entries are filtered → effectively empty → false', () => {
    process.env.AR_ALLOWED_EMAILS = '   ,  ,   ';
    expect(isAllowedForSelfSignup('a@b.com')).toBe(false);
  });

  it('allowlist set + email matches → true', () => {
    process.env.AR_ALLOWED_EMAILS = 'a@b.com,c@d.com';
    expect(isAllowedForSelfSignup('a@b.com')).toBe(true);
  });

  it('allowlist set + email does NOT match → false', () => {
    process.env.AR_ALLOWED_EMAILS = 'a@b.com,c@d.com';
    expect(isAllowedForSelfSignup('attacker@evil.com')).toBe(false);
  });

  it('allowlist comparison is case-insensitive on the input email', () => {
    process.env.AR_ALLOWED_EMAILS = 'a@b.com';
    expect(isAllowedForSelfSignup('A@B.COM')).toBe(true);
  });
});

describe('isAllowedEmail — lenient (login + reset paths, NOT signup)', () => {
  // Login/reset purposely keep the empty-list-allows-all semantic because
  // existing users were already gated on creation. Yanking this would lock
  // out everyone whose env was misconfigured at signup time.
  it('empty allowlist → true (lenient for login)', () => {
    expect(isAllowedEmail('anyone@b.com')).toBe(true);
  });

  it('allowlist set + email matches → true', () => {
    process.env.AR_ALLOWED_EMAILS = 'a@b.com';
    expect(isAllowedEmail('a@b.com')).toBe(true);
  });

  it('allowlist set + email does NOT match → false', () => {
    process.env.AR_ALLOWED_EMAILS = 'a@b.com';
    expect(isAllowedEmail('outsider@x.com')).toBe(false);
  });
});

describe('decideSignupRole — explicit-only admin promotion (Audit #3c)', () => {
  it('🐛 BUG FIX: fresh DB + non-default-admin email → "editor" (was "admin" via the totalUsers===0 trap)', () => {
    // The bug we are fixing: the old code returned "admin" when totalUsers
    // was 0. An attacker who reached a fresh deploy with an unconfigured
    // AR_DEFAULT_ADMIN_EMAILS could register first and inherit admin.
    expect(decideSignupRole('attacker@evil.com')).toBe('editor');
  });

  it('🐛 BUG FIX: AR_DEFAULT_ADMIN_EMAILS unset → ALL signups get "editor"', () => {
    // Even when the user table is fresh. The only path to admin is an
    // explicit env-var match.
    expect(decideSignupRole('whoever@example.com')).toBe('editor');
  });

  it('AR_DEFAULT_ADMIN_EMAILS set + email matches → "admin"', () => {
    process.env.AR_DEFAULT_ADMIN_EMAILS = 'greg@songfinch.com';
    expect(decideSignupRole('greg@songfinch.com')).toBe('admin');
  });

  it('AR_DEFAULT_ADMIN_EMAILS set + email does NOT match → "editor"', () => {
    process.env.AR_DEFAULT_ADMIN_EMAILS = 'greg@songfinch.com';
    expect(decideSignupRole('intern@songfinch.com')).toBe('editor');
  });

  it('default-admin comparison is case-insensitive on the input email', () => {
    process.env.AR_DEFAULT_ADMIN_EMAILS = 'greg@songfinch.com';
    expect(decideSignupRole('GREG@SONGFINCH.COM')).toBe('admin');
  });

  it('multiple default-admin emails — any match grants admin', () => {
    process.env.AR_DEFAULT_ADMIN_EMAILS = 'a@x.com, b@x.com,c@x.com';
    expect(decideSignupRole('b@x.com')).toBe('admin');
  });
});
