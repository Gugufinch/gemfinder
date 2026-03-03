import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthUserById } from '@/lib/gemfinder/auth-store';
import { listArtistInbox, listWorkspaceGmailConnections } from '@/lib/gemfinder/gmail-store';

const querySchema = z.object({
  projectId: z.string().min(1).max(120),
  artistName: z.string().min(1).max(220),
});

export async function GET(req: NextRequest) {
  const userId = req.cookies.get('ar_user')?.value || '';
  const actor = userId ? await getAuthUserById(userId) : null;
  if (!actor || !actor.active) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const parsed = querySchema.safeParse({
    projectId: req.nextUrl.searchParams.get('projectId') || '',
    artistName: req.nextUrl.searchParams.get('artistName') || '',
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid inbox query', details: parsed.error.issues }, { status: 400 });
  }

  const inbox = await listArtistInbox(parsed.data.projectId, parsed.data.artistName);
  const connections = await listWorkspaceGmailConnections();
  return NextResponse.json({ ok: true, ...inbox, connections });
}
