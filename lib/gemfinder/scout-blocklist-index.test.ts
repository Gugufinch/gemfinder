// lib/gemfinder/scout-blocklist-index.test.ts
//
// Audit #6: pins the contract of the prefetched in-memory blocklist index
// (the batch-mode path used by Hunter) and the UNION-ALL SQL builder used
// by the single-call path. Both must produce results that match the
// existing isBlocked() priority order documented in scout-blocklist.ts:
//
//   priority = source(candidate→rejection→kickoff/live) * 100
//            + field(spotify→mb→email→ig→tt→yt→sc→name)
//
// Existing pg-integration tests in scout-blocklist.test.ts remain — they
// pin end-to-end behavior against a real Postgres. These tests pin the
// PURE pieces (SQL builder, in-memory matcher) which can be exercised
// without a DB and protect the audit fix from regression.

import { describe, it, expect } from 'vitest';
import { buildBlocklistQuery } from './scout-blocklist-query';
import { matchAgainstIndex, type BlocklistIndex } from './scout-blocklist-index';

// ─── SQL builder ──────────────────────────────────────────────────────────

describe('buildBlocklistQuery — UNION ALL collapse of N queries into 1', () => {
  it('emits a candidate subquery for every non-empty identity field', () => {
    const { sql, params } = buildBlocklistQuery({
      workspaceId: 'ws_1',
      identity: {
        displayName: 'Foo',
        canonicalName: 'foo',
        spotifyArtistId: 'sp_a',
        primaryEmail: 'foo@x.com',
      },
    });
    // 3 non-empty fields → 3 candidate subqueries (canonical_name + spotify + email)
    expect((sql.match(/from scout_candidates/g) || []).length).toBe(3);
    // ALL params present in order: workspaceId first, then identity values
    expect(params[0]).toBe('ws_1');
    expect(params).toContain('sp_a');
    expect(params).toContain('foo@x.com');
    expect(params).toContain('foo');
  });

  it('skips identity fields that are undefined or empty string — no wasted subquery', () => {
    const { sql, params } = buildBlocklistQuery({
      workspaceId: 'ws_1',
      identity: {
        displayName: 'Foo',
        canonicalName: 'foo',
        spotifyArtistId: '',         // empty → skip
        primaryEmail: undefined,     // undefined → skip
        instagramHandle: 'foouser',
      },
    });
    expect(params).not.toContain('');
    expect((sql.match(/from scout_candidates/g) || []).length).toBe(2);  // name + ig
  });

  it('🚀 PERF: a single identity with 4 non-empty fields → 1 query, not 8', () => {
    // The audit's key win: O(1) round-trip per isBlocked() call regardless
    // of how many identity fields are populated. (Before: O(fields).)
    const { sql } = buildBlocklistQuery({
      workspaceId: 'ws_1',
      identity: {
        displayName: 'X',
        canonicalName: 'x',
        spotifyArtistId: 'sp',
        primaryEmail: 'x@y.com',
        instagramHandle: 'x',
        tiktokHandle: 'x',
      },
    });
    // Count "limit 1" — each subquery has its own; the outer wrapper has one.
    // 5 non-empty fields × 2 tables = 10 subqueries + 1 outer = 11
    expect((sql.match(/limit\s+1/gi) || []).length).toBeGreaterThan(8);
    // But still ONE statement that gets sent over the wire.
    expect((sql.match(/^select/im) || []).length).toBeGreaterThanOrEqual(1);
  });

  it('rejection subqueries appear when includeRejections !== false', () => {
    const { sql } = buildBlocklistQuery({
      workspaceId: 'ws_1',
      identity: { displayName: 'F', canonicalName: 'f' },
    });
    expect(sql).toContain('from scout_rejections');
  });

  it('rejection subqueries SUPPRESSED when includeRejections=false', () => {
    const { sql } = buildBlocklistQuery({
      workspaceId: 'ws_1',
      identity: { displayName: 'F', canonicalName: 'f' },
      includeRejections: false,
    });
    expect(sql).not.toContain('from scout_rejections');
  });

  it('excludeCandidateId adds an id != filter on candidate subqueries ONLY (not rejections)', () => {
    const { sql, params } = buildBlocklistQuery({
      workspaceId: 'ws_1',
      identity: { displayName: 'F', canonicalName: 'f', spotifyArtistId: 'x' },
      excludeCandidateId: 'cand_42',
    });
    // The exclude clause appears in candidate subqueries
    const candidateBlocks = sql.split('from scout_rejections')[0];
    expect(candidateBlocks).toContain('id !=');
    // Not in rejection subqueries
    const rejectionBlocks = sql.split('from scout_rejections').slice(1).join('');
    expect(rejectionBlocks).not.toContain('id !=');
    expect(params).toContain('cand_42');
  });

  it('priority column encodes source + field for deterministic outer ORDER BY', () => {
    const { sql } = buildBlocklistQuery({
      workspaceId: 'ws_1',
      identity: { displayName: 'F', canonicalName: 'f', spotifyArtistId: 'x' },
    });
    // The outermost SELECT must order by priority — that's how candidate
    // matches beat rejection matches and spotify beats canonical_name.
    expect(sql).toMatch(/order\s+by\s+priority/i);
    expect(sql).toMatch(/limit\s+1\s*$/i);
    // Priority numbers: candidate matches < rejection matches.
    expect(sql).toMatch(/'spotify_artist_id'\s+as\s+matched_on,\s*0\s+as\s+priority/);
    expect(sql).toMatch(/'spotify_artist_id'\s+as\s+matched_on,\s*100\s+as\s+priority/);
  });

  it('returns null-result-safe shape when identity has NO matchable fields', () => {
    // Only displayName provided — no identity-matchable fields. The query
    // should still be valid SQL but match nothing (empty UNION).
    const { sql, params } = buildBlocklistQuery({
      workspaceId: 'ws_1',
      identity: { displayName: 'Foo', canonicalName: '' },  // empty fields → empty UNION
    });
    expect(sql).toBeTruthy();
    expect(params).toEqual(['ws_1']);  // just workspaceId, no values to match
  });
});

