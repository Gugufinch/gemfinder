import { NextResponse } from 'next/server';
import { getLiveMeta } from '@/lib/bonafied/repository';

export async function GET() {
  try {
    const live = await getLiveMeta();
    return NextResponse.json(live, {
      headers: {
        'Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    console.error('BONAFIED /api/signals/live failed', error);
    return NextResponse.json({ error: 'live_endpoint_failed' }, { status: 500 });
  }
}
