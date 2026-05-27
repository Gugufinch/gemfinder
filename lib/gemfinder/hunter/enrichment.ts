import type { MBArtist } from '@/lib/gemfinder/hunter/musicbrainz';
import { fetchArtistDetails } from '@/lib/gemfinder/hunter/musicbrainz';
import { getArtistById, parseSpotifyArtistId, searchArtistByName, getTopTracks } from '@/lib/gemfinder/hunter/spotify';
import { researchArtist } from '@/lib/gemfinder/hunter/deep-research';
import { scrapeWebsite } from '@/lib/gemfinder/hunter/steel';
import { getCached, putCached } from '@/lib/gemfinder/hunter/scrape-cache';
import { fetchInstagramFollowers, fetchTiktokFollowers } from '@/lib/gemfinder/hunter/social-scraping';
import type { EnrichedCandidate } from '@/lib/gemfinder/types';
import { emitEvent } from '@/lib/gemfinder/scout-candidate-store';
import type { HunterEventPhase, HunterEventStatus } from '@/lib/gemfinder/scout-candidate-store';

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
  options?: {
    skipDeepResearch?: boolean;
    // Observability: when set, every phase emits a hunter_events row so the UI
    // can show "what the agent did" for this enrichment. Both fields optional —
    // omitting them keeps enrichment silent (used by unit tests).
    runId?: string | null;
    candidateId?: string | null;
  },
): Promise<EnrichedCandidate> {
  // Fire-and-forget event emit — wrapped so we can keep the call sites terse
  // and never accidentally await (logging is non-critical, must never block).
  const emit = (
    phase: HunterEventPhase,
    status: HunterEventStatus,
    message: string,
    data?: Record<string, unknown>,
  ) => {
    if (!options?.runId && !options?.candidateId) return; // silent when no context
    void emitEvent({
      workspaceId,
      runId: options.runId ?? null,
      candidateId: options.candidateId ?? null,
      phase,
      status,
      message,
      data,
    });
  };

  emit('meta', 'started', `Starting enrichment for "${mbArtist.name}"`, {
    skipDeepResearch: !!options?.skipDeepResearch,
    hasMbId: !!mbArtist.id,
  });
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
      emit('mb_fetch', 'started', `Fetching MusicBrainz details for ${mbArtist.id.slice(0, 8)}…`);
      try {
        const detailed = await fetchArtistDetails(mbArtist.id);
        if (detailed) {
          // Merge: keep the search-result data as a baseline, layer detailed fields on top.
          fullArtist = { ...mbArtist, ...detailed };
          emit('mb_fetch', 'success', 'MusicBrainz returned full record', {
            relationsCount: (detailed.relations ?? []).length,
            releaseGroupsCount: (detailed['release-groups'] ?? []).length,
          });
        } else {
          emit('mb_fetch', 'success', 'MusicBrainz returned empty record', {});
        }
      } catch (err) {
        console.warn('[HUNTER_ENRICH] fetchArtistDetails failed for', mbArtist.id, err);
        emit('mb_fetch', 'failed', `MusicBrainz lookup failed: ${err instanceof Error ? err.message : String(err)}`);
        // Continue with whatever we have — degraded but not broken.
      }
    } else {
      emit('mb_fetch', 'skipped', 'No MusicBrainz ID (LLM-sourced candidate)');
    }
  }

  // From here on, use fullArtist (which has relations + release-groups).
  mbArtist = fullArtist;

  // Step 0b: DEEP RESEARCH — per-candidate Gemini call with Google Search
  // grounding. Verifies the artist is real, finds current bio + contact +
  // socials. Cached 30 days so re-runs hitting the same name are free.
  // Failures degrade gracefully.
  //
  // BUDGET OPTIMIZATION: when called with skipDeepResearch=true (Phase C
  // of the orchestrator — light enrichment for scoring purposes only),
  // skip this call entirely. The orchestrator will call enrichCandidate
  // AGAIN on the top-N survivors with skipDeepResearch=false to fill in
  // verified data only for candidates that actually make the cut. This
  // saves 60-80% of Gemini calls per hunt.
  const hintGenres = (mbArtist.tags ?? []).map((t) => t.name).slice(0, 5);
  let deep: Awaited<ReturnType<typeof researchArtist>> = null;
  if (!options?.skipDeepResearch) {
    emit('deep_research', 'started', `Verifying "${mbArtist.name}" via Gemini deep research`, {
      hintGenres,
    });
    try {
      deep = await researchArtist(workspaceId, mbArtist.name, hintGenres);
      if (deep && deep.verified === false) {
        emit('deep_research', 'failed', 'Gemini flagged name as not a recording artist', {
          verified: false,
        });
        // Gemini says this isn't a real recording artist — short-circuit. The
        // orchestrator's enrichCandidate caller catches errors and skips the
        // candidate; we throw a specific marker so the gated_reasons surface
        // says why.
        throw new Error(`[HUNTER_ENRICH] deep research flagged "${mbArtist.name}" as not-a-recording-artist`);
      }
      if (deep) {
        emit('deep_research', 'success', 'Deep research returned grounded summary', {
          verified: deep.verified,
          hasBookingEmail: !!deep.bookingEmail,
          hasManager: !!deep.managerInfo,
          summaryLength: deep.bio?.length || 0,
          hasIg: !!deep.instagramHandle,
          hasTt: !!deep.tiktokHandle,
        });
      } else {
        emit('deep_research', 'skipped', 'Deep research returned null (likely quota or no signal)');
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('not-a-recording-artist')) {
        throw err;  // re-throw so orchestrator records the gate-out
      }
      console.warn('[HUNTER_ENRICH] deep research failed for', mbArtist.name, ':', err);
      emit('deep_research', 'failed', `Deep research errored: ${err instanceof Error ? err.message : String(err)}`);
      deep = null;  // continue without enhanced data
    }
  } else {
    emit('deep_research', 'skipped', 'Skipped (light-enrichment phase)');
  }

  // Step 1 & 2: core MB fields + isLiving
  // Deep research's isLiving takes precedence when available; fall back to MB life-span.
  const isLiving = deep?.isLiving !== null && deep?.isLiving !== undefined
    ? deep.isLiving
    : !mbArtist['life-span']?.end;

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

  // Step 4: extract platform URLs from relations, then layer deep-research's
  // platform URLs on top (deep research often finds URLs MB lacks).
  const extracted = extractPlatformUrls(mbArtist.relations);
  if (deep) {
    if (!extracted.spotifyUrl && deep.spotifyUrl) extracted.spotifyUrl = deep.spotifyUrl;
    if (!extracted.bandcampUrl && deep.bandcampUrl) extracted.bandcampUrl = deep.bandcampUrl;
    if (!extracted.website && deep.website) extracted.website = deep.website;
    if (!extracted.instagramHandle && deep.instagramHandle) extracted.instagramHandle = deep.instagramHandle;
    if (!extracted.tiktokHandle && deep.tiktokHandle) extracted.tiktokHandle = deep.tiktokHandle;
    if (!extracted.youtubeHandle && deep.youtubeHandle) extracted.youtubeHandle = deep.youtubeHandle;
  }

  // MB genres baseline (sorted by count desc)
  const mbGenres = [...(mbArtist.tags ?? [])]
    .sort((a, b) => b.count - a.count)
    .map((t) => t.name);

  // Step 5: Spotify enrichment
  let spotifyFollowers: number | undefined;
  let spotifyPopularity: number | undefined;
  let spotifyGenres: string[] | undefined;
  let spotifyArtistId: string | undefined;
  let spotifyImageUrl: string | undefined;

  // Source priority for Spotify ID:
  //   1. MB relation URL (most authoritative — verified by MusicBrainz)
  //   2. LLM-cited URL (Gemini grounded its name claim with a spotify link)
  //   3. Name search fallback (last resort, can mismatch on stage names)
  //
  // The LLM URL was added when the discovery prompt started requiring
  // verifiable IDs. When present, we skip the name-search step entirely
  // and pick up a verified Spotify ID without the fuzzy-match risk.
  const spotifyUrlForLookup = extracted.spotifyUrl || mbArtist._llmSpotifyUrl;
  const spotifySourceLabel = extracted.spotifyUrl ? 'by_id (mb)' : 'by_id (llm)';

  if (spotifyUrlForLookup) {
    spotifyArtistId = parseSpotifyArtistId(spotifyUrlForLookup) ?? undefined;
    if (spotifyArtistId) {
      emit('spotify', 'started', `Looking up Spotify artist by ID: ${spotifyArtistId.slice(0, 8)}…`);
      let sp = null;
      try {
        sp = await getArtistById(spotifyArtistId);
      } catch (err) {
        console.warn('[HUNTER_ENRICH] spotify lookup failed for', spotifyArtistId + ':', err);
        emit('spotify', 'failed', `Spotify by-ID lookup failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      if (sp) {
        spotifyFollowers = sp.followers.total;
        spotifyPopularity = sp.popularity;
        spotifyGenres = sp.genres;
        spotifyImageUrl = sp.images?.[0]?.url;
        emit('spotify', 'success', `Spotify resolved by ID: ${sp.followers.total.toLocaleString()} followers, popularity ${sp.popularity}`, {
          spotifyArtistId,
          followers: sp.followers.total,
          popularity: sp.popularity,
          genres: sp.genres,
          source: spotifySourceLabel,
        });
      }
    }
  }

  // Fallback: MB doesn't reliably store Spotify relations (~half of MB artist
  // records lack a spotify URL even for very popular artists like Bruce
  // Springsteen). When we have no Spotify ID from MB, search by name as a
  // best-effort match. Without this, the size_cap gate can't fire for any
  // artist whose MB entry is incomplete — exactly the failure mode that
  // surfaced megastars to Greg's first hunt.
  if (spotifyFollowers === undefined) {
    emit('spotify', 'started', `Falling back to Spotify name search for "${mbArtist.name}"`);
    let sp = null;
    try {
      sp = await searchArtistByName(mbArtist.name);
    } catch (err) {
      console.warn('[HUNTER_ENRICH] spotify name search failed for', mbArtist.name + ':', err);
      emit('spotify', 'failed', `Spotify name search failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (sp) {
      spotifyFollowers = sp.followers.total;
      spotifyPopularity = sp.popularity;
      spotifyGenres = sp.genres;
      spotifyArtistId = sp.id;
      spotifyImageUrl = sp.images?.[0]?.url;
      emit('spotify', 'success', `Spotify matched by name: ${sp.followers.total.toLocaleString()} followers, popularity ${sp.popularity}`, {
        spotifyArtistId: sp.id,
        followers: sp.followers.total,
        popularity: sp.popularity,
        genres: sp.genres,
        hasImage: !!spotifyImageUrl,
        source: 'by_name',
      });
    } else if (!sp) {
      emit('spotify', 'skipped', `No Spotify match found for "${mbArtist.name}"`);
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
      emit('top_tracks', 'failed', `Top-tracks fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (tt && tt.length > 0) {
      topTracks = tt.slice(0, 5).map((t) => ({
        name: t.name,
        popularity: t.popularity ?? 0,
        spotifyUrl: t.external_urls?.spotify,
        previewUrl: t.preview_url,
      }));
      emit('top_tracks', 'success', `Fetched ${topTracks.length} top tracks (top: "${topTracks[0]?.name}", pop ${topTracks[0]?.popularity})`, {
        count: topTracks.length,
        topTrackName: topTracks[0]?.name,
        topTrackPopularity: topTracks[0]?.popularity,
      });
    } else if (tt !== null) {
      emit('top_tracks', 'skipped', 'Spotify returned zero top tracks');
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

  // Deep research's contact info comes BEFORE Steel scraping — it's usually
  // more reliable (Gemini reads the booking page; Steel just scrapes raw HTML).
  // Steel scrape later can overwrite if it finds something more current.
  if (deep) {
    if (deep.bookingEmail) scrapedContactEmail = deep.bookingEmail;
    if (deep.managerInfo) scrapedManagerInfo = deep.managerInfo;
  }

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
      // Only overwrite deep-research values if Steel actually found something
      // — otherwise we'd erase the better source with empty string.
      if (scrapeResult.extractedFields.contactEmail) scrapedContactEmail = scrapeResult.extractedFields.contactEmail;
      if (scrapeResult.extractedFields.managerInfo) scrapedManagerInfo = scrapeResult.extractedFields.managerInfo;
      if (scrapeResult.extractedFields.toursInfo) scrapedToursInfo = scrapeResult.extractedFields.toursInfo;
    }
  }

  // Step 7b: social follower scraping — run IG + TikTok in parallel with a
  // 15-second timeout each so a slow scrape can't block the whole enrichment.
  let igFollowers: number | undefined;
  let ttFollowers: number | undefined;
  const socialPromises: Promise<void>[] = [];

  if (extracted.instagramHandle) {
    const igHandle = extracted.instagramHandle;
    emit('ig_scrape', 'started', `Scraping IG @${igHandle}…`);
    socialPromises.push(
      Promise.race([
        fetchInstagramFollowers(igHandle),
        new Promise<null>((r) => setTimeout(() => r(null), 15_000)),
      ]).then((n) => {
        if (typeof n === 'number') {
          igFollowers = n;
          emit('ig_scrape', 'success', `IG @${igHandle}: ${n.toLocaleString()} followers`, {
            handle: igHandle,
            followers: n,
          });
        } else {
          emit('ig_scrape', 'skipped', `IG @${igHandle} returned no follower count (timeout or scrape blocked)`);
        }
      })
        .catch((err) => {
          console.warn('[HUNTER_ENRICH] IG fetch failed:', err);
          emit('ig_scrape', 'failed', `IG fetch errored: ${err instanceof Error ? err.message : String(err)}`);
        })
    );
  }

  if (extracted.tiktokHandle) {
    const ttHandle = extracted.tiktokHandle;
    emit('tt_scrape', 'started', `Scraping TikTok @${ttHandle}…`);
    socialPromises.push(
      Promise.race([
        fetchTiktokFollowers(ttHandle),
        new Promise<null>((r) => setTimeout(() => r(null), 15_000)),
      ]).then((n) => {
        if (typeof n === 'number') {
          ttFollowers = n;
          emit('tt_scrape', 'success', `TikTok @${ttHandle}: ${n.toLocaleString()} followers`, {
            handle: ttHandle,
            followers: n,
          });
        } else {
          emit('tt_scrape', 'skipped', `TikTok @${ttHandle} returned no follower count (timeout or scrape blocked)`);
        }
      })
        .catch((err) => {
          console.warn('[HUNTER_ENRICH] TT fetch failed:', err);
          emit('tt_scrape', 'failed', `TikTok fetch errored: ${err instanceof Error ? err.message : String(err)}`);
        })
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

  // Deep research's bio (grounded in real recent press) beats the discovery
  // LLM's first-pass rationale every time. Fall back to the discovery rationale.
  const finalBio = deep?.bio || mbArtist._aiHint;
  // recentReleaseYear: prefer deep research's verified value over MB's parsed
  // release-groups date (MB sometimes has stale data).
  const finalReleaseYear = deep?.recentReleaseYear ?? recentReleaseYear;
  // country: prefer deep research's normalized ISO code; fall back to MB.
  const finalCountry = deep?.country || mbArtist.country;

  const candidate: EnrichedCandidate = {
    displayName: mbArtist.name,
    musicbrainzId: mbArtist.id,
    country: finalCountry,
    genres,
    artistType: mbArtist.type,
    isLiving,
    recentReleaseYear: finalReleaseYear,
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
    instagramFollowers: igFollowers,
    tiktokFollowers: ttFollowers,
    scrapedContactEmail,
    scrapedManagerInfo,
    scrapedToursInfo,
    inferredRole,
    contactReadiness,
    aiSummary: finalBio,
    // Verification: the candidate is "unverified" when we couldn't confirm
    // they exist via ANY external source. MB ID, a successful Spotify
    // lookup (via either MB-relation OR LLM-cited URL OR name search), or
    // a successful deep-research call all count as verification. Without
    // any of these, we're trusting only the LLM's bare name claim — how
    // phantom artists like "Jermaine Butler · score 52, no Spotify ID,
    // no IG followers" end up in the queue.
    //
    // The minimumEvidenceGate uses this flag to reject before scoring.
    // spotifyArtistId being set means at least one of the three Spotify
    // paths succeeded (and Spotify confirmed the artist exists).
    unverified: !mbArtist.id && !spotifyArtistId && !deep,
  };

  emit('meta', 'success', `Enrichment complete for "${mbArtist.name}"`, {
    hasSpotify: !!spotifyArtistId,
    hasIg: typeof igFollowers === 'number',
    hasTt: typeof ttFollowers === 'number',
    hasContactEmail: !!scrapedContactEmail,
    contactReadiness,
    genreCount: genres.length,
    unverified: candidate.unverified,
  });

  return candidate;
}
