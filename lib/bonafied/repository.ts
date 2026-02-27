import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CATEGORY_ROW_LABELS, CHANNEL_ORDER, DEFAULT_FEEDS, DEFAULT_TIMEZONE } from '@/lib/bonafied/constants';
import { clusterStories } from '@/lib/bonafied/cluster';
import {
  hasPostgres,
  loadSnapshotFromPostgres,
  type PersistedSnapshot,
  saveSnapshotToPostgres
} from '@/lib/bonafied/postgres';
import { isStrongSearchMatch } from '@/lib/bonafied/search';
import { buildSeedStories } from '@/lib/bonafied/seed';
import { scoreCluster, scoreStory } from '@/lib/bonafied/rank';
import { parseTimezone, withinLast24Hours } from '@/lib/bonafied/time';
import {
  AuthPasswordResetToken,
  AuthUserCredential,
  Channel,
  Dossier,
  FeedConfig,
  FiledStory,
  MagicLinkToken,
  SearchResult,
  SignalCluster,
  SignalQuery,
  SignalResponse,
  StoryRecord,
  StoryWithCluster,
  UserPreferences
} from '@/lib/bonafied/types';

interface Store {
  stories: StoryRecord[];
  clusters: SignalCluster[];
  feeds: FeedConfig[];
  filed: FiledStory[];
  dossiers: Dossier[];
  preferences: Map<string, UserPreferences>;
  magicTokens: Map<string, MagicLinkToken>;
  authUsers: Map<string, AuthUserCredential>;
  authPasswordResetTokens: Map<string, AuthPasswordResetToken>;
  lastIngestAt: string;
  ingestCounter: number;
}

const store: Store = {
  stories: [],
  clusters: [],
  feeds: [],
  filed: [],
  dossiers: [],
  preferences: new Map(),
  magicTokens: new Map(),
  authUsers: new Map(),
  authPasswordResetTokens: new Map(),
  lastIngestAt: new Date().toISOString(),
  ingestCounter: 0
};

let bootstrapped = false;
let bootstrapPromise: Promise<void> | null = null;
let postgresDisabled = false;

const LOCAL_SNAPSHOT_PATH =
  process.env.BONAFIED_LOCAL_SNAPSHOT_PATH || path.join(process.cwd(), 'data', 'bonafied-snapshot.local.json');

function shouldUsePostgres(): boolean {
  return hasPostgres() && !postgresDisabled;
}

function markPostgresDisabled(error: unknown): void {
  if (!postgresDisabled) {
    const message = error instanceof Error ? error.message : String(error || 'unknown error');
    console.warn(`BONAFIED disabling Postgres for this runtime: ${message}`);
  }
  postgresDisabled = true;
}

function isValidSnapshot(value: unknown): value is PersistedSnapshot {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<PersistedSnapshot>;
  return (
    Array.isArray(v.stories) &&
    Array.isArray(v.clusters) &&
    Array.isArray(v.feeds) &&
    Array.isArray(v.filed) &&
    Array.isArray(v.dossiers) &&
    Array.isArray(v.preferences) &&
    Array.isArray(v.magicTokens) &&
    Array.isArray(v.authUsers) &&
    Array.isArray(v.authPasswordResetTokens) &&
    typeof v.lastIngestAt === 'string' &&
    typeof v.ingestCounter === 'number'
  );
}

