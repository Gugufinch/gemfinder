import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthUserById } from '@/lib/gemfinder/auth-store';
import { relabelGmailArtist } from '@/lib/gemfinder/gmail-store';

const schema = z.object({
  projectId: z.string().min(1).max(120),
  previousArtistName: z.string().min(1).max(240),
  nextArtistName: z.string().min(1).max(240),
});

async function requireEditorActor(req: NextRequest) {
  const userId = req.cookies.get('ar_user')?.value || '';
  const actor = userId ? await getAuthUserById(userId) : null;
  if (!actor || !actor.active) {
    return { actor: null, response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  }
  if (actor.role === 'viewer') {
    return { actor: null, response: NextResponse.json({ error: 'Editor or admin role required' }, { status: 403 }) };
  }
  return { actor, response: null };
}

export async function POST(req: NextRequest) {
  const { response } = await requireEditorActor(req);
  if (response) return response;

  const payload = await req.json().catch(() => null);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid relabel payload', details: parsed.error.issues }, { status: 400 });
  }

  await relabelGmailArtist(
    parsed.data.projectId,
    parsed.data.previousArtistName,
    parsed.data.nextArtistName,
  );

  return NextResponse.json({ ok: true });
}
