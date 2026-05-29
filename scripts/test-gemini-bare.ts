// Minimal Gemini sanity check — no grounding, no system prompt, just confirm the API key works.
import { readFileSync } from 'fs';
import { join } from 'path';
const envText = readFileSync(join(process.cwd(), '.env.local'), 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

import { GoogleGenAI } from '@google/genai';

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) { console.error('No key'); return; }

  const client = new GoogleGenAI({ apiKey });

  for (const model of ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash-lite']) {
    console.log(`\n--- ${model} (no grounding) ---`);
    try {
      const t0 = Date.now();
      const r = await client.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: 'Say "hi from " followed by your model name.' }] }],
      });
      console.log(`  ${Math.round((Date.now() - t0) / 1000)}s →`, r.text?.trim());
    } catch (err: any) {
      console.log(`  FAIL:`, err.message?.slice(0, 200));
    }
  }
}

main().catch(console.error);
