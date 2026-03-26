const A_R_NOTIFY_STAGE_IDS = new Set(['engaged', 'won', 'live']);
const MARKETING_NOTIFY_STATUS_IDS = new Set(['contacted', 'interested', 'creating', 'reviewing', 'revising', 'complete', 'rejected']);

const STAGE_LABELS: Record<string, string> = {
  prospect: 'Prospect',
  drafted: 'Draft Ready',
  sent: 'Sent',
  replied: 'Replied',
  engaged: 'Engaged',
  won: 'Won',
  live: 'Live',
  dead: 'Dead',
};

const MARKETING_STATUS_LABELS: Record<string, string> = {
  prospect: 'Prospect',
  contacted: 'Contacted',
  interested: 'Interested',
  creating: 'Creating',
  reviewing: 'Reviewing',
  revising: 'Revising',
  complete: 'Complete',
  rejected: 'Rejected',
};

const MARKETING_STATUS_EMOJIS: Record<string, string> = {
  prospect: '👀',
  contacted: '📨',
  interested: '✨',
  creating: '🎬',
  reviewing: '🧐',
  revising: '🔁',
  complete: '✅',
  rejected: '⛔',
};

type ProjectArtist = {
  n?: string;
  e?: string;
  soc?: string;
};

type MarketingAssignment = {
  id?: string;
  talentName?: string;
  title?: string;
  campaign?: string;
  campaigns?: string[];
  trafficType?: string;
  channels?: string[];
  deliverableType?: string;
  owner?: string;
  status?: string;
  briefUrl?: string;
  contentUrl?: string;
};

