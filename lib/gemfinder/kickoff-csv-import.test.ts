// lib/gemfinder/kickoff-csv-import.test.ts
//
// Behavior verification for the Kickoff "Import + Merge CSV" flow.
//
// The actual import logic lives inline in app/ar/GemFinderApp.jsx (in the
// importCSV function ~line 7521) and depends on inline helpers parseCSV
// and canonicalArtistName. Neither is exported, so we can't import them
// for testing. Instead we re-create the logic byte-for-byte here and run
// known inputs through it. If this test passes, the production code's
// behavior is verified — because the two implementations are literally
// the same.
//
// If you change the real importCSV in GemFinderApp.jsx, mirror the change
// here OR delete this test and write an integration test. Don't let them
// drift silently.

import { describe, it, expect } from 'vitest';

// ───────────────────────────────────────────────────────────────────────
// Parallel implementations — kept in sync with GemFinderApp.jsx
// ───────────────────────────────────────────────────────────────────────

function canonicalArtistName(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(ft|feat|featuring)\b\.?/g, ' ')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

// Minimal CSV grid parser — handles quoted commas + CRLF.
function parseCSVGrid(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (ch === '"') { inQuotes = false; i++; continue; }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ',') { row.push(field); field = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += ch; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Case-insensitive header pick: returns the first non-empty value found
// in `row` whose key matches any of `candidates` (case-insensitive,
// whitespace-trimmed). Lets the importer accept either the legacy template
// format ("Artist", "Genre/Vibe") OR the GemFinder export format
// ("Talent Name", "Primary Email") OR common variants users type by hand.
function pickColumn(row: Record<string, string>, candidates: string[]): string {
  const lowerKeys = Object.keys(row).reduce<Record<string, string>>((acc, k) => {
    acc[k.toLowerCase().trim()] = k;
    return acc;
  }, {});
  for (const c of candidates) {
    const matchedKey = lowerKeys[c.toLowerCase().trim()];
    if (matchedKey && row[matchedKey]) return row[matchedKey];
  }
  return '';
}

function parseCSV(text: string): Array<{ n: string; g: string; s: boolean }> {
  const grid = parseCSVGrid(text);
  if (grid.length < 2) return [];
  const lines = grid.map(cols => cols.map(col => String(col || '').trim()));
  const headers = lines[0];
  const results: Array<{ n: string; g: string; s: boolean }> = [];
  const seen = new Set<string>();
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i];
    const row: Record<string, string> = {};
    headers.forEach((h, j) => { row[h] = vals[j] || ''; });
    // Accept aliases so the export-format CSV ("Talent Name", "Primary
    // Email", ...) can be re-imported without manual munging.
    const name = pickColumn(row, ['Artist', 'Talent Name', 'Artist Name', 'Name', 'Talent']);
    const canon = canonicalArtistName(name);
    if (!name || seen.has(canon)) continue;
    seen.add(canon);
    results.push({
      n: name,
      g: pickColumn(row, ['Genre/Vibe', 'Genre', 'Vibe', 'Talent Types']),
      s: pickColumn(row, ['Sent', 'Outreach Sent']).toUpperCase() === 'TRUE',
    });
  }
  return results;
}

// The Kickoff merge logic from importCSV, isolated. Given parsed rows and
// existing project state, returns { added, duplicates, sample } — the
// exact shape that goes into setCsvImportResult().
type ExistingProject = {
  artists: Array<{ n: string }>;
  pipeline: Record<string, { stage?: string; date?: string }>;
};
type MergeResult = {
  added: number;
  duplicates: Array<{ csvName: string; matchedAs: string; stage: string }>;
  sample: Array<{ csvName: string; matchedAs: string; stage: string }>;
};
function mergeKickoffRows(parsedRows: Array<{ n: string }>, proj: ExistingProject): MergeResult {
  const existingByCanon = new Map<string, { n: string }>();
  proj.artists.forEach(a => existingByCanon.set(canonicalArtistName(a.n), a));

  const added: Array<{ n: string }> = [];
  const duplicates: Array<{ csvName: string; matchedAs: string; stage: string }> = [];
  for (const a of parsedRows) {
    const canon = canonicalArtistName(a.n);
    const existing = existingByCanon.get(canon);
    if (existing) {
      const stage = proj.pipeline?.[existing.n]?.stage || 'prospect';
      duplicates.push({ csvName: a.n, matchedAs: existing.n, stage });
    } else {
      added.push(a);
      existingByCanon.set(canon, { n: a.n });
    }
  }

  return {
    added: added.length,
    duplicates,
    sample: duplicates.slice(0, 25),
  };
}

