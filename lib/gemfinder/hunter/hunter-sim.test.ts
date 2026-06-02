// lib/gemfinder/hunter/hunter-sim.test.ts
//
// HUNTER SIMULATION HARNESS — "test hunts" against the REAL pipeline.
//
// This is not a unit test of one function; it runs the actual runPipeline()
// orchestrator end-to-end across several realistic scenarios, with ONLY the
// network + persistence boundary mocked:
//
//   MOCKED (the outside world):
//     - musicbrainz.searchArtists / llm-agent.searchArtistsViaLLM  (discovery)
//     - enrichment.enrichCandidate                                 (Spotify/Steel/Gemini)
//     - hunter-runs-store + scout-candidate-store                  (Postgres)
//     - scout-blocklist.buildBlocklistIndex                        (Postgres prefetch)
//
//   REAL (the logic we're actually validating):
//     - evaluateGates       — does gating make the right include/exclude calls?
//     - computeScore        — do scores rank candidates sensibly?
//     - matchAgainstIndex   — does the Audit #6 prefetched matcher block correctly?
//     - buildIdentity       — identity construction from enriched fields
//     - the whole orchestrator control flow: fetch → enrich → block → gate →
//       score → floor → sort → top-N → persist → finalize
//
// Each scenario prints a readable hunt report (visible in vitest stdout) AND
// asserts sanity invariants, so a regression shows up as a failed assertion,
// not just an eyeballed number.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock the outside world ONLY ────────────────────────────────────────────
vi.mock('./musicbrainz', () => ({ searchArtists: vi.fn() }));
vi.mock('./llm-agent', () => ({ searchArtistsViaLLM: vi.fn() }));
vi.mock('./enrichment', () => ({ enrichCandidate: vi.fn() }));

// Blocklist: keep the REAL matchAgainstIndex (Audit #6 matcher logic), but
// stub buildBlocklistIndex so we can hand it a controlled index per scenario
// without touching Postgres.
vi.mock('@/lib/gemfinder/scout-blocklist', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/gemfinder/scout-blocklist')>();
  return { ...actual, buildBlocklistIndex: vi.fn() };
});

// Persistence: collect, don't write.
vi.mock('@/lib/gemfinder/hunter-runs-store', () => ({
  updateRunSummary: vi.fn(async () => {}),
  queueRunSummaryPatch: vi.fn(),
  setRunStatus: vi.fn(async () => {}),
}));
const persisted: any[] = [];
vi.mock('@/lib/gemfinder/scout-candidate-store', () => ({
  createCandidate: vi.fn(async (c: any) => { persisted.push(c); return c; }),
  listKnownCanonicalNames: vi.fn(async () => []),
  emitEvent: vi.fn(async () => undefined),
}));

import { runPipeline } from './orchestrator';
import { DEFAULT_HUNTER_WEIGHTS } from './weights-store';
import { computeScore } from './scoring';
import * as mb from './musicbrainz';
import * as llm from './llm-agent';
import * as enr from './enrichment';
import * as runsStore from '@/lib/gemfinder/hunter-runs-store';
import * as blocklist from '@/lib/gemfinder/scout-blocklist';
import type { BlocklistIndex } from '@/lib/gemfinder/scout-blocklist';

// ─── Fixture factory: a realistic enriched candidate ────────────────────────
type ArtistOpts = {
  genres?: string[];
  country?: string;
  isLiving?: boolean;
  inferredRole?: string;
  contactReadiness?: string;
  instagramFollowers?: number;
  tiktokFollowers?: number;
  youtubeSubscribers?: number;
  soundcloudFollowers?: number;
  spotifyFollowers?: number;
  spotifyPopularity?: number;
  recentReleaseYear?: number;
  recentReleaseCount?: number;
  spotifyArtistId?: string;
};

