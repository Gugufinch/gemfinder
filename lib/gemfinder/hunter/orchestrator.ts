// lib/gemfinder/hunter/orchestrator.ts
import type {
  HunterCriteria, HunterWeights, HunterRunSummary,
  EnrichedCandidate, ScoutCandidate,
} from '@/lib/gemfinder/types';
import { v4 as uuidv4 } from 'uuid';
import { searchArtists, type MBArtist } from './musicbrainz';
import { searchArtistsViaLLM } from './llm-agent';
import { enrichCandidate } from './enrichment';
import { evaluateGates } from './gates';
import { computeScore } from './scoring';
import { buildBlocklistIndex, matchAgainstIndex } from '@/lib/gemfinder/scout-blocklist';
import { buildIdentity, canonicalizeName } from '@/lib/gemfinder/scout/identity';
import { updateRunSummary, queueRunSummaryPatch, setRunStatus } from '@/lib/gemfinder/hunter-runs-store';
import { createCandidate, listKnownCanonicalNames, emitEvent } from '@/lib/gemfinder/scout-candidate-store';

export type RunPipelineInput = {
  runId: string;
  workspaceId: string;
  criteria: HunterCriteria;
  weights: HunterWeights;
  actorEmail: string;
};

const ENRICHMENT_CONCURRENCY = 8;

/**
 * Remove keys whose values are undefined / null / empty-string. Used for
 * "merge non-empty fields over existing fields" — prevents a deferred deep
 * research call from erasing good data via fields it failed to populate.
 */
function stripEmpty<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    (result as Record<string, unknown>)[k] = v;
  }
  return result;
}

/**
 * Run the full Hunter pipeline asynchronously for a single hunter_runs row.
 *
 * Phases:
 *   A. Fetch from MusicBrainz
 *   B. Enrich each candidate in parallel (concurrency=8)
 *   C. Block-check + gate each (gate failures → summary.gatedReasons)
 *   D. Score gate-passers
 *   E. Sort + take TOP N by criteria.targetCount
 *   F. Insert into scout_candidates with provenance
 *   G. Finalize run (status='complete')
 *
 * Per-candidate exceptions are isolated via try/catch — a single bad candidate
 * does not fail the whole run. Run reaches 'complete' state even with some errors.
 * Catastrophic failures (MB unreachable, schema fail, etc.) mark run 'failed'.
 */
