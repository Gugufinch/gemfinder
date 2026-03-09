import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';

const requestSchema = z.object({
  prompt: z.string().trim().min(1).max(30000),
  model: z.string().trim().min(1).max(120).default('gemini-2.5-flash'),
  maxTokens: z.number().int().positive().max(4096).default(1200),
  apiKey: z.string().trim().max(300).optional().default('')
});

type GooglePart = {
  text?: string;
};

type GoogleCandidate = {
  content?: {
    parts?: GooglePart[];
  };
  finishReason?: string;
};

type GoogleResponse = {
  candidates?: GoogleCandidate[];
  promptFeedback?: {
    blockReason?: string;
    blockReasonMessage?: string;
  };
  error?: {
    message?: string;
  };
};

function parseGoogleResponseText(payload: GoogleResponse): string {
  const parts: string[] = [];
  (payload?.candidates || []).forEach((candidate) => {
    (candidate?.content?.parts || []).forEach((part) => {
      if (typeof part?.text === 'string' && part.text.trim()) parts.push(part.text.trim());
    });
  });
  return parts.join('\n').trim();
}

export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid AI payload', details: parsed.error.issues }, { status: 400 });
  }

  const { prompt, model, maxTokens, apiKey } = parsed.data;
  const key = (apiKey || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '').trim();
  if (!key) {
    return NextResponse.json({ error: 'Missing Google Gemini API key.' }, { status: 400 });
  }

  try {
    const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: maxTokens
        }
      })
    });

    const raw = await upstream.text();
    if (!upstream.ok) {
      let msg = `Google Gemini error ${upstream.status}`;
      try {
        const parsedError = JSON.parse(raw) as GoogleResponse;
        msg =
          parsedError?.error?.message ||
          parsedError?.promptFeedback?.blockReasonMessage ||
          parsedError?.promptFeedback?.blockReason ||
          msg;
      } catch {}
      return NextResponse.json({ error: msg }, { status: upstream.status });
    }

    const data = JSON.parse(raw) as GoogleResponse;
    const text = parseGoogleResponseText(data);
    if (!text) {
      const blockReason = data?.promptFeedback?.blockReasonMessage || data?.promptFeedback?.blockReason || '';
      return NextResponse.json({ error: blockReason || 'Google Gemini returned an empty response.' }, { status: 502 });
    }

    return NextResponse.json({ ok: true, text, model });
  } catch (error) {
    console.error('Google Gemini proxy failed', error);
    return NextResponse.json({ error: 'AI proxy request failed.' }, { status: 502 });
  }
}
