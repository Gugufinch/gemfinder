import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { addStoryToDossier, createDossier, getDossiers } from '@/lib/bonafied/repository';

const createSchema = z.object({
  name: z.string().min(2).max(120),
  notes: z.string().max(2000).optional(),
  storyIds: z.array(z.string()).optional()
});

const addStorySchema = z.object({
  dossierId: z.string().min(4),
  storyId: z.string().min(4)
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId') || 'demo-user';
  const dossiers = await getDossiers(userId);
  return NextResponse.json({
    dossiers
  });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId') || 'demo-user';
  const mode = searchParams.get('mode') || 'create';

  const payload = await req.json().catch(() => null);
  if (mode === 'add-story') {
    const parsed = addStorySchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid add-story payload', details: parsed.error.issues }, { status: 400 });
    }

    const dossier = await addStoryToDossier(userId, parsed.data.dossierId, parsed.data.storyId);
    if (!dossier) {
      return NextResponse.json({ error: 'Dossier not found' }, { status: 404 });
    }

    return NextResponse.json({ dossier });
  }

  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid dossier payload', details: parsed.error.issues }, { status: 400 });
  }

  const dossier = await createDossier(userId, parsed.data);
  return NextResponse.json({ dossier }, { status: 201 });
}
