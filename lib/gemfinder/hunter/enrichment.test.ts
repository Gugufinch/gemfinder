import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/gemfinder/hunter/spotify', () => ({
  getArtistById: vi.fn(),
  parseSpotifyArtistId: vi.fn((url: string) => {
    const m = url.match(/\/artist\/([a-zA-Z0-9]+)/);
    return m ? m[1] : null;
  }),
}));
vi.mock('@/lib/gemfinder/hunter/steel', () => ({
  scrapeWebsite: vi.fn(),
}));
vi.mock('@/lib/gemfinder/hunter/musicbrainz', () => ({
  // fetchArtistDetails is called by enrichCandidate at Step 0 to enrich MB
  // search results with relations + release-groups. Tests pass a complete
  // mbArtist fixture so the fetch isn't strictly needed — we return null
  // by default so enrichCandidate falls through to using the fixture as-is.
  // Tests that exercise the fetch path override this via mockResolvedValueOnce.
  fetchArtistDetails: vi.fn(async () => null),
}));
vi.mock('@/lib/gemfinder/hunter/scrape-cache', () => ({
  getCached: vi.fn(),
  putCached: vi.fn(),
}));

import { enrichCandidate } from '@/lib/gemfinder/hunter/enrichment';
import * as spotify from '@/lib/gemfinder/hunter/spotify';
import * as steel from '@/lib/gemfinder/hunter/steel';
import * as cache from '@/lib/gemfinder/hunter/scrape-cache';
import * as mb from '@/lib/gemfinder/hunter/musicbrainz';
import type { MBArtist } from '@/lib/gemfinder/hunter/musicbrainz';
import type { SpotifyArtist } from '@/lib/gemfinder/hunter/spotify';
import type { SteelScrapeResult } from '@/lib/gemfinder/hunter/steel';

function minimalArtist(overrides: Partial<MBArtist> = {}): MBArtist {
  return { id: 'mb-001', name: 'Test Artist', ...overrides };
}

