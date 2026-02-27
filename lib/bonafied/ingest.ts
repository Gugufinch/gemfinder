import crypto from 'node:crypto';
import Parser from 'rss-parser';
import { classifyCategory, isCategoryRelevant } from '@/lib/bonafied/classify';
import { clusterStories } from '@/lib/bonafied/cluster';
import { DEFAULT_SOURCE_CREDIBILITY } from '@/lib/bonafied/constants';
import { extractEntities } from '@/lib/bonafied/entity-extract';
import { scoreStory } from '@/lib/bonafied/rank';
import { mergeSignals, getFeeds } from '@/lib/bonafied/repository';
import { summarizeStory } from '@/lib/bonafied/summarize';
import { cleanText } from '@/lib/bonafied/text';
import { withinLast24Hours } from '@/lib/bonafied/time';
import { BonafiedCategory, FeedConfig, IngestionResult, StoryRecord } from '@/lib/bonafied/types';

interface RssItem {
  title?: string;
  link?: string;
  pubDate?: string;
  isoDate?: string;
  contentSnippet?: string;
  content?: string;
  creator?: string;
  enclosure?: {
    url?: string;
    type?: string;
  };
  ['media:content']?: Array<{ $?: { url?: string } }>;
}

interface ProviderStory {
  title: string;
  url: string;
  publishedAt: string;
  description?: string;
  imageUrl?: string;
  sourceName: string;
  sourceUrl: string;
  categoryHint: BonafiedCategory;
}

const API_QUERY_BY_CATEGORY: Array<{ category: BonafiedCategory; query: string }> = [
  {
    category: 'BUSINESS',
    query: '(business OR economy OR markets OR policy OR regulation OR congress OR election)'
  },
  {
    category: 'TECHNOLOGY',
    query: '(technology OR ai OR software OR semiconductor OR cloud OR developer)'
  },
  {
    category: 'MUSIC_INDUSTRY',
    query: '(music industry OR labels OR streaming rights OR touring OR royalties)'
  },
  {
    category: 'PODCAST_CREATOR',
    query: '(podcast OR creator economy OR youtube creators OR newsletter platform)'
  }
];

const API_FETCH_TIMEOUT_MS = 12_000;
const MIN_FEED_CREDIBILITY = Number(process.env.BONAFIED_MIN_FEED_CREDIBILITY || 0.72);
const MIN_PROVIDER_SOURCE_CREDIBILITY = Number(process.env.BONAFIED_MIN_PROVIDER_CREDIBILITY || 0.78);

const PROVIDER_DOMAIN_ALLOWLIST: Record<BonafiedCategory, string[]> = {
  BUSINESS: [
    'reuters.com',
    'bloomberg.com',
    'wsj.com',
    'ft.com',
    'cnbc.com',
    'apnews.com',
    'bbc.com',
    'bbc.co.uk',
    'politico.com',
    'thehill.com',
    'nytimes.com',
    'theguardian.com'
  ],
  TECHNOLOGY: [
    'reuters.com',
    'bloomberg.com',
    'wsj.com',
    'ft.com',
    'cnbc.com',
    'bbc.com',
    'bbc.co.uk',
    'theverge.com',
    'techcrunch.com',
    'wired.com',
    'engadget.com',
    'arstechnica.com',
    'theinformation.com'
  ],
  MUSIC_INDUSTRY: [
    'billboard.com',
    'rollingstone.com',
    'variety.com',
    'musicbusinessworldwide.com',
    'nme.com',
    'reuters.com',
    'bbc.com',
    'bbc.co.uk',
    'theguardian.com',
    'apnews.com'
  ],
  PODCAST_CREATOR: [
    'podnews.net',
    'tubefilter.com',
    'theverge.com',
    'spotify.com',
    'youtube.com',
    'digiday.com',
    'reuters.com',
    'bloomberg.com',
    'cnbc.com',
    'nytimes.com',
    'wsj.com',
    'theinformation.com'
  ]
};

const SOURCE_CREDIBILITY_INDEX = new Map<string, number>(
  Object.entries(DEFAULT_SOURCE_CREDIBILITY).map(([name, score]) => [name.toLowerCase(), score])
);

const parser = new Parser<Record<string, never>, RssItem>({
  timeout: 10_000,
  headers: {
    'User-Agent': 'BONAFIED/1.0'
  }
});

