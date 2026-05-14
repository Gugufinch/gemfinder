import type { MBArtist } from '@/lib/gemfinder/hunter/musicbrainz';
import { fetchArtistDetails } from '@/lib/gemfinder/hunter/musicbrainz';
import { getArtistById, parseSpotifyArtistId, searchArtistByName, getTopTracks } from '@/lib/gemfinder/hunter/spotify';
import { scrapeWebsite } from '@/lib/gemfinder/hunter/steel';
import { getCached, putCached } from '@/lib/gemfinder/hunter/scrape-cache';
import { fetchInstagramFollowers, fetchTiktokFollowers } from '@/lib/gemfinder/hunter/social-scraping';
import type { EnrichedCandidate } from '@/lib/gemfinder/types';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type ExtractedUrls = {
  spotifyUrl?: string;
  bandcampUrl?: string;
  soundcloudUrl?: string;
  youtubeUrl?: string;
  website?: string;
  instagramHandle?: string;
  tiktokHandle?: string;
  youtubeHandle?: string;
  soundcloudHandle?: string;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Generic handle extractor: strip leading /, strip leading @, take everything
 * up to the next / or end of string. Returns undefined for empty results.
 */
function extractHandleFromUrl(url: string): string | undefined {
  try {
    const { pathname } = new URL(url);
    const stripped = pathname.replace(/^\/+/, '').replace(/^@/, '');
    const handle = stripped.split('/')[0];
    return handle.length > 0 ? handle : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Walk mbArtist.relations and pull out platform URLs + handles.
 */
function extractPlatformUrls(
  relations: MBArtist['relations'],
): ExtractedUrls {
  const result: ExtractedUrls = {};

  for (const rel of relations ?? []) {
    const resource = rel.url?.resource;
    if (!resource) continue;

    switch (rel.type) {
      case 'spotify':
        result.spotifyUrl = resource;
        break;
      case 'bandcamp':
        result.bandcampUrl = resource;
        break;
      case 'soundcloud':
        result.soundcloudUrl = resource;
        result.soundcloudHandle = extractHandleFromUrl(resource);
        break;
      case 'youtube': {
        result.youtubeUrl = resource;
        // Handle /c/name, /@name, /name patterns
        try {
          const u = new URL(resource);
          const parts = u.pathname.replace(/^\/+/, '').replace(/^@/, '').split('/');
          // skip empty segments and literal "c"
          const handle = parts.find(p => p.length > 0 && p !== 'c');
          if (handle) result.youtubeHandle = handle;
        } catch {
          // ignore
        }
        break;
      }
      case 'instagram':
        result.instagramHandle = extractHandleFromUrl(resource);
        break;
      case 'tiktok': {
        // TikTok paths are /@handle
        try {
          const { pathname } = new URL(resource);
          const stripped = pathname.replace(/^\/+/, '').replace(/^@/, '');
          const handle = stripped.split('/')[0];
          if (handle.length > 0) result.tiktokHandle = handle;
        } catch {
          // ignore
        }
        break;
      }
      case 'official homepage':
        result.website = resource;
        break;
    }
  }

  return result;
}

/**
 * Determine which URL to pass to Steel scraper, in priority order:
 * website > bandcamp > linktree > IG.
 *
 * In MB's data model, linktree URLs arrive via the `official homepage`
 * relation and land in `extracted.website` — so they're already covered
 * by the website branch above. Keeping the priority comment for spec
 * traceability; no explicit linktree scan is needed.
 */
function pickScrapeUrl(extracted: ExtractedUrls): string | undefined {
  if (extracted.website) return extracted.website;
  if (extracted.bandcampUrl) return extracted.bandcampUrl;
  if (extracted.instagramHandle) {
    return `https://instagram.com/${extracted.instagramHandle}`;
  }
  return undefined;
}

/**
 * Compute inferredRole from MB type and release groups.
 */
function computeInferredRole(
  mbArtist: MBArtist,
): EnrichedCandidate['inferredRole'] {
  const type = mbArtist.type;
  const hasReleases = (mbArtist['release-groups']?.length ?? 0) > 0;
  if ((type === 'Person' || type === 'Group') && hasReleases) return 'performer';
  return 'unknown';
}

/**
 * Compute contactReadiness from cascade of signals. First match wins.
 */
function computeContactReadiness(
  scrapedContactEmail: string | undefined,
  scrapedManagerInfo: string | undefined,
  mbTags: MBArtist['tags'],
  extracted: ExtractedUrls,
): EnrichedCandidate['contactReadiness'] {
  // Direct: scraped email OR MB tag containing 'email' or 'contact'
  if (scrapedContactEmail) return 'direct';
  const hasEmailTag = (mbTags ?? []).some((t) =>
    /email|contact/i.test(t.name)
  );
  if (hasEmailTag) return 'direct';

  // Manager / agency / booking from scraped managerInfo
  if (scrapedManagerInfo) {
    if (/Agency/i.test(scrapedManagerInfo)) return 'agency';
    if (/Booking/i.test(scrapedManagerInfo)) return 'booking';
    if (/Management|Manager/i.test(scrapedManagerInfo)) return 'manager';
  }

  // Social: any social URL present
  const hasSocial =
    extracted.instagramHandle ||
    extracted.tiktokHandle ||
    extracted.youtubeHandle ||
    extracted.soundcloudHandle ||
    extracted.bandcampUrl ||
    extracted.spotifyUrl;
  if (hasSocial) return 'social_only';

  return 'none';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function enrichCandidate(
  workspaceId: string,
  mbArtist: MBArtist,
): Promise<EnrichedCandidate> {
  // Step 0: MB search results don't include relations / release-groups / extended tags —
  // those only come from `fetchArtistDetails`. Without it, we have no Spotify URL to
  // extract → no Spotify follower data → size_cap gate can never fire → megastars
  // make it all the way through to scoring. Fetch the full record now.
  //
  // Costs ~1 sec per candidate (MB token bucket is 1 req/sec process-wide), but
  // unlocks the entire Spotify + Steel + relation-based contact pipeline.
  let fullArtist: MBArtist = mbArtist;
  if (!mbArtist.relations || !mbArtist['release-groups']) {
    if (mbArtist.id) {  // skip MB lookup for LLM-sourced candidates (empty id)
      try {
        const detailed = await fetchArtistDetails(mbArtist.id);
        if (detailed) {
          // Merge: keep the search-result data as a baseline, layer detailed fields on top.
          fullArtist = { ...mbArtist, ...detailed };
        }
      } catch (err) {
        console.warn('[HUNTER_ENRICH] fetchArtistDetails failed for', mbArtist.id, err);
        // Continue with whatever we have — degraded but not broken.
      }
    }
  }

  // From here on, use fullArtist (which has relations + release-groups).
  mbArtist = fullArtist;

  // Step 1 & 2: core MB fields + isLiving
  const isLiving = !mbArtist['life-span']?.end;

  // Step 3: recentReleaseYear
  let recentReleaseYear: number | undefined;
  for (const rg of mbArtist['release-groups'] ?? []) {
    const dateStr = rg['first-release-date'];
    if (!dateStr) continue;
    const year = parseInt(dateStr.slice(0, 4), 10);
    if (!isNaN(year) && year > 0) {
      if (recentReleaseYear === undefined || year > recentReleaseYear) {
        recentReleaseYear = year;
      }
    }
  }

  // Step 4: extract platform URLs from relations
  const extracted = extractPlatformUrls(mbArtist.relations);

  // MB genres baseline (sorted by count desc)
  const mbGenres = [...(mbArtist.tags ?? [])]
    .sort((a, b) => b.count - a.count)
    .map((t) => t.name);

  // Step 5: Spotify enrichment
  let spotifyFollowers: number | undefined;
  let spotifyPopularity: number | undefined;
  let spotifyGenres: string[] | undefined;
  let spotifyArtistId: string | undefined;

  if (extracted.spotifyUrl) {
    spotifyArtistId = parseSpotifyArtistId(extracted.spotifyUrl) ?? undefined;
    if (spotifyArtistId) {
      let sp = null;
      try {
        sp = await getArtistById(spotifyArtistId);
      } catch (err) {
        console.warn('[HUNTER_ENRICH] spotify lookup failed for', spotifyArtistId + ':', err);
      }
      if (sp) {
        spotifyFollowers = sp.followers.total;
        spotifyPopularity = sp.popularity;
        spotifyGenres = sp.genres;
      }
    }
  }

  // Fallback: MB doesn't reliably store Spotify relations (~half of MB artist
  // records lack a spotify URL even for very popular artists like Bruce
  // Springsteen). When we have no Spotify ID from MB, search by name as a
  // best-effort match. Without this, the size_cap gate can't fire for any
  // artist whose MB entry is incomplete — exactly the failure mode that
  // surfaced megastars to Greg's first hunt.
  let spotifyImageUrl: string | undefined;
  if (spotifyFollowers === undefined) {
    let sp = null;
    try {
      sp = await searchArtistByName(mbArtist.name);
    } catch (err) {
      console.warn('[HUNTER_ENRICH] spotify name search failed for', mbArtist.name + ':', err);
    }
    if (sp) {
      spotifyFollowers = sp.followers.total;
      spotifyPopularity = sp.popularity;
      spotifyGenres = sp.genres;
      spotifyArtistId = sp.id;
      spotifyImageUrl = sp.images?.[0]?.url;
    }
  }

  // Step 5b: Top tracks (Spotify Web API /artists/{id}/top-tracks). Provides
  // per-track popularity, the best "is this song hot right now" signal we have.
  // Skipped silently if no Spotify ID (artist not on Spotify or lookup failed).
  let topTracks: Array<{ name: string; popularity: number; spotifyUrl?: string; previewUrl?: string | null }> | undefined;
  if (spotifyArtistId) {
    let tt = null;
    try {
      tt = await getTopTracks(spotifyArtistId);
    } catch (err) {
      console.warn('[HUNTER_ENRICH] top tracks fetch failed for', spotifyArtistId + ':', err);
    }
    if (tt && tt.length > 0) {
      topTracks = tt.slice(0, 5).map((t) => ({
        name: t.name,
        popularity: t.popularity ?? 0,
        spotifyUrl: t.external_urls?.spotify,
        previewUrl: t.preview_url,
      }));
    }
  }

  // Genres: spotify takes precedence
  const genres: string[] = spotifyGenres ?? mbGenres;

  // Step 6: pick scrape URL
  const scrapeUrl = pickScrapeUrl(extracted);

  // Step 7: scrape (cache-first)
  let scrapedContactEmail: string | undefined;
  let scrapedManagerInfo: string | undefined;
  let scrapedToursInfo: string | undefined;

  if (scrapeUrl) {
    let scrapeResult = null;
    try {
      scrapeResult = await getCached(workspaceId, scrapeUrl);
    } catch (err) {
      console.warn('[HUNTER_ENRICH] cache lookup failed for', scrapeUrl + ':', err);
    }
    if (!scrapeResult) {
      try {
        scrapeResult = await scrapeWebsite(scrapeUrl);
      } catch (err) {
        console.warn('[HUNTER_ENRICH] scrape failed for', scrapeUrl + ':', err);
      }
      if (scrapeResult) {
        await putCached(workspaceId, scrapeUrl, scrapeResult).catch((err) =>
          console.warn('[HUNTER_ENRICH] putCached failed:', err)
        );
      }
    }
    if (scrapeResult?.extractedFields) {
      scrapedContactEmail = scrapeResult.extractedFields.contactEmail;
      scrapedManagerInfo = scrapeResult.extractedFields.managerInfo;
      scrapedToursInfo = scrapeResult.extractedFields.toursInfo;
    }
  }

  // Step 7b: social follower scraping — run IG + TikTok in parallel with a
  // 15-second timeout each so a slow scrape can't block the whole enrichment.
  let igFollowers: number | undefined;
  let ttFollowers: number | undefined;
  const socialPromises: Promise<void>[] = [];

  if (extracted.instagramHandle) {
    socialPromises.push(
      Promise.race([
        fetchInstagramFollowers(extracted.instagramHandle),
        new Promise<null>((r) => setTimeout(() => r(null), 15_000)),
      ]).then((n) => { if (typeof n === 'number') igFollowers = n; })
        .catch((err) => console.warn('[HUNTER_ENRICH] IG fetch failed:', err))
    );
  }

  if (extracted.tiktokHandle) {
    socialPromises.push(
      Promise.race([
        fetchTiktokFollowers(extracted.tiktokHandle),
        new Promise<null>((r) => setTimeout(() => r(null), 15_000)),
      ]).then((n) => { if (typeof n === 'number') ttFollowers = n; })
        .catch((err) => console.warn('[HUNTER_ENRICH] TT fetch failed:', err))
    );
  }

  await Promise.allSettled(socialPromises);

  // Step 8: inferredRole
  const inferredRole = computeInferredRole(mbArtist);

  // Step 9: contactReadiness
  const contactReadiness = computeContactReadiness(
    scrapedContactEmail,
    scrapedManagerInfo,
    mbArtist.tags,
    extracted,
  );

  const candidate: EnrichedCandidate = {
    displayName: mbArtist.name,
    musicbrainzId: mbArtist.id,
    country: mbArtist.country,
    genres,
    artistType: mbArtist.type,
    isLiving,
    recentReleaseYear,
    releaseGroupCount: mbArtist['release-groups']?.length,
    spotifyUrl: extracted.spotifyUrl,
    spotifyArtistId,
    bandcampUrl: extracted.bandcampUrl,
    soundcloudHandle: extracted.soundcloudHandle,
    instagramHandle: extracted.instagramHandle,
    tiktokHandle: extracted.tiktokHandle,
    youtubeHandle: extracted.youtubeHandle,
    website: extracted.website,
    spotifyFollowers,
    spotifyPopularity,
    spotifyGenres,
    topTracks,
    spotifyImageUrl,
    scrapedContactEmail,
    scrapedManagerInfo,
    scrapedToursInfo,
    inferredRole,
    contactReadiness,
    // Pass the LLM rationale through (if any) so the review card has a
    // "why this artist?" line. MB-sourced candidates don't have a hint
    // and end up undefined.
    aiSummary: mbArtist._aiHint,
  };

  return candidate;
}
