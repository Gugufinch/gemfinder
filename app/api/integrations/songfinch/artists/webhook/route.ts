import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { listWorkspaceProjects } from '@/lib/gemfinder/project-store';
import { mutateWorkspaceProjects } from '@/lib/gemfinder/mutate-workspace';
import { notifySlackOnProjectTransitions } from '@/lib/gemfinder/slack';

export const runtime = 'nodejs';

type ArtistRecord = {
  n?: string;
  g?: string;
  l?: string;
  h?: string;
  ig?: string;
  soc?: string;
  e?: string;
  loc?: string;
  s?: boolean;
  o?: string;
  instagramFollowers?: string;
  contactName?: string;
  contactEmail?: string;
  contactType?: string;
  tiktokUrl?: string;
  tiktokFollowers?: string;
  spotifyUrl?: string;
  curatorPageUrl?: string;
  curatedArtists?: string[];
  profileSummary?: string;
};

type WorkspaceProject = {
  id?: string;
  type?: string;
  workspaceId?: string;
  workspaceName?: string;
  workspaceSlug?: string;
  workspaceRole?: string;
  name?: string;
  desc?: string;
  artists?: ArtistRecord[];
  pipeline?: Record<string, { stage?: string; date?: string } | undefined>;
  notes?: Record<string, string | undefined>;
  followUps?: Record<string, string | undefined>;
  activityLog?: Record<string, Array<Record<string, unknown>> | undefined>;
  sequenceState?: Record<string, unknown>;
  sendLog?: Array<Record<string, unknown>>;
  abStats?: Record<string, unknown>;
  abCredits?: Record<string, unknown>;
  archivedArtists?: string[];
  marketingItems?: unknown[];
  teamUsers?: string[];
  assignments?: Record<string, string | undefined>;
  replyIntel?: Record<string, unknown>;
  internalRoster?: { names?: string[]; fileName?: string; uploadedAt?: string };
  settings?: Record<string, unknown>;
  created?: string;
};

const payloadSchema = z.object({
  artist_email: z.string().trim().optional().nullable(),
  artist_id: z.union([z.string(), z.number()]).optional().nullable(),
  artist_name: z.string().trim().min(1),
  contact_email: z.string().trim().optional().nullable(),
  contact_name: z.string().trim().optional().nullable(),
  contact_type: z.string().trim().optional().nullable(),
  environment: z.string().trim().optional().default('production'),
  event_id: z.string().trim().min(1),
  event_type: z.string().trim().min(1),
  genre: z.string().trim().optional().nullable(),
  hit_track: z.string().trim().optional().nullable(),
  instagram_followers: z.union([z.string(), z.number()]).optional().nullable(),
  instagram_url: z.string().trim().optional().nullable(),
  location: z.string().trim().optional().nullable(),
  manager_email: z.string().trim().optional().nullable(),
  manager_name: z.string().trim().optional().nullable(),
  monthly_listeners: z.union([z.string(), z.number()]).optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  profile_summary: z.string().trim().optional().nullable(),
  spotify_url: z.string().trim().optional().nullable(),
  status: z.string().trim().optional().nullable(),
  tiktok_followers: z.union([z.string(), z.number()]).optional().nullable(),
  tiktok_url: z.string().trim().optional().nullable(),
  updated_at: z.string().trim().optional().nullable(),
}).passthrough();

function configuredWebhookKey(): string {
  return String(
    process.env.SONGFINCH_WEBHOOK_KEY
      || process.env.GEMFINDER_WEBHOOK_KEY
      || ''
  ).trim();
}

function acceptsDevelopmentSync(): boolean {
  return ['1', 'true', 'yes', 'on'].includes(
    String(process.env.SONGFINCH_WEBHOOK_ACCEPT_DEVELOPMENT || '').trim().toLowerCase()
  );
}

