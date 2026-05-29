// lib/gemfinder/scout/social-urls.ts
//
// Build canonical social-platform URLs from inputs of varying shape.
//
// Why this exists: the Scout candidate schema stores both "handle" and "url"
// for several platforms (YouTube, SoundCloud). The Hunter pipeline's deep
// research returns LLM-extracted handles that can come through as ANY of:
//   - "@jermaine_from_the_south"        (canonical handle, with @)
//   - "jermaine_from_the_south"         (canonical handle, no @)
//   - "https://www.instagram.com/jermaine_from_the_south/"  (full URL)
//   - "instagram.com/jermaine_from_the_south"               (no protocol)
//   - "jermaine_from_the_south?utm_source=spotify"          (with tracking)
//
// Concatenating `https://instagram.com/${handle}` naively produces broken
// URLs like "https://instagram.com/https://instagram.com/...". This module
// detects whether the input is a URL vs handle and produces a working URL
// in both cases.

export type SocialPlatform = 'instagram' | 'tiktok' | 'youtube' | 'soundcloud' | 'bandcamp' | 'spotify';

// Canonical URL prefix per platform. YouTube uses /@handle, others use /handle.
const PLATFORM_HOSTS: Record<SocialPlatform, { host: string; handlePrefix: string }> = {
  instagram:   { host: 'instagram.com',  handlePrefix: '' },
  tiktok:      { host: 'tiktok.com',     handlePrefix: '@' },
  youtube:     { host: 'youtube.com',    handlePrefix: '@' },
  soundcloud:  { host: 'soundcloud.com', handlePrefix: '' },
  bandcamp:    { host: 'bandcamp.com',   handlePrefix: '' },
  spotify:     { host: 'open.spotify.com', handlePrefix: '' },
};

/**
 * Build a canonical platform URL from a handle or URL input.
 *
 * Returns null if the input is empty/null/undefined or otherwise unusable.
 * Always returns an `https://` URL.
 *
 * Precedence:
 *   1. If `urlFallback` looks like a complete URL, use it as-is.
 *   2. If `handle` looks like a complete URL (starts with http://, https://,
 *      or contains the platform's host), use it as-is.
 *   3. Otherwise, strip @ prefix and construct `https://{host}/{prefix}{handle}`.
 */
export function buildSocialUrl(
  platform: SocialPlatform,
  handle?: string | null,
  urlFallback?: string | null,
): string | null {
  const cleanUrl = sanitizeUrlInput(urlFallback);
  if (cleanUrl) return cleanUrl;

  const cleanHandle = (handle ?? '').trim();
  if (!cleanHandle) return null;

  // Handle is itself a URL — use it as-is. We treat any input containing
  // ://  OR starting with the platform host as a URL. This catches both
  // protocol-included ("https://instagram.com/...") and protocol-less
  // ("instagram.com/...") cases that LLMs frequently emit.
  const sanitized = sanitizeUrlInput(cleanHandle);
  if (sanitized) return sanitized;

  const { host, handlePrefix } = PLATFORM_HOSTS[platform];

  // Strip leading @, whitespace, anchor (#…), or query string (?…) that
  // sometimes ride along when LLMs copy from a page. Keep the slug only.
  const slug = cleanHandle
    .replace(/^@+/, '')         // leading @
    .replace(/[/?#].*$/, '')    // anything after first /, ?, or #
    .trim();

  if (!slug) return null;

  return `https://${host}/${handlePrefix}${slug}`;
}

/**
 * Return the canonical URL if the input already looks like one (protocol-
 * included or starts with `www.` or contains a `.com/.net/.tv` etc), else
 * null. Always normalizes to `https://`.
 */
function sanitizeUrlInput(raw?: string | null): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  // Protocol-less URL like "www.instagram.com/foo" or "instagram.com/foo".
  // We treat strings starting with a domain-shape followed by a slash as
  // URL-shaped. The regex allows multiple subdomain segments (so "www.
  // youtube.com/foo" matches) and requires a TLD of 2+ chars.
  if (/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\//i.test(s)) {
    return `https://${s}`;
  }
  return null;
}

/**
 * Display label for a handle (no @ prefix, no URL prefix). Used for chip text
 * like "IG @jermaine_from_the_south" so the operator sees the bare handle
 * regardless of how the data was stored.
 */
export function displayHandle(handle?: string | null): string | null {
  const s = (handle ?? '').trim();
  if (!s) return null;
  // If it's a URL, extract the last path segment.
  if (/^https?:\/\//i.test(s) || /^[a-z0-9-]+\.[a-z]{2,}\//i.test(s)) {
    const m = s.match(/[^/?#]+(?=\/?(?:[?#].*)?$)/);
    if (m) return m[0].replace(/^@+/, '');
  }
  return s.replace(/^@+/, '');
}
