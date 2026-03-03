import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserById } from '@/lib/gemfinder/auth-store';
import { deleteGmailConnection } from '@/lib/gemfinder/gmail-store';

export async function POST(req: NextRequest) {
  const userId = req.cookies.get('ar_user')?.value || '';
  const actor = userId ? await getAuthUserById(userId) : null;
  if (!actor || !actor.active) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  await deleteGmailConnection(actor.userId);
  return NextResponse.json({ ok: true });
}
