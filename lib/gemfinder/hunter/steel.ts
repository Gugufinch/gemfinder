export type SteelScrapeResult = {
  url: string;
  pageHtml: string;
  extractedFields?: {
    contactEmail?: string;
    managerInfo?: string;
    toursInfo?: string;
    socialLinks?: string[];
  };
  scrapedAt: string;
};

// Process-wide semaphore: max 3 concurrent Steel sessions to protect free-tier quota.
class Semaphore {
  private permits: number;
  private waitQueue: Array<() => void> = [];
  constructor(permits: number) { this.permits = permits; }
  async acquire(): Promise<void> {
    if (this.permits > 0) { this.permits--; return; }
    return new Promise<void>((resolve) => { this.waitQueue.push(resolve); });
  }
  release(): void {
    const next = this.waitQueue.shift();
    if (next) { next(); } else { this.permits++; }
  }
}

export const steelSem = new Semaphore(3);

export function normalizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    // Strip tracking params first so we can decide whether root slash survives
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'];
    for (const p of trackingParams) {
      url.searchParams.delete(p);
    }
    const search = url.searchParams.toString();
    // Strip trailing slash from pathname; also strip root '/' when there are no remaining query params
    let pathname = url.pathname;
    if (pathname.endsWith('/') && (pathname.length > 1 || !search)) {
      pathname = pathname.slice(0, -1);
    }
    return url.origin + pathname + (search ? '?' + search : '');
  } catch {
    return rawUrl;
  }
}

function extractEmail(html: string): string | undefined {
  // Prefer mailto:
  const mailtoMatch = /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i.exec(html);
  if (mailtoMatch) return mailtoMatch[1].toLowerCase();
  // Fallback: any email-shaped string
  const plainMatch = /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/.exec(html);
  return plainMatch ? plainMatch[1].toLowerCase() : undefined;
}

function extractManagerInfo(html: string): string | undefined {
  // Look for patterns like "Management:", "Manager:", "Booking:", "Agency:"
  const re = /(?:Management|Manager|Booking|Agency):\s*([^\n<·,;]{2,80})/i;
  const m = re.exec(html);
  return m ? m[1].trim() : undefined;
}

export async function scrapeWebsite(url: string): Promise<SteelScrapeResult | null> {
  const apiKey = process.env.STEEL_API_KEY;
  if (!apiKey) {
    console.warn('[HUNTER_STEEL] STEEL_API_KEY not set; skipping scrape');
    return null;
  }

  await steelSem.acquire();
  try {
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 30000);

    let res: Response;
    try {
      res = await fetch('https://api.steel.dev/v1/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url, returnHtml: true, timeout: 30000 }),
        signal: ctrl.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn('[HUNTER_STEEL] network error:', err);
      return null;
    }
    clearTimeout(timeoutId);

    if (res.status === 429) {
      console.warn('[HUNTER_STEEL] 429 quota exhausted');
      return null;
    }
    if (!res.ok) {
      console.warn(`[HUNTER_STEEL] HTTP ${res.status}`);
      return null;
    }

    const body = await res.json().catch(() => null) as { pageHtml?: string } | null;
    if (!body || !body.pageHtml) {
      console.warn('[HUNTER_STEEL] empty response');
      return null;
    }

    const html = body.pageHtml;
    return {
      url,
      pageHtml: html,
      extractedFields: {
        contactEmail: extractEmail(html),
        managerInfo: extractManagerInfo(html),
      },
      scrapedAt: new Date().toISOString(),
    };
  } finally {
    steelSem.release();
  }
}
