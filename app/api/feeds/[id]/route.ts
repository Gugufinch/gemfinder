import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { updateFeed } from '@/lib/bonafied/repository';

const patchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  url: z.string().url().max(500).optional(),
  category: z.enum(['BUSINESS', 'TECHNOLOGY', 'MUSIC_INDUSTRY', 'PODCAST_CREATOR']).optional(),
  credibilityScore: z.number().min(0).max(1).optional(),
  active: z.boolean().optional()
});

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const payload = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid feed patch', details: parsed.error.issues }, { status: 400 });
  }

  const updated = await updateFeed(id, parsed.data);
  if (!updated) {
    return NextResponse.json({ error: 'Feed not found' }, { status: 404 });
  }

  return NextResponse.json({ feed: updated });
}
