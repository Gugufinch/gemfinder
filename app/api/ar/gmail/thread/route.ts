import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthUserById } from '@/lib/gemfinder/auth-store';
import { updateGmailThreadWorkflow } from '@/lib/gemfinder/gmail-store';

const schema = z.object({
  threadKey: z.string().min(1).max(240),
  threadOwnerUserId: z.string().max(120).optional(),
  status: z.enum(['open', 'waiting', 'closed']).optional(),
  nextFollowUpAt: z.string().max(40).optional(),
  internalNote: z.string().max(4000).optional(),
});

export async function PATCH(req: NextRequest) {
  const userId = req.cookies.get('ar_user')?.value || '';
  const actor = userId ? await getAuthUserById(userId) : null;
  if (!actor || !actor.active) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (actor.role === 'viewer') {
    return NextResponse.json({ error: 'Editor or admin role required' }, { status: 403 });
  }

  const payload = await req.json().catch(() => null);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid thread update payload', details: parsed.error.issues }, { status: 400 });
  }

  const thread = await updateGmailThreadWorkflow(parsed.data.threadKey, {
    threadOwnerUserId: parsed.data.threadOwnerUserId,
    status: parsed.data.status,
    nextFollowUpAt: parsed.data.nextFollowUpAt,
    internalNote: parsed.data.internalNote,
  }, actor.email);
  if (!thread) {
    return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, thread });
}
