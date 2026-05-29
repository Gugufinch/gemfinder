import { DEFAULT_TIMEZONE, MAGIC_TOKEN_TTL_MS } from '@/lib/bonafied/constants';
import type {
  Channel,
  Dossier,
  DossierExportFormat,
  Feed,
  FeedCategory,
  FiledStory,
  LiveMeta,
  MagicToken,
  SignalResponse,
  SignalStory,
  UserPreferences,
} from '@/lib/bonafied/types';

type SignalRequest = {
  channel: Channel;
  timezone: string;
  only24h: boolean;
  search?: string;
  userId: string;
};

type FeedCreateInput = {
  name: string;
  url: string;
  category: FeedCategory;
  credibilityScore: number;
  active: boolean;
};

type FeedPatchInput = Partial<FeedCreateInput>;

type PreferencePatchInput = Partial<
  Pick<UserPreferences, 'timezone' | 'accent' | 'followedEntities' | 'mutedSources' | 'only24h'>
>;

type DossierCreateInput = {
  name: string;
  notes?: string;
  storyIds?: string[];
};

type MemoryStore = {
  feeds: Feed[];
  stories: SignalStory[];
  preferences: Map<string, UserPreferences>;
  filedByUser: Map<string, FiledStory[]>;
  dossiersByUser: Map<string, Dossier[]>;
  magicTokens: Map<string, MagicToken>;
  liveMeta: LiveMeta;
};

const GLOBAL_KEY = '__bonafied_memory_store_v1__';
const CHANNEL_ORDER: Channel[] = ['TODAY', 'BUSINESS', 'TECHNOLOGY', 'MUSIC_INDUSTRY', 'PODCAST_CREATOR'];

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(16).slice(2, 10);
  return `${prefix}-${uuid}`;
}

function seededStories(): SignalStory[] {
  const now = Date.now();
  const hour = 60 * 60 * 1000;

  return [
    {
      id: createId('story'),
      channel: 'TECHNOLOGY',
      title: 'Agent orchestration tooling matures around observability',
      summary: 'New releases emphasize tracing, guardrails, and replay for production agent systems.',
      source: 'Tech Brief',
      url: 'https://example.com/agent-observability',
      publishedAt: new Date(now - 3 * hour).toISOString(),
      relevanceScore: 86,
      tags: ['agents', 'observability', 'llm'],
    },
    {
      id: createId('story'),
      channel: 'BUSINESS',
      title: 'Enterprise copilots shift spending toward workflow-specific tools',
      summary: 'Budget moves from generic chat tools to integrated workflow copilots with analytics.',
      source: 'Market Watch',
      url: 'https://example.com/enterprise-copilots',
      publishedAt: new Date(now - 6 * hour).toISOString(),
      relevanceScore: 80,
      tags: ['enterprise', 'copilot', 'budget'],
    },
    {
      id: createId('story'),
      channel: 'MUSIC_INDUSTRY',
      title: 'Artist tooling stacks blend fan CRM with content scheduling',
      summary: 'Labels and independents converge on integrated fan intelligence and campaign tooling.',
      source: 'Music Intel',
      url: 'https://example.com/music-fan-crm',
      publishedAt: new Date(now - 9 * hour).toISOString(),
      relevanceScore: 74,
      tags: ['music', 'crm', 'campaigns'],
    },
    {
      id: createId('story'),
      channel: 'PODCAST_CREATOR',
      title: 'Podcast teams adopt clip-first growth workflows',
      summary: 'Short-form clip pipelines become the default acquisition strategy across major shows.',
      source: 'Creator Daily',
      url: 'https://example.com/podcast-clip-growth',
      publishedAt: new Date(now - 14 * hour).toISOString(),
      relevanceScore: 69,
      tags: ['podcast', 'growth', 'clips'],
    },
    {
      id: createId('story'),
      channel: 'TECHNOLOGY',
      title: 'Open-source eval frameworks tighten model regression checks',
      summary: 'Teams standardize eval suites to manage model and prompt regressions before release.',
      source: 'Engineering Notes',
      url: 'https://example.com/eval-frameworks',
      publishedAt: new Date(now - 22 * hour).toISOString(),
      relevanceScore: 77,
      tags: ['evaluation', 'opensource', 'quality'],
    },
  ];
}