function makeArtist(name: string, o: ArtistOpts = {}) {
  return {
    displayName: name,
    musicbrainzId: `mb-${name}`,
    spotifyArtistId: o.spotifyArtistId ?? `sp-${name}`,
    genres: o.genres ?? ['folk', 'indie pop'],
    country: o.country ?? 'US',
    isLiving: o.isLiving ?? true,
    inferredRole: o.inferredRole ?? 'performer',
    contactReadiness: o.contactReadiness ?? 'direct',
    scrapedContactEmail: `${name.toLowerCase().replace(/\s+/g, '')}@example.com`,
    instagramHandle: `${name.toLowerCase().replace(/\s+/g, '')}`,
    tiktokHandle: `${name.toLowerCase().replace(/\s+/g, '')}`,
    instagramFollowers: o.instagramFollowers ?? 25_000,
    tiktokFollowers: o.tiktokFollowers ?? 18_000,
    youtubeSubscribers: o.youtubeSubscribers ?? 12_000,
    soundcloudFollowers: o.soundcloudFollowers ?? 4_000,
    spotifyFollowers: o.spotifyFollowers ?? 30_000,
    spotifyPopularity: o.spotifyPopularity ?? 45,
    recentReleaseYear: o.recentReleaseYear ?? 2025,
    recentReleaseCount: o.recentReleaseCount ?? 3,
  };
}

function emptyFieldMap() {
  return {
    spotify_artist_id: new Map(), musicbrainz_id: new Map(), primary_email: new Map(),
    instagram_handle: new Map(), tiktok_handle: new Map(), youtube_handle: new Map(),
    soundcloud_handle: new Map(), canonical_name: new Map(),
  };
}
function emptyIndex(): BlocklistIndex {
  return { workspaceId: 'sim-ws', candidatesByField: emptyFieldMap() as any, rejectionsByField: emptyFieldMap() as any, projects: [] };
}
// An index that blocks the given names by canonical_name (lowercased).
function indexBlocking(names: string[]): BlocklistIndex {
  const idx = emptyIndex();
  for (const n of names) {
    idx.rejectionsByField.canonical_name.set(n.toLowerCase(), {
      id: `rej-${n}`, displayName: n, reasonCode: 'duplicate', rejectedAt: '2026-01-01T00:00:00.000Z',
    });
  }
  return idx;
}

const REPORT: string[] = [];
function report(line = '') { REPORT.push(line); }

beforeEach(() => {
  vi.clearAllMocks();
  persisted.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  // Discovery: LLM path delegates to the MB mock so a scenario only sets one.
  vi.mocked(llm.searchArtistsViaLLM).mockImplementation((c: any) => vi.mocked(mb.searchArtists)(c));
  // Default: nothing blocked.
  vi.mocked(blocklist.buildBlocklistIndex).mockResolvedValue(emptyIndex());
});

