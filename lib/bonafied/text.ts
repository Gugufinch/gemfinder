const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'of',
  'to',
  'for',
  'in',
  'on',
  'at',
  'as',
  'is',
  'are',
  'was',
  'were',
  'be',
  'with',
  'from',
  'by',
  'that',
  'this',
  'it',
  'its',
  'into',
  'about',
  'new',
  'after',
  'ahead',
  'over',
  'across'
]);

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function cleanText(value: string): string {
  return normalizeWhitespace(value.replace(/<[^>]+>/g, ' '));
}

export function normalizeTitle(value: string): string {
  return cleanText(value)
    .toLowerCase()
    .replace(/[“”"'`]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(value: string): string[] {
  const normalized = normalizeTitle(value);
  return normalized
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

export function sentenceSplit(value: string): string[] {
  const plain = cleanText(value);
  return plain
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function jaccardSimilarity(left: string[], right: string[]): number {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const intersection = [...leftSet].filter((token) => rightSet.has(token)).length;
  const union = new Set([...leftSet, ...rightSet]).size;
  if (union === 0) {
    return 0;
  }
  return intersection / union;
}

export function cosineSimilarity(left: string[], right: string[]): number {
  const terms = new Set([...left, ...right]);
  if (!terms.size) {
    return 0;
  }

  const leftFreq = frequency(left);
  const rightFreq = frequency(right);

  let dot = 0;
  let leftMag = 0;
  let rightMag = 0;

  for (const term of terms) {
    const l = leftFreq.get(term) || 0;
    const r = rightFreq.get(term) || 0;
    dot += l * r;
    leftMag += l * l;
    rightMag += r * r;
  }

  if (!leftMag || !rightMag) {
    return 0;
  }

  return dot / (Math.sqrt(leftMag) * Math.sqrt(rightMag));
}

function frequency(tokens: string[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const token of tokens) {
    result.set(token, (result.get(token) || 0) + 1);
  }
  return result;
}