export async function runPipeline(input: RunPipelineInput): Promise<HunterRunSummary> {
  const { runId, workspaceId, criteria, weights, actorEmail } = input;
  const summary: HunterRunSummary = {
    fetched: 0,
    skippedBlocked: 0,
    gatedOut: 0,
    scored: 0,
    added: 0,
    errors: [],
    gatedReasons: [],
  };

  // Resolved source — referenced in both Phase A (dispatch) and Phase F
  // (candidate provenance label). Lifted outside the inner try so both scopes
  // can see it.
  const source = criteria.source ?? 'llm';

  try {
    // Phase A: MusicBrainz fetch
    let mbResults: MBArtist[];
    try {
      // Memory layer: fetch names we've already touched in this workspace so
      // the LLM doesn't re-suggest them. Pre-load before the discovery call.
      // Failures degrade gracefully — empty array means "no memory, return
      // whatever you'd return normally".
      let excludeNames: string[] = [];
      if (source === 'llm') {
        try {
          excludeNames = await listKnownCanonicalNames(workspaceId, 500);
        } catch (err) {
          console.warn('[HUNTER_RUN] listKnownCanonicalNames failed (continuing without memory):', err);
        }
      }

      // Dispatch by source. 'llm' is the default in v1.1 — MusicBrainz tends to
      // return megastars regardless of offset tier; LLM-driven discovery uses
      // the model's implicit knowledge of music journalism to surface emerging
      // artists much more reliably.
      if (source === 'llm') {
        mbResults = await searchArtistsViaLLM(criteria, { excludeNames });
      } else {
        mbResults = await searchArtists(criteria);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      summary.errors.push({ stage: 'mb_fetch', message: msg });
      await setRunStatus(runId, 'failed', { errorMessage: msg });
      return summary;
    }
    summary.fetched = mbResults.length;
    await updateRunSummary(runId, { fetched: summary.fetched });

    // Shuffle MB results before enrichment.
    //
    // MusicBrainz returns results in relevance/popularity order, so the first
    // 100 hits for "rock" are megastars (Pearl Jam, Bob Dylan, etc.). With
    // concurrency=8, that means our first 8 parallel enrichments are wasted
    // on bands we can't engage. Shuffling spreads the candidate diversity
    // across the run, so the early progress signals are more representative
    // of what we'll actually surface. Fisher–Yates in place.
    for (let i = mbResults.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [mbResults[i], mbResults[j]] = [mbResults[j], mbResults[i]];
    }

    // Audit #6: prefetch the workspace's blocklist ONCE before the loop so
    // each candidate's isBlocked check is O(1) sync instead of ~16 pg
    // round-trips. For a 100-candidate run this collapses ~1700 queries
    // into 3. Built outside the concurrency loop so all workers share it.
    const blocklistIndex = await buildBlocklistIndex(workspaceId);

    // Phases B + C + D: enrich each candidate with concurrency, then gate + score
    type ScoredCandidate = {
      enriched: EnrichedCandidate;
      finalScore: number;
      perDimension: Record<string, number>;
    };
    const scored: ScoredCandidate[] = [];

    // Concurrency-bounded loop
    const queue = [...mbResults];
    const inFlight: Promise<void>[] = [];
    while (queue.length > 0 || inFlight.length > 0) {
      while (inFlight.length < ENRICHMENT_CONCURRENCY && queue.length > 0) {
        const mb = queue.shift()!;
        const task = (async () => {
          try {
            // PHASE C (light enrichment): skip the deep-research Gemini call to
            // save quota. Spotify lookup + IG/TT scrape + MB enrichment are fast
            // and cheap; deep research is the expensive Gemini call we defer
            // to Phase D where it only runs on the top-N survivors after scoring.
            const enriched = await enrichCandidate(workspaceId, mb, { skipDeepResearch: true, runId });
            const identity = buildIdentity({
              displayName: enriched.displayName,
              spotifyArtistId: enriched.spotifyArtistId,
              instagramHandle: enriched.instagramHandle,
              tiktokHandle: enriched.tiktokHandle,
              primaryEmail: enriched.scrapedContactEmail,
            });
            const blockResult = matchAgainstIndex(blocklistIndex, identity);
            if (blockResult.blocked) {
              summary.skippedBlocked++;
              return;
            }
            const gate = evaluateGates(enriched, weights, blockResult, criteria);
            if (!gate.pass) {
              summary.gatedOut++;
              summary.gatedReasons.push({ candidateName: enriched.displayName, reason: gate.reason });
              return;
            }
            const score = computeScore(enriched, weights);
            // Score floor: reject low-scoring candidates. Default 35 (low enough
            // to let through candidates that lack IG/TT scrape data — those dims
            // hit missing_baseline=50, dragging the weighted average down even
            // for legit emerging artists). Operators can tune per-run via
            // criteria.minScore.
            const MIN_SCORE_FLOOR = typeof criteria.minScore === 'number' ? criteria.minScore : 35;
            if (score.final < MIN_SCORE_FLOOR) {
              summary.gatedOut++;
              summary.gatedReasons.push({
                candidateName: enriched.displayName,
                reason: `low_score:${score.final}`,
              });
              return;
            }
            scored.push({ enriched, finalScore: score.final, perDimension: score.perDimension });
            summary.scored++;
          } catch (err) {
            summary.errors.push({
              candidateName: mb.name,
              stage: 'enrich_or_score',
              message: err instanceof Error ? err.message : String(err),
            });
          } finally {
            // Audit #7: debounced queue replaces per-candidate fire-and-forget
            // writes. The hot loop's ~100 calls coalesce into ~5 pg writes
            // (one per 500ms window), so the connection pool isn't hammered
            // and the UI's 2s poll still sees fresh-ish numbers. The phase-
            // boundary `await updateRunSummary` below force-flushes pending
            // patches before continuing, so no progress is lost.
            queueRunSummaryPatch(runId, {
              skippedBlocked: summary.skippedBlocked,
              gatedOut: summary.gatedOut,
              gatedReasons: summary.gatedReasons,
              scored: summary.scored,
              errors: summary.errors,
            });
          }
        })();
        inFlight.push(task);
        task.then(() => {
          const idx = inFlight.indexOf(task);
          if (idx >= 0) inFlight.splice(idx, 1);
        });
      }
      if (inFlight.length > 0) {
        await Promise.race(inFlight);
      }
    }
    await updateRunSummary(runId, {
      skippedBlocked: summary.skippedBlocked,
      gatedOut: summary.gatedOut,
      gatedReasons: summary.gatedReasons,
      scored: summary.scored,
    });

    // Phase E: sort + top N
    scored.sort((a, b) => b.finalScore - a.finalScore);
    const topN = scored.slice(0, criteria.targetCount);

    // Phase E summary event — marks the boundary the operator was getting
    // stuck on (47 scored, 0 added, status still 'running'). Surfaces who
    // made the cut so the activity log explains the silence between scoring
    // and the queue inserts.
    void emitEvent({
      workspaceId,
      runId,
      phase: 'meta',
      status: 'success',
      message: `Scoring complete — picking top ${topN.length} of ${scored.length} for deep research`,
      data: {
        scoredCount: scored.length,
        survivorCount: topN.length,
        topSurvivors: topN.slice(0, 10).map((sc) => ({
          name: sc.enriched.displayName,
          score: sc.finalScore,
        })),
      },
    });

    // Phase E.5: DEEP RESEARCH (deferred from Phase C). Now that we know which
    // candidates actually made the cut, run the expensive Gemini grounded
    // research call on JUST these survivors. Saves 60-80% of Gemini quota vs
    // the old "research everyone" approach. Cached for 30 days so re-runs are
    // free. Failures degrade gracefully — candidate keeps its Phase-C data.
    void emitEvent({
      workspaceId,
      runId,
      phase: 'meta',
      status: 'started',
      message: `Phase E.5: running deep research on ${topN.length} survivors`,
    });

    // Batch progress tracking. Phase E.5 fires N parallel enrichCandidate
    // calls; each candidate emits its own per-phase events, but without a
    // batch-level "X of N complete" event the operator stares at the activity
    // log watching unrelated candidates churn and can't tell how close the
    // run is to done. We emit a meta:success progress event every N
    // candidates (or at completion) so the timeline reads "Phase E.5: 12 / 25
    // researched" updates.
    let deepResearchDone = 0;
    const total = topN.length;
    const PROGRESS_INTERVAL = Math.max(1, Math.floor(total / 5));  // 5 progress ticks across the batch, min 1
    const reportProgress = () => {
      deepResearchDone++;
      // Fire on every PROGRESS_INTERVAL hit OR on the final candidate.
      if (deepResearchDone % PROGRESS_INTERVAL === 0 || deepResearchDone === total) {
        void emitEvent({
          workspaceId,
          runId,
          phase: 'meta',
          status: 'success',
          message: `Phase E.5 progress: ${deepResearchDone} / ${total} researched`,
          data: { done: deepResearchDone, total },
        });
      }
    };

    const deepResearchPromises = topN.map(async (sc) => {
      try {
        // Re-enrich WITH deep research; merge new findings into the existing
        // sc.enriched. enrichCandidate hits caches for Spotify + Steel so this
        // is fast (~5s mostly waiting on the Gemini deep-research call).
        const mb = {
          id: sc.enriched.musicbrainzId || '',
          name: sc.enriched.displayName,
          tags: (sc.enriched.genres || []).map((g) => ({ name: g, count: 1 })),
        };
        const deepEnriched = await enrichCandidate(workspaceId, mb, { skipDeepResearch: false, runId });
        // Merge: take whatever deep-research added on top of existing fields.
        sc.enriched = { ...sc.enriched, ...stripEmpty(deepEnriched) };
      } catch (err) {
        // Deep research on this survivor failed — most likely 'not-a-recording-artist'.
        // Record the gated reason but DON'T drop the candidate (they're already
        // in the top-N, the operator can decide).
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[HUNTER_RUN] deferred deep research failed for ${sc.enriched.displayName}:`, msg);
        summary.errors.push({
          candidateName: sc.enriched.displayName,
          stage: 'deferred_deep_research',
          message: msg,
        });
      } finally {
        // Increment + maybe-emit AFTER the candidate finishes (success or
        // failure both count toward "we got through this one"). finally
        // guarantees progress fires even if the try block re-throws.
        reportProgress();
      }
    });
    await Promise.allSettled(deepResearchPromises);

    // Phase F: insert each into scout_candidates
    for (const sc of topN) {
      try {
        const now = new Date().toISOString();
        const candidate: ScoutCandidate = {
          id: uuidv4(),
          workspaceId,
          displayName: sc.enriched.displayName,
          canonicalName: canonicalizeName(sc.enriched.displayName),
          aliases: [],
          extraLinks: [],
          genres: sc.enriched.genres,
          locations: sc.enriched.country ? [sc.enriched.country] : [],
          hitTracks: [],
          enrichmentStatus: sc.enriched.scrapedContactEmail ? 'complete' : 'partial',
          identityOverride: false,
          addedBy: actorEmail,
          // Tag with the actual source that produced this candidate.
          // Was hardcoded to 'musicbrainz' which made LLM-sourced candidates
          // look like MB candidates in the UI — a confusing labeling lie.
          source: source === 'llm' ? 'agent:hunter:llm' : 'agent:hunter:musicbrainz',
          createdAt: now,
          updatedAt: now,
          spotifyUrl: sc.enriched.spotifyUrl,
          spotifyArtistId: sc.enriched.spotifyArtistId,
          instagramHandle: sc.enriched.instagramHandle,
          tiktokHandle: sc.enriched.tiktokHandle,
          youtubeHandle: sc.enriched.youtubeHandle,
          soundcloudHandle: sc.enriched.soundcloudHandle,
          bandcampUrl: sc.enriched.bandcampUrl,
          musicbrainzId: sc.enriched.musicbrainzId,
          primaryGenre: sc.enriched.genres[0],
          primaryEmail: sc.enriched.scrapedContactEmail,
          // 'social_only' and 'none' have no contactType analog in ScoutContactType — store undefined.
          contactType: sc.enriched.contactReadiness === 'direct' ? 'direct'
                      : sc.enriched.contactReadiness === 'manager' ? 'manager'
                      : sc.enriched.contactReadiness === 'agency' ? 'agency'
                      : sc.enriched.contactReadiness === 'booking' ? 'booking'
                      : undefined,
          artistRole: sc.enriched.inferredRole === 'curator' ? 'curator' : 'performer',
          aiSummary: sc.enriched.aiSummary,  // "why this artist?" line from LLM rationale
          // Surface enrichment metrics for the review card. Note: we put
          // spotifyFollowers into spotifyMonthlyListeners as the closest
          // existing column — Spotify Web API exposes followers, not monthly
          // listeners (that requires scraping the artist page). Future v1.3
          // may split into dedicated columns.
          spotifyMonthlyListeners: sc.enriched.spotifyFollowers,
          instagramFollowers: sc.enriched.instagramFollowers,
          tiktokFollowers: sc.enriched.tiktokFollowers,
          youtubeSubscribers: sc.enriched.youtubeSubscribers,
          soundcloudFollowers: sc.enriched.soundcloudFollowers,
          score: sc.finalScore,
          // weightSnapshot is JSONB — piggy-back top tracks + image alongside
          // the per-dimension scores so the UI card has audio metadata without
          // requiring a new DB column. Field names are prefixed _ to denote
          // "not a real dimension, surface data".
          weightSnapshot: {
            ...sc.perDimension,
            ...(sc.enriched.topTracks ? { _topTracks: sc.enriched.topTracks } : {}),
            ...(sc.enriched.spotifyImageUrl ? { _imageUrl: sc.enriched.spotifyImageUrl } : {}),
          },
          hunterRunId: runId,
        };
        await createCandidate(candidate);
        summary.added++;
        // Per-insert event so the operator sees candidates landing in the queue
        // live, instead of staring at "Added: 0" until Phase F finishes the
        // whole loop. Tagged with score so the timeline reads as a leaderboard.
        void emitEvent({
          workspaceId,
          runId,
          candidateId: candidate.id,
          phase: 'meta',
          status: 'success',
          message: `✓ Added "${candidate.displayName}" to queue (score ${Math.round(sc.finalScore)})`,
          data: {
            score: sc.finalScore,
            primaryGenre: candidate.primaryGenre,
            spotifyArtistId: candidate.spotifyArtistId,
          },
        });
      } catch (err) {
        summary.errors.push({
          candidateName: sc.enriched.displayName,
          stage: 'insert',
          message: err instanceof Error ? err.message : String(err),
        });
        void emitEvent({
          workspaceId,
          runId,
          phase: 'meta',
          status: 'failed',
          message: `Insert failed for "${sc.enriched.displayName}": ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
    await updateRunSummary(runId, { added: summary.added, errors: summary.errors });

    // Closing capstone event — gives the activity log a clear "we're done"
    // marker even if the run summary stats below don't immediately update
    // in the UI (status flip + summary write happen in quick succession).
    void emitEvent({
      workspaceId,
      runId,
      phase: 'meta',
      status: 'success',
      message: `🏁 Run complete: ${summary.added} added · ${summary.gatedOut} gated · ${summary.skippedBlocked} blocked · ${summary.errors.length} errors`,
      data: {
        added: summary.added,
        gatedOut: summary.gatedOut,
        skippedBlocked: summary.skippedBlocked,
        errors: summary.errors.length,
      },
    });

    // Phase G: finalize
    await setRunStatus(runId, 'complete');
    return summary;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[HUNTER_RUN] pipeline crashed', { runId, error: msg });
    // Nested guard: if the DB is hosed enough that even setRunStatus fails,
    // we still want to surface the ORIGINAL crash to the caller. Without this
    // guard, a setRunStatus throw would mask the real error and the run row
    // would be stuck in 'running' state forever.
    try {
      await setRunStatus(runId, 'failed', { errorMessage: msg });
    } catch (statusErr) {
      console.warn('[HUNTER_RUN] failed to mark run as failed; run row may be stuck in running state', { runId, statusErr });
    }
    throw err;
  }
}
