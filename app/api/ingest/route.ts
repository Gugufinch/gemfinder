import { NextResponse } from 'next/server';
import { invalidateByPrefix } from '@/lib/bonafied/cache';
import { ingestFeeds } from '@/lib/bonafied/ingest';

export async function POST() {
  const result = await ingestFeeds();
  await invalidateByPrefix('signals:');
  return NextResponse.json(result);
}
