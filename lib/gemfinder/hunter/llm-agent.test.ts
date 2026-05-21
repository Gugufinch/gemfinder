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

  it('throws when all Gemini retries fail (infrastructure error)', async () => {
    // 'network' triggers the retry path; all retries fail; final error surfaces.
    mockGenerateContent.mockRejectedValue(new Error('network'));
    await expect(searchArtistsViaLLM({ genres: ['indie'], regions: ['US'], roleTarget: 'performer', targetCount: 25 }))
      .rejects.toThrow(/All Gemini models overloaded or unavailable/);
  });

  it('retries on 503 UNAVAILABLE and succeeds on second attempt', async () => {
    // Real-world failure mode: Gemini returns 503 when its capacity spikes.
    // First call fails with 503, second call succeeds.
    mockGenerateContent
      .mockRejectedValueOnce(new Error('{"error":{"code":503,"message":"high demand","status":"UNAVAILABLE"}}'))
      .mockResolvedValueOnce(geminiResponse(JSON.stringify({ artists: [{ name: 'Wednesday', genres: ['indie rock'] }] })));
    const result = await searchArtistsViaLLM({ genres: ['indie'], regions: ['US'], roleTarget: 'performer', targetCount: 25 });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Wednesday');
  });

  it('falls back to a different model when the primary model exhausts retries', async () => {
    // 3 retries on gemini-2.5-flash-lite all fail with 503 → fall back to
    // gemini-2.5-flash which succeeds on first attempt.
    mockGenerateContent
      .mockRejectedValueOnce(new Error('503 UNAVAILABLE'))
      .mockRejectedValueOnce(new Error('503 UNAVAILABLE'))
      .mockRejectedValueOnce(new Error('503 UNAVAILABLE'))
      .mockResolvedValueOnce(geminiResponse(JSON.stringify({ artists: [{ name: 'DIIV', genres: ['shoegaze'] }] })));
    const result = await searchArtistsViaLLM({ genres: ['indie'], regions: ['US'], roleTarget: 'performer', targetCount: 25 });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('DIIV');
    // The 4th call (first call on the fallback model) was the one that succeeded.
    expect(mockGenerateContent).toHaveBeenCalledTimes(4);
    // Confirm the fallback model was called.
    const fourthCall = mockGenerateContent.mock.calls[3][0];
    expect(fourthCall.model).toBe('gemini-2.5-flash');
  });

  it('throws a clearer message on invalid API key', async () => {
    mockGenerateContent.mockRejectedValue(new Error('API key not valid. Please pass a valid API key.'));
    await expect(searchArtistsViaLLM({ genres: ['indie'], regions: ['US'], roleTarget: 'performer', targetCount: 25 }))
      .rejects.toThrow(/GEMINI_API_KEY is invalid/);
  });

  it('throws a clearer message on quota exceeded', async () => {
    mockGenerateContent.mockRejectedValue(new Error('RESOURCE_EXHAUSTED: quota exceeded'));
    await expect(searchArtistsViaLLM({ genres: ['indie'], regions: ['US'], roleTarget: 'performer', targetCount: 25 }))
      .rejects.toThrow(/quota exceeded/);
  });

  it('throws when Gemini returns empty content', async () => {
    mockGenerateContent.mockResolvedValue(geminiResponse(''));
    await expect(searchArtistsViaLLM({ genres: ['indie'], regions: ['US'], roleTarget: 'performer', targetCount: 25 }))
      .rejects.toThrow(/empty response/);
  });

  it('throws when response contains no JSON object', async () => {
    mockGenerateContent.mockResolvedValue(geminiResponse('No JSON here, just prose.'));
    await expect(searchArtistsViaLLM({ genres: ['indie'], regions: ['US'], roleTarget: 'performer', targetCount: 25 }))
      .rejects.toThrow(/could not extract JSON/);
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

  it('recovers complete artists when JSON has a mid-stream syntax error (unescaped quote in rationale)', async () => {
    // Real-world failure mode: Gemini grounded responses include long rationales
    // and sometimes emit unescaped quotes mid-string. The full JSON.parse fails
    // but the artists BEFORE the broken position are recoverable.
    const brokenJson = '{"artists":[' +
      '{"name":"Mannequin Pussy","genres":["punk"],"rationale":"FADER pick 2024"},' +
      '{"name":"DIIV","genres":["shoegaze"],"rationale":"Stereogum review of "Frog In Boiling Water" album"},' +  // unescaped quotes around the album title
      '{"name":"Chat Pile","genres":["noise rock"],"rationale":"Best of 2024"}' +
      ']}';
    mockGenerateContent.mockResolvedValue(geminiResponse(brokenJson));
    const result = await searchArtistsViaLLM({ genres: ['indie'], regions: ['US'], roleTarget: 'performer', targetCount: 25 });
    // First artist is fully formed before the broken one — should be recovered.
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].name).toBe('Mannequin Pussy');
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('recovered'));
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

  it('includes excludeNames in the prompt so Gemini avoids re-suggestions', async () => {
    mockGenerateContent.mockResolvedValue(geminiResponse(JSON.stringify({ artists: [] })));
    await searchArtistsViaLLM(
      { genres: ['indie'], regions: ['US'], roleTarget: 'performer', targetCount: 25 },
      { excludeNames: ['wednesday', 'mj lenderman', 'big freedia'] },
    );
    const userText = mockGenerateContent.mock.calls[0][0].contents[0].parts[0].text;
    expect(userText).toContain('ALREADY IN OUR SYSTEM');
    expect(userText).toContain('wednesday');
    expect(userText).toContain('mj lenderman');
    expect(userText).toContain('big freedia');
    expect(userText).toContain('DO NOT SUGGEST');
  });

  it('omits the exclude block when excludeNames is empty', async () => {
    mockGenerateContent.mockResolvedValue(geminiResponse(JSON.stringify({ artists: [] })));
    await searchArtistsViaLLM({ genres: ['indie'], regions: ['US'], roleTarget: 'performer', targetCount: 25 });
    const userText = mockGenerateContent.mock.calls[0][0].contents[0].parts[0].text;
    expect(userText).not.toContain('ALREADY IN OUR SYSTEM');
  });

  it('caps excludeNames at 200 to keep the prompt bounded', async () => {
    const bigList = Array.from({ length: 500 }, (_, i) => `artist${i}`);
    mockGenerateContent.mockResolvedValue(geminiResponse(JSON.stringify({ artists: [] })));
    await searchArtistsViaLLM(
      { genres: ['indie'], regions: ['US'], roleTarget: 'performer', targetCount: 25 },
      { excludeNames: bigList },
    );
    const userText = mockGenerateContent.mock.calls[0][0].contents[0].parts[0].text;
    // first 200 must be present; later names should NOT appear in the list
    expect(userText).toContain('artist0');
    expect(userText).toContain('artist199');
    expect(userText).not.toContain('artist200');
    expect(userText).toContain('first 200 listed');
  });

  it('enables Google Search grounding in the config', async () => {
    mockGenerateContent.mockResolvedValue(geminiResponse(JSON.stringify({ artists: [] })));
    await searchArtistsViaLLM({ genres: ['indie'], regions: ['US'], roleTarget: 'performer', targetCount: 25 });
    const config = mockGenerateContent.mock.calls[0][0].config;
    expect(config.tools).toEqual([{ googleSearch: {} }]);
  });

  it('throws a helpful error when GEMINI_API_KEY is unset', async () => {
    delete process.env.GEMINI_API_KEY;
    vi.resetModules();
    const { searchArtistsViaLLM: fresh } = await import('@/lib/gemfinder/hunter/llm-agent');
    await expect(fresh({ genres: ['indie'], regions: ['US'], roleTarget: 'performer', targetCount: 25 }))
      .rejects.toThrow(/GEMINI_API_KEY/);
  });

  it('throws helpful error when key is still placeholder', async () => {
    process.env.GEMINI_API_KEY = 'PLACEHOLDER_API_KEY';
    vi.resetModules();
    const { searchArtistsViaLLM: fresh } = await import('@/lib/gemfinder/hunter/llm-agent');
    await expect(fresh({ genres: ['indie'], regions: ['US'], roleTarget: 'performer', targetCount: 25 }))
      .rejects.toThrow(/GEMINI_API_KEY/);
  });
});
