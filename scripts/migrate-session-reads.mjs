#!/usr/bin/env node
// One-shot migration: replace `req.cookies.get('ar_user')?.value || ''`
// with `getSessionUserId(req)` and add the import where missing.
// Audit #2: removes the SHA1-of-email forgery vulnerability by routing every
// admin/user lookup through HMAC-verified sessions.
//
// Idempotent: re-running on already-migrated files is a no-op because the
// old pattern no longer matches and the import-add checks for prior presence.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const FILES = [
  'app/api/ar/admin/scout-feedback-summary/route.ts',
  'app/api/ar/admin/snapshots/[snapshotId]/restore/route.ts',
  'app/api/ar/admin/snapshots/[snapshotId]/route.ts',
  'app/api/ar/admin/snapshots/route.ts',
  'app/api/ar/admin/team-users-audit/route.ts',
  'app/api/ar/admin/users/[userId]/route.ts',
  'app/api/ar/admin/users/route.ts',
  'app/api/ar/gmail/connect/route.ts',
  'app/api/ar/gmail/disconnect/route.ts',
  'app/api/ar/gmail/project-threads/route.ts',
  'app/api/ar/gmail/relabel-artist/route.ts',
  'app/api/ar/gmail/send/route.ts',
  'app/api/ar/gmail/status/route.ts',
  'app/api/ar/gmail/sync/route.ts',
  'app/api/ar/gmail/test-list/route.ts',
  'app/api/ar/gmail/test-profile/route.ts',
  'app/api/ar/gmail/thread/route.ts',
  'app/api/ar/gmail/threads/route.ts',
  'app/api/ar/projects/route.ts',
  'app/api/ar/scout/candidates/[id]/reenrich/route.ts',
  'app/api/ar/scout/candidates/[id]/route.ts',
  'app/api/ar/scout/candidates/bulk/route.ts',
  'app/api/ar/scout/candidates/route.ts',
  'app/api/ar/scout/events/route.ts',
  'app/api/ar/scout/hunter/run/[id]/route.ts',
  'app/api/ar/scout/hunter/run/route.ts',
  'app/api/ar/scout/hunter/weights/route.ts',
  'app/api/ar/scout/rejections/route.ts',
  'app/api/ar/scout/stats/route.ts',
];

const OLD_RE = /req\.cookies\.get\('ar_user'\)\?\.value\s*\|\|\s*''/g;
const NEW = `getSessionUserId(req)`;
const IMPORT_LINE = `import { getSessionUserId } from '@/lib/gemfinder/session';`;

let touched = 0;
let skipped = 0;

for (const rel of FILES) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    console.warn(`[skip] missing: ${rel}`);
    skipped++;
    continue;
  }
  let src = fs.readFileSync(abs, 'utf8');
  const matches = src.match(OLD_RE)?.length ?? 0;
  if (matches === 0) {
    console.warn(`[skip] no pattern match: ${rel}`);
    skipped++;
    continue;
  }
  src = src.replace(OLD_RE, NEW);

  // Insert the import after the LAST existing import line, but only if
  // the new import isn't already present.
  if (!src.includes(IMPORT_LINE)) {
    const lines = src.split('\n');
    let lastImportIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^import\s/.test(lines[i])) lastImportIdx = i;
    }
    if (lastImportIdx === -1) {
      console.error(`[err] ${rel}: no existing imports to anchor on, skipping`);
      continue;
    }
    lines.splice(lastImportIdx + 1, 0, IMPORT_LINE);
    src = lines.join('\n');
  }

  fs.writeFileSync(abs, src, 'utf8');
  console.log(`[ok]  ${rel} — ${matches} replacement(s)`);
  touched++;
}

console.log(`\nMigration complete. Touched: ${touched}, skipped: ${skipped}.`);
