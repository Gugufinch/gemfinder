import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';

const requestSchema = z.object({
  prompt: z.string().trim().min(1).max(30000),
  model: z.string().trim().min(1).max(120).default('claude-sonnet-4-20250514'),
  maxTokens: z.number().int().positive().max(4096).default(1200),
  apiKey: z.string().trim().max(300).optional().default('')
});

export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid AI payload', details: parsed.error.issues }, { status: 400 });
  }

  const { prompt, model, maxTokens, apiKey } = parsed.data;
  const key = (apiKey || process.env.ANTHROPIC_API_KEY || '').trim();
  if (!key) {
    return NextResponse.json({ error: 'Missing Anthropic API key.' }, { status: 400 });
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const raw = await upstream.text();
    if (!upstream.ok) {
      let msg = `Anthropic error ${upstream.status}`;
      try {
        const parsedError = JSON.parse(raw) as { error?: { message?: string } };
        msg = parsedError?.error?.message || msg;
      } catch {}
      return NextResponse.json({ error: msg }, { status: upstream.status });
    }

    const data = JSON.parse(raw) as { content?: Array<{ type?: string; text?: string }> };
    const text =
      data?.content
        ?.map((item) => (item?.type === 'text' ? item.text || '' : ''))
        .filter(Boolean)
        .join('\n') || 'No response.';

    return NextResponse.json({ ok: true, text });
  } catch (error) {
    console.error('Anthropic proxy failed', error);
    return NextResponse.json({ error: 'AI proxy request failed.' }, { status: 502 });
  }
}