function makeScrapeResult(overrides: Partial<SteelScrapeResult['extractedFields']> = {}): SteelScrapeResult {
  return {
    url: 'https://example.com',
    pageHtml: '<html></html>',
    extractedFields: { ...overrides },
    scrapedAt: '2026-01-01T00:00:00Z',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.mocked(cache.getCached).mockResolvedValue(null);
  vi.mocked(cache.putCached).mockResolvedValue(undefined);
  vi.mocked(steel.scrapeWebsite).mockResolvedValue(null);
  vi.mocked(spotify.getArtistById).mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('enrichCandidate', () => {
  // -------------------------------------------------------------------------
  // Basic shape
  // -------------------------------------------------------------------------

  it('minimal MB artist (no relations) returns correct defaults', async () => {
    const result = await enrichCandidate('ws-1', minimalArtist());
    expect(result.displayName).toBe('Test Artist');
    expect(result.musicbrainzId).toBe('mb-001');
    expect(result.isLiving).toBe(true);
    expect(result.contactReadiness).toBe('none');
    expect(result.inferredRole).toBe('unknown');
    expect(result.genres).toEqual([]);
    expect(result.spotifyFollowers).toBeUndefined();
  });

  it('deceased artist (has life-span.end) → isLiving false', async () => {
    const result = await enrichCandidate('ws-1', minimalArtist({ 'life-span': { begin: '1950', end: '2010' } }));
    expect(result.isLiving).toBe(false);
  });

  it('no end date → isLiving true', async () => {
    const result = await enrichCandidate('ws-1', minimalArtist({ 'life-span': { begin: '1990' } }));
    expect(result.isLiving).toBe(true);
  });

  // -------------------------------------------------------------------------
  // recentReleaseYear
  // -------------------------------------------------------------------------

  it('computes recentReleaseYear as max year across release groups', async () => {
    const result = await enrichCandidate('ws-1', minimalArtist({
      'release-groups': [
        { id: 'r1', title: 'A', 'first-release-date': '2019-03-15' },
        { id: 'r2', title: 'B', 'first-release-date': '2023' },
        { id: 'r3', title: 'C', 'first-release-date': '2021-07' },
      ],
    }));
    expect(result.recentReleaseYear).toBe(2023);
  });

  it('skips release groups with no date or unparseable date', async () => {
    const result = await enrichCandidate('ws-1', minimalArtist({
      'release-groups': [
        { id: 'r1', title: 'A' },
        { id: 'r2', title: 'B', 'first-release-date': 'unknown' },
        { id: 'r3', title: 'C', 'first-release-date': '2018' },
      ],
    }));
    expect(result.recentReleaseYear).toBe(2018);
  });

  it('no release groups → recentReleaseYear undefined', async () => {
    const result = await enrichCandidate('ws-1', minimalArtist());
    expect(result.recentReleaseYear).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // inferredRole
  // -------------------------------------------------------------------------

  it('Person + release groups → inferredRole performer', async () => {
    const result = await enrichCandidate('ws-1', minimalArtist({
      type: 'Person',
      'release-groups': [{ id: 'r1', title: 'Album' }],
    }));
    expect(result.inferredRole).toBe('performer');
  });

  it('Group + release groups → inferredRole performer', async () => {
    const result = await enrichCandidate('ws-1', minimalArtist({
      type: 'Group',
      'release-groups': [{ id: 'r1', title: 'Album' }],
    }));
    expect(result.inferredRole).toBe('performer');
  });

  it('Group + no release groups → inferredRole unknown', async () => {
    const result = await enrichCandidate('ws-1', minimalArtist({ type: 'Group' }));
    expect(result.inferredRole).toBe('unknown');
  });

  it('Person + no release groups → inferredRole unknown', async () => {
    const result = await enrichCandidate('ws-1', minimalArtist({ type: 'Person' }));
    expect(result.inferredRole).toBe('unknown');
  });

  // -------------------------------------------------------------------------
  // Spotify integration
  // -------------------------------------------------------------------------

  it('Spotify URL present, getArtistById returns artist → spotify fields populated', async () => {
    const spotifyArtist: SpotifyArtist = {
      id: 'sp123',
      name: 'Test Artist',
      followers: { total: 5000 },
      popularity: 42,
      genres: ['indie pop', 'dream pop'],
      external_urls: { spotify: 'https://open.spotify.com/artist/sp123' },
    };
    vi.mocked(spotify.getArtistById).mockResolvedValue(spotifyArtist);

    const result = await enrichCandidate('ws-1', minimalArtist({
      relations: [
        { type: 'spotify', url: { resource: 'https://open.spotify.com/artist/sp123' } },
      ],
    }));

    expect(result.spotifyArtistId).toBe('sp123');
    expect(result.spotifyFollowers).toBe(5000);
    expect(result.spotifyPopularity).toBe(42);
    expect(result.spotifyGenres).toEqual(['indie pop', 'dream pop']);
    // genres takes spotify genres
    expect(result.genres).toEqual(['indie pop', 'dream pop']);
  });

  it('Spotify URL present, getArtistById returns null → proceeds without spotify fields', async () => {
    vi.mocked(spotify.getArtistById).mockResolvedValue(null);

    const result = await enrichCandidate('ws-1', minimalArtist({
      tags: [{ name: 'rock', count: 5 }],
      relations: [
        { type: 'spotify', url: { resource: 'https://open.spotify.com/artist/sp123' } },
      ],
    }));

    expect(result.spotifyFollowers).toBeUndefined();
    expect(result.spotifyPopularity).toBeUndefined();
    expect(result.spotifyGenres).toBeUndefined();
    // genres falls back to MB tags
    expect(result.genres).toEqual(['rock']);
  });

  // -------------------------------------------------------------------------
  // Genres precedence
  // -------------------------------------------------------------------------

  it('genres from MB tags (no spotify) → sorted by count desc', async () => {
    const result = await enrichCandidate('ws-1', minimalArtist({
      tags: [
        { name: 'ambient', count: 2 },
        { name: 'electronic', count: 10 },
        { name: 'experimental', count: 5 },
      ],
    }));
    expect(result.genres).toEqual(['electronic', 'experimental', 'ambient']);
  });

  // -------------------------------------------------------------------------
  // Scrape URL selection
  // -------------------------------------------------------------------------

  it('website URL present → scrapeWebsite called with website, not IG', async () => {
    vi.mocked(cache.getCached).mockResolvedValue(null);
    vi.mocked(steel.scrapeWebsite).mockResolvedValue(makeScrapeResult());

    await enrichCandidate('ws-1', minimalArtist({
      relations: [
        { type: 'official homepage', url: { resource: 'https://example.com' } },
        { type: 'instagram', url: { resource: 'https://instagram.com/testartist' } },
      ],
    }));

    expect(steel.scrapeWebsite).toHaveBeenCalledWith('https://example.com');
    expect(steel.scrapeWebsite).not.toHaveBeenCalledWith('https://instagram.com/testartist');
  });

  it('URL priority: website beats bandcamp beats IG', async () => {
    vi.mocked(cache.getCached).mockResolvedValue(null);
    vi.mocked(steel.scrapeWebsite).mockResolvedValue(makeScrapeResult());

    await enrichCandidate('ws-1', minimalArtist({
      relations: [
        { type: 'bandcamp', url: { resource: 'https://testartist.bandcamp.com' } },
        { type: 'official homepage', url: { resource: 'https://testartist.com' } },
        { type: 'instagram', url: { resource: 'https://instagram.com/testartist' } },
      ],
    }));

    expect(steel.scrapeWebsite).toHaveBeenCalledWith('https://testartist.com');
    expect(steel.scrapeWebsite).toHaveBeenCalledTimes(1);
  });

  it('no website → bandcamp used for scraping', async () => {
    vi.mocked(cache.getCached).mockResolvedValue(null);
    vi.mocked(steel.scrapeWebsite).mockResolvedValue(makeScrapeResult());

    await enrichCandidate('ws-1', minimalArtist({
      relations: [
        { type: 'bandcamp', url: { resource: 'https://testartist.bandcamp.com' } },
        { type: 'instagram', url: { resource: 'https://instagram.com/testartist' } },
      ],
    }));

    expect(steel.scrapeWebsite).toHaveBeenCalledWith('https://testartist.bandcamp.com');
  });

  // -------------------------------------------------------------------------
  // Scrape cache behavior
  // -------------------------------------------------------------------------

  it('scrape cache hit → scrapeWebsite NOT called, putCached NOT called', async () => {
    const cached = makeScrapeResult({ contactEmail: 'hit@example.com' });
    vi.mocked(cache.getCached).mockResolvedValue(cached);

    await enrichCandidate('ws-1', minimalArtist({
      relations: [{ type: 'official homepage', url: { resource: 'https://example.com' } }],
    }));

    expect(steel.scrapeWebsite).not.toHaveBeenCalled();
    expect(cache.putCached).not.toHaveBeenCalled();
  });

  it('scrape cache miss + scrape success → scrapeWebsite called, putCached called once', async () => {
    vi.mocked(cache.getCached).mockResolvedValue(null);
    const scrapeResult = makeScrapeResult({ contactEmail: 'found@example.com' });
    vi.mocked(steel.scrapeWebsite).mockResolvedValue(scrapeResult);

    await enrichCandidate('ws-1', minimalArtist({
      relations: [{ type: 'official homepage', url: { resource: 'https://example.com' } }],
    }));

    expect(steel.scrapeWebsite).toHaveBeenCalledOnce();
    expect(cache.putCached).toHaveBeenCalledOnce();
    expect(cache.putCached).toHaveBeenCalledWith('ws-1', 'https://example.com', scrapeResult);
  });

  it('scrape cache miss + scrape failure → no throw, no putCached', async () => {
    vi.mocked(cache.getCached).mockResolvedValue(null);
    vi.mocked(steel.scrapeWebsite).mockResolvedValue(null);

    const result = await enrichCandidate('ws-1', minimalArtist({
      relations: [{ type: 'official homepage', url: { resource: 'https://example.com' } }],
    }));

    expect(cache.putCached).not.toHaveBeenCalled();
    expect(result.scrapedContactEmail).toBeUndefined();
    expect(result.scrapedManagerInfo).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // contactReadiness
  // -------------------------------------------------------------------------

  it('scraped contact email → contactReadiness direct', async () => {
    vi.mocked(cache.getCached).mockResolvedValue(makeScrapeResult({ contactEmail: 'mgmt@artist.com' }));

    const result = await enrichCandidate('ws-1', minimalArtist({
      relations: [{ type: 'official homepage', url: { resource: 'https://example.com' } }],
    }));

    expect(result.contactReadiness).toBe('direct');
    expect(result.scrapedContactEmail).toBe('mgmt@artist.com');
  });

  it('MB tag "email" (no scraped email) → contactReadiness direct', async () => {
    const result = await enrichCandidate('ws-1', minimalArtist({
      tags: [{ name: 'email', count: 1 }],
    }));
    expect(result.contactReadiness).toBe('direct');
  });

  it('MB tag "contact" → contactReadiness direct', async () => {
    const result = await enrichCandidate('ws-1', minimalArtist({
      tags: [{ name: 'contact', count: 1 }],
    }));
    expect(result.contactReadiness).toBe('direct');
  });

  it('scraped managerInfo "Management: ..." → contactReadiness manager', async () => {
    vi.mocked(cache.getCached).mockResolvedValue(makeScrapeResult({ managerInfo: 'Management: XYZ Co' }));

    const result = await enrichCandidate('ws-1', minimalArtist({
      relations: [{ type: 'official homepage', url: { resource: 'https://example.com' } }],
    }));

    expect(result.contactReadiness).toBe('manager');
  });

  it('scraped managerInfo "Agency: WME" → contactReadiness agency', async () => {
    vi.mocked(cache.getCached).mockResolvedValue(makeScrapeResult({ managerInfo: 'Agency: WME' }));

    const result = await enrichCandidate('ws-1', minimalArtist({
      relations: [{ type: 'official homepage', url: { resource: 'https://example.com' } }],
    }));

    expect(result.contactReadiness).toBe('agency');
  });

  it('scraped managerInfo "Booking: foo" → contactReadiness booking', async () => {
    vi.mocked(cache.getCached).mockResolvedValue(makeScrapeResult({ managerInfo: 'Booking: Foo Bookings' }));

    const result = await enrichCandidate('ws-1', minimalArtist({
      relations: [{ type: 'official homepage', url: { resource: 'https://example.com' } }],
    }));

    expect(result.contactReadiness).toBe('booking');
  });

  it('only social URL (no email/manager) → contactReadiness social_only', async () => {
    const result = await enrichCandidate('ws-1', minimalArtist({
      relations: [{ type: 'instagram', url: { resource: 'https://instagram.com/testartist' } }],
    }));
    expect(result.contactReadiness).toBe('social_only');
  });

  it('bandcamp URL only → contactReadiness social_only', async () => {
    const result = await enrichCandidate('ws-1', minimalArtist({
      relations: [{ type: 'bandcamp', url: { resource: 'https://testartist.bandcamp.com' } }],
    }));
    expect(result.contactReadiness).toBe('social_only');
  });

  it('no URLs, no email, no manager → contactReadiness none', async () => {
    const result = await enrichCandidate('ws-1', minimalArtist());
    expect(result.contactReadiness).toBe('none');
  });

  // -------------------------------------------------------------------------
  // Handle extraction / platform URL mapping
  // -------------------------------------------------------------------------

  it('extracts instagram handle from relation URL', async () => {
    const result = await enrichCandidate('ws-1', minimalArtist({
      relations: [{ type: 'instagram', url: { resource: 'https://www.instagram.com/foobar' } }],
    }));
    expect(result.instagramHandle).toBe('foobar');
  });

  it('extracts soundcloud handle stripping @ prefix', async () => {
    const result = await enrichCandidate('ws-1', minimalArtist({
      relations: [{ type: 'soundcloud', url: { resource: 'https://soundcloud.com/my-artist' } }],
    }));
    expect(result.soundcloudHandle).toBe('my-artist');
  });

  it('populates website from official homepage relation', async () => {
    const result = await enrichCandidate('ws-1', minimalArtist({
      relations: [{ type: 'official homepage', url: { resource: 'https://mysite.com' } }],
    }));
    expect(result.website).toBe('https://mysite.com');
  });

  // -------------------------------------------------------------------------
  // Graceful failure — client throws (not returns null)
  // -------------------------------------------------------------------------

  it('spotify getArtistById throws — enrichment completes without spotify fields', async () => {
    vi.mocked(spotify.getArtistById).mockRejectedValue(new Error('spotify down'));

    const result = await enrichCandidate('ws-1', minimalArtist({
      tags: [{ name: 'indie', count: 3 }],
      relations: [
        { type: 'spotify', url: { resource: 'https://open.spotify.com/artist/sp999' } },
      ],
    }));

    expect(result.spotifyFollowers).toBeUndefined();
    expect(result.spotifyPopularity).toBeUndefined();
    // genres falls back to MB tags when spotify threw
    expect(result.genres).toEqual(['indie']);
    // The catch arm must log — silent swallowing violates CLAUDE.md fire-and-forget convention.
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('[HUNTER_ENRICH] spotify lookup failed for'),
      expect.anything(),
      expect.any(Error)
    );
  });

  it('scrapeWebsite throws — enrichment completes without scraped fields, putCached not called', async () => {
    vi.mocked(cache.getCached).mockResolvedValue(null);
    vi.mocked(steel.scrapeWebsite).mockRejectedValue(new Error('steel timeout'));

    const result = await enrichCandidate('ws-1', minimalArtist({
      relations: [
        { type: 'official homepage', url: { resource: 'https://example.com' } },
      ],
    }));

    expect(result.scrapedContactEmail).toBeUndefined();
    expect(result.scrapedManagerInfo).toBeUndefined();
    expect(cache.putCached).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('[HUNTER_ENRICH] scrape failed for'),
      expect.anything(),
      expect.any(Error)
    );
  });

  it('getCached throws — falls back to live scrape and populates scraped fields', async () => {
    vi.mocked(cache.getCached).mockRejectedValue(new Error('db down'));
    const scrapeResult = makeScrapeResult({ contactEmail: 'live@example.com' });
    vi.mocked(steel.scrapeWebsite).mockResolvedValue(scrapeResult);

    const result = await enrichCandidate('ws-1', minimalArtist({
      relations: [
        { type: 'official homepage', url: { resource: 'https://example.com' } },
      ],
    }));

    expect(steel.scrapeWebsite).toHaveBeenCalledWith('https://example.com');
    expect(result.scrapedContactEmail).toBe('live@example.com');
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('[HUNTER_ENRICH] cache lookup failed for'),
      expect.anything(),
      expect.any(Error)
    );
  });

  // ---------------------------------------------------------------------------
  // MB fetchArtistDetails fallback — when search results lack relations
  // ---------------------------------------------------------------------------
  // BUG that this regression-guards: searchArtists returns BASIC artist data
  // (no relations, no release-groups). Without the Step 0 fetchArtistDetails
  // call, enrichment was running on empty extracted URLs → no Spotify lookup
  // → no follower data → size_cap gate never fired → megastars surfaced
  // wrong-reason gate-outs (Taylor Swift got "no_contact" instead of "too_big").
  describe('Step 0: fetchArtistDetails fallback when MB search omits relations', () => {
    it('calls fetchArtistDetails when input mbArtist lacks relations + release-groups', async () => {
      vi.mocked(mb.fetchArtistDetails).mockResolvedValue({
        id: 'mb-001',
        name: 'Test Artist',
        relations: [{ type: 'spotify', url: { resource: 'https://open.spotify.com/artist/sp123' } }],
        'release-groups': [{ id: 'rg-1', title: 'Album One', 'first-release-date': '2023-06-01' }],
        tags: [{ name: 'indie pop', count: 5 }],
      });
      vi.mocked(spotify.getArtistById).mockResolvedValue({
        id: 'sp123',
        name: 'Test Artist',
        followers: { total: 1234 },
        popularity: 50,
        genres: ['indie pop'],
      });

      // Pass a minimal MB artist (no relations, no release-groups — same as searchArtists returns)
      const result = await enrichCandidate('ws-1', minimalArtist());

      expect(mb.fetchArtistDetails).toHaveBeenCalledWith('mb-001');
      expect(spotify.getArtistById).toHaveBeenCalledWith('sp123');
      expect(result.spotifyFollowers).toBe(1234);
      expect(result.spotifyPopularity).toBe(50);
      expect(result.recentReleaseYear).toBe(2023);
    });

    it('skips fetchArtistDetails when input mbArtist already has relations + release-groups', async () => {
      // Orchestrator passes pre-fetched data → no need to re-fetch.
      const result = await enrichCandidate('ws-1', minimalArtist({
        relations: [{ type: 'spotify', url: { resource: 'https://open.spotify.com/artist/sp123' } }],
        'release-groups': [{ id: 'rg-1', title: 'Album One', 'first-release-date': '2023-01-01' }],
      }));

      expect(mb.fetchArtistDetails).not.toHaveBeenCalled();
      expect(result.spotifyArtistId).toBe('sp123');
    });

    it('continues degraded when fetchArtistDetails throws', async () => {
      vi.mocked(mb.fetchArtistDetails).mockRejectedValue(new Error('MB 503'));

      // No throw, enrichment falls through with the minimal data we have.
      const result = await enrichCandidate('ws-1', minimalArtist({ name: 'Bare Bones' }));

      expect(result.displayName).toBe('Bare Bones');
      expect(result.spotifyFollowers).toBeUndefined();
      // The warn must fire — silently swallowing would violate CLAUDE.md convention.
      expect(console.warn).toHaveBeenCalledWith(
        '[HUNTER_ENRICH] fetchArtistDetails failed for',
        'mb-001',
        expect.any(Error)
      );
    });

    it('continues with original data when fetchArtistDetails returns null', async () => {
      vi.mocked(mb.fetchArtistDetails).mockResolvedValue(null);

      const result = await enrichCandidate('ws-1', minimalArtist({ name: 'Unknown' }));

      expect(result.displayName).toBe('Unknown');
      expect(result.spotifyFollowers).toBeUndefined();
      // No warn — null is a clean fallback, not an error.
      expect(console.warn).not.toHaveBeenCalledWith(
        '[HUNTER_ENRICH] fetchArtistDetails failed for',
        expect.anything(),
        expect.anything()
      );
    });
  });
});
