'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { Bell, Bookmark, ExternalLink, FolderClosed, Plus, Rss, Search, Sparkles, VolumeX, X } from 'lucide-react';
import { BrainFireLogo } from '@/components/bonafied/brain-fire-logo';
import { CommandPalette } from '@/components/bonafied/command-palette';
import { CHANNEL_LABELS, CHANNEL_ORDER, DEFAULT_SOURCE_CREDIBILITY, DEFAULT_TIMEZONE } from '@/lib/bonafied/constants';
import { isStrongSearchMatch, scoreSearchMatch } from '@/lib/bonafied/search';
import { formatTimestamp, relativeTime } from '@/lib/bonafied/time';
import { Channel, Dossier, SearchResult, SignalResponse, StoryWithCluster, UserPreferences } from '@/lib/bonafied/types';

type SignalPayload = SignalResponse & {
  filedStoryIds: string[];
  live: {
    lastIngestAt: string;
    ingestCounter: number;
    recentCount: number;
  };
};

interface BonafiedAppProps {
  initialPayload: SignalPayload;
  initialPreferences: UserPreferences;
  initialDossiers: Dossier[];
  userId: string;
}

interface CustomChannel {
  id: string;
  name: string;
  query: string;
  mustTerms?: string[];
  anyTerms?: string[];
  excludeTerms?: string[];
}

type SourceTier = 'all' | 'trusted' | 'elite';

interface AlertRule {
  id: string;
  term: string;
  minScore: number;
  sourceTier: SourceTier;
  enabled: boolean;
}

interface DailyBriefItem {
  storyId: string;
  title: string;
  sourceName: string;
  publishedAt: string;
  summary: string;
  why: string[];
  url: string;
}

interface DailyBrief {
  dateKey: string;
  generatedAt: string;
  items: DailyBriefItem[];
}

const CHANNEL_PRESETS: Array<{ name: string; must: string[]; any: string[]; not: string[] }> = [
  {
    name: 'Politics & Policy',
    must: ['policy'],
    any: ['politics', 'congress', 'senate', 'white house', 'regulation'],
    not: ['celebrity', 'tv recap', 'entertainment']
  },
  {
    name: 'AI Regulation',
    must: ['ai'],
    any: ['regulation', 'policy', 'lawmakers', 'antitrust'],
    not: ['gaming review', 'movie']
  },
  {
    name: 'Music Rights',
    must: ['music'],
    any: ['royalty', 'label', 'publishing', 'streaming rights'],
    not: ['tv show', 'box office', "grey's anatomy"]
  },
  {
    name: 'Creator Revenue',
    must: ['creator'],
    any: ['sponsorship', 'ad rates', 'subscription', 'youtube'],
    not: ['movie trailer']
  }
];

const SOURCE_TIER_THRESHOLD: Record<SourceTier, number> = {
  all: 0,
  trusted: 0.78,
  elite: 0.88
};

const CONFIDENCE_WEIGHTS = {
  freshness: 0.36,
  source: 0.32,
  confirmation: 0.32
};

const INTEREST_BLOCKLIST = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'be',
  'but',
  'by',
  'california',
  'continue',
  'for',
  'francisco',
  'from',
  'has',
  'have',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'less',
  'more',
  'new',
  'now',
  'of',
  'on',
  'or',
  'our',
  'american',
  'that',
  'the',
  'their',
  'there',
  'these',
  'this',
  'to',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'with',
  'you',
  'your'
]);

const GENERIC_INTEREST_WORDS = new Set([
  'company',
  'companies',
  'day',
  'days',
  'week',
  'weeks',
  'month',
  'months',
  'year',
  'years',
  'story',
  'stories',
  'report',
  'reports',
  'update',
  'updates',
  'winds',
  'waves',
  'gen',
  'news',
  'today',
  'analyst',
  'analysts'
]);