function seededFeeds(): Feed[] {
  const t = nowIso();
  return [
    {
      id: createId('feed'),
      name: 'Tech Brief',
      url: 'https://example.com/feeds/tech',
      category: 'TECHNOLOGY',
      credibilityScore: 0.82,
      active: true,
      createdAt: t,
      updatedAt: t,
    },
    {
      id: createId('feed'),
      name: 'Market Watch',
      url: 'https://example.com/feeds/business',
      category: 'BUSINESS',
      credibilityScore: 0.79,
      active: true,
      createdAt: t,
      updatedAt: t,
    },
    {
      id: createId('feed'),
      name: 'Creator Daily',
      url: 'https://example.com/feeds/podcast',
      category: 'PODCAST_CREATOR',
      credibilityScore: 0.73,
      active: true,
      createdAt: t,
      updatedAt: t,
    },
  ];
}

function normalizeEmailToUserId(email: string) {
  const local = String(email || '').split('@')[0] || 'user';
  const safe = local.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'user';
  return `user-${safe}`;
}

function getStore(): MemoryStore {
  const g = globalThis as typeof globalThis & { [GLOBAL_KEY]?: MemoryStore };
  if (!g[GLOBAL_KEY]) {
    const initialStories = seededStories();
    g[GLOBAL_KEY] = {
      feeds: seededFeeds(),
      stories: initialStories,
      preferences: new Map<string, UserPreferences>(),
      filedByUser: new Map<string, FiledStory[]>(),
      dossiersByUser: new Map<string, Dossier[]>(),
      magicTokens: new Map<string, MagicToken>(),
      liveMeta: {
        ingestCounter: 1,
        lastIngestAt: nowIso(),
        activeFeedCount: 3,
        totalStoryCount: initialStories.length,
      },
    };
  }
  return g[GLOBAL_KEY] as MemoryStore;
}

function stableSortStories(items: SignalStory[]) {
  return [...items].sort((a, b) => {
    const t = new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    if (t !== 0) return t;
    return b.relevanceScore - a.relevanceScore;
  });
}

function defaultPreferences(userId: string, timezone = DEFAULT_TIMEZONE): UserPreferences {
  return {
    userId,
    timezone,
    accent: 'cobalt',
    followedEntities: [],
    mutedSources: [],
    only24h: true,
    updatedAt: nowIso(),
  };
}

function getUserPrefInternal(userId: string, timezone?: string) {
  const store = getStore();
  const existing = store.preferences.get(userId);
  if (existing) return existing;
  const created = defaultPreferences(userId, timezone || DEFAULT_TIMEZONE);
  store.preferences.set(userId, created);
  return created;
}