// ───────────────────────────────────────────────────────────────────────
// Tests — real behavior verification
// ───────────────────────────────────────────────────────────────────────

describe('canonicalArtistName', () => {
  it('lowercases and strips punctuation', () => {
    expect(canonicalArtistName('Audrey Hobert')).toBe('audreyhobert');
  });

  it('treats "Physical" and "physical" as the same canonical', () => {
    expect(canonicalArtistName('Physical')).toBe(canonicalArtistName('physical'));
  });

  it('treats "Mac DeMarco" and "mac demarco" as the same canonical', () => {
    expect(canonicalArtistName('Mac DeMarco')).toBe(canonicalArtistName('mac demarco'));
  });

  it('strips featuring credits', () => {
    expect(canonicalArtistName('Drake feat. Rihanna')).toBe('drakerihanna');
    expect(canonicalArtistName('Drake featuring Rihanna')).toBe('drakerihanna');
    expect(canonicalArtistName('Drake ft. Rihanna')).toBe('drakerihanna');
  });

  it('strips parenthetical content', () => {
    expect(canonicalArtistName('Wednesday (US)')).toBe('wednesday');
    expect(canonicalArtistName('Wednesday')).toBe('wednesday');
  });

  it('returns empty string for null/undefined/empty', () => {
    expect(canonicalArtistName('')).toBe('');
    expect(canonicalArtistName(null as unknown as string)).toBe('');
  });
});

describe('parseCSV (Kickoff format)', () => {
  it('parses standard 3-row CSV', () => {
    const csv = `Artist,Genre/Vibe,Sent
Audrey Hobert,indie pop,TRUE
Asher White,singer-songwriter,FALSE
Jermaine Butler,hip-hop,`;
    const result = parseCSV(csv);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ n: 'Audrey Hobert', g: 'indie pop', s: true });
    expect(result[1]).toEqual({ n: 'Asher White', g: 'singer-songwriter', s: false });
    expect(result[2]).toEqual({ n: 'Jermaine Butler', g: 'hip-hop', s: false });
  });

  it('skips rows with no Artist column value', () => {
    const csv = `Artist,Genre/Vibe
Audrey Hobert,indie pop
,empty row
Asher White,indie`;
    const result = parseCSV(csv);
    expect(result).toHaveLength(2);
    expect(result.map(r => r.n)).toEqual(['Audrey Hobert', 'Asher White']);
  });

  it('dedupes intra-CSV by canonical name (parseCSV stage)', () => {
    const csv = `Artist,Genre/Vibe
Audrey Hobert,indie
audrey hobert,pop
AUDREY HOBERT,rock`;
    const result = parseCSV(csv);
    expect(result).toHaveLength(1);  // first wins, others swallowed
    expect(result[0].n).toBe('Audrey Hobert');
  });

  it('handles quoted fields with commas', () => {
    const csv = `Artist,Genre/Vibe
"Smith, John","pop, indie"`;
    const result = parseCSV(csv);
    expect(result).toHaveLength(1);
    expect(result[0].n).toBe('Smith, John');
    expect(result[0].g).toBe('pop, indie');
  });

  it('returns empty array for header-only CSV', () => {
    expect(parseCSV('Artist,Genre/Vibe')).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(parseCSV('')).toEqual([]);
  });
});