function normalizeInterestCandidate(value: string): string {
  return value
    .replace(/[^A-Za-z0-9\s&+.'/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isMeaningfulInterest(rawValue: string): boolean {
  const value = normalizeInterestCandidate(rawValue);
  if (!value) return false;
  if (value.length < 3 || value.length > 44) return false;
  if (/^\d+$/.test(value)) return false;

  const words = value.split(' ').filter(Boolean);
  if (!words.length) return false;

  for (const word of words) {
    if (INTEREST_BLOCKLIST.has(word.toLowerCase()) && words.length === 1) {
      return false;
    }
  }

  if (words.length > 1) {
    const first = words[0].toLowerCase();
    if (INTEREST_BLOCKLIST.has(first) && words.length <= 2) {
      return false;
    }
  }

  if (words.length === 1) {
    const single = words[0];
    const lower = single.toLowerCase();
    if (GENERIC_INTEREST_WORDS.has(lower)) return false;
    const isAcronym = /^[A-Z0-9]{2,6}$/.test(single);
    const isNameLike = /^[A-Z][A-Za-z0-9'.-]{2,}$/.test(single);
    const isLongLowercase = /^[a-z][a-z0-9-]{4,}$/.test(single);
    if (!isAcronym && !isNameLike && !isLongLowercase) return false;
  }

  return true;
}

function parseTermList(raw: string): string[] {
  return raw
    .split(/[,\n;|]+/)
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function dedupeTerms(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

function sourceCredibility(sourceName: string): number {
  return DEFAULT_SOURCE_CREDIBILITY[sourceName] || 0.62;
}

function storyMatchesCustomChannel(story: StoryWithCluster, custom: CustomChannel): boolean {
  const must = custom.mustTerms || [];
  const any = custom.anyTerms || (custom.query ? [custom.query] : []);
  const exclude = custom.excludeTerms || [];

  if (exclude.some((term) => isStrongSearchMatch(story, term, 4))) {
    return false;
  }

  for (const term of must) {
    if (!isStrongSearchMatch(story, term, 4)) {
      return false;
    }
  }

  if (any.length && !any.some((term) => isStrongSearchMatch(story, term, 5))) {
    return false;
  }

  return true;
}

function scoreCustomChannelMatch(story: StoryWithCluster, custom: CustomChannel): number {
  const must = custom.mustTerms || [];
  const any = custom.anyTerms || (custom.query ? [custom.query] : []);
  const exclude = custom.excludeTerms || [];

  let score = 0;
  for (const term of must) {
    score += isStrongSearchMatch(story, term, 4) ? 14 + scoreSearchMatch(story, term) : -18;
  }

  for (const term of any) {
    if (isStrongSearchMatch(story, term, 5)) {
      score += 8 + scoreSearchMatch(story, term);
    }
  }

  for (const term of exclude) {
    if (isStrongSearchMatch(story, term, 4)) {
      score -= 30;
    }
  }

  if (!must.length && !any.length && custom.query) {
    score += scoreSearchMatch(story, custom.query);
  }

  return score;
}

function confidenceForStory(story: StoryWithCluster): { freshness: number; source: number; confirmation: number; total: number } {
  const ageHours = Math.max(0, (Date.now() - new Date(story.publishedAt).getTime()) / 36e5);
  const freshness = Math.max(0, Math.min(100, Math.round(100 - ageHours * 3.7)));
  const source = Math.round(sourceCredibility(story.sourceName) * 100);
  const confirmation = Math.max(24, Math.min(100, Math.round(28 + (story.cluster.storyIds.length - 1) * 22)));
  const total = Math.round(
    freshness * CONFIDENCE_WEIGHTS.freshness +
      source * CONFIDENCE_WEIGHTS.source +
      confirmation * CONFIDENCE_WEIGHTS.confirmation
  );
  return {
    freshness,
    source,
    confirmation,
    total
  };
}

function explainStory(story: StoryWithCluster, user: UserPreferences): string[] {
  const confidence = confidenceForStory(story);
  const chips: string[] = [];

  if (confidence.freshness >= 78) chips.push('New in last few hours');
  if (confidence.source >= 84) chips.push('High source trust');
  if (story.cluster.storyIds.length >= 2) chips.push('Cross-source confirmation');
  if (story.rankScore >= 75) chips.push('High signal score');
  if (story.entities.some((entity) => user.followedEntities.includes(entity))) chips.push('Matches your interests');
  if (!chips.length) chips.push('Same-day verified signal');
  return chips.slice(0, 4);
}

function toBriefMarkdown(brief: DailyBrief): string {
  const lines = [`# BONAFIED Daily Brief (${brief.dateKey})`, `Generated: ${brief.generatedAt}`, ''];
  for (const item of brief.items) {
    lines.push(`## ${item.title}`);
    lines.push(`- Source: ${item.sourceName}`);
    lines.push(`- Published: ${item.publishedAt}`);
    for (const point of item.why) {
      lines.push(`- ${point}`);
    }
    lines.push(`- Link: ${item.url}`);
    lines.push('');
  }
  return lines.join('\n');
}

function ruleMatchesStory(rule: AlertRule, story: StoryWithCluster): boolean {
  if (!rule.enabled) return false;
  if (story.rankScore < rule.minScore) return false;
  const sourceFloor = SOURCE_TIER_THRESHOLD[rule.sourceTier];
  if (sourceCredibility(story.sourceName) < sourceFloor) return false;
  return isStrongSearchMatch(story, rule.term, 5);
}

export function BonafiedApp({ initialPayload, initialPreferences, initialDossiers, userId }: BonafiedAppProps) {
  const [channel, setChannel] = useState<Channel>(initialPayload.channel);
  const [payload, setPayload] = useState<SignalPayload>(initialPayload);
  const [preferences, setPreferences] = useState<UserPreferences>(initialPreferences);
  const [selectedStoryId, setSelectedStoryId] = useState(initialPayload.hero?.id || '');
  const [loading, setLoading] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [cursorIndex, setCursorIndex] = useState(0);
  const [dossiers, setDossiers] = useState<Dossier[]>(initialDossiers);
  const [newSignalCount, setNewSignalCount] = useState(initialPayload.newSignalCount || 0);
  const [liveCounter, setLiveCounter] = useState(initialPayload.live.ingestCounter);
  const [onlyConfirmed, setOnlyConfirmed] = useState(false);
  const [hideLowCredibility, setHideLowCredibility] = useState(true);
  const [minSignalScore, setMinSignalScore] = useState(38);
  const [interestDraft, setInterestDraft] = useState('');
  const [customChannels, setCustomChannels] = useState<CustomChannel[]>([]);
  const [customChannelName, setCustomChannelName] = useState('');
  const [customChannelQuery, setCustomChannelQuery] = useState('');
  const [customMustDraft, setCustomMustDraft] = useState('');
  const [customAnyDraft, setCustomAnyDraft] = useState('');
  const [customExcludeDraft, setCustomExcludeDraft] = useState('');
  const [activeCustomChannelId, setActiveCustomChannelId] = useState<string | null>(null);
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [alertTermDraft, setAlertTermDraft] = useState('');
  const [alertMinScoreDraft, setAlertMinScoreDraft] = useState(68);
  const [alertTierDraft, setAlertTierDraft] = useState<SourceTier>('trusted');
  const [dailyBrief, setDailyBrief] = useState<DailyBrief | null>(null);
  const [detailView, setDetailView] = useState<'story' | 'brief'>('story');

  const filedSet = useMemo(() => new Set(payload.filedStoryIds), [payload.filedStoryIds]);

  const allStories = useMemo(() => {
    const map = new Map<string, StoryWithCluster>();
    if (payload.hero) {
      map.set(payload.hero.id, payload.hero);
    }

    for (const row of payload.rows) {
      for (const story of row.stories) {
        if (!map.has(story.id)) {
          map.set(story.id, story);
        }
      }
    }

    return [...map.values()];
  }, [payload]);

  const activeCustomChannel = useMemo(
    () => customChannels.find((item) => item.id === activeCustomChannelId) || null,
    [customChannels, activeCustomChannelId]
  );

  const followedEntityLookup = useMemo(
    () => new Set(preferences.followedEntities.map((entity) => entity.toLowerCase())),
    [preferences.followedEntities]
  );

  const draftCustomChannel = useMemo<CustomChannel>(() => {
    const mustTerms = dedupeTerms(parseTermList(customMustDraft));
    const anyTerms = dedupeTerms(parseTermList(customAnyDraft || customChannelQuery));
    const excludeTerms = dedupeTerms(parseTermList(customExcludeDraft));
    return {
      id: 'draft',
      name: customChannelName.trim() || 'Draft',
      query: [customChannelQuery, ...mustTerms, ...anyTerms].filter(Boolean).join(', '),
      mustTerms,
      anyTerms,
      excludeTerms
    };
  }, [customMustDraft, customAnyDraft, customExcludeDraft, customChannelName, customChannelQuery]);

  const customDraftPreviewCount = useMemo(() => {
    if (!customChannelName.trim()) return 0;
    return allStories.filter((story) => storyMatchesCustomChannel(story, draftCustomChannel)).length;
  }, [allStories, draftCustomChannel, customChannelName]);

  const suggestedInterests = useMemo(() => {
    const weighted = new Map<string, { label: string; weight: number; count: number }>();
    for (const story of allStories) {
      if (story.rankScore < 42) {
        continue;
      }
      if (sourceCredibility(story.sourceName) < 0.76) {
        continue;
      }
      for (const entity of story.entities) {
        const candidate = normalizeInterestCandidate(entity);
        if (!isMeaningfulInterest(candidate)) {
          continue;
        }

        const key = candidate.toLowerCase();
        if (followedEntityLookup.has(key)) {
          continue;
        }

        const baseWeight = Math.max(1, Math.round(story.rankScore / 20));
        const confirmationBoost = story.cluster.storyIds.length > 1 ? 1 : 0;
        const weight = baseWeight + confirmationBoost;

        const current = weighted.get(key);
        if (!current) {
          weighted.set(key, { label: candidate, weight, count: 1 });
          continue;
        }
        current.weight += weight;
        current.count += 1;
      }
    }

    return [...weighted.values()]
      .filter((item) => {
        const single = item.label.split(' ').length === 1;
        if (!single) return true;
        if (GENERIC_INTEREST_WORDS.has(item.label.toLowerCase())) return false;
        const acronym = /^[A-Z0-9]{2,6}$/.test(item.label);
        const nameLike = /^[A-Z][A-Za-z0-9'.-]{3,}$/.test(item.label);
        if (acronym) return true;
        if (nameLike && item.count >= 2) return true;
        return item.count >= 3;
      })
      .sort((a, b) => b.weight - a.weight)
      .map((item) => item.label)
      .slice(0, 10);
  }, [allStories, followedEntityLookup]);

  const filteredPayload = useMemo(() => {
    const effectiveMinScore = activeCustomChannel ? Math.max(18, minSignalScore - 14) : minSignalScore;
    const baseRows = payload.rows
      .map((row) => ({
        ...row,
        stories: row.stories.filter((story) => {
          const confirmedOk = !onlyConfirmed || story.cluster.storyIds.length >= 2;
          const scoreOk = story.rankScore >= effectiveMinScore;
          const sourceCredibility = DEFAULT_SOURCE_CREDIBILITY[story.sourceName] || 0.62;
          const credibilityOk = !hideLowCredibility || sourceCredibility >= 0.78;
          return confirmedOk && scoreOk && credibilityOk;
        })
      }))
      .filter((row) => row.stories.length > 0);

    let visibleRows = baseRows;

    let heroCandidate =
      payload.hero &&
      (!onlyConfirmed || payload.hero.cluster.storyIds.length >= 2) &&
      payload.hero.rankScore >= effectiveMinScore &&
      (!hideLowCredibility || (DEFAULT_SOURCE_CREDIBILITY[payload.hero.sourceName] || 0.62) >= 0.78)
        ? payload.hero
        : baseRows[0]?.stories[0] || null;

    let customFallback = false;
    let customMatchCount = 0;
    let customFallbackCount = 0;

    if (activeCustomChannel) {
      const matchedRows = baseRows
        .map((row) => ({
          ...row,
          stories: row.stories.filter((story) => storyMatchesCustomChannel(story, activeCustomChannel))
        }))
        .filter((row) => row.stories.length > 0);

      customMatchCount = matchedRows.reduce((sum, row) => sum + row.stories.length, 0);

      if (customMatchCount > 0) {
        visibleRows = matchedRows;
        if (heroCandidate && !storyMatchesCustomChannel(heroCandidate, activeCustomChannel)) {
          heroCandidate = matchedRows[0]?.stories[0] || null;
        }
      } else {
        customFallback = true;
        visibleRows = baseRows
          .map((row) => ({
            ...row,
            stories: [...row.stories]
              .map((story) => ({
                story,
                score: scoreCustomChannelMatch(story, activeCustomChannel)
              }))
              .filter((item) => item.score >= 22)
              .sort((a, b) => b.score - a.score)
              .map((item) => item.story)
          }))
          .filter((row) => row.stories.length > 0);
        customFallbackCount = visibleRows.reduce((sum, row) => sum + row.stories.length, 0);
        heroCandidate = visibleRows[0]?.stories[0] || null;
      }
    }

    return {
      ...payload,
      hero: heroCandidate,
      rows: visibleRows,
      customFallback,
      customMatchCount,
      customFallbackCount
    };
  }, [payload, onlyConfirmed, hideLowCredibility, minSignalScore, activeCustomChannel]);

  const visibleStories = useMemo(() => {
    const map = new Map<string, StoryWithCluster>();
    if (filteredPayload.hero) {
      map.set(filteredPayload.hero.id, filteredPayload.hero);
    }

    for (const row of filteredPayload.rows) {
      for (const story of row.stories) {
        if (!map.has(story.id)) {
          map.set(story.id, story);
        }
      }
    }

    return [...map.values()];
  }, [filteredPayload]);

  const selectedStory =
    visibleStories.find((story) => story.id === selectedStoryId) || filteredPayload.hero || visibleStories[0] || null;

  const alertSummaries = useMemo(() => {
    return alertRules.map((rule) => {
      const hits = visibleStories.filter((story) => ruleMatchesStory(rule, story));
      return {
        rule,
        hitCount: hits.length,
        topStoryId: hits[0]?.id
      };
    });
  }, [alertRules, visibleStories]);

  const totalAlertHits = useMemo(
    () => alertSummaries.reduce((sum, item) => sum + (item.rule.enabled ? item.hitCount : 0), 0),
    [alertSummaries]
  );

  const storyTimeline = useMemo(() => {
    if (!selectedStory) return [];
    return [selectedStory, ...selectedStory.additionalSources]
      .sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime())
      .map((story, idx) => ({
        id: `${story.id}_${idx}`,
        sourceName: story.sourceName,
        title: story.title,
        publishedAt: story.publishedAt,
        url: story.url
      }));
  }, [selectedStory]);

  useEffect(() => {
    document.body.dataset.accent = preferences.accent;
  }, [preferences.accent]);

  useEffect(() => {
    try {
      const key = `bonafied_custom_channels_${userId}`;
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return;
      }
      const valid = parsed
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const candidate = item as Partial<CustomChannel>;
          if (!candidate.id || !candidate.name) return null;
          const mustTerms = Array.isArray(candidate.mustTerms) ? candidate.mustTerms.map(String).filter(Boolean) : [];
          const anyTerms = Array.isArray(candidate.anyTerms) ? candidate.anyTerms.map(String).filter(Boolean) : [];
          const excludeTerms = Array.isArray(candidate.excludeTerms)
            ? candidate.excludeTerms.map(String).filter(Boolean)
            : [];
          const query = String(candidate.query || [...mustTerms, ...anyTerms].join(', ')).trim();
          return { id: String(candidate.id), name: String(candidate.name), query, mustTerms, anyTerms, excludeTerms };
        })
        .filter(Boolean) as CustomChannel[];
      setCustomChannels(valid);
    } catch {
      // noop
    }
  }, [userId]);

  useEffect(() => {
    try {
      const key = `bonafied_custom_channels_${userId}`;
      window.localStorage.setItem(key, JSON.stringify(customChannels));
    } catch {
      // noop
    }
  }, [customChannels, userId]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(`bonafied_alert_rules_${userId}`);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const valid = parsed
        .map((rule) => {
          if (!rule || typeof rule !== 'object') return null;
          const candidate = rule as Partial<AlertRule>;
          if (!candidate.id || !candidate.term) return null;
          const sourceTier: SourceTier =
            candidate.sourceTier === 'elite' || candidate.sourceTier === 'all' ? candidate.sourceTier : 'trusted';
          return {
            id: String(candidate.id),
            term: String(candidate.term),
            minScore: Number(candidate.minScore || 68),
            sourceTier,
            enabled: candidate.enabled !== false
          } as AlertRule;
        })
        .filter(Boolean) as AlertRule[];
      setAlertRules(valid);
    } catch {
      // noop
    }
  }, [userId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(`bonafied_alert_rules_${userId}`, JSON.stringify(alertRules));
    } catch {
      // noop
    }
  }, [alertRules, userId]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(`bonafied_daily_brief_${userId}`);
      if (!raw) return;
      const parsed = JSON.parse(raw) as DailyBrief;
      if (!parsed || !Array.isArray(parsed.items) || typeof parsed.dateKey !== 'string') return;
      setDailyBrief(parsed);
    } catch {
      // noop
    }
  }, [userId]);

  useEffect(() => {
    if (!visibleStories.length) return;
    const dateKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: preferences.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
    if (dailyBrief?.dateKey === dateKey) return;

    const items = [...visibleStories]
      .sort((a, b) => confidenceForStory(b).total - confidenceForStory(a).total)
      .slice(0, 6)
      .map((story) => ({
        storyId: story.id,
        title: story.title,
        sourceName: story.sourceName,
        publishedAt: formatTimestamp(story.publishedAt, preferences.timezone),
        summary: story.summary,
        why: explainStory(story, preferences).slice(0, 2),
        url: story.url
      }));

    const nextBrief: DailyBrief = {
      dateKey,
      generatedAt: new Date().toISOString(),
      items
    };
    setDailyBrief(nextBrief);
    try {
      window.localStorage.setItem(`bonafied_daily_brief_${userId}`, JSON.stringify(nextBrief));
    } catch {
      // noop
    }
  }, [visibleStories, preferences, userId, dailyBrief?.dateKey]);

  useEffect(() => {
    if (!selectedStoryId && filteredPayload.hero) {
      setSelectedStoryId(filteredPayload.hero.id);
    }
  }, [filteredPayload.hero, selectedStoryId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typingTarget = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(true);
        return;
      }

      if (commandOpen || typingTarget) {
        return;
      }

      if (event.key.toLowerCase() === 'j') {
        event.preventDefault();
        moveCursor(1);
        return;
      }

      if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        moveCursor(-1);
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        const focused = visibleStories[cursorIndex];
        if (focused) {
          setDetailView('story');
          setSelectedStoryId(focused.id);
        }
        return;
      }

      if (event.key.toLowerCase() === 's' && selectedStory) {
        event.preventDefault();
        void toggleFiled(selectedStory.id);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commandOpen, visibleStories, cursorIndex, selectedStory]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void pollLiveMeta();
    }, 30_000);

    return () => window.clearInterval(id);
  }, [liveCounter]);

  useEffect(() => {
    if (!commandOpen) {
      setCommandQuery('');
      setSearchResults([]);
    }
  }, [commandOpen]);

  useEffect(() => {
    const trimmed = commandQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      return;
    }

    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/signals/search?q=${encodeURIComponent(trimmed)}&channel=${encodeURIComponent(channel)}`,
          {
            cache: 'no-store'
          }
        );
        const data = await response.json();
        setSearchResults(data.results || []);
      } catch {
        setSearchResults([]);
      }
    }, 160);

    return () => window.clearTimeout(timeout);
  }, [commandQuery, channel]);

  const moveCursor = (delta: number) => {
    if (!visibleStories.length) {
      return;
    }
    const next = (cursorIndex + delta + visibleStories.length) % visibleStories.length;
    setCursorIndex(next);
    setDetailView('story');
    setSelectedStoryId(visibleStories[next].id);
  };

  const refreshSignals = async (
    nextChannel: Channel,
    options?: {
      q?: string;
      only24h?: boolean;
    }
  ) => {
    setLoading(true);

    try {
      const timezone = preferences.timezone || DEFAULT_TIMEZONE;
      const only24h = options?.only24h ?? preferences.only24h;
      const query = options?.q ?? searchTerm.trim();

      const response = await fetch(
        `/api/signals?channel=${encodeURIComponent(nextChannel)}&timezone=${encodeURIComponent(timezone)}&only24h=${only24h}&userId=${encodeURIComponent(userId)}&q=${encodeURIComponent(query)}`,
        {
          cache: 'no-store'
        }
      );

      const data = (await response.json()) as SignalPayload;
      setPayload(data);
      setNewSignalCount(data.newSignalCount || data.live.recentCount || 0);
      setLiveCounter(data.live.ingestCounter);

      const currentSelected = data.hero || data.rows[0]?.stories[0];
      if (currentSelected) {
        const stillExists = [data.hero, ...data.rows.flatMap((row) => row.stories)].some(
          (story) => story?.id === selectedStoryId
        );
        if (!stillExists) {
          setDetailView('story');
          setSelectedStoryId(currentSelected.id);
          setCursorIndex(0);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const pollLiveMeta = async () => {
    try {
      const response = await fetch('/api/signals/live', { cache: 'no-store' });
      const live = await response.json();

      if (live.ingestCounter > liveCounter) {
        setNewSignalCount(Math.max(live.recentCount || 0, 1));
      }
    } catch {
      // noop
    }
  };

  const patchPreferences = async (next: Partial<Omit<UserPreferences, 'userId'>>) => {
    const response = await fetch(`/api/preferences?userId=${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(next)
    });

    const data = await response.json();
    const updated = data.preferences as UserPreferences;
    setPreferences(updated);
    return updated;
  };

  const toggleFiled = async (storyId: string) => {
    const filed = !filedSet.has(storyId);
    const response = await fetch(`/api/filed?userId=${encodeURIComponent(userId)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ storyId, filed })
    });
    const data = await response.json();

    setPayload((current) => ({
      ...current,
      filedStoryIds: (data.filed || []).map((item: { storyId: string }) => item.storyId)
    }));
  };

  const createDossierFromSelected = async () => {
    if (!selectedStory) {
      return;
    }
    const name = window.prompt('Collection name');
    if (!name) {
      return;
    }

    const response = await fetch(`/api/dossiers?userId=${encodeURIComponent(userId)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name,
        storyIds: [selectedStory.id],
        notes: `Created from feed on ${new Date().toISOString()}`
      })
    });

    const data = await response.json();
    if (data.dossier) {
      setDossiers((current) => [data.dossier, ...current]);
    }
  };

  const addSelectedToDossier = async (dossierId: string) => {
    if (!selectedStory) {
      return;
    }

    const response = await fetch(`/api/dossiers?userId=${encodeURIComponent(userId)}&mode=add-story`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        dossierId,
        storyId: selectedStory.id
      })
    });

    const data = await response.json();
    if (data.dossier) {
      setDossiers((current) => current.map((dossier) => (dossier.id === data.dossier.id ? data.dossier : dossier)));
    }
  };

  const onSelectCommandResult = (result: SearchResult) => {
    if (result.type === 'story') {
      setDetailView('story');
      setSelectedStoryId(result.id);
      const index = visibleStories.findIndex((story) => story.id === result.id);
      if (index >= 0) {
        setCursorIndex(index);
      }
    }

    setCommandOpen(false);
  };

  const toggle24Hour = async () => {
    const nextValue = !preferences.only24h;
    const updated = await patchPreferences({ only24h: nextValue });
    await refreshSignals(channel, { only24h: updated.only24h });
  };

  const setAccent = async () => {
    const nextAccent = preferences.accent === 'cobalt' ? 'amber' : 'cobalt';
    await patchPreferences({ accent: nextAccent });
  };

  const onChangeChannel = async (next: Channel) => {
    setActiveCustomChannelId(null);
    setDetailView('story');
    setChannel(next);
    await refreshSignals(next);
  };

  const applySearch = async () => {
    const combinedQuery = activeCustomChannel ? `${activeCustomChannel.query} ${searchTerm}`.trim() : searchTerm;
    await refreshSignals(channel, { q: combinedQuery });
  };

  const addCustomChannel = async () => {
    const name = customChannelName.trim();
    const mustTerms = dedupeTerms(parseTermList(customMustDraft));
    const anyTerms = dedupeTerms(parseTermList(customAnyDraft || customChannelQuery || name));
    const excludeTerms = dedupeTerms(parseTermList(customExcludeDraft));
    const query = [...mustTerms, ...anyTerms].join(', ').slice(0, 220) || name;
    if (!name) {
      return;
    }

    const item: CustomChannel = {
      id: `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      query,
      mustTerms,
      anyTerms,
      excludeTerms
    };

    setCustomChannels((current) => [item, ...current]);
    setCustomChannelName('');
    setCustomChannelQuery('');
    setCustomMustDraft('');
    setCustomAnyDraft('');
    setCustomExcludeDraft('');
    setActiveCustomChannelId(item.id);
    setDetailView('story');
    setChannel('TODAY');
    await refreshSignals('TODAY');
  };

  const selectCustomChannel = async (item: CustomChannel) => {
    setActiveCustomChannelId(item.id);
    setDetailView('story');
    setChannel('TODAY');
    await refreshSignals('TODAY');
  };

  const deleteCustomChannel = async (id: string) => {
    setCustomChannels((current) => current.filter((item) => item.id !== id));

    if (activeCustomChannelId === id) {
      setActiveCustomChannelId(null);
      await refreshSignals('TODAY', { q: searchTerm.trim() });
    }
  };

  const addInterest = async (raw: string) => {
    const nextInterest = normalizeInterestCandidate(raw);
    if (!isMeaningfulInterest(nextInterest)) {
      setInterestDraft('');
      return;
    }
    if (preferences.followedEntities.some((item) => item.toLowerCase() === nextInterest.toLowerCase())) {
      setInterestDraft('');
      return;
    }

    const next = [...preferences.followedEntities, nextInterest];
    await patchPreferences({ followedEntities: next });
    setInterestDraft('');
    await refreshSignals(channel);
  };

  const applyChannelPreset = (presetName: string) => {
    const preset = CHANNEL_PRESETS.find((item) => item.name === presetName);
    if (!preset) return;
    setCustomChannelName(preset.name);
    setCustomMustDraft(preset.must.join(', '));
    setCustomAnyDraft(preset.any.join(', '));
    setCustomExcludeDraft(preset.not.join(', '));
    setCustomChannelQuery([...preset.must, ...preset.any].join(', '));
  };

  const removeInterest = async (entity: string) => {
    const next = preferences.followedEntities.filter((item) => item !== entity);
    await patchPreferences({ followedEntities: next });
    await refreshSignals(channel);
  };

  const addAlertRule = () => {
    const term = alertTermDraft.trim();
    if (!term) return;
    const id = `alert_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    setAlertRules((current) => [
      {
        id,
        term,
        minScore: alertMinScoreDraft,
        sourceTier: alertTierDraft,
        enabled: true
      },
      ...current
    ]);
    setAlertTermDraft('');
    setAlertMinScoreDraft(68);
    setAlertTierDraft('trusted');
  };

  const toggleAlertRule = (id: string) => {
    setAlertRules((current) =>
      current.map((rule) => (rule.id === id ? { ...rule, enabled: !rule.enabled } : rule))
    );
  };

  const removeAlertRule = (id: string) => {
    setAlertRules((current) => current.filter((rule) => rule.id !== id));
  };

  const generateBriefNow = () => {
    const dateKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: preferences.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
    const items = [...visibleStories]
      .sort((a, b) => confidenceForStory(b).total - confidenceForStory(a).total)
      .slice(0, 8)
      .map((story) => ({
        storyId: story.id,
        title: story.title,
        sourceName: story.sourceName,
        publishedAt: formatTimestamp(story.publishedAt, preferences.timezone),
        summary: story.summary,
        why: explainStory(story, preferences).slice(0, 2),
        url: story.url
      }));
    const nextBrief: DailyBrief = {
      dateKey,
      generatedAt: new Date().toISOString(),
      items
    };
    setDailyBrief(nextBrief);
    setDetailView('brief');
    try {
      window.localStorage.setItem(`bonafied_daily_brief_${userId}`, JSON.stringify(nextBrief));
    } catch {
      // noop
    }
  };

  const exportBriefMarkdown = async () => {
    if (!dailyBrief) return;
    const markdown = toBriefMarkdown(dailyBrief);
    try {
      await navigator.clipboard.writeText(markdown);
      window.alert('Daily brief copied as markdown.');
    } catch {
      window.alert(markdown);
    }
  };

  return (
    <LayoutGroup>
      <div className="bonafied-root">
        <header className="glass topbar">
          <div className="brand">
            <BrainFireLogo size={22} />
            BONAFIED
          </div>

          <nav className="topbar-center" aria-label="Channels">
            {CHANNEL_ORDER.map((item) => (
              <button
                key={item}
                className={`nav-chip ${channel === item && !activeCustomChannel ? 'active' : ''}`}
                onClick={() => {
                  void onChangeChannel(item);
                }}
              >
                {CHANNEL_LABELS[item]}
              </button>
            ))}
            {activeCustomChannel ? (
              <button
                className="nav-chip active"
                onClick={() => {
                  setActiveCustomChannelId(null);
                  void refreshSignals(channel, { q: searchTerm.trim() });
                }}
              >
                Custom: {activeCustomChannel.name}
              </button>
            ) : null}
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="command-trigger" onClick={() => setCommandOpen(true)}>
              <Search size={15} />
              Search News
              <span className="kbd">⌘K</span>
            </button>

            <button
              className="small-btn"
              onClick={() => {
                void setAccent();
              }}
            >
              Accent: {preferences.accent === 'cobalt' ? 'Cobalt' : 'Amber'}
            </button>

            <div className="live-pill" title={`Last ingest: ${formatTimestamp(payload.live.lastIngestAt, preferences.timezone)}`}>
              <span className="live-dot" />
              {newSignalCount > 0 ? `${newSignalCount} new stories` : 'Feed synced'}
              {newSignalCount > 0 ? (
                <button
                  className="ghost-btn"
                  onClick={() => {
                    setNewSignalCount(0);
                    void refreshSignals(channel);
                  }}
                >
                  Refresh
                </button>
              ) : null}
            </div>

            <div className="live-pill" title="Alert rule hits in current wire">
              <span className="live-dot" style={{ background: totalAlertHits ? 'var(--accent)' : '#94a3b8', boxShadow: 'none' }} />
              {totalAlertHits ? `${totalAlertHits} alert hits` : 'No alert hits'}
            </div>
          </div>
        </header>

        <aside className="glass sidebar">
          <section>
            <div className="panel-title">Saved</div>
            <button className={`side-item ${channel === 'TODAY' ? 'active' : ''}`} onClick={() => void onChangeChannel('TODAY')}>
              <Rss size={16} />
              <span>Feed</span>
            </button>
            <button className="side-item" onClick={() => selectedStory && void toggleFiled(selectedStory.id)}>
              <Bookmark size={16} />
              <span className={selectedStory && filedSet.has(selectedStory.id) ? 'filed' : ''}>Saved</span>
            </button>
            <button className="side-item" onClick={createDossierFromSelected}>
              <FolderClosed size={16} />
              <span>Collection</span>
              <span className="side-meta">{dossiers.length}</span>
            </button>
          </section>

          <section>
            <div className="panel-title">Channels</div>
            {CHANNEL_ORDER.filter((item) => item !== 'TODAY').map((item) => (
              <button
                key={item}
                className={`side-item ${channel === item ? 'active' : ''}`}
                onClick={() => {
                  void onChangeChannel(item);
                }}
              >
                <Sparkles size={15} />
                <span>{CHANNEL_LABELS[item]}</span>
              </button>
            ))}
          </section>

          <section>
            <div className="panel-title">Custom Channels</div>
            <div className="custom-channel-form">
              <input
                value={customChannelName}
                onChange={(event) => setCustomChannelName(event.target.value)}
                placeholder="Channel name"
                className="custom-input"
              />
              <input
                value={customChannelQuery}
                onChange={(event) => setCustomChannelQuery(event.target.value)}
                placeholder="Seed keywords"
                className="custom-input"
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={customMustDraft}
                  onChange={(event) => setCustomMustDraft(event.target.value)}
                  placeholder="Must include (A,B)"
                  className="custom-input"
                />
                <input
                  value={customAnyDraft}
                  onChange={(event) => setCustomAnyDraft(event.target.value)}
                  placeholder="Any of (C,D)"
                  className="custom-input"
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={customExcludeDraft}
                  onChange={(event) => setCustomExcludeDraft(event.target.value)}
                  placeholder="Exclude (X,Y)"
                  className="custom-input"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void addCustomChannel();
                    }
                  }}
                />
                <button className="small-btn" onClick={() => void addCustomChannel()}>
                  <Plus size={13} /> Save
                </button>
              </div>
            </div>

            <div className="entity-row" style={{ marginTop: 8 }}>
              {CHANNEL_PRESETS.map((preset) => (
                <button key={preset.name} className="entity-pill" onClick={() => applyChannelPreset(preset.name)}>
                  {preset.name}
                </button>
              ))}
            </div>

            <div style={{ color: 'var(--text-tertiary)', fontSize: 11, marginTop: 8 }}>
              Preview: {customDraftPreviewCount} current matches
            </div>

            {customChannels.length ? (
              <div className="custom-channel-list">
                {customChannels.map((item) => (
                  <div
                    key={item.id}
                    className="custom-channel-row"
                    style={
                      activeCustomChannelId === item.id
                        ? {
                            borderColor: 'color-mix(in srgb, var(--accent) 46%, transparent)',
                            background: 'color-mix(in srgb, var(--accent) 20%, transparent)'
                          }
                        : undefined
                    }
                  >
                    <button
                      className="custom-channel-main"
                      onClick={() => void selectCustomChannel(item)}
                    >
                      <Sparkles size={14} />
                      <span className="custom-channel-name">{item.name}</span>
                      <span className="custom-channel-query">{item.query}</span>
                    </button>
                    <button
                      className="custom-channel-delete"
                      onClick={() => void deleteCustomChannel(item.id)}
                      title={`Delete ${item.name}`}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                Create channels like “AI Policy”, “Streaming Deals”, or “Ad Market”.
              </div>
            )}
          </section>

          <section>
            <div className="panel-title">Daily Brief</div>
            <div className="toggle" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{dailyBrief ? `${dailyBrief.items.length} signals` : 'No brief yet'}</span>
                <button
                  className="small-btn"
                  onClick={() => {
                    setDetailView('brief');
                    if (!dailyBrief) generateBriefNow();
                  }}
                >
                  Open
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="small-btn" onClick={generateBriefNow}>
                  Regenerate
                </button>
                <button className="small-btn" onClick={() => void exportBriefMarkdown()}>
                  Copy MD
                </button>
              </div>
            </div>
          </section>

          <section>
            <div className="panel-title">Alert Rules</div>
            <div style={{ display: 'grid', gap: 8 }}>
              <input
                className="custom-input"
                value={alertTermDraft}
                onChange={(event) => setAlertTermDraft(event.target.value)}
                placeholder="Entity or topic"
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="custom-input"
                  type="number"
                  min={0}
                  max={100}
                  value={alertMinScoreDraft}
                  onChange={(event) => setAlertMinScoreDraft(Number(event.target.value) || 0)}
                  placeholder="Min score"
                />
                <select
                  className="custom-input"
                  value={alertTierDraft}
                  onChange={(event) => setAlertTierDraft(event.target.value as SourceTier)}
                >
                  <option value="all">All sources</option>
                  <option value="trusted">Trusted+</option>
                  <option value="elite">Elite only</option>
                </select>
                <button className="small-btn" onClick={addAlertRule}>
                  Add
                </button>
              </div>
            </div>

            {alertSummaries.length ? (
              <div className="custom-channel-list" style={{ marginTop: 8 }}>
                {alertSummaries.map(({ rule, hitCount, topStoryId }) => (
                  <div key={rule.id} className="custom-channel-row">
                    <button
                      className="custom-channel-main"
                      onClick={() => {
                        if (topStoryId) {
                          setDetailView('story');
                          setSelectedStoryId(topStoryId);
                        }
                      }}
                    >
                      <span className="custom-channel-name">{rule.term}</span>
                      <span className="custom-channel-query">
                        {rule.enabled ? 'ON' : 'OFF'} • score {rule.minScore}+ • {rule.sourceTier} • {hitCount} hits
                      </span>
                    </button>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="custom-channel-delete" onClick={() => toggleAlertRule(rule.id)}>
                        {rule.enabled ? 'Pause' : 'On'}
                      </button>
                      <button className="custom-channel-delete" onClick={() => removeAlertRule(rule.id)}>
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: 'var(--text-tertiary)', fontSize: 11, marginTop: 8 }}>
                Add rules like "OpenAI", "Fed", or "music royalties".
              </div>
            )}
          </section>

          <section>
            <div className="panel-title">Filters</div>
            <div className="toggle">
              <span>Last 24 hours</span>
              <button onClick={() => void toggle24Hour()}>{preferences.only24h ? 'ON' : 'OFF'}</button>
            </div>

            <div className="toggle" style={{ marginTop: 10 }}>
              <span>Timezone</span>
              <span>{preferences.timezone}</span>
            </div>

            <div className="toggle" style={{ marginTop: 10, flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <span style={{ width: '100%' }}>Quick Search</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="custom-input"
                  style={{ flex: 1 }}
                  placeholder="Topic, company, person"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
                <button className="small-btn" onClick={() => void applySearch()}>
                  Go
                </button>
              </div>
            </div>
          </section>

          <section>
            <div className="panel-title">Quality</div>
            <div className="toggle">
              <span>2+ sources only</span>
              <button onClick={() => setOnlyConfirmed((current) => !current)}>{onlyConfirmed ? 'ON' : 'OFF'}</button>
            </div>

            <div className="toggle" style={{ marginTop: 10 }}>
              <span>Trusted sources only</span>
              <button onClick={() => setHideLowCredibility((current) => !current)}>
                {hideLowCredibility ? 'ON' : 'OFF'}
              </button>
            </div>

            <div className="toggle" style={{ marginTop: 10, flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <span style={{ width: '100%' }}>Min quality score: {minSignalScore}</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={minSignalScore}
                onChange={(event) => setMinSignalScore(Number(event.target.value))}
              />
            </div>
          </section>

          <section>
            <div className="panel-title">Interests</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={interestDraft}
                onChange={(event) => setInterestDraft(event.target.value)}
                placeholder="Add interest"
                className="custom-input"
                style={{ flex: 1 }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void addInterest(interestDraft);
                  }
                }}
              />
              <button className="small-btn" onClick={() => void addInterest(interestDraft)}>
                Add
              </button>
            </div>

            {preferences.followedEntities.length ? (
              <div className="entity-row" style={{ marginTop: 10 }}>
                {preferences.followedEntities.map((entity) => (
                  <button key={entity} className="entity-pill" onClick={() => void removeInterest(entity)}>
                    {entity} ×
                  </button>
                ))}
              </div>
            ) : null}

            {suggestedInterests.length ? (
              <div style={{ marginTop: 10 }}>
                <div style={{ color: 'var(--text-tertiary)', fontSize: 11, marginBottom: 7 }}>Suggested</div>
                <div className="entity-row">
                  {suggestedInterests.map((entity) => (
                    <button key={entity} className="entity-pill" onClick={() => void addInterest(entity)}>
                      + {entity}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        </aside>

        <main className="glass feed-panel">
          <AnimatePresence mode="wait">
            <motion.div
              key={channel}
              initial={{ opacity: 0, x: 42 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -42 }}
              transition={{ duration: 0.32, ease: [0.22, 0.61, 0.36, 1] }}
            >
              {filteredPayload.hero ? (
                <section className="hero-wrap fade-slide">
                  <div className="hero-label">Top Story</div>
                  <motion.h1 layoutId={`story-title-${filteredPayload.hero.cluster.id}`} className="hero-title">
                    {filteredPayload.hero.title}
                  </motion.h1>
                  <div className="hero-meta">
                    <span className="hero-badge">{CHANNEL_LABELS[filteredPayload.hero.category]}</span>
                    <span>{filteredPayload.hero.sourceName}</span>
                    <span>{formatTimestamp(filteredPayload.hero.publishedAt, preferences.timezone)}</span>
                    <span>{relativeTime(filteredPayload.hero.publishedAt)}</span>
                    <span>Cluster {filteredPayload.hero.cluster.storyIds.length}</span>
                  </div>
                  {filteredPayload.hero.imageUrl ? (
                    <img className="hero-image" src={filteredPayload.hero.imageUrl} alt="Hero story" loading="eager" />
                  ) : null}
                </section>
              ) : null}

              {activeCustomChannel && filteredPayload.customFallback && filteredPayload.customFallbackCount > 0 ? (
                <section className="row-shell">
                  <p className="channel-note">
                    No exact stories for "{activeCustomChannel.name}" in the last 24 hours. Showing closest matches.
                  </p>
                </section>
              ) : null}

              {activeCustomChannel && !filteredPayload.customFallback && filteredPayload.customMatchCount > 0 ? (
                <section className="row-shell">
                  <p className="channel-note">
                    {filteredPayload.customMatchCount} stories matched "{activeCustomChannel.name}".
                  </p>
                </section>
              ) : null}

              {loading ? (
                <section className="row-shell">
                  <div className="row-track">
                    <div className="skeleton skeleton-row" />
                    <div className="skeleton skeleton-row" />
                    <div className="skeleton skeleton-row" />
                  </div>
                </section>
              ) : null}

              {!loading && filteredPayload.rows.length ? (
                filteredPayload.rows.map((row, rowIndex) => (
                  <section className="row-shell fade-slide" style={{ animationDelay: `${rowIndex * 60}ms` }} key={row.channel}>
                    <header className="row-head">
                      <h2 className="row-title">{row.title}</h2>
                      <span className="side-meta">{row.stories.length} stories</span>
                    </header>

                    <div className="row-track">
                      {row.stories.map((story) => {
                        const isSelected = story.id === selectedStory?.id;
                        const confidence = confidenceForStory(story);
                        const reasons = explainStory(story, preferences);
                        return (
                          <motion.article
                            key={story.id}
                            className="signal-card"
                            onClick={() => {
                              setDetailView('story');
                              setSelectedStoryId(story.id);
                            }}
                            layoutId={`story-card-${story.id}`}
                            style={
                              isSelected
                                ? {
                                    borderColor: 'color-mix(in srgb, var(--accent) 55%, transparent)',
                                    boxShadow: '0 16px 48px rgba(0,0,0,0.34)'
                                  }
                                : undefined
                            }
                          >
                            <div className="signal-top">
                              <span>{story.sourceName}</span>
                              <span className="signal-score">{Math.round(story.rankScore)}</span>
                            </div>

                            <motion.h3 layoutId={`story-title-${story.cluster.id}`} className="signal-title">
                              {story.title}
                            </motion.h3>
                            <p className="signal-summary">{story.summary.slice(0, 140)}...</p>

                            <div className="confidence-track" title={`Confidence ${confidence.total}`}>
                              <span style={{ width: `${confidence.total}%` }} />
                            </div>

                            <div className="reason-row">
                              {reasons.slice(0, 2).map((reason) => (
                                <span key={`${story.id}_${reason}`} className="reason-chip">
                                  {reason}
                                </span>
                              ))}
                            </div>

                            <div className="signal-meta">
                              <span>{formatTimestamp(story.publishedAt, preferences.timezone)}</span>
                              <span>{story.cluster.storyIds.length} sources</span>
                            </div>
                          </motion.article>
                        );
                      })}
                    </div>
                  </section>
                ))
              ) : null}

              {!loading && !filteredPayload.rows.length ? (
                <section className="row-shell">
                  <p className="detail-blurb">
                    {activeCustomChannel
                      ? `No stories found for "${activeCustomChannel.name}". Try broader keywords or lower the quality filter.`
                      : 'No stories match these filters. Try lowering the quality score.'}
                  </p>
                </section>
              ) : null}
            </motion.div>
          </AnimatePresence>
        </main>

        <aside className="glass detail-panel">
          {detailView === 'brief' && dailyBrief ? (
            <div>
              <div className="detail-eyebrow">Daily Brief</div>
              <h2 className="detail-title">Today&apos;s Top Verified Signals</h2>
              <div className="inline-actions">
                <button className="small-btn" onClick={() => setDetailView('story')}>
                  Back to Story
                </button>
                <button className="small-btn" onClick={() => void exportBriefMarkdown()}>
                  Copy Markdown
                </button>
              </div>
              <div className="source-list" style={{ marginTop: 14 }}>
                {dailyBrief.items.map((item) => (
                  <a key={item.storyId} className="source-link" href={item.url} target="_blank" rel="noreferrer">
                    <span>
                      {item.sourceName} • {item.title}
                    </span>
                    <span>{item.publishedAt}</span>
                  </a>
                ))}
              </div>
            </div>
          ) : selectedStory ? (
            <motion.div layoutId={`story-card-${selectedStory.id}`}>
              <div className="detail-eyebrow">Story Details</div>
              <motion.h2 layoutId={`story-title-${selectedStory.cluster.id}`} className="detail-title">
                {selectedStory.title}
              </motion.h2>

              <div className="detail-meta">
                <span className="detail-pill">{CHANNEL_LABELS[selectedStory.category]}</span>
                <span>{selectedStory.sourceName}</span>
                <span>{formatTimestamp(selectedStory.publishedAt, preferences.timezone)}</span>
                <span>{relativeTime(selectedStory.publishedAt)}</span>
              </div>

              {(() => {
                const confidence = confidenceForStory(selectedStory);
                const reasons = explainStory(selectedStory, preferences);
                return (
                  <div className="detail-block" style={{ marginTop: 14 }}>
                    <div className="detail-label">Signal Confidence</div>
                    <div className="confidence-track">
                      <span style={{ width: `${confidence.total}%` }} />
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 6, color: 'var(--text-tertiary)', fontSize: 11 }}>
                      <span>Freshness {confidence.freshness}</span>
                      <span>Source {confidence.source}</span>
                      <span>Confirmation {confidence.confirmation}</span>
                    </div>
                    <div className="reason-row" style={{ marginTop: 8 }}>
                      {reasons.map((reason) => (
                        <span key={`${selectedStory.id}_${reason}_detail`} className="reason-chip">
                          {reason}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div className="detail-link-wrap">
                <a className="article-link-btn" href={selectedStory.url} target="_blank" rel="noreferrer">
                  <ExternalLink size={14} /> Read Original Article
                </a>
                <a className="article-link-text" href={selectedStory.url} target="_blank" rel="noreferrer">
                  {selectedStory.url}
                </a>
              </div>

              <div className="detail-block">
                <div className="detail-label">Summary</div>
                <p className="detail-brief">{selectedStory.summary}</p>
              </div>

              <div className="inline-actions detail-block">
                <button className={`small-btn ${filedSet.has(selectedStory.id) ? 'primary' : ''}`} onClick={() => void toggleFiled(selectedStory.id)}>
                  <Bookmark size={14} /> {filedSet.has(selectedStory.id) ? 'Saved' : 'Save'}
                </button>

                <button
                  className="small-btn"
                  onClick={() => {
                    const entity = selectedStory.entities[0];
                    if (!entity) {
                      return;
                    }
                    const next = preferences.followedEntities.includes(entity)
                      ? preferences.followedEntities.filter((item) => item !== entity)
                      : [...preferences.followedEntities, entity];
                    void patchPreferences({ followedEntities: next });
                  }}
                >
                  <Bell size={14} /> Follow Topic
                </button>

                <button
                  className="small-btn"
                  onClick={() => {
                    const source = selectedStory.sourceName;
                    const next = preferences.mutedSources.includes(source)
                      ? preferences.mutedSources.filter((item) => item !== source)
                      : [...preferences.mutedSources, source];
                    void patchPreferences({ mutedSources: next }).then(() => refreshSignals(channel));
                  }}
                >
                  <VolumeX size={14} /> Hide Source
                </button>
              </div>

              <div className="detail-block">
                <div className="detail-label">Why it matters</div>
                {selectedStory.whyMatters.map((point, idx) => (
                  <p key={`${selectedStory.id}_${idx}`} className="why-item">
                    {point}
                  </p>
                ))}
              </div>

              <div className="detail-block">
                <div className="detail-label">Entities</div>
                <div className="entity-row">
                  {selectedStory.entities.map((entity) => (
                    <button
                      key={entity}
                      className="entity-pill"
                      onClick={() => {
                        setSearchTerm(entity);
                        void refreshSignals(channel, { q: entity });
                      }}
                    >
                      {entity}
                    </button>
                  ))}
                </div>
              </div>

              <div className="detail-block">
                <div className="detail-label">More Sources</div>
                <div className="source-list">
                  {[selectedStory, ...selectedStory.additionalSources].map((story) => (
                    <a key={story.id} className="source-link" href={story.url} target="_blank" rel="noreferrer">
                      <span>
                        {story.sourceName} • {story.title}
                      </span>
                      <span>{relativeTime(story.publishedAt)}</span>
                    </a>
                  ))}
                </div>
              </div>

              <div className="detail-block">
                <div className="detail-label">Event Timeline</div>
                <div className="timeline">
                  {storyTimeline.map((entry) => (
                    <a key={entry.id} className="timeline-item" href={entry.url} target="_blank" rel="noreferrer">
                      <span className="timeline-dot" />
                      <div style={{ minWidth: 0 }}>
                        <div className="timeline-title">{entry.sourceName}</div>
                        <div className="timeline-sub">{entry.title}</div>
                      </div>
                      <span className="timeline-time">{formatTimestamp(entry.publishedAt, preferences.timezone)}</span>
                    </a>
                  ))}
                </div>
              </div>

              <div className="detail-block">
                <div className="detail-label">Collections</div>
                <div className="inline-actions">
                  <button className="small-btn primary" onClick={createDossierFromSelected}>
                    New Collection
                  </button>
                  {dossiers.slice(0, 3).map((dossier) => (
                    <button key={dossier.id} className="small-btn" onClick={() => void addSelectedToDossier(dossier.id)}>
                      Add to {dossier.name}
                    </button>
                  ))}
                </div>

                {dossiers[0] ? (
                  <div style={{ marginTop: 10 }}>
                    <a
                      className="source-link"
                      href={`/api/dossiers/${dossiers[0].id}/export?format=markdown&userId=${encodeURIComponent(userId)}`}
                    >
                      <span>Export latest collection</span>
                      <span>Download</span>
                    </a>
                  </div>
                ) : null}
              </div>
            </motion.div>
          ) : (
            <div className="detail-blurb">Select a story to see details.</div>
          )}
        </aside>
      </div>

      <CommandPalette
        open={commandOpen}
        query={commandQuery}
        onQueryChange={setCommandQuery}
        results={searchResults}
        onClose={() => setCommandOpen(false)}
        onSelect={onSelectCommandResult}
      />
    </LayoutGroup>
  );
}
