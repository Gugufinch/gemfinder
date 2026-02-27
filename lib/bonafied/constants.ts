import { BonafiedCategory, Channel, FeedConfig } from '@/lib/bonafied/types';

export const DEFAULT_TIMEZONE = 'America/Chicago';
export const SAME_DAY_HOURS = 24;

export const CHANNEL_ORDER: Channel[] = [
  'TODAY',
  'BUSINESS',
  'TECHNOLOGY',
  'MUSIC_INDUSTRY',
  'PODCAST_CREATOR'
];

export const CHANNEL_LABELS: Record<Channel, string> = {
  TODAY: 'Today',
  BUSINESS: 'Business',
  TECHNOLOGY: 'Technology',
  MUSIC_INDUSTRY: 'Music',
  PODCAST_CREATOR: 'Podcasts'
};

export const CATEGORY_ROW_LABELS: Record<BonafiedCategory, string> = {
  BUSINESS: 'Business Stories',
  TECHNOLOGY: 'Technology Stories',
  MUSIC_INDUSTRY: 'Music Industry Stories',
  PODCAST_CREATOR: 'Podcast & Creator Stories'
};

export const DEFAULT_SOURCE_CREDIBILITY: Record<string, number> = {
  Reuters: 0.95,
  Bloomberg: 0.94,
  'Wall Street Journal': 0.92,
  WSJ: 0.92,
  'AP News': 0.92,
  'Associated Press': 0.92,
  AP: 0.92,
  BBC: 0.86,
  'BBC News': 0.86,
  'New York Times': 0.84,
  'The New York Times': 0.84,
  NYTimes: 0.84,
  Politico: 0.82,
  'The Hill': 0.76,
  CNBC: 0.88,
  'Financial Times': 0.93,
  'TechCrunch': 0.8,
  'The Verge': 0.77,
  'Ars Technica': 0.8,
  WIRED: 0.79,
  Billboard: 0.82,
  Variety: 0.79,
  NME: 0.74,
  'Podnews': 0.74,
  'The Information': 0.89,
  'Engadget': 0.72,
  'The Guardian': 0.78,
  NPR: 0.83,
  Tubefilter: 0.72,
  Digiday: 0.75,
  Spotify: 0.9,
  'Social Media Today': 0.69,
  'Podcast Business Journal': 0.7
};

