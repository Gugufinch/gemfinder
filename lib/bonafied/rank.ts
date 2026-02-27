import { DEFAULT_SOURCE_CREDIBILITY } from '@/lib/bonafied/constants';
import { SignalCluster, StoryRecord, UserPreferences } from '@/lib/bonafied/types';

export function scoreStory(story: StoryRecord, clusterSize: number, preferences?: UserPreferences): number {
  const now = Date.now();
  const published = new Date(story.publishedAt).getTime();
  const ageHours = Math.max(0, (now - published) / 36e5);

  const freshness = clamp(42 - ageHours * 1.55, 0, 42);
  const sourceCred = (DEFAULT_SOURCE_CREDIBILITY[story.sourceName] || 0.62) * 24;

  const followed = preferences?.followedEntities || [];
  const interestEntityBoost = story.entities.some((entity) => followed.includes(entity)) ? 14 : 0;
  const categoryBoost = preferences ? 6 : 3;
  const confirmation = clamp((clusterSize - 1) * 4.5, 0, 16);

  return Math.round(clamp(freshness + sourceCred + interestEntityBoost + categoryBoost + confirmation, 0, 100));
}

export function scoreCluster(cluster: SignalCluster, stories: StoryRecord[]): number {
  const primary = stories.find((story) => story.id === cluster.primaryStoryId);
  if (!primary) {
    return 0;
  }

  const avgScore = stories.reduce((sum, story) => sum + story.rankScore, 0) / Math.max(stories.length, 1);
  const confirmationBonus = clamp((cluster.storyIds.length - 1) * 3.6, 0, 18);
  const recencyBonus = clamp(24 - hoursOld(cluster.latestPublishedAt), 0, 24);

  return Math.round(clamp(avgScore * 0.58 + confirmationBonus + recencyBonus * 0.42, 0, 100));
}

function hoursOld(iso: string): number {
  return Math.max(0, (Date.now() - new Date(iso).getTime()) / 36e5);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
