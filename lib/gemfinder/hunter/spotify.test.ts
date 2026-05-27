import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getAccessToken,
  getArtistById,
  _resetTokenCache,
  nameSimilarity,
  genreOverlap,
  pickBestMatch,
} from './spotify';
import type { SpotifyArtist } from './spotify';

function makeArtist(overrides: Partial<SpotifyArtist> = {}): SpotifyArtist {
  return {
    id: 'sp1',
    name: 'Test Artist',
    followers: { total: 1000 },
    popularity: 30,
    genres: [],
    images: [],
    external_urls: {},
    ...overrides,
  };
}

describe('getAccessToken', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    process.env.SPOTIFY_CLIENT_ID = 'test_id';
    process.env.SPOTIFY_CLIENT_SECRET = 'test_secret';
    _resetTokenCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exchanges credentials for token', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'tok_abc', token_type: 'Bearer', expires_in: 3600 }),
    } as Response);

    const token = await getAccessToken();
    expect(token).toBe('tok_abc');
  });

  it('caches token across calls', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'tok_xyz', expires_in: 3600 }),
    } as Response);

    await getAccessToken();
    await getAccessToken();
    await getAccessToken();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws on missing env vars', async () => {
    delete process.env.SPOTIFY_CLIENT_ID;
    _resetTokenCache();
    await expect(getAccessToken()).rejects.toThrow(/SPOTIFY_CLIENT_ID/);
  });

  it('throws on Spotify 401', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'invalid_client',
    } as Response);
    await expect(getAccessToken()).rejects.toThrow(/401|invalid_client/i);
  });
});

describe('getArtistById', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    process.env.SPOTIFY_CLIENT_ID = 'test_id';
    process.env.SPOTIFY_CLIENT_SECRET = 'test_secret';
    _resetTokenCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns artist data on success', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 't', expires_in: 3600 }) } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'sp_id',
          name: 'Artist X',
          followers: { total: 12345 },
          popularity: 67,
          genres: ['indie pop'],
        }),
      } as Response);

    const artist = await getArtistById('sp_id');
    expect(artist?.id).toBe('sp_id');
    expect(artist?.followers.total).toBe(12345);
    expect(artist?.popularity).toBe(67);
  });

  it('returns null on 404', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 't', expires_in: 3600 }) } as Response)
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response);

    const artist = await getArtistById('nonexistent');
    expect(artist).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Fuzzy-match name search helpers
// ---------------------------------------------------------------------------

describe('nameSimilarity', () => {
  it('identical names → 1.0', () => {
    expect(nameSimilarity('Audrey Hobert', 'Audrey Hobert')).toBe(1.0);
  });

  it('case + punctuation differences → high score via substring path', () => {
    // "Wednesday (US)" normalizes to "wednesdayus"; "wednesday" remains
    // "wednesday". They're not equal-after-normalize, but containment kicks in:
    // "wednesdayus".includes("wednesday") → substring score ~= 9/11 floored to 0.85.
    expect(nameSimilarity('Wednesday (US)', 'wednesday')).toBeGreaterThanOrEqual(0.85);
  });

  it('case ONLY differences → 1.0 (exact after normalize)', () => {
    expect(nameSimilarity('Audrey Hobert', 'audrey hobert')).toBe(1.0);
    expect(nameSimilarity('WEDNESDAY', 'wednesday')).toBe(1.0);
  });

  it('substring containment → high score (≥0.85)', () => {
    // "Jermaine" inside "Jermaine from the South" — the bug we're fixing.
    expect(nameSimilarity('Jermaine', 'Jermaine from the South')).toBeGreaterThanOrEqual(0.85);
  });

  it('partial overlap → bigram Jaccard around 0.3-0.6', () => {
    const sim = nameSimilarity('The National', 'National Anthem');
    expect(sim).toBeGreaterThan(0.2);
    expect(sim).toBeLessThan(0.85);
  });

  it('completely different names → near zero', () => {
    expect(nameSimilarity('Taylor Swift', 'Bruce Springsteen')).toBeLessThan(0.2);
  });

  it('empty inputs → 0', () => {
    expect(nameSimilarity('', 'anything')).toBe(0);
    expect(nameSimilarity('anything', '')).toBe(0);
  });
});

