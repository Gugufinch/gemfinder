import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthUserById } from '@/lib/gemfinder/auth-store';
import { listProjectInbox, listThreadMessages, listWorkspaceGmailConnections } from '@/lib/gemfinder/gmail-store';

const querySchema = z.object({
  projectId: z.string().min(1).max(120),
  threadKey: z.string().max(240).optional(),
});

export async function GET(req: NextRequest) {
  const userId = req.cookies.get('ar_user')?.value || '';
  const actor = userId ? await getAuthUserById(userId) : null;
  if (!actor || !actor.active) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const parsed = querySchema.safeParse({
    projectId: req.nextUrl.searchParams.get('projectId') || '',
    threadKey: req.nextUrl.searchParams.get('threadKey') || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid inbox query', details: parsed.error.issues }, { status: 400 });
  }

  const inbox = await listProjectInbox(parsed.data.projectId);
  const messages = parsed.data.threadKey ? await listThreadMessages(parsed.data.threadKey) : [];
  const connections = await listWorkspaceGmailConnections();
  return NextResponse.json({ ok: true, threads: inbox.threads, messages, connections });
}