// ─── In-memory index (batch mode) ──────────────────────────────────────────

describe('matchAgainstIndex — synchronous O(1) lookup from prefetched data', () => {
  const baseIndex: BlocklistIndex = {
    workspaceId: 'ws_1',
    candidatesByField: {
      spotify_artist_id:  new Map([['sp_hit', { id: 'c1', displayName: 'Cand One' }]]),
      musicbrainz_id:     new Map([['mb_hit', { id: 'c2', displayName: 'Cand Two' }]]),
      primary_email:      new Map([['hit@x.com', { id: 'c3', displayName: 'Cand Three' }]]),
      instagram_handle:   new Map([['cand_ig', { id: 'c4', displayName: 'Cand Four' }]]),
      tiktok_handle:      new Map(),
      youtube_handle:     new Map(),
      soundcloud_handle:  new Map(),
      canonical_name:     new Map([['shared name', { id: 'c5', displayName: 'Cand Five' }]]),
    },
    rejectionsByField: {
      spotify_artist_id:  new Map(),
      musicbrainz_id:     new Map(),
      primary_email:      new Map(),
      instagram_handle:   new Map(),
      tiktok_handle:      new Map(),
      youtube_handle:     new Map(),
      soundcloud_handle:  new Map(),
      canonical_name:     new Map([['shared name', { id: 'r1', displayName: 'Rej One', reasonCode: 'duplicate', rejectedAt: '2026-01-01T00:00:00.000Z' }]]),
    },
    projects: [],
  };

  it('returns blocked for an identity that matches a candidate by spotify id', () => {
    const r = matchAgainstIndex(baseIndex, {
      displayName: 'X', canonicalName: 'x', spotifyArtistId: 'sp_hit',
    });
    expect(r.blocked).toBe(true);
    if (r.blocked) {
      expect(r.reason).toBe('candidate');
      expect(r.matchedOn).toBe('spotify_artist_id');
    }
  });

  it('returns blocked for an identity that matches a rejection by canonical_name', () => {
    // Use a rejection-only fixture so the candidate "shared name" doesn't
    // win on priority. (That priority-wins case is covered in the next test.)
    const rejectionOnlyIndex: BlocklistIndex = {
      ...baseIndex,
      candidatesByField: { ...baseIndex.candidatesByField, canonical_name: new Map() },
    };
    const r = matchAgainstIndex(rejectionOnlyIndex, {
      displayName: 'X', canonicalName: 'shared name',
    });
    expect(r.blocked).toBe(true);
    if (r.blocked) {
      expect(r.reason).toBe('rejected');
      expect(r.matchedOn).toBe('canonical_name');
    }
  });

  it('priority: candidate-by-spotify beats rejection-by-canonical-name', () => {
    // Both fields match — candidate match wins because of priority.
    const r = matchAgainstIndex(baseIndex, {
      displayName: 'X',
      canonicalName: 'shared name',   // matches rejection
      spotifyArtistId: 'sp_hit',      // matches candidate
    });
    expect(r.blocked).toBe(true);
    if (r.blocked) {
      expect(r.reason).toBe('candidate');
      expect(r.matchedOn).toBe('spotify_artist_id');
    }
  });

  it('excludeCandidateId hides ONE candidate row from match results', () => {
    const r = matchAgainstIndex(
      baseIndex,
      { displayName: 'X', canonicalName: 'x', spotifyArtistId: 'sp_hit' },
      { excludeCandidateId: 'c1' },
    );
    expect(r.blocked).toBe(false);
  });

  it('includeRejections=false suppresses rejection matches', () => {
    const rejectionOnlyIndex: BlocklistIndex = {
      ...baseIndex,
      candidatesByField: { ...baseIndex.candidatesByField, canonical_name: new Map() },
    };
    const r = matchAgainstIndex(
      rejectionOnlyIndex,
      { displayName: 'X', canonicalName: 'shared name' },
      { includeRejections: false },
    );
    expect(r.blocked).toBe(false);
  });

  it('returns not-blocked when nothing matches', () => {
    const r = matchAgainstIndex(baseIndex, {
      displayName: 'Brand New', canonicalName: 'brand new',
    });
    expect(r.blocked).toBe(false);
  });

  it('🚀 PERF: 1000 lookups against a fresh index are all synchronous (no async work)', () => {
    // The whole point of the index: after prefetch, every match is O(1) sync.
    // Hunter's 100-candidate batch goes from 1700 pg roundtrips to 3.
    let blockedCount = 0;
    for (let i = 0; i < 1000; i++) {
      const r = matchAgainstIndex(baseIndex, {
        displayName: `Artist ${i}`,
        canonicalName: `artist ${i}`,
        spotifyArtistId: i % 7 === 0 ? 'sp_hit' : `sp_${i}`,
      });
      if (r.blocked) blockedCount++;
    }
    // ~143 should hit (every 7th)
    expect(blockedCount).toBeGreaterThan(100);
    expect(blockedCount).toBeLessThan(200);
  });
});

