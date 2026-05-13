// lib/gemfinder/hunter/orchestrator.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./musicbrainz', () => ({
  searchArtists: vi.fn(),
}));
vi.mock('./enrichment', () => ({
  enrichCandidate: vi.fn(),
}));
vi.mock('./gates', () => ({
  evaluateGates: vi.fn(),
}));
vi.mock('./scoring', () => ({
  computeScore: vi.fn(),
}));
vi.mock('@/lib/gemfinder/scout-blocklist', () => ({
  isBlocked: vi.fn(),
}));
vi.mock('@/lib/gemfinder/scout/identity', () => ({
  buildIdentity: vi.fn((args: any) => ({ displayName: args.displayName, canonicalName: args.displayName.toLowerCase() })),
  canonicalizeName: vi.fn((s: string) => s.toLowerCase()),
}));
vi.mock('@/lib/gemfinder/hunter-runs-store', () => ({
  updateRunSummary: vi.fn(),
  setRunStatus: vi.fn(),
}));
vi.mock('@/lib/gemfinder/scout-candidate-store', () => ({
  createCandidate: vi.fn(async (c: any) => c),
}));

import { runPipeline } from './orchestrator';
import * as mb from './musicbrainz';
import * as enr from './enrichment';
import * as gates from './gates';
import * as scoring from './scoring';
import * as blocklist from '@/lib/gemfinder/scout-blocklist';
import * as runsStore from '@/lib/gemfinder/hunter-runs-store';
import * as candStore from '@/lib/gemfinder/scout-candidate-store';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeMbArtist(name: string, id = `mb-${name}`) {
  return { id, name };
}

function makeEnriched(displayName: string, overrides: Record<string, unknown> = {}) {
  return {
    displayName,
    musicbrainzId: `mb-${displayName}`,
    genres: ['folk'],
    country: 'US',
    isLiving: true,
    inferredRole: 'performer',
    contactReadiness: 'direct',
    scrapedContactEmail: `${displayName.toLowerCase()}@example.com`,
    ...overrides,
  };
}

