// lib/gemfinder/scout/social-urls.test.ts
import { describe, it, expect } from 'vitest';
import { buildSocialUrl, displayHandle } from './social-urls';

describe('buildSocialUrl', () => {
  describe('plain handles', () => {
    it('Instagram: bare handle gets canonical URL', () => {
      expect(buildSocialUrl('instagram', 'jermaine_from_the_south'))
        .toBe('https://instagram.com/jermaine_from_the_south');
    });

    it('TikTok: bare handle gets @-prefixed URL', () => {
      expect(buildSocialUrl('tiktok', 'jermaine_from_the_south'))
        .toBe('https://tiktok.com/@jermaine_from_the_south');
    });

    it('YouTube: bare handle gets @-prefixed URL', () => {
      expect(buildSocialUrl('youtube', 'jermaine_from_the_south'))
        .toBe('https://youtube.com/@jermaine_from_the_south');
    });

    it('SoundCloud: bare handle, no @ prefix', () => {
      expect(buildSocialUrl('soundcloud', 'jermaine_from_the_south'))
        .toBe('https://soundcloud.com/jermaine_from_the_south');
    });
  });

  describe('handle with leading @ — the most common LLM output shape', () => {
    it('strips @ from Instagram handle', () => {
      expect(buildSocialUrl('instagram', '@jermaine_from_the_south'))
        .toBe('https://instagram.com/jermaine_from_the_south');
    });

    it('strips @ from TikTok handle and adds platform @', () => {
      expect(buildSocialUrl('tiktok', '@jermaine_from_the_south'))
        .toBe('https://tiktok.com/@jermaine_from_the_south');
    });

    it('strips multiple @ symbols', () => {
      expect(buildSocialUrl('youtube', '@@jermaine'))
        .toBe('https://youtube.com/@jermaine');
    });
  });

  describe('handle that is actually a URL — LLMs love doing this', () => {
    it('handle stored as full URL with protocol', () => {
      expect(buildSocialUrl('instagram', 'https://www.instagram.com/jermaine_from_the_south/'))
        .toBe('https://www.instagram.com/jermaine_from_the_south/');
    });

    it('handle stored as protocol-less URL', () => {
      expect(buildSocialUrl('instagram', 'instagram.com/jermaine_from_the_south'))
        .toBe('https://instagram.com/jermaine_from_the_south');
    });

    it('handle stored with www subdomain, no protocol', () => {
      expect(buildSocialUrl('youtube', 'www.youtube.com/@jermaine'))
        .toBe('https://www.youtube.com/@jermaine');
    });

    it('does NOT double-prefix when handle is a URL', () => {
      // The bug we're fixing: naive `https://instagram.com/${handle}` would
      // produce "https://instagram.com/https://instagram.com/foo". Verify
      // we don't regress to that.
      const result = buildSocialUrl('instagram', 'https://instagram.com/foo');
      expect(result).not.toContain('instagram.com/https://');
      expect(result).toBe('https://instagram.com/foo');
    });
  });

  describe('handle with tracking params or fragments', () => {
    it('strips query string from handle', () => {
      expect(buildSocialUrl('instagram', 'jermaine?utm_source=spotify'))
        .toBe('https://instagram.com/jermaine');
    });

    it('strips fragment from handle', () => {
      expect(buildSocialUrl('youtube', 'jermaine#about'))
        .toBe('https://youtube.com/@jermaine');
    });

    it('strips trailing slash + path from bare handle', () => {
      expect(buildSocialUrl('tiktok', 'jermaine/videos'))
        .toBe('https://tiktok.com/@jermaine');
    });
  });

  describe('urlFallback precedence', () => {
    it('uses urlFallback when provided', () => {
      expect(buildSocialUrl('youtube', 'jermaine', 'https://youtube.com/channel/UC123'))
        .toBe('https://youtube.com/channel/UC123');
    });

    it('falls through to handle when urlFallback is empty', () => {
      expect(buildSocialUrl('youtube', 'jermaine', ''))
        .toBe('https://youtube.com/@jermaine');
    });

    it('falls through to handle when urlFallback is null', () => {
      expect(buildSocialUrl('youtube', 'jermaine', null))
        .toBe('https://youtube.com/@jermaine');
    });

    it('falls through to handle when urlFallback is undefined', () => {
      expect(buildSocialUrl('youtube', 'jermaine', undefined))
        .toBe('https://youtube.com/@jermaine');
    });

    it('falls through to handle when urlFallback is not URL-shaped', () => {
      expect(buildSocialUrl('youtube', 'jermaine', 'not a url at all'))
        .toBe('https://youtube.com/@jermaine');
    });
  });

  describe('edge cases', () => {
    it('returns null for empty handle and no urlFallback', () => {
      expect(buildSocialUrl('instagram', '')).toBeNull();
      expect(buildSocialUrl('instagram', null)).toBeNull();
      expect(buildSocialUrl('instagram', undefined)).toBeNull();
    });

    it('returns null when handle is just whitespace', () => {
      expect(buildSocialUrl('instagram', '   ')).toBeNull();
    });

    it('returns null when handle is just @', () => {
      expect(buildSocialUrl('instagram', '@')).toBeNull();
    });

    it('trims whitespace from handle', () => {
      expect(buildSocialUrl('instagram', '  jermaine  '))
        .toBe('https://instagram.com/jermaine');
    });
  });
});

describe('displayHandle', () => {
  it('returns null for empty input', () => {
    expect(displayHandle(null)).toBeNull();
    expect(displayHandle(undefined)).toBeNull();
    expect(displayHandle('')).toBeNull();
  });

  it('strips @ prefix', () => {
    expect(displayHandle('@jermaine')).toBe('jermaine');
  });

  it('extracts handle from full URL', () => {
    expect(displayHandle('https://www.instagram.com/jermaine_from_the_south/'))
      .toBe('jermaine_from_the_south');
  });

  it('extracts handle from protocol-less URL', () => {
    expect(displayHandle('instagram.com/jermaine_from_the_south'))
      .toBe('jermaine_from_the_south');
  });

  it('handles YouTube /@handle format', () => {
    expect(displayHandle('https://youtube.com/@jermaine'))
      .toBe('jermaine');
  });

  it('returns bare handle unchanged', () => {
    expect(displayHandle('jermaine')).toBe('jermaine');
  });
});