export const DEFAULT_FEEDS: FeedConfig[] = [
  {
    id: 'feed_reuters_business',
    name: 'Reuters Business',
    url: 'https://feeds.reuters.com/reuters/businessNews',
    category: 'BUSINESS',
    credibilityScore: 0.95,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'feed_cnbc_tech',
    name: 'CNBC Technology',
    url: 'https://www.cnbc.com/id/19854910/device/rss/rss.html',
    category: 'TECHNOLOGY',
    credibilityScore: 0.88,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'feed_billboard',
    name: 'Billboard',
    url: 'https://www.billboard.com/feed/',
    category: 'MUSIC_INDUSTRY',
    credibilityScore: 0.82,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'feed_reuters_technology',
    name: 'Reuters Technology',
    url: 'https://feeds.reuters.com/reuters/technologyNews',
    category: 'TECHNOLOGY',
    credibilityScore: 0.95,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'feed_ft_companies',
    name: 'Financial Times Companies',
    url: 'https://www.ft.com/companies?format=rss',
    category: 'BUSINESS',
    credibilityScore: 0.93,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'feed_theverge_tech',
    name: 'The Verge',
    url: 'https://www.theverge.com/rss/index.xml',
    category: 'TECHNOLOGY',
    credibilityScore: 0.77,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'feed_techcrunch',
    name: 'TechCrunch',
    url: 'https://techcrunch.com/feed/',
    category: 'TECHNOLOGY',
    credibilityScore: 0.8,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'feed_engadget',
    name: 'Engadget',
    url: 'https://www.engadget.com/rss.xml',
    category: 'TECHNOLOGY',
    credibilityScore: 0.72,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'feed_variety_music',
    name: 'Variety Music',
    url: 'https://variety.com/v/music/feed/',
    category: 'MUSIC_INDUSTRY',
    credibilityScore: 0.79,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'feed_rollingstone_music',
    name: 'Rolling Stone Music',
    url: 'https://www.rollingstone.com/music/music-news/feed/',
    category: 'MUSIC_INDUSTRY',
    credibilityScore: 0.76,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'feed_musicbusinessworldwide',
    name: 'Music Business Worldwide',
    url: 'https://www.musicbusinessworldwide.com/feed/',
    category: 'MUSIC_INDUSTRY',
    credibilityScore: 0.74,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'feed_theinformation',
    name: 'The Information',
    url: 'https://www.theinformation.com/feed',
    category: 'TECHNOLOGY',
    credibilityScore: 0.89,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'feed_creator_economy_nyt',
    name: 'NYT Business',
    url: 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml',
    category: 'BUSINESS',
    credibilityScore: 0.84,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'feed_guardian_business',
    name: 'The Guardian Business',
    url: 'https://www.theguardian.com/uk/business/rss',
    category: 'BUSINESS',
    credibilityScore: 0.78,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'feed_npr_business',
    name: 'NPR Business',
    url: 'https://feeds.npr.org/1006/rss.xml',
    category: 'BUSINESS',
    credibilityScore: 0.83,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'feed_guardian_technology',
    name: 'The Guardian Technology',
    url: 'https://www.theguardian.com/uk/technology/rss',
    category: 'TECHNOLOGY',
    credibilityScore: 0.78,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'feed_guardian_music',
    name: 'The Guardian Music',
    url: 'https://www.theguardian.com/music/rss',
    category: 'MUSIC_INDUSTRY',
    credibilityScore: 0.78,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'feed_nme_music',
    name: 'NME Music',
    url: 'https://www.nme.com/news/music/feed',
    category: 'MUSIC_INDUSTRY',
    credibilityScore: 0.74,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'feed_podnews',
    name: 'Podnews',
    url: 'https://podnews.net/rss',
    category: 'PODCAST_CREATOR',
    credibilityScore: 0.74,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'feed_tubefilter',
    name: 'Tubefilter',
    url: 'https://www.tubefilter.com/feed/',
    category: 'PODCAST_CREATOR',
    credibilityScore: 0.72,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'feed_digiday_creator',
    name: 'Digiday Creator Economy',
    url: 'https://digiday.com/category/creator-economy/feed/',
    category: 'PODCAST_CREATOR',
    credibilityScore: 0.75,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'feed_spotify_newsroom_podcasts',
    name: 'Spotify Newsroom',
    url: 'https://newsroom.spotify.com/category/podcasts/feed/',
    category: 'PODCAST_CREATOR',
    credibilityScore: 0.9,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'feed_bbc_business',
    name: 'BBC Business',
    url: 'http://feeds.bbci.co.uk/news/business/rss.xml',
    category: 'BUSINESS',
    credibilityScore: 0.86,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'feed_bbc_technology',
    name: 'BBC Technology',
    url: 'http://feeds.bbci.co.uk/news/technology/rss.xml',
    category: 'TECHNOLOGY',
    credibilityScore: 0.86,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'feed_bbc_politics',
    name: 'BBC Politics',
    url: 'http://feeds.bbci.co.uk/news/politics/rss.xml',
    category: 'BUSINESS',
    credibilityScore: 0.86,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'feed_reuters_world',
    name: 'Reuters World',
    url: 'https://feeds.reuters.com/Reuters/worldNews',
    category: 'BUSINESS',
    credibilityScore: 0.95,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'feed_guardian_world',
    name: 'The Guardian World',
    url: 'https://www.theguardian.com/world/rss',
    category: 'BUSINESS',
    credibilityScore: 0.78,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'feed_ap_topnews',
    name: 'AP News',
    url: 'https://feeds.apnews.com/rss/apf-topnews',
    category: 'BUSINESS',
    credibilityScore: 0.92,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'feed_politico',
    name: 'Politico',
    url: 'https://www.politico.com/rss/politicopicks.xml',
    category: 'BUSINESS',
    credibilityScore: 0.82,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'feed_thehill',
    name: 'The Hill',
    url: 'https://thehill.com/feed/',
    category: 'BUSINESS',
    credibilityScore: 0.72,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'feed_cnbc_politics',
    name: 'CNBC Politics',
    url: 'https://www.cnbc.com/id/10000113/device/rss/rss.html',
    category: 'BUSINESS',
    credibilityScore: 0.88,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

export const CATEGORY_KEYWORDS: Record<BonafiedCategory, string[]> = {
  BUSINESS: [
    'market',
    'earnings',
    'acquisition',
    'ipo',
    'funding',
    'revenue',
    'profit',
    'federal reserve',
    'economy',
    'policy',
    'regulation',
    'government',
    'congress',
    'senate',
    'white house',
    'election',
    'tariff',
    'antitrust',
    'treasury',
    'geopolitics'
  ],
  TECHNOLOGY: [
    'ai',
    'software',
    'chip',
    'cloud',
    'startup',
    'apple',
    'google',
    'openai',
    'microsoft'
  ],
  MUSIC_INDUSTRY: [
    'album',
    'label',
    'tour',
    'spotify',
    'grammy',
    'live nation',
    'warner music',
    'sony music',
    'chart',
    'royalty',
    'recording academy',
    'music publishing',
    'music rights'
  ],
  PODCAST_CREATOR: [
    'podcast',
    'creator',
    'youtube',
    'substack',
    'patreon',
    'ad reads',
    'audience'
  ]
};
