export type SpotifyArtist = {
  id: string;
  name: string;
  followers: { total: number };
  popularity: number;
  genres: string[];
  external_urls?: { spotify?: string };
  images?: Array<{ url: string; height?: number; width?: number }>;
};

export type SpotifyTrack = {
  id: string;
  name: string;
  popularity: number;
  album?: { name?: string; release_date?: string };
  preview_url?: string | null;
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
/**
 * Bigram-Jaccard name similarity. Returns 0..1.
 *
 * Why bigrams: handles substring-y matches well — "Jermaine" vs "Jermaine
 * from the South" share most of their character bigrams so similarity stays
 * high. Pure Levenshtein would penalize the length difference too hard.
 * Normalization strips non-alphanumeric chars and lowercases so
 * "Wednesday (US)" and "wednesday" map to the same shape.
 */
export function nameSimilarity(a: string, b: string): number {
  const normA = a.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normB = b.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!normA || !normB) return 0;
  if (normA === normB) return 1.0;
  // Substring containment is a strong signal — "jermaine" inside
  // "jermainefromthesouth" should score very high. Apply a floor based on
  // containment ratio before falling through to bigram Jaccard.
  if (normB.includes(normA)) return Math.max(0.85, normA.length / normB.length);
  if (normA.includes(normB)) return Math.max(0.85, normB.length / normA.length);
  // Bigram Jaccard.
  const bigramsA = new Set<string>();
  const bigramsB = new Set<string>();
  for (let i = 0; i < normA.length - 1; i++) bigramsA.add(normA.slice(i, i + 2));
  for (let i = 0; i < normB.length - 1; i++) bigramsB.add(normB.slice(i, i + 2));
  if (bigramsA.size === 0 || bigramsB.size === 0) return 0;
  let intersection = 0;
  for (const g of bigramsA) if (bigramsB.has(g)) intersection++;
  const union = bigramsA.size + bigramsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Genre overlap fraction. Returns 0..1: count of genres in `b` that appear in
 * `a` (case-insensitive, substring match), divided by max(|a|,|b|).
 * Used as a secondary signal when picking among Spotify search results.
 */
export function genreOverlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const lowerA = a.map((g) => g.toLowerCase());
  const lowerB = b.map((g) => g.toLowerCase());
  let hits = 0;
  for (const ga of lowerA) {
    if (lowerB.some((gb) => gb.includes(ga) || ga.includes(gb))) hits++;
  }
  return hits / Math.max(lowerA.length, lowerB.length);
}

/**
 * Pick the best Spotify search result given a target name + optional hints.
 * Composite scoring: 0.60 * similarity + 0.30 * genreOverlap + 0.10 * followerSignal.
 * Returns null if no candidate clears the similarity floor (default 0.5).
 *
 * Exported for testing the picker logic independently of the network call.
 */
export function pickBestMatch(
  targetName: string,
  candidates: SpotifyArtist[],
  opts: { hintGenres?: string[]; minSimilarity?: number } = {},
): SpotifyArtist | null {
  if (!candidates.length) return null;
  const floor = opts.minSimilarity ?? 0.5;
  const hintGenres = opts.hintGenres ?? [];

  // Find the maximum follower count for normalization (so the follower signal
  // is a 0..1 contribution rather than dominating with millions vs hundreds).
  const maxFollowers = Math.max(1, ...candidates.map((c) => c.followers?.total ?? 0));

  // Two-tier match: (1) exact-name matches dominate fuzzy ones regardless of
  // follower count. (2) Among non-exact matches, composite scoring decides.
  //
  // This prevents the failure mode where a fuzzy match with way more followers
  // beats an exact match: "Audrey Hobert" exact (5k followers) vs "Audrey
  // Hoberts" fuzzy (100k followers). Without the tier, the follower signal
  // (0.10 weight × 100k/100k normalized = 0.10) can overpower the similarity
  // gap. With the tier, exact match always wins among exact matches.
  const exactMatches = candidates.filter((c) => nameSimilarity(targetName, c.name) === 1.0);
  const pool = exactMatches.length > 0 ? exactMatches : candidates;

  let best: SpotifyArtist | null = null;
  let bestScore = -1;
  for (const cand of pool) {
    const sim = nameSimilarity(targetName, cand.name);
    if (sim < floor) continue;
    const genre = hintGenres.length > 0 ? genreOverlap(cand.genres ?? [], hintGenres) : 0;
    const followers = (cand.followers?.total ?? 0) / maxFollowers;  // 0..1
    const composite = 0.60 * sim + 0.30 * genre + 0.10 * followers;
    if (composite > bestScore) {
      bestScore = composite;
      best = cand;
    }
  }
  return best;
}

export async function searchArtistByName(
  name: string,
  opts: { hintGenres?: string[]; minSimilarity?: number } = {},
): Promise<SpotifyArtist | null> {
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
    return searchArtistByName(name, opts);  // one retry, preserve hints
  }
  if (!res.ok) {
    console.warn(`[HUNTER_SPOTIFY] searchArtistByName HTTP ${res.status} for "${name}"`);
    return null;
  }
  const body = await res.json() as { artists?: { items?: SpotifyArtist[] } };
  const items = body.artists?.items ?? [];
  if (items.length === 0) return null;
  // Use the composite picker. Falls back to "any result clears similarity
  // floor" — when no result clears the floor we return null rather than a
  // wrong match (the bug we're fixing: returning Jermaine-the-author when
  // the target was Jermaine-the-artist).
  return pickBestMatch(name.trim(), items, opts);
}

/**
 * Fetch the artist's top tracks from Spotify (market-scoped, default US).
 *
 * This is the most useful audio signal per candidate: each track has a
 * popularity (0-100) score that tracks streaming activity. A top track at
 * popularity 70 is a much stronger commission signal than just artist-level
 * follower count — it's "this specific song is being played a lot RIGHT NOW."
 *
 * Returns up to 10 tracks sorted by popularity desc, or null on any failure.
 * Free Spotify API tier supports this endpoint with Client Credentials.
 */
export async function getTopTracks(spotifyArtistId: string, market: string = 'US'): Promise<SpotifyTrack[] | null> {
  let token: string;
  try {
    token = await getAccessToken();
  } catch (err) {
    console.warn('[HUNTER_SPOTIFY] token fetch failed; skipping top tracks:', err);
    return null;
  }

  const url = `https://api.spotify.com/v1/artists/${encodeURIComponent(spotifyArtistId)}/top-tracks?market=${encodeURIComponent(market)}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
  } catch (err) {
    console.warn('[HUNTER_SPOTIFY] getTopTracks network error:', err);
    return null;
  }

  if (res.status === 401) {
    _resetTokenCache();
    return getTopTracks(spotifyArtistId, market);
  }
  if (!res.ok) {
    console.warn(`[HUNTER_SPOTIFY] getTopTracks HTTP ${res.status} for ${spotifyArtistId}`);
    return null;
  }

  const body = await res.json() as { tracks?: SpotifyTrack[] };
  const tracks = body.tracks ?? [];
  return tracks.slice().sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
}
