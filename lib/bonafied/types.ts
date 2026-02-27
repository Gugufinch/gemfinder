export type BonafiedCategory =
  | 'BUSINESS'
  | 'TECHNOLOGY'
  | 'MUSIC_INDUSTRY'
  | 'PODCAST_CREATOR';

export type Channel = 'TODAY' | BonafiedCategory;

export interface StoryRecord {
  id: string;
  title: string;
  url: string;
  sourceName: string;
  sourceUrl: string;
  publishedAt: string;
  category: BonafiedCategory;
  content: string;
  imageUrl?: string;
  summary: string;
  whyMatters: string[];
  entities: string[];
  rankScore: number;
  verified: boolean;
  publishedTimestampKnown: boolean;
}

export interface SignalCluster {
  id: string;
  category: BonafiedCategory;
  headline: string;
  primaryStoryId: string;
  storyIds: string[];
  sources: string[];
  entities: string[];
  score: number;
  latestPublishedAt: string;
}

export interface StoryWithCluster extends StoryRecord {
  cluster: SignalCluster;
  additionalSources: StoryRecord[];
}

export interface FeedConfig {
  id: string;
  name: string;
  url: string;
  category: BonafiedCategory;
  credibilityScore: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserPreferences {
  userId: string;
  timezone: string;
  accent: 'cobalt' | 'amber';
  followedEntities: string[];
  mutedSources: string[];
  only24h: boolean;
}

export interface FiledStory {
  userId: string;
  storyId: string;
  filedAt: string;
}

export interface Dossier {
  id: string;
  userId: string;
  name: string;
  notes: string;
  storyIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MagicLinkToken {
  token: string;
  email: string;
  expiresAt: string;
  createdAt: string;
}

export interface AuthUserCredential {
  userId: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'editor' | 'viewer';
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthPasswordResetToken {
  token: string;
  userId: string;
  email: string;
  expiresAt: string;
  createdAt: string;
}

export interface IngestionResult {
  fetchedFeeds: number;
  ingestedStories: number;
  droppedForTime: number;
  droppedForMissingTimestamp: number;
  droppedForDupes: number;
  clusteredSignals: number;
  ingestedAt: string;
}

export interface SignalQuery {
  channel: Channel;
  timezone: string;
  only24h: boolean;
  search?: string;
  limit?: number;
  userId?: string;
}

export interface SignalResponse {
  generatedAt: string;
  timezone: string;
  channel: Channel;
  hero: StoryWithCluster | null;
  rows: Array<{
    channel: Channel;
    title: string;
    stories: StoryWithCluster[];
  }>;
  newSignalCount: number;
}

export interface SearchResult {
  id: string;
  title: string;
  type: 'story' | 'entity' | 'topic';
  subtitle: string;
}
