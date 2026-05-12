// lib/gemfinder/scout-candidate-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { withTransaction } from '@/vitest.setup';
import {
  ensureSchema,
  createCandidate,
  getCandidate,
  listCandidatesByWorkspace,
  deleteCandidate,
  updateCandidate,
  createRejection,
  listRejectionsByWorkspace,
  getStats,
} from './scout-candidate-store';
import { buildCandidate } from '@/test/fixtures/scout-v3/candidates';
import { buildRejection } from '@/test/fixtures/scout-v3/rejections';

beforeEach(async () => {
  await ensureSchema();
  // Truncate Scout V3 tables between tests for isolation.
  // We can't rely on withTransaction alone — the store module uses its own pg
  // pool, so rolls inside withTransaction don't roll back data written through
  // createCandidate/createRejection. Truncating is the simplest workaround.
  const pool = getTestPool();
  await pool.query('truncate scout_candidates restart identity cascade');
  await pool.query('truncate scout_rejections restart identity cascade');
});

import { getTestPool } from '@/vitest.setup';

describe('scout-candidate-store: candidates CRUD', () => {
  it('createCandidate inserts and returns the row', async () => {
    await withTransaction(async () => {
      const input = buildCandidate({ displayName: 'Foo Artist' });
      const created = await createCandidate(input);
      expect(created.id).toBe(input.id);
      expect(created.displayName).toBe('Foo Artist');
      expect(created.canonicalName).toBe('foo artist');
    });
  });

  it('getCandidate returns null for missing id', async () => {
    await withTransaction(async () => {
      const result = await getCandidate('test-workspace', 'nonexistent');
      expect(result).toBeNull();
    });
  });

  it('listCandidatesByWorkspace orders by createdAt desc by default', async () => {
    await withTransaction(async () => {
      const a = await createCandidate(buildCandidate({ id: 'a', createdAt: '2026-01-01T00:00:00Z' }));
      const b = await createCandidate(buildCandidate({ id: 'b', createdAt: '2026-01-02T00:00:00Z' }));
      const list = await listCandidatesByWorkspace('test-workspace');
      expect(list[0].id).toBe(b.id);
      expect(list[1].id).toBe(a.id);
    });
  });

  it('deleteCandidate removes the row', async () => {
    await withTransaction(async () => {
      const c = await createCandidate(buildCandidate());
      await deleteCandidate('test-workspace', c.id);
      expect(await getCandidate('test-workspace', c.id)).toBeNull();
    });
  });

  it('updateCandidate patches specific fields', async () => {
    await withTransaction(async () => {
      const c = await createCandidate(buildCandidate({ primaryGenre: 'indie' }));
      const updated = await updateCandidate('test-workspace', c.id, { primaryGenre: 'folk' });
      expect(updated?.primaryGenre).toBe('folk');
    });
  });

  it('roundtrips extraLinks (JSONB)', async () => {
    await withTransaction(async () => {
      const c = await createCandidate(buildCandidate({
        extraLinks: [{ label: 'Linktree', url: 'https://linktr.ee/x', followers: 100 }],
      }));
      const fetched = await getCandidate('test-workspace', c.id);
      expect(fetched?.extraLinks).toEqual([
        { label: 'Linktree', url: 'https://linktr.ee/x', followers: 100 },
      ]);
    });
  });

  it('roundtrips genres + locations + hitTracks (JSONB arrays)', async () => {
    await withTransaction(async () => {
      const c = await createCandidate(buildCandidate({
        genres: ['indie pop', 'folk'],
        locations: ['Nashville, TN'],
        hitTracks: ['Track One'],
      }));
      const fetched = await getCandidate('test-workspace', c.id);
      expect(fetched?.genres).toEqual(['indie pop', 'folk']);
      expect(fetched?.locations).toEqual(['Nashville, TN']);
      expect(fetched?.hitTracks).toEqual(['Track One']);
    });
  });
});

describe('scout-candidate-store: rejections', () => {
  it('createRejection inserts and returns the row', async () => {
    await withTransaction(async () => {
      const r = buildRejection({ reasonCode: 'wrong_genre', reasonNote: 'metal not fit' });
      const created = await createRejection(r);
      expect(created.id).toBe(r.id);
      expect(created.reasonCode).toBe('wrong_genre');
    });
  });

  it('listRejectionsByWorkspace returns recent first', async () => {
    await withTransaction(async () => {
      const a = await createRejection(buildRejection({ id: 'r-a', rejectedAt: '2026-01-01T00:00:00Z' }));
      const b = await createRejection(buildRejection({ id: 'r-b', rejectedAt: '2026-01-02T00:00:00Z' }));
      const list = await listRejectionsByWorkspace('test-workspace');
      expect(list[0].id).toBe(b.id);
      expect(list[1].id).toBe(a.id);
    });
  });
});

describe('scout-candidate-store: stats', () => {
  it('counts pending candidates and rejections', async () => {
    await withTransaction(async () => {
      await createCandidate(buildCandidate({ id: 'c1' }));
      await createCandidate(buildCandidate({ id: 'c2' }));
      await createRejection(buildRejection({ id: 'r1' }));
      const stats = await getStats('test-workspace');
      expect(stats.pendingCount).toBe(2);
      expect(stats.rejectedCount).toBe(1);
    });
  });
});
