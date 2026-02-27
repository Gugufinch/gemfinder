import crypto from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { DEFAULT_FEEDS } from '@/lib/bonafied/constants';
import {
  AuthPasswordResetToken,
  AuthUserCredential,
  Dossier,
  FeedConfig,
  FiledStory,
  MagicLinkToken,
  SignalCluster,
  StoryRecord,
  UserPreferences
} from '@/lib/bonafied/types';

export interface PersistedSnapshot {
  stories: StoryRecord[];
  clusters: SignalCluster[];
  feeds: FeedConfig[];
  filed: FiledStory[];
  dossiers: Dossier[];
  preferences: UserPreferences[];
  magicTokens: MagicLinkToken[];
  authUsers: AuthUserCredential[];
  authPasswordResetTokens: AuthPasswordResetToken[];
  lastIngestAt: string;
  ingestCounter: number;
}

const SIGNAL_META_KEY = 'signal_meta';

let pool: Pool | null = null;
let schemaReady = false;

export function hasPostgres(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function getPool(): Pool {
  if (!pool) {
    const sslMode = (process.env.DATABASE_SSL || '').toLowerCase();
    const ssl =
      sslMode === 'require' || sslMode === 'true'
        ? {
            rejectUnauthorized: false
          }
        : undefined;

    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 8,
      ssl
    });
  }
  return pool;
}

const SCHEMA_SQL = `
create table if not exists sources (
  id text primary key,
  name text not null unique,
  home_url text not null default '',
  credibility_score double precision not null default 0.70,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists feeds (
  id text primary key,
  source_id text,
  name text not null,
  rss_url text not null unique,
  category text not null,
  credibility_score double precision not null default 0.70,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists clusters (
  id text primary key,
  category text not null,
  headline text not null,
  primary_story_id text not null,
  story_ids jsonb not null default '[]'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  entities jsonb not null default '[]'::jsonb,
  score double precision not null default 0,
  latest_published_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists stories (
  id text primary key,
  cluster_id text,
  source_id text,
  title text not null,
  url text not null unique,
  source_name text not null,
  source_url text not null,
  category text not null,
  content text not null,
  summary text not null,
  why_matters jsonb not null default '[]'::jsonb,
  entities jsonb not null default '[]'::jsonb,
  published_at timestamptz not null,
  image_url text,
  verified boolean not null default true,
  published_timestamp_known boolean not null default true,
  rank_score double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists entities (
  id text primary key,
  name text not null unique,
  kind text not null default 'unknown',
  created_at timestamptz not null default now()
);

create table if not exists story_entities (
  story_id text not null,
  entity_id text not null,
  primary key (story_id, entity_id)
);

create table if not exists users (
  id text primary key,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists user_preferences (
  user_id text primary key,
  timezone text not null default 'America/Chicago',
  accent text not null default 'cobalt',
  only_24h boolean not null default true,
  followed_entities jsonb not null default '[]'::jsonb,
  muted_sources jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists filed_stories (
  user_id text not null,
  story_id text not null,
  filed_at timestamptz not null default now(),
  primary key (user_id, story_id)
);

create table if not exists dossiers (
  id text primary key,
  user_id text not null,
  name text not null,
  notes text not null default '',
  story_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists magic_link_tokens (
  token text primary key,
  email text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists auth_users (
  user_id text primary key,
  email text not null unique,
  password_hash text not null,
  role text not null default 'editor',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists auth_password_reset_tokens (
  token text primary key,
  user_id text not null,
  email text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists app_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
`;

export async function ensurePostgresSchema(): Promise<void> {
  if (!hasPostgres()) {
    return;
  }
  if (schemaReady) {
    return;
  }

  const p = getPool();
  await p.query(SCHEMA_SQL);
  schemaReady = true;
}

