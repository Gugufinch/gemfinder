/**
 * scripts/enable-scout-v3.ts
 *
 * One-shot CLI helper to flip Scout V3 on or off for a workspace.
 *
 * Usage (locally, with DATABASE_URL set):
 *   npx tsx scripts/enable-scout-v3.ts <workspaceId> [--off]
 *
 * Examples:
 *   npx tsx scripts/enable-scout-v3.ts songfinch
 *   npx tsx scripts/enable-scout-v3.ts songfinch --off
 *
 * On Render (or any host with DATABASE_URL pointing at prod), run this
 * via `render shell` or equivalent. No web UI yet — that's deferred polish.
 */

import { listWorkspaceProjects, saveWorkspaceProjects } from '../lib/gemfinder/project-store';

async function main() {
  const workspaceId = process.argv[2];
  const turnOff = process.argv.includes('--off');

  if (!workspaceId) {
    console.error('Usage: npx tsx scripts/enable-scout-v3.ts <workspaceId> [--off]');
    process.exit(1);
  }

  const projects = (await listWorkspaceProjects()) as Array<Record<string, unknown>>;
  const proj = projects.find((p) => p.id === workspaceId);
  if (!proj) {
    console.error(`Workspace ${workspaceId} not found.`);
    console.error(`Available workspace IDs: ${projects.map((p) => p.id).join(', ')}`);
    process.exit(1);
  }

  const settings = (proj.settings as Record<string, unknown>) || {};
  const flags = (settings.featureFlags as Record<string, unknown>) || {};
  const before = Boolean(flags.scoutV3);
  flags.scoutV3 = !turnOff;
  settings.featureFlags = flags;
  proj.settings = settings;

  await saveWorkspaceProjects(projects);

  console.log(
    `✓ Scout V3 feature flag for workspace "${workspaceId}": ${before} → ${!turnOff}`
  );
  if (!turnOff) {
    console.log('  - Workspace dashboard "Open Scout" card now routes to V3');
    console.log('  - /api/ar/scout/* routes now reachable');
    console.log('  - Old Scout V2 surface still exists at screen="scout" but nav points away from it');
  } else {
    console.log('  - Workspace dashboard "Open Scout" card routes back to V2');
    console.log('  - /api/ar/scout/* routes return 404');
  }
}

main().catch((err) => {
  console.error('[ENABLE_SCOUT_V3] failed:', err);
  process.exit(1);
});
