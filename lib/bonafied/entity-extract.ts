import { cleanText } from '@/lib/bonafied/text';

const KNOWN_ENTITIES = [
  'Apple',
  'Google',
  'Meta',
  'OpenAI',
  'Microsoft',
  'Amazon',
  'Spotify',
  'YouTube',
  'TikTok',
  'Substack',
  'Patreon',
  'Nvidia',
  'Reuters',
  'CNBC',
  'Billboard',
  'Podnews',
  'Universal',
  'Merlin',
  'Federal Reserve',
  'Wall Street Journal'
];

const NOISY_ENTITY_TERMS = new Set([
  'the',
  'for',
  'now',
  'what',
  'less',
  'continue',
  'american',
  'california',
  'san',
  'francisco',
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
  'report',
  'reports',
  'analyst',
  'analysts',
  'update',
  'updates',
  'story',
  'stories'
]);

export function extractEntities(input: string): string[] {
  const text = cleanText(input);
  const found = new Set<string>();

  for (const entity of KNOWN_ENTITIES) {
    const expression = new RegExp(`\\b${escapeRegExp(entity)}\\b`, 'i');
    if (expression.test(text)) {
      found.add(entity);
    }
  }

  const properNounPhrases = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}\b/g) || [];
  for (const candidate of properNounPhrases) {
    if (candidate.length < 3 || candidate.length > 40) {
      continue;
    }
    const words = candidate.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      continue;
    }
    const first = words[0].toLowerCase();
    if (NOISY_ENTITY_TERMS.has(first) && words.length <= 2) {
      continue;
    }
    if (words.length === 1 && NOISY_ENTITY_TERMS.has(first)) {
      continue;
    }
    if (/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/i.test(candidate)) {
      continue;
    }
    found.add(candidate.trim());
    if (found.size > 16) {
      break;
    }
  }

  const acronymCandidates = text.match(/\b[A-Z0-9]{2,6}\b/g) || [];
  for (const candidate of acronymCandidates) {
    const upper = candidate.toUpperCase();
    const lower = upper.toLowerCase();
    if (NOISY_ENTITY_TERMS.has(lower)) {
      continue;
    }
    if (!/[A-Z]/.test(upper)) {
      continue;
    }
    found.add(upper);
    if (found.size > 16) {
      break;
    }
  }

  return [...found].slice(0, 14);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