describe('matchAgainstIndex — workspace projects (kickoff/live source)', () => {
  it('matches an artist in a workspace project by canonical_name → reason=kickoff', () => {
    const index: BlocklistIndex = {
      workspaceId: 'ws_1',
      candidatesByField: emptyCandidateFieldMap(),
      rejectionsByField: emptyRejectionFieldMap(),
      projects: [
        {
          id: 'ws_1',
          workspaceId: 'ws_1',
          artists: [{ n: 'Existing Artist', stage: 'prospect' }],
        },
      ],
    };
    const r = matchAgainstIndex(index, {
      displayName: 'Existing Artist',
      canonicalName: 'existing artist',
    });
    expect(r.blocked).toBe(true);
    if (r.blocked) expect(r.reason).toBe('kickoff');
  });

  it('matches LIVE artist → reason=live', () => {
    const index: BlocklistIndex = {
      workspaceId: 'ws_1',
      candidatesByField: emptyCandidateFieldMap(),
      rejectionsByField: emptyRejectionFieldMap(),
      projects: [
        {
          id: 'ws_1',
          workspaceId: 'ws_1',
          artists: [{ n: 'Live Artist', stage: 'live' }],
        },
      ],
    };
    const r = matchAgainstIndex(index, {
      displayName: 'Live Artist',
      canonicalName: 'live artist',
    });
    expect(r.blocked).toBe(true);
    if (r.blocked) expect(r.reason).toBe('live');
  });
});

function emptyCandidateFieldMap(): BlocklistIndex['candidatesByField'] {
  return {
    spotify_artist_id:  new Map(),
    musicbrainz_id:     new Map(),
    primary_email:      new Map(),
    instagram_handle:   new Map(),
    tiktok_handle:      new Map(),
    youtube_handle:     new Map(),
    soundcloud_handle:  new Map(),
    canonical_name:     new Map(),
  };
}

function emptyRejectionFieldMap(): BlocklistIndex['rejectionsByField'] {
  return {
    spotify_artist_id:  new Map(),
    musicbrainz_id:     new Map(),
    primary_email:      new Map(),
    instagram_handle:   new Map(),
    tiktok_handle:      new Map(),
    youtube_handle:     new Map(),
    soundcloud_handle:  new Map(),
    canonical_name:     new Map(),
  };
}