async function loadSnapshotFromDisk(): Promise<PersistedSnapshot | null> {
  try {
    const raw = await fs.readFile(LOCAL_SNAPSHOT_PATH, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidSnapshot(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function saveSnapshotToDisk(snapshot: PersistedSnapshot): Promise<void> {
  try {
    await fs.mkdir(path.dirname(LOCAL_SNAPSHOT_PATH), { recursive: true });
    await fs.writeFile(LOCAL_SNAPSHOT_PATH, JSON.stringify(snapshot), 'utf8');
  } catch (error) {
    console.warn('BONAFIED local snapshot save failed', error);
  }
}

async function persistSnapshot(snapshot: PersistedSnapshot): Promise<void> {
  let savedToPostgres = false;
  if (shouldUsePostgres()) {
    try {
      await saveSnapshotToPostgres(snapshot);
      savedToPostgres = true;
    } catch (error) {
      markPostgresDisabled(error);
    }
  }

  if (!savedToPostgres) {
    await saveSnapshotToDisk(snapshot);
  }
}

export async function ensureBootstrapped(): Promise<void> {
  if (bootstrapped) {
    return;
  }
  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  bootstrapPromise = (async () => {
    let loaded = false;
    if (shouldUsePostgres()) {
      try {
        const snapshot = await loadSnapshotFromPostgres();
        hydrateFromSnapshot(snapshot);
        loaded = true;
      } catch (error) {
        markPostgresDisabled(error);
      }
    }

    if (!loaded) {
      const diskSnapshot = await loadSnapshotFromDisk();
      if (diskSnapshot) {
        hydrateFromSnapshot(diskSnapshot);
        loaded = true;
      }
    }

    if (!loaded) {
      store.stories = buildSeedStories();
      store.feeds = [...DEFAULT_FEEDS];
      recomputeSignalsInStore(store);
      store.lastIngestAt = new Date().toISOString();
      store.ingestCounter = 1;
    }

    let changed = false;

    if (!store.feeds.length) {
      store.feeds = [...DEFAULT_FEEDS];
      changed = true;
    } else {
      const mergedFeeds = mergeDefaultFeeds(store.feeds);
      if (mergedFeeds.changed) {
        store.feeds = mergedFeeds.feeds;
        changed = true;
      }
    }

    if (!store.stories.length) {
      store.stories = buildSeedStories();
      recomputeSignalsInStore(store);
      changed = true;
    }

    if (store.stories.length && !store.clusters.length) {
      recomputeSignalsInStore(store);
      changed = true;
    }

    if (changed) {
      store.lastIngestAt = new Date().toISOString();
      store.ingestCounter = Math.max(store.ingestCounter, 1);
      await persistSnapshot(toSnapshot(store));
    }

    bootstrapped = true;
  })();

  return bootstrapPromise;
}

async function readStore(): Promise<Store> {
  await ensureBootstrapped();

  if (shouldUsePostgres()) {
    try {
      const snapshot = await loadSnapshotFromPostgres();
      hydrateFromSnapshot(snapshot);
    } catch (error) {
      markPostgresDisabled(error);
    }
  }

  if (!shouldUsePostgres()) {
    const diskSnapshot = await loadSnapshotFromDisk();
    if (diskSnapshot) {
      hydrateFromSnapshot(diskSnapshot);
    }
  }

  return cloneStore(store);
}

async function commitStore(next: Store): Promise<void> {
  const cloned = cloneStore(next);

  store.stories = cloned.stories;
  store.clusters = cloned.clusters;
  store.feeds = cloned.feeds;
  store.filed = cloned.filed;
  store.dossiers = cloned.dossiers;
  store.preferences = cloned.preferences;
  store.magicTokens = cloned.magicTokens;
  store.authUsers = cloned.authUsers;
  store.authPasswordResetTokens = cloned.authPasswordResetTokens;
  store.lastIngestAt = cloned.lastIngestAt;
  store.ingestCounter = cloned.ingestCounter;

  await persistSnapshot(toSnapshot(cloned));
}

export async function getSignalResponse(query: SignalQuery): Promise<SignalResponse> {
  const current = await readStore();

  const timezone = parseTimezone(query.timezone || DEFAULT_TIMEZONE);
  const user =
    query.userId && current.preferences.get(query.userId)
      ? current.preferences.get(query.userId)!
      : defaultPreferences(query.userId || 'demo-user', timezone);

  const visibleStories = filterStories(current.stories, {
    channel: query.channel,
    only24h: query.only24h,
    search: query.search,
    mutedSources: user.mutedSources
  });

  const storyIds = new Set(visibleStories.map((story) => story.id));

  const clusterViews = current.clusters
    .map((cluster) => {
      const clusterStoriesVisible = cluster.storyIds
        .map((id) => visibleStories.find((story) => story.id === id))
        .filter(Boolean) as StoryRecord[];

      if (!clusterStoriesVisible.length) {
        return null;
      }

      const rankedStories = clusterStoriesVisible
        .map((story) => ({
          ...story,
          rankScore: scoreStory(story, clusterStoriesVisible.length, user)
        }))
        .sort((a, b) => b.rankScore - a.rankScore);

      const primary = rankedStories[0];
      const clusterView: SignalCluster = {
        ...cluster,
        storyIds: rankedStories.map((story) => story.id),
        primaryStoryId: primary.id,
        headline: primary.title,
        latestPublishedAt: rankedStories
          .map((story) => story.publishedAt)
          .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0],
        score: scoreCluster(cluster, rankedStories)
      };

      return {
        cluster: clusterView,
        primary,
        additionalSources: rankedStories.slice(1)
      };
    })
    .filter(Boolean) as Array<{ cluster: SignalCluster; primary: StoryRecord; additionalSources: StoryRecord[] }>;

  clusterViews.sort((a, b) => {
    if (b.cluster.score === a.cluster.score) {
      return new Date(b.cluster.latestPublishedAt).getTime() - new Date(a.cluster.latestPublishedAt).getTime();
    }
    return b.cluster.score - a.cluster.score;
  });

  const toStoryWithCluster = (view: {
    cluster: SignalCluster;
    primary: StoryRecord;
    additionalSources: StoryRecord[];
  }): StoryWithCluster => ({
    ...view.primary,
    cluster: view.cluster,
    additionalSources: view.additionalSources
  });

  const hero = clusterViews[0] ? toStoryWithCluster(clusterViews[0]) : null;
  const channelRows = buildRows(query.channel, clusterViews, toStoryWithCluster);

  const newSignalCount = [...storyIds].filter((id) => {
    const story = current.stories.find((item) => item.id === id);
    if (!story) {
      return false;
    }
    return Date.now() - new Date(story.publishedAt).getTime() <= 20 * 60 * 1000;
  }).length;

  return {
    generatedAt: new Date().toISOString(),
    timezone,
    channel: query.channel,
    hero,
    rows: channelRows,
    newSignalCount
  };
}

function buildRows(
  channel: Channel,
  clusterViews: Array<{ cluster: SignalCluster; primary: StoryRecord; additionalSources: StoryRecord[] }>,
  mapper: (view: {
    cluster: SignalCluster;
    primary: StoryRecord;
    additionalSources: StoryRecord[];
  }) => StoryWithCluster
): SignalResponse['rows'] {
  if (channel === 'TODAY') {
    return CHANNEL_ORDER.filter((item) => item !== 'TODAY').map((category) => {
      const stories = clusterViews.filter((view) => view.cluster.category === category).slice(0, 8).map(mapper);
      return {
        channel: category,
        title: CATEGORY_ROW_LABELS[category],
        stories
      };
    });
  }

  return [
    {
      channel,
      title: CATEGORY_ROW_LABELS[channel],
      stories: clusterViews.filter((view) => view.cluster.category === channel).slice(0, 12).map(mapper)
    }
  ];
}

function filterStories(
  stories: StoryRecord[],
  options: {
    channel: Channel;
    only24h: boolean;
    search?: string;
    mutedSources: string[];
  }
): StoryRecord[] {
  const query = options.search?.trim() || '';

  return stories.filter((story) => {
    if (!story.verified || !story.publishedTimestampKnown) {
      return false;
    }
    if (options.only24h && !withinLast24Hours(story.publishedAt)) {
      return false;
    }
    if (options.channel !== 'TODAY' && story.category !== options.channel) {
      return false;
    }
    if (options.mutedSources.includes(story.sourceName)) {
      return false;
    }
    if (!query) {
      return true;
    }
    return isStrongSearchMatch(story, query, 5);
  });
}

export async function replaceSignals(stories: StoryRecord[]): Promise<{ clusters: number; stories: number }> {
  const current = await readStore();
  current.stories = stories;
  recomputeSignalsInStore(current);
  current.lastIngestAt = new Date().toISOString();
  current.ingestCounter += 1;

  await commitStore(current);

  return {
    clusters: current.clusters.length,
    stories: current.stories.length
  };
}

export async function mergeSignals(stories: StoryRecord[]): Promise<{ clusters: number; stories: number; inserted: number }> {
  const current = await readStore();

  const existingByUrl = new Map<string, StoryRecord>();
  for (const story of current.stories) {
    existingByUrl.set(canonicalizeUrl(story.url), story);
  }

  let inserted = 0;
  for (const story of stories) {
    const key = canonicalizeUrl(story.url);
    if (existingByUrl.has(key)) {
      continue;
    }
    existingByUrl.set(key, story);
    current.stories.push(story);
    inserted += 1;
  }

  recomputeSignalsInStore(current);
  current.lastIngestAt = new Date().toISOString();
  current.ingestCounter += 1;

  await commitStore(current);

  return {
    clusters: current.clusters.length,
    stories: current.stories.length,
    inserted
  };
}

function recomputeSignalsInStore(target: Store): void {
  const seededScores = target.stories.map((story) => ({
    ...story,
    rankScore: scoreStory(story, 1)
  }));

  const { clusters, stories } = clusterStories(seededScores);

  const withClusterScores = stories.map((story) => {
    const cluster = clusters.find((item) => item.storyIds.includes(story.id));
    const clusterSize = cluster ? cluster.storyIds.length : 1;
    return {
      ...story,
      rankScore: scoreStory(story, clusterSize)
    };
  });

  const reclustered = clusterStories(withClusterScores);
  const rescoredClusters = reclustered.clusters.map((cluster) => {
    const items = reclustered.stories.filter((story) => cluster.storyIds.includes(story.id));
    return {
      ...cluster,
      score: scoreCluster(cluster, items)
    };
  });

  target.stories = withClusterScores;
  target.clusters = rescoredClusters;
}

export async function getLiveMeta(): Promise<{
  lastIngestAt: string;
  ingestCounter: number;
  recentCount: number;
}> {
  const current = await readStore();
  const recentCount = current.stories.filter((story) => Date.now() - new Date(story.publishedAt).getTime() <= 15 * 60 * 1000)
    .length;

  return {
    lastIngestAt: current.lastIngestAt,
    ingestCounter: current.ingestCounter,
    recentCount
  };
}

export async function searchSignals(term: string, channel: Channel = 'TODAY'): Promise<SearchResult[]> {
  const current = await readStore();
  const q = term.trim().toLowerCase();
  if (!q) {
    return [];
  }

  const stories = filterStories(current.stories, {
    channel,
    only24h: true,
    mutedSources: [],
    search: q
  }).slice(0, 10);

  const entities = new Set<string>();
  for (const story of stories) {
    for (const entity of story.entities) {
      if (entity.toLowerCase().includes(q)) {
        entities.add(entity);
      }
      if (entities.size >= 5) {
        break;
      }
    }
  }

  const topics = new Set<string>();
  for (const story of stories) {
    const words = story.title.split(' ').slice(0, 5).join(' ');
    topics.add(words);
    if (topics.size >= 5) {
      break;
    }
  }

  const storyResults: SearchResult[] = stories.map((story) => ({
    id: story.id,
    title: story.title,
    subtitle: `${story.sourceName} • ${story.category.replace('_', ' ')}`,
    type: 'story'
  }));

  const entityResults: SearchResult[] = [...entities].map((entity) => ({
    id: `entity_${entity}`,
    title: entity,
    subtitle: 'Entity',
    type: 'entity'
  }));

  const topicResults: SearchResult[] = [...topics].map((topic) => ({
    id: `topic_${topic}`,
    title: topic,
    subtitle: 'Topic',
    type: 'topic'
  }));

  return [...storyResults, ...entityResults, ...topicResults].slice(0, 14);
}

export async function getFeeds(): Promise<FeedConfig[]> {
  const current = await readStore();
  return [...current.feeds].sort((a, b) => a.name.localeCompare(b.name));
}

export async function addFeed(input: Omit<FeedConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<FeedConfig> {
  const current = await readStore();
  const now = new Date().toISOString();
  const feed: FeedConfig = {
    ...input,
    id: `feed_${crypto.randomBytes(6).toString('hex')}`,
    createdAt: now,
    updatedAt: now
  };
  current.feeds.push(feed);
  await commitStore(current);
  return feed;
}

export async function updateFeed(feedId: string, patch: Partial<FeedConfig>): Promise<FeedConfig | null> {
  const current = await readStore();
  const index = current.feeds.findIndex((feed) => feed.id === feedId);
  if (index < 0) {
    return null;
  }
  const updated = {
    ...current.feeds[index],
    ...patch,
    id: current.feeds[index].id,
    updatedAt: new Date().toISOString()
  };
  current.feeds[index] = updated;
  await commitStore(current);
  return updated;
}

export async function getUserPreferences(userId: string, timezone = DEFAULT_TIMEZONE): Promise<UserPreferences> {
  const current = await readStore();
  const existing = current.preferences.get(userId);
  if (existing) {
    return existing;
  }
  const defaults = defaultPreferences(userId, timezone);
  current.preferences.set(userId, defaults);
  await commitStore(current);
  return defaults;
}

function defaultPreferences(userId: string, timezone: string): UserPreferences {
  return {
    userId,
    timezone,
    accent: 'cobalt',
    followedEntities: [],
    mutedSources: [],
    only24h: true
  };
}

export async function patchUserPreferences(
  userId: string,
  patch: Partial<Omit<UserPreferences, 'userId'>>
): Promise<UserPreferences> {
  const current = await readStore();
  const existing = current.preferences.get(userId) || defaultPreferences(userId, DEFAULT_TIMEZONE);

  const next: UserPreferences = {
    ...existing,
    ...patch,
    timezone: parseTimezone(patch.timezone || existing.timezone)
  };

  current.preferences.set(userId, next);
  await commitStore(current);
  return next;
}

export async function getFiledStories(userId: string): Promise<FiledStory[]> {
  const current = await readStore();
  return current.filed
    .filter((item) => item.userId === userId)
    .sort((a, b) => new Date(b.filedAt).getTime() - new Date(a.filedAt).getTime());
}

export async function setFiled(userId: string, storyId: string, filed: boolean): Promise<FiledStory[]> {
  const current = await readStore();
  current.filed = current.filed.filter((item) => !(item.userId === userId && item.storyId === storyId));

  if (filed) {
    current.filed.push({
      userId,
      storyId,
      filedAt: new Date().toISOString()
    });
  }

  await commitStore(current);
  return current.filed
    .filter((item) => item.userId === userId)
    .sort((a, b) => new Date(b.filedAt).getTime() - new Date(a.filedAt).getTime());
}

export async function getStoryById(storyId: string): Promise<StoryRecord | null> {
  const current = await readStore();
  return current.stories.find((story) => story.id === storyId) || null;
}

export async function getDossiers(userId: string): Promise<Dossier[]> {
  const current = await readStore();
  return current.dossiers
    .filter((dossier) => dossier.userId === userId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function createDossier(
  userId: string,
  payload: { name: string; notes?: string; storyIds?: string[] }
): Promise<Dossier> {
  const current = await readStore();
  const now = new Date().toISOString();
  const dossier: Dossier = {
    id: `dossier_${crypto.randomBytes(6).toString('hex')}`,
    userId,
    name: payload.name,
    notes: payload.notes || '',
    storyIds: payload.storyIds || [],
    createdAt: now,
    updatedAt: now
  };
  current.dossiers.push(dossier);
  await commitStore(current);
  return dossier;
}

export async function addStoryToDossier(userId: string, dossierId: string, storyId: string): Promise<Dossier | null> {
  const current = await readStore();
  const dossier = current.dossiers.find((item) => item.id === dossierId && item.userId === userId);
  if (!dossier) {
    return null;
  }
  if (!dossier.storyIds.includes(storyId)) {
    dossier.storyIds.push(storyId);
  }
  dossier.updatedAt = new Date().toISOString();

  await commitStore(current);
  return dossier;
}

export async function exportDossier(
  userId: string,
  dossierId: string,
  format: 'text' | 'markdown' = 'markdown'
): Promise<string | null> {
  const current = await readStore();
  const dossier = current.dossiers.find((item) => item.id === dossierId && item.userId === userId);
  if (!dossier) {
    return null;
  }

  const stories = dossier.storyIds
    .map((id) => current.stories.find((story) => story.id === id) || null)
    .filter(Boolean) as StoryRecord[];

  if (format === 'text') {
    return [
      `DOSSIER: ${dossier.name}`,
      `Updated: ${dossier.updatedAt}`,
      '',
      dossier.notes,
      '',
      ...stories.map((story, index) => {
        return [
          `${index + 1}. ${story.title}`,
          `   Source: ${story.sourceName}`,
          `   Published: ${story.publishedAt}`,
          `   Why this matters: ${story.whyMatters.join(' | ')}`,
          `   Link: ${story.url}`
        ].join('\n');
      })
    ].join('\n');
  }

  return [
    `# DOSSIER: ${dossier.name}`,
    '',
    `Updated: ${dossier.updatedAt}`,
    '',
    dossier.notes,
    '',
    ...stories.map((story) => {
      return [
        `## ${story.title}`,
        `- Source: ${story.sourceName}`,
        `- Published: ${story.publishedAt}`,
        `- Why this matters:`,
        ...story.whyMatters.map((point) => `  - ${point}`),
        `- Link: ${story.url}`,
        ''
      ].join('\n');
    })
  ].join('\n');
}

export async function createMagicToken(email: string): Promise<MagicLinkToken> {
  const current = await readStore();
  const token: MagicLinkToken = {
    token: crypto.randomBytes(18).toString('hex'),
    email,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 1000 * 60 * 20).toISOString()
  };

  current.magicTokens.set(token.token, token);
  await commitStore(current);
  return token;
}

function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

function authUserIdFromEmail(email: string): string {
  return `user_${crypto.createHash('sha1').update(normalizeEmail(email)).digest('hex').slice(0, 12)}`;
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [algo, salt, digest] = String(storedHash || '').split('$');
    if (algo !== 'scrypt' || !salt || !digest) return false;
    const check = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(digest, 'hex');
    if (check.length !== expected.length) return false;
    return crypto.timingSafeEqual(check, expected);
  } catch {
    return false;
  }
}

function findAuthUserById(current: Store, userId: string): AuthUserCredential | undefined {
  for (const user of current.authUsers.values()) {
    if (user.userId === userId) return user;
  }
  return undefined;
}

function countActiveAdmins(current: Store): number {
  let count = 0;
  for (const user of current.authUsers.values()) {
    if (user.active && user.role === 'admin') count += 1;
  }
  return count;
}

function isAllowedEmailForAr(email: string): boolean {
  const allow = (process.env.AR_ALLOWED_EMAILS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (!allow.length) return true;
  return allow.includes(normalizeEmail(email));
}

function isSelfSignupEnabled(): boolean {
  const raw = String(process.env.AR_SELF_SIGNUP || 'true').trim().toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(raw);
}

function isDefaultAdminEmail(email: string): boolean {
  const configured = (process.env.AR_DEFAULT_ADMIN_EMAILS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return configured.includes(normalizeEmail(email));
}

function sanitizeRole(role: unknown): 'admin' | 'editor' | 'viewer' {
  if (role === 'admin' || role === 'viewer') return role;
  return 'editor';
}

export async function registerArUser(
  email: string,
  password: string,
  options?: { createdByUserId?: string; role?: 'admin' | 'editor' | 'viewer'; active?: boolean }
): Promise<{ ok: true; userId: string; email: string; role: 'admin' | 'editor' | 'viewer' } | { ok: false; error: string }> {
  const cleanEmail = normalizeEmail(email);
  const cleanPassword = String(password || '');
  if (!cleanEmail || !cleanEmail.includes('@')) return { ok: false, error: 'Invalid email' };
  if (cleanPassword.length < 8) return { ok: false, error: 'Password must be at least 8 characters' };
  if (!isAllowedEmailForAr(cleanEmail)) return { ok: false, error: 'Email is not allowed for this workspace' };

  const current = await readStore();
  if (current.authUsers.has(cleanEmail)) return { ok: false, error: 'Account already exists' };

  let role: 'admin' | 'editor' | 'viewer' = 'editor';
  let active = true;
  if (options?.createdByUserId) {
    const actor = findAuthUserById(current, options.createdByUserId);
    if (!actor || !actor.active || actor.role !== 'admin') {
      return { ok: false, error: 'Only admin users can create team accounts' };
    }
    role = sanitizeRole(options.role);
    active = options.active !== false;
  } else {
    if (!isSelfSignupEnabled()) return { ok: false, error: 'Self signup is disabled' };
    if (current.authUsers.size === 0 || isDefaultAdminEmail(cleanEmail)) {
      role = 'admin';
    } else {
      role = 'editor';
    }
    active = true;
  }

  const now = new Date().toISOString();
  const userId = authUserIdFromEmail(cleanEmail);
  const authUser: AuthUserCredential = {
    userId,
    email: cleanEmail,
    passwordHash: hashPassword(cleanPassword),
    role,
    active,
    createdAt: now,
    updatedAt: now
  };
  current.authUsers.set(cleanEmail, authUser);
  if (!current.preferences.has(userId)) {
    current.preferences.set(userId, defaultPreferences(userId, DEFAULT_TIMEZONE));
  }
  await commitStore(current);
  return { ok: true, userId, email: cleanEmail, role };
}

export async function loginArUser(email: string, password: string): Promise<{ ok: true; userId: string; email: string; role: 'admin' | 'editor' | 'viewer' } | { ok: false; error: string }> {
  const cleanEmail = normalizeEmail(email);
  const cleanPassword = String(password || '');
  if (!cleanEmail || !cleanPassword) return { ok: false, error: 'Missing credentials' };
  if (!isAllowedEmailForAr(cleanEmail)) return { ok: false, error: 'Email is not allowed for this workspace' };

  const current = await readStore();
  const authUser = current.authUsers.get(cleanEmail);
  if (!authUser) return { ok: false, error: 'Invalid email or password' };
  if (!verifyPassword(cleanPassword, authUser.passwordHash)) return { ok: false, error: 'Invalid email or password' };
  if (!authUser.active) return { ok: false, error: 'Account is inactive. Contact admin.' };
  return { ok: true, userId: authUser.userId, email: authUser.email, role: authUser.role };
}

export async function getArAuthUserById(userId: string): Promise<Pick<AuthUserCredential, 'userId' | 'email' | 'role' | 'active'> | null> {
  const current = await readStore();
  const user = findAuthUserById(current, String(userId || ''));
  if (!user) return null;
  return { userId: user.userId, email: user.email, role: user.role, active: user.active };
}

export async function listArUsersForAdmin(
  adminUserId: string
): Promise<{ ok: true; users: Array<Pick<AuthUserCredential, 'userId' | 'email' | 'role' | 'active' | 'createdAt' | 'updatedAt'>> } | { ok: false; error: string }> {
  const current = await readStore();
  const admin = findAuthUserById(current, adminUserId);
  if (!admin || !admin.active || admin.role !== 'admin') return { ok: false, error: 'Admin access required' };
  const users = [...current.authUsers.values()]
    .map(user => ({ userId: user.userId, email: user.email, role: user.role, active: user.active, createdAt: user.createdAt, updatedAt: user.updatedAt }))
    .sort((a, b) => a.email.localeCompare(b.email));
  return { ok: true, users };
}

export async function updateArUserByAdmin(
  adminUserId: string,
  targetUserId: string,
  patch: { role?: 'admin' | 'editor' | 'viewer'; active?: boolean; password?: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const current = await readStore();
  const admin = findAuthUserById(current, adminUserId);
  if (!admin || !admin.active || admin.role !== 'admin') return { ok: false, error: 'Admin access required' };
  const target = findAuthUserById(current, targetUserId);
  if (!target) return { ok: false, error: 'User not found' };

  const nextRole = patch.role ? sanitizeRole(patch.role) : target.role;
  const nextActive = patch.active === undefined ? target.active : Boolean(patch.active);

  if (target.role === 'admin' && (!nextActive || nextRole !== 'admin') && countActiveAdmins(current) <= 1) {
    return { ok: false, error: 'At least one active admin is required' };
  }

  const nextPassword = patch.password ? String(patch.password) : '';
  if (patch.password !== undefined && nextPassword.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters' };
  }

  const updated: AuthUserCredential = {
    ...target,
    role: nextRole,
    active: nextActive,
    passwordHash: patch.password ? hashPassword(nextPassword) : target.passwordHash,
    updatedAt: new Date().toISOString()
  };
  current.authUsers.set(normalizeEmail(target.email), updated);
  await commitStore(current);
  return { ok: true };
}

export async function requestArPasswordReset(
  email: string
): Promise<{ ok: true; token?: string; email: string; userId?: string; expiresAt?: string } | { ok: false; error: string }> {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail || !cleanEmail.includes('@')) return { ok: false, error: 'Invalid email' };
  if (!isAllowedEmailForAr(cleanEmail)) return { ok: false, error: 'Email is not allowed for this workspace' };

  const current = await readStore();
  const user = current.authUsers.get(cleanEmail);
  if (!user || !user.active) {
    return { ok: true, email: cleanEmail };
  }

  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 20).toISOString();
  const token = crypto.randomBytes(20).toString('hex');
  current.authPasswordResetTokens.set(token, {
    token,
    userId: user.userId,
    email: user.email,
    createdAt: now,
    expiresAt
  });
  await commitStore(current);
  return { ok: true, token, email: cleanEmail, userId: user.userId, expiresAt };
}

export async function resetArPassword(
  token: string,
  nextPassword: string
): Promise<{ ok: true; userId: string; email: string; role: 'admin' | 'editor' | 'viewer' } | { ok: false; error: string }> {
  const cleanToken = String(token || '').trim();
  const cleanPassword = String(nextPassword || '');
  if (!cleanToken) return { ok: false, error: 'Missing reset token' };
  if (cleanPassword.length < 8) return { ok: false, error: 'Password must be at least 8 characters' };

  const current = await readStore();
  const hit = current.authPasswordResetTokens.get(cleanToken);
  if (!hit) return { ok: false, error: 'Reset token invalid or expired' };
  if (new Date(hit.expiresAt).getTime() < Date.now()) {
    current.authPasswordResetTokens.delete(cleanToken);
    await commitStore(current);
    return { ok: false, error: 'Reset token invalid or expired' };
  }

  const user = current.authUsers.get(normalizeEmail(hit.email));
  if (!user || !user.active) {
    current.authPasswordResetTokens.delete(cleanToken);
    await commitStore(current);
    return { ok: false, error: 'Account not available' };
  }

  current.authUsers.set(user.email, {
    ...user,
    passwordHash: hashPassword(cleanPassword),
    updatedAt: new Date().toISOString()
  });
  current.authPasswordResetTokens.delete(cleanToken);
  await commitStore(current);
  const updated = current.authUsers.get(user.email)!;
  return { ok: true, userId: updated.userId, email: updated.email, role: updated.role };
}

export async function consumeMagicToken(token: string): Promise<{ email: string; userId: string } | null> {
  const current = await readStore();
  const hit = current.magicTokens.get(token);
  if (!hit) {
    return null;
  }
  if (new Date(hit.expiresAt).getTime() < Date.now()) {
    current.magicTokens.delete(token);
    await commitStore(current);
    return null;
  }

  current.magicTokens.delete(token);
  await commitStore(current);

  return {
    email: hit.email,
    userId: `user_${crypto
      .createHash('sha1')
      .update(hit.email.toLowerCase())
      .digest('hex')
      .slice(0, 12)}`
  };
}

export async function getAllStories(): Promise<StoryRecord[]> {
  const current = await readStore();
  return [...current.stories];
}

function hydrateFromSnapshot(snapshot: PersistedSnapshot): void {
  store.stories = snapshot.stories;
  store.clusters = snapshot.clusters;
  store.feeds = snapshot.feeds;
  store.filed = snapshot.filed;
  store.dossiers = snapshot.dossiers;
  store.preferences = new Map(snapshot.preferences.map((pref) => [pref.userId, pref]));
  store.magicTokens = new Map(snapshot.magicTokens.map((token) => [token.token, token]));
  store.authUsers = new Map((snapshot.authUsers || []).map((user) => [normalizeEmail(user.email), { ...user, email: normalizeEmail(user.email) }]));
  store.authPasswordResetTokens = new Map((snapshot.authPasswordResetTokens || []).map((token) => [token.token, token]));
  store.lastIngestAt = snapshot.lastIngestAt;
  store.ingestCounter = snapshot.ingestCounter;
}

function toSnapshot(state: Store): PersistedSnapshot {
  return {
    stories: state.stories,
    clusters: state.clusters,
    feeds: state.feeds,
    filed: state.filed,
    dossiers: state.dossiers,
    preferences: [...state.preferences.values()],
    magicTokens: [...state.magicTokens.values()],
    authUsers: [...state.authUsers.values()],
    authPasswordResetTokens: [...state.authPasswordResetTokens.values()],
    lastIngestAt: state.lastIngestAt,
    ingestCounter: state.ingestCounter
  };
}

function cloneStore(source: Store): Store {
  return {
    stories: source.stories.map((story) => ({ ...story, whyMatters: [...story.whyMatters], entities: [...story.entities] })),
    clusters: source.clusters.map((cluster) => ({
      ...cluster,
      storyIds: [...cluster.storyIds],
      sources: [...cluster.sources],
      entities: [...cluster.entities]
    })),
    feeds: source.feeds.map((feed) => ({ ...feed })),
    filed: source.filed.map((filed) => ({ ...filed })),
    dossiers: source.dossiers.map((dossier) => ({ ...dossier, storyIds: [...dossier.storyIds] })),
    preferences: new Map(
      [...source.preferences.entries()].map(([userId, pref]) => [
        userId,
        {
          ...pref,
          followedEntities: [...pref.followedEntities],
          mutedSources: [...pref.mutedSources]
        }
      ])
    ),
    magicTokens: new Map([...source.magicTokens.entries()].map(([token, value]) => [token, { ...value }])),
    authUsers: new Map([...source.authUsers.entries()].map(([email, user]) => [email, { ...user }])),
    authPasswordResetTokens: new Map([...source.authPasswordResetTokens.entries()].map(([token, value]) => [token, { ...value }])),
    lastIngestAt: source.lastIngestAt,
    ingestCounter: source.ingestCounter
  };
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

function mergeDefaultFeeds(existing: FeedConfig[]): { feeds: FeedConfig[]; changed: boolean } {
  const byUrl = new Map<string, FeedConfig>();
  for (const feed of existing) {
    byUrl.set(canonicalizeUrl(feed.url), feed);
  }

  let changed = false;
  for (const feed of DEFAULT_FEEDS) {
    const key = canonicalizeUrl(feed.url);
    if (byUrl.has(key)) {
      continue;
    }
    byUrl.set(key, { ...feed });
    changed = true;
  }

  return {
    feeds: [...byUrl.values()],
    changed
  };
}
