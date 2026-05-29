import { NextRequest, NextResponse } from 'next/server';
import { getCached, setCached } from '@/lib/bonafied/cache';
import { DEFAULT_TIMEZONE } from '@/lib/bonafied/constants';
import { getFiledStories, getLiveMeta, getSignalResponse } from '@/lib/bonafied/repository';
import { Channel, SignalResponse } from '@/lib/bonafied/types';

const CHANNELS: Channel[] = ['TODAY', 'BUSINESS', 'TECHNOLOGY', 'MUSIC_INDUSTRY', 'PODCAST_CREATOR'];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const channel = parseChannel(searchParams.get('channel'));
    const timezone = searchParams.get('timezone') || DEFAULT_TIMEZONE;
    const query = searchParams.get('q') || undefined;
    const userId = searchParams.get('userId') || 'demo-user';
    const only24h = searchParams.get('only24h') !== 'false';

    const live = await getLiveMeta();
    const cacheKey = `signals:${live.ingestCounter}:${channel}:${timezone}:${only24h}:${query || ''}:${userId}`;
    const cached = await getCached<SignalResponse & { filedStoryIds: string[]; live: typeof live }>(cacheKey);

    if (cached) {
      return NextResponse.json(cached, {
        headers: {
          'Cache-Control': 'public, max-age=20, stale-while-revalidate=60'
        }
      });
    }

    const payload = await getSignalResponse({
      channel,
      timezone,
      only24h,
      search: query,
      userId
    });

    const filed = (await getFiledStories(userId)).map((item) => item.storyId);

    const response = {
      ...payload,
      filedStoryIds: filed,
      live
    };

    await setCached(cacheKey, response, 20_000);

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, max-age=20, stale-while-revalidate=60'
      }
    });
  } catch (error) {
    console.error('BONAFIED /api/signals failed', error);
    return NextResponse.json({ error: 'signals_endpoint_failed' }, { status: 500 });
  }
}

function parseChannel(value: string | null): Channel {
  if (!value) {
    return 'TODAY';
  }
  const upper = value.toUpperCase();
  if (CHANNELS.includes(upper as Channel)) {
    return upper as Channel;
  }
  return 'TODAY';
}