describe('genreOverlap', () => {
  it('exact match → 1.0', () => {
    expect(genreOverlap(['indie pop'], ['indie pop'])).toBe(1.0);
  });

  it('case-insensitive match → 1.0', () => {
    expect(genreOverlap(['INDIE POP'], ['indie pop'])).toBe(1.0);
  });

  it('partial overlap → fractional', () => {
    // 1 of 2 hits → 0.5
    const result = genreOverlap(['indie', 'rock'], ['indie pop']);
    expect(result).toBe(0.5);
  });

  it('no overlap → 0', () => {
    expect(genreOverlap(['classical'], ['hip-hop'])).toBe(0);
  });

  it('empty arrays → 0', () => {
    expect(genreOverlap([], ['indie'])).toBe(0);
    expect(genreOverlap(['indie'], [])).toBe(0);
  });
});

describe('pickBestMatch', () => {
  it('🐛 BUG FIX: returns the artist with similar name + genre overlap, not the unrelated wrong-genre top result', () => {
    // Simulates the Jermaine Butler bug: Spotify search returns multiple
    // results, the top by followers is a wrong-genre author/podcaster, and
    // the actual artist has fewer followers but a similar name + matching
    // genres. The old code returned the wrong one.
    const candidates = [
      makeArtist({ id: 'sp-author', name: 'Jermaine Butler', genres: ['author', 'podcast'], followers: { total: 50000 } }),
      makeArtist({ id: 'sp-artist', name: 'Jermaine from the South', genres: ['hip-hop', 'creole'], followers: { total: 8000 } }),
    ];
    const result = pickBestMatch('Jermaine from the South', candidates, { hintGenres: ['hip-hop'] });
    expect(result?.id).toBe('sp-artist');
  });

  it('returns null when no candidate clears the similarity floor', () => {
    const candidates = [
      makeArtist({ name: 'Completely Different Name', followers: { total: 100000 } }),
    ];
    const result = pickBestMatch('Original Target', candidates);
    expect(result).toBeNull();
  });

  it('exact name match wins even with lower followers', () => {
    const candidates = [
      makeArtist({ id: 'higher-followers-fuzzy', name: 'Audrey Hoberts', followers: { total: 100000 } }),
      makeArtist({ id: 'exact-match-low', name: 'Audrey Hobert', followers: { total: 5000 } }),
    ];
    const result = pickBestMatch('Audrey Hobert', candidates);
    expect(result?.id).toBe('exact-match-low');
  });

  it('genre overlap breaks ties between similar-named candidates', () => {
    const candidates = [
      makeArtist({ id: 'no-genres', name: 'Wednesday', genres: [], followers: { total: 30000 } }),
      makeArtist({ id: 'right-genre', name: 'Wednesday', genres: ['shoegaze', 'indie rock'], followers: { total: 15000 } }),
    ];
    const result = pickBestMatch('Wednesday', candidates, { hintGenres: ['shoegaze'] });
    expect(result?.id).toBe('right-genre');
  });

  it('respects custom minSimilarity floor', () => {
    const candidates = [
      makeArtist({ name: 'Vaguely Similar Name', followers: { total: 1000 } }),
    ];
    // High floor → reject; low floor → accept
    expect(pickBestMatch('Target Name', candidates, { minSimilarity: 0.9 })).toBeNull();
    const accepted = pickBestMatch('Target Name', candidates, { minSimilarity: 0.1 });
    expect(accepted).not.toBeNull();
  });

  it('returns null for empty candidate array', () => {
    expect(pickBestMatch('Anything', [])).toBeNull();
  });
});
