// Quick smoke test for the Gemini-driven Hunter agent.
// Verifies:
//   1. API key is valid
//   2. Gemini returns parseable JSON
//   3. Google Search grounding is enabled (rationales should reference real sources)
//
// Run: npx tsx scripts/test-gemini.ts

// Load .env.local manually (no dotenv dep). tsx doesn't auto-load envfiles.
import { readFileSync } from 'fs';
import { join } from 'path';
const envText = readFileSync(join(process.cwd(), '.env.local'), 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

import { searchArtistsViaLLM } from '../lib/gemfinder/hunter/llm-agent';
import { GoogleGenAI } from '@google/genai';

// Direct raw-response test so we can see what Gemini is actually sending us.
async function rawTest() {
  console.log('\n=== RAW Gemini response (to debug JSON parsing) ===');
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const r = await client.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: [{ role: 'user', parts: [{ text: 'You are an A&R scout. Find 10 emerging US indie rock artists with under 50K Spotify monthly listeners. Use Google Search. Output ONLY JSON like {"artists":[{"name":"...","genres":["..."],"rationale":"..."}]}.' }] }],
    config: { tools: [{ googleSearch: {} }], temperature: 0.7, maxOutputTokens: 2000 },
  });
  console.log('Raw response (first 1500 chars):');
  console.log(r.text?.slice(0, 1500));
  console.log('\n...(end raw)\n');
}

async function main() {
  await rawTest();
  console.log('Calling Gemini for: indie rock, US, 25 candidates, 5K–80K Spotify monthly listeners...\n');
  const t0 = Date.now();

  const results = await searchArtistsViaLLM({
    genres: ['indie rock'],
    regions: ['US'],
    roleTarget: 'performer',
    targetCount: 25,
    sizeBracket: { min: 5000, max: 80000 },
    recency: { sinceYear: 2023 },
  });

  const elapsed = Math.round((Date.now() - t0) / 1000);
  console.log(`Done in ${elapsed}s. Got ${results.length} candidates.\n`);

  if (results.length === 0) {
    console.log('⚠️  Zero candidates — check console.warn output above for errors.');
    return;
  }

  results.slice(0, 10).forEach((a, i) => {
    const hint = (a as { _aiHint?: string })._aiHint;
    console.log(`${(i + 1).toString().padStart(2)}. ${a.name}`);
    if (a.tags?.length) console.log(`     tags: ${a.tags.map(t => t.name).join(', ')}`);
    if (hint) console.log(`     why:  ${hint}`);
    console.log('');
  });
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
