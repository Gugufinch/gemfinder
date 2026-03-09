import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';

const requestSchema = z.object({
  prompt: z.string().trim().min(1).max(30000),
  model: z.string().trim().min(1).max(120).default('deepseek-chat'),
  maxTokens: z.number().int().positive().max(4096).default(1200),
  apiKey: z.string().trim().max(300).optional().default('')
});

type DeepSeekResponse = {
  choices?: Array<{
    message?: {
      content?: string;
      reasoning_content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

function parseDeepSeekResponseText(payload: DeepSeekResponse): string {
  return (
    payload?.choices
      ?.map((choice) => choice?.message?.content || '')
      .filter(Boolean)
      .join('\n')
      .trim() || ''
  );
}

export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid AI payload', details: parsed.error.issues }, { status: 400 });
  }

  const { prompt, model, maxTokens, apiKey } = parsed.data;
  const key = (apiKey || process.env.DEEPSEEK_API_KEY || '').trim();
  if (!key) {
    return NextResponse.json({ error: 'Missing DeepSeek API key.' }, { status: 400 });
  }

  try {
    const upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.7,
      })
    });

    const raw = await upstream.text();
    if (!upstream.ok) {
      let msg = `DeepSeek error ${upstream.status}`;
      try {
        const parsedError = JSON.parse(raw) as DeepSeekResponse;
        msg = parsedError?.error?.message || msg;
      } catch {}
      return NextResponse.json({ error: msg }, { status: upstream.status });
    }

    const data = JSON.parse(raw) as DeepSeekResponse;
    const text = parseDeepSeekResponseText(data);
    if (!text) {
      return NextResponse.json({ error: 'DeepSeek returned an empty response.' }, { status: 502 });
    }

    return NextResponse.json({ ok: true, text, model });
  } catch (error) {
    console.error('DeepSeek proxy failed', error);
    return NextResponse.json({ error: 'AI proxy request failed.' }, { status: 502 });
  }
}