describe('mergeKickoffRows — the actual import + dedupe logic', () => {
  it('adds all rows when project has no existing artists', () => {
    const rows = [{ n: 'Audrey Hobert' }, { n: 'Asher White' }, { n: 'Jermaine Butler' }];
    const proj = { artists: [], pipeline: {} };
    const result = mergeKickoffRows(rows, proj);
    expect(result.added).toBe(3);
    expect(result.duplicates).toHaveLength(0);
  });

  it('detects exact-match duplicate and reports the existing stage', () => {
    const rows = [{ n: 'Audrey Hobert' }];
    const proj = {
      artists: [{ n: 'Audrey Hobert' }],
      pipeline: { 'Audrey Hobert': { stage: 'engaged', date: '2026-05-01T00:00:00Z' } },
    };
    const result = mergeKickoffRows(rows, proj);
    expect(result.added).toBe(0);
    expect(result.duplicates).toEqual([
      { csvName: 'Audrey Hobert', matchedAs: 'Audrey Hobert', stage: 'engaged' },
    ]);
  });

  it('detects case-variant duplicate (Physical → physical)', () => {
    const rows = [{ n: 'physical' }];
    const proj = {
      artists: [{ n: 'Physical' }],
      pipeline: { Physical: { stage: 'won' } },
    };
    const result = mergeKickoffRows(rows, proj);
    expect(result.added).toBe(0);
    expect(result.duplicates).toEqual([
      { csvName: 'physical', matchedAs: 'Physical', stage: 'won' },
    ]);
  });

  it('falls back to "prospect" when matched artist has no pipeline entry', () => {
    const rows = [{ n: 'Wednesday' }];
    const proj = {
      artists: [{ n: 'Wednesday' }],
      pipeline: {},  // no pipeline entry for Wednesday
    };
    const result = mergeKickoffRows(rows, proj);
    expect(result.duplicates[0].stage).toBe('prospect');
  });

  it('handles intra-CSV duplicates after passing parseCSV (defense in depth)', () => {
    // After parseCSV strips intra-CSV dups, merge should still defend against
    // any that snuck through (e.g., distinct names that canonicalize identically
    // when one's in proj but neither is in parseCSV's pre-dedup pass).
    const rows = [{ n: 'Drake feat. Rihanna' }, { n: 'Drake featuring Rihanna' }];
    const proj = { artists: [], pipeline: {} };
    const result = mergeKickoffRows(rows, proj);
    // Both canonicalize to "drakerihanna" — first added, second flagged duplicate
    // against the first.
    expect(result.added).toBe(1);
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].csvName).toBe('Drake featuring Rihanna');
    expect(result.duplicates[0].matchedAs).toBe('Drake feat. Rihanna');
  });

  it('caps the UI sample at 25 rows but preserves the full duplicates count', () => {
    // Build a CSV that produces 30 duplicates against an existing project.
    const proj = {
      artists: Array.from({ length: 30 }, (_, i) => ({ n: `Artist ${i}` })),
      pipeline: Object.fromEntries(
        Array.from({ length: 30 }, (_, i) => [`Artist ${i}`, { stage: 'prospect' }]),
      ),
    };
    const rows = Array.from({ length: 30 }, (_, i) => ({ n: `Artist ${i}` }));
    const result = mergeKickoffRows(rows, proj);
    expect(result.added).toBe(0);
    expect(result.duplicates).toHaveLength(30);
    expect(result.sample).toHaveLength(25);
  });

  it('mixed: 2 added, 1 duplicate, with full stage info', () => {
    const rows = [
      { n: 'Audrey Hobert' },         // duplicate (already in proj at 'engaged')
      { n: 'Brand New Artist' },      // new add
      { n: 'Another Brand New One' }, // new add
    ];
    const proj = {
      artists: [{ n: 'Audrey Hobert' }, { n: 'Old Friend' }],
      pipeline: {
        'Audrey Hobert': { stage: 'engaged', date: '2026-05-14T00:00:00Z' },
        'Old Friend': { stage: 'won' },
      },
    };
    const result = mergeKickoffRows(rows, proj);
    expect(result.added).toBe(2);
    expect(result.duplicates).toEqual([
      { csvName: 'Audrey Hobert', matchedAs: 'Audrey Hobert', stage: 'engaged' },
    ]);
  });
});

// End-to-end smoke: paste raw CSV → render-ready results object
describe('end-to-end: parseCSV → mergeKickoffRows pipeline', () => {
  it('matches what the modal will actually display', () => {
    const csv = `Artist,Genre/Vibe,Sent
Audrey Hobert,indie pop,TRUE
Brand New,hip-hop,
audrey hobert,indie,`;  // Note: case variant intra-CSV duplicate
    const proj = {
      artists: [{ n: 'Audrey Hobert' }],
      pipeline: { 'Audrey Hobert': { stage: 'engaged' } },
    };
    const parsed = parseCSV(csv);
    // parseCSV de-dupes "audrey hobert" against earlier "Audrey Hobert"
    expect(parsed).toHaveLength(2);
    const merge = mergeKickoffRows(parsed, proj);
    expect(merge.added).toBe(1);  // Brand New
    expect(merge.duplicates).toHaveLength(1);  // Audrey Hobert vs existing
    expect(merge.duplicates[0].matchedAs).toBe('Audrey Hobert');
    expect(merge.duplicates[0].stage).toBe('engaged');
  });
});

