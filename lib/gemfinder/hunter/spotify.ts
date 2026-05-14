export type SpotifyArtist = {
  id: string;
  name: string;
  followers: { total: number };
  popularity: number;
  genres: string[];
  external_urls?: { spotify?: string };
};

type TokenCache = { token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

// For tests
export function _resetTokenCache(): void {
  tokenCache = null;
}

export async function getAccessToken(): Promise<string> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId) throw new Error('[HUNTER_SPOTIFY] SPOTIFY_CLIENT_ID not set');
  if (!clientSecret) throw new Error('[HUNTER_SPOTIFY] SPOTIFY_CLIENT_SECRET not set');

  // Return cached token if still valid (with 60s buffer)
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`[HUNTER_SPOTIFY] token exchange HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const body = await res.json() as { access_token: string; expires_in: number };
  tokenCache = {
    token: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
  return body.access_token;
}

export async function getArtistById(spotifyArtistId: string): Promise<SpotifyArtist | null> {
  let token: string;
  try {
    token = await getAccessToken();
  } catch (err) {
    console.warn('[HUNTER_SPOTIFY] token fetch failed; skipping enrichment:', err);
    return null;
  }

  const url = `https://api.spotify.com/v1/artists/${encodeURIComponent(spotifyArtistId)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
  } catch (err) {
    console.warn('[HUNTER_SPOTIFY] network error:', err);
    return null;
  }

  if (res.status === 401) {
    // Token may have expired between cache check and call
    _resetTokenCache();
    return getArtistById(spotifyArtistId); // one retry with fresh token
  }
  if (res.status === 404) return null;
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('Retry-After') || '5', 10);
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    const retryRes = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!retryRes.ok) return null;
    return await retryRes.json() as SpotifyArtist;
  }
  if (!res.ok) {
    console.warn(`[HUNTER_SPOTIFY] artist fetch HTTP ${res.status} for ${spotifyArtistId}`);
    return null;
  }

  return await res.json() as SpotifyArtist;
}

// Extract Spotify artist ID from a Spotify URL like
// https://open.spotify.com/artist/XYZ?si=abc
export function parseSpotifyArtistId(url: string): string | null {
  const m = /^https?:\/\/open\.spotify\.com\/artist\/([a-zA-Z0-9]+)(?:\?.*)?$/.exec(url);
  return m ? m[1] : null;
}

/**
 * Search Spotify by artist name and return the highest-popularity match.
 *
 * Used as a fallback in enrichment when MusicBrainz doesn't have a Spotify
 * relation for the candidate (which is common — MB's relation data is
 * volunteer-curated and patchy). Without this, the size_cap gate can't fire
 * for any artist whose MB record lacks a Spotify URL.
 *
 * Match strategy: take the result with the most followers. Spotify's search
 * relevance often returns covers/remix artists with the same name above the
 * canonical artist; sorting by followers is a much better signal of "the
 * artist the user means."
 *
 * Returns null on no-match or any error (network, auth, etc.) — caller
 * continues with the original (undefined) follower data.
 */
export async function searchArtistByName(name: string): Promise<SpotifyArtist | null> {
  if (!name || !name.trim()) return null;
  let token: string;
  try {
    token = await getAccessToken();
  } catch (err) {
    console.warn('[HUNTER_SPOTIFY] token fetch failed; skipping name search:', err);
    return null;
  }
  const q = encodeURIComponent(name.trim());
  const url = `https://api.spotify.com/v1/search?q=${q}&type=artist&limit=20`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
  } catch (err) {
    console.warn('[HUNTER_SPOTIFY] searchArtistByName network error:', err);
    return null;
  }
  if (res.status === 401) {
    _resetTokenCache();
    return searchArtistByName(name);  // one retry
  }
  if (!res.ok) {
    console.warn(`[HUNTER_SPOTIFY] searchArtistByName HTTP ${res.status} for "${name}"`);
    return null;
  }
  const body = await res.json() as { artists?: { items?: SpotifyArtist[] } };
  const items = body.artists?.items ?? [];
  if (items.length === 0) return null;
  // Sort by followers desc; return the top — best heuristic for "the canonical
  // artist Spotify has for this name" when relevance scoring puts cover/remix
  // accounts above the actual artist.
  items.sort((a, b) => (b.followers?.total ?? 0) - (a.followers?.total ?? 0));
  return items[0];
}
