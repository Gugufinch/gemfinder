import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { addFeed, getFeeds } from '@/lib/bonafied/repository';

const createFeedSchema = z.object({
  name: z.string().min(2).max(120),
  url: z.string().url().max(500),
  category: z.enum(['BUSINESS', 'TECHNOLOGY', 'MUSIC_INDUSTRY', 'PODCAST_CREATOR']),
  credibilityScore: z.number().min(0).max(1).default(0.7),
  active: z.boolean().default(true)
});

export async function GET() {
  const feeds = await getFeeds();
  return NextResponse.json({
    feeds
  });
}

export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => null);
  const parsed = createFeedSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid feed payload', details: parsed.error.issues }, { status: 400 });
  }

  const feed = await addFeed(parsed.data);
  return NextResponse.json({ feed }, { status: 201 });
}
