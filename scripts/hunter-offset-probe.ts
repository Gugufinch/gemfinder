// Hunter offset probe — sample MB search results at different offsets to find
// where mid-tier candidates start appearing (vs the megastar zone at 0-100).
//
// Run: npx tsx scripts/hunter-offset-probe.ts

import { searchArtists, fetchArtistDetails } from '../lib/gemfinder/hunter/musicbrainz';

async function probeOffset(criteria: any, offset: number, sampleSize: number = 10) {
  console.log(`\n──── offset=${offset} ────`);
  const results = await searchArtists(criteria, offset);
  if (results.length === 0) {
    console.log(`  (no results at this offset — past end of MB)`);
    return;
  }
  console.log(`  ${results.length} results at this offset; sampling first ${sampleSize} for release-group counts...`);
  let established = 0;
  let midTier = 0;
  let empty = 0;
  for (let i = 0; i < Math.min(sampleSize, results.length); i++) {
    const a = results[i];
    const detail = await fetchArtistDetails(a.id);
    const rgCount = detail?.['release-groups']?.length ?? 0;
    const tag = rgCount >= 20 ? '❌ established' : rgCount === 0 ? '⚠️  empty' : '✅ mid-tier';
    if (rgCount >= 20) established++;
    else if (rgCount === 0) empty++;
    else midTier++;
    console.log(`    ${(offset + i + 1).toString().padStart(4)}. ${a.name.padEnd(40)} rgs=${rgCount} ${tag}`);
  }
  console.log(`  Summary: ${established} established · ${midTier} mid-tier · ${empty} empty`);
}

async function main() {
  const criteria = {
    genres: ['rock'],
    regions: ['US'],
    roleTarget: 'performer' as const,
    targetCount: 25,
  };
  console.log(`Criteria: ${JSON.stringify(criteria)}\n`);
  console.log('Goal: find an offset where ≥50% of candidates are mid-tier (5-19 release groups).\n');

  for (const offset of [1000, 2000, 3000, 5000, 8000]) {
    await probeOffset(criteria, offset, 10);
  }
}

main().catch((err) => { console.error('Probe failed:', err); process.exit(1); });