function filterStoriesBySignalRequest(stories: SignalStory[], input: SignalRequest) {
  const pref = getUserPrefInternal(input.userId, input.timezone);
  const now = Date.now();
  const q = String(input.search || '').trim().toLowerCase();

  let next = [...stories];

  if (input.channel !== 'TODAY') {
    next = next.filter(story => story.channel === input.channel);
  }

  const shouldOnly24h = input.only24h ?? pref.only24h;
  if (shouldOnly24h) {
    next = next.filter(story => now - new Date(story.publishedAt).getTime() <= 24 * 60 * 60 * 1000);
  }

  if (pref.mutedSources.length) {
    const muted = new Set(pref.mutedSources.map(item => item.toLowerCase()));
    next = next.filter(story => !muted.has(story.source.toLowerCase()));
  }

  if (q) {
    next = next.filter(story => {
      const hay = `${story.title} ${story.summary} ${story.source} ${story.tags.join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }

  return stableSortStories(next);
}

function refreshLiveMeta() {
  const store = getStore();
  store.liveMeta = {
    ...store.liveMeta,
    activeFeedCount: store.feeds.filter(feed => feed.active).length,
    totalStoryCount: store.stories.length,
  };
}

export function getFeeds() {
  return Promise.resolve([...getStore().feeds].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
}

export function addFeed(input: FeedCreateInput) {
  const store = getStore();
  const now = nowIso();
  const feed: Feed = {
    id: createId('feed'),
    name: input.name,
    url: input.url,
    category: input.category,
    credibilityScore: Math.max(0, Math.min(1, input.credibilityScore)),
    active: Boolean(input.active),
    createdAt: now,
    updatedAt: now,
  };
  store.feeds.unshift(feed);
  refreshLiveMeta();
  return Promise.resolve(feed);
}

export function updateFeed(id: string, patch: FeedPatchInput) {
  const store = getStore();
  const index = store.feeds.findIndex(feed => feed.id === id);
  if (index < 0) return Promise.resolve(null);

  const existing = store.feeds[index];
  const next: Feed = {
    ...existing,
    ...patch,
    credibilityScore: patch.credibilityScore === undefined
      ? existing.credibilityScore
      : Math.max(0, Math.min(1, patch.credibilityScore)),
    updatedAt: nowIso(),
  };

  store.feeds[index] = next;
  refreshLiveMeta();
  return Promise.resolve(next);
}

export async function getSignalResponse(input: SignalRequest): Promise<SignalResponse> {
  const store = getStore();
  const filtered = filterStoriesBySignalRequest(store.stories, input);

  return {
    channel: input.channel,
    timezone: input.timezone || DEFAULT_TIMEZONE,
    only24h: input.only24h,
    generatedAt: nowIso(),
    stories: filtered.slice(0, 80),
  };
}

export async function searchSignals(query: string, channel: Channel) {
  const payload = await getSignalResponse({
    channel,
    timezone: DEFAULT_TIMEZONE,
    only24h: false,
    search: query,
    userId: 'search-user',
  });
  return payload.stories.slice(0, 25);
}

export function getLiveMeta(): Promise<LiveMeta> {
  refreshLiveMeta();
  return Promise.resolve({ ...getStore().liveMeta });
}

export function getFiledStories(userId: string): Promise<FiledStory[]> {
  const store = getStore();
  return Promise.resolve([...(store.filedByUser.get(userId) || [])]);
}

export function setFiled(userId: string, storyId: string, filed: boolean): Promise<FiledStory[]> {
  const store = getStore();
  const current = [...(store.filedByUser.get(userId) || [])];
  const exists = current.some(item => item.storyId === storyId);

  if (filed && !exists) {
    current.unshift({ storyId, filedAt: nowIso() });
  }
  if (!filed && exists) {
    const filtered = current.filter(item => item.storyId !== storyId);
    store.filedByUser.set(userId, filtered);
    return Promise.resolve(filtered);
  }

  store.filedByUser.set(userId, current);
  return Promise.resolve(current);
}

export function getUserPreferences(userId: string, timezone: string): Promise<UserPreferences> {
  return Promise.resolve({ ...getUserPrefInternal(userId, timezone) });
}

export function patchUserPreferences(userId: string, patch: PreferencePatchInput): Promise<UserPreferences> {
  const store = getStore();
  const current = getUserPrefInternal(userId);
  const next: UserPreferences = {
    ...current,
    ...patch,
    timezone: patch.timezone || current.timezone,
    followedEntities: patch.followedEntities ? [...patch.followedEntities] : current.followedEntities,
    mutedSources: patch.mutedSources ? [...patch.mutedSources] : current.mutedSources,
    updatedAt: nowIso(),
  };
  store.preferences.set(userId, next);
  return Promise.resolve(next);
}

export function getDossiers(userId: string): Promise<Dossier[]> {
  const store = getStore();
  return Promise.resolve([...(store.dossiersByUser.get(userId) || [])]);
}

export function createDossier(userId: string, input: DossierCreateInput): Promise<Dossier> {
  const store = getStore();
  const list = [...(store.dossiersByUser.get(userId) || [])];
  const now = nowIso();
  const dossier: Dossier = {
    id: createId('dossier'),
    userId,
    name: input.name,
    notes: input.notes || '',
    storyIds: [...(input.storyIds || [])],
    createdAt: now,
    updatedAt: now,
  };
  list.unshift(dossier);
  store.dossiersByUser.set(userId, list);
  return Promise.resolve(dossier);
}

export function addStoryToDossier(userId: string, dossierId: string, storyId: string): Promise<Dossier | null> {
  const store = getStore();
  const list = [...(store.dossiersByUser.get(userId) || [])];
  const index = list.findIndex(item => item.id === dossierId);
  if (index < 0) return Promise.resolve(null);

  const dossier = list[index];
  if (!dossier.storyIds.includes(storyId)) {
    dossier.storyIds = [...dossier.storyIds, storyId];
    dossier.updatedAt = nowIso();
    list[index] = dossier;
    store.dossiersByUser.set(userId, list);
  }

  return Promise.resolve(dossier);
}

export async function exportDossier(userId: string, dossierId: string, format: DossierExportFormat): Promise<string | null> {
  const store = getStore();
  const dossier = (store.dossiersByUser.get(userId) || []).find(item => item.id === dossierId);
  if (!dossier) return null;

  const storyMap = new Map(store.stories.map(story => [story.id, story]));
  const stories = dossier.storyIds
    .map(id => storyMap.get(id))
    .filter((item): item is SignalStory => Boolean(item));

  if (format === 'text') {
    const lines = [
      `Dossier: ${dossier.name}`,
      `Updated: ${dossier.updatedAt}`,
      '',
      dossier.notes ? `Notes: ${dossier.notes}` : 'Notes: (none)',
      '',
      'Stories:',
      ...stories.map((story, index) => `${index + 1}. ${story.title} (${story.source})\n   ${story.url}`),
    ];
    return lines.join('\n');
  }

  const markdown = [
    `# ${dossier.name}`,
    '',
    `- Updated: ${dossier.updatedAt}`,
    `- Story count: ${stories.length}`,
    '',
    '## Notes',
    '',
    dossier.notes || '_No notes_',
    '',
    '## Stories',
    '',
    ...stories.map(
      (story, index) =>
        `${index + 1}. **${story.title}** (${story.source})\n   - Channel: ${story.channel}\n   - URL: ${story.url}\n   - Summary: ${story.summary}`
    ),
  ];

  return markdown.join('\n');
}

export function createMagicToken(email: string): Promise<{ token: string; expiresAt: string }> {
  const store = getStore();
  const token = createId('magic');
  const expiresAt = new Date(Date.now() + MAGIC_TOKEN_TTL_MS).toISOString();
  const payload: MagicToken = {
    token,
    email: email.toLowerCase(),
    userId: normalizeEmailToUserId(email),
    expiresAt,
    consumed: false,
  };

  store.magicTokens.set(token, payload);
  return Promise.resolve({ token, expiresAt });
}

export function consumeMagicToken(token: string): Promise<{ userId: string; email: string } | null> {
  const store = getStore();
  const entry = store.magicTokens.get(token);
  if (!entry) return Promise.resolve(null);

  const expired = Date.now() > new Date(entry.expiresAt).getTime();
  if (entry.consumed || expired) {
    return Promise.resolve(null);
  }

  entry.consumed = true;
  store.magicTokens.set(token, entry);
  return Promise.resolve({ userId: entry.userId, email: entry.email });
}

export async function runIngestCycle() {
  const store = getStore();
  const activeFeeds = store.feeds.filter(feed => feed.active);

  const generated: SignalStory[] = activeFeeds.map((feed, index) => {
    const channel = feed.category as Channel;
    const freshnessOffsetMs = index * 17 * 60 * 1000;
    const relevance = Math.round(Math.max(45, Math.min(95, 62 + feed.credibilityScore * 30 + (index % 7))));

    return {
      id: createId('story'),
      channel,
      title: `${feed.name}: automated digest ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
      summary: `Auto-ingested signal generated from ${feed.name} for ${channel.toLowerCase().replace('_', ' ')} monitoring.`,
      source: feed.name,
      url: `${feed.url}?t=${Date.now()}`,
      publishedAt: new Date(Date.now() - freshnessOffsetMs).toISOString(),
      relevanceScore: relevance,
      tags: ['ingested', channel.toLowerCase()],
    };
  });

  store.stories = stableSortStories([...generated, ...store.stories]).slice(0, 300);
  store.liveMeta = {
    ingestCounter: store.liveMeta.ingestCounter + 1,
    lastIngestAt: nowIso(),
    activeFeedCount: activeFeeds.length,
    totalStoryCount: store.stories.length,
  };

  return {
    ingested: generated.length,
    totalStories: store.stories.length,
    activeFeeds: activeFeeds.length,
    ingestCounter: store.liveMeta.ingestCounter,
    lastIngestAt: store.liveMeta.lastIngestAt,
  };
}

export function getChannels() {
  return [...CHANNEL_ORDER];
}
