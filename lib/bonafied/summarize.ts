import { sentenceSplit } from '@/lib/bonafied/text';

export function summarizeStory(
  title: string,
  content: string
): {
  brief: string;
  whyMatters: string[];
} {
  const sentences = sentenceSplit(content);
  const selected: string[] = [];

  for (const sentence of sentences) {
    if (selected.length >= 5) {
      break;
    }
    selected.push(sentence);
  }

  while (selected.length < 5) {
    if (selected.length === 0) {
      selected.push(`${title} is developing and details continue to emerge from verified reporting.`);
      continue;
    }
    if (selected.length === 1) {
      selected.push('The current coverage points to concrete operational or financial implications.');
      continue;
    }
    if (selected.length === 2) {
      selected.push('Market participants are evaluating whether this shift changes near-term strategy.');
      continue;
    }
    if (selected.length === 3) {
      selected.push('Additional confirmation across sources is being used to validate the signal.');
      continue;
    }
    selected.push('Further updates are expected as the story develops over the next reporting cycle.');
  }

  const why = buildWhyMatters(title, selected);
  return {
    brief: selected.join(' '),
    whyMatters: why
  };
}

function buildWhyMatters(title: string, sentences: string[]): string[] {
  const first = sentences[0] || title;
  const second = sentences[1] || sentences[0] || title;

  return [
    trimBullet(`This directly affects decision-making today because ${lowercaseFirst(first)}.`),
    trimBullet(`Cross-source confirmation suggests downstream impact as ${lowercaseFirst(second)}.`)
  ];
}

function lowercaseFirst(value: string): string {
  if (!value.length) {
    return value;
  }
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function trimBullet(value: string): string {
  return value.length > 220 ? `${value.slice(0, 217)}...` : value;
}
