import type { ScoutRejection, ScoutRejectionReason } from '@/lib/gemfinder/types';
import { randomUUID } from 'node:crypto';
import { buildCandidate } from './candidates';

export function buildRejection(overrides: Partial<ScoutRejection> = {}): ScoutRejection {
  const candidate = buildCandidate();
  return {
    id: randomUUID(),
    workspaceId: candidate.workspaceId,
    displayName: candidate.displayName,
    canonicalName: candidate.canonicalName,
    spotifyUrl: candidate.spotifyUrl,
    spotifyArtistId: candidate.spotifyArtistId,
    instagramHandle: candidate.instagramHandle,
    tiktokHandle: candidate.tiktokHandle,
    youtubeHandle: candidate.youtubeHandle,
    soundcloudHandle: candidate.soundcloudHandle,
    musicbrainzId: candidate.musicbrainzId,
    bandcampUrl: candidate.bandcampUrl,
    primaryEmail: candidate.primaryEmail,
    candidateSnapshot: candidate as unknown as Record<string, unknown>,
    reasonCode: 'already_signed' as ScoutRejectionReason,
    rejectedBy: 'editor@test.local',
    rejectedAt: new Date().toISOString(),
    ...overrides,
  };
}