export async function loadSnapshotFromPostgres(): Promise<PersistedSnapshot> {
  await ensurePostgresSchema();

  const p = getPool();
  const [storiesRes, clustersRes, feedsRes, filedRes, dossiersRes, prefsRes, tokensRes, authUsersRes, authResetTokensRes, stateRes] = await Promise.all([
    p.query('select * from stories order by published_at desc'),
    p.query('select * from clusters order by latest_published_at desc'),
    p.query('select * from feeds order by name asc'),
    p.query('select * from filed_stories order by filed_at desc'),
    p.query('select * from dossiers order by updated_at desc'),
    p.query('select * from user_preferences order by user_id asc'),
    p.query('select * from magic_link_tokens order by created_at desc'),
    p.query('select * from auth_users order by email asc'),
    p.query('select * from auth_password_reset_tokens order by created_at desc'),
    p.query('select value from app_state where key = $1', [SIGNAL_META_KEY])
  ]);

  const stories: StoryRecord[] = storiesRes.rows.map((row) => ({
    id: String(row.id),
    title: String(row.title),
    url: String(row.url),
    sourceName: String(row.source_name),
    sourceUrl: String(row.source_url || ''),
    publishedAt: toIso(row.published_at),
    category: row.category,
    content: String(row.content || ''),
    imageUrl: row.image_url || undefined,
    summary: String(row.summary || ''),
    whyMatters: asStringArray(row.why_matters),
    entities: asStringArray(row.entities),
    rankScore: Number(row.rank_score || 0),
    verified: Boolean(row.verified),
    publishedTimestampKnown: Boolean(row.published_timestamp_known)
  }));

  const clusters: SignalCluster[] = clustersRes.rows.map((row) => ({
    id: String(row.id),
    category: row.category,
    headline: String(row.headline),
    primaryStoryId: String(row.primary_story_id),
    storyIds: asStringArray(row.story_ids),
    sources: asStringArray(row.sources),
    entities: asStringArray(row.entities),
    score: Number(row.score || 0),
    latestPublishedAt: toIso(row.latest_published_at)
  }));

  const feeds: FeedConfig[] = feedsRes.rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    url: String(row.rss_url),
    category: row.category,
    credibilityScore: Number(row.credibility_score || 0.7),
    active: Boolean(row.active),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  }));

  const filed: FiledStory[] = filedRes.rows.map((row) => ({
    userId: String(row.user_id),
    storyId: String(row.story_id),
    filedAt: toIso(row.filed_at)
  }));

  const dossiers: Dossier[] = dossiersRes.rows.map((row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    notes: String(row.notes || ''),
    storyIds: asStringArray(row.story_ids),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  }));

  const preferences: UserPreferences[] = prefsRes.rows.map((row) => ({
    userId: String(row.user_id),
    timezone: String(row.timezone || 'America/Chicago'),
    accent: row.accent === 'amber' ? 'amber' : 'cobalt',
    followedEntities: asStringArray(row.followed_entities),
    mutedSources: asStringArray(row.muted_sources),
    only24h: Boolean(row.only_24h)
  }));

  const magicTokens: MagicLinkToken[] = tokensRes.rows.map((row) => ({
    token: String(row.token),
    email: String(row.email),
    expiresAt: toIso(row.expires_at),
    createdAt: toIso(row.created_at)
  }));

  const authUsers: AuthUserCredential[] = authUsersRes.rows.map((row) => ({
    userId: String(row.user_id),
    email: String(row.email).toLowerCase(),
    passwordHash: String(row.password_hash || ''),
    role: row.role === 'admin' ? 'admin' : row.role === 'viewer' ? 'viewer' : 'editor',
    active: row.active === undefined ? true : Boolean(row.active),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  }));

  const authPasswordResetTokens: AuthPasswordResetToken[] = authResetTokensRes.rows.map((row) => ({
    token: String(row.token),
    userId: String(row.user_id),
    email: String(row.email).toLowerCase(),
    expiresAt: toIso(row.expires_at),
    createdAt: toIso(row.created_at)
  }));

  const state = stateRes.rows[0]?.value || null;

  return {
    stories,
    clusters,
    feeds: feeds.length ? feeds : DEFAULT_FEEDS,
    filed,
    dossiers,
    preferences,
    magicTokens,
    authUsers,
    authPasswordResetTokens,
    lastIngestAt: state?.lastIngestAt || new Date().toISOString(),
    ingestCounter: Number(state?.ingestCounter || 0)
  };
}

