import { z } from 'zod';

const optionalString = z.string().trim().min(1).optional().or(z.literal('').transform(() => undefined));
const optionalUrl = z.string().url().optional().or(z.literal('').transform(() => undefined));
const optionalNumber = z.number().int().nonnegative().optional();

export const candidateCreateSchema = z
  .object({
    displayName: z.string().min(1, 'displayName is required').max(200),
    aliases: z.array(z.string()).optional().default([]),

    spotifyUrl: optionalUrl,
    spotifyArtistId: optionalString,
    instagramHandle: optionalString,
    tiktokHandle: optionalString,
    youtubeHandle: optionalString,
    youtubeUrl: optionalUrl,
    soundcloudHandle: optionalString,
    soundcloudUrl: optionalUrl,
    musicbrainzId: optionalString,
    bandcampUrl: optionalUrl,
    extraLinks: z.array(z.object({
      label: z.string().min(1).max(60),
      url: z.string().url(),
      followers: optionalNumber,
    })).optional().default([]),

    primaryEmail: z.string().email().optional().or(z.literal('').transform(() => undefined)),
    contactName: optionalString,
    contactEmail: z.string().email().optional().or(z.literal('').transform(() => undefined)),
    contactType: z.enum(['direct', 'manager', 'agency', 'booking']).optional(),

    primaryGenre: optionalString,
    genres: z.array(z.string()).optional().default([]),
    locations: z.array(z.string()).optional().default([]),
    instagramFollowers: optionalNumber,
    tiktokFollowers: optionalNumber,
    spotifyMonthlyListeners: optionalNumber,
    youtubeSubscribers: optionalNumber,
    soundcloudFollowers: optionalNumber,
    hitTracks: z.array(z.string()).optional().default([]),
    curatorPageUrl: optionalUrl,
    artistRole: z.enum(['performer', 'curator', 'both']).optional(),
    aiSummary: optionalString,
    living: z.boolean().optional(),

    source: z.string().default('manual'),
    sourceUrl: optionalUrl,
    sourceExternalId: optionalString,
  })
  .strict();

export type CandidateCreateInput = z.infer<typeof candidateCreateSchema>;

// Use z.custom to check raw input BEFORE defaults are applied by .partial(),
// since fields with .default([]) would otherwise populate the parsed output
// and make an empty {} appear non-empty after parsing.
export const candidateEditSchema = z
  .custom<Record<string, unknown>>(
    (raw) =>
      typeof raw === 'object' &&
      raw !== null &&
      !Array.isArray(raw) &&
      Object.keys(raw).length > 0,
    { message: 'Edit payload must contain at least one field' },
  )
  .pipe(candidateCreateSchema.partial());

export type CandidateEditInput = z.infer<typeof candidateEditSchema>;

export const REJECT_REASONS = [
  'already_signed',
  'wrong_genre',
  'no_contact',
  'too_big',
  'too_small',
  'not_viable',
  'dead',
  'duplicate',
  'other',
] as const;

export const rejectSchema = z
  .object({
    reasonCode: z.enum(REJECT_REASONS),
    reasonNote: z.string().max(2000).optional(),
  })
  .refine((obj) => obj.reasonCode !== 'other' || (obj.reasonNote && obj.reasonNote.trim().length > 0), {
    message: 'reasonNote is required when reasonCode is "other"',
    path: ['reasonNote'],
  });

export type RejectInput = z.infer<typeof rejectSchema>;

export const approveSchema = z.object({
  projectId: z.string().min(1, 'projectId is required'),
  note: z.string().max(2000).optional(),
});

export type ApproveInput = z.infer<typeof approveSchema>;
