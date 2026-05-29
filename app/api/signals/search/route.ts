import { NextRequest, NextResponse } from 'next/server';
import { searchSignals } from '@/lib/bonafied/repository';
import { Channel } from '@/lib/bonafied/types';

const CHANNELS: Channel[] = ['TODAY', 'BUSINESS', 'TECHNOLOGY', 'MUSIC_INDUSTRY', 'PODCAST_CREATOR'];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q') || '';
  const channel = parseChannel(searchParams.get('channel'));
  const results = await searchSignals(query, channel);

  return NextResponse.json({
    results
  });
}

function parseChannel(value: string | null): Channel {
  if (!value) {
    return 'TODAY';
  }
  const normalized = value.toUpperCase();
  return CHANNELS.includes(normalized as Channel) ? (normalized as Channel) : 'TODAY';
}
