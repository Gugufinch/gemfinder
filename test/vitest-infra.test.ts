import { describe, it, expect } from 'vitest';
import { adminActor, editorActor, viewerActor } from './fixtures/scout-v3/actors';
import { buildCandidate, buildCandidateWithSpotify } from './fixtures/scout-v3/candidates';
import { buildRejection } from './fixtures/scout-v3/rejections';

describe('vitest infrastructure smoke test', () => {
  it('runs a basic test', () => {
    expect(1 + 1).toBe(2);
  });

  it('loads actor fixtures with correct roles', () => {
    expect(adminActor().role).toBe('admin');
    expect(editorActor().role).toBe('editor');
    expect(viewerActor().role).toBe('viewer');
  });

  it('respects actor overrides', () => {
    const a = editorActor({ email: 'override@x.com' });
    expect(a.email).toBe('override@x.com');
    expect(a.role).toBe('editor');     // role unchanged
  });

  it('builds candidate fixtures with overrides', () => {
    const c = buildCandidate({ displayName: 'Override Name' });
    expect(c.displayName).toBe('Override Name');
    expect(c.workspaceId).toBe('test-workspace');
    expect(c.enrichmentStatus).toBe('pending');
    expect(c.identityOverride).toBe(false);
  });

  it('builds candidate with Spotify identity', () => {
    const c = buildCandidateWithSpotify('abc123');
    expect(c.spotifyArtistId).toBe('abc123');
    expect(c.spotifyUrl).toBe('https://open.spotify.com/artist/abc123');
  });

  it('builds rejection with default reason', () => {
    const r = buildRejection();
    expect(r.reasonCode).toBe('already_signed');
    expect(r.rejectedBy).toBe('editor@test.local');
    expect(r.candidateSnapshot).toBeDefined();
  });

  it('builds rejection with overridden reason', () => {
    const r = buildRejection({ reasonCode: 'too_big', reasonNote: 'major label' });
    expect(r.reasonCode).toBe('too_big');
    expect(r.reasonNote).toBe('major label');
  });
});
