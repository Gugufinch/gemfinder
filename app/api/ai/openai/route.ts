import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';

const requestSchema = z.object({
  prompt: z.string().trim().min(1).max(30000),
  model: z.string().trim().min(1).max(120).default('gpt-4.1'),
  maxTokens: z.number().int().positive().max(4096).default(1200),
  apiKey: z.string().trim().max(300).optional().default('')
});

type OpenAIContent = {
  type?: string;
  text?: string | { value?: string };
  value?: string;
  refusal?: string;
};

type OpenAIOutputItem = {
  type?: string;
  role?: string;
  text?: string | { value?: string };
  content?: OpenAIContent[];
};

type OpenAIResponse = {
  output_text?: string;
  output?: OpenAIOutputItem[];
  response?: {
    output_text?: string;
    output?: OpenAIOutputItem[];
  };
  choices?: Array<{
    message?: { content?: string };
    delta?: { content?: string };
  }>;
  final_output?: string;
  content?: string;
};

function pickText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object') {
    const obj = value as { text?: unknown; value?: unknown };
    if (typeof obj.text === 'string') return obj.text.trim();
    if (typeof obj.value === 'string') return obj.value.trim();
  }
  return '';
}

function parseOpenAIResponseText(payload: OpenAIResponse): string {
  const parts: string[] = [];
  const add = (value: unknown) => {
    const text = pickText(value);
    if (text) parts.push(text);
  };

  add(payload?.output_text);
  add(payload?.response?.output_text);
  add(payload?.final_output);
  add(payload?.content);

  const walkOutput = (items?: OpenAIOutputItem[]) => {
    (items || []).forEach((item) => {
      add(item?.text);
      const isMessageLike =
        item?.type === 'message' ||
        item?.type === 'output_message' ||
        item?.role === 'assistant' ||
        Array.isArray(item?.content);
      if (!isMessageLike) return;

      (item?.content || []).forEach((content) => {
        add(content?.text);
        add(content?.value);
        add(content?.refusal);
      });
    });
  };

  walkOutput(payload?.output);
  walkOutput(payload?.response?.output);

  (payload?.choices || []).forEach((choice) => {
    add(choice?.message?.content);
    add(choice?.delta?.content);
  });

  return parts.join('\n').trim();
}

async function callOpenAI(input: {
  key: string;
  prompt: string;
  model: string;
  maxTokens: number;
}): Promise<{ ok: boolean; status: number; text?: string; error?: string }> {
  const { key, prompt, model, maxTokens } = input;
  const upstream = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify({
      model,
      input: prompt,
      max_output_tokens: maxTokens
    })
  });

  const raw = await upstream.text();
  if (!upstream.ok) {
    let msg = `OpenAI error ${upstream.status}`;
    try {
      const parsedError = JSON.parse(raw) as { error?: { message?: string } | string };
      const nested = typeof parsedError?.error === 'string' ? parsedError.error : parsedError?.error?.message;
      msg = nested || msg;
    } catch {}
    return { ok: false, status: upstream.status, error: msg };
  }

  const data = JSON.parse(raw) as OpenAIResponse;
  const text = parseOpenAIResponseText(data);
  if (!text) {
    return { ok: false, status: 502, error: 'OpenAI returned an empty response. Try GPT-4.1 or Anthropic Sonnet.' };
  }

  return { ok: true, status: 200, text };
}

export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid AI payload', details: parsed.error.issues }, { status: 400 });
  }

  const { prompt, model, maxTokens, apiKey } = parsed.data;
  const key = (apiKey || process.env.OPENAI_API_KEY || '').trim();
  if (!key) {
    return NextResponse.json({ error: 'Missing OpenAI API key.' }, { status: 400 });
  }

  try {
    const primary = await callOpenAI({ key, prompt, model, maxTokens });
    if (primary.ok && primary.text) {
      return NextResponse.json({ ok: true, text: primary.text, model });
    }

    if (model.toLowerCase().startsWith('gpt-5')) {
      const fallbackModel = 'gpt-4.1';
      const fallback = await callOpenAI({ key, prompt, model: fallbackModel, maxTokens });
      if (fallback.ok && fallback.text) {
        return NextResponse.json({ ok: true, text: fallback.text, model: fallbackModel, fallbackUsed: true });
      }
      return NextResponse.json({ error: fallback.error || primary.error || 'OpenAI returned an empty response.' }, { status: fallback.status || primary.status || 502 });
    }

    return NextResponse.json({ error: primary.error || 'OpenAI returned an empty response.' }, { status: primary.status || 502 });
  } catch (error) {
    console.error('OpenAI proxy failed', error);
    return NextResponse.json({ error: 'AI proxy request failed.' }, { status: 502 });
  }
}
