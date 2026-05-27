// lib/gemfinder/hunter/social-scraping.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the Steel semaphore so tests never block waiting for permits
vi.mock('@/lib/gemfinder/hunter/steel', () => ({
  steelSem: {
    acquire: vi.fn(async () => {}),
    release: vi.fn(),
  },
}));

vi.mock('@/lib/gemfinder/hunter/scrape-cache', () => ({
  getCached: vi.fn(async () => null),
  putCached: vi.fn(async () => undefined),
}));

import {
  parseFollowerString,
  fetchInstagramFollowers,
  fetchTiktokFollowers,
  fetchYoutubeSubscribers,
  fetchSoundcloudFollowers,
  extractYouTubeSubscribers,
  extractSoundCloudFollowers,
} from '@/lib/gemfinder/hunter/social-scraping';
import * as scrapeCache from '@/lib/gemfinder/hunter/scrape-cache';

// ---------------------------------------------------------------------------
// parseFollowerString unit tests
// ---------------------------------------------------------------------------

describe('parseFollowerString', () => {
  it('"1.2M Followers, ..." → 1200000', () => {
    expect(parseFollowerString('1.2M Followers, 350 Following, 89 Posts')).toBe(1200000);
  });

  it('"1.2M" → 1200000', () => {
    expect(parseFollowerString('1.2M')).toBe(1200000);
  });

  it('"5.7M Followers" → 5700000', () => {
    expect(parseFollowerString('5.7M Followers')).toBe(5700000);
  });

  it('"350K" → 350000', () => {
    expect(parseFollowerString('350K')).toBe(350000);
  });

  it('"350k" (lowercase) → 350000', () => {
    expect(parseFollowerString('350k')).toBe(350000);
  });

  it('"12,400" → 12400', () => {
    expect(parseFollowerString('12,400')).toBe(12400);
  });

  it('"1,234,567" → 1234567', () => {
    expect(parseFollowerString('1,234,567')).toBe(1234567);
  });

  it('"42" → 42', () => {
    expect(parseFollowerString('42')).toBe(42);
  });

  it('"abc" → null', () => {
    expect(parseFollowerString('abc')).toBeNull();
  });

  it('"" → null', () => {
    expect(parseFollowerString('')).toBeNull();
  });

  it('undefined → null', () => {
    expect(parseFollowerString(undefined)).toBeNull();
  });

  it('null → null', () => {
    expect(parseFollowerString(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// fetchInstagramFollowers
// ---------------------------------------------------------------------------

describe('fetchInstagramFollowers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.STEEL_API_KEY = 'test-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.STEEL_API_KEY;
  });

  it('parses follower count from meta description tag', async () => {
    const html = `<html>
      <head>
        <meta name="description" content="12,400 Followers, 150 Following, 80 Posts – See Instagram photos and videos from testartist (@testartist)" />
      </head>
    </html>`;

    vi.mocked(scrapeCache.getCached).mockResolvedValue(null);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ pageHtml: html }),
    } as Response);

    const result = await fetchInstagramFollowers('testartist');
    expect(result).toBe(12400);
  });

  it('parses M-suffix follower count from meta description', async () => {
    const html = `<html><head>
      <meta name="description" content="2.3M Followers, 500 Following, 200 Posts" />
    </head></html>`;

    vi.mocked(scrapeCache.getCached).mockResolvedValue(null);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ pageHtml: html }),
    } as Response);

    const result = await fetchInstagramFollowers('bigartist');
    expect(result).toBe(2300000);
  });

  it('returns null on network error + warns', async () => {
    vi.mocked(scrapeCache.getCached).mockResolvedValue(null);
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await fetchInstagramFollowers('failartist');
    expect(result).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      '[HUNTER_SOCIAL] network error fetching',
      expect.stringContaining('instagram.com'),
      expect.any(Error)
    );
  });

  it('returns null when HTML has no follower string + warns', async () => {
    const html = '<html><head><title>Page Not Found</title></head><body></body></html>';
    vi.mocked(scrapeCache.getCached).mockResolvedValue(null);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ pageHtml: html }),
    } as Response);

    const result = await fetchInstagramFollowers('nocount');
    expect(result).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      '[HUNTER_SOCIAL] IG no follower count found for',
      'nocount'
    );
  });

  it('returns null when STEEL_API_KEY is missing + warns', async () => {
    delete process.env.STEEL_API_KEY;
    const result = await fetchInstagramFollowers('testartist');
    expect(result).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      '[HUNTER_SOCIAL] STEEL_API_KEY not set; skipping scrape'
    );
  });

  it('returns cached result without hitting Steel API', async () => {
    const cachedHtml = `<html><head>
      <meta name="description" content="5,000 Followers, ..." />
    </head></html>`;
    vi.mocked(scrapeCache.getCached).mockResolvedValue({
      url: 'ig:cachedartist',
      pageHtml: cachedHtml,
      scrapedAt: '2026-01-01T00:00:00Z',
    });
    global.fetch = vi.fn();

    const result = await fetchInstagramFollowers('cachedartist');
    expect(result).toBe(5000);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns null on HTTP 404', async () => {
    vi.mocked(scrapeCache.getCached).mockResolvedValue(null);
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    } as Response);

    const result = await fetchInstagramFollowers('notfound');
    expect(result).toBeNull();
    expect(console.warn).toHaveBeenCalledWith('[HUNTER_SOCIAL] HTTP 404 for https://www.instagram.com/notfound/');
  });
});

