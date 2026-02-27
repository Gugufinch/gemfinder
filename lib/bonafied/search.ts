export interface SearchableSignal {
  title: string;
  summary: string;
  entities: string[];
  content?: string;
  sourceName: string;
}

const SEARCH_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'by',
  'for',
  'from',
  'in',
  'into',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with'
]);

const QUERY_EXPANSIONS: Record<string, string[]> = {
  politics: [
    'political',
    'policy',
    'regulation',
    'regulatory',
    'government',
    'white house',
    'congress',
    'senate',
    'house',
    'election',
    'campaign',
    'lawmakers',
    'treasury',
    'federal reserve',
    'antitrust',
    'tariff',
    'sanctions',
    'geopolitics',
    'justice department',
    'sec'
  ],
  policy: ['regulation', 'government', 'legislation', 'lawmakers', 'congress', 'senate'],
  elections: ['election', 'campaign', 'voter', 'polls', 'congress'],
  ai: ['artificial intelligence', 'model', 'llm', 'openai', 'anthropic', 'nvidia'],
  music: ['label', 'streaming', 'tour', 'artist', 'royalty', 'billboard'],
  podcasts: ['podcast', 'creator economy', 'ad reads', 'spotify podcasts', 'youtube creators']
};

export function parseSearchTerms(raw: string): string[] {
  return raw
    .split(/[,\n;|]+/)
    .map((term) => normalizeTerm(term))
    .filter(Boolean);
}

export function expandedSearchTerms(raw: string): string[] {
  const terms = parseSearchTerms(raw);
  const expanded = new Set<string>(terms);

  for (const term of terms) {
    const tokens = tokenizeSearchTerm(term);
    for (const token of tokens) {
      const alias = QUERY_EXPANSIONS[token];
      if (!alias) {
        continue;
      }
      for (const item of alias) {
        const normalized = normalizeTerm(item);
        if (normalized) {
          expanded.add(normalized);
        }
      }
    }
  }

  return [...expanded];
}

export function scoreSearchMatch(signal: SearchableSignal, rawQuery: string): number {
  const terms = expandedSearchTerms(rawQuery);
  if (!terms.length) return 0;

  const title = normalizeHaystack(signal.title);
  const summary = normalizeHaystack(signal.summary);
  const entities = normalizeHaystack(signal.entities.join(' '));
  const content = normalizeHaystack(signal.content || '');
  const source = normalizeHaystack(signal.sourceName);
  const haystack = `${title} ${summary} ${entities} ${content} ${source}`;

  let score = 0;
  for (const term of terms) {
    if (!term) continue;
    if (title.includes(term)) score += 9;
    if (entities.includes(term)) score += 8;
    if (summary.includes(term)) score += 6;
    if (haystack.includes(term)) score += 3;

    const tokens = tokenizeSearchTerm(term);
    if (!tokens.length) continue;

    let matched = 0;
    for (const token of tokens) {
      if (haystack.includes(token)) {
        matched += 1;
        continue;
      }
      // Basic stemming fallback for pluralization/inflection.
      if (token.length > 4 && haystack.includes(token.slice(0, -1))) {
        matched += 1;
      }
    }

    if (matched === tokens.length) score += 6;
    else if (matched / tokens.length >= 0.66) score += 4;
    else if (matched > 0) score += 2;
  }

  return score;
}

export function isStrongSearchMatch(signal: SearchableSignal, rawQuery: string, threshold = 8): boolean {
  return scoreSearchMatch(signal, rawQuery) >= threshold;
}

function tokenizeSearchTerm(term: string): string[] {
  return term
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9&+.-]/g, '').trim())
    .filter((token) => token.length > 1 && !SEARCH_STOP_WORDS.has(token));
}

function normalizeTerm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeHaystack(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}