async function runHunt(opts: {
  title: string;
  artists: ReturnType<typeof makeArtist>[];
  criteria: any;
  gates?: Partial<typeof DEFAULT_HUNTER_WEIGHTS.gates>;
  blockNames?: string[];
  failNames?: string[];   // names whose enrichment throws (error isolation test)
  // Fields the DEEP-RESEARCH pass (Phase E.5, skipDeepResearch:false) reveals
  // that differ from the light Phase-C pass — e.g. { 'Late Reveal': { isLiving: false } }.
  // Lets us prove the pipeline re-scores/re-gates on the corrected data.
  deepOverrides?: Record<string, Partial<ReturnType<typeof makeArtist>>>;
}) {
  vi.mocked(mb.searchArtists).mockResolvedValue(opts.artists.map(a => ({ id: a.musicbrainzId, name: a.displayName })) as any);
  vi.mocked(enr.enrichCandidate).mockImplementation(async (_ws: any, mbArtist: any, options?: any) => {
    if (opts.failNames?.includes(mbArtist.name)) throw new Error(`enrichment boom: ${mbArtist.name}`);
    const found = opts.artists.find(a => a.displayName === mbArtist.name) ?? makeArtist(mbArtist.name);
    // The deep-research pass (skipDeepResearch === false) returns corrected data.
    const isDeepPass = options && options.skipDeepResearch === false;
    const override = opts.deepOverrides?.[mbArtist.name];
    if (isDeepPass && override) return { ...found, ...override } as any;
    return found as any;
  });
  if (opts.blockNames?.length) {
    vi.mocked(blocklist.buildBlocklistIndex).mockResolvedValue(indexBlocking(opts.blockNames));
  }
  const weights = {
    ...DEFAULT_HUNTER_WEIGHTS,
    gates: { ...DEFAULT_HUNTER_WEIGHTS.gates, ...(opts.gates ?? {}) },
  };
  const summary = await runPipeline({
    runId: `sim-${opts.title}`,
    workspaceId: 'sim-ws',
    criteria: opts.criteria,
    weights: weights as any,
    actorEmail: 'sim@songfinch.com',
  });

  // Build readable report
  const reasonCounts: Record<string, number> = {};
  for (const r of summary.gatedReasons) {
    const key = String(r.reason).split(':')[0];
    reasonCounts[key] = (reasonCounts[key] ?? 0) + 1;
  }
  report(`\n━━━ HUNT: ${opts.title} ━━━`);
  report(`  criteria: genres=${JSON.stringify(opts.criteria.genres)} target=${opts.criteria.targetCount}` +
         (opts.gates ? ` gates=${JSON.stringify(opts.gates)}` : '') +
         (opts.blockNames ? ` blocked=${opts.blockNames.length}` : ''));
  report(`  fetched=${summary.fetched}  skippedBlocked=${summary.skippedBlocked}  gatedOut=${summary.gatedOut}  scored=${summary.scored}  added=${summary.added}  errors=${summary.errors.length}`);
  if (Object.keys(reasonCounts).length) report(`  gatedReasons: ${JSON.stringify(reasonCounts)}`);
  const top = [...persisted]
    .map(c => ({ name: c.displayName, score: c.score }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 5);
  if (top.length) report(`  top added: ${top.map(t => `${t.name}(${t.score})`).join(', ')}`);
  if (summary.errors.length) report(`  errors: ${summary.errors.map((e: any) => e.message ?? e.stage).join('; ')}`);

  return { summary, persisted: [...persisted] };
}

describe('🎯 Hunter simulation — several test hunts against the real pipeline', () => {
  it('Hunt 1 — healthy folk hunt: ranks sensibly, fills target', async () => {
    const artists = [
      makeArtist('River Wells', { spotifyFollowers: 80_000, spotifyPopularity: 62, instagramFollowers: 90_000 }),
      makeArtist('Map Of Pines', { spotifyFollowers: 45_000, spotifyPopularity: 50 }),
      makeArtist('Hollow Coast', { spotifyFollowers: 12_000, spotifyPopularity: 38 }),
      makeArtist('Junebug Lane', { spotifyFollowers: 60_000, spotifyPopularity: 55, instagramFollowers: 120_000 }),
      makeArtist('The Slow Tide', { spotifyFollowers: 8_000, spotifyPopularity: 30 }),
      makeArtist('Cedar & Co', { spotifyFollowers: 33_000, spotifyPopularity: 48 }),
    ];
    const { summary, persisted } = await runHunt({
      title: 'healthy-folk', artists,
      criteria: { genres: ['folk'], regions: ['US'], roleTarget: 'performer', targetCount: 4 },
    });
    expect(summary.fetched).toBe(6);
    expect(summary.added).toBe(4);                       // capped at targetCount
    expect(summary.errors).toHaveLength(0);
    // Ranking sanity: the highest-signal artist should be among those added.
    const names = persisted.map(c => c.displayName);
    expect(names).toContain('Junebug Lane');             // strongest IG + high spotify
    // All persisted scores are real numbers in [0,100].
    for (const c of persisted) {
      expect(typeof c.score).toBe('number');
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(100);
    }
  });

  it('Hunt 2 — genre gate ON: wrong-genre artists are excluded', async () => {
    const artists = [
      makeArtist('Folk One', { genres: ['folk'] }),
      makeArtist('Metal Head', { genres: ['death metal'] }),
      makeArtist('Folk Two', { genres: ['folk', 'americana'] }),
      makeArtist('Techno Bot', { genres: ['techno'] }),
    ];
    const { summary } = await runHunt({
      title: 'genre-gate', artists,
      criteria: { genres: ['folk'], regions: ['US'], roleTarget: 'performer', targetCount: 10 },
      gates: { require_genre_match: true },
    });
    expect(summary.fetched).toBe(4);
    expect(summary.gatedOut).toBeGreaterThanOrEqual(2);   // metal + techno gated
    expect(summary.gatedReasons.some(r => r.reason === 'genre_mismatch')).toBe(true);
    expect(summary.added).toBe(2);                        // only the two folk acts
  });

  it('Hunt 3 — all blocked: skippedBlocked == fetched, nothing added (Audit #6 matcher)', async () => {
    const artists = ['Dup A', 'Dup B', 'Dup C'].map(n => makeArtist(n));
    const { summary } = await runHunt({
      title: 'all-blocked', artists,
      criteria: { genres: ['folk'], regions: ['US'], roleTarget: 'performer', targetCount: 5 },
      blockNames: ['Dup A', 'Dup B', 'Dup C'],
    });
    expect(summary.fetched).toBe(3);
    expect(summary.skippedBlocked).toBe(3);
    expect(summary.added).toBe(0);
    // Confirm the Audit #6 prefetch ran exactly once for the whole batch.
    expect(vi.mocked(blocklist.buildBlocklistIndex)).toHaveBeenCalledTimes(1);
  });

  it('Hunt 4 — score floor: weak-signal artists filtered below MIN_SCORE_FLOOR', async () => {
    const artists = [
      makeArtist('Strong Act', { spotifyFollowers: 90_000, spotifyPopularity: 70, instagramFollowers: 150_000, tiktokFollowers: 200_000 }),
      makeArtist('Ghost Act', {  // almost no signal anywhere
        spotifyFollowers: 0, spotifyPopularity: 0, instagramFollowers: 0, tiktokFollowers: 0,
        youtubeSubscribers: 0, soundcloudFollowers: 0, contactReadiness: 'none',
      }),
    ];
    const { summary, persisted } = await runHunt({
      title: 'score-floor', artists,
      criteria: { genres: ['folk'], regions: ['US'], roleTarget: 'performer', targetCount: 5, minScore: 35 },
    });
    expect(summary.added).toBe(1);
    expect(persisted[0].displayName).toBe('Strong Act');
    expect(summary.gatedReasons.some(r => String(r.reason).startsWith('low_score'))).toBe(true);
  });

  it('Hunt 5 — living gate: deceased artists excluded', async () => {
    const artists = [
      makeArtist('Alive Now', { isLiving: true }),
      makeArtist('Late Legend', { isLiving: false }),
    ];
    const { summary } = await runHunt({
      title: 'living-gate', artists,
      criteria: { genres: ['folk'], regions: ['US'], roleTarget: 'performer', targetCount: 5 },
      gates: { require_living: true },
    });
    expect(summary.gatedReasons.some(r => r.reason === 'deceased')).toBe(true);
    expect(summary.added).toBe(1);
  });

  it('Hunt 6 — large batch (100): one prefetch, debounced progress (Audit #6 + #7)', async () => {
    const artists = Array.from({ length: 100 }, (_, i) =>
      makeArtist(`Batch Artist ${i}`, { spotifyFollowers: 10_000 + i * 500, spotifyPopularity: 30 + (i % 50) }));
    const { summary } = await runHunt({
      title: 'large-batch-100', artists,
      criteria: { genres: ['folk'], regions: ['US'], roleTarget: 'performer', targetCount: 25 },
    });
    expect(summary.fetched).toBe(100);
    expect(summary.added).toBe(25);
    // Audit #6: blocklist prefetched exactly ONCE for all 100, not per-candidate.
    expect(vi.mocked(blocklist.buildBlocklistIndex)).toHaveBeenCalledTimes(1);
    // Audit #7: the per-candidate hot loop used the debounced queue, NOT the
    // awaited updateRunSummary, for incremental progress.
    expect(vi.mocked(runsStore.queueRunSummaryPatch).mock.calls.length).toBeGreaterThan(0);
  });

  it('Hunt 7 — empty discovery: 0 fetched, run completes clean', async () => {
    const { summary } = await runHunt({
      title: 'empty', artists: [],
      criteria: { genres: ['nonexistent genre'], regions: ['US'], roleTarget: 'performer', targetCount: 5 },
    });
    expect(summary.fetched).toBe(0);
    expect(summary.added).toBe(0);
    expect(summary.errors).toHaveLength(0);
    expect(vi.mocked(runsStore.setRunStatus).mock.calls.at(-1)?.[1]).toBe('complete');
  });

  it('Hunt 8 — partial enrichment failures are isolated, run still completes', async () => {
    const artists = ['Good 1', 'Bad Apple', 'Good 2', 'Good 3'].map(n => makeArtist(n));
    const { summary } = await runHunt({
      title: 'partial-failure', artists,
      criteria: { genres: ['folk'], regions: ['US'], roleTarget: 'performer', targetCount: 5 },
      failNames: ['Bad Apple'],
    });
    expect(summary.errors.length).toBeGreaterThanOrEqual(1);
    expect(summary.added).toBe(3);                        // the 3 good ones still land
    expect(vi.mocked(runsStore.setRunStatus).mock.calls.at(-1)?.[1]).toBe('complete');
  });

  it('Hunt 9 — deep research reveals a survivor is DECEASED → re-gated out, not inserted (Fix #1)', async () => {
    // All three pass the light Phase-C pass (alive). Deep research (Phase E.5)
    // then reveals "Late Reveal" is deceased. With require_living on, the
    // post-merge re-gate must exclude it — the bug was that gates never re-ran
    // after the deep-research merge, so deceased artists got inserted anyway.
    const artists = ['Alive One', 'Late Reveal', 'Alive Two'].map(n => makeArtist(n));
    const { summary, persisted } = await runHunt({
      title: 'deep-reveals-deceased', artists,
      criteria: { genres: ['folk'], regions: ['US'], roleTarget: 'performer', targetCount: 5 },
      gates: { require_living: true },
      deepOverrides: { 'Late Reveal': { isLiving: false } },
    });
    const names = persisted.map(c => c.displayName);
    expect(names).not.toContain('Late Reveal');   // re-gated out post-deep-research
    expect(names).toContain('Alive One');
    expect(names).toContain('Alive Two');
    expect(summary.added).toBe(2);
  });

  it('Hunt 10 — deep research corrects data → inserted score reflects the MERGED data, not stale Phase-C (Fix #1)', async () => {
    // Light pass: weak signal. Deep research reveals much stronger numbers.
    // The score stored on the inserted candidate must be computed on the
    // MERGED data — the bug stored the stale Phase-C score.
    const light = makeArtist('Sleeper Hit', { spotifyFollowers: 1_000, spotifyPopularity: 20, instagramFollowers: 500, tiktokFollowers: 0, youtubeSubscribers: 0, soundcloudFollowers: 0 });
    const override = { spotifyFollowers: 90_000, spotifyPopularity: 68, instagramFollowers: 140_000, tiktokFollowers: 120_000 };
    const expectedMerged = computeScore({ ...light, ...override } as any, DEFAULT_HUNTER_WEIGHTS).final;
    const expectedStale = computeScore(light as any, DEFAULT_HUNTER_WEIGHTS).final;
    // Sanity: the fixtures must actually move the score, else the test proves nothing.
    expect(expectedMerged).not.toBe(expectedStale);

    const { persisted } = await runHunt({
      title: 'deep-rescore', artists: [light],
      criteria: { genres: ['folk'], regions: ['US'], roleTarget: 'performer', targetCount: 5, minScore: 1 },
      deepOverrides: { 'Sleeper Hit': override },
    });
    expect(persisted).toHaveLength(1);
    expect(persisted[0].score).toBe(expectedMerged);   // not expectedStale
  });

  it('prints the full hunt report', () => {
    // Dump the accumulated report so the run is human-readable in stdout.
    console.info(['', '═══════════ HUNTER SIM REPORT ═══════════', ...REPORT, ''].join('\n'));
    expect(REPORT.length).toBeGreaterThan(0);
  });
});