type WorkspaceProject = {
  id?: string;
  name?: string;
  type?: string;
  pipeline?: Record<string, { stage?: string } | undefined>;
  assignments?: Record<string, string | undefined>;
  artists?: ProjectArtist[];
  marketingItems?: MarketingAssignment[];
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

type MarketingTransition = {
  projectId: string;
  projectName: string;
  assignmentId: string;
  talentName: string;
  title: string;
  campaignLabel: string;
  trafficType: string;
  deliverableType: string;
  owner: string;
  previousStatus: string;
  nextStatus: string;
  projectUrl: string;
  briefUrl: string;
  contentUrl: string;
};

function asProjects(value: unknown): WorkspaceProject[] {
  return Array.isArray(value) ? (value as WorkspaceProject[]) : [];
}

function normalizeProjectType(type: unknown): 'ar' | 'marketing' {
  return String(type || '').toLowerCase() === 'marketing' ? 'marketing' : 'ar';
}

function stageLabel(stageId: string): string {
  return STAGE_LABELS[stageId] || stageId || 'Unknown';
}

function marketingStatusLabel(statusId: string): string {
  return MARKETING_STATUS_LABELS[statusId] || statusId || 'Unknown';
}

function marketingStatusEmoji(statusId: string): string {
  return MARKETING_STATUS_EMOJIS[statusId] || '📣';
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

function marketingProjectUrl(projectId: string, assignmentId = ''): string {
  const base = appBaseUrl();
  if (!base) return '';
  const params = new URLSearchParams({ project: projectId });
  if (assignmentId) params.set('assignment', assignmentId);
  return `${base}/ar?${params.toString()}`;
}

function marketingItemKey(item: MarketingAssignment): string {
  return String(item?.id || [
    String(item?.talentName || '').trim().toLowerCase(),
    String(item?.title || '').trim().toLowerCase(),
    String(item?.campaign || item?.campaigns?.[0] || '').trim().toLowerCase(),
    String(item?.deliverableType || '').trim().toLowerCase(),
  ].join('::'));
}

function extractArtistTransitions(previousProjects: unknown[], nextProjects: unknown[]): StageTransition[] {
  const previousByProjectId = new Map<string, WorkspaceProject>();
  for (const project of asProjects(previousProjects)) {
    if (project?.id) previousByProjectId.set(String(project.id), project);
  }

  const transitions: StageTransition[] = [];
  for (const nextProject of asProjects(nextProjects)) {
    if (normalizeProjectType(nextProject?.type) !== 'ar') continue;
    const projectId = String(nextProject?.id || '');
    if (!projectId) continue;
    const prevProject = previousByProjectId.get(projectId);
    const nextPipeline = nextProject?.pipeline || {};
    for (const [artistName, nextState] of Object.entries(nextPipeline)) {
      const nextStage = String(nextState?.stage || 'prospect');
      const previousStage = String(prevProject?.pipeline?.[artistName]?.stage || '');
      if (!previousStage || previousStage === nextStage) continue;
      if (!A_R_NOTIFY_STAGE_IDS.has(nextStage)) continue;
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

function extractMarketingTransitions(previousProjects: unknown[], nextProjects: unknown[]): MarketingTransition[] {
  const previousByProjectId = new Map<string, WorkspaceProject>();
  for (const project of asProjects(previousProjects)) {
    if (project?.id) previousByProjectId.set(String(project.id), project);
  }

  const transitions: MarketingTransition[] = [];
  for (const nextProject of asProjects(nextProjects)) {
    if (normalizeProjectType(nextProject?.type) !== 'marketing') continue;
    const projectId = String(nextProject?.id || '');
    if (!projectId) continue;
    const prevProject = previousByProjectId.get(projectId);
    const prevItems = new Map<string, MarketingAssignment>();
    (prevProject?.marketingItems || []).forEach((item) => {
      prevItems.set(marketingItemKey(item), item);
    });

    (nextProject?.marketingItems || []).forEach((nextItem) => {
      const itemKey = marketingItemKey(nextItem);
      const previousItem = prevItems.get(itemKey);
      const nextStatus = String(nextItem?.status || 'prospect').toLowerCase();
      const previousStatus = String(previousItem?.status || '').toLowerCase();
      if (!previousStatus || previousStatus === nextStatus) return;
      if (!MARKETING_NOTIFY_STATUS_IDS.has(nextStatus)) return;

      const campaigns = Array.isArray(nextItem?.campaigns) && nextItem.campaigns.length
        ? nextItem.campaigns
        : [String(nextItem?.campaign || '').trim()].filter(Boolean);

      transitions.push({
        projectId,
        projectName: String(nextProject?.name || 'Untitled Project'),
        assignmentId: String(nextItem?.id || itemKey),
        talentName: String(nextItem?.talentName || 'Untitled Talent'),
        title: String(nextItem?.title || '').trim(),
        campaignLabel: campaigns.length ? campaigns.join(', ') : 'No campaign',
        trafficType: String(nextItem?.trafficType || 'Organic'),
        deliverableType: String(nextItem?.deliverableType || 'UGC'),
        owner: String(nextItem?.owner || 'Unassigned'),
        previousStatus,
        nextStatus,
        projectUrl: marketingProjectUrl(projectId, String(nextItem?.id || itemKey)),
        briefUrl: String(nextItem?.briefUrl || '').trim(),
        contentUrl: String(nextItem?.contentUrl || '').trim(),
      });
    });
  }

  return transitions;
}

function buildArSlackPayload(transition: StageTransition, actorEmail: string) {
  const actorLabel = actorEmail || 'Unknown user';
  const text = `GEMFINDER: ${transition.artistName} moved to ${stageLabel(transition.nextStage)} in ${transition.projectName}`;
  const accessoryButtons = [];
  if (transition.profileUrl) {
    accessoryButtons.push({
      type: 'button',
      text: { type: 'plain_text', text: 'Open artist' },
      url: transition.profileUrl,
    });
  }
  if ((transition.nextStage === 'engaged' || transition.nextStage === 'won') && transition.spotifyUrl) {
    accessoryButtons.push({
      type: 'button',
      text: { type: 'plain_text', text: 'Spotify' },
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
          text: `${transition.artistName} -> ${stageLabel(transition.nextStage)}`,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Project*\n${transition.projectName}` },
          { type: 'mrkdwn', text: `*Owner*\n${transition.owner}` },
          { type: 'mrkdwn', text: `*Changed by*\n${actorLabel}` },
          { type: 'mrkdwn', text: `*Stage change*\n${stageLabel(transition.previousStage)} -> ${stageLabel(transition.nextStage)}` },
        ],
      },
      ...(accessoryButtons.length ? [{ type: 'actions', elements: accessoryButtons }] : []),
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: transition.profileUrl ? `<${transition.profileUrl}|Open ${transition.artistName} in GemFinder>` : 'GemFinder artist link unavailable',
          },
        ],
      },
    ],
  };
}

function buildMarketingSlackPayload(transition: MarketingTransition, actorEmail: string) {
  const actorLabel = actorEmail || 'Unknown user';
  const nextStatusLabel = marketingStatusLabel(transition.nextStatus);
  const previousStatusLabel = marketingStatusLabel(transition.previousStatus);
  const statusEmoji = marketingStatusEmoji(transition.nextStatus);
  const text = `GEMFINDER MARKETING: ${transition.talentName} moved to ${nextStatusLabel} in ${transition.projectName}`;
  const titleLine = `${statusEmoji} ${transition.talentName} -> ${nextStatusLabel}`;
  const subtitleParts = [
    transition.campaignLabel || 'No campaign',
    transition.trafficType || 'Organic',
    transition.deliverableType || 'UGC',
  ].filter(Boolean);
  const deliverableLine = transition.title && transition.title !== transition.talentName ? transition.title : '';
  const accessoryButtons = [];
  if (transition.projectUrl) {
    accessoryButtons.push({
      type: 'button',
      text: { type: 'plain_text', text: 'Open assignment' },
      url: transition.projectUrl,
    });
  }
  if (transition.briefUrl) {
    accessoryButtons.push({
      type: 'button',
      text: { type: 'plain_text', text: 'Brief' },
      url: transition.briefUrl,
    });
  }
  if (transition.contentUrl) {
    accessoryButtons.push({
      type: 'button',
      text: { type: 'plain_text', text: 'Content' },
      url: transition.contentUrl,
    });
  }
  return {
    text,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: titleLine,
        },
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: subtitleParts.join(' · ') },
          ...(deliverableLine ? [{ type: 'mrkdwn', text: deliverableLine }] : []),
        ],
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Project*\n${transition.projectName}` },
          { type: 'mrkdwn', text: `*Campaign*\n${transition.campaignLabel}` },
          { type: 'mrkdwn', text: `*Traffic / Deliverable*\n${transition.trafficType} · ${transition.deliverableType}` },
          { type: 'mrkdwn', text: `*Owner*\n${transition.owner}` },
          { type: 'mrkdwn', text: `*Changed by*\n${actorLabel}` },
          { type: 'mrkdwn', text: `*Status change*\n${previousStatusLabel} -> ${nextStatusLabel}` },
        ],
      },
      ...(accessoryButtons.length ? [{ type: 'actions', elements: accessoryButtons }] : []),
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: transition.projectUrl
              ? `<${transition.projectUrl}|Open this assignment in GemFinder>`
              : 'GemFinder assignment link unavailable',
          },
        ],
      },
    ],
  };
}

