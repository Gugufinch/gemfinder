import { BonafiedApp } from '@/components/bonafied/bonafied-app';
import { DEFAULT_TIMEZONE } from '@/lib/bonafied/constants';
import { getDossiers, getFiledStories, getLiveMeta, getSignalResponse, getUserPreferences } from '@/lib/bonafied/repository';
import { Channel } from '@/lib/bonafied/types';

const CHANNELS: Channel[] = ['TODAY', 'BUSINESS', 'TECHNOLOGY', 'MUSIC_INDUSTRY', 'PODCAST_CREATOR'];

export default async function Page({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const userId = first(params.userId) || 'demo-user';
  const timezone = first(params.timezone) || DEFAULT_TIMEZONE;
  const channel = parseChannel(first(params.channel));
  const q = first(params.q) || undefined;

  const preferences = await getUserPreferences(userId, timezone);
  const signal = await getSignalResponse({
    channel,
    timezone: preferences.timezone,
    only24h: preferences.only24h,
    search: q,
    userId
  });

  const [filed, live, dossiers] = await Promise.all([getFiledStories(userId), getLiveMeta(), getDossiers(userId)]);

  const initialPayload = {
    ...signal,
    filedStoryIds: filed.map((item) => item.storyId),
    live
  };

  return (
    <BonafiedApp
      initialPayload={initialPayload}
      initialPreferences={preferences}
      initialDossiers={dossiers}
      userId={userId}
    />
  );
}

function parseChannel(value?: string): Channel {
  if (!value) {
    return 'TODAY';
  }
  const normalized = value.toUpperCase();
  if (CHANNELS.includes(normalized as Channel)) {
    return normalized as Channel;
  }
  return 'TODAY';
}

function first(value?: string | string[]): string | undefined {
  if (!value) {
    return undefined;
  }
  return Array.isArray(value) ? value[0] : value;
}
