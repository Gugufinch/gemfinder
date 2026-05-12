import { describe, it, expect } from 'vitest';
import { candidateCreateSchema, rejectSchema, approveSchema, candidateEditSchema } from './validation';

describe('candidateCreateSchema', () => {
  it('requires displayName', () => {
    const result = candidateCreateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts minimal payload (name only)', () => {
    const result = candidateCreateSchema.safeParse({ displayName: 'Test Artist' });
    expect(result.success).toBe(true);
  });

  it('validates URL formats for spotifyUrl', () => {
    const bad = candidateCreateSchema.safeParse({ displayName: 'X', spotifyUrl: 'not a url' });
    expect(bad.success).toBe(false);
  });

  it('strips empty optional fields', () => {
    const result = candidateCreateSchema.safeParse({
      displayName: 'Test',
      instagramHandle: '',
      tiktokHandle: '',
    });
    expect(result.success).toBe(true);
  });

  it('rejects extra fields not in schema', () => {
    const result = candidateCreateSchema.safeParse({
      displayName: 'Test',
      unknownField: 'foo',
    });
    expect(result.success).toBe(false);
  });
});

describe('rejectSchema', () => {
  it('requires reasonCode', () => {
    expect(rejectSchema.safeParse({}).success).toBe(false);
  });

  it('accepts valid reason codes', () => {
    expect(rejectSchema.safeParse({ reasonCode: 'wrong_genre' }).success).toBe(true);
    expect(rejectSchema.safeParse({ reasonCode: 'duplicate' }).success).toBe(true);
  });

  it('rejects invalid reason code', () => {
    expect(rejectSchema.safeParse({ reasonCode: 'fake_reason' }).success).toBe(false);
  });

  it('requires reasonNote when reasonCode is "other"', () => {
    expect(rejectSchema.safeParse({ reasonCode: 'other' }).success).toBe(false);
    expect(rejectSchema.safeParse({ reasonCode: 'other', reasonNote: 'because' }).success).toBe(true);
  });
});

describe('approveSchema', () => {
  it('requires projectId', () => {
    expect(approveSchema.safeParse({}).success).toBe(false);
  });

  it('accepts valid projectId', () => {
    expect(approveSchema.safeParse({ projectId: 'proj_123' }).success).toBe(true);
  });

  it('accepts optional note', () => {
    expect(approveSchema.safeParse({ projectId: 'p', note: 'great find' }).success).toBe(true);
  });
});

describe('candidateEditSchema', () => {
  it('rejects empty patch', () => {
    expect(candidateEditSchema.safeParse({}).success).toBe(false);
  });

  it('accepts single-field patch', () => {
    expect(candidateEditSchema.safeParse({ primaryGenre: 'indie pop' }).success).toBe(true);
  });
});
