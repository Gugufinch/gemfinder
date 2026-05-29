const A_R_NOTIFY_STAGE_IDS = new Set(['engaged', 'won', 'live']);
const MARKETING_NOTIFY_STATUS_IDS = new Set(['contacted', 'interested', 'creating', 'followed_up', 'reviewing', 'revising', 'editing', 'complete', 'rejected']);

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
  followed_up: 'Followed Up',
  reviewing: 'Reviewing',
  revising: 'Revising',
  editing: 'Editing',
  complete: 'Complete',
  rejected: 'Rejected',
};

const MARKETING_STATUS_EMOJIS: Record<string, string> = {
  prospect: '👀',
  contacted: '📨',
  interested: '✨',
  creating: '🎬',
  followed_up: '📬',
  reviewing: '🧐',
  revising: '🔁',
  editing: '✂️',
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
  updateKind?: 'status_change' | 'content_added';
};

type MarketingSummaryPayloadInput = {
  projectName: string;
  projectUrl: string;
  actorEmail: string;
  transitions: MarketingTransition[];
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
      const previousStage = String(prevProject?.pipeline?.[artistName]?.stage || 'prospect');
      if (previousStage === nextStage) continue;
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
      const previousStatus = String(previousItem?.status || '').toLowerCase() || 'prospect';
      const nextContentUrl = String(nextItem?.contentUrl || '').trim();
      const previousContentUrl = String(previousItem?.contentUrl || '').trim();
      const statusChanged = previousStatus !== nextStatus;
      const contentAddedOnComplete = nextStatus === 'complete' && !!nextContentUrl && nextContentUrl !== previousContentUrl;
      if (!statusChanged && !contentAddedOnComplete) return;
      if (statusChanged && !MARKETING_NOTIFY_STATUS_IDS.has(nextStatus)) return;

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
        contentUrl: nextContentUrl,
        updateKind: !statusChanged && contentAddedOnComplete ? 'content_added' : 'status_change',
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
  const isContentAdded = transition.updateKind === 'content_added';
  const text = isContentAdded
    ? `GEMFINDER MARKETING: content link added for ${transition.talentName} in ${transition.projectName}`
    : `GEMFINDER MARKETING: ${transition.talentName} moved to ${nextStatusLabel} in ${transition.projectName}`;
  const titleLine = isContentAdded
    ? `🔗 ${transition.talentName} complete link added`
    : `${statusEmoji} ${transition.talentName} -> ${nextStatusLabel}`;
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
          {
            type: 'mrkdwn',
            text: isContentAdded
              ? `*Update*\nContent link added to ${nextStatusLabel}`
              : `*Status change*\n${previousStatusLabel} -> ${nextStatusLabel}`,
          },
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

function buildMarketingBulkSlackPayload(input: MarketingSummaryPayloadInput) {
  const actorLabel = input.actorEmail || 'Unknown user';
  const statusCounts = new Map<string, number>();
  const campaignCounts = new Map<string, number>();
  const names = new Set<string>();

  input.transitions.forEach((transition) => {
    statusCounts.set(transition.nextStatus, (statusCounts.get(transition.nextStatus) || 0) + 1);
    campaignCounts.set(transition.campaignLabel || 'No campaign', (campaignCounts.get(transition.campaignLabel || 'No campaign') || 0) + 1);
    if (transition.talentName) names.add(transition.talentName);
  });

  const statusLabel = Array.from(statusCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => `${marketingStatusEmoji(status)} ${marketingStatusLabel(status)} (${count})`)
    .join(' · ');
  const campaignLabel = Array.from(campaignCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([campaign, count]) => `${campaign} (${count})`)
    .join(' · ');
  const namesPreview = Array.from(names).slice(0, 8).join(', ');
  const extraCount = Math.max(0, names.size - 8);

  return {
    text: `GEMFINDER MARKETING: bulk update in ${input.projectName}`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `📦 Bulk marketing update · ${input.transitions.length} assignments`,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Project*\n${input.projectName}` },
          { type: 'mrkdwn', text: `*Changed by*\n${actorLabel}` },
          { type: 'mrkdwn', text: `*Statuses*\n${statusLabel || 'Mixed updates'}` },
          { type: 'mrkdwn', text: `*Campaigns*\n${campaignLabel || 'Mixed campaigns'}` },
        ],
      },
      ...(namesPreview ? [{
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Updated talent: ${namesPreview}${extraCount ? ` and ${extraCount} more` : ''}`,
          },
        ],
      }] : []),
      ...(input.projectUrl ? [{
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Open project' },
            url: input.projectUrl,
          },
        ],
      }] : []),
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
  const marketingPayloads =
    marketingTransitions.length > 12
      ? [
          buildMarketingBulkSlackPayload({
            projectName: marketingTransitions[0]?.projectName || 'Marketing Project',
            projectUrl: marketingTransitions[0]?.projectUrl
              ? marketingTransitions[0].projectUrl.replace(/([?&])assignment=[^&]+(&|$)/, '$1').replace(/[?&]$/, '')
              : '',
            actorEmail: input.actorEmail,
            transitions: marketingTransitions,
          }),
        ]
      : marketingTransitions.map((transition) => buildMarketingSlackPayload(transition, input.actorEmail));
  const marketingContext =
    marketingTransitions.length > 12
      ? [
          {
            channel: 'marketing',
            projectId: marketingTransitions[0]?.projectId || '',
            mode: 'bulk-summary',
            count: String(marketingTransitions.length),
          },
        ]
      : marketingTransitions.map((transition) => ({
          channel: 'marketing',
          projectId: transition.projectId,
          talentName: transition.talentName,
          assignmentId: transition.assignmentId,
        }));

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
      marketingPayloads,
      marketingContext
    ),
  ]);
}
