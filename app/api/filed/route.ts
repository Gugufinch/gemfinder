import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getFiledStories, setFiled } from '@/lib/bonafied/repository';

const setFiledSchema = z.object({
  storyId: z.string().min(4),
  filed: z.boolean()
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId') || 'demo-user';
  const items = await getFiledStories(userId);
  return NextResponse.json({
    filed: items
  });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId') || 'demo-user';
  const payload = await req.json().catch(() => null);
  const parsed = setFiledSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid filed payload', details: parsed.error.issues }, { status: 400 });
  }

  const items = await setFiled(userId, parsed.data.storyId, parsed.data.filed);
  return NextResponse.json({
    filed: items
  });
}