function allowedWebhookEnvironments(): string[] {
  const configured = String(process.env.SONGFINCH_WEBHOOK_ALLOWED_ENVIRONMENTS || '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
  if (configured.length) return Array.from(new Set(configured));
  return acceptsDevelopmentSync() ? ['production', 'development'] : ['production'];
}

function titleCase(value: string): string {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function slugify(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function canonicalArtistName(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(ft|feat|featuring)\b\.?/g, ' ')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function canonicalEmail(value: string): string {
  const raw = String(value || '').trim().toLowerCase();
  return /@/.test(raw) ? raw : '';
}

function normalizeProjectType(type: unknown): 'ar' | 'marketing' | 'curator' {
  const raw = String(type || '').trim().toLowerCase();
  if (raw === 'marketing') return 'marketing';
  if (raw === 'curator') return 'curator';
  return 'ar';
}

function normalizeWorkspaceRole(project: WorkspaceProject): string {
  const role = String(project.workspaceRole || '').trim().toLowerCase();
  if (role) return role;
  const type = normalizeProjectType(project.type);
  if (type === 'marketing') return 'live_marketing';
  if (type === 'curator') return 'kickoff_curator';
  return 'kickoff_ar';
}

function extractInstagramHandle(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('@')) return raw.slice(1).trim();
  try {
    const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    const match = parsed.pathname.match(/\/([^/?#]+)/);
    if (match?.[1]) return match[1].replace(/^@/, '').trim();
  } catch {}
  return raw.replace(/^@/, '').replace(/\s+/g, '').trim();
}

function trimUrl(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw;
}

function numericString(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const digits = raw.replace(/[^\d.]/g, '');
  if (!digits) return '';
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? String(Math.round(parsed)) : '';
}

function normalizeGenre(value: string): string {
  return titleCase(String(value || '').replace(/\s+/g, ' ').trim());
}

function kickoffStageFromPayload(status: string, eventType: string): string {
  const raw = `${String(status || '')} ${String(eventType || '')}`.toLowerCase();
  if (/\b(dead|closed|rejected|archived|inactive)\b/.test(raw)) return 'dead';
  if (/\b(live|activated|active_on_platform|published)\b/.test(raw)) return 'live';
  if (/\b(won|accepted|approved|onboard|onboarding|contracted)\b/.test(raw)) return 'won';
  if (/\b(engaged|interested|qualified|reviewed)\b/.test(raw)) return 'engaged';
  if (/\b(replied|reply)\b/.test(raw)) return 'replied';
  if (/\b(sent|contacted|reached_out|outreach)\b/.test(raw)) return 'sent';
  if (/\b(drafted|draft)\b/.test(raw)) return 'drafted';
  if (/\b(applied|submitted|created|new)\b/.test(raw)) return 'prospect';
  return '';
}

function webhookActionLabel(eventType: string, status: string): string {
  const typeLabel = titleCase(String(eventType || '').replace(/[_-]+/g, ' '));
  const statusLabel = titleCase(String(status || '').replace(/[_-]+/g, ' '));
  if (typeLabel && statusLabel) return `Songfinch webhook · ${typeLabel} · ${statusLabel}`;
  return `Songfinch webhook · ${typeLabel || statusLabel || 'Event received'}`;
}

function defaultKickoffProject(): WorkspaceProject {
  return {
    id: `p_${Date.now()}`,
    type: 'ar',
    workspaceId: 'songfinch',
    workspaceName: 'Songfinch',
    workspaceSlug: 'songfinch',
    workspaceRole: 'kickoff_ar',
    name: 'Songfinch Kickoff',
    desc: 'Songfinch artist intake fed by webhook events.',
    artists: [],
    pipeline: {},
    notes: {},
    followUps: {},
    activityLog: {},
    sequenceState: {},
    sendLog: [],
    abStats: {},
    abCredits: {},
    archivedArtists: [],
    marketingItems: [],
    teamUsers: ['Greg', 'Vinny', 'Brad', 'Jen', 'JB'],
    assignments: {},
    replyIntel: {},
    internalRoster: { names: [], fileName: '', uploadedAt: '' },
    settings: {
      provider: 'gmail',
      autoLogCompose: false,
      aiProvider: 'anthropic',
      draftGuardrails: {},
      savedTemplates: [],
      publicCsvToken: '',
      marketingCampaignBank: [],
      marketingCampaignDetails: {},
      marketingGroups: [],
      appearance: { accent: 'blue' },
      songfinchWebhook: {
        processedEventIds: [],
        recentEvents: [],
      },
    },
    created: new Date().toISOString(),
  };
}

function findKickoffProjectIndex(projects: WorkspaceProject[]): number {
  const byRole = projects.findIndex(project =>
    String(project.workspaceId || 'songfinch').trim().toLowerCase() === 'songfinch'
    && normalizeWorkspaceRole(project) === 'kickoff_ar'
  );
  if (byRole >= 0) return byRole;

  const byHeuristic = projects.findIndex(project => {
    const type = normalizeProjectType(project.type);
    const name = String(project.name || '').toLowerCase();
    return type === 'ar' && !name.includes('curator');
  });
  return byHeuristic;
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function addLog(project: WorkspaceProject, artistName: string, action: string, kind = 'event', extra: Record<string, unknown> = {}) {
  const logs = project.activityLog || {};
  const artistLogs = Array.isArray(logs[artistName]) ? [...(logs[artistName] || [])] : [];
  artistLogs.push({
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    action,
    kind,
    time: new Date().toISOString(),
    actor: extra.actor || 'Songfinch webhook',
    ...extra,
  });
  return {
    ...logs,
    [artistName]: artistLogs.slice(-120),
  };
}

function summarizeRecentEvent(payload: z.infer<typeof payloadSchema>) {
  return {
    eventId: payload.event_id,
    eventType: payload.event_type,
    status: String(payload.status || '').trim(),
    environment: String(payload.environment || '').trim() || 'production',
    artistId: payload.artist_id == null ? '' : String(payload.artist_id),
    artistName: payload.artist_name,
    receivedAt: new Date().toISOString(),
  };
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/integrations/songfinch/artists/webhook',
    expectsHeader: 'X-GemFinder-Webhook-Key',
    acceptsDevelopmentSync: acceptsDevelopmentSync(),
    allowedEnvironments: allowedWebhookEnvironments(),
    message: 'POST Songfinch artist events here. Use the webhook key header and JSON payload.',
  });
}

async function processSongfinchWebhook(data: z.infer<typeof payloadSchema>) {
  const environment = String(data.environment || 'production').trim().toLowerCase() || 'production';
  const allowDevelopmentSync = acceptsDevelopmentSync();

  // Pre-check duplicate via a read-only fetch. Tolerable rare race: if the
  // same event_id is being processed concurrently, both pre-checks miss and
  // the second write lands a duplicate entry in recentEvents.
  // processedEventIds is still deduped, so the worst case is a cosmetic
  // double-log of one event in the recentEvents tail — not data loss.
  {
    const preProjects = (await listWorkspaceProjects()) as WorkspaceProject[];
    const preIdx = findKickoffProjectIndex(preProjects);
    if (preIdx >= 0) {
      const preIds = ((preProjects[preIdx].settings as Record<string, unknown> | undefined)?.songfinchWebhook as { processedEventIds?: string[] } | undefined)?.processedEventIds;
      if (Array.isArray(preIds) && preIds.includes(data.event_id)) {
        return NextResponse.json({
          ok: true,
          duplicate: true,
          synced: false,
          reason: 'event_already_processed',
          eventId: data.event_id,
        });
      }
    }
  }

  // Audit #5: ALL state mutation goes through mutateWorkspaceProjects so a
  // concurrent webhook (or approve, weights, etc.) doesn't have its work
  // silently clobbered. The mutator runs fresh on every retry — both
  // writers' artist/pipeline changes survive.
  if (environment === 'development' && !allowDevelopmentSync) {
    await mutateWorkspaceProjects(
      (projects) => {
        const arr = projects as WorkspaceProject[];
        let idx = findKickoffProjectIndex(arr);
        if (idx < 0) { arr.push(defaultKickoffProject()); idx = arr.length - 1; }
        const target = arr[idx];
        const settings = { ...(target.settings || {}) } as Record<string, unknown>;
        const ws = {
          processedEventIds: dedupeStrings(
            Array.isArray((settings.songfinchWebhook as { processedEventIds?: string[] } | undefined)?.processedEventIds)
              ? ((settings.songfinchWebhook as { processedEventIds?: string[] }).processedEventIds || []).map(id => String(id || '').trim())
              : []
          ),
          recentEvents: Array.isArray((settings.songfinchWebhook as { recentEvents?: unknown[] } | undefined)?.recentEvents)
            ? [ ...(((settings.songfinchWebhook as { recentEvents?: unknown[] }).recentEvents || [])) ]
            : [],
        };
        ws.recentEvents = [summarizeRecentEvent(data), ...ws.recentEvents].slice(0, 50);
        settings.songfinchWebhook = ws;
        arr[idx] = { ...target, settings };
      },
      { reason: 'songfinch_webhook:test_event' },
    );
    return NextResponse.json({
      ok: true,
      accepted: true,
      synced: false,
      environment,
      reason: 'development_events_are_not_syncing',
      hint: 'Set SONGFINCH_WEBHOOK_ACCEPT_DEVELOPMENT=true if you want sample events to populate Kickoff.',
    }, { status: 202 });
  }

  // Full mutation path. Snapshots are captured INSIDE the mutator so retries
  // get the right "before/after" pair for the Slack notification.
  let previousProjects: WorkspaceProject[] = [];
  let nextProjects: WorkspaceProject[] = [];
  await mutateWorkspaceProjects(
    (projects) => {
      const arr = projects as WorkspaceProject[];
      previousProjects = JSON.parse(JSON.stringify(arr));

      let projectIndex = findKickoffProjectIndex(arr);
      if (projectIndex < 0) {
        arr.push(defaultKickoffProject());
        projectIndex = arr.length - 1;
      }

      const targetProject = arr[projectIndex];
      const settings = { ...(targetProject.settings || {}) } as Record<string, unknown>;
      const webhookState = {
        processedEventIds: dedupeStrings(
          Array.isArray((settings.songfinchWebhook as { processedEventIds?: string[] } | undefined)?.processedEventIds)
            ? ((settings.songfinchWebhook as { processedEventIds?: string[] }).processedEventIds || []).map(id => String(id || '').trim())
            : []
        ),
        recentEvents: Array.isArray((settings.songfinchWebhook as { recentEvents?: unknown[] } | undefined)?.recentEvents)
          ? [ ...(((settings.songfinchWebhook as { recentEvents?: unknown[] }).recentEvents || [])) ]
          : [],
      };
      webhookState.recentEvents = [summarizeRecentEvent(data), ...webhookState.recentEvents].slice(0, 50);

      const artists = Array.isArray(targetProject.artists) ? [...targetProject.artists] : [];
      const incomingEmail = canonicalEmail(String(data.contact_email || data.manager_email || data.artist_email || ''));
      const incomingNameKey = canonicalArtistName(data.artist_name);
      const existingArtist = artists.find(artist =>
        canonicalArtistName(String(artist.n || '')) === incomingNameKey
        || (incomingEmail && canonicalEmail(String(artist.contactEmail || artist.e || '')) === incomingEmail)
      );
      const artistName = String(existingArtist?.n || data.artist_name).trim();
      const existingIndex = artists.findIndex(artist => String(artist.n || '') === artistName);
      const instagramUrl = trimUrl(String(data.instagram_url || ''));
      const instagramHandle = extractInstagramHandle(instagramUrl);
      const tiktokUrl = trimUrl(String(data.tiktok_url || ''));
      const stageFromEvent = kickoffStageFromPayload(String(data.status || ''), data.event_type);
      const previousStage = String(targetProject.pipeline?.[artistName]?.stage || 'prospect');
      const nextStage = stageFromEvent || previousStage || 'prospect';
      const nowIso = String(data.updated_at || '').trim() || new Date().toISOString();

      const nextArtist: ArtistRecord = {
        ...(existingArtist || {}),
        n: artistName,
        g: normalizeGenre(String(data.genre || existingArtist?.g || '')),
        l: numericString(data.monthly_listeners ?? existingArtist?.l ?? ''),
        h: String(data.hit_track || existingArtist?.h || '').trim(),
        ig: instagramUrl || (instagramHandle ? `@${instagramHandle}` : String(existingArtist?.ig || '').trim()),
        soc: instagramHandle || String(existingArtist?.soc || '').replace(/^@/, '').trim(),
        e: canonicalEmail(String(data.artist_email || existingArtist?.e || '')),
        loc: String(data.location || existingArtist?.loc || '').trim(),
        s: Boolean(existingArtist?.s),
        o: 'Songfinch webhook',
        instagramFollowers: numericString(data.instagram_followers ?? existingArtist?.instagramFollowers ?? ''),
        contactName: String(data.contact_name || data.manager_name || existingArtist?.contactName || '').trim(),
        contactEmail: canonicalEmail(String(data.contact_email || data.manager_email || existingArtist?.contactEmail || '')),
        contactType: String(
          data.contact_type
          || (data.manager_email || data.manager_name ? 'Manager' : '')
          || existingArtist?.contactType
          || ''
        ).trim(),
        tiktokUrl: tiktokUrl || String(existingArtist?.tiktokUrl || '').trim(),
        tiktokFollowers: numericString(data.tiktok_followers ?? existingArtist?.tiktokFollowers ?? ''),
        spotifyUrl: trimUrl(String(data.spotify_url || existingArtist?.spotifyUrl || '')),
        curatorPageUrl: String(existingArtist?.curatorPageUrl || '').trim(),
        curatedArtists: Array.isArray(existingArtist?.curatedArtists) ? existingArtist?.curatedArtists : [],
        profileSummary: String(data.profile_summary || existingArtist?.profileSummary || '').trim(),
      };

      if (existingIndex >= 0) artists[existingIndex] = nextArtist;
      else artists.unshift(nextArtist);

      const nextNotes = { ...(targetProject.notes || {}) };
      const incomingNote = String(data.notes || '').trim();
      if (incomingNote) {
        nextNotes[artistName] = incomingNote;
      }

      const nextProject: WorkspaceProject = {
        ...targetProject,
        artists,
        pipeline: {
          ...(targetProject.pipeline || {}),
          [artistName]: {
            ...(targetProject.pipeline?.[artistName] || {}),
            stage: nextStage,
            date: nowIso,
          },
        },
        notes: nextNotes,
        activityLog: addLog(
          targetProject,
          artistName,
          webhookActionLabel(data.event_type, String(data.status || '')),
          'event',
          {
            actor: 'Songfinch webhook',
            note: incomingNote || `event_id=${data.event_id}`,
            sourceEventId: data.event_id,
            sourceEventType: data.event_type,
            sourceEnvironment: environment,
          }
        ),
        settings: {
          ...settings,
          songfinchWebhook: {
            processedEventIds: dedupeStrings([...webhookState.processedEventIds, data.event_id]).slice(-500),
            recentEvents: webhookState.recentEvents,
          },
        },
      };

      arr[projectIndex] = nextProject;
      nextProjects = JSON.parse(JSON.stringify(arr));
    },
    { reason: `songfinch_webhook:${slugify(data.event_type) || 'event'}` },
  );

  await notifySlackOnProjectTransitions({
    previousProjects,
    nextProjects,
    actorEmail: 'songfinch-webhook@songfinch.com',
  });
}

export async function POST(req: NextRequest) {
  const expectedKey = configuredWebhookKey();
  if (!expectedKey) {
    return NextResponse.json(
      { error: 'Songfinch webhook is not configured yet. Set SONGFINCH_WEBHOOK_KEY in Render.' },
      { status: 503 }
    );
  }

  const providedKey = String(req.headers.get('x-gemfinder-webhook-key') || '').trim();
  if (!providedKey || providedKey !== expectedKey) {
    return NextResponse.json({ error: 'Invalid webhook key' }, { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid webhook payload', details: parsed.error.issues }, { status: 400 });
  }

  const data = parsed.data;
  const environment = String(data.environment || 'production').trim().toLowerCase() || 'production';
  const allowedEnvironments = allowedWebhookEnvironments();

  if (!allowedEnvironments.includes(environment)) {
    console.info('[gemfinder] songfinch webhook ignored due to environment', {
      eventId: data.event_id,
      eventType: data.event_type,
      environment,
      allowedEnvironments,
    });
    return NextResponse.json({
      ok: true,
      accepted: true,
      queued: false,
      synced: false,
      environment,
      eventId: data.event_id,
      eventType: data.event_type,
      reason: 'environment_not_allowed',
      allowedEnvironments,
    }, { status: 202 });
  }

  setImmediate(() => {
    void processSongfinchWebhook(data).catch((error) => {
      console.error('[gemfinder] songfinch webhook processing failed', {
        eventId: data.event_id,
        eventType: data.event_type,
        environment,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });

  return NextResponse.json({
    ok: true,
    accepted: true,
    queued: true,
    environment,
    eventId: data.event_id,
    eventType: data.event_type,
    allowedEnvironments,
  });
}
