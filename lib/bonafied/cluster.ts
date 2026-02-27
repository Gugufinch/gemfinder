import crypto from 'node:crypto';
import { SignalCluster, StoryRecord } from '@/lib/bonafied/types';
import { cosineSimilarity, jaccardSimilarity, normalizeTitle, tokenize } from '@/lib/bonafied/text';

interface ClusterState {
  cluster: SignalCluster;
  titleTokens: string[];
  stories: StoryRecord[];
}

const MIN_SIMILARITY = 0.62;

export function clusterStories(stories: StoryRecord[]): {
  clusters: SignalCluster[];
  stories: StoryRecord[];
} {
  const sorted = [...stories].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  const states: ClusterState[] = [];
  const seenByUrl = new Set<string>();
  const deduped: StoryRecord[] = [];

  for (const story of sorted) {
    const canonical = canonicalizeUrl(story.url);
    if (seenByUrl.has(canonical)) {
      continue;
    }
    seenByUrl.add(canonical);
    deduped.push(story);

    const storyTokens = tokenize(story.title);
    let bestState: ClusterState | null = null;
    let bestScore = 0;

    for (const state of states) {
      if (state.cluster.category !== story.category) {
        continue;
      }

      const score = similarityScore(storyTokens, state.titleTokens);
      if (score > bestScore) {
        bestScore = score;
        bestState = state;
      }
    }

    if (bestState && bestScore >= MIN_SIMILARITY) {
      bestState.stories.push(story);
      bestState.cluster.storyIds.push(story.id);
      if (!bestState.cluster.sources.includes(story.sourceName)) {
        bestState.cluster.sources.push(story.sourceName);
      }
      for (const entity of story.entities) {
        if (!bestState.cluster.entities.includes(entity)) {
          bestState.cluster.entities.push(entity);
        }
      }
      if (new Date(story.publishedAt).getTime() > new Date(bestState.cluster.latestPublishedAt).getTime()) {
        bestState.cluster.latestPublishedAt = story.publishedAt;
      }
      if (story.rankScore > getPrimary(bestState.stories).rankScore) {
        bestState.cluster.primaryStoryId = story.id;
        bestState.cluster.headline = story.title;
      }
      bestState.titleTokens = tokenize(bestState.cluster.headline);
      continue;
    }

    const clusterId = `cluster_${crypto
      .createHash('sha1')
      .update(`${story.category}:${normalizeTitle(story.title)}`)
      .digest('hex')
      .slice(0, 12)}`;

    states.push({
      stories: [story],
      titleTokens: tokenize(story.title),
      cluster: {
        id: clusterId,
        category: story.category,
        headline: story.title,
        primaryStoryId: story.id,
        storyIds: [story.id],
        sources: [story.sourceName],
        entities: [...story.entities],
        score: story.rankScore,
        latestPublishedAt: story.publishedAt
      }
    });
  }

  const clusterMap = new Map<string, SignalCluster>();
  for (const state of states) {
    clusterMap.set(state.cluster.id, state.cluster);
  }

  return {
    clusters: [...clusterMap.values()],
    stories: deduped
  };
}

function getPrimary(stories: StoryRecord[]): StoryRecord {
  return [...stories].sort((a, b) => b.rankScore - a.rankScore)[0] || stories[0];
}

function canonicalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    url.search = '';
    return url.toString();
  } catch {
    return value;
  }
}

function similarityScore(leftTokens: string[], rightTokens: string[]): number {
  const jaccard = jaccardSimilarity(leftTokens, rightTokens);
  const cosine = cosineSimilarity(leftTokens, rightTokens);
  return jaccard * 0.46 + cosine * 0.54;
}