export async function saveSnapshotToPostgres(snapshot: PersistedSnapshot): Promise<void> {
  await ensurePostgresSchema();
  const client = await getPool().connect();

  try {
    await client.query('begin');

    await client.query('delete from story_entities');
    await client.query('delete from entities');
    await client.query('delete from clusters');
    await client.query('delete from stories');
    await client.query('delete from feeds');
    await client.query('delete from sources');
    await client.query('delete from filed_stories');
    await client.query('delete from dossiers');
    await client.query('delete from user_preferences');
    await client.query('delete from users');
    await client.query('delete from magic_link_tokens');
    await client.query('delete from auth_users');
    await client.query('delete from auth_password_reset_tokens');

    const sourceMap = new Map<string, { id: string; name: string; url: string; credibility: number }>();

    for (const feed of snapshot.feeds) {
      if (!sourceMap.has(feed.name)) {
        sourceMap.set(feed.name, {
          id: sourceId(feed.name),
          name: feed.name,
          url: feed.url,
          credibility: feed.credibilityScore
        });
      }
    }

    for (const story of snapshot.stories) {
      if (!sourceMap.has(story.sourceName)) {
        sourceMap.set(story.sourceName, {
          id: sourceId(story.sourceName),
          name: story.sourceName,
          url: story.sourceUrl,
          credibility: 0.7
        });
      }
    }

    for (const source of sourceMap.values()) {
      await client.query(
        `insert into sources (id, name, home_url, credibility_score, created_at, updated_at)
         values ($1, $2, $3, $4, now(), now())`,
        [source.id, source.name, source.url, source.credibility]
      );
    }

    for (const feed of snapshot.feeds) {
      await client.query(
        `insert into feeds (id, source_id, name, rss_url, category, credibility_score, active, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz)`,
        [
          feed.id,
          sourceMap.get(feed.name)?.id || sourceId(feed.name),
          feed.name,
          feed.url,
          feed.category,
          feed.credibilityScore,
          feed.active,
          feed.createdAt,
          feed.updatedAt
        ]
      );
    }

    for (const story of snapshot.stories) {
      await client.query(
        `insert into stories (
          id, cluster_id, source_id, title, url, source_name, source_url, category,
          content, summary, why_matters, entities, published_at, image_url,
          verified, published_timestamp_known, rank_score, created_at, updated_at
        ) values (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11::jsonb, $12::jsonb, $13::timestamptz, $14,
          $15, $16, $17, now(), now()
        )`,
        [
          story.id,
          findClusterId(snapshot.clusters, story.id),
          sourceMap.get(story.sourceName)?.id || sourceId(story.sourceName),
          story.title,
          story.url,
          story.sourceName,
          story.sourceUrl,
          story.category,
          story.content,
          story.summary,
          JSON.stringify(story.whyMatters),
          JSON.stringify(story.entities),
          story.publishedAt,
          story.imageUrl || null,
          story.verified,
          story.publishedTimestampKnown,
          story.rankScore
        ]
      );
    }

    for (const cluster of snapshot.clusters) {
      await client.query(
        `insert into clusters (
          id, category, headline, primary_story_id, story_ids, sources, entities,
          score, latest_published_at, created_at, updated_at
        ) values (
          $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb,
          $8, $9::timestamptz, now(), now()
        )`,
        [
          cluster.id,
          cluster.category,
          cluster.headline,
          cluster.primaryStoryId,
          JSON.stringify(cluster.storyIds),
          JSON.stringify(cluster.sources),
          JSON.stringify(cluster.entities),
          cluster.score,
          cluster.latestPublishedAt
        ]
      );
    }

    const entityMap = new Map<string, string>();
    for (const story of snapshot.stories) {
      for (const entity of story.entities) {
        if (!entityMap.has(entity)) {
          entityMap.set(entity, entityId(entity));
        }
      }
    }

    for (const [name, id] of entityMap.entries()) {
      await client.query('insert into entities (id, name, kind, created_at) values ($1, $2, $3, now())', [id, name, 'unknown']);
    }

    for (const story of snapshot.stories) {
      for (const entityName of story.entities) {
        const eid = entityMap.get(entityName);
        if (!eid) {
          continue;
        }
        await client.query('insert into story_entities (story_id, entity_id) values ($1, $2)', [story.id, eid]);
      }
    }

    const userIds = new Set<string>();
    for (const pref of snapshot.preferences) {
      userIds.add(pref.userId);
    }
    for (const filed of snapshot.filed) {
      userIds.add(filed.userId);
    }
    for (const dossier of snapshot.dossiers) {
      userIds.add(dossier.userId);
    }

    for (const userId of userIds) {
      await client.query('insert into users (id, email, created_at) values ($1, $2, now())', [userId, `${userId}@local.bonafied`]);
    }

    for (const pref of snapshot.preferences) {
      await client.query(
        `insert into user_preferences (
          user_id, timezone, accent, only_24h, followed_entities, muted_sources, updated_at
        ) values (
          $1, $2, $3, $4, $5::jsonb, $6::jsonb, now()
        )`,
        [
          pref.userId,
          pref.timezone,
          pref.accent,
          pref.only24h,
          JSON.stringify(pref.followedEntities),
          JSON.stringify(pref.mutedSources)
        ]
      );
    }

    for (const filed of snapshot.filed) {
      await client.query('insert into filed_stories (user_id, story_id, filed_at) values ($1, $2, $3::timestamptz)', [
        filed.userId,
        filed.storyId,
        filed.filedAt
      ]);
    }

    for (const dossier of snapshot.dossiers) {
      await client.query(
        `insert into dossiers (id, user_id, name, notes, story_ids, created_at, updated_at)
         values ($1, $2, $3, $4, $5::jsonb, $6::timestamptz, $7::timestamptz)`,
        [
          dossier.id,
          dossier.userId,
          dossier.name,
          dossier.notes,
          JSON.stringify(dossier.storyIds),
          dossier.createdAt,
          dossier.updatedAt
        ]
      );
    }

    for (const token of snapshot.magicTokens) {
      await client.query(
        `insert into magic_link_tokens (token, email, expires_at, created_at)
         values ($1, $2, $3::timestamptz, $4::timestamptz)`,
        [token.token, token.email, token.expiresAt, token.createdAt]
      );
    }

    for (const authUser of snapshot.authUsers || []) {
      await client.query(
        `insert into auth_users (user_id, email, password_hash, role, active, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz)`,
        [authUser.userId, authUser.email.toLowerCase(), authUser.passwordHash, authUser.role || 'editor', authUser.active !== false, authUser.createdAt, authUser.updatedAt]
      );
    }

    for (const resetToken of snapshot.authPasswordResetTokens || []) {
      await client.query(
        `insert into auth_password_reset_tokens (token, user_id, email, expires_at, created_at)
         values ($1, $2, $3, $4::timestamptz, $5::timestamptz)`,
        [resetToken.token, resetToken.userId, resetToken.email.toLowerCase(), resetToken.expiresAt, resetToken.createdAt]
      );
    }

    await client.query(
      `insert into app_state (key, value, updated_at)
       values ($1, $2::jsonb, now())
       on conflict (key)
       do update set value = excluded.value, updated_at = now()`,
      [
        SIGNAL_META_KEY,
        JSON.stringify({
          lastIngestAt: snapshot.lastIngestAt,
          ingestCounter: snapshot.ingestCounter
        })
      ]
    );

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

function sourceId(name: string): string {
  return `src_${crypto.createHash('sha1').update(name.toLowerCase()).digest('hex').slice(0, 14)}`;
}

function entityId(name: string): string {
  return `ent_${crypto.createHash('sha1').update(name.toLowerCase()).digest('hex').slice(0, 14)}`;
}

function findClusterId(clusters: SignalCluster[], storyId: string): string | null {
  const match = clusters.find((cluster) => cluster.storyIds.includes(storyId));
  return match?.id || null;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item));
      }
    } catch {
      return [];
    }
  }
  return [];
}

function toIso(value: unknown): string {
  if (!value) {
    return new Date().toISOString();
  }
  return new Date(String(value)).toISOString();
}

export async function withPostgresClient<T>(
  handler: (client: PoolClient) => Promise<T>,
  fallback: () => Promise<T>
): Promise<T> {
  if (!hasPostgres()) {
    return fallback();
  }

  try {
    await ensurePostgresSchema();
    const client = await getPool().connect();
    try {
      return await handler(client);
    } finally {
      client.release();
    }
  } catch {
    return fallback();
  }
}