// ---------------------------------------------------------------------------
// fetchTiktokFollowers
// ---------------------------------------------------------------------------

describe('fetchTiktokFollowers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.STEEL_API_KEY = 'test-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.STEEL_API_KEY;
  });

  it('parses follower count from inline JSON followerCount (number)', async () => {
    const html = `<html><body><script>window.__INIT_PROPS__={"followerCount":87500};</script></body></html>`;
    vi.mocked(scrapeCache.getCached).mockResolvedValue(null);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ pageHtml: html }),
    } as Response);

    const result = await fetchTiktokFollowers('ttartist');
    expect(result).toBe(87500);
  });

  it('parses follower count from inline JSON followerCount (string)', async () => {
    const html = `<html><body><script>{"followerCount":"1200000"}</script></body></html>`;
    vi.mocked(scrapeCache.getCached).mockResolvedValue(null);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ pageHtml: html }),
    } as Response);

    const result = await fetchTiktokFollowers('ttartist2');
    expect(result).toBe(1200000);
  });

  it('parses from meta description "X Followers"', async () => {
    const html = `<html><head>
      <meta name="description" content="350K Followers, 200 Following, 500 Likes" />
    </head></html>`;
    vi.mocked(scrapeCache.getCached).mockResolvedValue(null);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ pageHtml: html }),
    } as Response);

    const result = await fetchTiktokFollowers('ttmeta');
    expect(result).toBe(350000);
  });

  it('returns null on network error + warns', async () => {
    vi.mocked(scrapeCache.getCached).mockResolvedValue(null);
    global.fetch = vi.fn().mockRejectedValue(new Error('timeout'));

    const result = await fetchTiktokFollowers('failtt');
    expect(result).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      '[HUNTER_SOCIAL] network error fetching',
      expect.stringContaining('tiktok.com'),
      expect.any(Error)
    );
  });

  it('returns null when HTML has no follower string + warns', async () => {
    const html = '<html><body>Page not found</body></html>';
    vi.mocked(scrapeCache.getCached).mockResolvedValue(null);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ pageHtml: html }),
    } as Response);

    const result = await fetchTiktokFollowers('nocount');
    expect(result).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      '[HUNTER_SOCIAL] TT no follower count found for',
      'nocount'
    );
  });

  it('returns null when STEEL_API_KEY is missing + warns', async () => {
    delete process.env.STEEL_API_KEY;
    const result = await fetchTiktokFollowers('ttartist');
    expect(result).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      '[HUNTER_SOCIAL] STEEL_API_KEY not set; skipping scrape'
    );
  });

  it('returns cached result without hitting Steel API', async () => {
    const cachedHtml = `<html><body><script>{"followerCount":99000}</script></body></html>`;
    vi.mocked(scrapeCache.getCached).mockResolvedValue({
      url: 'tt:cachedtt',
      pageHtml: cachedHtml,
      scrapedAt: '2026-01-01T00:00:00Z',
    });
    global.fetch = vi.fn();

    const result = await fetchTiktokFollowers('cachedtt');
    expect(result).toBe(99000);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// YouTube subscriber extraction — strategy-by-strategy verification
// ---------------------------------------------------------------------------

describe('extractYouTubeSubscribers', () => {
  it('parses ytInitialData simpleText "12.4K subscribers"', () => {
    const html = `<script>var ytInitialData = {"subscriberCountText":{"simpleText":"12.4K subscribers"}};</script>`;
    expect(extractYouTubeSubscribers(html)).toBe(12400);
  });

  it('parses ytInitialData runs[0].text "1.2M subscribers"', () => {
    const html = `<script>var ytInitialData = {"subscriberCountText":{"runs":[{"text":"1.2M subscribers"}]}};</script>`;
    expect(extractYouTubeSubscribers(html)).toBe(1_200_000);
  });

  it('parses meta itemprop="subscriberCount" content="934"', () => {
    const html = `<meta itemprop="subscriberCount" content="934">`;
    expect(extractYouTubeSubscribers(html)).toBe(934);
  });

  it('parses meta description fallback "Subscribe · 12K subscribers"', () => {
    const html = `<meta name="description" content="Subscribe to my channel · 12K subscribers, daily uploads">`;
    expect(extractYouTubeSubscribers(html)).toBe(12_000);
  });

  it('returns null when no subscriber pattern matches', () => {
    expect(extractYouTubeSubscribers('<html><body>Empty</body></html>')).toBeNull();
  });

  it('prefers ytInitialData over meta description (the more authoritative source)', () => {
    const html = `<meta name="description" content="Subscribe · 50K subscribers">
                  <script>var ytInitialData = {"subscriberCountText":{"simpleText":"125K subscribers"}};</script>`;
    expect(extractYouTubeSubscribers(html)).toBe(125_000);
  });
});

// ---------------------------------------------------------------------------
// SoundCloud follower extraction — strategy-by-strategy verification
// ---------------------------------------------------------------------------

describe('extractSoundCloudFollowers', () => {
  it('parses hydration JSON "followers_count":12400', () => {
    const html = `<script>window.__sc_hydration = [{"data":{"followers_count":12400}}];</script>`;
    expect(extractSoundCloudFollowers(html)).toBe(12400);
  });

  it('parses meta property soundcloud:user:followers_count', () => {
    const html = `<meta property="soundcloud:user:followers_count" content="8500">`;
    expect(extractSoundCloudFollowers(html)).toBe(8500);
  });

  it('parses meta description fallback "1.5K Followers"', () => {
    const html = `<meta name="description" content="Producer · 1.5K Followers · 22 tracks">`;
    expect(extractSoundCloudFollowers(html)).toBe(1500);
  });

  it('returns null when no follower pattern matches', () => {
    expect(extractSoundCloudFollowers('<html><body>Empty</body></html>')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// fetchYoutubeSubscribers (network/cache integration)
// ---------------------------------------------------------------------------

describe('fetchYoutubeSubscribers', () => {
  beforeEach(() => {
    process.env.STEEL_API_KEY = 'test-key';
    vi.mocked(scrapeCache.getCached).mockResolvedValue(null);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hits Steel, parses subscribers, caches result', async () => {
    const html = `<script>var ytInitialData = {"subscriberCountText":{"simpleText":"15K subscribers"}};</script>`;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ pageHtml: html }),
    } as Response);

    const result = await fetchYoutubeSubscribers('artistchannel');
    expect(result).toBe(15_000);
    expect(scrapeCache.putCached).toHaveBeenCalledWith(
      expect.any(String),
      'yt:artistchannel',
      expect.objectContaining({ pageHtml: html }),
    );
  });

  it('returns null when no subscriber count found + warns', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ pageHtml: '<html><body>Empty channel</body></html>' }),
    } as Response);
    const result = await fetchYoutubeSubscribers('nocount');
    expect(result).toBeNull();
    expect(console.warn).toHaveBeenCalledWith('[HUNTER_SOCIAL] YT no subscriber count found for', 'nocount');
  });

  it('returns null when STEEL_API_KEY is missing', async () => {
    delete process.env.STEEL_API_KEY;
    const result = await fetchYoutubeSubscribers('artist');
    expect(result).toBeNull();
  });

  it('returns cached result without hitting Steel', async () => {
    const cachedHtml = `<script>var ytInitialData = {"subscriberCountText":{"simpleText":"50K subscribers"}};</script>`;
    vi.mocked(scrapeCache.getCached).mockResolvedValue({
      url: 'yt:cached',
      pageHtml: cachedHtml,
      scrapedAt: '2026-01-01T00:00:00Z',
    });
    global.fetch = vi.fn();
    const result = await fetchYoutubeSubscribers('cached');
    expect(result).toBe(50_000);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// fetchSoundcloudFollowers (network/cache integration)
// ---------------------------------------------------------------------------

describe('fetchSoundcloudFollowers', () => {
  beforeEach(() => {
    process.env.STEEL_API_KEY = 'test-key';
    vi.mocked(scrapeCache.getCached).mockResolvedValue(null);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hits Steel, parses followers, caches result', async () => {
    const html = `<script>{"followers_count":8500}</script>`;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ pageHtml: html }),
    } as Response);

    const result = await fetchSoundcloudFollowers('producerHandle');
    expect(result).toBe(8500);
    expect(scrapeCache.putCached).toHaveBeenCalledWith(
      expect.any(String),
      'sc:producerHandle',
      expect.objectContaining({ pageHtml: html }),
    );
  });

  it('returns null when no follower count found', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ pageHtml: '<html><body>Not found</body></html>' }),
    } as Response);
    const result = await fetchSoundcloudFollowers('nocount');
    expect(result).toBeNull();
  });

  it('returns null when STEEL_API_KEY is missing', async () => {
    delete process.env.STEEL_API_KEY;
    const result = await fetchSoundcloudFollowers('artist');
    expect(result).toBeNull();
  });
});
