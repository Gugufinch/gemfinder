#!/usr/bin/env node
// scripts/admin-reset-password.mjs
//
// EMERGENCY admin password reset — direct DB write, no email required.
//
// WHY THIS EXISTS: production password reset is currently unusable because
// (1) lib/gemfinder/email.ts silently no-ops when SMTP_* env vars are unset
// (they are unset on Render), and (2) app/api/ar/auth/request-reset only
// returns the reset link when NODE_ENV !== 'production'. So a locked-out
// operator can neither receive nor retrieve a reset token. This script sets
// the password hash directly, using the EXACT scrypt format that
// lib/gemfinder/auth-store.ts:hashPassword produces and verifyPassword reads:
//     scrypt$<salt-hex>$<scryptSync(pw, salt, 64)-hex>
//
// USAGE (run from the repo root with the Render DATABASE_URL):
//   DATABASE_URL='postgres://...render external url...' \
//   AR_NEW_PASSWORD='your-new-password-min-8-chars' \
//   node scripts/admin-reset-password.mjs gregcmcd@gmail.com
//
// It also sets active=true so an inactive account can't block the login.
// It does NOT change role — reconcileDbDefaultAdmin handles admin promotion
// on next login if the email is in AR_DEFAULT_ADMIN_EMAILS.

import crypto from 'node:crypto';
import pg from 'pg';

const email = (process.argv[2] || '').trim().toLowerCase();
const newPassword = process.env.AR_NEW_PASSWORD || process.argv[3] || '';
const dbUrl = process.env.DATABASE_URL;

function die(msg) {
  console.error(`\n[admin-reset] ERROR: ${msg}\n`);
  process.exit(1);
}

if (!dbUrl) die('DATABASE_URL env var is required (copy the External Database URL from Render).');
if (!email || !email.includes('@')) die('Pass the account email as the first argument.');
if (newPassword.length < 8) die('New password must be at least 8 characters (set AR_NEW_PASSWORD).');

// EXACT match for lib/gemfinder/auth-store.ts hashPassword().
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const digest = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${digest}`;
}

const client = new pg.Client({
  connectionString: dbUrl,
  // Render external connections need SSL; their cert chain isn't in the
  // default store, so disable strict verification (same posture as the app).
  ssl: { rejectUnauthorized: false },
});

const run = async () => {
  await client.connect();
  const hash = hashPassword(newPassword);
  const res = await client.query(
    `update gemfinder_auth_users
        set password_hash = $1,
            active = true,
            updated_at = now()
      where email = $2
      returning user_id, email, role, active`,
    [hash, email],
  );
  if (res.rowCount === 0) {
    // Help diagnose: list the emails that DO exist (no hashes printed).
    const all = await client.query('select email, role, active from gemfinder_auth_users order by email');
    console.error(`\n[admin-reset] No user found with email "${email}".`);
    console.error('[admin-reset] Existing accounts:');
    for (const r of all.rows) console.error(`   - ${r.email}  (role=${r.role}, active=${r.active})`);
    process.exit(2);
  }
  const u = res.rows[0];
  console.log('\n[admin-reset] ✅ Password updated.');
  console.log(`   userId : ${u.user_id}`);
  console.log(`   email  : ${u.email}`);
  console.log(`   role   : ${u.role}`);
  console.log(`   active : ${u.active}`);
  console.log('\n   Now sign in at https://gemfinder-1qm5.onrender.com/ar with the new password.\n');
};

run()
  .catch((err) => die(err instanceof Error ? err.message : String(err)))
  .finally(() => client.end().catch(() => {}));