export async function ingestFeeds(): Promise<IngestionResult> {
  const feeds = (await getFeeds()).filter((feed) => feed.active && (feed.credibilityScore || 0) >= MIN_FEED_CREDIBILITY);

  let fetchedFeeds = 0;
  let droppedForTime = 0;
  let droppedForMissingTimestamp = 0;
  let droppedForDupes = 0;

  const ingested: StoryRecord[] = [];
  const seenCanonicalUrls = new Set<string>();

  for (const feed of feeds) {
    try {
      const parsed = await parser.parseURL(feed.url);
      fetchedFeeds += 1;

      for (const item of parsed.items || []) {
        const normalized = normalizeItem(item, feed);
        if (!normalized) {
          droppedForMissingTimestamp += 1;
          continue;
        }

        if (!withinLast24Hours(normalized.publishedAt)) {
          droppedForTime += 1;
          continue;
        }

        const canonical = canonicalizeUrl(normalized.url);
        if (seenCanonicalUrls.has(canonical)) {
          droppedForDupes += 1;
          continue;
        }

        seenCanonicalUrls.add(canonical);
        ingested.push(normalized);
      }
    } catch {
      continue;
    }
  }

  const providerStories = await fetchProviderStories();
  for (const story of providerStories) {
    if (!withinLast24Hours(story.publishedAt)) {
      droppedForTime += 1;
      continue;
    }
    const canonical = canonicalizeUrl(story.url);
    if (seenCanonicalUrls.has(canonical)) {
      droppedForDupes += 1;
      continue;
    }
    seenCanonicalUrls.add(canonical);
    ingested.push(story);
  }

  const scored = ingested.map((story) => ({
    ...story,
    rankScore: scoreStory(story, 1)
  }));

  const clustered = clusterStories(scored);
  const rescored = clustered.stories.map((story) => {
    const cluster = clustered.clusters.find((item) => item.storyIds.includes(story.id));
    return {
      ...story,
      rankScore: scoreStory(story, cluster ? cluster.storyIds.length : 1)
    };
  });

  const merged = await mergeSignals(rescored);

  return {
    fetchedFeeds,
    ingestedStories: merged.inserted,
    droppedForTime,
    droppedForMissingTimestamp,
    droppedForDupes,
    clusteredSignals: merged.clusters,
    ingestedAt: new Date().toISOString()
  };
}

async function fetchProviderStories(): Promise<StoryRecord[]> {
  const [fromNewsApi, fromGNews] = await Promise.all([fetchFromNewsApi(), fetchFromGNews()]);
  return [...fromNewsApi, ...fromGNews];
}

async function fetchFromNewsApi(): Promise<StoryRecord[]> {
  const apiKey = process.env.NEWSAPI_KEY || '';
  if (!apiKey) {
    return [];
  }

  const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const stories: StoryRecord[] = [];

  for (const item of API_QUERY_BY_CATEGORY) {
    const url = new URL('https://newsapi.org/v2/everything');
    url.searchParams.set('q', item.query);
    url.searchParams.set('language', 'en');
    url.searchParams.set('sortBy', 'publishedAt');
    url.searchParams.set('pageSize', '30');
    url.searchParams.set('from', from);
    url.searchParams.set('apiKey', apiKey);
    const domains = PROVIDER_DOMAIN_ALLOWLIST[item.category];
    if (domains?.length) {
      url.searchParams.set('domains', domains.join(','));
    }

    const payload = await fetchJsonWithTimeout<{
      articles?: Array<{
        title?: string;
        url?: string;
        publishedAt?: string;
        description?: string;
        content?: string;
        urlToImage?: string;
        source?: { name?: string };
      }>;
    }>(url.toString());

    for (const article of payload?.articles || []) {
      const normalized = normalizeProviderStory({
        title: article.title,
        url: article.url,
        publishedAt: article.publishedAt,
        description: article.description || article.content,
        imageUrl: article.urlToImage,
        sourceName: article.source?.name || 'NewsAPI',
        sourceUrl: 'https://newsapi.org',
        categoryHint: item.category
      });
      if (normalized) {
        stories.push(normalized);
      }
    }
  }

  return stories;
}

async function fetchFromGNews(): Promise<StoryRecord[]> {
  const apiKey = process.env.GNEWS_API_KEY || '';
  if (!apiKey) {
    return [];
  }

  const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const stories: StoryRecord[] = [];

  for (const item of API_QUERY_BY_CATEGORY) {
    const url = new URL('https://gnews.io/api/v4/search');
    url.searchParams.set('q', item.query);
    url.searchParams.set('lang', 'en');
    url.searchParams.set('max', '30');
    url.searchParams.set('sortby', 'publishedAt');
    url.searchParams.set('from', from);
    url.searchParams.set('apikey', apiKey);

    const payload = await fetchJsonWithTimeout<{
      articles?: Array<{
        title?: string;
        url?: string;
        publishedAt?: string;
        description?: string;
        content?: string;
        image?: string;
        source?: {
          name?: string;
          url?: string;
        };
      }>;
    }>(url.toString());

    for (const article of payload?.articles || []) {
      const normalized = normalizeProviderStory({
        title: article.title,
        url: article.url,
        publishedAt: article.publishedAt,
        description: article.description || article.content,
        imageUrl: article.image,
        sourceName: article.source?.name || 'GNews',
        sourceUrl: article.source?.url || 'https://gnews.io',
        categoryHint: item.category
      });
      if (normalized) {
        stories.push(normalized);
      }
    }
  }

  return stories;
}