const BASE_INPUT = {
  runId: 'test-run-id',
  workspaceId: 'ws-1',
  criteria: { genres: ['folk'], regions: ['US'], roleTarget: 'performer' as const, targetCount: 5 },
  weights: {} as any,
  actorEmail: 'agent@test.com',
};

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  // Default: isBlocked returns not-blocked
  vi.mocked(blocklist.isBlocked).mockResolvedValue({ blocked: false });

  // Default: gates pass
  vi.mocked(gates.evaluateGates).mockReturnValue({ pass: true });

  // Default: compute score
  vi.mocked(scoring.computeScore).mockReturnValue({ final: 50, perDimension: {} });

  // Default: updateRunSummary and setRunStatus no-op
  vi.mocked(runsStore.updateRunSummary).mockResolvedValue(undefined);
  vi.mocked(runsStore.setRunStatus).mockResolvedValue(undefined);

  // Default: createCandidate echoes input
  vi.mocked(candStore.createCandidate).mockImplementation(async (c: any) => c);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('runPipeline', () => {
  it('1. happy path smoke: 3 results, none blocked, all pass, all inserted', async () => {
    const artists = ['Alice', 'Bob', 'Carol'].map(n => makeMbArtist(n));
    vi.mocked(mb.searchArtists).mockResolvedValue(artists);
    vi.mocked(enr.enrichCandidate).mockImplementation(async (_ws, a) => makeEnriched(a.name) as any);

    const summary = await runPipeline(BASE_INPUT);

    expect(summary.fetched).toBe(3);
    expect(summary.skippedBlocked).toBe(0);
    expect(summary.gatedOut).toBe(0);
    expect(summary.scored).toBe(3);
    expect(summary.added).toBe(3);
    expect(summary.errors).toHaveLength(0);

    const statusCall = vi.mocked(runsStore.setRunStatus).mock.calls.at(-1);
    expect(statusCall?.[1]).toBe('complete');
  });

  it('2. MB fetch throws → setRunStatus failed, summary has mb_fetch error, does NOT throw', async () => {
    vi.mocked(mb.searchArtists).mockRejectedValue(new Error('network down'));

    const summary = await runPipeline(BASE_INPUT);

    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0].stage).toBe('mb_fetch');
    expect(summary.errors[0].message).toContain('network down');

    const calls = vi.mocked(runsStore.setRunStatus).mock.calls;
    const failedCall = calls.find(c => c[1] === 'failed');
    expect(failedCall).toBeDefined();
    expect(failedCall?.[2]).toMatchObject({ errorMessage: 'network down' });

    expect(candStore.createCandidate).not.toHaveBeenCalled();
  });

  it('3. one candidate enrich throws, others succeed → run continues, errors captured', async () => {
    const artists = ['Alice', 'BadArtist', 'Carol'].map(n => makeMbArtist(n));
    vi.mocked(mb.searchArtists).mockResolvedValue(artists);
    vi.mocked(enr.enrichCandidate).mockImplementation(async (_ws, a) => {
      if (a.name === 'BadArtist') throw new Error('enrich failed');
      return makeEnriched(a.name) as any;
    });

    const summary = await runPipeline(BASE_INPUT);

    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0].stage).toBe('enrich_or_score');
    expect(summary.errors[0].candidateName).toBe('BadArtist');
    expect(summary.added).toBe(2);
    expect(vi.mocked(runsStore.setRunStatus).mock.calls.at(-1)?.[1]).toBe('complete');
  });

  it('4. all candidates blocked → skippedBlocked === fetched, added === 0, run completes', async () => {
    const artists = ['Alice', 'Bob'].map(n => makeMbArtist(n));
    vi.mocked(mb.searchArtists).mockResolvedValue(artists);
    vi.mocked(enr.enrichCandidate).mockImplementation(async (_ws, a) => makeEnriched(a.name) as any);
    vi.mocked(blocklist.isBlocked).mockResolvedValue({
      blocked: true,
      reason: 'live',
      matchedOn: 'canonical_name',
      matchedRecord: { id: 'x', displayName: 'x', location: 'scout_candidates' },
    });

    const summary = await runPipeline(BASE_INPUT);

    expect(summary.skippedBlocked).toBe(2);
    expect(summary.added).toBe(0);
    expect(vi.mocked(runsStore.setRunStatus).mock.calls.at(-1)?.[1]).toBe('complete');
  });

  it('5. all candidates gate-out → gatedOut === fetched, gatedReasons populated, run completes', async () => {
    const artists = ['Alice', 'Bob'].map(n => makeMbArtist(n));
    vi.mocked(mb.searchArtists).mockResolvedValue(artists);
    vi.mocked(enr.enrichCandidate).mockImplementation(async (_ws, a) => makeEnriched(a.name) as any);
    vi.mocked(gates.evaluateGates).mockReturnValue({ pass: false, reason: 'no genre match' });

    const summary = await runPipeline(BASE_INPUT);

    expect(summary.gatedOut).toBe(2);
    expect(summary.gatedReasons).toHaveLength(2);
    expect(summary.added).toBe(0);
    expect(vi.mocked(runsStore.setRunStatus).mock.calls.at(-1)?.[1]).toBe('complete');
  });

  it('6. one insert throws → other inserts continue, error captured with stage=insert, run completes', async () => {
    const artists = ['Alice', 'Bob', 'Carol'].map(n => makeMbArtist(n));
    vi.mocked(mb.searchArtists).mockResolvedValue(artists);
    vi.mocked(enr.enrichCandidate).mockImplementation(async (_ws, a) => makeEnriched(a.name) as any);
    let insertCount = 0;
    vi.mocked(candStore.createCandidate).mockImplementation(async (c: any) => {
      insertCount++;
      if (insertCount === 2) throw new Error('db constraint');
      return c;
    });

    const summary = await runPipeline(BASE_INPUT);

    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0].stage).toBe('insert');
    expect(summary.added).toBe(2);
    expect(vi.mocked(runsStore.setRunStatus).mock.calls.at(-1)?.[1]).toBe('complete');
  });

  it('7. top-N truncation: only top 3 by score inserted, in descending order', async () => {
    const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
    const artists = names.map(n => makeMbArtist(n));
    vi.mocked(mb.searchArtists).mockResolvedValue(artists);
    vi.mocked(enr.enrichCandidate).mockImplementation(async (_ws, a) => makeEnriched(a.name) as any);

    // Assign scores: J=100, A=90, D=80, rest=50
    const scoreMap: Record<string, number> = { J: 100, A: 90, D: 80 };
    vi.mocked(scoring.computeScore).mockImplementation((candidate: any) => {
      const name = candidate.displayName;
      return { final: scoreMap[name] ?? 50, perDimension: { test: scoreMap[name] ?? 50 } };
    });

    const input = { ...BASE_INPUT, criteria: { ...BASE_INPUT.criteria, targetCount: 3 } };
    const summary = await runPipeline(input);

    expect(summary.added).toBe(3);
    const insertedNames = vi.mocked(candStore.createCandidate).mock.calls.map(c => c[0].displayName);
    expect(insertedNames).toHaveLength(3);
    // Must be in descending score order: J(100), A(90), D(80)
    expect(insertedNames[0]).toBe('J');
    expect(insertedNames[1]).toBe('A');
    expect(insertedNames[2]).toBe('D');
  });

  it('8. updateRunSummary called at least twice: once after MB fetch (fetched), once before finalize (added+errors)', async () => {
    const artists = ['Alice'].map(n => makeMbArtist(n));
    vi.mocked(mb.searchArtists).mockResolvedValue(artists);
    vi.mocked(enr.enrichCandidate).mockImplementation(async (_ws, a) => makeEnriched(a.name) as any);

    await runPipeline(BASE_INPUT);

    const calls = vi.mocked(runsStore.updateRunSummary).mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(2);

    // First call should include fetched
    const firstCall = calls[0][1];
    expect(firstCall).toHaveProperty('fetched');

    // Last updateRunSummary call before finalize should include added and errors
    const lastUpdateCall = calls[calls.length - 1][1];
    expect(lastUpdateCall).toHaveProperty('added');
    expect(lastUpdateCall).toHaveProperty('errors');

    // setRunStatus('complete') comes after the last updateRunSummary
    const setStatusCallIndex = vi.mocked(runsStore.setRunStatus).mock.invocationCallOrder[0];
    const lastUpdateCallIndex = vi.mocked(runsStore.updateRunSummary).mock.invocationCallOrder[calls.length - 1];
    expect(setStatusCallIndex).toBeGreaterThan(lastUpdateCallIndex);
  });

  it('9. createCandidate receives hunterRunId', async () => {
    const artists = [makeMbArtist('Alice')];
    vi.mocked(mb.searchArtists).mockResolvedValue(artists);
    vi.mocked(enr.enrichCandidate).mockResolvedValue(makeEnriched('Alice') as any);

    await runPipeline(BASE_INPUT);

    expect(candStore.createCandidate).toHaveBeenCalledOnce();
    const arg = vi.mocked(candStore.createCandidate).mock.calls[0][0];
    expect(arg.hunterRunId).toBe('test-run-id');
  });

  it('10. per-candidate try/catch isolation: evaluateGates throws on first, rest continue', async () => {
    const artists = ['Alice', 'Bob', 'Carol'].map(n => makeMbArtist(n));
    vi.mocked(mb.searchArtists).mockResolvedValue(artists);
    vi.mocked(enr.enrichCandidate).mockImplementation(async (_ws, a) => makeEnriched(a.name) as any);

    let gatesCallCount = 0;
    vi.mocked(gates.evaluateGates).mockImplementation(() => {
      gatesCallCount++;
      if (gatesCallCount === 1) throw new Error('gates crash');
      return { pass: true };
    });

    const summary = await runPipeline(BASE_INPUT);

    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0].stage).toBe('enrich_or_score');
    // The other 2 (Bob, Carol) should still get inserted
    expect(summary.added).toBe(2);
    expect(vi.mocked(runsStore.setRunStatus).mock.calls.at(-1)?.[1]).toBe('complete');
  });

  it('11. no candidates from MB → run completes with all-zeros summary, no inserts', async () => {
    vi.mocked(mb.searchArtists).mockResolvedValue([]);

    const summary = await runPipeline(BASE_INPUT);

    expect(summary.fetched).toBe(0);
    expect(summary.skippedBlocked).toBe(0);
    expect(summary.gatedOut).toBe(0);
    expect(summary.scored).toBe(0);
    expect(summary.added).toBe(0);
    expect(summary.errors).toHaveLength(0);
    expect(candStore.createCandidate).not.toHaveBeenCalled();
    expect(vi.mocked(runsStore.setRunStatus).mock.calls.at(-1)?.[1]).toBe('complete');
  });

  it('12. catastrophic crash (updateRunSummary throws outside inner try) → outer catch fires, setRunStatus(failed) called, error re-thrown', async () => {
    const artists = ['Alice'].map(n => makeMbArtist(n));
    vi.mocked(mb.searchArtists).mockResolvedValue(artists);
    vi.mocked(enr.enrichCandidate).mockResolvedValue(makeEnriched('Alice') as any);

    // The first updateRunSummary call (after MB fetch) succeeds.
    // The second call (after enrichment loop) throws — this is OUTSIDE all per-candidate
    // try/catches so it propagates to the outer catch.
    let updateCallCount = 0;
    vi.mocked(runsStore.updateRunSummary).mockImplementation(async () => {
      updateCallCount++;
      if (updateCallCount === 2) throw new Error('db crashed mid-pipeline');
    });

    // outer catch re-throws, so runPipeline rejects
    await expect(runPipeline(BASE_INPUT)).rejects.toThrow('db crashed mid-pipeline');

    // setRunStatus('failed') must have been attempted by the outer catch
    const calls = vi.mocked(runsStore.setRunStatus).mock.calls;
    const failedCall = calls.find(c => c[1] === 'failed');
    expect(failedCall).toBeDefined();
  });

  it('cascading crash: pipeline AND setRunStatus both throw — original error still propagates', async () => {
    // Realistic disaster: DB has a transient failure. The pipeline crashes, AND
    // setRunStatus('failed') also throws. Without the nested try/catch in the outer
    // catch, setRunStatus throwing would mask the original error and the run row
    // would be stuck in 'running' state with no signal.
    vi.mocked(mb.searchArtists).mockResolvedValue([makeMbArtist('Alice')]);
    vi.mocked(enr.enrichCandidate).mockResolvedValue(makeEnriched('Alice') as any);

    let updateCallCount = 0;
    vi.mocked(runsStore.updateRunSummary).mockImplementation(async () => {
      updateCallCount++;
      if (updateCallCount === 2) throw new Error('original db crash');
    });
    // setRunStatus itself ALSO throws when called from the outer catch
    vi.mocked(runsStore.setRunStatus).mockRejectedValue(new Error('setRunStatus also down'));

    // The ORIGINAL error must propagate, not the setRunStatus error.
    await expect(runPipeline(BASE_INPUT)).rejects.toThrow('original db crash');

    // The setRunStatus('failed') attempt was made (even though it threw)
    expect(runsStore.setRunStatus).toHaveBeenCalledWith('test-run-id', 'failed', expect.any(Object));

    // The cascading-failure warn should have fired
    expect(console.warn).toHaveBeenCalledWith(
      '[HUNTER_RUN] failed to mark run as failed; run row may be stuck in running state',
      expect.any(Object)
    );
  });
});
