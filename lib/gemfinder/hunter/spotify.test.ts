import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getAccessToken, getArtistById, _resetTokenCache } from './spotify';

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
