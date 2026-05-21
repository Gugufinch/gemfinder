// Live end-to-end agent test — 3 distinct hunts that exercise the Gemini
// discovery + deep-research pipeline with real network calls. The output is
// a structured analysis showing what data we actually get for each artist,
// so we can find the weakest link and prioritize improvements.
//
// Run: npx tsx scripts/test-agent-flow.ts
//
// Skips Spotify/Steel since those creds aren't local — focuses on the agent
// layer (Gemini discovery + per-candidate deep research with Google Search
// grounding). Spotify/Steel just LAYER on top; if Gemini is weak, nothing
// downstream can save it.

// Load .env.local
import { readFileSync } from 'fs';
import { join } from 'path';
const envText = readFileSync(join(process.cwd(), '.env.local'), 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

import { searchArtistsViaLLM } from '../lib/gemfinder/hunter/llm-agent';

// Inline a minimal deep-research caller that bypasses the DB cache (no
// Postgres locally). We import the underlying Gemini call indirectly via
// re-creating the prompt logic here. Simpler: shell out to the public
// researchArtist function but catch the cache-failure (it'll just print
// a warn and move on; in this test setup the cache returns null anyway).
import { researchArtist } from '../lib/gemfinder/hunter/deep-research';
import type { HunterCriteria } from '../lib/gemfinder/types';

// Three test configurations stress-testing different code paths.
const TEST_RUNS: Array<{ label: string; criteria: HunterCriteria; expectation: string }> = [
  {
    label: 'TEST 1 — common genre + region (indie rock, US)',
    expectation: "Gemini's strongest path. Should return well-known emerging indie names with rich Stereogum/FADER citations.",
    criteria: {
      genres: ['indie rock'],
      regions: ['US'],
      roleTarget: 'performer',
      targetCount: 5,
      sizeBracket: { min: 5000, max: 100000 },
    },
  },
  {
    label: 'TEST 2 — niche genre + foreign region (ambient, JP)',
    expectation: 'Stress test variety. Smaller universe of available artists. Citations might be from foreign-language press.',
    criteria: {
      genres: ['ambient'],
      regions: ['JP'],
      roleTarget: 'performer',
      targetCount: 5,
      sizeBracket: { min: 1000, max: 50000 },
    },
  },
  {
    label: 'TEST 3 — location-only (Brooklyn, no genre)',
    expectation: 'Tests how Gemini handles thin criteria. Should return a mix of Brooklyn-based emerging artists across genres.',
    criteria: {
      genres: [],
      regions: [],
      locations: ['Brooklyn, NY'],
      roleTarget: 'performer',
      targetCount: 5,
      sizeBracket: { min: 5000, max: 100000 },
    },
  },
];

type AnalysisRow = {
  test: string;
  candidateName: string;
  discoveryHint?: string;  // LLM rationale from discovery
  verified?: boolean;
  isLiving?: boolean | null;
  location?: string;
  bio?: string;
  recentReleaseYear?: number;
  spotifyUrl?: string;
  instagramHandle?: string;
  bookingEmail?: string;
  citationCount?: number;
  citationDomains?: string[];
  researchError?: string;
};

const allResults: AnalysisRow[] = [];

function section(title: string) {
  console.log('\n' + '═'.repeat(78));
  console.log('  ' + title);
  console.log('═'.repeat(78));
}

async function runHunt(test: typeof TEST_RUNS[number]): Promise<void> {
  section(test.label);
  console.log(`Expectation: ${test.expectation}`);
  console.log(`Criteria: ${JSON.stringify(test.criteria)}\n`);

  // === Discovery agent ===
  console.log('🔎 Discovery agent (Gemini + Google Search)...');
  const t0 = Date.now();
  let discovered;
  try {
    discovered = await searchArtistsViaLLM(test.criteria);
  } catch (err) {
    console.log('❌ Discovery FAILED:', err instanceof Error ? err.message : String(err));
    return;
  }
  const tDiscover = Math.round((Date.now() - t0) / 1000);
  console.log(`✅ Discovery returned ${discovered.length} candidates in ${tDiscover}s\n`);

  if (discovered.length === 0) return;

  console.log('Discovered names:');
  discovered.forEach((a, i) => {
    const hint = (a as { _aiHint?: string })._aiHint;
    console.log(`  ${i + 1}. ${a.name}`);
    if (hint) console.log(`     hint: ${hint}`);
  });

  // === Deep research per candidate (parallel) ===
  console.log(`\n🔬 Deep research on ${discovered.length} candidates (parallel, real Gemini calls)...`);
  const tResearch0 = Date.now();
  const researchResults = await Promise.all(
    discovered.map(async (a) => {
      const aiHint = (a as { _aiHint?: string })._aiHint;
      try {
        const r = await researchArtist('test-ws', a.name, a.tags?.map((t) => t.name));
        return { name: a.name, aiHint, research: r, error: null };
      } catch (err) {
        return { name: a.name, aiHint, research: null, error: err instanceof Error ? err.message : String(err) };
      }
    })
  );
  const tResearch = Math.round((Date.now() - tResearch0) / 1000);
  console.log(`✅ Deep research complete in ${tResearch}s (parallel)\n`);

  // Pretty-print + accumulate analysis rows
  for (const r of researchResults) {
    const row: AnalysisRow = {
      test: test.label,
      candidateName: r.name,
      discoveryHint: r.aiHint,
      researchError: r.error || undefined,
    };
    if (r.research) {
      row.verified = r.research.verified;
      row.isLiving = r.research.isLiving;
      row.location = r.research.location;
      row.bio = r.research.bio;
      row.recentReleaseYear = r.research.recentReleaseYear;
      row.spotifyUrl = r.research.spotifyUrl;
      row.instagramHandle = r.research.instagramHandle;
      row.bookingEmail = r.research.bookingEmail;
      row.citationCount = r.research.citations.length;
      row.citationDomains = Array.from(new Set(r.research.citations.map(c => {
        try { return new URL(c).hostname.replace(/^www\./, ''); } catch { return c; }
      })));
    }
    allResults.push(row);

    // Compact per-artist summary
    console.log(`\n• ${r.name}`);
    if (r.error) {
      console.log(`  ❌ research error: ${r.error.slice(0, 100)}`);
      continue;
    }
    if (!r.research) {
      console.log('  ⚠️  research returned null');
      continue;
    }
    const ver = r.research.verified ? '✅' : '❌';
    console.log(`  ${ver} verified: ${r.research.verified}  ·  living: ${r.research.isLiving}  ·  releaseYear: ${r.research.recentReleaseYear ?? '—'}`);
    if (r.research.location) console.log(`  📍 ${r.research.location}`);
    if (r.research.bio) console.log(`  💬 ${r.research.bio.slice(0, 140)}${r.research.bio.length > 140 ? '...' : ''}`);
    const linkParts = [
      r.research.spotifyUrl && 'Spotify',
      r.research.instagramHandle && `IG @${r.research.instagramHandle}`,
      r.research.bookingEmail && `📧 ${r.research.bookingEmail}`,
    ].filter(Boolean);
    if (linkParts.length > 0) console.log(`  🔗 ${linkParts.join(' · ')}`);
    if (r.research.citations.length > 0) {
      const domains = Array.from(new Set(r.research.citations.map(c => {
        try { return new URL(c).hostname.replace(/^www\./, ''); } catch { return c; }
      })));
      console.log(`  📰 cited: ${domains.slice(0, 5).join(', ')}`);
    }
  }
}

async function main() {
  const t0 = Date.now();
  for (const test of TEST_RUNS) {
    await runHunt(test);
  }

  // === Aggregate analysis ===
  section('🔬 AGGREGATE ANALYSIS — where the agent layer is strong vs weak');

  const total = allResults.length;
  const verified = allResults.filter(r => r.verified === true).length;
  const withBio = allResults.filter(r => !!r.bio).length;
  const withLocation = allResults.filter(r => !!r.location).length;
  const withSpotify = allResults.filter(r => !!r.spotifyUrl).length;
  const withInstagram = allResults.filter(r => !!r.instagramHandle).length;
  const withEmail = allResults.filter(r => !!r.bookingEmail).length;
  const withRecentYear = allResults.filter(r => r.recentReleaseYear && r.recentReleaseYear >= 2022).length;
  const withCitations = allResults.filter(r => (r.citationCount ?? 0) > 0).length;
  const errors = allResults.filter(r => !!r.researchError).length;

  const pct = (n: number) => total > 0 ? `${Math.round((n / total) * 100)}%` : '—';

  console.log(`\nTotal candidates across all 3 runs: ${total}`);
  console.log(`Research errors:                 ${errors} (${pct(errors)})`);
  console.log('\n--- Field-by-field success rate ---');
  console.log(`  verified as real artist:       ${verified} (${pct(verified)})`);
  console.log(`  bio populated:                 ${withBio} (${pct(withBio)})`);
  console.log(`  location populated:            ${withLocation} (${pct(withLocation)})`);
  console.log(`  recent release year (≥2022):   ${withRecentYear} (${pct(withRecentYear)})`);
  console.log(`  Spotify URL found:             ${withSpotify} (${pct(withSpotify)})`);
  console.log(`  Instagram handle found:        ${withInstagram} (${pct(withInstagram)})`);
  console.log(`  Booking email found:           ${withEmail} (${pct(withEmail)})`);
  console.log(`  Has press citations:           ${withCitations} (${pct(withCitations)})`);

  // Top cited sources
  const allDomains = allResults.flatMap(r => r.citationDomains ?? []);
  const domainCounts: Record<string, number> = {};
  for (const d of allDomains) domainCounts[d] = (domainCounts[d] || 0) + 1;
  const topDomains = Object.entries(domainCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log('\n--- Top cited sources (where Gemini grounds its claims) ---');
  topDomains.forEach(([d, c]) => console.log(`  ${c.toString().padStart(3)}× ${d}`));

  // Per-test breakdown
  console.log('\n--- Per-test breakdown ---');
  for (const test of TEST_RUNS) {
    const rows = allResults.filter(r => r.test === test.label);
    const v = rows.filter(r => r.verified).length;
    const sp = rows.filter(r => !!r.spotifyUrl).length;
    const ig = rows.filter(r => !!r.instagramHandle).length;
    const em = rows.filter(r => !!r.bookingEmail).length;
    console.log(`\n  ${test.label}`);
    console.log(`    ${rows.length} candidates · verified ${v} · Spotify ${sp} · IG ${ig} · email ${em}`);
  }

  const elapsed = Math.round((Date.now() - t0) / 1000);
  console.log(`\nTotal runtime: ${elapsed}s`);

  // === Recommendations ===
  section('💡 RECOMMENDATIONS based on the data');

  const recs: string[] = [];

  if (verified / total < 0.85) {
    recs.push(`Verification rate is ${pct(verified)} — below 85%. Deep research is dropping ${total - verified} candidates as not-a-recording-artist. Either (a) discovery is hallucinating names (tighten the discovery prompt), or (b) verification is too strict (Gemini false-negatives on real but obscure artists).`);
  }

  if (withSpotify / total < 0.6) {
    recs.push(`Spotify URL only found ${pct(withSpotify)} of the time. Gemini's Google grounding isn't reliably surfacing Spotify pages. The orchestrator's searchArtistByName fallback on the Spotify API should fill these gaps — verify that's working in production.`);
  }

  if (withInstagram / total < 0.4) {
    recs.push(`Instagram handles only found ${pct(withInstagram)} — Gemini struggles here. Consider a targeted search query like "{name} instagram official" if absent. OR rely on Steel browser scraping the artist's website for IG link.`);
  }

  if (withEmail / total < 0.2) {
    recs.push(`Booking emails found ${pct(withEmail)} — very low. This is the #1 A&R gap. Options: (a) deeper Gemini probe specifically for booking contact, (b) Steel scrape of the artist's website + bandcamp.`);
  }

  if (withBio / total < 0.85) {
    recs.push(`Bios populated ${pct(withBio)}. Should be higher — Gemini grounding is good at this. May indicate JSON-parse drops or model-side filtering.`);
  }

  if (withRecentYear / total < 0.7) {
    recs.push(`Recent release year ≥2022 only ${pct(withRecentYear)}. Either the artists aren't truly recent OR Gemini isn't picking up release info. Discovery prompt could be more aggressive about "released since 2024" filtering.`);
  }

  if (errors > total * 0.1) {
    recs.push(`${errors} research errors (>10%) — investigate Gemini overload / quota / JSON parse issues.`);
  }

  if (recs.length === 0) {
    recs.push('All metrics are healthy. Agent layer is in good shape.');
  }

  recs.forEach((r, i) => console.log(`\n${i + 1}. ${r}`));

  console.log('\n═'.repeat(78));
}

main().catch((err) => { console.error('Test failed:', err); process.exit(1); });
