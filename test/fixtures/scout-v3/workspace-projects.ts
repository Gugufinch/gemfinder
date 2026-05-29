// Builds a workspace-projects JSONB structure matching the production shape
// (see lib/gemfinder/project-store.ts). Used by tests that exercise the
// Kickoff/Live portion of the blocklist.

export type FixtureArtist = {
  n: string;             // name
  e?: string;            // primary email
  soc?: string;          // instagram handle (no @)
  spotify?: string;      // spotify URL or ID fragment
  stage?: string;        // prospect | contacted | engaged | won | live | dead
};

export type FixtureProject = {
  id: string;
  name: string;
  artists: FixtureArtist[];
  settings?: Record<string, unknown>;
};

export function buildWorkspaceWithKickoffArtists(
  projects: FixtureProject[]
): { projects: FixtureProject[] } {
  return { projects };
}

export function buildKickoffArtist(overrides: Partial<FixtureArtist> = {}): FixtureArtist {
  return {
    n: 'Test Kickoff Artist',
    stage: 'contacted',
    ...overrides,
  };
}
