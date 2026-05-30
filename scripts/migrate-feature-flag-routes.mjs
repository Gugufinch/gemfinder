#!/usr/bin/env node
// One-shot migration: replace each route's local `requireScoutV3Flag()`
// with the shared, cached `isScoutV3Enabled` from lib/gemfinder/feature-flags.
//
// Audit #4: kills the 10-routes-×-workspace-read hotspot.
//
// Per file:
//   1. Delete the local `async function requireScoutV3Flag(...) { ... }` block
//   2. Rename every call: requireScoutV3Flag(x) → isScoutV3Enabled(x)
//   3. Add an import for isScoutV3Enabled (idempotent — skip if present)
//   4. Remove `listWorkspaceProjects` import if no longer referenced
//
// Idempotent: re-running on already-migrated files no-ops.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const FILES = [
  'app/api/ar/scout/candidates/route.ts',
  'app/api/ar/scout/candidates/bulk/route.ts',
  'app/api/ar/scout/candidates/[id]/route.ts',
  'app/api/ar/scout/candidates/[id]/reenrich/route.ts',
  'app/api/ar/scout/events/route.ts',
  'app/api/ar/scout/hunter/run/route.ts',
  'app/api/ar/scout/hunter/run/[id]/route.ts',
  'app/api/ar/scout/hunter/weights/route.ts',
  'app/api/ar/scout/rejections/route.ts',
  'app/api/ar/scout/stats/route.ts',
];

const IMPORT_LINE = `import { isScoutV3Enabled } from '@/lib/gemfinder/feature-flags';`;

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
  if (!/async function requireScoutV3Flag/.test(src)) {
    console.warn(`[skip] no local requireScoutV3Flag: ${rel}`);
    skipped++;
    continue;
  }

  // (1) Strip the local function definition. Match from
  // `async function requireScoutV3Flag` at the start of a line through the
  // closing `}` at the start of a line. The `[\s\S]` is "any char including
  // newlines"; non-greedy so we stop at the FIRST top-level `}`.
  src = src.replace(/async function requireScoutV3Flag[\s\S]*?\n\}\n+/, '');

  // (2) Call-site rename. Word-boundary so we don't touch comments mentioning
  // the old name (none expected, but defensive).
  src = src.replace(/\brequireScoutV3Flag\b/g, 'isScoutV3Enabled');

  // (3) Add the import after the last existing import (using the
  // session-migration heuristic — anchor on a line that LOOKS like a
  // complete import, not the opening brace of a multi-line import).
  if (!src.includes(IMPORT_LINE)) {
    const lines = src.split('\n');
    let lastImportEndIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // A complete import line ends with `;` and either starts with `import`
      // or is the closing `} from '...';` of a multi-line import.
      if (/^import\s.*['"];?$/.test(line) || /^}\s+from\s+['"].*['"];?$/.test(line)) {
        lastImportEndIdx = i;
      }
    }
    if (lastImportEndIdx === -1) {
      console.error(`[err] ${rel}: no complete imports to anchor on, skipping`);
      continue;
    }
    lines.splice(lastImportEndIdx + 1, 0, IMPORT_LINE);
    src = lines.join('\n');
  }

  // (4) Drop the listWorkspaceProjects import if nothing else uses it.
  if (!/\blistWorkspaceProjects\b/.test(src.split('\n').filter(l => !l.startsWith('import')).join('\n'))) {
    src = src.replace(/^import\s+\{\s*listWorkspaceProjects\s*\}\s+from\s+['"][^'"]+['"];?\n/m, '');
    // Also handle case where listWorkspaceProjects is part of a multi-import.
    src = src.replace(/(\{[^}]*?)\blistWorkspaceProjects\s*,?\s*/g, '$1');
    src = src.replace(/,\s*}/g, ' }');  // tidy trailing comma left behind
  }

  fs.writeFileSync(abs, src, 'utf8');
  console.log(`[ok]  ${rel}`);
  touched++;
}

console.log(`\nMigration complete. Touched: ${touched}, skipped: ${skipped}.`);
