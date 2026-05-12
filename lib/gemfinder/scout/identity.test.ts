import { describe, it, expect } from 'vitest';
import {
  canonicalizeName,
  parseSpotifyUrl,
  parseInstagramUrl,
  parseTiktokUrl,
  parseYoutubeUrl,
  parseSoundcloudUrl,
  parseBandcampUrl,
  parseMusicbrainzUrl,
  parseUrl,
  buildIdentity,
} from './identity';

describe('canonicalizeName', () => {
  it('lowercases and trims', () => {
    expect(canonicalizeName('  Taylor Swift  ')).toBe('taylor swift');
  });

  it('strips diacritics', () => {
    expect(canonicalizeName('Beyoncé')).toBe('beyonce');
  });

  it('collapses inner whitespace', () => {
    expect(canonicalizeName('Foo   Bar')).toBe('foo bar');
  });

  it('returns empty string for empty input', () => {
    expect(canonicalizeName('')).toBe('');
    expect(canonicalizeName('   ')).toBe('');
  });

  it("preserves apostrophes (artist names like O'Connor)", () => {
    expect(canonicalizeName("O'Connor")).toBe("o'connor");
  });
});

describe('parseSpotifyUrl', () => {
  it('extracts artist id from open.spotify.com URL', () => {
    expect(parseSpotifyUrl('https://open.spotify.com/artist/4iHNK0tOyZPYnBU7nGAgpQ'))
      .toEqual({ spotifyArtistId: '4iHNK0tOyZPYnBU7nGAgpQ', spotifyUrl: 'https://open.spotify.com/artist/4iHNK0tOyZPYnBU7nGAgpQ' });
  });

  it('handles query strings', () => {
    expect(parseSpotifyUrl('https://open.spotify.com/artist/4iHNK0tOyZPYnBU7nGAgpQ?si=abc'))
      .toEqual({ spotifyArtistId: '4iHNK0tOyZPYnBU7nGAgpQ', spotifyUrl: 'https://open.spotify.com/artist/4iHNK0tOyZPYnBU7nGAgpQ' });
  });

  it('returns null for non-spotify URL', () => {
    expect(parseSpotifyUrl('https://example.com/foo')).toBeNull();
  });

  it('returns null for track URLs (we only handle artist)', () => {
    expect(parseSpotifyUrl('https://open.spotify.com/track/4iHNK0tOyZPYnBU7nGAgpQ')).toBeNull();
  });
});

describe('parseInstagramUrl', () => {
  it('extracts handle from instagram.com/username/', () => {
    expect(parseInstagramUrl('https://www.instagram.com/taylorswift/'))
      .toEqual({ instagramHandle: 'taylorswift' });
  });

  it('handles without trailing slash', () => {
    expect(parseInstagramUrl('https://www.instagram.com/taylorswift'))
      .toEqual({ instagramHandle: 'taylorswift' });
  });

  it('handles missing www', () => {
    expect(parseInstagramUrl('https://instagram.com/taylorswift'))
      .toEqual({ instagramHandle: 'taylorswift' });
  });

  it('returns null for non-instagram URL', () => {
    expect(parseInstagramUrl('https://example.com/taylorswift')).toBeNull();
  });
});

describe('parseTiktokUrl', () => {
  it('extracts handle from tiktok.com/@username', () => {
    expect(parseTiktokUrl('https://www.tiktok.com/@taylorswift'))
      .toEqual({ tiktokHandle: 'taylorswift' });
  });

  it('handles query strings', () => {
    expect(parseTiktokUrl('https://www.tiktok.com/@taylorswift?lang=en'))
      .toEqual({ tiktokHandle: 'taylorswift' });
  });
});

describe('parseYoutubeUrl', () => {
  it('extracts @handle from youtube.com/@username', () => {
    expect(parseYoutubeUrl('https://www.youtube.com/@taylorswift'))
      .toEqual({ youtubeHandle: 'taylorswift', youtubeUrl: 'https://www.youtube.com/@taylorswift' });
  });

  it('handles channel URLs by returning null (only @handles supported in S0)', () => {
    expect(parseYoutubeUrl('https://www.youtube.com/channel/UCabc123')).toBeNull();
  });
});

describe('parseSoundcloudUrl', () => {
  it('extracts handle', () => {
    expect(parseSoundcloudUrl('https://soundcloud.com/taylorswift'))
      .toEqual({ soundcloudHandle: 'taylorswift', soundcloudUrl: 'https://soundcloud.com/taylorswift' });
  });
});

describe('parseBandcampUrl', () => {
  it('extracts bandcamp URL as-is', () => {
    expect(parseBandcampUrl('https://taylorswift.bandcamp.com/'))
      .toEqual({ bandcampUrl: 'https://taylorswift.bandcamp.com/' });
  });
});

describe('parseMusicbrainzUrl', () => {
  it('extracts MBID from musicbrainz URL', () => {
    expect(parseMusicbrainzUrl('https://musicbrainz.org/artist/20244d07-534f-4eff-b4d4-930878889970'))
      .toEqual({ musicbrainzId: '20244d07-534f-4eff-b4d4-930878889970' });
  });
});

describe('parseUrl (router)', () => {
  it('dispatches to Spotify parser', () => {
    const result = parseUrl('https://open.spotify.com/artist/4iHNK0tOyZPYnBU7nGAgpQ');
    expect(result).toHaveProperty('spotifyArtistId');
  });

  it('returns empty object for unrecognized URL', () => {
    expect(parseUrl('https://example.com/foo')).toEqual({});
  });

  it('handles empty input', () => {
    expect(parseUrl('')).toEqual({});
  });
});

describe('buildIdentity', () => {
  it('builds CandidateIdentity from candidate input', () => {
    const id = buildIdentity({
      displayName: 'Taylor Swift',
      spotifyArtistId: 'abc123',
      instagramHandle: 'taylorswift',
    });
    expect(id).toEqual({
      displayName: 'Taylor Swift',
      canonicalName: 'taylor swift',
      spotifyArtistId: 'abc123',
      instagramHandle: 'taylorswift',
    });
  });

  it('throws on empty display name', () => {
    expect(() => buildIdentity({ displayName: '' })).toThrow(/displayName/);
  });

  it('lowercases primary email', () => {
    const id = buildIdentity({ displayName: 'X', primaryEmail: 'FOO@Bar.com' });
    expect(id.primaryEmail).toBe('foo@bar.com');
  });
});
