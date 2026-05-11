import type { ScoutCandidate } from '@/lib/gemfinder/types';
import { randomUUID } from 'node:crypto';

let counter = 0;

export function buildCandidate(overrides: Partial<ScoutCandidate> = {}): ScoutCandidate {
  counter++;
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    workspaceId: 'test-workspace',
    displayName: `Test Artist ${counter}`,
    canonicalName: `test artist ${counter}`,
    aliases: [],
    extraLinks: [],
    genres: [],
    locations: [],
    hitTracks: [],
    enrichmentStatus: 'pending',
    identityOverride: false,
    addedBy: 'editor@test.local',
    source: 'manual',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function buildCandidateWithSpotify(spotifyArtistId: string): ScoutCandidate {
  return buildCandidate({
    spotifyArtistId,
    spotifyUrl: `https://open.spotify.com/artist/${spotifyArtistId}`,
  });
}

export function buildCandidateWithInstagram(handle: string): ScoutCandidate {
  return buildCandidate({ instagramHandle: handle });
}

export function resetCandidateCounter(): void {
  counter = 0;
}
