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
import { isBlocked } from '@/lib/gemfinder/scout-blocklist';
import { buildIdentity, canonicalizeName } from '@/lib/gemfinder/scout/identity';
import { updateRunSummary, setRunStatus } from '@/lib/gemfinder/hunter-runs-store';
import { createCandidate } from '@/lib/gemfinder/scout-candidate-store';

export type RunPipelineInput = {
  runId: string;
  workspaceId: string;
  criteria: HunterCriteria;
  weights: HunterWeights;
  actorEmail: string;
};

const ENRICHMENT_CONCURRENCY = 8;

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
      // Dispatch by source. 'llm' is the default in v1.1 — MusicBrainz tends to
      // return megastars regardless of offset tier; LLM-driven discovery uses
      // the model's implicit knowledge of music journalism to surface emerging
      // artists much more reliably.
      if (source === 'llm') {
        mbResults = await searchArtistsViaLLM(criteria);
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
            const enriched = await enrichCandidate(workspaceId, mb);
            const identity = buildIdentity({
              displayName: enriched.displayName,
              spotifyArtistId: enriched.spotifyArtistId,
              instagramHandle: enriched.instagramHandle,
              tiktokHandle: enriched.tiktokHandle,
              primaryEmail: enriched.scrapedContactEmail,
            });
            const blockResult = await isBlocked(workspaceId, identity);
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
            // Hard score floor: reject candidates that score under 50. Below
            // this they're noise (genre mismatch + missing data + low followers).
            // Surface the score in the gated_reasons so the operator can see WHY.
            const MIN_SCORE_FLOOR = 50;
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
            // Fire-and-forget incremental progress write so the UI poll shows
            // live numbers instead of sitting on "fetched 100, scored 0" for the
            // entire enrichment phase. Per-candidate write is 100 small JSONB
            // patches over the run — cheap, and worth it for the UX.
            void updateRunSummary(runId, {
              skippedBlocked: summary.skippedBlocked,
              gatedOut: summary.gatedOut,
              gatedReasons: summary.gatedReasons,
              scored: summary.scored,
              errors: summary.errors,
            }).catch((err) => console.warn('[HUNTER_RUN] incremental progress write failed:', err));
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
          score: sc.finalScore,
          weightSnapshot: sc.perDimension,
          hunterRunId: runId,
        };
        await createCandidate(candidate);
        summary.added++;
      } catch (err) {
        summary.errors.push({
          candidateName: sc.enriched.displayName,
          stage: 'insert',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    await updateRunSummary(runId, { added: summary.added, errors: summary.errors });

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
