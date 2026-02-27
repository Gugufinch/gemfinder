import { apiUrl } from './api';

export type AnalyticsPayload = Record<string, string | number | boolean | null | undefined>;

interface TrackEventBody {
  name: string;
  payload: AnalyticsPayload;
  timestamp: string;
  path: string;
}

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

const postEvent = (body: TrackEventBody) => {
  fetch(apiUrl('/api/events'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    keepalive: true,
    body: JSON.stringify(body)
  }).catch(() => {
    // Analytics delivery should never block user flows.
  });
};

export const trackEvent = (name: string, payload: AnalyticsPayload = {}) => {
  if (typeof window === 'undefined') {
    return;
  }

  const body: TrackEventBody = {
    name,
    payload,
    timestamp: new Date().toISOString(),
    path: `${window.location.pathname}${window.location.hash}`
  };

  if (typeof window.gtag === 'function') {
    window.gtag('event', name, payload);
  }

  if (Array.isArray(window.dataLayer)) {
    window.dataLayer.push({ event: name, ...payload });
  }

  postEvent(body);
};
