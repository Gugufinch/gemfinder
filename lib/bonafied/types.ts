export type Channel =
  | 'TODAY'
  | 'BUSINESS'
  | 'TECHNOLOGY'
  | 'MUSIC_INDUSTRY'
  | 'PODCAST_CREATOR';

export type FeedCategory = Exclude<Channel, 'TODAY'>;

export type Feed = {
  id: string;
  name: string;
  url: string;
  category: FeedCategory;
  credibilityScore: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SignalStory = {
  id: string;
  channel: Channel;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
  relevanceScore: number;
  tags: string[];
};

export type SignalResponse = {
  channel: Channel;
  timezone: string;
  only24h: boolean;
  generatedAt: string;
  stories: SignalStory[];
};

export type LiveMeta = {
  ingestCounter: number;
  lastIngestAt: string;
  activeFeedCount: number;
  totalStoryCount: number;
};

export type UserPreferences = {
  userId: string;
  timezone: string;
  accent: 'cobalt' | 'amber';
  followedEntities: string[];
  mutedSources: string[];
  only24h: boolean;
  updatedAt: string;
};

export type FiledStory = {
  storyId: string;
  filedAt: string;
};

export type Dossier = {
  id: string;
  userId: string;
  name: string;
  notes: string;
  storyIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type DossierExportFormat = 'markdown' | 'text';

export type MagicToken = {
  token: string;
  email: string;
  userId: string;
  expiresAt: string;
  consumed: boolean;
};
