import crypto from 'node:crypto';
import { StoryRecord } from '@/lib/bonafied/types';
import { extractEntities } from '@/lib/bonafied/entity-extract';
import { summarizeStory } from '@/lib/bonafied/summarize';

interface SeedTemplate {
  title: string;
  sourceName: string;
  sourceUrl: string;
  url: string;
  category: StoryRecord['category'];
  hoursAgo: number;
  content: string;
  imageUrl?: string;
}

const templates: SeedTemplate[] = [
  {
    title: 'Apple expands on-device AI partnership with enterprise software vendors',
    sourceName: 'Reuters',
    sourceUrl: 'https://www.reuters.com',
    url: 'https://www.reuters.com/technology/apple-device-ai-enterprise-2026-02-27/',
    category: 'TECHNOLOGY',
    hoursAgo: 1.2,
    content:
      'Apple outlined a new set of on-device AI developer agreements focused on secure enterprise workflows. The agreements are designed to let business software vendors deploy summarization and automation features without moving sensitive records to external clouds. Executives said several Fortune 500 pilots are already underway and pricing details will be announced next quarter. Analysts said the move strengthens Apple in privacy-sensitive regulated markets. Microsoft and Google were both referenced by procurement teams as comparison points.'
  },
  {
    title: 'Apple signs enterprise AI workflow deals to target regulated sectors',
    sourceName: 'The Information',
    sourceUrl: 'https://www.theinformation.com',
    url: 'https://www.theinformation.com/articles/apple-enterprise-ai-workflow-regulated-sectors',
    category: 'TECHNOLOGY',
    hoursAgo: 1.5,
    content:
      'A set of enterprise buyers said Apple is offering new workflow agreements tied to private AI inference on Apple silicon hardware. Healthcare and financial firms are early targets. The program positions Apple against cloud-first tooling and highlights compliance messaging. Procurement teams expect pilot deployments to expand through the next two quarters. Contract language emphasizes data residency and auditability.'
  },
  {
    title: 'Spotify reports ad revenue acceleration as creator subscription bundles rise',
    sourceName: 'Bloomberg',
    sourceUrl: 'https://www.bloomberg.com',
    url: 'https://www.bloomberg.com/news/articles/2026-02-27/spotify-ad-revenue-creator-subscription-bundles',
    category: 'PODCAST_CREATOR',
    hoursAgo: 2.8,
    content:
      'Spotify reported that ad revenue growth accelerated in the latest quarter as creator-led subscription bundles expanded across key markets. The company said podcast inventory fill rates improved and branded content spending returned in several verticals. Management pointed to bundled distribution with video and newsletters as a driver for higher retention. Analysts expect margins to improve if direct-sold campaigns remain stable. Competitors are likely to respond with deeper creator monetization tooling.'
  },
  {
    title: 'Music labels test faster payout rails for independent artists on major DSPs',
    sourceName: 'Billboard',
    sourceUrl: 'https://www.billboard.com',
    url: 'https://www.billboard.com/pro/music-labels-faster-payout-rails-independent-artists/',
    category: 'MUSIC_INDUSTRY',
    hoursAgo: 3.4,
    content:
      'Major and independent labels have started pilots for faster royalty payout rails tied to monthly streaming statements. The new workflows are designed to shorten delays for independent artists and producers. DSP distribution teams said the testing phase covers regional catalogs first before broad rollout. Executives framed the change as competitive pressure from creator-first platforms. Artists and managers said payout transparency is becoming a contract priority.'
  },
  {
    title: 'Federal Reserve commentary cools rate-cut expectations, stocks trim gains',
    sourceName: 'Wall Street Journal',
    sourceUrl: 'https://www.wsj.com',
    url: 'https://www.wsj.com/finance/stocks/fed-commentary-cools-rate-cut-expectations-2026-02-27',
    category: 'BUSINESS',
    hoursAgo: 0.9,
    content:
      'Fresh commentary from Federal Reserve officials reduced expectations for immediate rate cuts, prompting U.S. equities to trim early gains. Treasury yields moved higher while defensive sectors outperformed high-growth names during afternoon trading. Economists noted that labor and inflation prints remain central to the policy path. Traders quickly repriced futures to reflect a slower easing timeline. Corporate issuers said debt market timing has become more selective.'
  },
  {
    title: 'OpenAI and global publisher coalition agree to licensed archive access',
    sourceName: 'Financial Times',
    sourceUrl: 'https://www.ft.com',
    url: 'https://www.ft.com/content/openai-global-publisher-coalition-licensed-archive-access',
    category: 'TECHNOLOGY',
    hoursAgo: 4.1,
    content:
      'OpenAI reached a licensing framework with a coalition of international publishers to access archival reporting for model training and retrieval. The framework includes attribution commitments and periodic auditing rights. Publishing executives described the deal as a template for future AI agreements. Legal experts said the structure may reduce litigation risk if transparency controls hold. Market observers expect similar negotiations across regional media groups.'
  },
  {
    title: 'YouTube rolls out mid-roll controls for podcast video networks',
    sourceName: 'Podnews',
    sourceUrl: 'https://podnews.net',
    url: 'https://podnews.net/update/youtube-mid-roll-controls-podcast-video-networks',
    category: 'PODCAST_CREATOR',
    hoursAgo: 5.5,
    content:
      'YouTube introduced new mid-roll controls aimed at podcast video networks that need more precise ad placement and pacing. The controls include episode-level defaults and network-wide templates for repeated formats. Creator operations teams said the update could lower manual editing overhead and improve campaign consistency. Agencies welcomed better predictability for sponsor integrations. Competitors are expected to mirror similar controls for creator inventory.'
  },
  {
    title: 'Universal and Merlin-backed coalition pushes metadata standard for AI licensing',
    sourceName: 'Variety',
    sourceUrl: 'https://variety.com',
    url: 'https://variety.com/2026/music/news/universal-merlin-metadata-standard-ai-licensing-1235921111/',
    category: 'MUSIC_INDUSTRY',
    hoursAgo: 6.7,
    content:
      'A coalition including Universal and Merlin-backed members proposed a metadata standard intended to simplify AI music licensing workflows. The standard includes rights ownership, territorial constraints, and model-use declarations. Industry lawyers said consistent metadata is necessary for enforceable licensing at scale. Platform teams indicated that adoption could reduce disputes around derivative outputs. Negotiations continue with DSPs and rights agencies on implementation details.'
  },
  {
    title: 'Nvidia supplier guidance points to tighter Q2 chip packaging capacity',
    sourceName: 'CNBC',
    sourceUrl: 'https://www.cnbc.com',
    url: 'https://www.cnbc.com/2026/02/27/nvidia-supplier-guidance-chip-packaging-capacity.html',
    category: 'BUSINESS',
    hoursAgo: 7.4,
    content:
      'Supplier guidance tied to Nvidia ecosystem demand suggested tighter advanced chip packaging capacity heading into Q2. Contract manufacturers said lead times remain extended in several high-performance compute segments. Analysts noted the constraints may affect delivery cadence even as demand stays elevated. Capital expenditure plans appear to be accelerating among key suppliers. The broader semiconductor index moved higher after the update.'
  },
  {
    title: 'Podcast ad marketplace sees CPM rebound in finance and B2B segments',
    sourceName: 'Podnews',
    sourceUrl: 'https://podnews.net',
    url: 'https://podnews.net/update/podcast-ad-marketplace-cpm-rebound-finance-b2b',
    category: 'PODCAST_CREATOR',
    hoursAgo: 10.2,
    content:
      'Podcast advertising marketplaces reported a rebound in CPMs for finance and B2B segments in the first part of the quarter. Sellers attributed the shift to stronger pipeline visibility and better attribution tooling. Buyers said host-read formats continue to command premium pricing where audience trust is high. Inventory discipline in top shows helped stabilize rates. Independent networks are adjusting packaging to capture the higher-value demand.'
  },
  {
    title: 'Major banks pilot tokenized cash settlement for corporate treasury flows',
    sourceName: 'Reuters',
    sourceUrl: 'https://www.reuters.com',
    url: 'https://www.reuters.com/markets/major-banks-pilot-tokenized-cash-settlement-corporate-treasury-flows/',
    category: 'BUSINESS',
    hoursAgo: 11.8,
    content:
      'A group of major banks started a pilot that uses tokenized cash rails for specific corporate treasury settlement flows. The pilot is focused on shortening settlement windows and reducing reconciliation overhead. Treasury teams from multinational firms are participating in phased onboarding. Regulators are being briefed on controls and reporting procedures. If successful, the model could expand to high-frequency cross-border payments.'
  },
  {
    title: 'Streaming services negotiate short-form clip rights with top artist managers',
    sourceName: 'Billboard',
    sourceUrl: 'https://www.billboard.com',
    url: 'https://www.billboard.com/pro/streaming-services-short-form-clip-rights-artist-managers/',
    category: 'MUSIC_INDUSTRY',
    hoursAgo: 13.2,
    content:
      'Streaming services are in active negotiations over short-form clip rights with management teams representing top artists. The deals would define monetization, attribution, and remix permissions for clips distributed across social channels. Rights holders said current contracts were not designed for rapid short-form reuse. Platform policy leads want standardized terms before summer release cycles. The outcome may influence catalog promotion strategy and label spending.'
  }
];

export function buildSeedStories(now = new Date()): StoryRecord[] {
  return templates.map((template) => {
    const published = new Date(now.getTime() - template.hoursAgo * 60 * 60 * 1000);
    const summary = summarizeStory(template.title, template.content);
    const entities = extractEntities(`${template.title}. ${template.content}`);

    return {
      id: `seed_${crypto
        .createHash('sha1')
        .update(`${template.url}:${template.sourceName}`)
        .digest('hex')
        .slice(0, 14)}`,
      title: template.title,
      url: template.url,
      sourceName: template.sourceName,
      sourceUrl: template.sourceUrl,
      publishedAt: published.toISOString(),
      category: template.category,
      content: template.content,
      imageUrl:
        template.imageUrl ||
        `https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=80`,
      summary: summary.brief,
      whyMatters: summary.whyMatters,
      entities,
      rankScore: 0,
      verified: true,
      publishedTimestampKnown: true
    };
  });
}
