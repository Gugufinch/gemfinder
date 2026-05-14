import { readFileSync } from 'fs';
import { join } from 'path';
const envText = readFileSync(join(process.cwd(), '.env.local'), 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

import { GoogleGenAI } from '@google/genai';

async function main() {
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  for (const model of ['gemini-2.5-flash-lite', 'gemini-2.5-flash']) {
    console.log(`\n--- ${model} WITH googleSearch grounding ---`);
    try {
      const t0 = Date.now();
      const r = await client.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: 'List 5 emerging US indie rock artists with under 50K Spotify monthly listeners, who released music in 2024. JSON only: {"artists": [{"name": "..."}]}' }] }],
        config: {
          tools: [{ googleSearch: {} }],
          temperature: 0.7,
          maxOutputTokens: 2000,
        },
      });
      console.log(`  ${Math.round((Date.now() - t0) / 1000)}s →`);
      console.log(r.text?.slice(0, 500));
    } catch (err: any) {
      console.log(`  FAIL after ${Math.round((Date.now() / 1000))}s:`, err.message?.slice(0, 200));
    }
  }
}

main().catch(console.error);
