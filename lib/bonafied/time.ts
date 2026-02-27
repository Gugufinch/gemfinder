import { DEFAULT_TIMEZONE, SAME_DAY_HOURS } from '@/lib/bonafied/constants';

export function withinLast24Hours(iso: string, now = Date.now()): boolean {
  const publishedAt = new Date(iso).getTime();
  if (!Number.isFinite(publishedAt)) {
    return false;
  }
  return now - publishedAt <= SAME_DAY_HOURS * 60 * 60 * 1000;
}

export function parseTimezone(value?: string | null): string {
  if (!value) {
    return DEFAULT_TIMEZONE;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return value;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function formatTimestamp(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(new Date(iso));
}

export function relativeTime(iso: string): string {
  const deltaMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(deltaMs / 60000);
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
