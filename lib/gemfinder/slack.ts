const NOTIFY_STAGE_IDS = new Set(['engaged', 'won', 'live']);

const STAGE_LABELS: Record<string, string> = {
  prospect: 'Prospect',
  drafted: 'Draft Ready',
  sent: 'Sent',
  replied: 'Replied',
  engaged: 'Engaged',
  won: 'Won',
  live: 'Live',
  dead: 'Dead'
};

type ProjectArtist = {
  n?: string;
  e?: string;
  soc?: string;
};

type WorkspaceProject = {
  id?: string;
  name?: string;
  pipeline?: Record<string, { stage?: string } | undefined>;
  assignments?: Record<string, string | undefined>;
  artists?: ProjectArtist[];
};

type StageTransition = {
  projectId: string;
  projectName: string;
  artistName: string;
  previousStage: string;
  nextStage: string;
  owner: string;
  profileUrl: string;
  spotifyUrl: string;
};

function asProjects(value: unknown): WorkspaceProject[] {
  return Array.isArray(value) ? (value as WorkspaceProject[]) : [];
}

function stageLabel(stageId: string): string {
  return STAGE_LABELS[stageId] || stageId || 'Unknown';
}

function appBaseUrl(): string {
  return String(process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
}

function spotifySearchUrl(artistName: string): string {
  return `https://open.spotify.com/search/${encodeURIComponent(String(artistName || '').trim())}`;
}

function artistProfileUrl(projectId: string, artistName: string): string {
  const base = appBaseUrl();
  if (!base) return '';
  const params = new URLSearchParams({
    project: projectId,
    artist: artistName,
    tab: 'overview',
  });
  return `${base}/ar?${params.toString()}`;
}

function extractArtistTransitions(previousProjects: unknown[], nextProjects: unknown[]): StageTransition[] {
  const previousByProjectId = new Map<string, WorkspaceProject>();
  for (const project of asProjects(previousProjects)) {
    if (project?.id) previousByProjectId.set(String(project.id), project);
  }

  const transitions: StageTransition[] = [];
  for (const nextProject of asProjects(nextProjects)) {
    const projectId = String(nextProject?.id || '');
    if (!projectId) continue;
    const prevProject = previousByProjectId.get(projectId);
    const nextPipeline = nextProject?.pipeline || {};
    for (const [artistName, nextState] of Object.entries(nextPipeline)) {
      const nextStage = String(nextState?.stage || 'prospect');
      const previousStage = String(prevProject?.pipeline?.[artistName]?.stage || '');
      if (!previousStage || previousStage === nextStage) continue;
      if (!NOTIFY_STAGE_IDS.has(nextStage)) continue;
      const artistRecord = (nextProject?.artists || []).find((artist) => String(artist?.n || '') === artistName);
      transitions.push({
        projectId,
        projectName: String(nextProject?.name || 'Untitled Project'),
        artistName,
        previousStage,
        nextStage,
        owner: String(nextProject?.assignments?.[artistName] || 'Unassigned'),
        profileUrl: artistProfileUrl(projectId, artistRecord?.n || artistName),
        spotifyUrl: spotifySearchUrl(artistRecord?.n || artistName),
      });
    }
  }

  return transitions;
}

function buildSlackPayload(transition: StageTransition, actorEmail: string) {
  const actorLabel = actorEmail || 'Unknown user';
  const text = `GEMFINDER: ${transition.artistName} moved to ${stageLabel(transition.nextStage)} in ${transition.projectName}`;
  const accessoryButtons = [];
  if (transition.profileUrl) {
    accessoryButtons.push({
      type: 'button',
      text: {
        type: 'plain_text',
        text: 'Open artist',
      },
      url: transition.profileUrl,
    });
  }
  if ((transition.nextStage === 'engaged' || transition.nextStage === 'won') && transition.spotifyUrl) {
    accessoryButtons.push({
      type: 'button',
      text: {
        type: 'plain_text',
        text: 'Spotify',
      },
      url: transition.spotifyUrl,
    });
  }
  return {
    text,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${transition.artistName} -> ${stageLabel(transition.nextStage)}`
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Project*\n${transition.projectName}`
          },
          {
            type: 'mrkdwn',
            text: `*Owner*\n${transition.owner}`
          },
          {
            type: 'mrkdwn',
            text: `*Changed by*\n${actorLabel}`
          },
          {
            type: 'mrkdwn',
            text: `*Stage change*\n${stageLabel(transition.previousStage)} -> ${stageLabel(transition.nextStage)}`
          }
        ]
      },
      ...(accessoryButtons.length
        ? [{
            type: 'actions',
            elements: accessoryButtons,
          }]
        : [])
      ,
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: transition.profileUrl ? `<${transition.profileUrl}|Open ${transition.artistName} in GemFinder>` : 'GemFinder artist link unavailable',
          }
        ]
      }
    ]
  };
}

export async function notifySlackOnStageTransitions(input: {
  previousProjects: unknown[];
  nextProjects: unknown[];
  actorEmail: string;
}): Promise<void> {
  const webhookUrl = String(process.env.SLACK_WEBHOOK_URL || '').trim();
  if (!webhookUrl) return;

  const transitions = extractArtistTransitions(input.previousProjects, input.nextProjects);
  if (!transitions.length) return;

  const results = await Promise.allSettled(
    transitions.map((transition) =>
      fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(buildSlackPayload(transition, input.actorEmail))
      })
    )
  );

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error('[slack-notify] request failed', {
        projectId: transitions[index]?.projectId,
        artistName: transitions[index]?.artistName,
        error: result.reason instanceof Error ? result.reason.message : result.reason
      });
      return;
    }

    if (!result.value.ok) {
      console.error('[slack-notify] non-200 response', {
        projectId: transitions[index]?.projectId,
        artistName: transitions[index]?.artistName,
        status: result.value.status
      });
    }
  });
}
