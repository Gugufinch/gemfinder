import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserPreferences, patchUserPreferences } from '@/lib/bonafied/repository';

const patchSchema = z.object({
  timezone: z.string().max(120).optional(),
  accent: z.enum(['cobalt', 'amber']).optional(),
  followedEntities: z.array(z.string().max(80)).optional(),
  mutedSources: z.array(z.string().max(120)).optional(),
  only24h: z.boolean().optional()
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId') || 'demo-user';
  const timezone = searchParams.get('timezone') || 'America/Chicago';
  const preferences = await getUserPreferences(userId, timezone);
  return NextResponse.json({
    preferences
  });
}

export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId') || 'demo-user';

  const payload = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid preference payload', details: parsed.error.issues }, { status: 400 });
  }

  const preferences = await patchUserPreferences(userId, parsed.data);
  return NextResponse.json({ preferences });
}
