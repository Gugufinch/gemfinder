import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildSearchQuery, searchArtists } from './musicbrainz';
import type { HunterCriteria } from '@/lib/gemfinder/types';

describe('buildSearchQuery', () => {
  it('combines genres with OR', () => {
    const q = buildSearchQuery({
      genres: ['indie pop', 'folk'],
      regions: [],
      roleTarget: 'both',
      targetCount: 25,
    } as HunterCriteria);
    expect(q).toContain('tag:"indie pop"');
    expect(q).toContain('tag:"folk"');
    expect(q).toContain(' OR ');
  });

  it('adds country filter when region provided', () => {
    const q = buildSearchQuery({
      genres: ['rock'],
      regions: ['US'],
      roleTarget: 'both',
      targetCount: 25,
    } as HunterCriteria);
    expect(q).toContain('country:US');
  });

  it('adds type filter for performer role', () => {
    const q = buildSearchQuery({
      genres: ['rock'],
      regions: [],
      roleTarget: 'performer',
      targetCount: 25,
    } as HunterCriteria);
    expect(q).toMatch(/type:(Person|Group)/);
  });

  it('escapes special characters in genres', () => {
    const q = buildSearchQuery({
      genres: ['"weird"genre'],
      regions: [],
      roleTarget: 'both',
      targetCount: 25,
    } as HunterCriteria);
    expect(q).toBeDefined();
    expect(q).toContain('tag:');
  });
});

describe('searchArtists', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns array of MBArtist on success', async () => {
    const mockResponse = {
      artists: [
        { id: 'mbid-1', name: 'Artist One', country: 'US', tags: [{ name: 'indie pop', count: 5 }] },
        { id: 'mbid-2', name: 'Artist Two', country: 'CA', tags: [{ name: 'folk', count: 3 }] },
      ],
    };
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await searchArtists({
      genres: ['indie pop'],
      regions: ['US'],
      roleTarget: 'both',
      targetCount: 25,
    } as HunterCriteria);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Artist One');
  });

  it('sends User-Agent header', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ artists: [] }),
    } as Response);

    await searchArtists({
      genres: ['rock'],
      regions: [],
      roleTarget: 'both',
      targetCount: 25,
    } as HunterCriteria);

    const callArgs = fetchMock.mock.calls[0];
    const opts = callArgs[1] as RequestInit;
    const headers = opts.headers as Record<string, string>;
    expect(headers['User-Agent']).toContain('Gemfinder-Hunter');
  });
});
