import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scrapeWebsite, normalizeUrl } from './steel';

describe('normalizeUrl', () => {
  it('lowercases scheme and host', () => {
    expect(normalizeUrl('HTTPS://Example.COM/PATH')).toBe('https://example.com/PATH');
  });
  it('strips trailing slash from path', () => {
    expect(normalizeUrl('https://example.com/foo/')).toBe('https://example.com/foo');
  });
  it('strips utm tracking params', () => {
    expect(normalizeUrl('https://example.com/?utm_source=test&utm_medium=x')).toBe('https://example.com');
  });
});

describe('scrapeWebsite', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    process.env.STEEL_API_KEY = 'ste-test-key';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns scrape result on success', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        pageHtml: '<html><a href="mailto:hi@artist.com">contact</a></html>',
      }),
    } as Response);

    const result = await scrapeWebsite('https://artist.com');
    expect(result).not.toBeNull();
    expect(result?.url).toBe('https://artist.com');
    expect(result?.extractedFields?.contactEmail).toBe('hi@artist.com');
  });

  it('returns null on 429 (quota exhausted)', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => 'quota exceeded',
    } as Response);

    const result = await scrapeWebsite('https://artist.com');
    expect(result).toBeNull();
  });

  it('returns null when STEEL_API_KEY is unset', async () => {
    delete process.env.STEEL_API_KEY;
    const result = await scrapeWebsite('https://artist.com');
    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('econnreset'));
    const result = await scrapeWebsite('https://artist.com');
    expect(result).toBeNull();
  });

  it('extracts contact email via regex', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        pageHtml: 'Booking: <a href="mailto:booking@artist.com">click</a>',
      }),
    } as Response);

    const result = await scrapeWebsite('https://artist.com');
    expect(result?.extractedFields?.contactEmail).toBe('booking@artist.com');
  });

  it('extracts manager info', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        pageHtml: 'Management: Big Artist Mgmt · email: mgr@bigmgmt.com',
      }),
    } as Response);

    const result = await scrapeWebsite('https://artist.com');
    expect(result?.extractedFields?.managerInfo).toContain('Big Artist Mgmt');
  });
});
