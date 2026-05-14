import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
vi.mock('openai', () => ({
  default: class { chat = { completions: { create: mockCreate } } },
}));

import { searchArtistsViaLLM } from '@/lib/gemfinder/hunter/llm-agent';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  process.env.OPENAI_API_KEY = 'test-key';
});

describe('searchArtistsViaLLM', () => {
  it('parses a successful JSON response into MBArtist[] shape', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ artists: [
        { name: 'Wednesday', genres: ['indie rock'] },
        { name: 'MJ Lenderman', genres: ['indie folk', 'country'] },
      ]})}}],
    });
    const result = await searchArtistsViaLLM({ genres: ['indie'], regions: ['US'], roleTarget: 'performer', targetCount: 25 });
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Wednesday');
    expect(result[0].id).toBe('');  // sentinel
    expect(result[0].tags).toEqual([{ name: 'indie rock', count: 1 }]);
  });

  it('returns empty array when OpenAI throws', async () => {
    mockCreate.mockRejectedValue(new Error('network'));
    const result = await searchArtistsViaLLM({ genres: ['indie'], regions: ['US'], roleTarget: 'performer', targetCount: 25 });
    expect(result).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith('[HUNTER_LLM] OpenAI call failed:', expect.any(Error));
  });

  it('returns empty array when OpenAI returns empty content', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: null } }] });
    const result = await searchArtistsViaLLM({ genres: ['indie'], regions: ['US'], roleTarget: 'performer', targetCount: 25 });
    expect(result).toEqual([]);
  });

  it('returns empty array when JSON is malformed', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: 'not json' } }] });
    const result = await searchArtistsViaLLM({ genres: ['indie'], regions: ['US'], roleTarget: 'performer', targetCount: 25 });
    expect(result).toEqual([]);
  });

  it('filters out entries without a name', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ artists: [
        { name: 'Valid Artist' },
        { genres: ['no name field'] },
        { name: '' },
        { name: '   ' },
      ]})}}],
    });
    const result = await searchArtistsViaLLM({ genres: ['indie'], regions: ['US'], roleTarget: 'performer', targetCount: 25 });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Valid Artist');
  });

  it('includes criteria details in the prompt sent to OpenAI', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ artists: [] }) } }] });
    await searchArtistsViaLLM({
      genres: ['indie pop', 'folk'],
      regions: ['US', 'CA'],
      roleTarget: 'performer',
      targetCount: 25,
      sizeBracket: { min: 5000, max: 50000 },
      recency: { sinceYear: 2022 },
    });
    const userMessage = mockCreate.mock.calls[0][0].messages[1].content;
    expect(userMessage).toContain('indie pop, folk');
    expect(userMessage).toContain('US, CA');
    expect(userMessage).toContain('5000');
    expect(userMessage).toContain('50000');
    expect(userMessage).toContain('2022');
  });
});
