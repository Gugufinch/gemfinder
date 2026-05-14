import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGenerateContent = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: mockGenerateContent };
  },
}));

import { searchArtistsViaLLM } from '@/lib/gemfinder/hunter/llm-agent';

// Helper: build a Gemini response shape — `result.text` is the joined string.
function geminiResponse(text: string) {
  return { text };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  process.env.GEMINI_API_KEY = 'test-key';
});

describe('searchArtistsViaLLM', () => {
  it('parses a successful JSON response into MBArtist[] shape', async () => {
    mockGenerateContent.mockResolvedValue(
      geminiResponse(JSON.stringify({
        artists: [
          { name: 'Wednesday', genres: ['indie rock'], rationale: 'Pitchfork year-end pick' },
          { name: 'MJ Lenderman', genres: ['indie folk', 'country'] },
        ],
      }))
    );
    const result = await searchArtistsViaLLM({ genres: ['indie'], regions: ['US'], roleTarget: 'performer', targetCount: 25 });
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Wednesday');
    expect(result[0].id).toBe('');  // sentinel
    expect(result[0].tags).toEqual([{ name: 'indie rock', count: 1 }]);
    expect((result[0] as { _aiHint?: string })._aiHint).toBe('Pitchfork year-end pick');
  });

  it('returns empty array when Gemini throws', async () => {
    mockGenerateContent.mockRejectedValue(new Error('network'));
    const result = await searchArtistsViaLLM({ genres: ['indie'], regions: ['US'], roleTarget: 'performer', targetCount: 25 });
    expect(result).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith('[HUNTER_LLM] Gemini call failed:', expect.any(Error));
  });

  it('returns empty array when Gemini returns empty content', async () => {
    mockGenerateContent.mockResolvedValue(geminiResponse(''));
    const result = await searchArtistsViaLLM({ genres: ['indie'], regions: ['US'], roleTarget: 'performer', targetCount: 25 });
    expect(result).toEqual([]);
  });

  it('returns empty array when response contains no JSON object', async () => {
    mockGenerateContent.mockResolvedValue(geminiResponse('No JSON here, just prose.'));
    const result = await searchArtistsViaLLM({ genres: ['indie'], regions: ['US'], roleTarget: 'performer', targetCount: 25 });
    expect(result).toEqual([]);
  });

  it('extracts JSON when wrapped in markdown code fences', async () => {
    // Gemini sometimes wraps output in ```json ... ``` even when told not to.
    mockGenerateContent.mockResolvedValue(geminiResponse(
      'Here are the artists:\n```json\n' +
      JSON.stringify({ artists: [{ name: 'Bartees Strange', genres: ['indie rock'] }] }) +
      '\n```\nHope that helps!'
    ));
    const result = await searchArtistsViaLLM({ genres: ['indie'], regions: ['US'], roleTarget: 'performer', targetCount: 25 });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Bartees Strange');
  });

  it('extracts JSON when surrounded by commentary (no fences)', async () => {
    mockGenerateContent.mockResolvedValue(geminiResponse(
      'Based on my Google Search, I found these emerging artists. ' +
      JSON.stringify({ artists: [{ name: 'Indigo De Souza', genres: ['indie rock'] }] }) +
      ' Let me know if you need more.'
    ));
    const result = await searchArtistsViaLLM({ genres: ['indie'], regions: ['US'], roleTarget: 'performer', targetCount: 25 });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Indigo De Souza');
  });

  it('filters out entries without a name', async () => {
    mockGenerateContent.mockResolvedValue(geminiResponse(JSON.stringify({
      artists: [
        { name: 'Valid Artist' },
        { genres: ['no name field'] },
        { name: '' },
        { name: '   ' },
      ],
    })));
    const result = await searchArtistsViaLLM({ genres: ['indie'], regions: ['US'], roleTarget: 'performer', targetCount: 25 });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Valid Artist');
  });

  it('includes criteria details in the prompt sent to Gemini', async () => {
    mockGenerateContent.mockResolvedValue(geminiResponse(JSON.stringify({ artists: [] })));
    await searchArtistsViaLLM({
      genres: ['indie pop', 'folk'],
      regions: ['US', 'CA'],
      roleTarget: 'performer',
      targetCount: 25,
      sizeBracket: { min: 5000, max: 50000 },
      recency: { sinceYear: 2022 },
    });
    // Gemini API takes contents: [{role, parts: [{text}]}]
    const sentContents = mockGenerateContent.mock.calls[0][0].contents;
    const userText = sentContents[0].parts[0].text;
    expect(userText).toContain('indie pop, folk');
    expect(userText).toContain('US, CA');
    expect(userText).toMatch(/5,?000/);
    expect(userText).toMatch(/50,?000/);
    expect(userText).toContain('2022');
  });

  it('enables Google Search grounding in the config', async () => {
    mockGenerateContent.mockResolvedValue(geminiResponse(JSON.stringify({ artists: [] })));
    await searchArtistsViaLLM({ genres: ['indie'], regions: ['US'], roleTarget: 'performer', targetCount: 25 });
    const config = mockGenerateContent.mock.calls[0][0].config;
    expect(config.tools).toEqual([{ googleSearch: {} }]);
  });

  it('throws a helpful error when GEMINI_API_KEY is unset', async () => {
    // Reset module state by directly clearing the env var (the client is a
    // module-level singleton, so we re-import the module fresh).
    delete process.env.GEMINI_API_KEY;
    vi.resetModules();
    const { searchArtistsViaLLM: fresh } = await import('@/lib/gemfinder/hunter/llm-agent');
    const result = await fresh({ genres: ['indie'], regions: ['US'], roleTarget: 'performer', targetCount: 25 });
    expect(result).toEqual([]);
    // The warn includes the original Error which contains the helpful message
    expect(console.warn).toHaveBeenCalledWith('[HUNTER_LLM] Gemini call failed:', expect.objectContaining({ message: expect.stringContaining('GEMINI_API_KEY') }));
  });

  it('throws helpful error when key is still placeholder', async () => {
    process.env.GEMINI_API_KEY = 'PLACEHOLDER_API_KEY';
    vi.resetModules();
    const { searchArtistsViaLLM: fresh } = await import('@/lib/gemfinder/hunter/llm-agent');
    const result = await fresh({ genres: ['indie'], regions: ['US'], roleTarget: 'performer', targetCount: 25 });
    expect(result).toEqual([]);
  });
});
