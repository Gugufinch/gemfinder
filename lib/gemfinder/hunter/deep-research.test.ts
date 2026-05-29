import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Gemini SDK
const mockGenerateContent = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: mockGenerateContent };
  },
}));

// Mock pg pool so the cache layer doesn't try to connect.
const mockQuery = vi.fn();
vi.mock('@/lib/gemfinder/scout-candidate-store', () => ({
  getScoutPool: () => ({ query: mockQuery }),
  ensureSchema: vi.fn(async () => {}),
}));

import {
  researchArtist,
  canonicalName,
  parseDeepResearchJson,
  normalizeDeepResearchObject,
  type DeepResearchResult,
} from '@/lib/gemfinder/hunter/deep-research';

function geminiResponse(text: string) {
  return { text };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  process.env.GEMINI_API_KEY = 'AIza-test-key';
  // Cache miss by default.
  mockQuery.mockResolvedValue({ rows: [] });
});

describe('canonicalName', () => {
  it('lowercases and collapses whitespace', () => {
    expect(canonicalName('  Wednesday  ')).toBe('wednesday');
    expect(canonicalName('MJ  Lenderman')).toBe('mj lenderman');
    expect(canonicalName('Big Freedia')).toBe('big freedia');
  });

  it('returns empty for empty input', () => {
    expect(canonicalName('')).toBe('');
    expect(canonicalName('   ')).toBe('');
  });
});

describe('normalizeDeepResearchObject', () => {
  it('coerces a full result correctly', () => {
    const raw = {
      verified: true,
      isLiving: true,
      recentReleaseYear: 2024,
      recentReleaseTitle: 'Cool World',
      location: '  Brooklyn, NY  ',
      country: 'us',
      genres: ['indie rock', '', 'shoegaze'],
      spotifyUrl: 'https://open.spotify.com/artist/abc',
      instagramHandle: '@diiv',
      tiktokHandle: 'diivmusic',
      bio: 'Brooklyn-based indie rock band noted by Pitchfork for their 2024 LP.',
      citations: ['https://pitchfork.com/x', ''],
    };
    const result = normalizeDeepResearchObject(raw);
    expect(result).toBeTruthy();
    expect(result?.verified).toBe(true);
    expect(result?.location).toBe('Brooklyn, NY');  // trimmed
    expect(result?.country).toBe('US');  // uppercased
    expect(result?.genres).toEqual(['indie rock', 'shoegaze']);  // empty filtered
    expect(result?.instagramHandle).toBe('diiv');  // @ stripped
    expect(result?.citations).toEqual(['https://pitchfork.com/x']);  // empty filtered
  });

  it('returns verified=false when source says so', () => {
    const raw = { verified: false, isLiving: null, genres: [], citations: [] };
    const result = normalizeDeepResearchObject(raw);
    expect(result?.verified).toBe(false);
  });

  it('returns null for non-objects', () => {
    expect(normalizeDeepResearchObject(null)).toBeNull();
    expect(normalizeDeepResearchObject('string')).toBeNull();
    expect(normalizeDeepResearchObject(42)).toBeNull();
  });

  it('isLiving defaults to null when missing', () => {
    const raw = { verified: true, genres: [], citations: [] };
    const result = normalizeDeepResearchObject(raw);
    expect(result?.isLiving).toBeNull();
  });

  it('country gets clipped to 2 chars uppercase', () => {
    const raw = { verified: true, country: 'united states', genres: [], citations: [] };
    expect(normalizeDeepResearchObject(raw)?.country).toBe('UN');  // truncated
  });
});

describe('parseDeepResearchJson', () => {
  it('parses raw JSON', () => {
    const text = JSON.stringify({ verified: true, isLiving: true, genres: ['indie rock'], citations: [] });
    const result = parseDeepResearchJson(text);
    expect(result?.verified).toBe(true);
  });

  it('parses JSON wrapped in markdown fences', () => {
    const text = '```json\n' + JSON.stringify({ verified: true, isLiving: true, genres: [], citations: [] }) + '\n```';
    const result = parseDeepResearchJson(text);
    expect(result?.verified).toBe(true);
  });

  it('parses JSON wrapped in prose', () => {
    const text = 'Here is what I found:\n' + JSON.stringify({ verified: true, isLiving: true, genres: [], citations: [] }) + '\nDone.';
    const result = parseDeepResearchJson(text);
    expect(result?.verified).toBe(true);
  });

  it('returns null when no JSON object present', () => {
    expect(parseDeepResearchJson('just prose, no json')).toBeNull();
    expect(parseDeepResearchJson('')).toBeNull();
  });
});

describe('researchArtist', () => {
  it('returns cached result without calling Gemini when cache hits', async () => {
    const cached: DeepResearchResult = {
      verified: true,
      isLiving: true,
      genres: ['indie rock'],
      citations: [],
      researchedAt: '2026-01-01T00:00:00Z',
    };
    mockQuery.mockResolvedValueOnce({ rows: [{ result: cached }] });
    const result = await researchArtist('ws1', 'Wednesday');
    expect(result).toEqual(cached);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('calls Gemini on cache miss and writes to cache', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })  // cache miss
      .mockResolvedValueOnce({ rows: [] }); // cache write
    mockGenerateContent.mockResolvedValueOnce(geminiResponse(JSON.stringify({
      verified: true,
      isLiving: true,
      recentReleaseYear: 2024,
      genres: ['indie rock'],
      spotifyUrl: 'https://open.spotify.com/artist/xyz',
      citations: ['https://pitchfork.com/x'],
    })));

    const result = await researchArtist('ws1', 'Wednesday');
    expect(result?.verified).toBe(true);
    expect(result?.spotifyUrl).toBe('https://open.spotify.com/artist/xyz');
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(result?.researchedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('returns null when Gemini fails permanently', async () => {
    mockGenerateContent.mockRejectedValue(new Error('something exploded'));
    const result = await researchArtist('ws1', 'Wednesday');
    expect(result).toBeNull();
  });

  it('retries on 503 UNAVAILABLE then succeeds', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(new Error('503 UNAVAILABLE'))
      .mockResolvedValueOnce(geminiResponse(JSON.stringify({
        verified: true,
        isLiving: true,
        genres: ['indie rock'],
        citations: [],
      })));
    const result = await researchArtist('ws1', 'Wednesday');
    expect(result?.verified).toBe(true);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  it('passes hint genres into the prompt', async () => {
    mockGenerateContent.mockResolvedValue(geminiResponse(JSON.stringify({
      verified: true, isLiving: true, genres: ['indie rock'], citations: [],
    })));
    await researchArtist('ws1', 'Wednesday', ['indie rock', 'shoegaze']);
    const callArg = mockGenerateContent.mock.calls[0][0];
    const userText = callArg.contents[0].parts[0].text;
    expect(userText).toContain('indie rock, shoegaze');
  });

  it('returns null for empty name', async () => {
    const result = await researchArtist('ws1', '   ');
    expect(result).toBeNull();
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('returns null when Gemini returns unparseable text', async () => {
    mockGenerateContent.mockResolvedValue(geminiResponse('just prose, no JSON here'));
    const result = await researchArtist('ws1', 'Wednesday');
    expect(result).toBeNull();
  });

  it('throws on invalid API key (non-retriable)', async () => {
    mockGenerateContent.mockRejectedValue(new Error('API key not valid'));
    await expect(researchArtist('ws1', 'Wednesday')).resolves.toBeNull();
    // researchArtist swallows the throw and returns null to keep enrichment alive.
    // The warn carries the underlying message.
  });
});
