import { NextRequest, NextResponse } from 'next/server';
import { invalidateByPrefix } from '@/lib/bonafied/cache';
import { ingestFeeds } from '@/lib/bonafied/ingest';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const secret = process.env.INGEST_CRON_SECRET || process.env.CRON_SECRET || '';

  if (secret) {
    const authHeader = req.headers.get('authorization') || '';
    const xSecret = req.headers.get('x-cron-secret') || '';
    const querySecret = new URL(req.url).searchParams.get('secret') || '';

    const authorized =
      authHeader === `Bearer ${secret}` ||
      authHeader === secret ||
      xSecret === secret ||
      querySecret === secret;

    if (!authorized) {
      return NextResponse.json({ error: 'Unauthorized cron invocation' }, { status: 401 });
    }
  }

  const result = await ingestFeeds();
  await invalidateByPrefix('signals:');

  return NextResponse.json({
    ok: true,
    ...result
  });
}