async function postSlackNotifications(webhookUrl: string, payloads: unknown[], context: Array<Record<string, string>>) {
  if (!webhookUrl || !payloads.length) return;
  const results = await Promise.allSettled(
    payloads.map((payload) =>
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    )
  );

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error('[slack-notify] request failed', {
        ...context[index],
        error: result.reason instanceof Error ? result.reason.message : result.reason,
      });
      return;
    }
    if (!result.value.ok) {
      console.error('[slack-notify] non-200 response', {
        ...context[index],
        status: result.value.status,
      });
    }
  });
}

export async function notifySlackOnProjectTransitions(input: {
  previousProjects: unknown[];
  nextProjects: unknown[];
  actorEmail: string;
}): Promise<void> {
  const arWebhookUrl = String(process.env.SLACK_WEBHOOK_URL || '').trim();
  const marketingWebhookUrl = String(process.env.SLACK_MARKETING_WEBHOOK_URL || '').trim();

  const artistTransitions = extractArtistTransitions(input.previousProjects, input.nextProjects);
  const marketingTransitions = extractMarketingTransitions(input.previousProjects, input.nextProjects);

  await Promise.all([
    postSlackNotifications(
      arWebhookUrl,
      artistTransitions.map((transition) => buildArSlackPayload(transition, input.actorEmail)),
      artistTransitions.map((transition) => ({
        channel: 'ar',
        projectId: transition.projectId,
        artistName: transition.artistName,
      }))
    ),
    postSlackNotifications(
      marketingWebhookUrl,
      marketingTransitions.map((transition) => buildMarketingSlackPayload(transition, input.actorEmail)),
      marketingTransitions.map((transition) => ({
        channel: 'marketing',
        projectId: transition.projectId,
        talentName: transition.talentName,
        assignmentId: transition.assignmentId,
      }))
    ),
  ]);
}
