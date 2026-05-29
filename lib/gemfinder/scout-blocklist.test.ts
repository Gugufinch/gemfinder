// lib/gemfinder/scout-blocklist.test.ts
//
// Tests are written as documentation of expected behavior.
// They require a reachable Postgres test DB (DATABASE_URL_TEST) to run.
// Run: npm test -- lib/gemfinder/scout-blocklist.test.ts
//
import { describe, it, expect, beforeEach } from 'vitest';
import { withTransaction } from '@/vitest.setup';
import { isBlocked } from './scout-blocklist';
import { ensureSchema as ensureScoutSchema, createCandidate, createRejection } from './scout-candidate-store';
import { buildCandidate } from '@/test/fixtures/scout-v3/candidates';
import { buildRejection } from '@/test/fixtures/scout-v3/rejections';

beforeEach(async () => {
  await ensureScoutSchema();
});

describe('isBlocked: candidates match', () => {
  it('returns blocked when Spotify ID matches existing candidate', async () => {
    await withTransaction(async () => {
      await createCandidate(buildCandidate({ spotifyArtistId: 'SPOT123' }));
      const result = await isBlocked('test-workspace', {
        displayName: 'Different Name',
        canonicalName: 'different name',
        spotifyArtistId: 'SPOT123',
      });
      expect(result.blocked).toBe(true);
      if (result.blocked) {
        expect(result.reason).toBe('candidate');
        expect(result.matchedOn).toBe('spotify_artist_id');
      }
    });
  });

  it('respects excludeCandidateId (for edit flow)', async () => {
    await withTransaction(async () => {
      const c = await createCandidate(buildCandidate({ spotifyArtistId: 'SPOT123' }));
      const result = await isBlocked(
        'test-workspace',
        { displayName: 'Same', canonicalName: 'same', spotifyArtistId: 'SPOT123' },
        { excludeCandidateId: c.id }
      );
      expect(result.blocked).toBe(false);
    });
  });
});

describe('isBlocked: rejections match', () => {
  it('returns blocked when canonical name matches rejection', async () => {
    await withTransaction(async () => {
      await createRejection(buildRejection({ canonicalName: 'matched artist' }));
      const result = await isBlocked('test-workspace', {
        displayName: 'Matched Artist',
        canonicalName: 'matched artist',
      });
      expect(result.blocked).toBe(true);
      if (result.blocked) expect(result.reason).toBe('rejected');
    });
  });

  it('skips rejection check when includeRejections=false', async () => {
    await withTransaction(async () => {
      await createRejection(buildRejection({ canonicalName: 'foo' }));
      const result = await isBlocked(
        'test-workspace',
        { displayName: 'Foo', canonicalName: 'foo' },
        { includeRejections: false }
      );
      expect(result.blocked).toBe(false);
    });
  });
});

describe('isBlocked: match priority order', () => {
  it('returns spotify_artist_id match before canonical_name match', async () => {
    await withTransaction(async () => {
      await createCandidate(buildCandidate({
        spotifyArtistId: 'SPOT_HIT',
        canonicalName: 'will not match',
      }));
      await createRejection(buildRejection({
        canonicalName: 'shared name',
        spotifyArtistId: undefined,
      }));
      const result = await isBlocked('test-workspace', {
        displayName: 'Anything',
        canonicalName: 'shared name',
        spotifyArtistId: 'SPOT_HIT',
      });
      expect(result.blocked).toBe(true);
      if (result.blocked) {
        expect(result.matchedOn).toBe('spotify_artist_id');
        expect(result.reason).toBe('candidate');
      }
    });
  });
});

describe('isBlocked: clean identity', () => {
  it('returns not blocked when nothing matches', async () => {
    await withTransaction(async () => {
      const result = await isBlocked('test-workspace', {
        displayName: 'Brand New',
        canonicalName: 'brand new',
      });
      expect(result.blocked).toBe(false);
    });
  });
});

// Note: Kickoff + Live source tests deferred until project-store
// integration is built — covered in scout-blocklist.kickoff.test.ts after
// addTalentToProject lands.
