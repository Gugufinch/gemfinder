import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/gemfinder/hunter/spotify', () => ({
  getArtistById: vi.fn(),
  searchArtistByName: vi.fn(async () => null),
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
vi.mock('@/lib/gemfinder/hunter/social-scraping', () => ({
  fetchInstagramFollowers: vi.fn(async () => null),
  fetchTiktokFollowers: vi.fn(async () => null),
  fetchYoutubeSubscribers: vi.fn(async () => null),
  fetchSoundcloudFollowers: vi.fn(async () => null),
}));
vi.mock('@/lib/gemfinder/hunter/deep-research', () => ({
  researchArtist: vi.fn(async () => null),
}));

import { enrichCandidate } from '@/lib/gemfinder/hunter/enrichment';
import * as spotify from '@/lib/gemfinder/hunter/spotify';
import * as steel from '@/lib/gemfinder/hunter/steel';
import * as cache from '@/lib/gemfinder/hunter/scrape-cache';
import * as mb from '@/lib/gemfinder/hunter/musicbrainz';
import * as social from '@/lib/gemfinder/hunter/social-scraping';
import * as deepResearch from '@/lib/gemfinder/hunter/deep-research';
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

  // ---------------------------------------------------------------------------
  // Social scraping integration (Step 7b)
  // ---------------------------------------------------------------------------

  describe('Step 7b: social follower scraping', () => {
    it('IG handle present → calls fetchInstagramFollowers, populates instagramFollowers on result', async () => {
      vi.mocked(social.fetchInstagramFollowers).mockResolvedValue(12400);

      const result = await enrichCandidate('ws-1', minimalArtist({
        relations: [
          { type: 'instagram', url: { resource: 'https://www.instagram.com/igartist' } },
        ],
      }));

      expect(social.fetchInstagramFollowers).toHaveBeenCalledWith('igartist');
      expect(result.instagramFollowers).toBe(12400);
    });

    it('TikTok handle present → calls fetchTiktokFollowers, populates tiktokFollowers on result', async () => {
      vi.mocked(social.fetchTiktokFollowers).mockResolvedValue(87500);

      const result = await enrichCandidate('ws-1', minimalArtist({
        relations: [
          { type: 'tiktok', url: { resource: 'https://www.tiktok.com/@ttartist' } },
        ],
      }));

      expect(social.fetchTiktokFollowers).toHaveBeenCalledWith('ttartist');
      expect(result.tiktokFollowers).toBe(87500);
    });

    it('both handles present → both followers populated', async () => {
      vi.mocked(social.fetchInstagramFollowers).mockResolvedValue(5000);
      vi.mocked(social.fetchTiktokFollowers).mockResolvedValue(9999);

      const result = await enrichCandidate('ws-1', minimalArtist({
        relations: [
          { type: 'instagram', url: { resource: 'https://instagram.com/dualartist' } },
          { type: 'tiktok', url: { resource: 'https://www.tiktok.com/@dualartist' } },
        ],
      }));

      expect(result.instagramFollowers).toBe(5000);
      expect(result.tiktokFollowers).toBe(9999);
    });

    it('social scrape returns null → instagramFollowers undefined on result', async () => {
      vi.mocked(social.fetchInstagramFollowers).mockResolvedValue(null);

      const result = await enrichCandidate('ws-1', minimalArtist({
        relations: [
          { type: 'instagram', url: { resource: 'https://instagram.com/nullartist' } },
        ],
      }));

      expect(result.instagramFollowers).toBeUndefined();
    });

    it('social scrape throws → enrichment completes, instagramFollowers undefined', async () => {
      vi.mocked(social.fetchInstagramFollowers).mockRejectedValue(new Error('scrape exploded'));

      const result = await enrichCandidate('ws-1', minimalArtist({
        relations: [
          { type: 'instagram', url: { resource: 'https://instagram.com/throwartist' } },
        ],
      }));

      // Enrichment must not throw
      expect(result.displayName).toBe('Test Artist');
      expect(result.instagramFollowers).toBeUndefined();
      expect(console.warn).toHaveBeenCalledWith(
        '[HUNTER_ENRICH] IG fetch failed:',
        expect.any(Error)
      );
    });

    it('no IG handle → fetchInstagramFollowers not called', async () => {
      await enrichCandidate('ws-1', minimalArtist({
        relations: [
          { type: 'tiktok', url: { resource: 'https://www.tiktok.com/@ttonly' } },
        ],
      }));

      expect(social.fetchInstagramFollowers).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Deep research integration
  // ---------------------------------------------------------------------------
  describe('deep research layer', () => {
    it('throws not-a-recording-artist when deep research returns verified=false', async () => {
      vi.mocked(deepResearch.researchArtist).mockResolvedValueOnce({
        verified: false,
        isLiving: null,
        genres: [],
        citations: [],
        researchedAt: '2026-01-01T00:00:00Z',
      });
      await expect(
        enrichCandidate('ws-1', minimalArtist({ name: 'James Dashner' }))
      ).rejects.toThrow(/not-a-recording-artist/);
    });

    it('layers deep research location + bio + contact onto the EnrichedCandidate', async () => {
      vi.mocked(deepResearch.researchArtist).mockResolvedValueOnce({
        verified: true,
        isLiving: true,
        recentReleaseYear: 2024,
        location: 'Asheville, NC',
        country: 'US',
        genres: ['indie rock'],
        bookingEmail: 'booking@wednesdayband.com',
        managerInfo: 'Hardly Art / Asheville mgmt',
        bio: 'Asheville indie band, Pitchfork "Best New Music" March 2024.',
        citations: ['https://pitchfork.com/x'],
        researchedAt: '2026-01-01T00:00:00Z',
      });
      const result = await enrichCandidate('ws-1', minimalArtist({ name: 'Wednesday' }));
      expect(result.country).toBe('US');
      expect(result.recentReleaseYear).toBe(2024);
      expect(result.aiSummary).toContain('Pitchfork');
      expect(result.scrapedContactEmail).toBe('booking@wednesdayband.com');
      expect(result.scrapedManagerInfo).toContain('Hardly Art');
    });

    it('graceful degrade when deep research returns null — enrichment continues with MB/Spotify data', async () => {
      vi.mocked(deepResearch.researchArtist).mockResolvedValueOnce(null);
      const result = await enrichCandidate('ws-1', minimalArtist({
        name: 'Wednesday',
        country: 'US',
      }));
      expect(result.displayName).toBe('Wednesday');
      expect(result.country).toBe('US');  // falls back to MB
    });

    it("uses deep research's spotifyUrl when MB doesn't have one", async () => {
      vi.mocked(deepResearch.researchArtist).mockResolvedValueOnce({
        verified: true,
        isLiving: true,
        spotifyUrl: 'https://open.spotify.com/artist/deepfound123',
        genres: ['indie rock'],
        citations: [],
        researchedAt: '2026-01-01T00:00:00Z',
      });
      const result = await enrichCandidate('ws-1', minimalArtist({ name: 'Wednesday' }));
      expect(result.spotifyUrl).toBe('https://open.spotify.com/artist/deepfound123');
    });
  });

  // -------------------------------------------------------------------------
  // LLM-cited Spotify URL — the new pre-name-search verification path. When
  // the discovery prompt elicits a spotifyUrl from Gemini, we use it
  // directly instead of falling back to fuzzy name search. Saves a Spotify
  // API call and avoids stage-name vs legal-name mismatches.
  // -------------------------------------------------------------------------
  describe('LLM-cited Spotify URL (_llmSpotifyUrl)', () => {
    const llmArtist: SpotifyArtist = {
      id: 'llmcitedSpId01',
      name: 'Jermaine from the South',
      followers: { total: 8500 },
      popularity: 28,
      genres: ['hip-hop', 'creole'],
      images: [{ url: 'https://i.scdn.co/img/jermaine.jpg', height: 640, width: 640 }],
      external_urls: {},
    };

    it('uses _llmSpotifyUrl when present and MB has no relations', async () => {
      vi.mocked(spotify.getArtistById).mockResolvedValueOnce(llmArtist);
      // LLM-sourced candidate: id='' (no MB), name from LLM, _llmSpotifyUrl from
      // the new parser. With this URL present, name-search MUST NOT fire.
      const candidate = minimalArtist({
        id: '',
        name: 'Jermaine Butler',
        _llmSpotifyUrl: 'https://open.spotify.com/artist/llmcitedSpId01',
      });
      const result = await enrichCandidate('ws-1', candidate);
      expect(result.spotifyArtistId).toBe('llmcitedSpId01');
      expect(result.spotifyFollowers).toBe(8500);
      expect(result.spotifyPopularity).toBe(28);
      expect(spotify.searchArtistByName).not.toHaveBeenCalled();
    });

    it('LLM URL succeeds → candidate is marked verified (unverified=false)', async () => {
      vi.mocked(spotify.getArtistById).mockResolvedValueOnce(llmArtist);
      const candidate = minimalArtist({
        id: '',
        name: 'Jermaine Butler',
        _llmSpotifyUrl: 'https://open.spotify.com/artist/llmcitedSpId01',
      });
      const result = await enrichCandidate('ws-1', candidate);
      // spotifyArtistId is now set → unverified should be false. This is the
      // big win: Bug 1's gate won't reject this candidate.
      expect(result.unverified).toBe(false);
    });

    it('captures spotifyImageUrl from the LLM-URL path (previously only by_name set it)', async () => {
      vi.mocked(spotify.getArtistById).mockResolvedValueOnce(llmArtist);
      const result = await enrichCandidate('ws-1', minimalArtist({
        id: '',
        name: 'Jermaine Butler',
        _llmSpotifyUrl: 'https://open.spotify.com/artist/llmcitedSpId01',
      }));
      expect(result.spotifyImageUrl).toBe('https://i.scdn.co/img/jermaine.jpg');
    });

    it('MB relation URL takes precedence over _llmSpotifyUrl', async () => {
      // When both sources have a URL, MB wins (more authoritative — actually
      // verified by MusicBrainz editors, not just LLM-cited).
      const mbArtistObj: SpotifyArtist = {
        id: 'mbSpId01',
        name: 'Different Artist',
        followers: { total: 12000 },
        popularity: 40,
        genres: [],
        images: [],
        external_urls: {},
      };
      vi.mocked(spotify.getArtistById).mockResolvedValueOnce(mbArtistObj);
      const candidate = minimalArtist({
        id: 'mb-real',
        name: 'Artist',
        relations: [
          { type: 'spotify', url: { resource: 'https://open.spotify.com/artist/mbSpId01' } },
        ],
        _llmSpotifyUrl: 'https://open.spotify.com/artist/llmDifferentId',
      });
      const result = await enrichCandidate('ws-1', candidate);
      expect(result.spotifyArtistId).toBe('mbSpId01');
      // Verify the MB ID was preferred — getArtistById should have been called
      // with the MB URL's ID, not the LLM's.
      expect(spotify.getArtistById).toHaveBeenCalledWith('mbSpId01');
    });

    it('malformed _llmSpotifyUrl falls back to name search', async () => {
      // parseSpotifyArtistId returns null for garbage URLs. When that happens
      // with a URL provided, we should fall through to name search rather
      // than treat the failed-parse as a successful lookup.
      vi.mocked(spotify.parseSpotifyArtistId).mockImplementationOnce(() => null);
      vi.mocked(spotify.searchArtistByName).mockResolvedValueOnce({
        id: 'nameSearchId',
        name: 'Artist Found By Name',
        followers: { total: 1500 },
        popularity: 12,
        genres: ['indie'],
        images: [],
        external_urls: {},
      });
      const candidate = minimalArtist({
        id: '',
        name: 'Artist',
        _llmSpotifyUrl: 'not-a-real-url',
      });
      const result = await enrichCandidate('ws-1', candidate);
      expect(spotify.searchArtistByName).toHaveBeenCalledWith('Artist');
      expect(result.spotifyArtistId).toBe('nameSearchId');
    });

    it('absent _llmSpotifyUrl → legacy name-search path still works', async () => {
      vi.mocked(spotify.searchArtistByName).mockResolvedValueOnce({
        id: 'nameSearchId',
        name: 'Artist',
        followers: { total: 2000 },
        popularity: 15,
        genres: [],
        images: [],
        external_urls: {},
      });
      const result = await enrichCandidate('ws-1', minimalArtist({ id: '', name: 'Artist' }));
      expect(spotify.searchArtistByName).toHaveBeenCalledWith('Artist');
      expect(result.spotifyArtistId).toBe('nameSearchId');
    });
  });
});
