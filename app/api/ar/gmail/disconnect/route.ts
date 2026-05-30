import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserById } from '@/lib/gemfinder/auth-store';
import { deleteGmailConnection } from '@/lib/gemfinder/gmail-store';
import { getSessionUserId } from '@/lib/gemfinder/session';

export async function POST(req: NextRequest) {
  const userId = getSessionUserId(req);
  const actor = userId ? await getAuthUserById(userId) : null;
  if (!actor || !actor.active) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  await deleteGmailConnection(actor.userId);
  return NextResponse.json({ ok: true });
}
