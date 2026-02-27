import { CATEGORY_KEYWORDS } from '@/lib/bonafied/constants';
import { BonafiedCategory } from '@/lib/bonafied/types';

const MUSIC_STRONG_TERMS = [
  'music industry',
  'record label',
  'billboard',
  'grammy',
  'tour',
  'album',
  'single',
  'royalty',
  'publishing rights',
  'streaming rights',
  'warner music',
  'universal music',
  'sony music',
  'spotify',
  'apple music'
];

const MUSIC_ENTERTAINMENT_NOISE = [
  'tv show',
  'television',
  'tv series',
  'series',
  'season finale',
  'episode',
  'box office',
  'movie',
  'film',
  'drama',
  'actor',
  'actress',
  'grey s anatomy',
  "grey's anatomy",
  "grey's",
  'netflix series'
];

const PODCAST_STRONG_TERMS = [
  'podcast',
  'creator economy',
  'youtube creator',
  'newsletter',
  'substack',
  'patreon',
  'ad reads',
  'subscriber'
];

export function classifyCategory(text: string, fallback?: BonafiedCategory): BonafiedCategory {
  const haystack = text.toLowerCase();
  const scores = new Map<BonafiedCategory, number>();

  let bestCategory: BonafiedCategory = fallback || 'TECHNOLOGY';
  let bestScore = -1;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as Array<[
    BonafiedCategory,
    string[]
  ]>) {
    const score = keywords.reduce((acc, keyword) => acc + (haystack.includes(keyword) ? 1 : 0), 0);
    scores.set(category, score);
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  if (fallback) {
    const fallbackScore = scores.get(fallback) || 0;

    // Keep the feed's declared category unless the text strongly indicates another one.
    if (bestCategory !== fallback) {
      const notEnoughSignal = bestScore < 2;
      const weakMargin = bestScore - fallbackScore <= 1;
      if (notEnoughSignal || weakMargin) {
        return fallback;
      }
    }
  }

  return bestCategory;
}

export function categorySignalScore(text: string, category: BonafiedCategory): number {
  const haystack = text.toLowerCase();
  const keywords = CATEGORY_KEYWORDS[category] || [];
  let score = 0;
  for (const keyword of keywords) {
    if (haystack.includes(keyword)) {
      score += keyword.includes(' ') ? 2 : 1;
    }
  }

  if (category === 'MUSIC_INDUSTRY') {
    for (const keyword of MUSIC_STRONG_TERMS) {
      if (haystack.includes(keyword)) score += 2;
    }
  }
  if (category === 'PODCAST_CREATOR') {
    for (const keyword of PODCAST_STRONG_TERMS) {
      if (haystack.includes(keyword)) score += 2;
    }
  }

  return score;
}

export function isCategoryRelevant(text: string, category: BonafiedCategory): boolean {
  const haystack = text.toLowerCase();
  const score = categorySignalScore(text, category);

  if (category === 'MUSIC_INDUSTRY') {
    const strongMusic = MUSIC_STRONG_TERMS.some((term) => haystack.includes(term));
    const entertainmentNoise = MUSIC_ENTERTAINMENT_NOISE.some((term) => haystack.includes(term));
    if (entertainmentNoise && !strongMusic) {
      return false;
    }
    return strongMusic || score >= 2;
  }

  if (category === 'PODCAST_CREATOR') {
    const strongPodcast = PODCAST_STRONG_TERMS.some((term) => haystack.includes(term));
    return strongPodcast || score >= 2;
  }

  return score >= 1;
}
