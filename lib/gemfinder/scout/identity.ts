import type { CandidateIdentity } from '@/lib/gemfinder/types';

/**
 * Canonicalize a display name for dedup comparison:
 * lowercase, strip diacritics, trim, collapse whitespace.
 * Preserves apostrophes (artist names like O'Connor).
 */
export function canonicalizeName(input: string): string {
  if (!input) return '';
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // strip diacritics (combining marks)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

type ParsedUrl = Partial<{
  spotifyUrl: string;
  spotifyArtistId: string;
  instagramHandle: string;
  tiktokHandle: string;
  youtubeHandle: string;
  youtubeUrl: string;
  soundcloudHandle: string;
  soundcloudUrl: string;
  musicbrainzId: string;
  bandcampUrl: string;
}>;

const SPOTIFY_RE = /^https?:\/\/open\.spotify\.com\/artist\/([a-zA-Z0-9]+)(?:\?.*)?$/;
const INSTAGRAM_RE = /^https?:\/\/(?:www\.)?instagram\.com\/([a-zA-Z0-9._]+)\/?(?:\?.*)?$/;
const TIKTOK_RE = /^https?:\/\/(?:www\.)?tiktok\.com\/@([a-zA-Z0-9._]+)(?:\?.*)?$/;
const YOUTUBE_HANDLE_RE = /^https?:\/\/(?:www\.)?youtube\.com\/@([a-zA-Z0-9._-]+)(?:\?.*)?$/;
const SOUNDCLOUD_RE = /^https?:\/\/(?:www\.)?soundcloud\.com\/([a-zA-Z0-9._-]+)\/?(?:\?.*)?$/;
const BANDCAMP_RE = /^https?:\/\/[a-zA-Z0-9-]+\.bandcamp\.com\/?(?:\?.*)?$/;
const MUSICBRAINZ_RE = /^https?:\/\/musicbrainz\.org\/artist\/([a-f0-9-]{36})(?:\?.*)?$/;

export function parseSpotifyUrl(url: string): ParsedUrl | null {
  const match = SPOTIFY_RE.exec(url);
  if (!match) return null;
  const spotifyArtistId = match[1];
  const canonicalUrl = `https://open.spotify.com/artist/${spotifyArtistId}`;
  return { spotifyArtistId, spotifyUrl: canonicalUrl };
}

export function parseInstagramUrl(url: string): ParsedUrl | null {
  const match = INSTAGRAM_RE.exec(url);
  if (!match) return null;
  return { instagramHandle: match[1] };
}

export function parseTiktokUrl(url: string): ParsedUrl | null {
  const match = TIKTOK_RE.exec(url);
  if (!match) return null;
  return { tiktokHandle: match[1] };
}

export function parseYoutubeUrl(url: string): ParsedUrl | null {
  const match = YOUTUBE_HANDLE_RE.exec(url);
  if (!match) return null;
  const youtubeHandle = match[1];
  return { youtubeHandle, youtubeUrl: `https://www.youtube.com/@${youtubeHandle}` };
}

export function parseSoundcloudUrl(url: string): ParsedUrl | null {
  const match = SOUNDCLOUD_RE.exec(url);
  if (!match) return null;
  const soundcloudHandle = match[1];
  return { soundcloudHandle, soundcloudUrl: `https://soundcloud.com/${soundcloudHandle}` };
}

export function parseBandcampUrl(url: string): ParsedUrl | null {
  if (!BANDCAMP_RE.test(url)) return null;
  return { bandcampUrl: url };
}

export function parseMusicbrainzUrl(url: string): ParsedUrl | null {
  const match = MUSICBRAINZ_RE.exec(url);
  if (!match) return null;
  return { musicbrainzId: match[1] };
}

/**
 * Try each parser in order; return whatever matches, or an empty object.
 */
export function parseUrl(url: string): ParsedUrl {
  if (!url) return {};
  return (
    parseSpotifyUrl(url) ||
    parseInstagramUrl(url) ||
    parseTiktokUrl(url) ||
    parseYoutubeUrl(url) ||
    parseSoundcloudUrl(url) ||
    parseBandcampUrl(url) ||
    parseMusicbrainzUrl(url) ||
    {}
  );
}

/**
 * Build a CandidateIdentity from a candidate-like input.
 * Computes canonicalName from displayName; throws if displayName is empty.
 */
export function buildIdentity(input: {
  displayName: string;
  spotifyArtistId?: string;
  musicbrainzId?: string;
  primaryEmail?: string;
  instagramHandle?: string;
  tiktokHandle?: string;
  youtubeHandle?: string;
  soundcloudHandle?: string;
  bandcampUrl?: string;
}): CandidateIdentity {
  const displayName = String(input.displayName || '').trim();
  if (!displayName) {
    throw new Error('buildIdentity: displayName is required and cannot be empty');
  }
  const canonicalName = canonicalizeName(displayName);
  return {
    displayName,
    canonicalName,
    spotifyArtistId: input.spotifyArtistId,
    musicbrainzId: input.musicbrainzId,
    primaryEmail: input.primaryEmail?.toLowerCase().trim() || undefined,
    instagramHandle: input.instagramHandle,
    tiktokHandle: input.tiktokHandle,
    youtubeHandle: input.youtubeHandle,
    soundcloudHandle: input.soundcloudHandle,
    bandcampUrl: input.bandcampUrl,
  };
}
