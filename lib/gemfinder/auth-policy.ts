// lib/gemfinder/auth-policy.ts
//
// Audit #3: the four policy decisions that gate auth. Extracted out of
// auth-store.ts so the security-critical predicates live in one auditable
// file, independent of the pg/local store plumbing.
//
// All four FAIL CLOSED: when an env var is unset, the safe outcome wins.
// The old code had the opposite convention — unset env → permissive — which
// turned a fresh prod deploy with no config into a takeover surface (anyone
// could register, first registrant became admin).
//
// The corresponding tests in auth-policy.test.ts pin these contracts. If
// any of them start failing, audit #3 has regressed.

import type { AuthRole } from './types';

function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

function parseEmailList(raw: string | undefined): string[] {
  return String(raw || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Self-signup default. FAIL CLOSED: env unset → false.
 *
 * The pre-audit code defaulted to `true`, so a deploy with `AR_SELF_SIGNUP`
 * never configured silently shipped a world-readable signup page. Combined
 * with the empty-allowlist-allows-all behavior (also fixed in this audit),
 * that meant anyone who reached the URL could create an account.
 *
 * After this fix, signup is OFF until explicitly enabled. Enable in
 * production by setting `AR_SELF_SIGNUP=true` AND populating
 * `AR_ALLOWED_EMAILS` with the team's emails.
 */
export function isSelfSignupEnabled(): boolean {
  const raw = process.env.AR_SELF_SIGNUP;
  if (raw === undefined || raw === '') return false;
  const norm = raw.trim().toLowerCase();
  if (!norm) return false;
  return !['0', 'false', 'no', 'off'].includes(norm);
}

/**
 * Strict allowlist check for the SELF-SIGNUP path only. FAIL CLOSED: empty
 * allowlist → false (no one allowed).
 *
 * Distinct from `isAllowedEmail()` (lenient) because self-signup is the
 * only path where the cost of an empty-list-allows-all default is total
 * takeover. Admin-invite, login, and password-reset all key off an existing
 * user record, so they're not the takeover vector.
 *
 * Compares against `AR_ALLOWED_EMAILS` (comma-separated, case-insensitive).
 */
export function isAllowedForSelfSignup(email: string): boolean {
  const allowed = parseEmailList(process.env.AR_ALLOWED_EMAILS);
  if (!allowed.length) return false;
  return allowed.includes(normalizeEmail(email));
}

/**
 * Lenient allowlist check used by LOGIN and PASSWORD RESET. Empty list
 * → true (allow). Kept lenient so a deploy-time misconfiguration (env var
 * accidentally cleared) doesn't lock out every existing user with a valid
 * password.
 *
 * Self-signup uses `isAllowedForSelfSignup()` instead — that's the only
 * path where lenient default is exploitable.
 */
export function isAllowedEmail(email: string): boolean {
  const allowed = parseEmailList(process.env.AR_ALLOWED_EMAILS);
  if (!allowed.length) return true;
  return allowed.includes(normalizeEmail(email));
}

/**
 * Decide the role a self-signup user receives. FAIL CLOSED: only
 * `AR_DEFAULT_ADMIN_EMAILS` matches grant admin.
 *
 * The pre-audit code had a second admin-granting path: if the user table
 * was empty, the first registrant became admin. That's the "first user
 * wins" footgun — fresh deploy + race-to-signup = attacker becomes admin.
 *
 * After this fix the ONLY way to bootstrap an admin is to set
 * `AR_DEFAULT_ADMIN_EMAILS=you@example.com` in the env before signup. No
 * magic auto-promotion on empty tables.
 *
 * Existing admin-creates-user flows are unaffected — those go through
 * `registerAuthUser({ createdByUserId, role })` and bypass this helper.
 */
export function decideSignupRole(email: string): AuthRole {
  const adminEmails = parseEmailList(process.env.AR_DEFAULT_ADMIN_EMAILS);
  return adminEmails.includes(normalizeEmail(email)) ? 'admin' : 'editor';
}

/**
 * Used by `reconcileDbDefaultAdmin` / `reconcileLocalDefaultAdmin` to
 * promote an existing user back to admin if their email is in the
 * default-admin list. Same semantics as `decideSignupRole` minus the
 * fallback — kept as a separate name so call sites read intent.
 */
export function isDefaultAdminEmail(email: string): boolean {
  return parseEmailList(process.env.AR_DEFAULT_ADMIN_EMAILS).includes(normalizeEmail(email));
}
