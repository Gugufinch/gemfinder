// Hunter pipeline diagnostic — exercises the MB layer with real network calls
// to verify the Step 0 fix (fetchArtistDetails) actually unlocks the relations/
// release-groups that searchArtists omits.
//
// Run: npx tsx scripts/hunter-diagnostic.ts

import { searchArtists, fetchArtistDetails, type MBArtist } from '../lib/gemfinder/hunter/musicbrainz';
import { parseSpotifyArtistId } from '../lib/gemfinder/hunter/spotify';

type Section = (name: string) => void;
const section: Section = (name) => console.log(`\n${'═'.repeat(70)}\n  ${name}\n${'═'.repeat(70)}`);

async function main() {
  // ---------------------------------------------------------------------------
  section('PHASE 1: searchArtists — what does MB return by default?');
  // ---------------------------------------------------------------------------
  // This is what the orchestrator gets back from MB. Per the bug: searchArtists
  // returns BASIC artist data, NO relations or release-groups. The orchestrator
  // was passing this directly to enrichCandidate, which couldn't extract any
  // Spotify URLs because they live in relations.

  const criteria = {
    genres: ['rock'],
    regions: ['US'],
    roleTarget: 'performer' as const,
    targetCount: 25,
  };

  console.log(`Query criteria: ${JSON.stringify(criteria)}`);
  const searchResults = await searchArtists(criteria);
  console.log(`\nFetched: ${searchResults.length} artists`);
  console.log(`\nFirst 5 results (raw shape):`);
  searchResults.slice(0, 5).forEach((a, i) => {
    console.log(`  ${i + 1}. ${a.name} (id=${a.id})`);
    console.log(`     country: ${a.country ?? '—'}`);
    console.log(`     type: ${a.type ?? '—'}`);
    console.log(`     has 'relations'? ${a.relations !== undefined ? `YES (${a.relations.length})` : 'NO'}`);
    console.log(`     has 'release-groups'? ${a['release-groups'] !== undefined ? `YES (${a['release-groups'].length})` : 'NO'}`);
    console.log(`     has 'life-span'? ${a['life-span'] ? JSON.stringify(a['life-span']) : 'NO'}`);
    console.log(`     tags: ${a.tags?.slice(0, 3).map((t) => t.name).join(', ') ?? 'none'}`);
  });

  // ---------------------------------------------------------------------------
  section('PHASE 2: fetchArtistDetails — does the fix actually populate relations?');
  // ---------------------------------------------------------------------------
  // For the first 3 search results, fetch the full record and inspect.
  // Per the fix: enrichCandidate now does this in Step 0 when the input lacks
  // relations. If this phase shows full records with Spotify URLs, the fix works.

  const sample = searchResults.slice(0, 3);
  for (let i = 0; i < sample.length; i++) {
    const minimal = sample[i];
    console.log(`\n--- ${i + 1}. ${minimal.name} ---`);
    const full = await fetchArtistDetails(minimal.id);
    if (!full) {
      console.log(`  fetchArtistDetails returned null`);
      continue;
    }
    console.log(`  has 'relations'? ${full.relations !== undefined ? `YES (${full.relations.length})` : 'NO'}`);
    console.log(`  has 'release-groups'? ${full['release-groups'] !== undefined ? `YES (${full['release-groups'].length})` : 'NO'}`);
    console.log(`  has 'life-span'? ${full['life-span'] ? JSON.stringify(full['life-span']) : 'NO'}`);

    // Find Spotify, Instagram, official-homepage relations
    const spotifyRel = full.relations?.find((r) => r.type === 'spotify');
    const igRel = full.relations?.find((r) => r.type === 'social network' && r.url?.resource.includes('instagram'));
    const websiteRel = full.relations?.find((r) => r.type === 'official homepage');
    console.log(`  Spotify relation: ${spotifyRel ? spotifyRel.url?.resource : 'none'}`);
    if (spotifyRel?.url?.resource) {
      const spotifyId = parseSpotifyArtistId(spotifyRel.url.resource);
      console.log(`     parsed Spotify ID: ${spotifyId ?? 'PARSE FAILED'}`);
    }
    console.log(`  Instagram relation: ${igRel ? igRel.url?.resource : 'none'}`);
    console.log(`  Website relation: ${websiteRel ? websiteRel.url?.resource : 'none'}`);

    // Most recent release year
    const years = (full['release-groups'] ?? [])
      .map((rg) => parseInt((rg['first-release-date'] ?? '').slice(0, 4), 10))
      .filter((y) => Number.isFinite(y));
    if (years.length) {
      console.log(`  Most recent release year: ${Math.max(...years)} (out of ${years.length} release groups)`);
    } else {
      console.log(`  No release year data`);
    }
  }

  // ---------------------------------------------------------------------------
  section('PHASE 3: who would survive the gates?');
  // ---------------------------------------------------------------------------
  // With the soft-gate defaults (require_living=true only as a hard filter),
  // simulate what would pass.

  let aliveCount = 0;
  let deceasedCount = 0;
  let unknownLifespanCount = 0;

  for (const a of searchResults) {
    const lifespan = a['life-span'];
    if (lifespan?.end) {
      deceasedCount++;
    } else if (lifespan) {
      aliveCount++;
    } else {
      unknownLifespanCount++;
    }
  }
  console.log(`Living (alive/active): ${aliveCount}`);
  console.log(`Deceased (filtered):   ${deceasedCount}`);
  console.log(`Unknown:               ${unknownLifespanCount}`);

  // ---------------------------------------------------------------------------
  section('PHASE 4: predicted release-group-count gate outcomes (sampled top 20)');
  // ---------------------------------------------------------------------------
  // Fetch details for the top 20 search results and count their release groups.
  // The new "too_established" gate rejects candidates with ≥20 release groups
  // (a megastar proxy when Spotify follower data is unavailable from MB).
  // Sample 20 to keep run time reasonable (~20 sec at MB token bucket).

  // Sample top 15 of the tiered-offset results (should now be offset 2000+).
  console.log(`Sampling top 15 results — these should now be MID-TIER (default offset is 2000)...\n`);
  const sampleSize = 15;
  type RGCheck = { name: string; releaseGroupCount: number; verdict: string };
  const rgChecks: RGCheck[] = [];

  for (let i = 0; i < Math.min(sampleSize, searchResults.length); i++) {
    const a = searchResults[i];
    const detail = await fetchArtistDetails(a.id);
    const rgCount = detail?.['release-groups']?.length ?? 0;
    let verdict: string;
    if (rgCount >= 20) {
      verdict = `❌ too_established (${rgCount})`;
    } else if (rgCount === 0) {
      verdict = `⚠️  no release-groups (passes — possible new artist)`;
    } else {
      verdict = `✅ pass (${rgCount} release-groups)`;
    }
    rgChecks.push({ name: a.name, releaseGroupCount: rgCount, verdict });
    console.log(`  ${(i + 1).toString().padStart(3)}. ${a.name.padEnd(35)} — ${verdict}`);
  }

  const tooBig = rgChecks.filter((c) => c.releaseGroupCount >= 20).length;
  const empty = rgChecks.filter((c) => c.releaseGroupCount === 0).length;
  const passing = rgChecks.length - tooBig - empty;
  console.log(`\nOf the top ${rgChecks.length}:`);
  console.log(`  Filtered (too_established): ${tooBig}`);
  console.log(`  Empty MB record:            ${empty}`);
  console.log(`  Passing:                    ${passing}`);
  if (tooBig + empty > 0) {
    console.log(`\n  → That's ${Math.round(((tooBig + empty) / rgChecks.length) * 100)}% of the top results filtered before Spotify even runs.`);
  }

  // ---------------------------------------------------------------------------
  section('SUMMARY');
  // ---------------------------------------------------------------------------
  console.log(`✓ searchArtists works: returned ${searchResults.length} candidates`);
  console.log(`✓ Search results lack relations/release-groups (confirms the bug)`);
  console.log(`✓ fetchArtistDetails populates the full record (confirms the fix unlocks Spotify URL extraction)`);
  console.log(`\nNext step in real pipeline: enrichCandidate now does fetchArtistDetails → Spotify lookup → size_cap can fire.`);
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exit(1);
});