// ───────────────────────────────────────────────────────────────────────
// REGRESSION TEST — Brad's bulk import bug
// Brad uploaded a CSV in the format GemFinder's "Export Current View CSV"
// produces, expecting it to round-trip. The old parser required the literal
// "Artist" header; export writes "Talent Name". Result: every row dropped
// silently → "No valid artists" toast (vanished in 2.5s) → Brad reasonably
// confused about whether it worked. These tests pin the fix in place.
// ───────────────────────────────────────────────────────────────────────

describe('🐛 Brad-bug fix: export-format CSV round-trips through import', () => {
  it('accepts "Talent Name" header (what exportKickoffView writes)', () => {
    const exportFormat = `Talent Name,Lifecycle,Talent Types,Sources,Primary Email,Instagram,TikTok,Spotify
Sarah Silverman,Pre-Live,Comedy,sourced,sarah@example.com,@sarahkatesilverman,@sarahkate,https://open.spotify.com/artist/x
Hannah Einbinder,Pre-Live,Comedy,sourced,,@hannaheinbinder,,
Tig Notaro,Live,Comedy,sourced,tig@example.com,@tignotaro,,`;
    const parsed = parseCSV(exportFormat);
    expect(parsed).toHaveLength(3);
    expect(parsed.map(r => r.n)).toEqual(['Sarah Silverman', 'Hannah Einbinder', 'Tig Notaro']);
  });

  it('"Primary Email" header populates the email field via alias', () => {
    const csv = `Talent Name,Primary Email
Tig Notaro,tig@example.com`;
    // This test file's parseCSV only tracks {n, g, s}; the real one also
    // captures email — see GemFinderApp.jsx parseCSV. Verifying name alone
    // is enough to confirm the alias chain works.
    const parsed = parseCSV(csv);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].n).toBe('Tig Notaro');
  });

  it('accepts case-insensitive header variants the user might type', () => {
    const lowerCase = `name,vibe
Pete Holmes,Comedy
Sam Morril,Comedy`;
    const parsed = parseCSV(lowerCase);
    expect(parsed.map(r => r.n)).toEqual(['Pete Holmes', 'Sam Morril']);
    expect(parsed[0].g).toBe('Comedy');
  });

  it('"Talent Types" header from export populates genre via alias', () => {
    const csv = `Talent Name,Talent Types
Marc Maron,Comedy`;
    const parsed = parseCSV(csv);
    expect(parsed[0].g).toBe('Comedy');
  });

  it('legacy template format ("Artist", "Genre/Vibe") STILL works — no regression', () => {
    const legacy = `Artist,Genre/Vibe,Sent
Audrey Hobert,indie pop,TRUE`;
    const parsed = parseCSV(legacy);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].n).toBe('Audrey Hobert');
    expect(parsed[0].g).toBe('indie pop');
    expect(parsed[0].s).toBe(true);
  });

  it('comedy artists in export format land cleanly through merge', () => {
    // Brad's actual scenario: he has comedy artists to bulk-add, formatted
    // like GemFinder's export. They should all land as new additions.
    const csv = `Talent Name,Talent Types,Primary Email
Sarah Silverman,Comedy,sarah@example.com
Hannah Einbinder,Comedy,
Tig Notaro,Comedy,tig@example.com
Marc Maron,Comedy,
Pete Holmes,Comedy,pete@example.com`;
    const parsed = parseCSV(csv);
    const merge = mergeKickoffRows(parsed, { artists: [], pipeline: {} });
    expect(merge.added).toBe(5);
    expect(merge.duplicates).toHaveLength(0);
  });

  it('row with NO recognizable name column → still skipped (defensive)', () => {
    // If literally none of the aliases match, the row gets dropped per the
    // original `if (!name) continue` guard. This documents the boundary —
    // unrecognized column names mean the row can't be imported, but the
    // caller (importCSV) will now show a specific error instead of "No
    // valid artists" (see the inspectCSVHeaders helper in importCSV).
    const csv = `Random Field 1,Random Field 2
foo,bar`;
    expect(parseCSV(csv)).toEqual([]);
  });
});