function normalizeProviderStory(input: Partial<ProviderStory>): StoryRecord | null {
  if (!input.title || !input.url || !input.publishedAt || !input.sourceName || !input.sourceUrl || !input.categoryHint) {
    return null;
  }

  const normalizedSourceName = normalizeSourceName(input.sourceName);
  const credibility = sourceCredibilityForProvider(normalizedSourceName, input.url, input.sourceUrl);
  if (credibility < MIN_PROVIDER_SOURCE_CREDIBILITY) {
    return null;
  }

  const timestamp = new Date(input.publishedAt);
  if (Number.isNaN(timestamp.getTime())) {
    return null;
  }
  const publishedAt = timestamp.toISOString();
  const title = cleanText(input.title);
  const content = cleanText(input.description || input.title);
  let category = classifyCategory(`${title} ${content}`, input.categoryHint);

  const inHintDomain = matchesProviderDomainAllowlist(input.url, input.categoryHint);
  const inClassifiedDomain = matchesProviderDomainAllowlist(input.url, category);
  if (!inHintDomain && !inClassifiedDomain) {
    return null;
  }

  if (!isCategoryRelevant(`${title} ${content}`, category)) {
    if (isCategoryRelevant(`${title} ${content}`, input.categoryHint)) {
      category = input.categoryHint;
    } else {
      return null;
    }
  }
  const summary = summarizeStory(title, content);

  return {
    id: `story_${crypto.createHash('sha1').update(`${input.url}:${publishedAt}:${input.sourceName}`).digest('hex').slice(0, 14)}`,
    title,
    url: input.url,
    sourceName: normalizedSourceName,
    sourceUrl: input.sourceUrl,
    publishedAt,
    category,
    content,
    imageUrl: input.imageUrl,
    summary: summary.brief,
    whyMatters: summary.whyMatters,
    entities: extractEntities(`${title}. ${content}`),
    rankScore: 0,
    verified: true,
    publishedTimestampKnown: true
  };
}

async function fetchJsonWithTimeout<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'BONAFIED/1.0'
      }
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeItem(item: RssItem, feed: FeedConfig): StoryRecord | null {
  if (!item.title || !item.link) {
    return null;
  }

  const publishedAt = parsePublishedAt(item);
  if (!publishedAt) {
    return null;
  }

  const content = cleanText(item.contentSnippet || item.content || item.title);
  let category = classifyCategory(`${item.title} ${content}`, feed.category);
  if (!isCategoryRelevant(`${item.title} ${content}`, category)) {
    if (isCategoryRelevant(`${item.title} ${content}`, feed.category)) {
      category = feed.category;
    } else {
      return null;
    }
  }
  const summary = summarizeStory(item.title, content);

  return {
    id: `story_${crypto
      .createHash('sha1')
      .update(`${item.link}:${publishedAt}`)
      .digest('hex')
      .slice(0, 14)}`,
    title: cleanText(item.title),
    url: item.link,
    sourceName: normalizeSourceName(feed.name),
    sourceUrl: feed.url,
    publishedAt,
    category,
    content,
    imageUrl: item.enclosure?.url || item['media:content']?.[0]?.$?.url,
    summary: summary.brief,
    whyMatters: summary.whyMatters,
    entities: extractEntities(`${item.title}. ${content}`),
    rankScore: 0,
    verified: true,
    publishedTimestampKnown: true
  };
}

function normalizeSourceName(value: string): string {
  return value
    .replace(/\s+(Business|Companies|Technology|Tech|Music|Podcasts?|Creator(?:\s+Economy)?|Politics|World|Top(?:\s+News)?)$/i, '')
    .trim();
}

function parsePublishedAt(item: RssItem): string | null {
  const raw = item.isoDate || item.pubDate;
  if (!raw) {
    return null;
  }

  const timestamp = new Date(raw);
  if (Number.isNaN(timestamp.getTime())) {
    return null;
  }

  return timestamp.toISOString();
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

function sourceCredibilityForProvider(sourceName: string, articleUrl: string, sourceUrl: string): number {
  const normalized = sourceName.trim().toLowerCase();
  const direct = SOURCE_CREDIBILITY_INDEX.get(normalized);
  if (typeof direct === 'number') {
    return direct;
  }

  for (const [known, score] of SOURCE_CREDIBILITY_INDEX.entries()) {
    if (normalized.includes(known) || known.includes(normalized)) {
      return score;
    }
  }

  const inferred = sourceCredibilityFromUrl(articleUrl) || sourceCredibilityFromUrl(sourceUrl);
  if (typeof inferred === 'number') {
    return inferred;
  }

  return 0;
}

function sourceCredibilityFromUrl(value: string): number | null {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    for (const [category, domains] of Object.entries(PROVIDER_DOMAIN_ALLOWLIST) as Array<[BonafiedCategory, string[]]>) {
      for (const domain of domains) {
        if (hostname === domain || hostname.endsWith(`.${domain}`)) {
          if (category === 'BUSINESS') return 0.84;
          if (category === 'TECHNOLOGY') return 0.8;
          if (category === 'MUSIC_INDUSTRY') return 0.78;
          return 0.76;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

function matchesProviderDomainAllowlist(value: string, category: BonafiedCategory): boolean {
  const allowlist = PROVIDER_DOMAIN_ALLOWLIST[category] || [];
  if (!allowlist.length) {
    return true;
  }

  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return allowlist.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}
