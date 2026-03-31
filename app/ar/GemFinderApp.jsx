"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";

/* ═══════════════════════════════════════════════════════════
   GEM FINDER v7 - AI-Powered A&R Management System
   + Team Assignment + Model Routing + Reply Intelligence
   ═══════════════════════════════════════════════════════════ */

const STAGES = [
  { id: "prospect", label: "Prospect", icon: "◎", description: "Target is identified but not worked yet." },
  { id: "drafted", label: "Draft Ready", icon: "✎", description: "Initial message is ready to send." },
  { id: "sent", label: "Sent", icon: "→", description: "First outreach has gone out." },
  { id: "replied", label: "Replied", icon: "←", description: "The artist or team has responded." },
  { id: "engaged", label: "Engaged", icon: "◆", description: "There is active interest and momentum." },
  { id: "won", label: "Won", icon: "★", description: "Positive close or platform conversion." },
  { id: "live", label: "Live", icon: "⬢", description: "Profile is fully set up and active on platform." },
  { id: "dead", label: "Dead", icon: "✕", description: "Closed out or not moving forward." },
];
const SM = Object.fromEntries(STAGES.map(s => [s.id, s]));
const KICKOFF_STAGE_ACTIONS = [
  { id: "prospect", label: "Prospect" },
  { id: "sent", label: "Contacted" },
  { id: "engaged", label: "Engaged" },
  { id: "won", label: "Onboarding" },
  { id: "live", label: "Live" },
];
const PROJECT_TYPES = [
  { id: "ar", label: "A&R" },
  { id: "marketing", label: "Marketing" },
  { id: "curator", label: "Curator" },
];
const DEFAULT_WORKSPACE = {
  id: "songfinch",
  name: "Songfinch",
  slug: "songfinch",
};
const MARKETING_STATUSES = [
  { id: "prospect", label: "Prospect", icon: "◎", description: "Talent is identified for the campaign but has not replied yet." },
  { id: "contacted", label: "Contacted", icon: "→", description: "The campaign ask has been sent to the talent." },
  { id: "interested", label: "Interested", icon: "◆", description: "They replied about the opportunity." },
  { id: "creating", label: "Creating", icon: "✦", description: "They accepted and are making the content." },
  { id: "reviewing", label: "Reviewing", icon: "◌", description: "The content is in review with the team." },
  { id: "revising", label: "Revising", icon: "↺", description: "Changes are being made after review." },
  { id: "editing", label: "Editing", icon: "✂", description: "Greg or the editors are shaping the final content." },
  { id: "complete", label: "Complete", icon: "✓", description: "The deliverable is complete." },
  { id: "rejected", label: "Rejected", icon: "✕", description: "The talent passed on the opportunity." },
];
const MARKETING_DELIVERABLE_TYPES = ["UGC", "VO", "MIXED"];
const MM = Object.fromEntries(MARKETING_STATUSES.map(s => [s.id, s]));
const VALID_MARKETING_STATUS_IDS = new Set(MARKETING_STATUSES.map(s => s.id));
const MARKETING_SLACK_NOTIFY_STATUS_IDS = new Set(["contacted", "interested", "creating", "reviewing", "revising", "editing", "complete", "rejected"]);
const VALID_STAGE_IDS = new Set(STAGES.map(s => s.id));
const CONTACTED_STAGE_IDS = ["sent", "replied", "engaged", "won", "live"];
const REPLIED_STAGE_IDS = ["replied", "engaged", "won", "live"];
const ENGAGED_STAGE_IDS = ["engaged", "won", "live"];
const WON_STAGE_IDS = ["won", "live"];
const CLOSED_STAGE_IDS = ["won", "live", "dead"];
const OPEN_STAGE_IDS = STAGES.map(s => s.id).filter(id => !CLOSED_STAGE_IDS.includes(id));
const DETAIL_TAB_IDS = new Set(["overview", "outreach", "inbox", "activity"]);
const CURATOR_DETAIL_TAB_IDS = new Set(["overview", "activity"]);
const MARKETING_TRAFFIC_TYPES = ["Paid", "Organic"];
const MARKETING_CHANNELS = ["Instagram", "TikTok", "YouTube", "Meta", "X", "Email", "Other"];
const MARKETING_TALENT_TYPES = ["Internal Artist", "External Artist", "Content Creator", "AI UGC"];
const EMPTY_CURATED_ARTIST_SLOTS = Array.from({ length: 10 }, () => "");
const TALENT_SOURCE_LABELS = {
  legacy_roster: "Legacy roster",
  ar_pipeline: "A&R pipeline",
  curator_pipeline: "Curator pipeline",
  songfinch: "Songfinch",
  manual: "Manual",
};
const TALENT_LIFECYCLE_LABELS = {
  pre_live: "Pre-Live",
  live: "Live",
  inactive: "Inactive",
  retired: "Retired",
};

function emptyMarketingForm() {
  return {
    id: "",
    talentName: "",
    talentType: "Internal Artist",
    title: "",
    campaign: "",
    newCampaign: "",
    trafficType: "Organic",
    channels: ["Instagram"],
    deliverableType: "UGC",
    status: "prospect",
    owner: "",
    dueDate: "",
    email: "",
    instagramHandle: "",
    instagramUrl: "",
    instagramFollowers: "",
    tiktokHandle: "",
    tiktokUrl: "",
    tiktokFollowers: "",
    spotifyUrl: "",
    spotifyMonthlyListeners: "",
    briefUrl: "",
    contentUrl: "",
    notes: "",
    rejectedReason: "",
  };
}

function workspaceRoleLabel(role = "") {
  switch (String(role || "").trim()) {
    case "kickoff_ar":
      return "Kickoff · Artist";
    case "kickoff_curator":
      return "Kickoff · Curator";
    case "live_marketing":
      return "Live Roster · Marketing";
    default:
      return "Workspace";
  }
}

function defaultWorkspaceRoleForProjectType(type = "ar") {
  const normalized = normalizeProjectType(type);
  if (normalized === "marketing") return "live_marketing";
  if (normalized === "curator") return "kickoff_curator";
  return "kickoff_ar";
}

function normalizeWorkspaceRole(role = "", type = "ar") {
  const raw = String(role || "").trim().toLowerCase();
  if (["kickoff_ar", "kickoff_curator", "live_marketing"].includes(raw)) return raw;
  return defaultWorkspaceRoleForProjectType(type);
}

const SEQUENCES = [
  {
    id: "fast_dm",
    name: "DM Plan (2 touches)",
    steps: [
      { id: "dm_intro", label: "First DM", channel: "dm", delayDays: 0 },
      { id: "dm_followup", label: "DM follow-up", channel: "dm", delayDays: 3 },
    ],
  },
  {
    id: "email_3step",
    name: "Email Plan (3 touches)",
    steps: [
      { id: "em_intro", label: "First email", channel: "email", delayDays: 0 },
      { id: "em_followup_1", label: "Email follow-up #1", channel: "email", delayDays: 4 },
      { id: "em_followup_2", label: "Email follow-up #2", channel: "email", delayDays: 10 },
    ],
  },
  {
    id: "hybrid",
    name: "DM + Email Plan",
    steps: [
      { id: "hy_dm_intro", label: "First DM", channel: "dm", delayDays: 0 },
      { id: "hy_email", label: "Email pitch", channel: "email", delayDays: 1 },
      { id: "hy_dm_followup", label: "DM Follow-up", channel: "dm", delayDays: 4 },
      { id: "hy_email_last", label: "Final email follow-up", channel: "email", delayDays: 7 },
    ],
  },
];
const SEQ_MAP = Object.fromEntries(SEQUENCES.map(s => [s.id, s]));

const DEFAULT_TEAM_USERS = ["Greg", "Vinny", "Brad", "Jen", "JB"];
const ALL_USER_VIEW = "__all__";
const UNASSIGNED_USER_VIEW = "__unassigned__";

const AI_PROVIDERS = [
  { id: "anthropic", label: "Anthropic" },
  { id: "openai", label: "OpenAI" },
  { id: "google", label: "Google Gemini" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "groq", label: "Groq / Llama" },
];

const AI_PROVIDER_LABELS = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google Gemini",
  deepseek: "DeepSeek",
  groq: "Groq / Llama",
};

const AI_MODEL_OPTIONS = {
  anthropic: [
    { id: "claude-3-5-haiku-latest", label: "Haiku (fast)" },
    { id: "claude-sonnet-4-20250514", label: "Sonnet (balanced)" },
    { id: "claude-opus-4-20250514", label: "Opus (deep)" },
  ],
  openai: [
    { id: "gpt-4.1-mini", label: "GPT-4.1 mini (fast)" },
    { id: "gpt-4.1", label: "GPT-4.1 (balanced)" },
    { id: "gpt-5", label: "GPT-5 (deep)" },
  ],
  google: [
    { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite (fast)" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (balanced)" },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro (deep)" },
  ],
  deepseek: [
    { id: "deepseek-chat", label: "DeepSeek Chat (balanced)" },
    { id: "deepseek-reasoner", label: "DeepSeek Reasoner (deep)" },
  ],
  groq: [
    { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B (fast)" },
    { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B (balanced)" },
    { id: "meta-llama/llama-4-scout-17b-16e-instruct", label: "Llama 4 Scout (deep)" },
  ],
};

const DEFAULT_AI_MODELS = {
  anthropic: {
    intel: "claude-sonnet-4-20250514",
    drafts: "claude-sonnet-4-20250514",
    discovery: "claude-sonnet-4-20250514",
    reply: "claude-3-5-haiku-latest",
    followup: "claude-sonnet-4-20250514",
  },
  openai: {
    intel: "gpt-4.1",
    drafts: "gpt-4.1",
    discovery: "gpt-4.1",
    reply: "gpt-4.1-mini",
    followup: "gpt-4.1",
  },
  google: {
    intel: "gemini-2.5-flash",
    drafts: "gemini-2.5-flash",
    discovery: "gemini-2.5-flash",
    reply: "gemini-2.5-flash-lite",
    followup: "gemini-2.5-flash",
  },
  deepseek: {
    intel: "deepseek-chat",
    drafts: "deepseek-chat",
    discovery: "deepseek-chat",
    reply: "deepseek-chat",
    followup: "deepseek-reasoner",
  },
  groq: {
    intel: "llama-3.3-70b-versatile",
    drafts: "llama-3.3-70b-versatile",
    discovery: "llama-3.3-70b-versatile",
    reply: "llama-3.1-8b-instant",
    followup: "meta-llama/llama-4-scout-17b-16e-instruct",
  },
};

const DEFAULT_DRAFT_GUARDRAILS = {
  enabled: true,
  strict: true,
  minDmWords: 120,
  minEmailWords: 150,
  minWarmWords: 110,
  requireQuestion: true,
  requirePersonalization: true,
};

const DEFAULT_LAYOUT = {
  showHealth: false,
  showModels: false,
  showTeam: false,
  showQueue: true,
  showFunnel: false,
  showAB: false,
  showFilters: true,
};

const DRAFT_PLATFORMS = [
  { id: "instagram_dm", label: "Instagram DM", channel: "dm" },
  { id: "tiktok_dm", label: "TikTok DM", channel: "dm" },
  { id: "x_dm", label: "X DM", channel: "dm" },
  { id: "linkedin_dm", label: "LinkedIn DM", channel: "dm" },
  { id: "email", label: "Email", channel: "email" },
];

const LT = {
  bg: "#f3f6fb", sf: "#ffffff", sa: "#f7f9fd", sh: "#eef3fb", bd: "#e3e9f3", bl: "#cad6ea",
  tx: "#111827", ts: "#5f6b84", tt: "#8a94aa",
  ac: "#2563eb", al: "#eaf1ff", am: "#4f7ff3", at: "#1e40af",
  gn: "#1f9d6a", gb: "#e9f8f1", gd: "#a6e2c9",
  lv: "#0f766e", lvb: "#e7fbf8", lvd: "#a6ebe2",
  bu: "#1a73e8", bb: "#e8f0fe", bd2: "#afc9f7",
  rd: "#dc3f35", rb: "#fdeceb", rbd: "#f6bab6",
  ab: "#d97706", abb: "#fff4e6", abd: "#f4d09a",
  pr: "#0ea5a5", pb: "#e6f8f8", pbd: "#9edede",
  sw: "0 4px 12px rgba(30, 41, 59, 0.06)", sm: "0 14px 30px rgba(30, 41, 59, 0.1)", cb: "#ffffff",
};
const DK = {
  bg: "#0b1220", sf: "#111a2b", sa: "#162238", sh: "#1b2a43", bd: "#263754", bl: "#31466d",
  tx: "#e6edf9", ts: "#9eb1d0", tt: "#7487aa",
  ac: "#5b8bff", al: "#1c2f55", am: "#759cff", at: "#b3ccff",
  gn: "#35c58b", gb: "#102d24", gd: "#1e5a48",
  lv: "#2dd4bf", lvb: "#123633", lvd: "#2c6f67",
  bu: "#6ea8ff", bb: "#132c52", bd2: "#23467c",
  rd: "#ff8c84", rb: "#371616", rbd: "#6a2c2c",
  ab: "#ffc063", abb: "#3b2a0f", abd: "#78552c",
  pr: "#59d7d7", pb: "#123335", pbd: "#2e6468",
  sw: "0 4px 12px rgba(0,0,0,0.32)", sm: "0 14px 32px rgba(0,0,0,0.45)", cb: "#101b2f",
};

const ACCENT_PRESETS = {
  blue: {
    label: "Blue",
    light: { ac: "#2563eb", al: "#eaf1ff", am: "#4f7ff3", at: "#1e40af" },
    dark: { ac: "#5b8bff", al: "#1c2f55", am: "#759cff", at: "#b3ccff" },
  },
  emerald: {
    label: "Emerald",
    light: { ac: "#059669", al: "#e9fbf3", am: "#10b981", at: "#047857" },
    dark: { ac: "#34d399", al: "#11382d", am: "#6ee7b7", at: "#c6f7e2" },
  },
  teal: {
    label: "Teal",
    light: { ac: "#0f766e", al: "#e7fbf8", am: "#14b8a6", at: "#115e59" },
    dark: { ac: "#2dd4bf", al: "#123633", am: "#5eead4", at: "#baf7ef" },
  },
  amber: {
    label: "Amber",
    light: { ac: "#d97706", al: "#fff4e6", am: "#f59e0b", at: "#92400e" },
    dark: { ac: "#ffc063", al: "#3b2a0f", am: "#ffd48f", at: "#ffe4ba" },
  },
  rose: {
    label: "Rose",
    light: { ac: "#e11d48", al: "#fff0f4", am: "#fb7185", at: "#be123c" },
    dark: { ac: "#fb7185", al: "#3f1722", am: "#fda4af", at: "#ffd4dc" },
  },
  violet: {
    label: "Violet",
    light: { ac: "#7c3aed", al: "#f3edff", am: "#8b5cf6", at: "#5b21b6" },
    dark: { ac: "#a78bfa", al: "#27163f", am: "#c4b5fd", at: "#e5ddff" },
  },
};

function applyAccentTheme(baseTheme, accentId = "blue", darkMode = false) {
  const preset = ACCENT_PRESETS[accentId] || ACCENT_PRESETS.blue;
  return {
    ...baseTheme,
    ...(darkMode ? preset.dark : preset.light),
  };
}

const AB_VARIANTS = {
  dm: [
    {
      id: "A",
      label: "Song-first hook",
      open: ({ fn, ht, hk }) => ht
        ? `Hey ${fn}, Greg here from Songfinch. "${ht}" is what put you on my radar.`
        : `Hey ${fn}, Greg here from Songfinch. I have been spending time with ${hk}.`,
    },
    {
      id: "B",
      label: "Outcome-first hook",
      open: ({ fn }) => `Hey ${fn}, Greg here from Songfinch. Quick idea for your top fans and a clean revenue lane.`,
    },
    {
      id: "C",
      label: "Proof-first hook",
      open: ({ fn }) => `Hey ${fn}, Greg here from Songfinch. We have paid out $50M+ to artists and I think you could be a strong fit.`,
    },
  ],
  email: [
    {
      id: "A",
      label: "Direct fan lane",
      subject: ({ a }) => `${a.n} x Songfinch: direct fan collaboration lane`,
      lead: () => `Greg here, Head of Content & Partnerships at Songfinch.`,
    },
    {
      id: "B",
      label: "Premium fan monetization",
      subject: ({ a }) => `${a.n}: premium monetization from top fan demand`,
      lead: () => `Greg here from Songfinch. Reaching out with a direct monetization lane that does not interfere with release schedules.`,
    },
    {
      id: "C",
      label: "Partnership invite",
      subject: ({ a }) => `Partnership conversation: ${a.n} x Songfinch`,
      lead: () => `Greg here from Songfinch. I wanted to reach out directly with a partnership idea.`,
    },
  ],
};

function sc(id, C) { return { prospect: C.tt, drafted: C.ab, sent: C.bu, replied: C.gn, engaged: C.pr, won: C.ac, live: C.lv, dead: C.rd }[id] || C.tt; }
function sb(id, C) { return { prospect: C.sa, drafted: C.abb, sent: C.bb, replied: C.gb, engaged: C.pb, won: C.al, live: C.lvb, dead: C.rb }[id] || C.sa; }
function normalizeStageId(stage) {
  if (stage === "researched") return "drafted";
  if (VALID_STAGE_IDS.has(stage)) return stage;
  return "prospect";
}
function normalizeProjectType(type) {
  const normalized = String(type || "").toLowerCase();
  if (normalized === "marketing") return "marketing";
  if (normalized === "curator") return "curator";
  return "ar";
}
function projectTypeLabel(type) {
  switch (normalizeProjectType(type)) {
    case "marketing":
      return "Marketing";
    case "curator":
      return "Curator";
    default:
      return "A&R";
  }
}
function normalizeMarketingStatus(status) {
  const normalized = String(status || "").toLowerCase();
  return VALID_MARKETING_STATUS_IDS.has(normalized) ? normalized : "prospect";
}
function parseCSVGrid(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      row.push(value);
      value = "";
      continue;
    }
    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }
    value += ch;
  }
  if (value.length || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows
    .map(cols => cols.map(col => String(col || "").trim()))
    .filter(cols => cols.some(col => col));
}
function splitMultiValueField(value) {
  if (Array.isArray(value)) return value.map(item => String(item || "").trim()).filter(Boolean);
  const raw = String(value || "").trim();
  if (!raw) return [];
  return raw
    .split(/\s*(?:\n|;|\|)\s*|\s*,\s*/g)
    .map(item => item.trim())
    .filter(Boolean);
}
function normalizeCuratedArtists(value) {
  return splitMultiValueField(value).slice(0, 10);
}
function curatedArtistSlots(value) {
  const normalized = normalizeCuratedArtists(value);
  return EMPTY_CURATED_ARTIST_SLOTS.map((_, index) => normalized[index] || "");
}
function uniqStrings(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}
function normalizeTeamUsers(values = []) {
  const seen = new Set();
  return values
    .map(value => String(value || "").trim())
    .filter(Boolean)
    .filter(value => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
function normalizeMarketingChannels(value) {
  const aliasMap = {
    instagram: "Instagram",
    ig: "Instagram",
    tiktok: "TikTok",
    tik_tok: "TikTok",
    youtube: "YouTube",
    yt: "YouTube",
    meta: "Meta",
    facebook: "Meta",
    fb: "Meta",
    x: "X",
    twitter: "X",
    email: "Email",
    mail: "Email",
    other: "Other",
  };
  return uniqStrings(
    splitMultiValueField(value)
      .map(item => {
        const normalized = String(item || "").trim();
        if (!normalized) return "";
        const key = normalized.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
        return aliasMap[key] || MARKETING_CHANNELS.find(channel => channel.toLowerCase() === normalized.toLowerCase()) || titleCaseWords(normalized);
      })
      .filter(channel => MARKETING_CHANNELS.includes(channel))
  );
}
function normalizeMarketingCampaigns(value) {
  return uniqStrings(splitMultiValueField(value).map(item => item.replace(/\s+/g, " ").trim()));
}
function parseMarketingBulkTalent(value) {
  const raw = String(value || "").replace(/\s+/g, " ").trim();
  if (!raw) return { talentName: "", email: "" };
  const emailMatch = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const email = emailMatch ? emailMatch[0].trim().toLowerCase() : "";
  let talentName = raw;
  if (email) {
    talentName = raw
      .replace(email, " ")
      .replace(/\s*(?:—|–|-|<|>|\(|\)|\[|\]|:)\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return { talentName: talentName || raw, email };
}
function normalizeMarketingCampaignBank(value) {
  return normalizeMarketingCampaigns(Array.isArray(value) ? value : String(value || ""));
}
function normalizeMarketingGroup(value, index = 0, validAssignmentIds = []) {
  const name = String(value?.name || "").replace(/\s+/g, " ").trim();
  if (!name) return null;
  const validSet = new Set((validAssignmentIds || []).map(id => String(id || "")));
  const assignmentIds = uniqStrings(
    Array.isArray(value?.assignmentIds)
      ? value.assignmentIds.map(id => String(id || "").trim())
      : []
  ).filter(id => !validSet.size || validSet.has(id));
  return {
    id: String(value?.id || `mg_${index}_${canonicalArtistName(name) || "group"}`),
    name,
    assignmentIds,
    createdAt: value?.createdAt || "",
    updatedAt: value?.updatedAt || value?.createdAt || "",
  };
}
function normalizeMarketingGroups(value = [], validAssignmentIds = []) {
  const groups = Array.isArray(value) ? value : [];
  const seen = new Set();
  return groups
    .map((group, index) => normalizeMarketingGroup(group, index, validAssignmentIds))
    .filter(group => {
      if (!group || seen.has(group.id)) return false;
      seen.add(group.id);
      return true;
    });
}
function marketingChannelsLabel(item) {
  const channels = Array.isArray(item?.channels) ? item.channels : [];
  return channels.length ? channels.join(", ") : "No channels";
}
function marketingCampaignsLabel(item) {
  const campaigns = Array.isArray(item?.campaigns) ? item.campaigns : [];
  return campaigns.length ? campaigns.join(", ") : "No campaign";
}
function normalizeFollowerCount(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const digits = raw.replace(/[^\d.]/g, "");
  if (!digits) return "";
  const parsed = Number(digits);
  if (!Number.isFinite(parsed)) return "";
  return String(Math.round(parsed));
}
function marketingShowsDue(item) {
  return item?.status !== "complete" && item?.status !== "rejected";
}
function marketingDueLabel(item, now = new Date()) {
  if (!item?.dueDate || !marketingShowsDue(item)) return "";
  const today = operationalTodayISOFor(now);
  if (item.dueDate < today) return `Due ${sD(item.dueDate)}`;
  if (item.dueDate === today) return "Due today";
  return `Due ${sD(item.dueDate)}`;
}
function marketingImportKey(item) {
  const campaigns = (item.campaigns || []).map(canonicalArtistName).sort().join("|");
  const channels = (item.channels || []).map(channel => channel.toLowerCase()).sort().join("|");
  return [
    canonicalArtistName(item.talentName || ""),
    canonicalArtistName(item.title || ""),
    campaigns,
    channels,
    String(item.deliverableType || "").toLowerCase(),
    String(item.email || "").toLowerCase(),
  ].join("::");
}
function marketingDuplicateKey(item) {
  const normalized = normalizeMarketingItem(item);
  return [
    marketingImportKey(normalized),
    String(normalized.status || "").toLowerCase(),
    String(normalized.owner || "").trim().toLowerCase(),
    String(normalized.dueDate || "").trim(),
    String(normalized.trafficType || "").toLowerCase(),
    String(normalized.notes || "").trim().toLowerCase(),
    String(normalized.rejectedReason || "").trim().toLowerCase(),
    String(normalized.briefUrl || "").trim().toLowerCase(),
    String(normalized.contentUrl || "").trim().toLowerCase(),
  ].join("::");
}
function marketingItemRichnessScore(item) {
  const normalized = normalizeMarketingItem(item);
  const values = [
    normalized.email,
    normalized.instagramHandle,
    normalized.instagramUrl,
    normalized.instagramFollowers,
    normalized.tiktokHandle,
    normalized.tiktokUrl,
    normalized.tiktokFollowers,
    normalized.spotifyUrl,
    normalized.spotifyMonthlyListeners,
    normalized.briefUrl,
    normalized.contentUrl,
    normalized.notes,
    normalized.rejectedReason,
    normalized.owner,
    normalized.dueDate,
  ];
  return values.reduce((score, value) => score + (String(value || "").trim() ? 1 : 0), 0);
}
function compareMarketingItemStrength(a, b) {
  const scoreDiff = marketingItemRichnessScore(a) - marketingItemRichnessScore(b);
  if (scoreDiff !== 0) return scoreDiff;
  const updatedDiff = new Date(a?.updatedAt || a?.createdAt || 0).getTime() - new Date(b?.updatedAt || b?.createdAt || 0).getTime();
  if (updatedDiff !== 0) return updatedDiff;
  return new Date(a?.createdAt || 0).getTime() - new Date(b?.createdAt || 0).getTime();
}
function mergeMarketingImportedItem(existingItem, importedItem, teamUsers = DEFAULT_TEAM_USERS) {
  const existing = normalizeMarketingItem(existingItem, teamUsers);
  const incoming = normalizeMarketingItem(importedItem, teamUsers);
  const mergedCampaigns = normalizeMarketingCampaigns([...(existing.campaigns || []), ...(incoming.campaigns || [])]);
  const mergedChannels = normalizeMarketingChannels([...(existing.channels || []), ...(incoming.channels || [])]);
  const chooseEnriched = (current, next) => String(next || "").trim() || String(current || "").trim();
  const chooseOperational = (current, next) => String(current || "").trim() || String(next || "").trim();
  const nextTrafficType = existing.trafficType && existing.trafficType !== "Organic"
    ? existing.trafficType
    : (incoming.trafficType || existing.trafficType || "Organic");
  const nextDeliverableType = existing.deliverableType && existing.deliverableType !== "UGC"
    ? existing.deliverableType
    : (incoming.deliverableType || existing.deliverableType || "UGC");
  const merged = normalizeMarketingItem({
    ...existing,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
    talentName: chooseOperational(existing.talentName, incoming.talentName),
    talentType: chooseOperational(existing.talentType, incoming.talentType),
    title: chooseOperational(existing.title, incoming.title),
    campaigns: mergedCampaigns,
    campaign: mergedCampaigns[0] || "",
    trafficType: nextTrafficType,
    channels: mergedChannels,
    channel: mergedChannels[0] || "",
    deliverableType: nextDeliverableType,
    status: existing.status || incoming.status,
    owner: chooseOperational(existing.owner, incoming.owner),
    dueDate: chooseOperational(existing.dueDate, incoming.dueDate),
    email: chooseEnriched(existing.email, incoming.email),
    instagramUrl: chooseEnriched(existing.instagramUrl, incoming.instagramUrl),
    instagramHandle: chooseEnriched(existing.instagramHandle, incoming.instagramHandle),
    instagramFollowers: chooseEnriched(existing.instagramFollowers, incoming.instagramFollowers),
    tiktokUrl: chooseEnriched(existing.tiktokUrl, incoming.tiktokUrl),
    tiktokHandle: chooseEnriched(existing.tiktokHandle, incoming.tiktokHandle),
    tiktokFollowers: chooseEnriched(existing.tiktokFollowers, incoming.tiktokFollowers),
    spotifyUrl: chooseEnriched(existing.spotifyUrl, incoming.spotifyUrl),
    spotifyMonthlyListeners: chooseEnriched(existing.spotifyMonthlyListeners, incoming.spotifyMonthlyListeners),
    briefUrl: chooseEnriched(existing.briefUrl, incoming.briefUrl),
    contentUrl: chooseEnriched(existing.contentUrl, incoming.contentUrl),
    notes: chooseOperational(existing.notes, incoming.notes),
    rejectedReason: chooseOperational(existing.rejectedReason, incoming.rejectedReason),
  }, teamUsers);
  const changed = JSON.stringify(merged) !== JSON.stringify(existing);
  return { merged, changed };
}
function csvRowValue(row, headers, aliases = []) {
  for (const alias of aliases) {
    const match = headers.find(key => key === alias || key.replace(/[^a-z0-9]/g, "") === alias.replace(/[^a-z0-9]/g, ""));
    if (match && row[match]) return row[match];
  }
  return "";
}
function parseMarketingCSV(text, teamUsers = DEFAULT_TEAM_USERS) {
  const rows = parseCSVGrid(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map(header => String(header || "").trim().toLowerCase());
  const records = [];
  const seen = new Set();
  const normalizeHeaderRow = cols => {
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = String(cols[idx] || "").trim();
    });
    return row;
  };
  for (let i = 1; i < rows.length; i++) {
    const row = normalizeHeaderRow(rows[i]);
    const talentName = csvRowValue(row, headers, ["talentname", "talent_name", "artistname", "artist_name", "artist", "creatorname", "creator_name", "name"]).trim();
    if (!talentName) continue;
    const email = csvRowValue(row, headers, ["contactemail", "contact_email", "primaryemail", "primary_email", "email"]).trim();
    const instagramValue = csvRowValue(row, headers, ["instagramhandle", "instagram_handle", "instagramurl", "instagram_url", "instagram", "ig"]);
    const tiktokValue = csvRowValue(row, headers, ["tiktokhandle", "tiktok_handle", "tiktokurl", "tiktok_url", "tiktok"]);
    const spotifyValue = csvRowValue(row, headers, ["spotifyurl", "spotify_url", "spotifyprofile", "spotify_profile", "spotify"]);
    const campaigns = normalizeMarketingCampaigns(
      csvRowValue(row, headers, ["campaigns", "campaign", "campaignname", "campaign_name"])
    );
    const channels = normalizeMarketingChannels(
      csvRowValue(row, headers, ["channels", "channel", "platforms", "platform"])
    );
    const trafficValue = csvRowValue(row, headers, ["traffictype", "traffic_type", "traffic", "paidorganic", "paid_organic"]);
    const statusValue = csvRowValue(row, headers, ["status", "campaignstatus", "campaign_status", "artiststatus", "artist_status"]);
    const talentTypeValue = csvRowValue(row, headers, ["talenttype", "talent_type", "artisttype", "artist_type", "type"]);
    const commonFields = {
      talentName,
      talentType: MARKETING_TALENT_TYPES.find(type => type.toLowerCase() === String(talentTypeValue || "").toLowerCase()) || "Internal Artist",
      title: csvRowValue(row, headers, ["title", "deliverabletitle", "deliverable_title", "contenttitle", "content_title", "deliverable", "assettitle", "asset_title"]).trim(),
      trafficType: MARKETING_TRAFFIC_TYPES.find(type => type.toLowerCase() === String(trafficValue || "").toLowerCase()) || "Organic",
      channels,
      deliverableType: csvRowValue(row, headers, ["deliverabletype", "deliverable_type", "contenttype", "content_type", "assettype", "asset_type", "format"]).trim() || "UGC",
      status: normalizeMarketingStatus(statusValue),
      owner: teamUsers.includes(csvRowValue(row, headers, ["owner", "internaluser", "internal_user", "assignee"]).trim())
        ? csvRowValue(row, headers, ["owner", "internaluser", "internal_user", "assignee"]).trim()
        : "",
      dueDate: csvRowValue(row, headers, ["duedate", "due_date", "due", "deadline"]).trim(),
      email: email.includes("@") ? email : "",
      instagramUrl: /instagram\.com/i.test(instagramValue) ? instagramValue.trim() : "",
      instagramHandle: normalizeSocialHandle(instagramValue),
      instagramFollowers: normalizeFollowerCount(csvRowValue(row, headers, ["instagramfollowers", "instagram_followers", "igfollowers", "ig_followers"])),
      tiktokUrl: /tiktok\.com/i.test(tiktokValue) ? tiktokValue.trim() : "",
      tiktokHandle: normalizeSocialHandle(tiktokValue),
      tiktokFollowers: normalizeFollowerCount(csvRowValue(row, headers, ["tiktokfollowers", "tiktok_followers"])),
      spotifyUrl: /spotify\.com/i.test(spotifyValue) ? spotifyValue.trim() : "",
      spotifyMonthlyListeners: normalizeFollowerCount(csvRowValue(row, headers, ["spotifymonthlylisteners", "spotify_monthly_listeners", "monthlylisteners", "monthly_listeners"])),
      briefUrl: csvRowValue(row, headers, ["briefurl", "brief_url", "brieflink", "brief_link"]).trim(),
      contentUrl: csvRowValue(row, headers, ["contenturl", "content_url", "contentlink", "content_link", "asseturl", "asset_url", "posturl", "post_url", "videourl", "video_url", "photourl", "photo_url"]).trim(),
      notes: csvRowValue(row, headers, ["notes", "note", "description", "briefnotes", "brief_notes"]).trim(),
    };
    const campaignBuckets = campaigns.length ? campaigns : [""];
    campaignBuckets.forEach(campaign => {
      const item = normalizeMarketingItem({
        ...commonFields,
        campaign,
        campaigns: campaign ? [campaign] : [],
      }, teamUsers);
      const key = marketingImportKey(item);
      if (seen.has(key)) return;
      seen.add(key);
      records.push(item);
    });
  }
  return records;
}
function parseMarketingBulkUpdateText(text, defaultCampaign = "", defaultStatus = "prospect", defaultOwner = "", teamUsers = DEFAULT_TEAM_USERS) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) return [];

  const csvLike = lines[0].includes(",") && !lines[0].includes("|");
  const pipeLike = lines[0].includes("|");
  const tabLike = lines[0].includes("\t");

  const normalizeHeader = value => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const isHeaderRow = cols => {
    const normalized = cols.map(normalizeHeader);
    return normalized.some(col => ["name", "talentname", "artistname", "artist"].includes(col))
      && normalized.some(col => ["campaign", "campaignname"].includes(col));
  };
  const rowFromCells = (cells, lineNumber, headerMap = null) => {
    const get = aliases => {
      if (!headerMap) return "";
      const key = Object.keys(headerMap).find(header => aliases.includes(normalizeHeader(header)));
      return key ? String(headerMap[key] || "").trim() : "";
    };
    const positional = index => String(cells[index] || "").trim();
    const parsedTalent = parseMarketingBulkTalent(get(["name", "talentname", "artistname", "artist", "talent"]) || positional(0));
    if (!parsedTalent.talentName) return null;
    const parsedEmail = (get(["email", "contactemail", "contact_email", "primaryemail", "primary_email"]) || "").trim().toLowerCase();
    const parsedOwner = (get(["owner", "assignee", "internaluser", "internal_user"]) || positional(3) || defaultOwner || "").trim();
    return {
      lineNumber,
      talentName: parsedTalent.talentName,
      email: parsedEmail || parsedTalent.email,
      campaign: (get(["campaign", "campaignname"]) || positional(1) || defaultCampaign || "").trim(),
      status: normalizeMarketingStatus(get(["status", "stage"]) || positional(2) || defaultStatus || "prospect"),
      owner: teamUsers.includes(parsedOwner) ? parsedOwner : parsedOwner,
      raw: cells.map(col => String(col || "").trim()).join(" | "),
    };
  };

  if (csvLike) {
    const grid = parseCSVGrid(raw);
    if (!grid.length) return [];
    const header = isHeaderRow(grid[0]) ? grid[0] : null;
    return grid
      .slice(header ? 1 : 0)
      .map((cells, index) => {
        const headerMap = header ? Object.fromEntries(header.map((key, cellIndex) => [key, cells[cellIndex] || ""])) : null;
        return rowFromCells(cells, index + (header ? 2 : 1), headerMap);
      })
      .filter(Boolean);
  }

  return lines
    .map((line, index) => {
      const cells = pipeLike
        ? line.split("|")
        : tabLike
          ? line.split("\t")
          : line.split(",");
      return rowFromCells(cells, index + 1);
    })
    .filter(Boolean);
}
function normalizeMarketingItem(item, teamUsers = DEFAULT_TEAM_USERS) {
  const normalizedStatus = normalizeMarketingStatus(item?.status);
  const talentName = String(
    item?.talentName ||
    item?.artistName ||
    item?.creatorName ||
    item?.name ||
    item?.title ||
    ""
  ).trim();
  const deliverableRaw = String(item?.deliverableType || "").trim().toUpperCase();
  const deliverableType = MARKETING_DELIVERABLE_TYPES.includes(deliverableRaw) ? deliverableRaw : "UGC";
  const channels = normalizeMarketingChannels(item?.channels?.length ? item.channels : item?.channel || "");
  const campaigns = normalizeMarketingCampaigns(item?.campaigns?.length ? item.campaigns : item?.campaign || "");
  const title = String(item?.title || item?.contentTitle || "").trim() || [talentName, campaigns[0] || deliverableType].filter(Boolean).join(" · ");
  const instagramUrl = String(item?.instagramUrl || item?.instagramURL || "").trim();
  const tiktokUrl = String(item?.tiktokUrl || item?.tiktokURL || "").trim();
  return {
    id: String(item?.id || `mkt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
    talentName,
    talentType: MARKETING_TALENT_TYPES.includes(String(item?.talentType || "")) ? String(item.talentType) : "Internal Artist",
    title,
    campaigns,
    campaign: campaigns[0] || "",
    trafficType: MARKETING_TRAFFIC_TYPES.includes(String(item?.trafficType || "")) ? String(item.trafficType) : "Organic",
    channels,
    channel: channels[0] || "",
    deliverableType,
    status: normalizedStatus,
    owner: teamUsers.includes(String(item?.owner || "")) ? String(item.owner) : String(item?.owner || ""),
    dueDate: String(item?.dueDate || ""),
    email: String(item?.email || "").trim(),
    instagramHandle: normalizeSocialHandle(item?.instagramHandle || item?.instagram || instagramUrl || ""),
    instagramUrl,
    instagramFollowers: normalizeFollowerCount(item?.instagramFollowers || item?.igFollowers || item?.instagram_followers || ""),
    tiktokHandle: normalizeSocialHandle(item?.tiktokHandle || item?.tiktok || tiktokUrl || ""),
    tiktokUrl,
    tiktokFollowers: normalizeFollowerCount(item?.tiktokFollowers || item?.tiktok_followers || ""),
    spotifyUrl: String(item?.spotifyUrl || "").trim(),
    spotifyMonthlyListeners: normalizeFollowerCount(item?.spotifyMonthlyListeners || item?.monthlyListeners || item?.spotify_monthly_listeners || ""),
    briefUrl: String(item?.briefUrl || "").trim(),
    contentUrl: String(item?.contentUrl || "").trim(),
    notes: String(item?.notes || "").trim(),
    rejectedReason: normalizedStatus === "rejected" ? String(item?.rejectedReason || "").trim() : "",
    createdAt: String(item?.createdAt || new Date().toISOString()),
    updatedAt: String(item?.updatedAt || item?.createdAt || new Date().toISOString()),
  };
}
function marketingFormSnapshot(source) {
  const normalizedStatus = normalizeMarketingStatus(source?.status || "prospect");
  return JSON.stringify({
    talentName: String(source?.talentName || "").trim(),
    talentType: String(source?.talentType || "Internal Artist"),
    title: String(source?.title || "").trim(),
    campaign: String(source?.newCampaign || source?.campaign || source?.campaigns?.[0] || "").trim(),
    trafficType: String(source?.trafficType || "Organic"),
    channels: normalizeMarketingChannels(source?.channels?.length ? source.channels : source?.channel || "").sort(),
    deliverableType: String(source?.deliverableType || "UGC").trim().toUpperCase(),
    status: normalizedStatus,
    owner: String(source?.owner || ""),
    dueDate: String(source?.dueDate || ""),
    email: String(source?.email || "").trim().toLowerCase(),
    instagramHandle: normalizeSocialHandle(source?.instagramHandle || source?.instagramUrl || ""),
    instagramUrl: String(source?.instagramUrl || "").trim(),
    instagramFollowers: normalizeFollowerCount(source?.instagramFollowers || ""),
    tiktokHandle: normalizeSocialHandle(source?.tiktokHandle || source?.tiktokUrl || ""),
    tiktokUrl: String(source?.tiktokUrl || "").trim(),
    tiktokFollowers: normalizeFollowerCount(source?.tiktokFollowers || ""),
    spotifyUrl: String(source?.spotifyUrl || "").trim(),
    spotifyMonthlyListeners: normalizeFollowerCount(source?.spotifyMonthlyListeners || ""),
    briefUrl: String(source?.briefUrl || "").trim(),
    contentUrl: String(source?.contentUrl || "").trim(),
    notes: String(source?.notes || "").trim(),
    rejectedReason: normalizedStatus === "rejected" ? String(source?.rejectedReason || "").trim() : "",
  });
}
function marketingItemPrimaryLabel(item) {
  return String(item?.talentName || item?.title || "").trim() || "Untitled assignment";
}
function marketingItemTitleLabel(item) {
  const title = String(item?.title || "").trim();
  const primary = marketingItemPrimaryLabel(item);
  return title && title !== primary ? title : "";
}
function normalizeStageFilterId(filterId) {
  if (filterId === "contacted") return "contacted";
  if (VALID_STAGE_IDS.has(filterId)) return filterId;
  return "all";
}
function isContactedStage(stage) {
  return CONTACTED_STAGE_IDS.includes(stage);
}
function isRepliedStage(stage) {
  return REPLIED_STAGE_IDS.includes(stage);
}
function isEngagedStage(stage) {
  return ENGAGED_STAGE_IDS.includes(stage);
}
function isWonStage(stage) {
  return WON_STAGE_IDS.includes(stage);
}
function kickoffStageBucket(stages = []) {
  const normalized = uniqStrings((stages || []).map(stage => normalizeStageId(stage)).filter(Boolean));
  if (normalized.some(stage => stage === "live")) return "live";
  if (normalized.some(stage => isWonStage(stage))) return "won";
  if (normalized.some(stage => isEngagedStage(stage))) return "engaged";
  if (normalized.some(stage => isContactedStage(stage))) return "contacted";
  return "prospect";
}
function isClosedStage(stage) {
  return CLOSED_STAGE_IDS.includes(stage);
}
function matchesStageFilter(stage, filterId) {
  if (filterId === "all") return true;
  if (filterId === "contacted") return isContactedStage(stage);
  return stage === filterId;
}
function matchesMarketingStatusFilter(status, filterId) {
  if (filterId === "all") return true;
  if (filterId === "active") return status !== "complete" && status !== "rejected";
  return status === filterId;
}
function marketingStatusTone(status, C) {
  switch (status) {
    case "prospect":
      return { fg: C.tt, bg: C.sa, border: `${C.bd}` };
    case "contacted":
      return { fg: C.bu, bg: C.bb, border: `${C.bu}33` };
    case "interested":
      return { fg: C.ac, bg: C.al, border: `${C.ac}33` };
    case "creating":
      return { fg: C.pr, bg: C.pb, border: `${C.pr}33` };
    case "reviewing":
      return { fg: C.ab, bg: C.abb, border: `${C.ab}33` };
    case "revising":
      return { fg: C.rd, bg: C.rb, border: `${C.rd}33` };
    case "editing":
      return { fg: C.lv, bg: C.lvb, border: `${C.lv}33` };
    case "complete":
      return { fg: C.gn, bg: C.gb, border: `${C.gn}33` };
    case "rejected":
      return { fg: C.rd, bg: C.rb, border: `${C.rd}33` };
    default:
      return { fg: C.ts, bg: C.sa, border: `${C.bd}` };
  }
}

function summarizeMarketingItems(items = [], today = todayISO()) {
  const summary = {
    items: items.length,
    prospect: 0,
    contacted: 0,
    interested: 0,
    creating: 0,
    reviewing: 0,
    revising: 0,
    editing: 0,
    complete: 0,
    rejected: 0,
    active: 0,
    overdue: 0,
    dueSoon: 0,
    campaigns: 0,
  };
  const campaigns = new Set();
  items.forEach(item => {
    const normalized = normalizeMarketingItem(item);
    summary[normalized.status] = (summary[normalized.status] || 0) + 1;
    if (normalized.status !== "complete" && normalized.status !== "rejected") summary.active += 1;
    (normalized.campaigns || []).forEach(campaign => campaigns.add(campaign));
    if (normalized.dueDate && normalized.status !== "complete" && normalized.status !== "rejected") {
      if (normalized.dueDate < today) summary.overdue += 1;
      if (normalized.dueDate >= today && normalized.dueDate <= addDaysISO(today, 7)) summary.dueSoon += 1;
    }
  });
  summary.campaigns = campaigns.size;
  return summary;
}

function summarizeProjectForHub(project, today = todayISO()) {
  const type = normalizeProjectType(project?.type);
  if (type === "marketing") {
    const mk = summarizeMarketingItems(project?.marketingItems || [], today);
    return {
      type,
      title: "Marketing",
      cards: [
        ["Assignments", mk.items, "neutral"],
        ["Prospect", mk.prospect, "accent"],
        ["Contacted", mk.contacted, "accent"],
        ["In Progress", mk.creating + mk.reviewing + mk.revising + mk.editing, "good"],
        ["Complete", mk.complete, "live"],
      ],
      badges: [
        `${mk.campaigns} campaigns`,
        `${mk.overdue} overdue`,
      ],
    };
  }
  if (type === "curator") {
    const pipeline = project?.pipeline || {};
    return {
      type,
      title: "Curator",
      cards: [
        ["Curators", project?.artists?.length || 0, "neutral"],
        ["Contacted", Object.values(pipeline).filter(v => isContactedStage(v?.stage)).length, "accent"],
        ["Engaged", Object.values(pipeline).filter(v => v?.stage === "engaged").length, "good"],
        ["Live", Object.values(pipeline).filter(v => v?.stage === "live").length, "live"],
      ],
      badges: [],
    };
  }
  const pipeline = project?.pipeline || {};
  return {
    type,
    title: "A&R",
    cards: [
      ["Artists", project?.artists?.length || 0, "neutral"],
      ["Contacted", Object.values(pipeline).filter(v => isContactedStage(v?.stage)).length, "accent"],
      ["Replied", Object.values(pipeline).filter(v => isRepliedStage(v?.stage)).length, "good"],
      ["Live", Object.values(pipeline).filter(v => v?.stage === "live").length, "live"],
    ],
    badges: [],
  };
}
function normalizeActorKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function resolveSessionUserName(authEmail, authUserId, teamUsers = DEFAULT_TEAM_USERS) {
  const pool = Array.isArray(teamUsers) && teamUsers.length ? teamUsers : DEFAULT_TEAM_USERS;
  const emailLocal = String(authEmail || "").split("@")[0] || "";
  const raw = emailLocal || authUserId || "";
  const rawKey = normalizeActorKey(raw);
  if (!rawKey) return pool[0] || "Unknown";
  const exact = pool.find(name => normalizeActorKey(name) === rawKey);
  if (exact) return exact;
  const prefix = pool.find(name => rawKey.startsWith(normalizeActorKey(name)) || normalizeActorKey(name).startsWith(rawKey));
  if (prefix) return prefix;
  const first = raw.replace(/[._-]+/g, " ").trim().split(/\s+/)[0] || "";
  const firstKey = normalizeActorKey(first);
  if (firstKey) {
    const firstMatch = pool.find(name => firstKey === normalizeActorKey(name) || firstKey.startsWith(normalizeActorKey(name)) || normalizeActorKey(name).startsWith(firstKey));
    if (firstMatch) return firstMatch;
    return first.charAt(0).toUpperCase() + first.slice(1);
  }
  return pool[0] || "Unknown";
}
function bucketGenre(g) { if (!g) return "Other"; const l = g.toLowerCase(); if (/country|americana|bluegrass/.test(l)) return "Country"; if (/hip.?hop|rap/.test(l)) return "Hip Hop"; if (/r&b|soul|neo.?soul/.test(l)) return "R&B / Soul"; if (/^indie/.test(l)) return "Indie"; if (/folk/.test(l)) return "Folk"; if (/punk|emo|hardcore/.test(l)) return "Punk / Emo"; if (/rock|grunge|metal/.test(l)) return "Rock"; if (/electronic|edm|house|techno|hyperpop|synth/.test(l)) return "Electronic"; if (/pop/.test(l)) return "Pop"; if (/jazz/.test(l)) return "Jazz"; if (/christian|gospel|worship/.test(l)) return "Christian"; if (/latin|reggaeton/.test(l)) return "Latin"; if (/singer.?songwriter/.test(l)) return "Singer-Songwriter"; if (/^alt/.test(l)) return "Alternative"; return "Other"; }
function parseMl(s) { if (!s) return 0; const m = s.replace(/[\,\s]/g, "").match(/([\d.]+)(k|m)?/i); if (!m) return 0; let v = parseFloat(m[1]); if (m[2]?.toLowerCase() === "m") v *= 1e6; else if (m[2]?.toLowerCase() === "k") v *= 1e3; return v; }
function fmtCompact(n) { if (!n || Number.isNaN(n)) return "0"; if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`; if (n >= 1e3) return `${Math.round(n / 1e3)}K`; return `${Math.round(n)}`; }
function pS(a) { let s = 0; const ml = parseMl(a.l); if (ml >= 5e5) s += 3; else if (ml >= 1e5) s += 2; else if (ml >= 1e4) s += 1; if (a.e) s += 2; if (a.soc) s += 1; if (/high|known/i.test(a.h)) s += 1; return s; }
function pT(score, C) { if (score >= 5) return { label: "HOT", color: C.rd, bg: C.rb, border: C.rbd }; if (score >= 3) return { label: "WARM", color: C.ab, bg: C.abb, border: C.abd }; return { label: "COOL", color: C.tt, bg: C.sa, border: C.bd }; }
function parseDateValue(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    const dt = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(raw);
  return Number.isNaN(dt.getTime()) ? null : dt;
}
function rD(iso) {
  const dt = parseDateValue(iso);
  if (!dt) return "";
  const d = Math.floor((Date.now() - dt.getTime()) / 864e5);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function sD(iso) {
  const dt = parseDateValue(iso);
  if (!dt) return "";
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}
function daysBetween(a, b) {
  const start = parseDateValue(a);
  const end = parseDateValue(b);
  if (!start || !end) return 0;
  return Math.floor((end - start) / 864e5);
}
function todayISO() { return new Date().toISOString().slice(0, 10); }
function addDaysISO(iso, days) { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
function operationalDate(now = new Date()) {
  const d = new Date(now);
  if (d.getHours() < 6) d.setDate(d.getDate() - 1);
  d.setHours(0, 0, 0, 0);
  return d;
}
function operationalTodayISO() {
  return operationalDate().toISOString().slice(0, 10);
}
function operationalDateLabel() {
  return operationalDate().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function nowLabel() {
  return new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function operationalDateLabelFor(now) {
  return operationalDate(now).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function nowLabelFor(now) {
  return new Date(now).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function operationalTodayISOFor(now) {
  return operationalDate(now).toISOString().slice(0, 10);
}
function spotifyUrl(name) {
  const clean = (name || "").trim();
  if (!clean) return "https://open.spotify.com/";
  return `https://open.spotify.com/search/${encodeURIComponent(clean)}`;
}
function draftChannelFromKey(k) { if (!k) return "dm"; if (k.includes("email")) return "email"; return "dm"; }
function parseDraftSubject(text, fallback) { const m = (text || "").match(/^Subject:\s*(.+)\n/i); const subject = m ? m[1].trim() : fallback; const body = m ? (text || "").replace(/^Subject:.*\n+/i, "") : (text || ""); return { subject, body }; }
function gmailComposeUrl(to, subject, body) { return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to || "")}&su=${encodeURIComponent(subject || "")}&body=${encodeURIComponent(body || "")}`; }
function outlookComposeUrl(to, subject, body) { return `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(to || "")}&subject=${encodeURIComponent(subject || "")}&body=${encodeURIComponent(body || "")}`; }
function canonicalArtistName(name) {
  return (name || "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(ft|feat|featuring)\b\.?/g, " ")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}
function platformMeta(platformId = "instagram_dm") {
  return DRAFT_PLATFORMS.find(p => p.id === platformId) || DRAFT_PLATFORMS[0];
}

function platformCopyGuide(platformId = "instagram_dm") {
  const map = {
    instagram_dm: "Keep it concise, conversational, and mobile-friendly. 4 to 7 short paragraphs.",
    tiktok_dm: "Keep it short and punchy. Focus on creator-to-fan angle and quick CTA.",
    x_dm: "Keep it direct and compact. Prioritize credibility and one clear ask.",
    linkedin_dm: "Professional tone. Mention business value and low operational lift.",
    email: "Professional full email with clear subject, concise body, and clear CTA.",
  };
  return map[platformId] || "Keep it concise and clear with one CTA.";
}

function normalizeLayout(layout) {
  return { ...DEFAULT_LAYOUT, ...(layout || {}) };
}
function threadNeedsReply(thread) {
  if (!thread) return false;
  if (thread.lastMessageDirection !== "inbound") return false;
  if (!thread.lastInboundAt) return false;
  if (!thread.lastOutboundAt) return true;
  return String(thread.lastOutboundAt) < String(thread.lastInboundAt);
}
function threadIsActionable(thread) {
  if (!thread) return false;
  if (String(thread.status || "open") !== "open") return false;
  return threadNeedsReply(thread);
}
function matchesInboundWindow(thread, days, now = new Date()) {
  if (!thread?.lastInboundAt || days === "all") return true;
  const parsedDays = Number(days);
  if (!Number.isFinite(parsedDays) || parsedDays <= 0) return true;
  const diffMs = new Date(now).getTime() - new Date(thread.lastInboundAt).getTime();
  return diffMs <= parsedDays * 86400000;
}
function titleCaseWords(value) {
  return String(value || "")
    .toLowerCase()
    .split(/[\s/_-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
function parseIntelSections(text) {
  const clean = String(text || "").trim();
  if (!clean) return [];
  return clean
    .split(/\n\s*\n/)
    .map(block => block.trim())
    .filter(Boolean)
    .map((block, idx) => {
      const match = block.match(/^([A-Z][A-Z0-9 /&+\-]{1,80}):\s*([\s\S]*)$/);
      if (match) {
        return {
          id: `intel_${idx}`,
          title: titleCaseWords(match[1]),
          body: String(match[2] || "").trim(),
        };
      }
      return {
        id: `intel_${idx}`,
        title: idx === 0 ? "Summary" : `Insight ${idx + 1}`,
        body: block,
      };
    });
}
function compactText(value, max = 160) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).trim()}...`;
}

function wordsCount(text) {
  return (text || "").trim().split(/\s+/).filter(Boolean).length;
}

function normalizeTrackName(hitTrack) {
  if (!hitTrack) return "";
  return hitTrack.split("(")[0].trim();
}

function cleanHitTrack(hitTrack) {
  const track = normalizeTrackName(hitTrack || "");
  if (!track) return "";
  if (/tbd|high|known|rising|low|presence|n\/a|unknown/i.test(track)) return "";
  if (track.length < 2) return "";
  return track;
}

function firstNameFromArtist(name) {
  if (!name) return "there";
  return name.includes(" ") ? name.split(" ")[0] : name;
}

function listenerBand(listenersRaw) {
  const ml = parseMl(listenersRaw);
  if (ml >= 500000) return "large";
  if (ml >= 100000) return "mid";
  if (ml >= 10000) return "growing";
  if (ml > 0) return "early";
  return "unknown";
}

function genreAngle(bucket) {
  const map = {
    Country: "country fans value direct storytelling and high-touch artist access",
    "Hip Hop": "your fanbase values authenticity and direct artist connection",
    "R&B / Soul": "your audience responds to emotional depth and direct access",
    Indie: "indie audiences pay for authenticity and direct artist connection",
    Folk: "story-led catalogs convert well when fans can collaborate directly",
    Pop: "pop fans engage deeply when they can interact directly with the artist",
    Rock: "rock audiences are loyal and respond to direct artist experiences",
    Electronic: "your community is active online and comfortable with direct digital access",
    "Singer-Songwriter": "storytelling-led listeners are strong direct-collaboration buyers",
    Christian: "faith-based audiences engage deeply with personal artist connection",
    Latin: "your audience is community-driven and highly engaged around artist access",
  };
  return map[bucket] || "your audience is engaged and a strong fit for direct fan commissions";
}

function marketSignalLine(a, bucket) {
  const band = listenerBand(a.l);
  if (band === "large") return `You are already operating at scale, and this can add a premium direct-to-fan lane without touching your release plan.`;
  if (band === "mid") return `You have real momentum, and this can monetize your most engaged fans without adding heavy ops.`;
  if (band === "growing") return `You are in a strong growth window, and this can deepen fan loyalty while adding direct revenue.`;
  if (band === "early") return `You have an early but engaged base, and this can be a clean way to build recurring fan income.`;
  return `This can add a direct revenue lane for your most engaged listeners.`;
}

function fanExperienceLine(bucket) {
  const map = {
    Country: "It gives your core fans direct access to your writing voice in a way streaming alone cannot.",
    "Hip Hop": "It lets top fans collaborate directly with you while you keep full creative control.",
    "R&B / Soul": "It turns emotional fan connection into paid direct collaboration.",
    Indie: "It creates a premium fan-access layer that fits your existing brand.",
    Folk: "It translates your storytelling strength into high-value fan collaboration.",
    Pop: "It creates a paid direct fan lane without changing your release cadence.",
    Rock: "It gives loyal fans direct artist access they cannot get from DSPs alone.",
    Electronic: "It adds a direct fan product that sits cleanly beside your release strategy.",
    "Singer-Songwriter": "It gives story-first fans a direct paid way to collaborate with you.",
    Christian: "It supports community-driven fan relationships while staying fully artist-controlled.",
    Latin: "It opens a premium community-facing fan lane alongside your core releases.",
  };
  return map[bucket] || "It creates a premium direct fan lane while you stay in control.";
}

function artistSignalLine(artist) {
  const track = cleanHitTrack(artist?.h || "");
  const listenersNum = parseMl(artist?.l || "");
  const hasListeners = listenersNum > 0;
  const hasSocial = !!artist?.soc;
  if (track && hasSocial) return `The catalog pull plus the engagement at @${artist.soc} is exactly the signal we look for.`;
  if (track && hasListeners) return `The catalog pull and audience demand are both clearly there.`;
  if (track) return `You have strong catalog pull, which is usually a strong fit for this model.`;
  if (hasListeners && hasSocial) return `You already have clear demand and an active core audience.`;
  if (hasListeners) return `You already have clear listener demand, which makes this lane practical.`;
  if (hasSocial) return `Your social audience is clearly active, which makes this model work well.`;
  if (artist?.loc) return `There is clear momentum around what you are building.`;
  return "";
}

function buildTemplateContext(artist, bucket, platformId = "instagram_dm") {
  const p = platformMeta(platformId);
  const hitTrack = cleanHitTrack(artist?.h || "");
  const firstName = firstNameFromArtist(artist?.n || "");
  const mlRaw = artist?.l || "";
  const ml = parseMl(mlRaw);
  const listeners = ml ? fmtCompact(ml) : (mlRaw || "unknown");
  const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return {
    artist_name: artist?.n || "",
    artist_first_name: firstName,
    first_name: firstName,
    name: artist?.n || "",
    genre: artist?.g || "",
    genre_bucket: bucket || "Other",
    hit_track: hitTrack || "your recent release",
    track: hitTrack || "your recent release",
    listeners,
    monthly_listeners: listeners,
    location: artist?.loc || "your market",
    social_handle: artist?.soc ? `@${artist.soc}` : "",
    email: artist?.e || "",
    platform_label: p.label,
    platform_channel: p.channel.toUpperCase(),
    platform_id: p.id,
    spotify_url: spotifyUrl(artist?.n || ""),
    sender_name: "Greg",
    sender_title: "Head of Content & Partnerships, Songfinch",
    sender_email: "Greg@songfinch.com",
    today,
    date_today: today,
  };
}

function applyTemplateContext(text, context) {
  if (!text) return "";
  let out = text;
  const aliases = {
    artist: "artist_name",
    artist_name_full: "artist_name",
    artist_first: "artist_first_name",
    first: "artist_first_name",
    genre_name: "genre",
    listener_count: "monthly_listeners",
    platform: "platform_label",
    channel: "platform_channel",
    spotify: "spotify_url",
    sender: "sender_name",
  };
  const merged = { ...(context || {}) };
  Object.entries(aliases).forEach(([alias, key]) => {
    if (merged[alias] === undefined) merged[alias] = merged[key] || "";
  });
  Object.entries(merged).forEach(([k, v]) => {
    const rx = new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "gi");
    out = out.replace(rx, String(v || ""));
  });
  return out.replace(/\{\{\s*[^}]+\s*\}\}/g, "").trim();
}

function sanitizeSavedTemplates(rawList) {
  if (!Array.isArray(rawList)) return [];
  return rawList
    .map((tpl, idx) => {
      const ch = tpl?.channel === "email" ? "email" : "dm";
      const id = String(tpl?.id || `tpl_${idx}_${Math.random().toString(36).slice(2, 8)}`);
      const name = String(tpl?.name || "").trim();
      const body = String(tpl?.body || "");
      if (!name || !body.trim()) return null;
      return {
        id,
        name,
        channel: ch,
        platform: String(tpl?.platform || ""),
        subject: ch === "email" ? String(tpl?.subject || "") : "",
        body,
        createdAt: String(tpl?.createdAt || new Date().toISOString()),
        updatedAt: String(tpl?.updatedAt || new Date().toISOString()),
      };
    })
    .filter(Boolean)
    .slice(-150);
}

function evaluateDraftQuality(draft, artist, bucket, guardrails) {
  const text = draft?.text || "";
  const wc = wordsCount(text);
  const lc = text.toLowerCase();
  const firstName = artist?.n?.split(" ")?.[0]?.toLowerCase() || "";
  const artistName = artist?.n?.toLowerCase() || "";
  const genreName = (bucket || "").toLowerCase();
  const track = normalizeTrackName(artist?.h || "").toLowerCase();
  const hits = [];

  if (artistName && lc.includes(artistName)) hits.push("artist name");
  else if (firstName && lc.includes(firstName)) hits.push("first name");
  if (track && track.length > 2 && lc.includes(track)) hits.push("track mention");
  if (genreName && lc.includes(genreName)) hits.push("genre mention");

  const minWords = draft?.channel === "email"
    ? guardrails.minEmailWords
    : draft?.key === "warm_intro"
      ? guardrails.minWarmWords
      : guardrails.minDmWords;

  const issues = [];
  if (wc < minWords) issues.push(`Too short (${wc} words, needs ${minWords}+).`);
  if (guardrails.requireQuestion && !text.includes("?")) issues.push("Missing a clear CTA question.");
  if (guardrails.requirePersonalization && hits.length === 0) issues.push("Missing personalization (artist/track/genre references).");

  const scoreRaw = 100 - Math.min(60, Math.max(0, minWords - wc) * 2) - (issues.length * 15);
  const score = Math.max(0, Math.min(100, scoreRaw));
  return { pass: issues.length === 0, score, words: wc, minWords, issues, hits };
}

function bumpABStat(abStats, bucket, channel, variantId, delta) {
  const n = { ...(abStats || {}) };
  n[bucket] = { ...(n[bucket] || {}) };
  n[bucket][channel] = { ...(n[bucket][channel] || {}) };
  const cur = n[bucket][channel][variantId] || { sent: 0, replied: 0, won: 0 };
  n[bucket][channel][variantId] = {
    sent: cur.sent + (delta.sent || 0),
    replied: cur.replied + (delta.replied || 0),
    won: cur.won + (delta.won || 0),
  };
  return n;
}

function variantStats(abStats, bucket, channel, variantId) {
  const s = abStats?.[bucket]?.[channel]?.[variantId] || { sent: 0, replied: 0, won: 0 };
  const rr = s.sent ? Math.round((s.replied / s.sent) * 100) : 0;
  return { ...s, rr };
}

function pickABVariant(abStats, bucket, channel) {
  const variants = AB_VARIANTS[channel] || [];
  if (!variants.length) return null;
  const scored = variants.map(v => {
    const s = variantStats(abStats, bucket, channel, v.id);
    return { ...v, sent: s.sent, replied: s.replied, won: s.won, rr: s.rr };
  });
  const explore = scored.filter(v => v.sent < 3).sort((a, b) => a.sent - b.sent);
  if (explore.length) return explore[0];
  return scored.sort((a, b) => (b.rr - a.rr) || (b.won - a.won) || (b.sent - a.sent))[0];
}

function buildABPlan(abStats, artist, bucket) {
  const fn = artist.n.includes(" ") ? artist.n.split(" ")[0] : artist.n;
  const ht = artist.h && !/tbd|high|known|rising|low|presence/i.test(artist.h) ? artist.h.split("(")[0].trim() : "";
  const hooks = { Country: "the way your songs connect", "Hip Hop": "the energy you bring", "R&B / Soul": "the emotional depth", Indie: "your sound and fanbase", Pop: "your music and fanbase", Rock: "your sound", Folk: "the intimacy in your writing", Electronic: "the production energy" };
  const hk = hooks[bucket] || "your music";
  const th = ht ? `Big fan of "${ht}".` : `Love ${hk}.`;
  const ctx = { a: artist, fn, ht, hk, th, bucket };
  const dm = pickABVariant(abStats, bucket, "dm") || AB_VARIANTS.dm[0];
  const email = pickABVariant(abStats, bucket, "email") || AB_VARIANTS.email[0];
  return { dm, email, ctx };
}

function buildABLeaderboard(abStats) {
  const rows = [];
  Object.entries(abStats || {}).forEach(([bucket, channels]) => {
    Object.entries(channels || {}).forEach(([channel, variants]) => {
      const entries = Object.entries(variants || {}).map(([variantId, v]) => {
        const sent = v.sent || 0;
        const replied = v.replied || 0;
        const won = v.won || 0;
        const rr = sent ? Math.round((replied / sent) * 100) : 0;
        const lower = Math.round(wilsonLowerBound(replied, sent) * 100);
        const confidence = confidenceScore(sent);
        return { variantId, sent, replied, won, rr, lower, confidence };
      });
      if (!entries.length) return;
      const totalSent = entries.reduce((a, b) => a + b.sent, 0);
      const totalReplied = entries.reduce((a, b) => a + b.replied, 0);
      const best = entries.slice().sort((a, b) => (b.lower - a.lower) || (b.rr - a.rr) || (b.sent - a.sent))[0];
      rows.push({ bucket, channel, best, totalSent, totalReplied, totalRate: totalSent ? Math.round((totalReplied / totalSent) * 100) : 0, variants: entries.sort((a, b) => b.sent - a.sent) });
    });
  });
  return rows.sort((a, b) => b.totalSent - a.totalSent);
}

function creditABOutcome(project, artistName, nextStage, prevStage) {
  let abStats = { ...(project.abStats || {}) };
  const abCredits = { ...(project.abCredits || {}) };
  const last = [...(project.sendLog || [])].reverse().find(e => e.artist === artistName && (e.channel === "dm" || e.channel === "email") && e.variantId);
  if (!last) return { abStats, abCredits };
  const credit = kind => {
    const key = `${last.id}:${kind}`;
    if (abCredits[key]) return;
    abCredits[key] = true;
    abStats = bumpABStat(abStats, last.bucket || "Other", last.channel, last.variantId, kind === "replied" ? { replied: 1 } : { won: 1 });
  };
  if ((nextStage === "replied" || nextStage === "engaged") && !REPLIED_STAGE_IDS.includes(prevStage)) credit("replied");
  if ((nextStage === "won" || nextStage === "live") && !WON_STAGE_IDS.includes(prevStage)) {
    if (!["replied", "engaged", "won", "live"].includes(prevStage)) credit("replied");
    credit("won");
  }
  return { abStats, abCredits };
}

function normalizeProject(p) {
  const legacyModels = p.settings?.aiModels || {};
  const projectType = normalizeProjectType(p.type);
  const workspaceId = String(p.workspaceId || DEFAULT_WORKSPACE.id).trim() || DEFAULT_WORKSPACE.id;
  const workspaceName = String(p.workspaceName || DEFAULT_WORKSPACE.name).trim() || DEFAULT_WORKSPACE.name;
  const workspaceSlug = String(p.workspaceSlug || workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, "-")).trim() || DEFAULT_WORKSPACE.slug;
  const workspaceRole = normalizeWorkspaceRole(p.workspaceRole, projectType);
  const teamUsers = Array.isArray(p.teamUsers) && p.teamUsers.length ? p.teamUsers : [...DEFAULT_TEAM_USERS];
  const marketingItems = Array.isArray(p.marketingItems) ? p.marketingItems.map(item => normalizeMarketingItem(item, teamUsers)) : [];
  const aiModelsByProvider = {
    anthropic: {
      ...DEFAULT_AI_MODELS.anthropic,
      ...(p.settings?.aiModelsByProvider?.anthropic || {}),
      ...legacyModels,
    },
    openai: {
      ...DEFAULT_AI_MODELS.openai,
      ...(p.settings?.aiModelsByProvider?.openai || {}),
    },
    google: {
      ...DEFAULT_AI_MODELS.google,
      ...(p.settings?.aiModelsByProvider?.google || {}),
    },
    deepseek: {
      ...DEFAULT_AI_MODELS.deepseek,
      ...(p.settings?.aiModelsByProvider?.deepseek || {}),
    },
    groq: {
      ...DEFAULT_AI_MODELS.groq,
      ...(p.settings?.aiModelsByProvider?.groq || {}),
    },
  };
  return {
    ...p,
    type: projectType,
    workspaceId,
    workspaceName,
    workspaceSlug,
    workspaceRole,
    artists: p.artists || [],
    pipeline: Object.fromEntries(
      Object.entries(p.pipeline || {}).map(([artistName, state]) => [
        artistName,
        { ...(state || {}), stage: normalizeStageId(state?.stage) },
      ]),
    ),
    notes: p.notes || {},
    followUps: p.followUps || {},
    activityLog: p.activityLog || {},
    sequenceState: p.sequenceState || {},
    sendLog: p.sendLog || [],
    abStats: p.abStats || {},
    abCredits: p.abCredits || {},
    archivedArtists: Array.isArray(p.archivedArtists) ? p.archivedArtists : [],
    teamUsers,
    assignments: p.assignments || {},
    marketingItems,
    replyIntel: p.replyIntel || {},
    internalRoster: {
      names: Array.isArray(p.internalRoster?.names) ? p.internalRoster.names : [],
      fileName: p.internalRoster?.fileName || "",
      uploadedAt: p.internalRoster?.uploadedAt || "",
    },
    settings: {
      provider: "gmail",
      autoLogCompose: false,
      aiProvider: "anthropic",
      draftGuardrails: { ...DEFAULT_DRAFT_GUARDRAILS },
      savedTemplates: [],
      appearance: { accent: "blue" },
      ...(p.settings || {}),
      publicCsvToken: p.settings?.publicCsvToken || "",
      aiModelsByProvider,
      draftGuardrails: { ...DEFAULT_DRAFT_GUARDRAILS, ...(p.settings?.draftGuardrails || {}) },
      savedTemplates: sanitizeSavedTemplates(p.settings?.savedTemplates || []),
      appearance: {
        accent: p.settings?.appearance?.accent && ACCENT_PRESETS[p.settings.appearance.accent] ? p.settings.appearance.accent : "blue",
      },
      marketingCampaignBank: normalizeMarketingCampaignBank(p.settings?.marketingCampaignBank || []),
      marketingGroups: normalizeMarketingGroups(p.settings?.marketingGroups || [], marketingItems.map(item => item.id)),
    },
  };
}

function normalizeTalentTypeLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const known = MARKETING_TALENT_TYPES.find(type => type.toLowerCase() === raw.toLowerCase());
  if (known) return known;
  if (raw.toLowerCase() === "artist") return "Internal Artist";
  return titleCaseWords(raw);
}

function canonicalEmail(value) {
  const raw = String(value || "").trim().toLowerCase();
  return /@/.test(raw) ? raw : "";
}

function canonicalSpotifyValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^open\.spotify\.com\//, "")
    .replace(/^spotify\.com\//, "")
    .replace(/\/+$/, "");
}

function toNumberString(value) {
  const raw = normalizeFollowerCount(value);
  return raw ? String(Number(raw)) : "";
}

function betterNumericString(a, b) {
  const na = Number(a || 0);
  const nb = Number(b || 0);
  return nb > na ? String(nb) : String(na || "");
}

function preferLongerString(currentValue, nextValue) {
  const current = String(currentValue || "").trim();
  const next = String(nextValue || "").trim();
  if (!current) return next;
  if (!next) return current;
  return next.length > current.length ? next : current;
}

function mergePlatformLifecycle(currentValue, nextValue) {
  const current = String(currentValue || "").trim();
  const next = String(nextValue || "").trim();
  if (current === "live" || next === "live") return "live";
  if (next === "inactive" || next === "retired") return next;
  return next || current || "pre_live";
}

function talentLifecycleTone(lifecycle, C) {
  if (lifecycle === "live") return { tone: C.lv, bg: C.lvb };
  if (lifecycle === "inactive" || lifecycle === "retired") return { tone: C.rd, bg: C.rb };
  return { tone: C.ab, bg: C.abb };
}

function buildTalentIdentity(input = {}) {
  return {
    name: canonicalArtistName(input.displayName || input.talentName || input.name || input.artistName || input.n || ""),
    email: canonicalEmail(input.primaryEmail || input.email || input.e || ""),
    spotify: canonicalSpotifyValue(input.spotifyUrl || input.spotify || ""),
    instagram: normalizeSocialHandle(input.instagramHandle || input.instagramUrl || input.instagram || input.ig || input.soc || ""),
    tiktok: normalizeSocialHandle(input.tiktokHandle || input.tiktokUrl || input.tiktok || ""),
  };
}

function preferredTalentProfileId(identity) {
  if (identity.email) return `talent:email:${identity.email}`;
  if (identity.spotify) return `talent:spotify:${identity.spotify}`;
  if (identity.instagram) return `talent:instagram:${identity.instagram}`;
  if (identity.tiktok) return `talent:tiktok:${identity.tiktok}`;
  if (identity.name) return `talent:name:${identity.name}`;
  return "";
}

function createEmptyTalentProfile(id, identity = {}, seed = {}) {
  return {
    id,
    displayName: seed.displayName || seed.talentName || seed.name || seed.artistName || seed.n || "Unknown talent",
    aliases: [],
    platformLifecycle: seed.platformLifecycle || "pre_live",
    sources: uniqStrings([seed.source].filter(Boolean)),
    primaryEmail: identity.email || canonicalEmail(seed.primaryEmail || seed.email || seed.e || ""),
    emails: identity.email ? [identity.email] : [],
    instagramHandle: identity.instagram || "",
    instagramHandles: identity.instagram ? [identity.instagram] : [],
    instagramUrl: String(seed.instagramUrl || seed.instagram || "").trim(),
    instagramFollowers: toNumberString(seed.instagramFollowers || ""),
    tiktokHandle: identity.tiktok || "",
    tiktokHandles: identity.tiktok ? [identity.tiktok] : [],
    tiktokUrl: String(seed.tiktokUrl || seed.tiktok || "").trim(),
    tiktokFollowers: toNumberString(seed.tiktokFollowers || ""),
    spotifyUrl: String(seed.spotifyUrl || "").trim(),
    spotifyMonthlyListeners: toNumberString(seed.spotifyMonthlyListeners || seed.listeners || seed.l || ""),
    talentTypes: uniqStrings([normalizeTalentTypeLabel(seed.talentType || seed.type || "Artist")].filter(Boolean)),
    curatorPageUrl: String(seed.curatorPageUrl || "").trim(),
    curatedArtists: normalizeCuratedArtists(seed.curatedArtists),
    projectMemberships: [],
    arRecords: [],
    marketingAssignments: [],
    recentActivity: [],
  };
}

function registerTalentIdentity(index, profile, identity = {}) {
  if (identity.email) index.byEmail.set(identity.email, profile.id);
  if (identity.spotify) index.bySpotify.set(identity.spotify, profile.id);
  if (identity.instagram) index.byInstagram.set(identity.instagram, profile.id);
  if (identity.tiktok) index.byTiktok.set(identity.tiktok, profile.id);
  if (identity.name) {
    const existing = index.byName.get(identity.name) || new Set();
    existing.add(profile.id);
    index.byName.set(identity.name, existing);
  }
  uniqStrings([canonicalArtistName(profile.displayName), ...profile.aliases.map(alias => canonicalArtistName(alias))].filter(Boolean)).forEach(nameKey => {
    const existing = index.byName.get(nameKey) || new Set();
    existing.add(profile.id);
    index.byName.set(nameKey, existing);
  });
}

function resolveTalentProfileId(index, identity = {}) {
  if (identity.email && index.byEmail.has(identity.email)) return index.byEmail.get(identity.email);
  if (identity.spotify && index.bySpotify.has(identity.spotify)) return index.bySpotify.get(identity.spotify);
  if (identity.instagram && index.byInstagram.has(identity.instagram)) return index.byInstagram.get(identity.instagram);
  if (identity.tiktok && index.byTiktok.has(identity.tiktok)) return index.byTiktok.get(identity.tiktok);
  if (identity.name && index.byName.has(identity.name)) {
    const match = [...(index.byName.get(identity.name) || [])][0];
    if (match) return match;
  }
  return preferredTalentProfileId(identity);
}

function upsertTalentProfile(store, identity, seed = {}) {
  const profileId = resolveTalentProfileId(store.index, identity);
  if (!profileId) return null;
  const existing = store.byId.get(profileId) || createEmptyTalentProfile(profileId, identity, seed);
  const nextProfile = {
    ...existing,
    displayName: preferLongerString(existing.displayName, seed.displayName || seed.talentName || seed.name || seed.artistName || seed.n || ""),
    aliases: uniqStrings([
      ...existing.aliases,
      ...(seed.displayName && canonicalArtistName(seed.displayName) !== canonicalArtistName(existing.displayName) ? [seed.displayName] : []),
      ...(seed.talentName && canonicalArtistName(seed.talentName) !== canonicalArtistName(existing.displayName) ? [seed.talentName] : []),
      ...(seed.name && canonicalArtistName(seed.name) !== canonicalArtistName(existing.displayName) ? [seed.name] : []),
    ].filter(Boolean)),
    platformLifecycle: mergePlatformLifecycle(existing.platformLifecycle, seed.platformLifecycle),
    sources: uniqStrings([...existing.sources, seed.source].filter(Boolean)),
    primaryEmail: existing.primaryEmail || identity.email || canonicalEmail(seed.primaryEmail || seed.email || seed.e || ""),
    emails: uniqStrings([...existing.emails, identity.email, canonicalEmail(seed.primaryEmail || seed.email || seed.e || "")].filter(Boolean)),
    instagramHandle: existing.instagramHandle || identity.instagram || "",
    instagramHandles: uniqStrings([...existing.instagramHandles, identity.instagram].filter(Boolean)),
    instagramUrl: existing.instagramUrl || String(seed.instagramUrl || seed.instagram || "").trim(),
    instagramFollowers: betterNumericString(existing.instagramFollowers, seed.instagramFollowers || ""),
    tiktokHandle: existing.tiktokHandle || identity.tiktok || "",
    tiktokHandles: uniqStrings([...existing.tiktokHandles, identity.tiktok].filter(Boolean)),
    tiktokUrl: existing.tiktokUrl || String(seed.tiktokUrl || seed.tiktok || "").trim(),
    tiktokFollowers: betterNumericString(existing.tiktokFollowers, seed.tiktokFollowers || ""),
    spotifyUrl: existing.spotifyUrl || String(seed.spotifyUrl || "").trim(),
    spotifyMonthlyListeners: betterNumericString(existing.spotifyMonthlyListeners, seed.spotifyMonthlyListeners || seed.listeners || seed.l || ""),
    talentTypes: uniqStrings([...existing.talentTypes, normalizeTalentTypeLabel(seed.talentType || seed.type || "")].filter(Boolean)),
    curatorPageUrl: existing.curatorPageUrl || String(seed.curatorPageUrl || "").trim(),
    curatedArtists: uniqStrings([
      ...normalizeCuratedArtists(existing.curatedArtists),
      ...normalizeCuratedArtists(seed.curatedArtists),
    ]).slice(0, 10),
  };
  store.byId.set(profileId, nextProfile);
  registerTalentIdentity(store.index, nextProfile, identity);
  return nextProfile;
}

function collectWorkspaceTalentProfiles(projects = []) {
  const store = {
    byId: new Map(),
    index: {
      byEmail: new Map(),
      bySpotify: new Map(),
      byInstagram: new Map(),
      byTiktok: new Map(),
      byName: new Map(),
    },
  };
  const artistTalentIds = new Map();
  const marketingTalentIds = new Map();

  projects.forEach(project => {
    const normalizedProject = normalizeProject(project);

    (normalizedProject.artists || []).forEach(artist => {
      const identity = buildTalentIdentity({
        name: artist.n,
        email: artist.e,
        instagramHandle: artist.soc || artist.ig,
        listeners: artist.l,
      });
      const profile = upsertTalentProfile(store, identity, {
        displayName: artist.n,
        email: artist.e,
        instagramUrl: /instagram\.com/i.test(String(artist.ig || "")) ? artist.ig : "",
        instagramHandle: artist.soc || artist.ig,
        spotifyMonthlyListeners: artist.l,
        talentType: normalizedProject.type === "curator" ? "Curator" : "Internal Artist",
        platformLifecycle: artist.onPlatform || normalizeStageId(normalizedProject.pipeline?.[artist.n]?.stage) === "live" ? "live" : "pre_live",
        source: normalizedProject.type === "curator" ? "curator_pipeline" : "ar_pipeline",
        curatorPageUrl: artist.curatorPageUrl || "",
        curatedArtists: artist.curatedArtists || [],
      });
      if (!profile) return;

      artistTalentIds.set(`${normalizedProject.id}::${artist.n}`, profile.id);
      profile.projectMemberships.push({
        projectId: normalizedProject.id,
        projectName: normalizedProject.name,
        projectType: normalizedProject.type,
        kind: "ar",
      });
      profile.arRecords.push({
        projectId: normalizedProject.id,
        projectName: normalizedProject.name,
        projectType: normalizedProject.type,
        artistName: artist.n,
        stage: normalizeStageId(normalizedProject.pipeline?.[artist.n]?.stage),
        owner: normalizedProject.assignments?.[artist.n] || "",
        genre: artist.g || "",
        monthlyListeners: artist.l || "",
        hitTrack: artist.h || "",
        location: artist.loc || "",
        onPlatform: !!artist.onPlatform,
        social: artist.soc || "",
        email: artist.e || "",
        note: String(normalizedProject.notes?.[artist.n] || "").trim(),
        followUp: String(normalizedProject.followUps?.[artist.n] || "").trim(),
        curatorPageUrl: artist.curatorPageUrl || "",
        curatedArtists: normalizeCuratedArtists(artist.curatedArtists),
      });
      (normalizedProject.activityLog?.[artist.n] || []).forEach(entry => {
        profile.recentActivity.push({
          id: entry?.id || `activity_${normalizedProject.id}_${artist.n}_${Math.random().toString(36).slice(2, 8)}`,
          time: entry?.time || "",
          action: entry?.action || "",
          kind: entry?.kind || "event",
          actor: entry?.actor || entry?.author || "",
          note: entry?.note || "",
          projectId: normalizedProject.id,
          projectName: normalizedProject.name,
          projectType: normalizedProject.type,
          artistName: artist.n,
          assignmentId: "",
          campaign: "",
        });
      });
    });

    (normalizedProject.marketingItems || []).forEach(rawItem => {
      const item = normalizeMarketingItem(rawItem, normalizedProject.teamUsers || DEFAULT_TEAM_USERS);
      const identity = buildTalentIdentity({
        talentName: item.talentName,
        email: item.email,
        instagramHandle: item.instagramHandle,
        instagramUrl: item.instagramUrl,
        tiktokHandle: item.tiktokHandle,
        tiktokUrl: item.tiktokUrl,
        spotifyUrl: item.spotifyUrl,
      });
      const profile = upsertTalentProfile(store, identity, {
        displayName: item.talentName,
        email: item.email,
        instagramUrl: item.instagramUrl,
        instagramHandle: item.instagramHandle,
        instagramFollowers: item.instagramFollowers,
        tiktokUrl: item.tiktokUrl,
        tiktokHandle: item.tiktokHandle,
        tiktokFollowers: item.tiktokFollowers,
        spotifyUrl: item.spotifyUrl,
        spotifyMonthlyListeners: item.spotifyMonthlyListeners,
        talentType: item.talentType,
        platformLifecycle: "live",
        source: "legacy_roster",
      });
      if (!profile) return;

      marketingTalentIds.set(String(item.id || ""), profile.id);
      profile.projectMemberships.push({
        projectId: normalizedProject.id,
        projectName: normalizedProject.name,
        projectType: normalizedProject.type,
        kind: "marketing",
      });
      profile.marketingAssignments.push({
        assignmentId: item.id,
        projectId: normalizedProject.id,
        projectName: normalizedProject.name,
        talentName: item.talentName,
        campaign: item.campaign || "",
        campaigns: item.campaigns || [],
        title: item.title || "",
        status: item.status,
        owner: item.owner || "",
        trafficType: item.trafficType || "",
        deliverableType: item.deliverableType || "",
        email: item.email || "",
        dueDate: item.dueDate || "",
        briefUrl: item.briefUrl || "",
        contentUrl: item.contentUrl || "",
        notes: item.notes || "",
        rejectedReason: item.rejectedReason || "",
        updatedAt: item.updatedAt || "",
      });
      if (item.notes) {
        profile.recentActivity.push({
          id: `marketing_note_${item.id}`,
          time: item.updatedAt || item.createdAt || "",
          action: "Marketing note",
          kind: "note",
          actor: item.owner || "",
          note: item.notes,
          projectId: normalizedProject.id,
          projectName: normalizedProject.name,
          projectType: normalizedProject.type,
          artistName: item.talentName,
          assignmentId: item.id,
          campaign: item.campaign || "",
        });
      }
      (normalizedProject.activityLog?.[item.talentName] || []).forEach(entry => {
        if (entry?.assignmentId && String(entry.assignmentId) !== String(item.id)) return;
        profile.recentActivity.push({
          id: entry?.id || `activity_${normalizedProject.id}_${item.id}_${Math.random().toString(36).slice(2, 8)}`,
          time: entry?.time || "",
          action: entry?.action || "",
          kind: entry?.kind || "event",
          actor: entry?.actor || entry?.author || "",
          note: entry?.note || "",
          projectId: normalizedProject.id,
          projectName: normalizedProject.name,
          projectType: normalizedProject.type,
          artistName: item.talentName,
          assignmentId: item.id,
          campaign: item.campaign || "",
        });
      });
    });
  });

  const profiles = [...store.byId.values()]
    .map(profile => ({
      ...profile,
      projectMemberships: uniqStrings(profile.projectMemberships.map(item => `${item.projectId}::${item.kind}`))
        .map(key => profile.projectMemberships.find(item => `${item.projectId}::${item.kind}` === key))
        .filter(Boolean),
      arRecords: [...profile.arRecords].sort((a, b) => a.projectName.localeCompare(b.projectName)),
      marketingAssignments: [...profile.marketingAssignments].sort((a, b) => a.projectName.localeCompare(b.projectName) || a.talentName.localeCompare(b.talentName)),
      talentTypes: uniqStrings(profile.talentTypes),
      sources: uniqStrings(profile.sources),
      curatedArtists: uniqStrings(normalizeCuratedArtists(profile.curatedArtists)).slice(0, 10),
      recentActivity: [...(profile.recentActivity || [])]
        .filter(entry => entry?.time || entry?.action || entry?.note)
        .sort((a, b) => String(b?.time || "").localeCompare(String(a?.time || "")))
        .slice(0, 24),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return {
    profiles,
    artistTalentIds,
    marketingTalentIds,
  };
}

const AI_KEY_STORAGE = {
  anthropic: "gemfinder-anthropic-key",
  openai: "gemfinder-openai-key",
  google: "gemfinder-google-key",
  deepseek: "gemfinder-deepseek-key",
  groq: "gemfinder-groq-key",
};

function getStoredAiKey(provider = "anthropic") {
  const storageKey = AI_KEY_STORAGE[provider] || AI_KEY_STORAGE.anthropic;
  try {
    const local = window.localStorage.getItem(storageKey);
    if (local) return local.trim();
  } catch {}
  return "";
}

function providerLabel(provider = "anthropic") {
  return AI_PROVIDER_LABELS[provider] || provider;
}

function detectProviderFromKey(value) {
  const key = String(value || "").trim();
  if (!key) return null;
  if (key.startsWith("sk-ant-")) return "anthropic";
  if (key.startsWith("AIza")) return "google";
  if (key.startsWith("sk-proj-")) return "openai";
  if (key.startsWith("gsk_")) return "groq";
  return null;
}

function parseOpenAIResponseText(payload) {
  const parts = [];
  const pick = value => {
    if (typeof value === "string") return value.trim();
    if (value && typeof value === "object") {
      if (typeof value.text === "string") return value.text.trim();
      if (typeof value.value === "string") return value.value.trim();
    }
    return "";
  };
  const add = value => {
    const t = pick(value);
    if (t) parts.push(t);
  };

  add(payload?.output_text);
  add(payload?.response?.output_text);
  add(payload?.final_output);
  add(payload?.content);

  const walkOutput = items => {
    (items || []).forEach(item => {
      add(item?.text);
      const isMessageLike = item?.type === "message" || item?.type === "output_message" || item?.role === "assistant" || Array.isArray(item?.content);
      if (!isMessageLike) return;
      (item?.content || []).forEach(c => {
        add(c?.text);
        add(c?.value);
        add(c?.refusal);
      });
    });
  };

  walkOutput(payload?.output);
  walkOutput(payload?.response?.output);
  (payload?.choices || []).forEach(choice => {
    add(choice?.message?.content);
    add(choice?.delta?.content);
  });

  return parts.join("\n").trim();
}

function parseGoogleResponseText(payload) {
  const parts = [];
  (payload?.candidates || []).forEach(candidate => {
    (candidate?.content?.parts || []).forEach(part => {
      if (typeof part?.text === "string" && part.text.trim()) parts.push(part.text.trim());
    });
  });
  return parts.join("\n").trim();
}

function parseChatCompletionText(payload) {
  return (
    payload?.choices
      ?.map(choice => {
        const content = choice?.message?.content;
        if (typeof content === "string") return content;
        if (Array.isArray(content)) {
          return content
            .map(part => (typeof part?.text === "string" ? part.text : ""))
            .filter(Boolean)
            .join("\n");
        }
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim() || ""
  );
}

// ═══ AI CALL HELPER ═══
async function aiCall(prompt, maxTokens = 1200, provider = "anthropic", apiKey = "", model = "") {
  const key = (apiKey || getStoredAiKey(provider)).trim();
  const providerLabelText = providerLabel(provider);
  if (!key) {
    return { ok: false, text: `Missing ${providerLabelText} API key. Click 'AI Key' and save a key for ${providerLabelText}.` };
  }
  const safeModel = model || DEFAULT_AI_MODELS[provider]?.intel || DEFAULT_AI_MODELS.anthropic.intel;
  const proxyEndpoint = provider === "openai"
    ? "/api/ai/openai"
    : provider === "google"
      ? "/api/ai/google"
      : provider === "deepseek"
        ? "/api/ai/deepseek"
        : provider === "groq"
          ? "/api/ai/groq"
      : "/api/ai/anthropic";
  try {
    const proxy = await fetch(proxyEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, model: safeModel, maxTokens, apiKey: key }),
    });

    if (proxy.ok) {
      const data = await proxy.json();
      const proxyText = (data?.text || "").trim();
      if (proxyText && !/^no response\.?$/i.test(proxyText)) {
        return { ok: true, text: proxyText };
      }
    }

    // Proxy may be unavailable if only the frontend is running.
    if (![404, 405, 502].includes(proxy.status)) {
      const raw = await proxy.text();
      let msg = `${providerLabelText} API error ${proxy.status}`;
      try {
        const parsed = JSON.parse(raw);
        msg = parsed?.error || parsed?.error?.message || msg;
      } catch {}
      return { ok: false, text: msg };
    }
  } catch {}

  try {
    const r = provider === "openai"
      ? await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${key}`,
          },
          body: JSON.stringify({ model: safeModel, input: prompt, max_output_tokens: maxTokens }),
        })
      : provider === "google"
        ? await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(safeModel)}:generateContent`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": key,
            },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: maxTokens },
            }),
          })
      : provider === "groq"
        ? await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${key}`,
            },
            body: JSON.stringify({
              model: safeModel,
              messages: [{ role: "user", content: prompt }],
              max_tokens: maxTokens,
              temperature: 0.7,
            }),
          })
        : await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": key,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({ model: safeModel, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
          });
    if (!r.ok) {
      const raw = await r.text();
      let msg = `${providerLabelText} API error ${r.status}`;
      try {
        const parsed = JSON.parse(raw);
        msg = parsed?.error?.message || parsed?.error || msg;
      } catch {}
      return { ok: false, text: msg };
    }
    const d = await r.json();
    const t = provider === "openai"
      ? parseOpenAIResponseText(d)
      : provider === "google"
        ? parseGoogleResponseText(d)
        : provider === "groq"
          ? parseChatCompletionText(d)
        : (d.content?.map(i => i.type === "text" ? i.text : "").filter(Boolean).join("\n") || "");
    if (!t) {
      return { ok: false, text: `${providerLabelText} returned an empty response. Try a different model.` };
    }
    return { ok: true, text: t };
  } catch (e) {
    return { ok: false, text: `${providerLabelText} API error: ${e.message}. If this keeps failing, run both services with \"npm run dev:full\".` };
  }
}

// ═══ AI INTEL ═══
async function fetchAIIntel(a, bucket, provider = "anthropic", apiKey = "", model = "") {
  const pri = pS(a);
  return aiCall(`You are an A&R research analyst helping Greg (Head of Content & Partnerships at Songfinch) evaluate whether to recruit this artist. Songfinch lets fans commission custom songs directly from artists. The platform has paid out more than $50M since 2016.

ARTIST: ${a.n}
Genre: ${a.g || "Unknown"} (bucket: ${bucket})
Monthly Listeners: ${a.l || "Unknown"}
Hit Track: ${a.h || "Unknown"}
Social: ${a.ig || "None listed"}
Email: ${a.e ? "Has management email" : "No email"}
Location: ${a.loc || "Unknown"}
Priority: ${pri >= 5 ? "HOT" : pri >= 3 ? "WARM" : "COOL"} (${pri}/7)

Use your actual knowledge of this artist if you recognize them. Reference specific songs, career moments, fanbase traits. If you don't recognize them, say so honestly and work with what's provided.

Format (plain text, no markdown headers):

FIT SCORE: [1-10]

WHY THEY FIT: [2-3 specific sentences about THIS artist's fanbase and why they'd buy custom songs]

SUGGESTED ANGLE: [The single best personalized pitch angle - reference their actual work]

TALKING POINTS: [3 bullet points specific to this artist Greg can use in outreach]

RED FLAGS: [Honest concerns or "None obvious"]

SPOTIFY NOTE: [What you know about their Spotify presence - top tracks, listener range, recent releases. If unsure say "Verify on Spotify"]

PRIORITY MOVE: [One specific next action]

Be punchy, honest, specific. Bad fit? Say so.`, 1200, provider, apiKey, model);
}

// ═══ AI DRAFTS ═══
async function generateAIDrafts(a, bucket, intelText, abPlan, platform = "instagram_dm", provider = "anthropic", apiKey = "", model = "") {
  const fn = firstNameFromArtist(a.n);
  const hasE = !!a.e;
  const p = platformMeta(platform);
  const hitTrack = cleanHitTrack(a.h || "");
  const social = a.soc ? `@${a.soc}` : (a.ig || "None");
  const mlValue = parseMl(a.l);
  const listeners = mlValue ? fmtCompact(mlValue) : (a.l || "Unknown");
  const marketLine = marketSignalLine(a, bucket);
  const fanLine = fanExperienceLine(bucket);
  const signalLine = artistSignalLine(a);
  const copyGuide = platformCopyGuide(platform);
  const ctx = intelText ? `\n\nAI INTEL CONTEXT (use only if relevant and factual):\n${intelText}` : "";
  const abHint = abPlan ? `\n\nA/B HINTS:\n- DM opener winner: Variant ${abPlan.dm.id} (${abPlan.dm.label})\n- Email subject winner: Variant ${abPlan.email.id} (${abPlan.email.label})` : "";
  return aiCall(`You are Greg, Head of Content & Partnerships at Songfinch. Write outreach to recruit ${a.n}.

Songfinch context:
- Fans commission one-of-one custom songs directly from artists
- $50M+ paid out since 2016
- No contracts, no exclusivity, no cost to join
- Artists keep ownership and set pricing

Artist context:
Name: ${a.n}
First name: ${fn}
Genre: ${a.g || "Unknown"} (bucket: ${bucket})
Monthly listeners: ${listeners}
Hit track: ${hitTrack || "Unknown"}
Social: ${social}
Email available: ${hasE ? "Yes" : "No"}
Location: ${a.loc || "Unknown"}
Primary first-touch platform: ${p.label}${ctx}${abHint}
Platform writing guide: ${copyGuide}
Market signal to weave in: ${marketLine}
Fan-experience angle to weave in: ${fanLine}
Specific proof line to use if helpful: ${signalLine || "No proof line available"}

Rules:
- Sound human and conversational, not sales-brochure language
- Be specific to THIS artist
- Use at least 2 concrete artist signals when available (track, listeners, location, social handle, intel detail)
- If you do not have a reliable specific fact, do not invent one
- Do not use em dash punctuation
- No fluffy claims or generic hype phrases
- Avoid weak openers like "love your music" or "hope you are well"
- Keep the value centered on direct fan-to-artist collaboration and monetizing top fans
- Do not focus on gifting, weddings, birthdays, anniversaries, or occasion marketing
- Explicitly mention artist control: pricing control, request acceptance control, and ownership
- Never repeat the same sentence or opener phrase in a draft
- Do not dump metrics in a robotic list or semicolon chain
- Keep wording in second-person voice unless emailing management
- Use "quick call" language, not oddly specific durations
- End each draft with one clear CTA question

Write exactly 3 drafts:

===COLD_DM===
[First touch for ${p.label}. If platform is email, include Subject: line and email formatting. If platform is DM, format as a DM. 130 to 190 words.]

===EMAIL===
[${hasE ? `Management-facing email opening with "Hey team,"` : `Direct email opening with "Hey ${fn},"`} 170 to 260 words. Must include Subject: line.]

===WARM_INTRO===
[Lower-pressure outreach as if there is prior familiarity or warm context. 130 to 190 words.]

Each draft must use a different approach and different wording.

Structure guide:
1) personalized opener
2) "At Songfinch..." paragraph explaining direct fan collaboration
3) "Quick context..." paragraph with terms (no contracts, no exclusivity, no AI-generated music, no cost)
4) short paragraph on creative upside and fan access
5) one clear CTA question asking for 15 minutes this or next week`, 2200, provider, apiKey, model);
}

function parseAIDrafts(text, a, platform = "instagram_dm") {
  const hasE = !!a.e;
  const p = platformMeta(platform);
  const sections = text.split(/===(\w+)===/);
  const drafts = [];
  for (let i = 1; i < sections.length; i += 2) {
    const k = sections[i].trim().toLowerCase();
    const c = (sections[i + 1] || "").trim();
    if (k === "cold_dm") drafts.push({ key: "initial_outreach", label: `Initial ${p.label} ✨`, sub: `AI-personalized for ${p.label}`, text: c, ai: true, channel: p.channel, variantId: "AI", platform: p.id });
    else if (k === "email") drafts.push({ key: "formal_email", label: hasE ? "Mgmt Email ✨" : "Direct Email ✨", sub: hasE ? (a.e || "Find email") : "Greg@songfinch.com", text: c, ai: true, channel: "email", variantId: "AI" });
    else if (k === "warm_intro") drafts.push({ key: "warm_intro", label: "Warm Intro ✨", sub: "AI-personalized warm outreach", text: c, ai: true, channel: "dm", variantId: "AI" });
  }
  if (!drafts.length) drafts.push({ key: "ai_full", label: "AI Draft ✨", sub: "Full AI output", text, ai: true, channel: "dm", variantId: "AI" });
  return drafts;
}

// ═══ QUICK TEMPLATES (A/B aware) ═══
function genQuickDrafts(a, bucket, abPlan, platform = "instagram_dm") {
  const p = platformMeta(platform);
  const initialChannel = p.channel;
  const fn = firstNameFromArtist(a.n);
  const ht = cleanHitTrack(a.h || "");
  const artistRef = a.e ? a.n : "you";
  const angle = genreAngle(bucket);
  const marketLine = marketSignalLine(a, bucket);
  const fanLine = fanExperienceLine(bucket);
  const signalLine = artistSignalLine(a);
  const socialLine = a.soc ? `The engagement at @${a.soc} also stands out.` : "";
  const personalizedReason = [signalLine, socialLine].filter(Boolean).join(" ");

  const dmVariant = abPlan?.dm || AB_VARIANTS.dm[0];
  const emVariant = abPlan?.email || AB_VARIANTS.email[0];
  const dmIntro = ht
    ? `Hey ${fn}, Greg here from Songfinch. Long-time listener, and "${ht}" is the main reason I wanted to connect.`
    : `Hey ${fn}, Greg here from Songfinch. Long-time listener, and I wanted to connect about something we have in motion.`;
  const mgmtIntro = ht
    ? `Greg here, Head of Content & Partnerships at Songfinch. Long-time listener. "${ht}" is what pulled me in, so I wanted to connect about something we have in motion.`
    : `Greg here, Head of Content & Partnerships at Songfinch. Long-time listener, and I wanted to connect about something we have in motion.`;
  const directEmailIntro = ht
    ? `Greg here, Head of Content & Partnerships at Songfinch. Long-time listener, and "${ht}" is what pulled me in.`
    : `Greg here, Head of Content & Partnerships at Songfinch. Long-time listener, and I wanted to reach out directly.`;
  const emSubject = emVariant.subject({ a, fn, ht, bucket });
  const initialVariant = initialChannel === "email" ? emVariant : dmVariant;
  const pitchLine = `At Songfinch, we help artists build a paid direct-to-fan environment where top fans and potential superfans commission one-of-one songs directly with the artist.`;
  const termsLine = `Quick context: $50M+ paid out since 2016. No contracts, no exclusivity, no AI-generated music, and no cost to join. Artists set pricing, accept only the requests they want, and keep ownership.`;
  const creativeLine = `Best part is it doubles as a creative exercise. You can repurpose what you create, fan usage stays limited to personal use, and core fans get an inside look at the process.`;
  const fitLine = `For ${artistRef}, I think this is a strong fit because ${angle} ${fanLine} ${marketLine} ${personalizedReason}`.replace(/\s+/g, " ").trim();
  const ctaLine = a.e
    ? `Would you have 15 minutes this or next week to walk through how it works and cover questions?`
    : `Would you be open to 15 minutes this or next week so I can walk through it and answer questions?`;

  const initialText = initialChannel === "email"
    ? `Subject: ${emSubject}\n\n${a.e ? "Hey team," : `Hey ${fn},`}\n\n${a.e ? mgmtIntro : directEmailIntro}\n\n${pitchLine}\n\n${fitLine}\n\n${termsLine} ${creativeLine}\n\n${ctaLine}\n\nThanks for your time,\n\nGreg\nHead of Content & Partnerships, Songfinch\nGreg@songfinch.com`
    : `${dmIntro}\n\n${pitchLine}\n\n${fitLine}\n\n${termsLine}\n\n${ctaLine}\n\nGreg\nHead of Content & Partnerships, Songfinch\nGreg@songfinch.com`;

  return [
    {
      key: "initial_outreach",
      label: `Initial ${p.label} (v${initialVariant.id})`,
      sub: `Primary platform: ${p.label}`,
      text: initialText,
      ai: false,
      channel: initialChannel,
      variantId: initialVariant.id,
      platform: p.id,
    },
    {
      key: "formal_email",
      label: `${a.e ? "Mgmt" : "Direct"} Email Alt (v${emVariant.id})`,
      sub: `A/B variant ${emVariant.id}: ${emVariant.label}`,
      text: `Subject: ${emSubject}\n\n${a.e ? "Hey team," : `Hey ${fn},`}\n\n${a.e ? mgmtIntro : directEmailIntro}\n\n${pitchLine}\n\n${fitLine}\n\n${termsLine} ${creativeLine}\n\n${ctaLine}\n\nThanks for your time,\n\nGreg\nHead of Content & Partnerships, Songfinch\nGreg@songfinch.com`,
      ai: false,
      channel: "email",
      variantId: emVariant.id,
      subject: emSubject,
    },
    {
      key: "warm_intro",
      label: `Warm Intro (v${dmVariant.id})`,
      sub: `A/B variant ${dmVariant.id} warm approach`,
      text: `Hey ${fn},\n\nGreg here from Songfinch. ${ht ? `Long-time listener, and "${ht}" is the main reason I wanted to connect.` : "Long-time listener, and I wanted to connect about something we have in motion."}\n\n${pitchLine}\n\n${fitLine}\n\n${termsLine}\n\nIf useful, I can send a short one-pager first, or we can do a quick 15-minute chat this or next week.\n\nOpen to that?\n\nGreg\nHead of Content & Partnerships, Songfinch\nGreg@songfinch.com`,
      ai: false,
      channel: "dm",
      variantId: dmVariant.id,
    },
  ];
}

// ═══ AI DISCOVERY ═══
async function discoverArtists(criteria, provider = "anthropic", apiKey = "", model = "") {
  return aiCall(`You are an A&R research assistant for Greg at Songfinch. Find artists matching: ${criteria}

CONTEXT: Songfinch = fans pay artists for custom songs. Best fits: engaged fanbases, active social, genres with emotional/personal connection (country, indie, R&B, folk, pop especially). Sweet spot: 10K-500K monthly listeners. Active recent releases.

Return EXACTLY 8 recommendations. For EACH use this format:

===ARTIST===
NAME: [Full name]
GENRE: [Primary genre]
LISTENERS: [Approximate monthly Spotify listeners or "Verify"]
LOCATION: [City, Country if known]
TOP_TRACK: [Most known/recent notable track]
SOCIAL: [Instagram handle or "Unknown"]
WHY: [2-3 sentences on Songfinch fit - specific fanbase traits, career moment, engagement]

Only recommend artists you're confident exist and are currently active. Skip obvious mainstream. Prioritize hidden gems Greg probably doesn't know.`, 3000, provider, apiKey, model);
}

function parseDiscovered(text) {
  return text.split("===ARTIST===").filter(b => b.trim()).map(block => {
    const g = k => { const m = block.match(new RegExp(`${k}:\\s*(.+?)(?:\\n|$)`)); return m ? m[1].trim() : ""; };
    return { n: g("NAME"), g: g("GENRE"), l: g("LISTENERS"), loc: g("LOCATION"), h: g("TOP_TRACK"), ig: "", soc: g("SOCIAL").replace(/^@/, ""), e: "", s: false, o: "", why: g("WHY") };
  }).filter(a => a.n);
}

async function classifyReplyText(artist, replyText, intelText = "", provider = "anthropic", apiKey = "", model = "") {
  const intelCtx = intelText ? `\nIntel context:\n${intelText}\n` : "";
  return aiCall(`You are an outreach operations assistant for Greg at Songfinch.
Classify this artist reply and recommend the next move.

Artist: ${artist.n}
Channel context: ${artist.e ? "Email + DM available" : "DM likely"}
Reply text:
${replyText}
${intelCtx}
Return exact format:
INTENT: [interested | maybe_later | not_interested | question | unknown]
SENTIMENT: [positive | neutral | negative]
URGENCY: [high | medium | low]
NEXT_STAGE: [replied | engaged | won | dead | sent]
NEXT_ACTION: [one sentence]
DRAFT_RESPONSE:
[90-140 words, professional, concise]`, 900, provider, apiKey, model);
}

function parseReplyIntel(text) {
  const read = key => {
    const m = text.match(new RegExp(`${key}:\\s*(.+?)(?:\\n|$)`, "i"));
    return m ? m[1].trim() : "";
  };
  const intent = read("INTENT").toLowerCase();
  const sentiment = read("SENTIMENT").toLowerCase();
  const urgency = read("URGENCY").toLowerCase();
  const nextStage = read("NEXT_STAGE").toLowerCase();
  const nextAction = read("NEXT_ACTION");
  const draftMatch = text.match(/DRAFT_RESPONSE:\s*([\s\S]*)/i);
  const draftResponse = draftMatch ? draftMatch[1].trim() : "";
  return { intent, sentiment, urgency, nextStage, nextAction, draftResponse, raw: text };
}

async function generateFollowUpDraft(artist, context, provider = "anthropic", apiKey = "", model = "") {
  const options = typeof context === "object" && context !== null ? context : { notes: String(context || "") };
  const notes = options.notes || "";
  const channel = options.channel === "email" ? "email" : "dm";
  const hasReply = !!options.hasReply;
  const replyText = (options.replyText || "").trim();
  const firstName = artist?.n?.includes(" ") ? artist.n.split(" ")[0] : artist?.n || "there";

  const fallback = (() => {
    if (channel === "email") {
      const open = artist.e ? "Hey team," : `Hey ${firstName},`;
      if (hasReply) {
        return `Subject: Re: Quick follow-up\n\n${open}\n\nThanks for getting back to me. I can keep this simple and send a one-page overview of how Songfinch works for artists with engaged fanbases, plus sample economics, so you can evaluate quickly.\n\nWould you prefer I send that over email, or would a quick call be easier?\n\nBest,\nGreg\nHead of Content & Partnerships, Songfinch\nGreg@songfinch.com`;
      }
      return `Subject: Quick follow-up on Songfinch\n\n${open}\n\nQuick follow-up on my last note. Songfinch helps artists open a direct revenue lane through fan-commissioned songs, without contracts or exclusivity.\n\nIf it is useful, I can send a one-page overview with sample economics so you can decide quickly whether it is worth a deeper conversation.\n\nOpen to that?\n\nBest,\nGreg\nHead of Content & Partnerships, Songfinch\nGreg@songfinch.com`;
    }
    if (hasReply) {
      return `Hey ${firstName}, thanks for getting back to me. I can send a quick one-pager on how Songfinch works for artists and what the economics look like. Want me to send that over?`;
    }
    return `Hey ${firstName}, quick follow-up on my last note about Songfinch. If helpful, I can send a short overview of how artists use it and what the economics look like. Open to that?`;
  })();

  const formatRules = channel === "email"
    ? `Output must be an email with a "Subject:" line, greeting, body, and sign-off from Greg.`
    : `Output must be a DM only. No subject line.`;

  const replyBlock = hasReply
    ? `Artist reply text that must be addressed directly:\n${replyText || "(reply provided but empty)"}`
    : `No artist reply text is available. This is a follow-up bump to prior outreach.`;

  const prompt = `You are Greg from Songfinch writing a professional outreach follow-up.

This is A&R outreach. You are recruiting artists to join Songfinch.
You are NOT delivering a commissioned song to a customer.
Never imply we already sent, delivered, revised, or completed a song for this artist.
Never mention revisions, storytelling feedback, file delivery, attachments, or production updates.

Artist: ${artist.n}
Genre: ${artist.g || "Unknown"}
Channel: ${channel.toUpperCase()}

Context:
${notes}

${replyBlock}

Write one follow-up message only.
Requirements:
- 95 to 170 words
- professional and confident
- directly relevant to the context above
- must clearly reference the prior outreach or reply context
- one clear CTA question
- no em dash punctuation
- no markdown
- no filler
${formatRules}`;

  const res = await aiCall(prompt, 750, provider, apiKey, model);
  if (!res?.ok) return res;

  const text = (res.text || "").trim();
  const invalidPatterns = [
    /custom\s+[a-z0-9'" ]{0,80}\s(song|track)\s+(we|i)\s+(sent|delivered|made|created)/i,
    /\bshare any feedback\b/i,
    /\bneeds adjustment\b/i,
    /\brevisions?\b/i,
    /\baligned with your vision\b/i,
    /\bsound and (the )?storytelling\b/i,
    /\battached\b.{0,18}\b(song|track|file|audio)\b/i,
  ];
  const invalid = !text || invalidPatterns.some(rx => rx.test(text));
  if (invalid) return { ok: true, text: fallback, fallbackUsed: true };
  return { ok: true, text };
}

function wilsonLowerBound(success, total, z = 1.96) {
  if (!total) return 0;
  const phat = success / total;
  const denom = 1 + (z * z) / total;
  const center = phat + (z * z) / (2 * total);
  const margin = z * Math.sqrt((phat * (1 - phat) + (z * z) / (4 * total)) / total);
  return Math.max(0, (center - margin) / denom);
}

function confidenceScore(sent) {
  return Math.min(100, Math.round((sent / 30) * 100));
}

function buildHealthAlerts(enriched, proj, now = new Date()) {
  const alerts = [];
  const today = operationalTodayISOFor(now);
  const scopedNames = new Set(enriched.map(a => a.n));
  const seqDue = Object.entries(proj?.sequenceState || {}).filter(([name, ss]) => scopedNames.has(name) && ss?.status === "active" && ss.nextDue && ss.nextDue <= today).length;
  if (seqDue > 0) alerts.push({ level: "high", label: `${seqDue} follow-up touches due now`, action: "Open Queue and clear due follow-ups first." });

  const staleSent = enriched.filter(a => a.stage === "sent" && a.stageDate && daysBetween(a.stageDate, today) >= 10).length;
  if (staleSent > 0) alerts.push({ level: "high", label: `${staleSent} artists sent >10 days without reply`, action: "Run follow-up drafts and send today." });

  const unassigned = enriched.filter(a => !a.owner).length;
  if (unassigned > 0) alerts.push({ level: "medium", label: `${unassigned} artists unassigned`, action: "Assign owners so outreach accountability is clear." });

  const noFollowUp = enriched.filter(a => a.stage === "sent" && !a.followUp).length;
  if (noFollowUp > 0) alerts.push({ level: "medium", label: `${noFollowUp} sent artists missing follow-up dates`, action: "Set follow-up dates or start a follow-up plan." });

  const engagedNoFollowUp = enriched.filter(a => a.stage === "engaged" && !a.followUp).length;
  if (engagedNoFollowUp > 0) alerts.push({ level: "medium", label: `${engagedNoFollowUp} engaged artists missing next-step dates`, action: "Set next action dates for interested artists so deals do not stall." });

  const wonNoLive = enriched.filter(a => a.stage === "won").length;
  if (wonNoLive > 0) alerts.push({ level: "low", label: `${wonNoLive} won artists not marked live yet`, action: "Move fully launched artists into Live once their profile is set up." });

  const stuckProspects = enriched.filter(a => a.stage === "prospect" && a.priority >= 5).length;
  if (stuckProspects > 0) alerts.push({ level: "low", label: `${stuckProspects} HOT artists still in Prospect`, action: "Move top HOT artists into drafted and send lane." });

  return alerts;
}

function exportArtistBrief(artist, proj, intelText = "", replyIntel = null) {
  const stage = proj?.pipeline?.[artist.n]?.stage || "prospect";
  const owner = proj?.assignments?.[artist.n] || "Unassigned";
  const note = proj?.notes?.[artist.n] || "";
  const followUp = proj?.followUps?.[artist.n] || "";
  const recentSends = (proj?.sendLog || []).filter(s => s.artist === artist.n).slice(-6).reverse();
  const body = [
    `Artist Brief: ${artist.n}`,
    `Generated: ${new Date().toLocaleString()}`,
    "",
    "Core Profile",
    `- Owner: ${owner}`,
    `- Stage: ${stage}`,
    `- Genre: ${artist.g || "Unknown"}`,
    `- Listeners: ${artist.l || "Unknown"}`,
    `- Top Track: ${artist.h || "Unknown"}`,
    `- Location: ${artist.loc || "Unknown"}`,
    `- Email: ${artist.e || "None"}`,
    `- Instagram: ${artist.soc ? `@${artist.soc}` : "None"}`,
    `- Spotify: ${spotifyUrl(artist.n)}`,
    "",
    "Internal Notes",
    note || "No notes",
    "",
    `Follow-up Date: ${followUp || "None set"}`,
    "",
    "Recent Sends",
    ...(recentSends.length ? recentSends.map(s => `- ${new Date(s.sentAt).toLocaleString()} | ${s.channel.toUpperCase()} | ${s.provider} | v${s.variantId || "NA"}`) : ["- No sends logged"]),
    "",
    "AI Intel",
    intelText || "No intel generated in current session.",
    "",
    "Reply Intelligence",
    replyIntel?.raw || "No reply intelligence generated.",
  ].join("\n");
  const blob = new Blob([body], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${artist.n.replace(/\s+/g, "_")}_brief.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

// ═══ ACTIVITY LOG ═══
function addLog(proj, name, action, kind = "event", extra = {}) {
  const logs = proj.activityLog || {};
  const al = logs[name] || [];
  al.push({
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    action,
    kind,
    time: new Date().toISOString(),
    actor: extra.actor || extra.author || "",
    ...extra,
  });
  return { ...logs, [name]: al.slice(-120) };
}

// ═══ SMART QUEUE ═══
function buildQueue(enriched, sequenceState, now = new Date()) {
  const today = operationalTodayISOFor(now);
  const items = [];
  const byName = Object.fromEntries(enriched.map(a => [a.n, a]));

  enriched.forEach(a => {
    if (a.followUp && a.followUp <= today && !isClosedStage(a.stage)) {
      const d = daysBetween(a.followUp, today);
      items.push({ type: "overdue", artist: a, priority: 10 + d, label: `Follow-up overdue ${d}d`, icon: "🔴" });
    } else if (a.followUp && a.followUp > today) {
      const d = daysBetween(today, a.followUp);
      if (d <= 3) items.push({ type: "upcoming", artist: a, priority: 7, label: `Follow-up in ${d}d`, icon: "🟡" });
    }
    if (a.priority >= 5 && a.stage === "prospect") items.push({ type: "hot", artist: a, priority: 9, label: "HOT - still in Prospect", icon: "🔥" });
    if (a.stage === "drafted") {
      const d = a.stageDate ? daysBetween(a.stageDate, today) : 0;
      items.push({ type: "draft", artist: a, priority: 6 + Math.min(d, 3), label: `Draft ${d}d - send it`, icon: "✎" });
    }
    if (a.stage === "sent" && a.stageDate) {
      const d = daysBetween(a.stageDate, today);
      if (d >= 7) items.push({ type: "stale", artist: a, priority: 5, label: `Sent ${d}d - no reply`, icon: "⏳" });
    }
    if (a.stage === "engaged" && !a.followUp) {
      items.push({ type: "engaged", artist: a, priority: 8, label: "Engaged - set next step", icon: "🤝" });
    }
    if (a.priority >= 3 && a.priority < 5 && a.stage === "prospect" && a.e) items.push({ type: "warm", artist: a, priority: 4, label: "WARM + email - start outreach", icon: "📧" });
    if (!a.owner && !isClosedStage(a.stage)) items.push({ type: "owner", artist: a, priority: 3, label: "No owner assigned", icon: "👤" });
  });

  Object.entries(sequenceState || {}).forEach(([name, ss]) => {
    if (!ss || ss.status !== "active" || !ss.nextDue || ss.nextDue > today) return;
    const artist = byName[name];
    if (!artist) return;
    const seq = SEQ_MAP[ss.sequenceId];
    const step = seq?.steps?.[ss.stepIndex];
    const overdue = daysBetween(ss.nextDue, today);
    items.push({
      type: "sequence",
      artist,
      priority: 11 + Math.max(overdue, 0),
      label: `Follow-up due: ${step?.label || "Next touch"}${overdue > 0 ? ` (${overdue}d overdue)` : ""}`,
      icon: "🧭",
    });
  });

  return items.sort((a, b) => b.priority - a.priority).slice(0, 30);
}

// ═══ STORAGE + CSV ═══
const STORAGE_PREFIX = "gemfinder-v7";
async function sGet(k) {
  try {
    if (window.storage?.get) {
      const r = await Promise.race([
        window.storage.get(k),
        new Promise(resolve => setTimeout(() => resolve(null), 1200)),
      ]);
      return r ? JSON.parse(r.value) : null;
    }
  } catch {}
  try {
    const raw = window.localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
async function sSet(k, v) {
  const raw = JSON.stringify(v);
  try {
    if (window.storage?.set) {
      await Promise.race([
        window.storage.set(k, raw),
        new Promise(resolve => setTimeout(resolve, 1200)),
      ]);
      return;
    }
  } catch (e) {
    console.error("save(storage):", e);
  }
  try {
    window.localStorage.setItem(k, raw);
  } catch (e) {
    console.error("save(localStorage):", e);
  }
}

async function apiGetProjects() {
  try {
    const res = await fetch("/api/ar/projects", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || "Could not load projects", projects: [], snapshots: [] };
    return {
      ok: true,
      projects: Array.isArray(data.projects) ? data.projects : [],
      snapshots: Array.isArray(data.snapshots) ? data.snapshots : [],
    };
  } catch {
    return { ok: false, error: "Network error loading projects", projects: [], snapshots: [] };
  }
}

async function apiSaveProjects(projects) {
  try {
    const res = await fetch("/api/ar/projects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projects }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || "Could not save projects" };
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error saving projects" };
  }
}

async function apiGetGmailStatus() {
  try {
    const res = await fetch("/api/ar/gmail/status", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || "Could not load Gmail status" };
    return {
      ok: true,
      available: !!data.available,
      currentUserConnected: !!data.currentUserConnected,
      currentUserGmail: data.currentUserGmail || "",
      currentConnection: data.currentConnection || null,
      connections: Array.isArray(data.connections) ? data.connections : [],
    };
  } catch {
    return { ok: false, error: "Network error loading Gmail status" };
  }
}

async function apiTestGmailProfile() {
  try {
    const res = await fetch("/api/ar/gmail/test-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || "Could not validate Gmail profile", code: data.code || "", details: data.details || "" };
    return { ok: true, ...data };
  } catch {
    return { ok: false, error: "Network error validating Gmail profile", code: "network_error", details: "" };
  }
}

async function apiTestGmailList() {
  try {
    const res = await fetch("/api/ar/gmail/test-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || "Could not validate Gmail API access", code: data.code || "", details: data.details || "" };
    return { ok: true, ...data };
  } catch {
    return { ok: false, error: "Network error validating Gmail API access", code: "network_error", details: "" };
  }
}

async function apiGetArtistInbox(projectId, artistName) {
  try {
    const params = new URLSearchParams({ projectId, artistName });
    const res = await fetch(`/api/ar/gmail/threads?${params.toString()}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || "Could not load inbox" };
    return {
      ok: true,
      threads: Array.isArray(data.threads) ? data.threads : [],
      messages: Array.isArray(data.messages) ? data.messages : [],
      connections: Array.isArray(data.connections) ? data.connections : [],
    };
  } catch {
    return { ok: false, error: "Network error loading inbox" };
  }
}

async function apiSyncArtistInbox(payload) {
  try {
    const res = await fetch("/api/ar/gmail/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || "Could not sync inbox" };
    return {
      ok: true,
      threads: Array.isArray(data.threads) ? data.threads : [],
      messages: Array.isArray(data.messages) ? data.messages : [],
      connections: Array.isArray(data.connections) ? data.connections : [],
      syncedUsers: Array.isArray(data.syncedUsers) ? data.syncedUsers : [],
      errors: Array.isArray(data.errors) ? data.errors : [],
    };
  } catch {
    return { ok: false, error: "Network error syncing inbox" };
  }
}

async function apiSendGmail(payload) {
  try {
    const res = await fetch("/api/ar/gmail/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || "Could not send Gmail message" };
    return {
      ok: true,
      threadKey: data.threadKey || "",
      externalThreadId: data.externalThreadId || "",
      senderGmailEmail: data.senderGmailEmail || "",
      threads: Array.isArray(data.threads) ? data.threads : [],
      messages: Array.isArray(data.messages) ? data.messages : [],
      connections: Array.isArray(data.connections) ? data.connections : [],
    };
  } catch {
    return { ok: false, error: "Network error sending Gmail message" };
  }
}

async function apiDisconnectGmail() {
  try {
    const res = await fetch("/api/ar/gmail/disconnect", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || "Could not disconnect Gmail" };
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error disconnecting Gmail" };
  }
}

async function apiGetProjectInbox(projectId, threadKey = "", threadKeys = []) {
  try {
    const params = new URLSearchParams({ projectId });
    if (threadKey) params.set("threadKey", threadKey);
    if (Array.isArray(threadKeys) && threadKeys.length) params.set("threadKeys", threadKeys.filter(Boolean).join(","));
    const res = await fetch(`/api/ar/gmail/project-threads?${params.toString()}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || "Could not load project inbox" };
    return {
      ok: true,
      threads: Array.isArray(data.threads) ? data.threads : [],
      messages: Array.isArray(data.messages) ? data.messages : [],
      connections: Array.isArray(data.connections) ? data.connections : [],
    };
  } catch {
    return { ok: false, error: "Network error loading project inbox" };
  }
}

async function apiUpdateGmailThread(payload) {
  try {
    const res = await fetch("/api/ar/gmail/thread", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || "Could not update thread" };
    return { ok: true, thread: data.thread || null };
  } catch {
    return { ok: false, error: "Network error updating thread" };
  }
}

async function apiDeleteGmailThreads(threadKeys) {
  try {
    const res = await fetch("/api/ar/gmail/thread", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadKeys }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || "Could not delete inbox thread" };
    return { ok: true, deleted: Number(data.deleted || 0) };
  } catch {
    return { ok: false, error: "Network error deleting inbox thread" };
  }
}

async function apiRelabelArtistInbox(payload) {
  try {
    const res = await fetch("/api/ar/gmail/relabel-artist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || "Could not relabel artist inbox" };
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error relabeling artist inbox" };
  }
}

function parseCSV(text) {
  const grid = parseCSVGrid(text);
  if (grid.length < 2) return [];
  const lines = grid.map(cols => cols.map(col => String(col || "").trim()));
  const headers = lines[0];
  const results = [];
  const seen = new Set();
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i];
    const row = {};
    headers.forEach((h, j) => { row[h] = vals[j] || ""; });
    const name = row["Artist"] || "";
    const canon = canonicalArtistName(name);
    if (!name || seen.has(canon)) continue;
    seen.add(canon);
    let email = row["Emaisl"] || row["Email"] || "";
    if (email && !email.includes("@")) email = "";
    const socRaw = row["Social"] || "";
    const soc = socRaw.startsWith("@") && !socRaw.includes("google.com") ? socRaw.replace(/^@/, "") : "";
    results.push({
      n: name,
      g: row["Genre/Vibe"] || "",
      l: row["Monthly Listeners"] || "",
      h: row["Hit Track + Streams"] || "",
      ig: row["IG/TikTok + Followers"] || "",
      soc,
      e: email,
      loc: row["Location"] || "",
      s: (row["Sent"] || "").toUpperCase() === "TRUE",
      o: row["Internal User"] || "",
    });
  }
  return results;
}

function normalizeSocialHandle(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const withoutUrl = raw
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^https?:\/\/(www\.)?tiktok\.com\//i, "")
    .replace(/^https?:\/\/(www\.)?x\.com\//i, "")
    .replace(/^https?:\/\/(www\.)?twitter\.com\//i, "");
  return withoutUrl.replace(/^@/, "").replace(/\/.*$/, "").trim();
}

function parseArtistNameCSV(text) {
  const lines = parseCSVGrid(text);
  if (!lines.length) return [];
  const firstRow = lines[0];
  const headerCandidates = ["artist", "artist name", "name", "artist_name", "artistname"];
  const headerIndex = firstRow.findIndex(h => headerCandidates.includes(h.toLowerCase()));
  const startIndex = headerIndex >= 0 ? 1 : 0;
  const nameIndex = headerIndex >= 0 ? headerIndex : 0;
  const seen = new Set();
  const names = [];
  for (let i = startIndex; i < lines.length; i++) {
    const cols = lines[i];
    const name = cols[nameIndex] || "";
    const canon = canonicalArtistName(name);
    if (!canon || seen.has(canon)) continue;
    seen.add(canon);
    names.push(name.trim());
  }
  return names;
}

function makeShareToken() {
  if (typeof window !== "undefined" && window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function omitKey(obj, key) {
  const next = { ...(obj || {}) };
  delete next[key];
  return next;
}

function renameObjectKey(obj, fromKey, toKey) {
  if (!obj || !fromKey || !toKey || fromKey === toKey) return { ...(obj || {}) };
  const next = { ...(obj || {}) };
  if (Object.prototype.hasOwnProperty.call(next, fromKey)) {
    next[toKey] = next[fromKey];
    delete next[fromKey];
  }
  return next;
}

function artistProfilePath(projectId, artistName, tab = "overview") {
  const params = new URLSearchParams({
    project: String(projectId || ""),
    artist: String(artistName || ""),
    tab: String(tab || "overview"),
  });
  return `/ar?${params.toString()}`;
}

function updateWorkspaceUrl(projectId = "", artistName = "", tab = "", assignmentId = "") {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (projectId) url.searchParams.set("project", String(projectId));
  else url.searchParams.delete("project");
  if (artistName) url.searchParams.set("artist", String(artistName));
  else url.searchParams.delete("artist");
  if (tab) url.searchParams.set("tab", String(tab));
  else url.searchParams.delete("tab");
  if (assignmentId) url.searchParams.set("assignment", String(assignmentId));
  else url.searchParams.delete("assignment");
  window.history.replaceState({}, "", `${url.pathname}${url.search || ""}${url.hash || ""}`);
}

function downloadCsvFile(filename, rows) {
  const csv = rows
    .map(row => row.map(cell => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportPipeline(proj, enriched) {
  const rows = [["Artist", "Owner", "Genre", "Bucket", "Listeners", "Hit Track", "Email", "Social", "Stage", "Priority", "Spotify", "Notes", "Follow-Up", "Follow-Up Plan", "Next Step", "Sends Logged"]];
  enriched.forEach(a => {
    const ss = proj.sequenceState?.[a.n];
    const seq = ss ? SEQ_MAP[ss.sequenceId] : null;
    const step = ss && seq ? seq.steps?.[ss.stepIndex] : null;
    const sends = (proj.sendLog || []).filter(s => s.artist === a.n).length;
    rows.push([
      a.n,
      proj.assignments?.[a.n] || "",
      a.g,
      a.bucket,
      a.l,
      a.h,
      a.e,
      a.soc,
      a.stage,
      pS(a) >= 5 ? "HOT" : pS(a) >= 3 ? "WARM" : "COOL",
      spotifyUrl(a.n),
      (a.note || "").replace(/,/g, ";"),
      a.followUp || "",
      ss ? `${seq?.name || ss.sequenceId} (${ss.status})` : "",
      step ? `${step.label}${ss?.nextDue ? ` @ ${ss.nextDue}` : ""}` : "",
      sends,
    ]);
  });
  downloadCsvFile(`${proj.name.replace(/\s+/g, "_")}_pipeline_v7.csv`, rows);
}

function exportMarketingItems(proj) {
  const rows = [[
    "Talent Name",
    "Talent Type",
    "Title",
    "Campaign",
    "Traffic Type",
    "Channels",
    "Deliverable Type",
    "Status",
    "Rejected Reason",
    "Owner",
    "Due Date",
    "Email",
    "Instagram URL",
    "Instagram Handle",
    "Instagram Followers",
    "TikTok URL",
    "TikTok Handle",
    "TikTok Followers",
    "Spotify URL",
    "Spotify Monthly Listeners",
    "Brief URL",
    "Content URL",
    "Notes",
    "Updated",
  ]];
  (proj?.marketingItems || []).forEach(item => {
    const normalized = normalizeMarketingItem(item, proj?.teamUsers || DEFAULT_TEAM_USERS);
    rows.push([
      normalized.talentName,
      normalized.talentType,
      normalized.title,
      normalized.campaign || "",
      normalized.trafficType,
      (normalized.channels || []).join(" | "),
      normalized.deliverableType,
      MM[normalized.status]?.label || normalized.status,
      normalized.rejectedReason,
      normalized.owner,
      normalized.dueDate,
      normalized.email,
      normalized.instagramUrl,
      normalized.instagramHandle ? `@${normalized.instagramHandle}` : "",
      normalized.instagramFollowers,
      normalized.tiktokUrl,
      normalized.tiktokHandle ? `@${normalized.tiktokHandle}` : "",
      normalized.tiktokFollowers,
      normalized.spotifyUrl,
      normalized.spotifyMonthlyListeners,
      normalized.briefUrl,
      normalized.contentUrl,
      normalized.notes.replace(/,/g, ";"),
      normalized.updatedAt,
    ]);
  });
  downloadCsvFile(`${proj.name.replace(/\s+/g, "_")}_marketing.csv`, rows);
}

export default function App({ authUserId = "", authEmail = "", authRole = "editor" } = {}) {
  const [dark, setDark] = useState(false);
  const [projects, setProjects] = useState([]);
  const [apId, setApId] = useState(null);
  const [screen, setScreen] = useState("hub");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const fr = useRef(null);
  const workspaceCsvRef = useRef(null);
  const rosterRef = useRef(null);
  const workSurfaceRef = useRef(null);
  const handledArtistLinkRef = useRef("");
  const handledMarketingLinkRef = useRef("");

  const [search, setSearch] = useState("");
  const [gf, setGf] = useState("All");
  const [sf, setSf] = useState("all");
  const [pf, setPf] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("__view__");
  const [sortBy, setSortBy] = useState("priority");

  const [selA, setSelA] = useState(null);
  const [draftTab, setDraftTab] = useState(0);
  const [drafts, setDrafts] = useState([]);
  const [copied, setCopied] = useState(null);

  const [aNote, setANote] = useState("");
  const [aFU, setAFU] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [npN, setNpN] = useState("");
  const [npD, setNpD] = useState("");
  const [newProjectType, setNewProjectType] = useState("ar");
  const [showAddArtist, setShowAddArtist] = useState(false);
  const [artistForm, setArtistForm] = useState({
    name: "",
    genre: "",
    listeners: "",
    hitTrack: "",
    social: "",
    email: "",
    location: "",
    curatorPageUrl: "",
    curatedArtists: [...EMPTY_CURATED_ARTIST_SLOTS],
    note: "",
  });
  const [manualArtistSaving, setManualArtistSaving] = useState(false);
  const [artistEditForm, setArtistEditForm] = useState({
    name: "",
    genre: "",
    listeners: "",
    hitTrack: "",
    social: "",
    email: "",
    location: "",
    curatorPageUrl: "",
    curatedArtists: [...EMPTY_CURATED_ARTIST_SLOTS],
  });
  const [artistEditSaving, setArtistEditSaving] = useState(false);
  const [showMarketingItemModal, setShowMarketingItemModal] = useState(false);
  const [marketingForm, setMarketingForm] = useState(() => emptyMarketingForm());
  const [marketingItemSaving, setMarketingItemSaving] = useState(false);
  const [campaignBankDraft, setCampaignBankDraft] = useState("");
  const [marketingStatusFilter, setMarketingStatusFilter] = useState("all");
  const [marketingCampaignFilter, setMarketingCampaignFilter] = useState("all");
  const [marketingTrafficFilter, setMarketingTrafficFilter] = useState("all");
  const [marketingOwnerFilter, setMarketingOwnerFilter] = useState("__view__");
  const [marketingGroupFilter, setMarketingGroupFilter] = useState("all");
  const [kickoffSelectionMode, setKickoffSelectionMode] = useState(false);
  const [selectedKickoffIds, setSelectedKickoffIds] = useState(new Set());
  const [kickoffSelectionOwnerDraft, setKickoffSelectionOwnerDraft] = useState("");
  const [marketingSelectionMode, setMarketingSelectionMode] = useState(false);
  const [selectedMarketingIds, setSelectedMarketingIds] = useState(new Set());
  const [marketingSelectionOwnerDraft, setMarketingSelectionOwnerDraft] = useState("");
  const [showMarketingBulkUpdateModal, setShowMarketingBulkUpdateModal] = useState(false);
  const [marketingBulkText, setMarketingBulkText] = useState("");
  const [marketingBulkDefaultCampaign, setMarketingBulkDefaultCampaign] = useState("");
  const [marketingBulkDefaultStatus, setMarketingBulkDefaultStatus] = useState("prospect");
  const [marketingBulkDefaultOwner, setMarketingBulkDefaultOwner] = useState("");
  const [showWorkspaceSourceRecords, setShowWorkspaceSourceRecords] = useState(false);
  const [showTalentProfileModal, setShowTalentProfileModal] = useState(false);
  const [selectedTalentProfileId, setSelectedTalentProfileId] = useState("");
  const [talentTargetProjectId, setTalentTargetProjectId] = useState("");
  const [talentTargetCampaign, setTalentTargetCampaign] = useState("");
  const [talentTargetNewCampaign, setTalentTargetNewCampaign] = useState("");
  const [talentTargetOwner, setTalentTargetOwner] = useState("");
  const [talentTargetStatus, setTalentTargetStatus] = useState("prospect");
  const [talentTargetSaving, setTalentTargetSaving] = useState(false);
  const [pendingWorkspaceAction, setPendingWorkspaceAction] = useState(null);
  const [liveCrmQuery, setLiveCrmQuery] = useState("");
  const [liveCrmTypeFilter, setLiveCrmTypeFilter] = useState("all");
  const [liveCrmSourceFilter, setLiveCrmSourceFilter] = useState("all");
  const [liveCrmOwnerFilter, setLiveCrmOwnerFilter] = useState("all");
  const [liveRosterViewMode, setLiveRosterViewMode] = useState("cards");
  const [kickoffQuery, setKickoffQuery] = useState("");
  const [kickoffTypeFilter, setKickoffTypeFilter] = useState("all");
  const [kickoffSourceFilter, setKickoffSourceFilter] = useState("all");
  const [kickoffOwnerFilter, setKickoffOwnerFilter] = useState("all");
  const [kickoffStageFilter, setKickoffStageFilter] = useState("all");
  const [kickoffViewMode, setKickoffViewMode] = useState("cards");

  const [batch, setBatch] = useState(false);
  const [bSel, setBSel] = useState(new Set());
  const [showHealth, setShowHealth] = useState(false);
  const [showFunnel, setShowFunnel] = useState(false);
  const [showAB, setShowAB] = useState(false);

  const [viewMode, setViewMode] = useState("list");
  const [intel, setIntel] = useState(null);
  const [intelLoading, setIntelLoading] = useState(false);

  const [showLog, setShowLog] = useState(false);
  const [logNoteDraft, setLogNoteDraft] = useState("");
  const [editLogNoteId, setEditLogNoteId] = useState("");
  const [editLogNoteText, setEditLogNoteText] = useState("");
  const [showFilters, setShowFilters] = useState(true);
  const [showQueue, setShowQueue] = useState(true);
  const [clockNow, setClockNow] = useState(() => new Date());
  const manualArtistSubmitRef = useRef(false);
  const marketingItemSubmitRef = useRef(false);
  const [reportStart, setReportStart] = useState(addDaysISO(todayISO(), -29));
  const [reportEnd, setReportEnd] = useState(todayISO());
  const [projectMode, setProjectMode] = useState("work");
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [showQuickDrawer, setShowQuickDrawer] = useState(false);

  const [aiDraftLoading, setAiDraftLoading] = useState(false);
  const [draftMode, setDraftMode] = useState("template");
  const [draftPlatform, setDraftPlatform] = useState("instagram_dm");
  const [templateNameDraft, setTemplateNameDraft] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  const [showDiscover, setShowDiscover] = useState(false);
  const [discQuery, setDiscQuery] = useState("");
  const [discResults, setDiscResults] = useState([]);
  const [discLoading, setDiscLoading] = useState(false);
  const [showModels, setShowModels] = useState(false);
  const [showTeam, setShowTeam] = useState(false);
  const [newWorkspaceContact, setNewWorkspaceContact] = useState("");
  const [newTeamUser, setNewTeamUser] = useState("");
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState(DEFAULT_WORKSPACE.id);
  const [workspaceUser, setWorkspaceUser] = useState(ALL_USER_VIEW);
  const [layoutByUser, setLayoutByUser] = useState({});
  const [focusMode, setFocusMode] = useState(false);
  const [preFocusLayout, setPreFocusLayout] = useState(null);

  const [seqPick, setSeqPick] = useState(SEQUENCES[0].id);
  const [sendProvider, setSendProvider] = useState("gmail");
  const [autoLogCompose, setAutoLogCompose] = useState(false);
  const [aiKeySet, setAiKeySet] = useState(false);
  const [dragArtistName, setDragArtistName] = useState("");
  const [dragOverStage, setDragOverStage] = useState("");
  const [replyInput, setReplyInput] = useState("");
  const [replyResult, setReplyResult] = useState(null);
  const [replyLoading, setReplyLoading] = useState(false);
  const [followUpDraft, setFollowUpDraft] = useState("");
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [improveLoading, setImproveLoading] = useState(false);
  const [detailTab, setDetailTab] = useState("outreach");
  const [gmailStatus, setGmailStatus] = useState({
    available: false,
    currentUserConnected: false,
    currentUserGmail: "",
    currentConnection: null,
    connections: [],
  });
  const [gmailStatusLoading, setGmailStatusLoading] = useState(false);
  const [gmailProfileTesting, setGmailProfileTesting] = useState(false);
  const [gmailListTesting, setGmailListTesting] = useState(false);
  const [gmailBanner, setGmailBanner] = useState(null);
  const [artistInbox, setArtistInbox] = useState({ threads: [], messages: [], connections: [] });
  const [projectInbox, setProjectInbox] = useState({ threads: [], messages: [], connections: [] });
  const [projectInboxLoading, setProjectInboxLoading] = useState(false);
  const [selectedProjectThreadKey, setSelectedProjectThreadKey] = useState("");
  const [inboxArtistQuery, setInboxArtistQuery] = useState("");
  const [inboxStageFilter, setInboxStageFilter] = useState("all");
  const [inboxOwnerFilter, setInboxOwnerFilter] = useState("all");
  const [inboxMailboxFilter, setInboxMailboxFilter] = useState("all");
  const [inboxNeedsReplyOnly, setInboxNeedsReplyOnly] = useState(false);
  const [inboxInboundDays, setInboxInboundDays] = useState("all");
  const [threadWorkflowSaving, setThreadWorkflowSaving] = useState(false);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [syncingInbox, setSyncingInbox] = useState(false);
  const [selectedThreadKey, setSelectedThreadKey] = useState("");
  const [gmailSendUserId, setGmailSendUserId] = useState(authUserId || "");
  const [gmailReplyDraft, setGmailReplyDraft] = useState("");
  const [gmailSending, setGmailSending] = useState(false);
  const [artistThreadNoteDraft, setArtistThreadNoteDraft] = useState("");
  const [projectThreadNoteDraft, setProjectThreadNoteDraft] = useState("");
  const availableGmailConnections = useMemo(() => {
    const entries = [
      ...(Array.isArray(gmailStatus.connections) ? gmailStatus.connections : []),
      ...(Array.isArray(artistInbox.connections) ? artistInbox.connections : []),
      ...(Array.isArray(projectInbox.connections) ? projectInbox.connections : []),
    ];
    const map = new Map();
    entries.forEach(item => {
      if (!item?.userId || !item?.connected) return;
      if (!map.has(item.userId)) map.set(item.userId, item);
    });
    return [...map.values()];
  }, [gmailStatus.connections, artistInbox.connections, projectInbox.connections]);
  const authLabel = authEmail || authUserId || "Signed in";
  const roleLabel = authRole === "admin" ? "admin" : authRole === "viewer" ? "viewer" : "editor";
  const canEdit = roleLabel !== "viewer";
  const isAdmin = roleLabel === "admin";
  const isReadOnly = !canEdit;
  const storageKey = authUserId ? `${STORAGE_PREFIX}:${authUserId}` : STORAGE_PREFIX;
  const workspaces = useMemo(() => {
    const byId = new Map();
    projects.forEach(project => {
      const normalized = normalizeProject(project);
      if (!byId.has(normalized.workspaceId)) {
        byId.set(normalized.workspaceId, {
          id: normalized.workspaceId,
          name: normalized.workspaceName || DEFAULT_WORKSPACE.name,
          slug: normalized.workspaceSlug || DEFAULT_WORKSPACE.slug,
          roles: new Set(),
          projects: [],
        });
      }
      const workspace = byId.get(normalized.workspaceId);
      workspace.roles.add(normalized.workspaceRole);
      workspace.projects.push(normalized);
    });
    return [...byId.values()]
      .map(workspace => {
        const roleList = [...workspace.roles];
        const summary = workspace.projects.reduce((acc, project) => {
          if (normalizeProjectType(project.type) === "marketing") {
            const mk = summarizeMarketingItems(project.marketingItems || [], operationalTodayISOFor(clockNow));
            acc.live += new Set((project.marketingItems || []).map(item => canonicalArtistName(item.talentName))).size;
            acc.assignments += mk.items;
            acc.complete += mk.complete;
            acc.campaigns += mk.campaigns;
          } else {
            acc.kickoff += project.artists?.length || 0;
            if (normalizeProjectType(project.type) === "curator") acc.curators += project.artists?.length || 0;
          }
          return acc;
        }, { kickoff: 0, live: 0, assignments: 0, complete: 0, campaigns: 0, curators: 0 });
        return {
          ...workspace,
          roles: roleList,
          summary,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [projects, clockNow]);
  const selectedWorkspace = useMemo(
    () => workspaces.find(workspace => workspace.id === currentWorkspaceId) || workspaces[0] || { ...DEFAULT_WORKSPACE, projects: [], roles: [], summary: { kickoff: 0, live: 0, assignments: 0, complete: 0, campaigns: 0, curators: 0 } },
    [workspaces, currentWorkspaceId]
  );
  const workspaceProjects = selectedWorkspace?.projects || [];
  const kickoffArtistProjects = useMemo(
    () => workspaceProjects.filter(project => normalizeProjectType(project.type) === "ar"),
    [workspaceProjects]
  );
  const kickoffCuratorProjects = useMemo(
    () => workspaceProjects.filter(project => normalizeProjectType(project.type) === "curator"),
    [workspaceProjects]
  );
  const liveMarketingProjects = useMemo(
    () => workspaceProjects.filter(project => normalizeProjectType(project.type) === "marketing"),
    [workspaceProjects]
  );
  const defaultKickoffArtistProject = kickoffArtistProjects[0] || null;
  const defaultKickoffCuratorProject = kickoffCuratorProjects[0] || null;
  const defaultLiveMarketingProject = liveMarketingProjects[0] || null;
  const workspaceProjectIds = useMemo(
    () => new Set(workspaceProjects.map(project => project.id)),
    [workspaceProjects]
  );
  const proj = projects.find(p => p.id === apId);
  const projectType = normalizeProjectType(proj?.type);
  const isMarketingProject = projectType === "marketing";
  const isCuratorProject = projectType === "curator";
  const isArProject = projectType === "ar";
  const workspaceTeamUsers = useMemo(
    () => normalizeTeamUsers([
      ...DEFAULT_TEAM_USERS,
      ...projects.flatMap(project => Array.isArray(project?.teamUsers) ? project.teamUsers : []),
    ]),
    [projects]
  );
  const workspaceTalentData = useMemo(() => collectWorkspaceTalentProfiles(projects), [projects]);
  const workspaceTalentProfiles = workspaceTalentData.profiles;
  const liveCrmBaseProfiles = useMemo(
    () => workspaceTalentProfiles.filter(profile => profile.platformLifecycle === "live" && profile.projectMemberships.some(item => workspaceProjectIds.has(item.projectId))),
    [workspaceTalentProfiles, workspaceProjectIds]
  );
  const liveCrmTypeOptions = useMemo(
    () => uniqStrings(liveCrmBaseProfiles.flatMap(profile => profile.talentTypes || []).filter(Boolean)).sort((a, b) => a.localeCompare(b)),
    [liveCrmBaseProfiles]
  );
  const liveCrmSourceOptions = useMemo(
    () => uniqStrings(liveCrmBaseProfiles.flatMap(profile => profile.sources || []).filter(Boolean)),
    [liveCrmBaseProfiles]
  );
  const liveCrmOwnerOptions = useMemo(
    () => uniqStrings(liveCrmBaseProfiles.flatMap(profile => [
      ...profile.marketingAssignments.map(item => item.owner),
      ...profile.arRecords.map(item => item.owner),
    ].filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [liveCrmBaseProfiles]
  );
  const liveCrmProfiles = useMemo(() => {
    const query = liveCrmQuery.trim().toLowerCase();
    return liveCrmBaseProfiles
      .map(profile => {
        const byProject = new Map();
        const ensureProjectSummary = (projectId, projectName, projectType) => {
          const key = String(projectId || "");
          if (!byProject.has(key)) {
            byProject.set(key, {
              projectId: key,
              projectName: projectName || "Untitled Project",
              projectType: normalizeProjectType(projectType),
              owners: [],
              arStages: [],
              marketingStatuses: [],
              campaigns: [],
              lastTouched: "",
              leadAssignmentId: "",
            });
          }
          return byProject.get(key);
        };

        profile.projectMemberships.filter(item => workspaceProjectIds.has(item.projectId)).forEach(item => {
          ensureProjectSummary(item.projectId, item.projectName, item.projectType);
        });

        profile.arRecords.filter(record => workspaceProjectIds.has(record.projectId)).forEach(record => {
          const summary = ensureProjectSummary(record.projectId, record.projectName, record.projectType || "ar");
          if (record.owner) summary.owners.push(record.owner);
          if (record.stage) summary.arStages.push(record.stage);
        });

        profile.marketingAssignments.filter(item => workspaceProjectIds.has(item.projectId)).forEach(item => {
          const summary = ensureProjectSummary(item.projectId, item.projectName, "marketing");
          if (item.owner) summary.owners.push(item.owner);
          if (item.status) summary.marketingStatuses.push(item.status);
          normalizeMarketingCampaigns(item.campaigns?.length ? item.campaigns : item.campaign).forEach(campaign => {
            summary.campaigns.push(campaign);
          });
          if (!summary.leadAssignmentId) summary.leadAssignmentId = item.id || "";
          if (!summary.lastTouched || String(item.updatedAt || "") > summary.lastTouched) {
            summary.lastTouched = String(item.updatedAt || "");
          }
        });

        const projectSummaries = [...byProject.values()]
          .map(summary => ({
            ...summary,
            owners: uniqStrings(summary.owners.filter(Boolean)),
            arStages: uniqStrings(summary.arStages.filter(Boolean)),
            marketingStatuses: uniqStrings(summary.marketingStatuses.filter(Boolean)),
            campaigns: uniqStrings(summary.campaigns.filter(Boolean)),
          }))
          .sort((a, b) => {
            const timeCompare = String(b.lastTouched || "").localeCompare(String(a.lastTouched || ""));
            if (timeCompare !== 0) return timeCompare;
            return a.projectName.localeCompare(b.projectName);
          });

        const owners = uniqStrings(projectSummaries.flatMap(item => item.owners));
        const campaigns = uniqStrings(projectSummaries.flatMap(item => item.campaigns));
        const searchHaystack = [
          profile.displayName,
          profile.primaryEmail,
          ...(profile.aliases || []),
          ...(profile.talentTypes || []),
          ...(profile.sources || []),
          profile.instagramHandle,
          profile.tiktokHandle,
          ...projectSummaries.map(item => item.projectName),
          ...campaigns,
        ].filter(Boolean).join(" ").toLowerCase();

        const lastTouched = [
          ...projectSummaries.map(item => String(item.lastTouched || "")),
          ...profile.marketingAssignments.filter(item => workspaceProjectIds.has(item.projectId)).map(item => String(item.updatedAt || "")),
          ...profile.arRecords.filter(item => workspaceProjectIds.has(item.projectId)).map(item => String(item.updatedAt || "")),
        ].filter(Boolean).sort((a, b) => b.localeCompare(a))[0] || "";

        return {
          ...profile,
          owners,
          campaigns,
          projectSummaries,
          searchHaystack,
          lastTouched,
          primaryProjectId: projectSummaries[0]?.projectId || "",
          primaryAssignmentId: projectSummaries[0]?.leadAssignmentId || "",
        };
      })
      .filter(profile => {
        if (query && !profile.searchHaystack.includes(query)) return false;
        if (liveCrmTypeFilter !== "all" && !profile.talentTypes.some(type => canonicalArtistName(type) === liveCrmTypeFilter)) return false;
        if (liveCrmSourceFilter !== "all" && !profile.sources.includes(liveCrmSourceFilter)) return false;
        if (liveCrmOwnerFilter === "__unassigned__" && profile.owners.length) return false;
        if (liveCrmOwnerFilter !== "all" && liveCrmOwnerFilter !== "__unassigned__" && !profile.owners.includes(liveCrmOwnerFilter)) return false;
        return true;
      })
      .sort((a, b) => {
        const timeCompare = String(b.lastTouched || "").localeCompare(String(a.lastTouched || ""));
        if (timeCompare !== 0) return timeCompare;
        return a.displayName.localeCompare(b.displayName);
      });
  }, [liveCrmBaseProfiles, liveCrmOwnerFilter, liveCrmQuery, liveCrmSourceFilter, liveCrmTypeFilter, workspaceProjectIds]);
  const liveCrmOverview = useMemo(() => {
    const projectsSeen = new Set();
    const campaignsSeen = new Set();
    let marketingAssignments = 0;
    let internalArtists = 0;
    let curators = 0;
    let creators = 0;
    liveCrmProfiles.forEach(profile => {
      profile.projectSummaries.forEach(summary => {
        projectsSeen.add(summary.projectId || summary.projectName);
        summary.campaigns.forEach(campaign => campaignsSeen.add(campaign));
      });
      marketingAssignments += profile.marketingAssignments.filter(item => workspaceProjectIds.has(item.projectId)).length;
      if (profile.talentTypes.includes("Internal Artist")) internalArtists += 1;
      if (profile.talentTypes.includes("Curator")) curators += 1;
      if (profile.talentTypes.some(type => type === "Content Creator" || type === "AI UGC")) creators += 1;
    });
    return {
      liveTalents: liveCrmProfiles.length,
      projects: projectsSeen.size,
      campaigns: campaignsSeen.size,
      assignments: marketingAssignments,
      internalArtists,
      curators,
      creators,
    };
  }, [liveCrmProfiles, workspaceProjectIds]);
  const kickoffBaseProfiles = useMemo(
    () => workspaceTalentProfiles.filter(
      profile =>
        profile.platformLifecycle !== "live" &&
        profile.arRecords.some(record => workspaceProjectIds.has(record.projectId))
    ),
    [workspaceTalentProfiles, workspaceProjectIds]
  );
  const kickoffTypeOptions = useMemo(
    () => uniqStrings(kickoffBaseProfiles.flatMap(profile => profile.talentTypes || []).filter(Boolean)).sort((a, b) => a.localeCompare(b)),
    [kickoffBaseProfiles]
  );
  const kickoffSourceOptions = useMemo(
    () => uniqStrings(kickoffBaseProfiles.flatMap(profile => profile.sources || []).filter(Boolean)),
    [kickoffBaseProfiles]
  );
  const kickoffOwnerOptions = useMemo(
    () => uniqStrings(kickoffBaseProfiles.flatMap(profile => profile.arRecords.map(record => record.owner).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [kickoffBaseProfiles]
  );
  const kickoffProfiles = useMemo(() => {
    const query = kickoffQuery.trim().toLowerCase();
    return kickoffBaseProfiles
      .map(profile => {
        const projectSummaries = profile.arRecords
          .filter(record => workspaceProjectIds.has(record.projectId))
          .reduce((map, record) => {
            const key = String(record.projectId || "");
            if (!map.has(key)) {
              map.set(key, {
                projectId: key,
                projectName: record.projectName || "Untitled Project",
                projectType: normalizeProjectType(record.projectType || "ar"),
                owners: [],
                stages: [],
                genres: [],
                locations: [],
                leadArtistName: "",
              });
            }
            const summary = map.get(key);
            if (record.owner) summary.owners.push(record.owner);
            if (record.stage) summary.stages.push(record.stage);
            if (record.genre) summary.genres.push(record.genre);
            if (record.location) summary.locations.push(record.location);
            if (!summary.leadArtistName) summary.leadArtistName = record.artistName || "";
            return map;
          }, new Map());

        const normalizedProjectSummaries = [...projectSummaries.values()]
          .map(summary => ({
            ...summary,
            owners: uniqStrings(summary.owners.filter(Boolean)),
            stages: uniqStrings(summary.stages.filter(Boolean)),
            genres: uniqStrings(summary.genres.filter(Boolean)),
            locations: uniqStrings(summary.locations.filter(Boolean)),
          }))
          .sort((a, b) => a.projectName.localeCompare(b.projectName));

        const owners = uniqStrings(normalizedProjectSummaries.flatMap(item => item.owners));
        const stages = uniqStrings(normalizedProjectSummaries.flatMap(item => item.stages));
        const searchHaystack = [
          profile.displayName,
          profile.primaryEmail,
          ...(profile.aliases || []),
          ...(profile.talentTypes || []),
          ...(profile.sources || []),
          profile.instagramHandle,
          profile.tiktokHandle,
          ...normalizedProjectSummaries.map(item => item.projectName),
          ...owners,
          ...stages,
        ].filter(Boolean).join(" ").toLowerCase();

        return {
          ...profile,
          owners,
          stages,
          projectSummaries: normalizedProjectSummaries,
          primaryProjectId: normalizedProjectSummaries[0]?.projectId || "",
          primaryArtistName: normalizedProjectSummaries[0]?.leadArtistName || "",
          searchHaystack,
        };
      })
      .filter(profile => {
        if (query && !profile.searchHaystack.includes(query)) return false;
        if (kickoffTypeFilter !== "all" && !profile.talentTypes.some(type => canonicalArtistName(type) === kickoffTypeFilter)) return false;
        if (kickoffSourceFilter !== "all" && !profile.sources.includes(kickoffSourceFilter)) return false;
        if (kickoffOwnerFilter === "__unassigned__" && profile.owners.length) return false;
        if (kickoffOwnerFilter !== "all" && kickoffOwnerFilter !== "__unassigned__" && !profile.owners.includes(kickoffOwnerFilter)) return false;
        if (kickoffStageFilter !== "all" && !profile.stages.includes(kickoffStageFilter)) return false;
        return true;
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [kickoffBaseProfiles, kickoffOwnerFilter, kickoffQuery, kickoffSourceFilter, kickoffStageFilter, kickoffTypeFilter, workspaceProjectIds]);
  const kickoffOverview = useMemo(() => {
    const projectsSeen = new Set();
    const ownersSeen = new Set();
    const stages = { prospect: 0, contacted: 0, engaged: 0, won: 0, live: 0 };
    let curators = 0;
    let artists = 0;
    kickoffProfiles.forEach(profile => {
      if (profile.talentTypes.includes("Curator")) curators += 1;
      else artists += 1;
      const bucket = kickoffStageBucket(profile.stages);
      stages[bucket] = (stages[bucket] || 0) + 1;
      profile.projectSummaries.forEach(summary => {
        projectsSeen.add(summary.projectId || summary.projectName);
        summary.owners.forEach(owner => ownersSeen.add(owner));
      });
    });
    return {
      talents: kickoffProfiles.length,
      projects: projectsSeen.size,
      owners: ownersSeen.size,
      artists,
      curators,
      stages,
    };
  }, [kickoffProfiles]);
  const kickoffBoardColumns = useMemo(
    () => KICKOFF_STAGE_ACTIONS
      .filter(stage => stage.id !== "live")
      .map(stage => ({
        ...stage,
        profiles: kickoffProfiles.filter(profile => kickoffStageBucket(profile.stages) === stage.id),
      })),
    [kickoffProfiles]
  );
  const summarizeWorkspaceValues = useCallback((values, limit = 2, mapValue = value => value) => {
    const uniq = uniqStrings((values || []).filter(Boolean));
    if (!uniq.length) return "—";
    const rendered = uniq.map(mapValue).filter(Boolean);
    if (!rendered.length) return "—";
    if (rendered.length > limit) return `${rendered.slice(0, limit).join(", ")} +${rendered.length - limit}`;
    return rendered.join(", ");
  }, []);
  const kickoffStageSummaryLabel = useCallback(
    profile => SM[kickoffStageBucket(profile.stages)]?.label || "Prospect",
    []
  );
  const liveStatusSummaryLabel = useCallback(profile => {
    const statuses = uniqStrings(profile.projectSummaries.flatMap(summary => summary.marketingStatuses || []).filter(Boolean));
    if (!statuses.length) return "No campaign status";
    const labels = statuses.map(status => MM[status]?.label || titleCaseWords(status));
    if (labels.length > 2) return `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
    return labels.join(", ");
  }, []);
  const exportKickoffView = () => {
    if (!kickoffProfiles.length) {
      flash("No kickoff talent in the current view yet", "err");
      return;
    }
    const rows = [[
      "Talent Name",
      "Lifecycle",
      "Talent Types",
      "Sources",
      "Primary Email",
      "Instagram",
      "TikTok",
      "Spotify",
      "Source Record Count",
      "Source Records",
      "Owners",
      "Stages",
      "Curator Page",
      "Curated Artists",
    ]];
    kickoffProfiles.forEach(profile => {
      rows.push([
        profile.displayName,
        TALENT_LIFECYCLE_LABELS[profile.platformLifecycle] || "Pre-Live",
        (profile.talentTypes || []).join(" | "),
        (profile.sources || []).map(source => TALENT_SOURCE_LABELS[source] || source).join(" | "),
        profile.primaryEmail || "",
        profile.instagramHandle ? `@${profile.instagramHandle}` : "",
        profile.tiktokHandle ? `@${profile.tiktokHandle}` : "",
        profile.spotifyUrl || "",
        profile.projectSummaries.length,
        profile.projectSummaries.map(summary => summary.projectName).join(" | "),
        profile.owners.join(" | "),
        profile.stages.map(stage => SM[stage]?.label || titleCaseWords(stage)).join(" | "),
        profile.curatorPageUrl || "",
        (profile.curatedArtists || []).join(" | "),
      ]);
    });
    downloadCsvFile(`${selectedWorkspace.name.replace(/\s+/g, "_")}_kickoff_view.csv`, rows);
    flash(`Exported ${kickoffProfiles.length} kickoff row${kickoffProfiles.length === 1 ? "" : "s"}`);
  };
  const exportLiveRosterView = () => {
    if (!liveCrmProfiles.length) {
      flash("No live roster talent in the current view yet", "err");
      return;
    }
    const rows = [[
      "Talent Name",
      "Lifecycle",
      "Talent Types",
      "Sources",
      "Primary Email",
      "Instagram",
      "TikTok",
      "Spotify",
      "Active Project Count",
      "Projects",
      "Owners",
      "Campaigns",
      "Marketing Statuses",
      "Assignment Count",
      "Last Updated",
    ]];
    liveCrmProfiles.forEach(profile => {
      const lastTouched = profile.projectSummaries
        .map(summary => summary.lastTouched)
        .filter(Boolean)
        .sort()
        .slice(-1)[0] || "";
      rows.push([
        profile.displayName,
        TALENT_LIFECYCLE_LABELS[profile.platformLifecycle] || "Live",
        (profile.talentTypes || []).join(" | "),
        (profile.sources || []).map(source => TALENT_SOURCE_LABELS[source] || source).join(" | "),
        profile.primaryEmail || "",
        profile.instagramHandle ? `@${profile.instagramHandle}` : "",
        profile.tiktokHandle ? `@${profile.tiktokHandle}` : "",
        profile.spotifyUrl || "",
        profile.projectSummaries.length,
        profile.projectSummaries.map(summary => summary.projectName).join(" | "),
        profile.owners.join(" | "),
        profile.campaigns.join(" | "),
        uniqStrings(profile.projectSummaries.flatMap(summary => summary.marketingStatuses || []))
          .map(status => MM[status]?.label || titleCaseWords(status))
          .join(" | "),
        profile.marketingAssignments.length,
        lastTouched,
      ]);
    });
    downloadCsvFile(`${selectedWorkspace.name.replace(/\s+/g, "_")}_live_roster_view.csv`, rows);
    flash(`Exported ${liveCrmProfiles.length} live roster row${liveCrmProfiles.length === 1 ? "" : "s"}`);
  };
  const workspaceTalentProfileMap = useMemo(
    () => new Map(workspaceTalentProfiles.map(profile => [profile.id, profile])),
    [workspaceTalentProfiles]
  );
  const selectedTalentProfile = useMemo(
    () => workspaceTalentProfileMap.get(selectedTalentProfileId) || null,
    [workspaceTalentProfileMap, selectedTalentProfileId]
  );
  const kickoffSelectedProfiles = useMemo(
    () => [...selectedKickoffIds]
      .map(id => workspaceTalentProfileMap.get(id))
      .filter(profile => profile && profile.platformLifecycle !== "live"),
    [selectedKickoffIds, workspaceTalentProfileMap]
  );
  const kickoffSelectedRecordCount = useMemo(
    () => kickoffSelectedProfiles.reduce(
      (sum, profile) => sum + profile.arRecords.filter(record => workspaceProjectIds.has(record.projectId)).length,
      0
    ),
    [kickoffSelectedProfiles, workspaceProjectIds]
  );
  const selectedTalentProjectSummaries = useMemo(() => {
    if (!selectedTalentProfile) return [];
    const byProject = new Map();
    const ensureProjectSummary = (projectId, projectName, projectType, kind) => {
      const key = String(projectId || "");
      if (!byProject.has(key)) {
        byProject.set(key, {
          projectId: key,
          projectName: projectName || "Untitled Project",
          projectType: normalizeProjectType(projectType),
          membershipKinds: [],
          arRecords: [],
          marketingAssignments: [],
        });
      }
      const summary = byProject.get(key);
      summary.membershipKinds.push(kind);
      return summary;
    };

    selectedTalentProfile.projectMemberships.forEach(item => {
      ensureProjectSummary(item.projectId, item.projectName, item.projectType, item.kind);
    });

    selectedTalentProfile.arRecords.forEach(record => {
      const summary = ensureProjectSummary(record.projectId, record.projectName, record.projectType || "ar", "ar");
      summary.arRecords.push(record);
    });

    selectedTalentProfile.marketingAssignments.forEach(assignment => {
      const summary = ensureProjectSummary(assignment.projectId, assignment.projectName, "marketing", "marketing");
      summary.marketingAssignments.push(assignment);
    });

    return [...byProject.values()]
      .map(summary => ({
        ...summary,
        membershipKinds: uniqStrings(summary.membershipKinds.filter(Boolean)),
        owners: uniqStrings([
          ...summary.arRecords.map(record => record.owner),
          ...summary.marketingAssignments.map(assignment => assignment.owner),
        ].filter(Boolean)),
        arStages: uniqStrings(summary.arRecords.map(record => record.stage).filter(Boolean)),
        marketingStatuses: uniqStrings(summary.marketingAssignments.map(assignment => assignment.status).filter(Boolean)),
      }))
      .sort((a, b) => a.projectName.localeCompare(b.projectName));
  }, [selectedTalentProfile]);
  const selectedTalentArProjectSummaries = useMemo(
    () => selectedTalentProjectSummaries.filter(summary => summary.arRecords.length),
    [selectedTalentProjectSummaries]
  );
  const selectedTalentMarketingProjectSummaries = useMemo(
    () => selectedTalentProjectSummaries.filter(summary => summary.marketingAssignments.length),
    [selectedTalentProjectSummaries]
  );
  const selectedTalentRecentActivity = useMemo(
    () => (selectedTalentProfile?.recentActivity || []).slice(0, 16),
    [selectedTalentProfile]
  );
  const talentTargetProject = useMemo(
    () => projects.find(project => project.id === talentTargetProjectId) || null,
    [projects, talentTargetProjectId]
  );
  const talentTargetProjectType = normalizeProjectType(talentTargetProject?.type);
  const talentTargetTeamUsers = talentTargetProject?.teamUsers || DEFAULT_TEAM_USERS;
  const talentTargetProjectOptions = useMemo(
    () => projects.map(project => ({
      id: project.id,
      label: `${project.name} · ${projectTypeLabel(project.type)}`,
      type: normalizeProjectType(project.type),
    })),
    [projects]
  );
  const talentTargetCampaignOptions = useMemo(() => {
    if (!talentTargetProject || talentTargetProjectType !== "marketing") return [];
    const normalizedProject = normalizeProject(talentTargetProject);
    return normalizeMarketingCampaignBank([
      ...(normalizedProject.settings?.marketingCampaignBank || []),
      ...normalizedProject.marketingItems.flatMap(item => item.campaigns || []),
    ]);
  }, [talentTargetProject, talentTargetProjectType]);
  const talentTargetExistingArRecord = useMemo(
    () => selectedTalentProfile?.arRecords.find(record => record.projectId === talentTargetProjectId) || null,
    [selectedTalentProfile, talentTargetProjectId]
  );
  const talentTargetMarketingAssignments = useMemo(
    () => selectedTalentProfile?.marketingAssignments.filter(record => record.projectId === talentTargetProjectId) || [],
    [selectedTalentProfile, talentTargetProjectId]
  );
  const talentTargetCampaignName = useMemo(
    () => String(talentTargetNewCampaign || talentTargetCampaign || "").trim(),
    [talentTargetCampaign, talentTargetNewCampaign]
  );
  const talentTargetExistingMarketingAssignment = useMemo(() => {
    if (!talentTargetCampaignName) return null;
    const targetKey = canonicalArtistName(talentTargetCampaignName);
    return talentTargetMarketingAssignments.find(record =>
      (record.campaigns?.length ? record.campaigns : [record.campaign || ""]).some(campaign => canonicalArtistName(campaign) === targetKey)
    ) || null;
  }, [talentTargetMarketingAssignments, talentTargetCampaignName]);
  const sessionUserName = useMemo(
    () => resolveSessionUserName(authEmail, authUserId, proj?.teamUsers || DEFAULT_TEAM_USERS),
    [authEmail, authUserId, proj?.teamUsers],
  );
  const defaultWorkspaceUser = sessionUserName || "Greg";
  const currentActor = sessionUserName || authEmail || authUserId || "Unknown";
  const reportScopeMode = workspaceUser === ALL_USER_VIEW ? "team" : "workspace";
  const reportViewLabel = workspaceUser === ALL_USER_VIEW ? "All" : workspaceUser === UNASSIGNED_USER_VIEW ? "Unassigned" : workspaceUser;
  const gmailConnectionMeta = gmailStatus.currentConnection || null;
  const gmailConnected = !!gmailConnectionMeta?.connected;
  const fmtDateTime = useCallback((iso) => {
    if (!iso) return "Never";
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return "Never";
    return dt.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }, []);
  const setGmailBannerMessage = useCallback((kind, message, details = "") => {
    setGmailBanner({ kind, message, details });
  }, []);

  const currentAccent = proj?.settings?.appearance?.accent || "blue";
  const C = applyAccentTheme(dark ? DK : LT, currentAccent, dark);
  const gmailBannerTone = gmailBanner?.kind === "error"
    ? { border: C.rbd, bg: C.rb, fg: C.rd }
    : gmailBanner?.kind === "success"
      ? { border: C.gd, bg: C.gb, fg: C.gn }
      : { border: C.bd, bg: C.sa, fg: C.ts };
  const ft = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
  const mn = "'JetBrains Mono','Fira Code','SF Mono',monospace";
  const mkP = (a, cl, bg) => ({
    padding: "5px 12px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: a ? 600 : 500,
    border: `1px solid ${a ? cl : C.bd}`,
    cursor: "pointer",
    fontFamily: ft,
    background: a ? bg : C.sf,
    color: a ? cl : C.ts,
    transition: "all 0.15s",
    whiteSpace: "nowrap",
  });
  const iS = { padding: "8px 12px", border: `1px solid ${C.bd}`, borderRadius: 10, fontSize: 13, fontFamily: ft, outline: "none", color: C.tx, background: C.sf, boxSizing: "border-box" };
  const cS = { background: C.cb, border: `1px solid ${C.bd}`, borderRadius: 16, boxShadow: C.sw };
  const css = `
    @keyframes si{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}
    @keyframes fu{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    html,body,#root{margin:0;padding:0;cursor:default;background:${C.bg}}
    input[type="file"]{display:none}
    ::selection{background:${C.ac}2b}
    ::-webkit-scrollbar{width:6px}
    ::-webkit-scrollbar-track{background:transparent}
    ::-webkit-scrollbar-thumb{background:${C.bd};border-radius:3px}
    .gf-project-shell{display:grid;grid-template-columns:344px minmax(0,1fr);min-height:100vh;background:${C.bg}}
    .gf-project-sidebar{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;background:${C.sf};border-right:1px solid ${C.bd}}
    .gf-project-sidebar-card{border:1px solid ${C.bd};border-radius:24px;background:${C.sa};box-shadow:${C.sw}}
    .gf-project-sidebar-section{padding:20px 22px}
    .gf-project-main{min-width:0;background:${C.bg}}
    .gf-project-main-inner{padding:30px 36px 42px}
    .gf-project-hero{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(280px,0.95fr);gap:16px;margin-bottom:18px}
    .gf-project-headline{font-size:40px;font-weight:800;letter-spacing:-0.05em;line-height:1.02;color:${C.tx}}
    .gf-project-kicker{font-size:11px;font-weight:700;letter-spacing:2.2px;text-transform:uppercase;color:${C.ac};margin-bottom:10px}
    .gf-project-subline{font-size:14px;color:${C.ts};line-height:1.75}
    .gf-project-sidebar-nav{display:grid;gap:8px}
    .gf-project-nav-btn{display:flex;align-items:flex-start;gap:12px;width:100%;padding:14px 16px;border-radius:18px;border:1px solid ${C.bd};background:transparent;color:${C.ts};cursor:pointer;font-size:14px;font-weight:700;font-family:${ft};text-align:left}
    .gf-project-nav-btn.active{border-color:${C.ac}50;background:${C.al};color:${C.ac}}
    .gf-project-nav-icon{width:28px;height:28px;border-radius:10px;border:1px solid ${C.bd};display:inline-flex;align-items:center;justify-content:center;background:${C.sa};flex-shrink:0}
    .gf-project-nav-btn.active .gf-project-nav-icon{border-color:${C.ac}34;background:${C.sf}}
    .gf-project-nav-meta{display:grid;gap:3px;width:100%;min-width:0}
    .gf-project-nav-hint{font-size:11px;color:${C.tt};font-weight:500;line-height:1.35;text-align:left;max-width:none}
    .gf-project-utility-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    .gf-project-utility-card{padding:14px 14px;border:1px solid ${C.bd};border-radius:16px;background:${C.sf};min-height:98px;display:grid;align-content:start}
    .gf-project-utility-label{font-size:10px;color:${C.tt};text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
    .gf-project-utility-value{font-size:22px;font-weight:800;line-height:1.12;color:${C.tx};overflow-wrap:anywhere;word-break:break-word}
    .gf-project-toolbar{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}
    .gf-project-toolbar-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
    .gf-project-spotlight{border:1px solid ${C.bd};border-radius:22px;background:${dark ? "linear-gradient(135deg, rgba(26,40,67,0.96) 0%, rgba(15,23,42,0.98) 100%)" : "linear-gradient(135deg, #ffffff 0%, #eef5ff 100%)"};padding:22px 24px;box-shadow:${C.sw}}
    .gf-project-overview-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
    .gf-project-stat-card{padding:13px 14px;border:1px solid ${C.bd};border-radius:18px;background:${C.sf}}
    .gf-project-stat-label{font-size:10px;color:${C.tt};text-transform:uppercase;letter-spacing:1.1px;margin-bottom:8px}
    .gf-project-stat-value{font-size:30px;font-weight:800;line-height:1.02}
    .gf-project-mode-banner{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap}
    .gf-project-snapshot-row{display:flex;justify-content:space-between;gap:10px;font-size:12px;color:${C.ts}}
    .gf-project-snapshot-row strong{color:${C.tx}}
    .gf-project-project-card{padding:20px 20px 18px}
    .gf-project-project-card-title{font-size:28px;font-weight:800;letter-spacing:-0.05em;line-height:1.04;margin-bottom:10px;overflow-wrap:anywhere}
    .gf-project-divider{border-top:1px solid ${C.bd}}
    .gf-thread-card-title{font-size:13px;font-weight:700;color:${C.tx};line-height:1.3;margin-bottom:4px;overflow-wrap:anywhere}
    .gf-thread-card-snippet{font-size:11px;color:${C.tt};line-height:1.5;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
    .gf-detail-shell{display:grid;grid-template-columns:minmax(0,1fr);gap:18px;align-items:start}
    .gf-detail-main{min-width:0}
    .gf-detail-tabs{position:sticky;top:12px;z-index:12;display:flex;gap:8px;flex-wrap:wrap;padding:10px 12px;border:1px solid ${C.bd};border-radius:14px;background:${dark ? "rgba(17,26,43,0.92)" : "rgba(255,255,255,0.92)"};backdrop-filter:blur(12px);margin-bottom:16px}
    .gf-detail-rail{display:grid;gap:14px}
    .gf-detail-rail-sticky{position:sticky;top:12px;display:grid;gap:14px}
    .gf-detail-profile-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .gf-detail-intel-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .gf-detail-sticky-footer{position:sticky;bottom:16px;z-index:10;margin-top:12px;padding:12px;border:1px solid ${C.bd};border-radius:14px;background:${dark ? "rgba(11,18,32,0.96)" : "rgba(255,255,255,0.96)"};box-shadow:${C.sm};backdrop-filter:blur(12px)}
    .gf-rail-kv{display:grid;gap:4px}
    .gf-rail-kv-label{font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:${C.tt}}
    .gf-rail-kv-value{font-size:13px;font-weight:700;color:${C.tx};line-height:1.35}
    @media (min-width:1080px){.gf-detail-shell{grid-template-columns:minmax(0,1fr) 300px}}
    @media (max-width:1160px){.gf-project-shell{grid-template-columns:1fr}.gf-project-sidebar{position:static;height:auto;border-right:none;border-bottom:1px solid ${C.bd}}.gf-project-main-inner{padding:24px 20px 32px}.gf-project-hero{grid-template-columns:1fr}.gf-project-overview-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.gf-project-nav-hint{max-width:none}}
    @media (max-width:860px){.gf-detail-profile-grid{grid-template-columns:1fr}.gf-detail-intel-grid{grid-template-columns:1fr}.gf-detail-tabs{top:8px}.gf-detail-sticky-footer{bottom:10px}.gf-project-overview-grid{grid-template-columns:1fr}.gf-project-headline{font-size:34px}}
  `;
  const actionBtn = (active = false, tint = "neutral") => {
    const tone = {
      neutral: { fg: C.ts, bg: C.sf, bd: C.bd },
      accent: { fg: C.ac, bg: C.al, bd: `${C.ac}40` },
      good: { fg: C.gn, bg: C.gb, bd: `${C.gn}45` },
      warn: { fg: C.ab, bg: C.abb, bd: `${C.ab}45` },
      danger: { fg: C.rd, bg: C.rb, bd: `${C.rd}45` },
    }[tint];
    return {
      padding: "8px 12px",
      borderRadius: 10,
      border: `1px solid ${active ? tone.bd : C.bd}`,
      background: active ? tone.bg : C.sf,
      color: active ? tone.fg : C.ts,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      cursor: "pointer",
      fontSize: 12,
      fontWeight: 600,
      fontFamily: ft,
      lineHeight: 1.1,
    };
  };
  const lockStyle = locked => (locked ? { opacity: 0.55, cursor: "not-allowed" } : {});
  const logAction = useCallback((project, artistName, action, kind = "event", extra = {}) => {
    return addLog(project, artistName, action, kind, { ...extra, actor: extra.actor || currentActor });
  }, [currentActor]);
  const isWithinDateRange = useCallback((iso) => {
    if (!iso) return false;
    const day = String(iso).slice(0, 10);
    if (reportStart && day < reportStart) return false;
    if (reportEnd && day > reportEnd) return false;
    return true;
  }, [reportStart, reportEnd]);
  const setReportPreset = preset => {
    const end = todayISO();
    if (preset === "7d") {
      setReportStart(addDaysISO(end, -6));
      setReportEnd(end);
      return;
    }
    if (preset === "30d") {
      setReportStart(addDaysISO(end, -29));
      setReportEnd(end);
      return;
    }
    if (preset === "90d") {
      setReportStart(addDaysISO(end, -89));
      setReportEnd(end);
    }
  };
  const drillDownToStatus = useCallback((filterId = "all") => {
    const nextFilter = normalizeStageFilterId(filterId);
    setProjectMode("work");
    setOwnerFilter("__view__");
    setSf(nextFilter);
    setShowFilters(true);
    setViewMode("table");
    setShowQuickDrawer(false);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        workSurfaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, []);
  const resetArtistForm = () => setArtistForm({
    name: "",
    genre: "",
    listeners: "",
    hitTrack: "",
    social: "",
    email: "",
    location: "",
    curatorPageUrl: "",
    curatedArtists: [...EMPTY_CURATED_ARTIST_SLOTS],
    note: "",
  });
  const resetMarketingForm = () => setMarketingForm(emptyMarketingForm());
  const closeMarketingItemModal = () => {
    marketingItemSubmitRef.current = false;
    setMarketingItemSaving(false);
    setShowMarketingItemModal(false);
    resetMarketingForm();
  };
  const openMarketingItemModal = item => {
    if (item) {
      setMarketingForm({
        id: item.id || "",
        talentName: item.talentName || item.title || "",
        talentType: item.talentType || "Internal Artist",
        title: item.title || "",
        campaign: item.campaign || (Array.isArray(item.campaigns) ? item.campaigns[0] || "" : ""),
        newCampaign: "",
        trafficType: item.trafficType || "Organic",
        channels: Array.isArray(item.channels) && item.channels.length ? item.channels : normalizeMarketingChannels(item.channel || ""),
        deliverableType: item.deliverableType || "UGC",
        status: item.status || "prospect",
        owner: item.owner || "",
        dueDate: item.dueDate || "",
        email: item.email || "",
        instagramHandle: item.instagramHandle || "",
        instagramUrl: item.instagramUrl || "",
        instagramFollowers: item.instagramFollowers || "",
        tiktokHandle: item.tiktokHandle || "",
        tiktokUrl: item.tiktokUrl || "",
        tiktokFollowers: item.tiktokFollowers || "",
        spotifyUrl: item.spotifyUrl || "",
        spotifyMonthlyListeners: item.spotifyMonthlyListeners || "",
        briefUrl: item.briefUrl || "",
        contentUrl: item.contentUrl || "",
        notes: item.notes || "",
        rejectedReason: item.rejectedReason || "",
      });
    } else {
      resetMarketingForm();
    }
    setShowMarketingItemModal(true);
  };
  const openMarketingItemModalFromTalentProfile = profile => {
    const leadMarketing = (profile?.marketingAssignments || [])[0] || null;
    const leadAr = (profile?.arRecords || [])[0] || null;
    setMarketingForm({
      ...emptyMarketingForm(),
      talentName: profile?.displayName || "",
      talentType: profile?.talentTypes?.[0] || leadMarketing?.talentType || "Internal Artist",
      trafficType: leadMarketing?.trafficType || "Organic",
      channels: Array.isArray(leadMarketing?.channels) && leadMarketing.channels.length ? [...leadMarketing.channels] : ["Instagram"],
      deliverableType: leadMarketing?.deliverableType || "UGC",
      owner: leadMarketing?.owner || leadAr?.owner || "",
      email: profile?.primaryEmail || "",
      instagramHandle: profile?.instagramHandle || "",
      instagramUrl: profile?.instagramUrl || "",
      instagramFollowers: profile?.instagramFollowers || "",
      tiktokHandle: profile?.tiktokHandle || "",
      tiktokUrl: profile?.tiktokUrl || "",
      tiktokFollowers: profile?.tiktokFollowers || "",
      spotifyUrl: profile?.spotifyUrl || "",
      spotifyMonthlyListeners: profile?.spotifyMonthlyListeners || leadAr?.monthlyListeners || "",
      campaign: marketingCampaignFilter !== "all" ? marketingCampaignFilter : "",
    });
    setShowMarketingItemModal(true);
  };
  const resetTalentTargetDraft = useCallback((talentId = "", explicitProjectId = "") => {
    const profile = workspaceTalentProfileMap.get(talentId) || null;
    const projectMemberships = new Set((profile?.projectMemberships || []).map(item => item.projectId));
    const preferredProject = (explicitProjectId && projects.find(project => project.id === explicitProjectId))
      || projects.find(project => project.id !== apId && !projectMemberships.has(project.id))
      || projects.find(project => !projectMemberships.has(project.id))
      || projects.find(project => project.id !== apId)
      || projects[0]
      || null;
    setTalentTargetProjectId(preferredProject?.id || "");
    setTalentTargetCampaign("");
    setTalentTargetNewCampaign("");
    setTalentTargetOwner("");
    setTalentTargetStatus("prospect");
    setTalentTargetSaving(false);
  }, [workspaceTalentProfileMap, projects, apId]);
  const closeTalentProfileModal = () => {
    setShowTalentProfileModal(false);
    setSelectedTalentProfileId("");
    setTalentTargetProjectId("");
    setTalentTargetCampaign("");
    setTalentTargetNewCampaign("");
    setTalentTargetOwner("");
    setTalentTargetStatus("prospect");
    setTalentTargetSaving(false);
  };
  const openTalentProfileById = talentId => {
    if (!talentId) {
      flash("No shared talent profile found yet", "err");
      return;
    }
    setSelectedTalentProfileId(talentId);
    resetTalentTargetDraft(talentId);
    setShowTalentProfileModal(true);
  };
  const openTalentProfileFromArtist = artist => {
    if (!proj?.id || !artist?.n) {
      flash("No shared talent profile found yet", "err");
      return;
    }
    openTalentProfileById(workspaceTalentData.artistTalentIds.get(`${proj.id}::${artist.n}`) || "");
  };
  const openTalentProfileFromMarketingItem = item => {
    if (!item?.id) {
      flash("No shared talent profile found yet", "err");
      return;
    }
    openTalentProfileById(workspaceTalentData.marketingTalentIds.get(String(item.id || "")) || "");
  };
  const openTalentProfileFromWorkspaceProfile = profile => {
    if (!profile) {
      flash("No shared talent profile found yet", "err");
      return;
    }
    const fallbackArtistId = profile.primaryProjectId && profile.primaryArtistName
      ? workspaceTalentData.artistTalentIds.get(`${profile.primaryProjectId}::${profile.primaryArtistName}`) || ""
      : "";
    const fallbackMarketingId = profile.primaryAssignmentId
      ? workspaceTalentData.marketingTalentIds.get(String(profile.primaryAssignmentId || "")) || ""
      : "";
    openTalentProfileById(String(profile.id || fallbackMarketingId || fallbackArtistId || "").trim());
  };
  const seedArtistEditForm = artist => setArtistEditForm({
    name: artist?.n || "",
    genre: artist?.g || "",
    listeners: artist?.l || "",
    hitTrack: artist?.h || "",
    social: artist?.soc ? `@${artist.soc}` : (artist?.ig || ""),
    email: artist?.e || "",
    location: artist?.loc || "",
    curatorPageUrl: artist?.curatorPageUrl || "",
    curatedArtists: curatedArtistSlots(artist?.curatedArtists),
  });

  useEffect(() => {
    (async () => {
      try {
        try {
          const params = new URLSearchParams(window.location.search || "");
          if (params.get("reset") === "1") {
            window.localStorage.removeItem(STORAGE_PREFIX);
            window.localStorage.removeItem(storageKey);
            flash("Local workspace reset complete");
          }
        } catch {}
        let d = await sGet(storageKey);
        if (!d && authUserId) {
          const legacy = await sGet(STORAGE_PREFIX);
          if (legacy?.projects?.length) {
            d = legacy;
            await sSet(storageKey, legacy);
          }
        }
        const nextWorkspaceUser = d?.workspaceUser || ALL_USER_VIEW;
        const nextCurrentWorkspaceId = d?.currentWorkspaceId || DEFAULT_WORKSPACE.id;
        const nextLayouts = d?.layoutByUser || {};
        const localProjects = Array.isArray(d?.projects) ? d.projects : [];
        const lastNonEmptyProjects = Array.isArray(d?.lastNonEmptyProjects) ? d.lastNonEmptyProjects : [];
        if (d?.lastActive) setApId(d.lastActive);
        if (d?.dark) setDark(d.dark);
        if (d?.viewMode) setViewMode(d.viewMode);
        if (d?.kickoffViewMode) setKickoffViewMode(d.kickoffViewMode);
        if (d?.liveRosterViewMode) setLiveRosterViewMode(d.liveRosterViewMode);
        if (d?.projectMode) setProjectMode(d.projectMode);
        setCurrentWorkspaceId(nextCurrentWorkspaceId);
        setWorkspaceUser(nextWorkspaceUser);
        setLayoutByUser(nextLayouts);
        const initialLayout = normalizeLayout(nextLayouts[nextWorkspaceUser] || DEFAULT_LAYOUT);
        setShowHealth(!!initialLayout.showHealth);
        setShowModels(!!initialLayout.showModels);
        setShowTeam(!!initialLayout.showTeam);
        setShowQueue(!!initialLayout.showQueue);
        setShowFunnel(!!initialLayout.showFunnel);
        setShowAB(!!initialLayout.showAB);
        setShowFilters(!!initialLayout.showFilters);
        setAiKeySet(AI_PROVIDERS.some(provider => !!getStoredAiKey(provider.id)));

        if (authUserId) {
          const shared = await apiGetProjects();
          if (shared.ok) {
            if (shared.projects.length) {
              setProjects(shared.projects.map(normalizeProject));
            } else if (localProjects.length && canEdit) {
              const migrated = await apiSaveProjects(localProjects);
              if (migrated.ok) {
                setProjects(localProjects.map(normalizeProject));
              } else {
                setProjects(localProjects.map(normalizeProject));
                console.error("Project migration failed:", migrated.error);
              }
            } else if (lastNonEmptyProjects.length) {
              setProjects(lastNonEmptyProjects.map(normalizeProject));
              setToast({
                m: "Shared projects came back empty, so GEMFINDER loaded your last known local snapshot instead.",
                t: "err",
              });
              console.error("Shared project load returned empty; using last known non-empty local snapshot.", {
                snapshots: shared.snapshots || [],
              });
            } else {
              setProjects([]);
            }
          } else if (localProjects.length) {
            setProjects(localProjects.map(normalizeProject));
            console.error("Shared project load failed:", shared.error);
          }
        } else if (localProjects.length) {
          setProjects(localProjects.map(normalizeProject));
        }
      } catch (e) {
        console.error("GEMFINDER boot failed:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [storageKey, defaultWorkspaceUser, authUserId, canEdit]);

  useEffect(() => {
    if (!loading) return undefined;
    const watchdog = setTimeout(() => setLoading(false), 3500);
    return () => clearTimeout(watchdog);
  }, [loading]);

  useEffect(() => {
    if (!workspaces.length) return;
    if (workspaces.some(workspace => workspace.id === currentWorkspaceId)) return;
    setCurrentWorkspaceId(workspaces[0].id);
  }, [workspaces, currentWorkspaceId]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!authUserId) return;
    let cancelled = false;
    (async () => {
      setGmailStatusLoading(true);
      const result = await apiGetGmailStatus();
      if (cancelled) return;
      if (result.ok) {
        setGmailStatus({
          available: !!result.available,
          currentUserConnected: !!result.currentUserConnected,
          currentUserGmail: result.currentUserGmail || "",
          currentConnection: result.currentConnection || null,
          connections: result.connections || [],
        });
      }
      setGmailStatusLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authUserId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const gmail = url.searchParams.get("gmail") || "";
    const gmailError = url.searchParams.get("gmail_error") || "";
    const gmailErrorDetails = url.searchParams.get("gmail_error_details") || "";
    if (!gmail && !gmailError) return;

    (async () => {
      if (gmail === "connected") {
        await refreshGmailStatus();
        await runGmailProfileCheck({ silent: true });
      } else if (gmail === "missing_refresh_token") {
        const message = "No refresh token returned; ensure prompt=consent + access_type=offline.";
        setGmailBannerMessage("error", message, "Disconnect the mailbox, then reconnect and approve Google consent again.");
        flash(message, "err");
      } else if (gmail === "not_configured") {
        const message = "Google OAuth is not configured on this deployment.";
        setGmailBannerMessage("error", message, "Check GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_URL, and the redirect URI in Google Cloud.");
        flash(message, "err");
      } else if (gmail === "auth_required") {
        const message = "Sign in before connecting Gmail.";
        setGmailBannerMessage("error", message, "");
        flash(message, "err");
      } else if (gmail === "forbidden") {
        const message = "Viewer role cannot connect Gmail.";
        setGmailBannerMessage("error", message, "");
        flash(message, "err");
      } else if (gmail === "state_error") {
        const message = "Gmail connection state expired. Try connecting again.";
        setGmailBannerMessage("error", message, "");
        flash(message, "err");
      } else if (gmailError) {
        const message = decodeURIComponent(gmailError);
        const details = gmailErrorDetails ? decodeURIComponent(gmailErrorDetails) : "";
        setGmailBannerMessage("error", message, details);
        flash(message, "err");
      }
    })();

    url.searchParams.delete("gmail");
    url.searchParams.delete("gmail_error");
    url.searchParams.delete("gmail_error_details");
    url.searchParams.delete("gmail_error_code");
    window.history.replaceState({}, "", `${url.pathname}${url.search || ""}${url.hash || ""}`);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || loading) return;
    const url = new URL(window.location.href);
    const projectId = String(url.searchParams.get("project") || "").trim();
    const artistName = String(url.searchParams.get("artist") || "").trim();
    const tab = String(url.searchParams.get("tab") || "overview").trim();
    if (!projectId) return;

    const linkKey = `${projectId}|${artistName || "_project"}|${tab}`;
    if (handledArtistLinkRef.current === linkKey) return;

    if (apId !== projectId) {
      setApId(projectId);
      setScreen("project");
      return;
    }
    if (!proj || proj.id !== projectId) return;

    if (!artistName) {
      handledArtistLinkRef.current = linkKey;
      setScreen("project");
      return;
    }

    const targetArtist = (proj.artists || []).find(item =>
      item.n === artistName || canonicalArtistName(item.n) === canonicalArtistName(artistName)
    );
    handledArtistLinkRef.current = linkKey;
    if (!targetArtist) return;

    const validDetailTabs = normalizeProjectType(proj?.type) === "curator" ? CURATOR_DETAIL_TAB_IDS : DETAIL_TAB_IDS;
    primeArtistContext(targetArtist);
    setScreen("detail");
    setDetailTab(validDetailTabs.has(tab) ? tab : "overview");
  }, [loading, apId, proj?.id, projects.length]);

  useEffect(() => {
    if (typeof window === "undefined" || loading) return;
    const url = new URL(window.location.href);
    const projectId = String(url.searchParams.get("project") || "").trim();
    const assignmentId = String(url.searchParams.get("assignment") || "").trim();
    if (!projectId || !assignmentId) return;

    const linkKey = `${projectId}|${assignmentId}`;
    if (handledMarketingLinkRef.current === linkKey) return;

    if (apId !== projectId) {
      setApId(projectId);
      setScreen("project");
      return;
    }
    if (!proj || proj.id !== projectId || normalizeProjectType(proj.type) !== "marketing") return;

    const targetAssignment = (proj.marketingItems || []).find(item => String(item?.id || "") === assignmentId);
    handledMarketingLinkRef.current = linkKey;
    if (!targetAssignment) return;

    setProjectMode("work");
    openMarketingItemModal(targetAssignment);
    setScreen("project");
  }, [loading, apId, proj?.id, proj?.type, projects.length]);

  useEffect(() => {
    if (loading) return;
    if (screen === "detail" && proj?.id && selA?.n) {
      const validDetailTabs = normalizeProjectType(proj?.type) === "curator" ? CURATOR_DETAIL_TAB_IDS : DETAIL_TAB_IDS;
      updateWorkspaceUrl(proj.id, selA.n, validDetailTabs.has(detailTab) ? detailTab : "overview", "");
      return;
    }
    if (screen === "project" && proj?.id) {
      updateWorkspaceUrl(proj.id, "", "", isMarketingProject && showMarketingItemModal && marketingForm.id ? marketingForm.id : "");
      return;
    }
    if (screen === "hub" || screen === "workspace" || screen === "kickoff" || screen === "live-crm") {
      updateWorkspaceUrl("", "", "", "");
    }
  }, [loading, screen, proj?.id, selA?.n, detailTab, isMarketingProject, showMarketingItemModal, marketingForm.id]);

  useEffect(() => {
    if (!proj) return;
    if (normalizeProjectType(proj.type) !== "ar" && projectMode === "inbox") {
      setProjectMode("work");
    }
  }, [proj?.id, proj?.type, projectMode]);

  useEffect(() => {
    if (!pendingWorkspaceAction || !proj?.id || proj.id !== pendingWorkspaceAction.projectId) return;
    const nextAction = pendingWorkspaceAction.action;
    const profileId = String(pendingWorkspaceAction.profileId || "").trim();
    setPendingWorkspaceAction(null);
    if (nextAction === "show-add-artist") {
      setShowAddArtist(true);
      return;
    }
    if (nextAction === "show-marketing-item") {
      if (profileId && workspaceTalentProfileMap.has(profileId)) {
        openMarketingItemModalFromTalentProfile(workspaceTalentProfileMap.get(profileId));
      } else {
        openMarketingItemModal(null);
      }
      return;
    }
    if (nextAction === "show-marketing-bulk-update") {
      openMarketingBulkUpdateModal();
      return;
    }
    if (nextAction === "import-csv") {
      window.requestAnimationFrame(() => {
        if (workspaceCsvRef.current?.click) workspaceCsvRef.current.click();
        else if (fr.current?.click) fr.current.click();
      });
    }
  }, [pendingWorkspaceAction, proj?.id, workspaceTalentProfileMap]);

  useEffect(() => {
    if (!showTalentProfileModal) return;
    if (selectedTalentProfileId && workspaceTalentProfileMap.has(selectedTalentProfileId)) return;
    closeTalentProfileModal();
  }, [showTalentProfileModal, selectedTalentProfileId, workspaceTalentProfileMap]);

  useEffect(() => {
    if (!showTalentProfileModal || !selectedTalentProfileId) return;
    if (talentTargetProjectId && projects.some(project => project.id === talentTargetProjectId)) return;
    resetTalentTargetDraft(selectedTalentProfileId);
  }, [showTalentProfileModal, selectedTalentProfileId, talentTargetProjectId, projects, resetTalentTargetDraft]);

  useEffect(() => {
    const validStatusIds = new Set((talentTargetProjectType === "marketing" ? MARKETING_STATUSES : STAGES).map(item => item.id));
    if (!validStatusIds.has(talentTargetStatus)) {
      setTalentTargetStatus("prospect");
    }
    if (talentTargetOwner && !talentTargetTeamUsers.includes(talentTargetOwner)) {
      setTalentTargetOwner("");
    }
    if (talentTargetProjectType !== "marketing") {
      if (talentTargetCampaign) setTalentTargetCampaign("");
      if (talentTargetNewCampaign) setTalentTargetNewCampaign("");
    }
  }, [talentTargetProjectType, talentTargetStatus, talentTargetOwner, talentTargetTeamUsers, talentTargetCampaign, talentTargetNewCampaign]);

  const persist = useCallback(async (np, la, dk, vm, lb, wu, pm, cw, kvm, lvm) => {
    const nextProjects = np || projects;
    const previousLocal = await sGet(storageKey);
    const lastNonEmptyProjects = nextProjects.length
      ? nextProjects
      : Array.isArray(previousLocal?.lastNonEmptyProjects) && previousLocal.lastNonEmptyProjects.length
        ? previousLocal.lastNonEmptyProjects
        : Array.isArray(previousLocal?.projects) && previousLocal.projects.length
          ? previousLocal.projects
          : [];

    if (np !== undefined && authUserId && canEdit) {
      const result = await apiSaveProjects(nextProjects);
      if (!result.ok) {
        console.error("Shared project save failed:", result.error);
        setToast({
          m: result.error || "Shared project save failed. Your workspace was not replaced.",
          t: "err",
        });
        return false;
      }
    }

    await sSet(storageKey, {
      projects: nextProjects,
      lastNonEmptyProjects,
      lastActive: la !== undefined ? la : apId,
      dark: dk !== undefined ? dk : dark,
      viewMode: vm !== undefined ? vm : viewMode,
      kickoffViewMode: kvm !== undefined ? kvm : kickoffViewMode,
      liveRosterViewMode: lvm !== undefined ? lvm : liveRosterViewMode,
      layoutByUser: lb !== undefined ? lb : layoutByUser,
      workspaceUser: wu !== undefined ? wu : workspaceUser,
      projectMode: pm !== undefined ? pm : projectMode,
      currentWorkspaceId: cw !== undefined ? cw : currentWorkspaceId,
    });
    return true;
  }, [storageKey, projects, apId, dark, viewMode, kickoffViewMode, liveRosterViewMode, layoutByUser, workspaceUser, projectMode, currentWorkspaceId, authUserId, canEdit]);

  const flash = (m, t = "ok") => { setToast({ m, t }); setTimeout(() => setToast(null), 2500); };
  const togDark = async () => { const nd = !dark; setDark(nd); await persist(undefined, undefined, nd); };
  const setView = async v => { setViewMode(v); await persist(undefined, undefined, undefined, v); };
  const setKickoffView = async v => { setKickoffViewMode(v); await persist(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, v); };
  const setLiveRosterView = async v => { setLiveRosterViewMode(v); await persist(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, v); };
  const aiProvider = () => proj?.settings?.aiProvider || "anthropic";
  const currentAiProvider = aiProvider();
  const aiOptions = AI_MODEL_OPTIONS[currentAiProvider] || [];
  const signOut = async () => {
    try {
      await fetch('/api/ar/auth/logout', { method: 'POST' });
    } catch {}
    window.location.href = '/ar';
  };
  const requireEditor = () => {
    if (canEdit) return true;
    flash("Viewer role is read-only", "err");
    return false;
  };
  const requireAdmin = () => {
    if (isAdmin) return true;
    flash("Admin role required", "err");
    return false;
  };

  useEffect(() => {
    if (loading) return;
    persist(undefined, undefined, undefined, undefined, undefined, undefined, projectMode);
  }, [loading, projectMode, persist]);

  useEffect(() => {
    setCampaignBankDraft("");
  }, [proj?.id]);

  useEffect(() => {
    setMarketingGroupFilter("all");
    setSelectedMarketingIds(new Set());
    setMarketingSelectionMode(false);
  }, [proj?.id]);

  useEffect(() => {
    if (!proj) return;
    setAiKeySet(!!getStoredAiKey(currentAiProvider));
  }, [proj?.id, currentAiProvider]);

  useEffect(() => {
    if (!proj) return;
    const users = proj.teamUsers || [];
    if (workspaceUser !== ALL_USER_VIEW && workspaceUser !== UNASSIGNED_USER_VIEW && users.length && !users.includes(workspaceUser)) {
      changeWorkspaceUser(ALL_USER_VIEW);
    }
  }, [proj?.id, proj?.teamUsers, workspaceUser]);

  useEffect(() => {
    if (loading) return;
    const layout = normalizeLayout({
      showHealth,
      showModels,
      showTeam,
      showQueue,
      showFunnel,
      showAB,
      showFilters,
    });
    if (focusMode) return;
    setLayoutByUser(prev => {
      const current = normalizeLayout(prev[workspaceUser] || DEFAULT_LAYOUT);
      const same = Object.keys(DEFAULT_LAYOUT).every(k => current[k] === layout[k]);
      if (same) return prev;
      return { ...prev, [workspaceUser]: layout };
    });
  }, [loading, workspaceUser, showHealth, showModels, showTeam, showQueue, showFunnel, showAB, showFilters, focusMode]);

  useEffect(() => {
    const connected = availableGmailConnections;
    if (!connected.length) {
      setGmailSendUserId(authUserId || "");
      return;
    }
    const preferred = connected.find((item) => item.userId === authUserId) || connected[0];
    if (!gmailSendUserId || !connected.some((item) => item.userId === gmailSendUserId)) {
      setGmailSendUserId(preferred?.userId || authUserId || "");
    }
  }, [availableGmailConnections, authUserId, gmailSendUserId]);

  useEffect(() => {
    if (!proj?.id || !selA?.n) return;
    let cancelled = false;
    (async () => {
      setInboxLoading(true);
      const result = await apiGetArtistInbox(proj.id, selA.n);
      if (cancelled) return;
      if (result.ok) {
        setArtistInbox({
          threads: result.threads || [],
          messages: result.messages || [],
          connections: result.connections || gmailStatus.connections || [],
        });
        setSelectedThreadKey((prev) => {
          const threadKeys = new Set((result.threads || []).map((item) => item.threadKey));
          if (prev && threadKeys.has(prev)) return prev;
          return result.threads?.[0]?.threadKey || "";
        });
      }
      setInboxLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [proj?.id, selA?.n]);

  useEffect(() => {
    if (!proj?.id) return;
    let cancelled = false;
    (async () => {
      setProjectInboxLoading(true);
      const result = await apiGetProjectInbox(proj.id);
      if (cancelled) return;
      if (result.ok) {
        setProjectInbox({
          threads: result.threads || [],
          messages: result.messages || [],
          connections: result.connections || gmailStatus.connections || [],
        });
      }
      setProjectInboxLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [proj?.id]);

  useEffect(() => {
    if (loading) return;
    persist(undefined, undefined, undefined, undefined, layoutByUser, workspaceUser);
  }, [layoutByUser, workspaceUser]);

  const changeWorkspaceUser = user => {
    setWorkspaceUser(user);
    setOwnerFilter("__view__");
    setShowQuickDrawer(false);
    setShowProjectMenu(false);
    const layout = normalizeLayout(layoutByUser[user] || DEFAULT_LAYOUT);
    setShowHealth(!!layout.showHealth);
    setShowModels(!!layout.showModels);
    setShowTeam(!!layout.showTeam);
    setShowQueue(!!layout.showQueue);
    setShowFunnel(!!layout.showFunnel);
    setShowAB(!!layout.showAB);
    setShowFilters(!!layout.showFilters);
    setFocusMode(false);
    setPreFocusLayout(null);
  };

  const openWorkspace = async workspaceId => {
    const workspace = workspaces.find(item => item.id === workspaceId) || selectedWorkspace;
    if (!workspace) return;
    setCurrentWorkspaceId(workspace.id);
    setScreen("workspace");
    setSearch("");
    setGf("All");
    setSf("all");
    setPf("all");
    setOwnerFilter("__view__");
    setMarketingStatusFilter("all");
    setMarketingCampaignFilter("all");
    setMarketingTrafficFilter("all");
    setMarketingGroupFilter("all");
    setMarketingOwnerFilter("all");
    changeWorkspaceUser(ALL_USER_VIEW);
    updateWorkspaceUrl("", "", "", "");
    await persist(undefined, undefined, undefined, undefined, undefined, ALL_USER_VIEW, undefined, workspace.id);
  };

  const openProjectWorkspace = async (projectId, { artistName = "", assignmentId = "" } = {}) => {
    const targetProject = projects.find(project => project.id === projectId);
    if (!targetProject) return;
    const nextType = normalizeProjectType(targetProject.type);
    setCurrentWorkspaceId(targetProject.workspaceId || DEFAULT_WORKSPACE.id);
    setApId(projectId);
    setScreen("project");
    setSearch("");
    setGf("All");
    setSf("all");
    setPf("all");
    setOwnerFilter("__view__");
    setMarketingStatusFilter("all");
    setMarketingCampaignFilter("all");
    setMarketingTrafficFilter("all");
    setMarketingGroupFilter("all");
    setMarketingOwnerFilter(nextType === "marketing" ? "all" : "__view__");
    if (nextType !== "ar") {
      setProjectMode("work");
    }
    if (nextType === "marketing") {
      changeWorkspaceUser(ALL_USER_VIEW);
    }
    updateWorkspaceUrl(projectId, artistName, artistName ? "overview" : "", assignmentId);
    await persist(projects, projectId, undefined, undefined, undefined, undefined, undefined, targetProject.workspaceId || DEFAULT_WORKSPACE.id);
  };
  const launchWorkspaceProjectAction = async (projectId, action, missingMessage, payload = {}) => {
    if (!requireEditor()) return;
    if (!projectId) {
      flash(missingMessage || "No synced workspace record is set up for that action yet", "err");
      return;
    }
    const targetProject = projects.find(project => project.id === projectId);
    if (!targetProject) {
      flash("That workspace action no longer has a synced backup record", "err");
      return;
    }
    const nextType = normalizeProjectType(targetProject.type);
    setCurrentWorkspaceId(targetProject.workspaceId || DEFAULT_WORKSPACE.id);
    setApId(projectId);
    if (nextType !== "ar" && projectMode === "inbox") {
      setProjectMode("work");
    }
    if (nextType === "marketing") {
      setMarketingStatusFilter("all");
      setMarketingCampaignFilter("all");
      setMarketingTrafficFilter("all");
      setMarketingGroupFilter("all");
      setMarketingOwnerFilter("all");
      changeWorkspaceUser(ALL_USER_VIEW);
    }
    setPendingWorkspaceAction({ projectId, action, ...payload });
  };

  const toggleFocusMode = () => {
    if (!focusMode) {
      setPreFocusLayout({
        showHealth,
        showModels,
        showTeam,
        showQueue,
        showFunnel,
        showAB,
        showFilters,
      });
      setFocusMode(true);
      setShowHealth(false);
      setShowModels(false);
      setShowTeam(false);
      setShowQueue(false);
      setShowFunnel(false);
      setShowAB(false);
      setShowFilters(false);
      return;
    }
    setFocusMode(false);
    const layout = normalizeLayout(preFocusLayout || layoutByUser[workspaceUser] || DEFAULT_LAYOUT);
    setShowHealth(!!layout.showHealth);
    setShowModels(!!layout.showModels);
    setShowTeam(!!layout.showTeam);
    setShowQueue(!!layout.showQueue);
    setShowFunnel(!!layout.showFunnel);
    setShowAB(!!layout.showAB);
    setShowFilters(!!layout.showFilters);
    setPreFocusLayout(null);
  };

  const configureAiKey = () => {
    const provider = currentAiProvider;
    const keyLabel = providerLabel(provider);
    const storageKey = AI_KEY_STORAGE[provider];
    const existing = getStoredAiKey(provider);
    const val = window.prompt(`Paste ${keyLabel} API key. Leave empty to clear.`, existing || "");
    if (val === null) return;
    const clean = val.trim();
    try {
      if (clean) {
        const detectedProvider = detectProviderFromKey(clean);
        let targetProvider = provider;

        if (detectedProvider && detectedProvider !== provider) {
          if (window.confirm(`This key looks like ${providerLabel(detectedProvider)}. Switch AI provider to ${providerLabel(detectedProvider)} and save it there?`)) {
            targetProvider = detectedProvider;
          }
        }

        const targetStorageKey = AI_KEY_STORAGE[targetProvider];
        window.localStorage.setItem(targetStorageKey, clean);
        if (targetProvider !== provider && proj) {
          const nextProj = { ...proj, settings: { ...(proj.settings || {}), aiProvider: targetProvider } };
          saveProject(nextProj);
        }
        setAiKeySet(true);
        flash(`${providerLabel(targetProvider)} key saved`);
      } else {
        window.localStorage.removeItem(storageKey);
        setAiKeySet(false);
        flash(`${keyLabel} key cleared`);
      }
    } catch {
      flash("Could not save API key", "err");
    }
  };

  const setPanels = next => {
    setShowHealth(!!next.health);
    setShowModels(!!next.models);
    setShowTeam(!!next.team);
    setShowQueue(!!next.queue);
    setShowFunnel(!!next.funnel);
    setShowAB(!!next.ab);
  };
  const panelState = { health: showHealth, models: showModels, team: showTeam, queue: showQueue, funnel: showFunnel, ab: showAB };
  const togglePanel = key => setPanels({ ...panelState, [key]: !panelState[key] });
  const collapsePanels = () => setPanels({ health: false, models: false, team: false, queue: false, funnel: false, ab: false });
  const expandPanels = () => setPanels({ health: true, models: true, team: true, queue: true, funnel: false, ab: false });

  const taskModel = task => proj?.settings?.aiModelsByProvider?.[currentAiProvider]?.[task] || DEFAULT_AI_MODELS[currentAiProvider]?.[task];
  const modelLabel = id => aiOptions.find(m => m.id === id)?.label || id;

  const saveAiModel = async (task, modelId) => {
    if (!requireEditor()) return;
    if (!proj) return;
    const byProvider = {
      anthropic: { ...DEFAULT_AI_MODELS.anthropic, ...(proj.settings?.aiModelsByProvider?.anthropic || {}) },
      openai: { ...DEFAULT_AI_MODELS.openai, ...(proj.settings?.aiModelsByProvider?.openai || {}) },
      google: { ...DEFAULT_AI_MODELS.google, ...(proj.settings?.aiModelsByProvider?.google || {}) },
      deepseek: { ...DEFAULT_AI_MODELS.deepseek, ...(proj.settings?.aiModelsByProvider?.deepseek || {}) },
      groq: { ...DEFAULT_AI_MODELS.groq, ...(proj.settings?.aiModelsByProvider?.groq || {}) },
    };
    byProvider[currentAiProvider] = { ...byProvider[currentAiProvider], [task]: modelId };
    const nextProj = { ...proj, settings: { ...(proj.settings || {}), aiModelsByProvider: byProvider } };
    await saveProject(nextProj);
    flash(`${task} model: ${modelLabel(modelId)}`);
  };

  const saveAiProvider = async providerId => {
    if (!requireEditor()) return;
    if (!proj) return;
    const nextProj = { ...proj, settings: { ...(proj.settings || {}), aiProvider: providerId } };
    await saveProject(nextProj);
    setAiKeySet(!!getStoredAiKey(providerId));
    flash(`AI provider: ${providerLabel(providerId)}`);
  };

  const saveAppearanceAccent = async accentId => {
    if (!requireEditor()) return;
    if (!proj || !ACCENT_PRESETS[accentId]) return;
    const nextProj = {
      ...proj,
      settings: {
        ...(proj.settings || {}),
        appearance: {
          ...(proj.settings?.appearance || {}),
          accent: accentId,
        },
      },
    };
    await saveProject(nextProj);
    flash(`Accent: ${ACCENT_PRESETS[accentId].label}`);
  };

  const saveDraftGuardrails = async patch => {
    if (!requireAdmin()) return;
    if (!proj) return;
    const draftGuardrails = { ...DEFAULT_DRAFT_GUARDRAILS, ...(proj.settings?.draftGuardrails || {}), ...patch };
    const nextProj = { ...proj, settings: { ...(proj.settings || {}), draftGuardrails } };
    await saveProject(nextProj);
  };

  const saveCurrentDraftAsTemplate = async (artist, draft, name) => {
    if (!requireEditor()) return;
    if (!proj || !artist || !draft) return;
    const cleanName = String(name || "").trim();
    if (!cleanName) {
      flash("Template name is required", "err");
      return;
    }
    const channel = draft.channel === "email" ? "email" : "dm";
    const parsed = parseDraftSubject(draft.text || "", `Quick idea for ${artist.n}`);
    const body = channel === "email" ? parsed.body.trim() : String(draft.text || "").trim();
    const subject = channel === "email" ? parsed.subject.trim() : "";
    if (!body) {
      flash("Draft text is empty", "err");
      return;
    }

    const now = new Date().toISOString();
    const current = sanitizeSavedTemplates(proj.settings?.savedTemplates || []);
    const matchIdx = current.findIndex(t => t.name.toLowerCase() === cleanName.toLowerCase() && t.channel === channel);
    let nextTemplates = [...current];
    let savedId = "";
    if (matchIdx >= 0) {
      const prev = nextTemplates[matchIdx];
      savedId = prev.id;
      nextTemplates[matchIdx] = { ...prev, name: cleanName, subject, body, platform: draft.platform || "", updatedAt: now };
    } else {
      savedId = `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      nextTemplates.push({
        id: savedId,
        name: cleanName,
        channel,
        platform: draft.platform || "",
        subject,
        body,
        createdAt: now,
        updatedAt: now,
      });
    }
    nextTemplates = sanitizeSavedTemplates(nextTemplates);

    const al = logAction(proj, artist.n, `Saved template: ${cleanName}`);
    const nextProj = {
      ...proj,
      settings: { ...(proj.settings || {}), savedTemplates: nextTemplates },
      activityLog: al,
    };
    await saveProject(nextProj);
    setSelectedTemplateId(savedId);
    setTemplateNameDraft("");
    flash(matchIdx >= 0 ? `Template "${cleanName}" updated` : `Template "${cleanName}" saved`);
  };

  const applySavedTemplateToDraft = async (artist, draft, templateId) => {
    if (!requireEditor()) return;
    if (!proj || !artist || !draft) return;
    const list = sanitizeSavedTemplates(proj.settings?.savedTemplates || []);
    const hit = list.find(t => t.id === templateId);
    if (!hit) {
      flash("Template not found", "err");
      return;
    }
    const activeChannel = draft.channel === "email" ? "email" : "dm";
    if (hit.channel !== activeChannel) {
      flash(`Template channel mismatch (${hit.channel})`, "err");
      return;
    }
    const ctx = buildTemplateContext(artist, bucketGenre(artist.g), draft.platform || draftPlatform);
    const body = applyTemplateContext(hit.body, ctx);
    const subjectRaw = hit.subject || "Quick idea for {{artist_name}}";
    const subject = applyTemplateContext(subjectRaw, ctx);
    const text = activeChannel === "email" ? `Subject: ${subject}\n\n${body}` : body;
    if (!text.trim()) {
      flash("Template resolved to empty text", "err");
      return;
    }

    const nextDrafts = [...drafts];
    nextDrafts[draftTab] = {
      ...nextDrafts[draftTab],
      text,
      ai: false,
      variantId: "TPL",
      sub: `Saved template: ${hit.name}`,
    };
    setDrafts(nextDrafts);
    setDraftMode("template");

    const al = logAction(proj, artist.n, `Applied template: ${hit.name}`);
    await saveProject({ ...proj, activityLog: al });
    flash(`Applied "${hit.name}"`);
  };

  const deleteSavedTemplate = async templateId => {
    if (!requireEditor()) return;
    if (!proj) return;
    const current = sanitizeSavedTemplates(proj.settings?.savedTemplates || []);
    const hit = current.find(t => t.id === templateId);
    if (!hit) return;
    const nextTemplates = current.filter(t => t.id !== templateId);
    const nextProj = {
      ...proj,
      settings: { ...(proj.settings || {}), savedTemplates: nextTemplates },
    };
    await saveProject(nextProj);
    if (selectedTemplateId === templateId) setSelectedTemplateId("");
    flash(`Deleted template "${hit.name}"`);
  };

  const addTeamMember = async () => {
    if (!requireEditor()) return;
    if (!proj) return;
    const name = newTeamUser.trim();
    if (!name) return;
    const exists = (proj.teamUsers || []).some(u => u.toLowerCase() === name.toLowerCase());
    if (exists) { flash("User already exists", "err"); return; }
    const nextProj = { ...proj, teamUsers: normalizeTeamUsers([...(proj.teamUsers || []), name]) };
    await saveProject(nextProj);
    setNewTeamUser("");
    flash(`Added ${name}`);
  };

  const addWorkspaceContact = async () => {
    if (!requireEditor()) return;
    const name = newWorkspaceContact.trim();
    if (!name) return;
    if (workspaceTeamUsers.some(user => user.toLowerCase() === name.toLowerCase())) {
      flash("Workspace contact already exists", "err");
      return;
    }
    if (!projects.length) {
      flash("Create a project first so this workspace contact has somewhere to live", "err");
      return;
    }
    const nextProjects = projects.map(project => ({
      ...project,
      teamUsers: normalizeTeamUsers([...(project.teamUsers || []), name]),
    }));
    await saveProjectsList(nextProjects);
    setNewWorkspaceContact("");
    flash(`Added ${name} to all projects`);
  };

  const assignOwner = async (artistName, owner) => {
    if (!requireEditor()) return;
    if (!proj) return;
    const al = logAction(proj, artistName, owner ? `Assigned to ${owner}` : "Owner cleared");
    const nextProj = { ...proj, assignments: { ...(proj.assignments || {}), [artistName]: owner }, activityLog: al };
    await saveProject(nextProj);
    flash(owner ? `${artistName} assigned to ${owner}` : `${artistName} unassigned`);
  };

  const batchAssignOwner = async owner => {
    if (!requireEditor()) return;
    if (!proj || bSel.size === 0) return;
    const nextAssignments = { ...(proj.assignments || {}) };
    let al = proj.activityLog || {};
    bSel.forEach(name => {
      if (owner) nextAssignments[name] = owner;
      else delete nextAssignments[name];
      al = logAction({ ...proj, activityLog: al }, name, owner ? `Assigned to ${owner} (batch)` : "Owner cleared (batch)");
    });
    const nextProj = { ...proj, assignments: nextAssignments, activityLog: al };
    await saveProject(nextProj);
    flash(owner ? `${bSel.size} artists assigned to ${owner}` : `${bSel.size} artists unassigned`);
    setBSel(new Set());
    setBatch(false);
  };

  const runReplyClassifier = async (artist, replyTextOverride = "") => {
    if (!requireEditor()) return;
    const sourceText = String(replyTextOverride || replyInput || "").trim();
    if (!sourceText) { flash("No reply text available yet", "err"); return; }
    setReplyInput(sourceText);
    setReplyLoading(true);
    const res = await classifyReplyText(artist, sourceText, intel?.ok ? intel.text : "", currentAiProvider, getStoredAiKey(currentAiProvider), taskModel("reply"));
    setReplyLoading(false);
    if (!res.ok) { flash(res.text || "Reply analysis failed", "err"); return; }
    const parsed = parseReplyIntel(res.text);
    setReplyResult(parsed);
    if (proj) {
      const al = logAction(proj, artist.n, "Reply intelligence generated");
      const nextProj = {
        ...proj,
        activityLog: al,
        replyIntel: { ...(proj.replyIntel || {}), [artist.n]: { ...parsed, at: new Date().toISOString() } },
      };
      await saveProject(nextProj);
    }
  };

  const applyReplySuggestedStage = async artist => {
    if (!replyResult?.nextStage) return;
    const next = replyResult.nextStage;
    if (!SM[next]) return;
    await setSt(artist.n, next);
  };

  const runFollowUpWriter = async (artist, replyTextOverride = "") => {
    if (!requireEditor()) return;
    const sends = (proj?.sendLog || []).filter(s => s.artist === artist.n);
    const latestSend = sends.length ? sends[sends.length - 1] : null;
    const preferredChannel = latestSend?.channel || (artist.e ? "email" : "dm");
    const history = sends.slice(-4).map(s => `${new Date(s.sentAt).toLocaleDateString()}: ${s.channel.toUpperCase()} via ${s.provider} v${s.variantId || "NA"}`).join("\n");
    const replyText = String(replyTextOverride || replyInput || "").trim();
    if (replyText) setReplyInput(replyText);
    const context = [
      `Current stage: ${proj?.pipeline?.[artist.n]?.stage || "prospect"}`,
      `Owner: ${proj?.assignments?.[artist.n] || "Unassigned"}`,
      `Notes: ${proj?.notes?.[artist.n] || "None"}`,
      `Recent sends:\n${history || "None"}`,
      latestSend ? `Latest touchpoint: ${new Date(latestSend.sentAt).toLocaleDateString()} via ${latestSend.channel.toUpperCase()} (${latestSend.provider})` : "No previous send logged",
      replyText ? `Latest artist reply:\n${replyText}` : "No artist reply pasted",
      replyResult?.nextAction ? `Reply intel recommendation: ${replyResult.nextAction}` : "",
    ].filter(Boolean).join("\n\n");
    const followUpInput = {
      notes: context,
      channel: preferredChannel,
      hasReply: !!replyText,
      replyText,
    };
    setFollowUpLoading(true);
    const res = await generateFollowUpDraft(artist, followUpInput, currentAiProvider, getStoredAiKey(currentAiProvider), taskModel("followup"));
    setFollowUpLoading(false);
    if (!res.ok) { flash(res.text || "Follow-up generation failed", "err"); return; }
    setFollowUpDraft(res.text.trim());
    flash(res.fallbackUsed ? "Follow-up generated with safe template" : "Follow-up draft generated");
    if (proj) {
      const al = logAction(proj, artist.n, "Follow-up draft generated");
      await saveProject({ ...proj, activityLog: al });
    }
  };

  const exportBrief = artist => {
    exportArtistBrief(artist, proj, intel?.ok ? intel.text : "", replyResult);
    flash("Artist brief exported");
  };

  useEffect(() => {
    if (!proj) return;
    setSendProvider(proj.settings?.provider || "gmail");
    setAutoLogCompose(!!proj.settings?.autoLogCompose);
  }, [proj?.id]);

  const saveProject = async nextProj => {
    const updated = projects.map(p => p.id === nextProj.id ? nextProj : p);
    setProjects(updated);
    await persist(updated);
    return updated;
  };

  const saveProjectsList = async nextProjects => {
    setProjects(nextProjects);
    await persist(nextProjects);
    return nextProjects;
  };

  const saveProjectFast = nextProj => {
    const updated = projects.map(p => p.id === nextProj.id ? nextProj : p);
    setProjects(updated);
    void persist(updated).catch(err => {
      console.error("Background project save failed:", err);
      setToast({
        m: "Project save failed in the background. Please refresh and try once more.",
        t: "err",
      });
    });
    return updated;
  };

  const saveProjectType = async nextType => {
    if (!requireEditor()) return;
    if (!proj) return;
    const normalized = normalizeProjectType(nextType);
    if (normalized === proj.type) return;
    const hasArtists = (proj.artists || []).length > 0;
    const hasMarketingItems = (proj.marketingItems || []).length > 0;
    if (normalized === "marketing" && hasArtists) {
      const ok = window.confirm("Switch this project to Marketing? Existing A&R artists will be preserved in the project data, but the marketing workflow will become the active workspace.");
      if (!ok) return;
    }
    if (normalized === "ar" && hasMarketingItems) {
      const ok = window.confirm("Switch this project to A&R? Existing marketing items will be preserved in the project data, but the A&R workflow will become the active workspace.");
      if (!ok) return;
    }
    const nextProj = { ...proj, type: normalized };
    await saveProject(nextProj);
    if (normalized !== "ar" && projectMode === "inbox") {
      setProjectMode("work");
    }
    if (normalized === "marketing") {
      if (projectMode === "inbox") setProjectMode("work");
      setMarketingStatusFilter("all");
      setMarketingCampaignFilter("all");
      setMarketingTrafficFilter("all");
      setMarketingOwnerFilter("all");
      setMarketingGroupFilter("all");
      setSelectedMarketingIds(new Set());
      setMarketingSelectionMode(false);
      changeWorkspaceUser(ALL_USER_VIEW);
    }
    flash(`Project set to ${projectTypeLabel(normalized)}`);
  };

  const saveSendPrefs = async (provider, autoLog) => {
    if (!requireEditor()) return;
    if (!proj) return;
    const nextProj = { ...proj, settings: { ...(proj.settings || {}), provider, autoLogCompose: autoLog } };
    await saveProject(nextProj);
  };

  const refreshGmailStatus = async () => {
    setGmailStatusLoading(true);
    const result = await apiGetGmailStatus();
    if (result.ok) {
      setGmailStatus({
        available: !!result.available,
        currentUserConnected: !!result.currentUserConnected,
        currentUserGmail: result.currentUserGmail || "",
        currentConnection: result.currentConnection || null,
        connections: result.connections || [],
      });
    } else {
      flash(result.error || "Could not load Gmail status", "err");
    }
    setGmailStatusLoading(false);
    return result;
  };

  const runGmailProfileCheck = async ({ silent = false } = {}) => {
    setGmailProfileTesting(true);
    const result = await apiTestGmailProfile();
    setGmailProfileTesting(false);
    if (!result.ok) {
      setGmailBannerMessage("error", result.error || "Gmail profile validation failed", result.details || "");
      if (!silent) flash(result.error || "Gmail profile validation failed", "err");
      return result;
    }
    setGmailBannerMessage("success", `Gmail connected for ${result.emailAddress}`, result.historyId ? `History ID: ${result.historyId}` : "");
    await refreshGmailStatus();
    if (!silent) flash(`Gmail connected for ${result.emailAddress}`);
    return result;
  };

  const runGmailListCheck = async () => {
    setGmailListTesting(true);
    const result = await apiTestGmailList();
    setGmailListTesting(false);
    if (!result.ok) {
      setGmailBannerMessage("error", result.error || "Gmail API test failed", result.details || "");
      flash(result.error || "Gmail API test failed", "err");
      return result;
    }
    setGmailBannerMessage(
      "success",
      `Gmail API is working for ${result.provider_email || gmailStatus.currentUserGmail || "this mailbox"}`,
      result.sample_message_ids?.length ? `Sample IDs: ${result.sample_message_ids.join(", ")}` : "No recent messages returned, but the API call succeeded.",
    );
    await refreshGmailStatus();
    flash("Gmail API test passed");
    return result;
  };

  const connectGmail = () => {
    const returnTo = `${window.location.pathname || "/ar"}${window.location.search || ""}`;
    window.location.href = `/api/ar/gmail/connect?returnTo=${encodeURIComponent(returnTo.startsWith("/ar") ? returnTo : "/ar")}`;
  };

  const disconnectGmail = async () => {
    if (!window.confirm("Disconnect your Gmail account from GEMFINDER?")) return;
    const result = await apiDisconnectGmail();
    if (!result.ok) {
      flash(result.error || "Could not disconnect Gmail", "err");
      return;
    }
    await refreshGmailStatus();
    setGmailBannerMessage("info", "Gmail disconnected", "Reconnect your mailbox to send or sync from Gmail.");
    flash("Gmail disconnected");
  };

  const loadArtistInbox = async (artist) => {
    if (!proj?.id || !artist?.n) return { ok: false, error: "No artist selected" };
    setInboxLoading(true);
    const result = await apiGetArtistInbox(proj.id, artist.n);
    setInboxLoading(false);
    if (!result.ok) {
      flash(result.error || "Could not load inbox", "err");
      return result;
    }
    setArtistInbox({
      threads: result.threads || [],
      messages: result.messages || [],
      connections: result.connections || gmailStatus.connections || [],
    });
    setSelectedThreadKey((prev) => {
      const threadKeys = new Set((result.threads || []).map((item) => item.threadKey));
      if (prev && threadKeys.has(prev)) return prev;
      return result.threads?.[0]?.threadKey || "";
    });
    return result;
  };

  const loadProjectInbox = async (projectId, threadKey = "", threadKeys = []) => {
    if (!projectId) return { ok: false, error: "No project selected" };
    setProjectInboxLoading(true);
    const result = await apiGetProjectInbox(projectId, threadKey, threadKeys);
    setProjectInboxLoading(false);
    if (!result.ok) {
      flash(result.error || "Could not load project inbox", "err");
      return result;
    }
    setProjectInbox({
      threads: result.threads || [],
      messages: result.messages || [],
      connections: result.connections || gmailStatus.connections || [],
    });
    setSelectedProjectThreadKey(prev => {
      const keys = new Set((result.threads || []).map(item => item.threadKey));
      if (threadKey && keys.has(threadKey)) return threadKey;
      if (!threadKeys.length && prev && keys.has(prev)) return prev;
      return threadKey || prev || result.threads?.[0]?.threadKey || "";
    });
    return result;
  };

  const selectProjectInboxThread = async thread => {
    if (!proj?.id || !thread) return { ok: false, error: "No thread selected" };
    const sourceKeys = Array.from(new Set((thread.sourceThreadKeys || [thread.primaryThreadKey || thread.threadKey]).filter(Boolean)));
    setSelectedProjectThreadKey(thread.threadKey);
    return loadProjectInbox(proj.id, thread.threadKey, sourceKeys);
  };

  const syncArtistInbox = async (artist, senderUserId = "", opts = {}) => {
    const { silent = false, background = false } = opts;
    if (!requireEditor()) return { ok: false, error: "Editor role required" };
    if (!proj?.id || !artist?.e) {
      if (!silent) flash("This artist does not have an email to sync", "err");
      return { ok: false, error: "Missing artist email" };
    }
    if (!background) setSyncingInbox(true);
    const result = await apiSyncArtistInbox({
      projectId: proj.id,
      artistName: artist.n,
      artistEmail: artist.e,
      ...(senderUserId ? { senderUserId } : {}),
    });
    if (!background) setSyncingInbox(false);
    if (!result.ok) {
      if (!silent) flash(result.error || "Inbox sync failed", "err");
      return result;
    }
    setArtistInbox({
      threads: result.threads || [],
      messages: result.messages || [],
      connections: result.connections || gmailStatus.connections || [],
    });
    setSelectedThreadKey((prev) => {
      const threadKeys = new Set((result.threads || []).map((item) => item.threadKey));
      if (prev && threadKeys.has(prev)) return prev;
      return result.threads?.[0]?.threadKey || "";
    });
    if (result.connections) {
      setGmailStatus((prev) => ({ ...prev, connections: result.connections }));
    }
    if (proj?.id) {
      await loadProjectInbox(proj.id);
    }
    await refreshGmailStatus();
    if (!silent) {
      if (result.errors?.length) {
        flash(result.errors[0], "err");
      } else {
        flash(result.syncedUsers?.length ? `Synced ${result.syncedUsers.length} Gmail inbox${result.syncedUsers.length === 1 ? "" : "es"}` : "Inbox synced");
      }
    }
    return result;
  };

  const createProj = async (name, desc, type = "ar") => {
    if (!requireEditor()) return;
    const id = `p_${Date.now()}`;
    const projectType = normalizeProjectType(type);
    const workspaceId = selectedWorkspace?.id || DEFAULT_WORKSPACE.id;
    const workspaceName = selectedWorkspace?.name || DEFAULT_WORKSPACE.name;
    const workspaceSlug = selectedWorkspace?.slug || DEFAULT_WORKSPACE.slug;
    const np = {
      id,
      type: projectType,
      workspaceId,
      workspaceName,
      workspaceSlug,
      workspaceRole: defaultWorkspaceRoleForProjectType(projectType),
      name,
      desc,
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
      teamUsers: [...workspaceTeamUsers],
      assignments: {},
      replyIntel: {},
      internalRoster: {
        names: [],
        fileName: "",
        uploadedAt: "",
      },
      settings: {
        provider: "gmail",
        autoLogCompose: false,
        aiProvider: "anthropic",
        aiModelsByProvider: {
          anthropic: { ...DEFAULT_AI_MODELS.anthropic },
          openai: { ...DEFAULT_AI_MODELS.openai },
          google: { ...DEFAULT_AI_MODELS.google },
          deepseek: { ...DEFAULT_AI_MODELS.deepseek },
          groq: { ...DEFAULT_AI_MODELS.groq },
        },
        draftGuardrails: { ...DEFAULT_DRAFT_GUARDRAILS },
        savedTemplates: [],
        publicCsvToken: "",
        marketingCampaignBank: [],
        marketingGroups: [],
        appearance: { accent: "blue" },
      },
      created: new Date().toISOString(),
    };
    const u = [...projects, np];
    setProjects(u);
    setApId(id);
    setScreen("project");
    setShowNew(false);
    setNpN("");
    setNpD("");
    setNewProjectType("ar");
    await persist(u, id, undefined, undefined, undefined, undefined, undefined, workspaceId);
    flash(`Created "${name}" ${projectTypeLabel(projectType)} workspace`);
  };

  const importCSV = async e => {
    if (!requireEditor()) return;
    const f = e.target.files?.[0];
    if (!f || !proj) return;
    const t = await f.text();
    if (isMarketingProject) {
      const parsed = parseMarketingCSV(t, proj.teamUsers || DEFAULT_TEAM_USERS);
      if (!parsed.length) { flash("No valid talent assignments found in CSV", "err"); e.target.value = ""; return; }
      const existing = (proj.marketingItems || []).map(item => normalizeMarketingItem(item, proj.teamUsers || DEFAULT_TEAM_USERS));
      const nextItems = [...existing];
      const keyToIndex = new Map();
      nextItems.forEach((item, index) => {
        keyToIndex.set(marketingImportKey(item), index);
      });
      let createdCount = 0;
      let refreshedCount = 0;
      let unchangedCount = 0;
      parsed.forEach(item => {
        const key = marketingImportKey(item);
        const existingIndex = keyToIndex.get(key);
        if (typeof existingIndex === "number") {
          const { merged, changed } = mergeMarketingImportedItem(nextItems[existingIndex], item, proj.teamUsers || DEFAULT_TEAM_USERS);
          nextItems[existingIndex] = merged;
          if (changed) refreshedCount += 1;
          else unchangedCount += 1;
          return;
        }
        nextItems.push(item);
        keyToIndex.set(key, nextItems.length - 1);
        createdCount += 1;
      });
      const nextProj = {
        ...proj,
        marketingItems: nextItems,
        settings: {
          ...(proj.settings || {}),
          marketingCampaignBank: normalizeMarketingCampaignBank([
            ...(proj.settings?.marketingCampaignBank || []),
            ...parsed.flatMap(item => item.campaigns || []),
          ]),
        },
      };
      await saveProject(nextProj);
      setSearch("");
      setMarketingStatusFilter("all");
      setMarketingCampaignFilter("all");
      setMarketingTrafficFilter("all");
      setMarketingOwnerFilter("all");
      setMarketingGroupFilter("all");
      setSelectedMarketingIds(new Set());
      setMarketingSelectionMode(false);
      changeWorkspaceUser(ALL_USER_VIEW);
      flash(`Imported ${parsed.length} rows · ${createdCount} new · ${refreshedCount} updated · ${unchangedCount} unchanged`);
    } else {
      const p = parseCSV(t);
      if (!p.length) { flash("No valid artists", "err"); return; }
      const ex = new Set(proj.artists.map(a => canonicalArtistName(a.n)));
      const nw = p.filter(a => !ex.has(canonicalArtistName(a.n)));
      const mg = [...proj.artists, ...nw];
      const nl = { ...proj.pipeline };
      nw.forEach(a => { if (a.s && !nl[a.n]) nl[a.n] = { stage: "sent", date: new Date().toISOString() }; });
      const nextProj = { ...proj, artists: mg, pipeline: nl };
      await saveProject(nextProj);
      flash(`Merged ${nw.length} new artists · ${p.length - nw.length} duplicates skipped`);
    }
    e.target.value = "";
  };

  const importInternalRoster = async e => {
    if (!requireEditor()) return;
    const f = e.target.files?.[0];
    if (!f || !proj) return;
    const text = await f.text();
    const names = parseArtistNameCSV(text);
    if (!names.length) {
      flash("No artist names found in internal CSV", "err");
      e.target.value = "";
      return;
    }
    const nextProj = {
      ...proj,
      internalRoster: {
        names,
        fileName: f.name,
        uploadedAt: new Date().toISOString(),
      },
    };
    await saveProject(nextProj);
    const projectNames = new Set(proj.artists.map(a => canonicalArtistName(a.n)));
    const matches = names.filter(name => projectNames.has(canonicalArtistName(name))).length;
    flash(`Loaded internal roster (${names.length}) · ${matches} current matches`);
    e.target.value = "";
  };

  const clearInternalRoster = async () => {
    if (!requireEditor()) return;
    if (!proj) return;
    const nextProj = {
      ...proj,
      internalRoster: { names: [], fileName: "", uploadedAt: "" },
    };
    await saveProject(nextProj);
    flash("Internal roster cleared");
  };

  const addManualArtist = async () => {
    if (!requireEditor()) return;
    if (!proj) return;
    if (manualArtistSubmitRef.current) return;
    const name = artistForm.name.trim();
    if (!name) {
      flash("Artist name is required", "err");
      return;
    }
    const canon = canonicalArtistName(name);
    const existing = new Set(proj.artists.map(a => canonicalArtistName(a.n)));
    if (existing.has(canon)) {
      flash(`${name} is already in this project`, "err");
      return;
    }
    manualArtistSubmitRef.current = true;
    setManualArtistSaving(true);
    const socialHandle = normalizeSocialHandle(artistForm.social);
    const nextArtist = {
      n: name,
      g: artistForm.genre.trim(),
      l: artistForm.listeners.trim(),
      h: artistForm.hitTrack.trim(),
      ig: socialHandle ? `@${socialHandle}` : "",
      soc: socialHandle,
      e: artistForm.email.trim(),
      loc: artistForm.location.trim(),
      curatorPageUrl: String(artistForm.curatorPageUrl || "").trim(),
      curatedArtists: normalizeCuratedArtists(artistForm.curatedArtists),
      s: false,
      o: "Manual Add",
    };
    const activityLog = logAction(proj, name, "Artist added manually");
    const nextProj = {
      ...proj,
      artists: [nextArtist, ...proj.artists],
      notes: artistForm.note.trim() ? { ...(proj.notes || {}), [name]: artistForm.note.trim() } : proj.notes,
      activityLog,
    };
    const alreadyOnPlatform = (proj.internalRoster?.names || []).some(item => canonicalArtistName(item) === canon);
    resetArtistForm();
    setShowAddArtist(false);
    saveProjectFast(nextProj);
    flash(alreadyOnPlatform ? `Added ${name} · already found in internal roster` : `Added ${isCuratorProject ? "curator" : "artist"} ${name}`);
    setTimeout(() => {
      manualArtistSubmitRef.current = false;
      setManualArtistSaving(false);
    }, 350);
  };

  const saveMarketingItem = async () => {
    if (!requireEditor()) return;
    if (!proj) return;
    if (marketingItemSubmitRef.current) return;
    const talentName = marketingForm.talentName.trim();
    if (!talentName) {
      flash("Talent name is required", "err");
      return;
    }
    const selectedCampaign = marketingForm.newCampaign.trim() || marketingForm.campaign.trim();
    const normalizedCampaigns = normalizeMarketingCampaigns(selectedCampaign);
    const normalizedChannels = normalizeMarketingChannels(marketingForm.channels);
    const title = marketingForm.title.trim() || [talentName, normalizedCampaigns[0] || marketingForm.deliverableType.trim()].filter(Boolean).join(" · ");
    if (marketingForm.status === "rejected" && !marketingForm.rejectedReason.trim()) {
      flash("Please add a rejection reason", "err");
      return;
    }
    marketingItemSubmitRef.current = true;
    setMarketingItemSaving(true);
    const existingMarketingItems = (proj.marketingItems || []).map(item => normalizeMarketingItem(item, proj.teamUsers || DEFAULT_TEAM_USERS));
    const normalizedCampaignKey = canonicalArtistName(normalizedCampaigns[0] || "");
    const normalizedEmail = String(marketingForm.email || "").trim().toLowerCase();
    const duplicateItem = !marketingForm.id
      ? existingMarketingItems.find(item => {
          if (normalizedCampaignKey) {
            const hasCampaign = (item.campaigns || []).some(campaign => canonicalArtistName(campaign) === normalizedCampaignKey);
            if (!hasCampaign) return false;
          } else if ((item.campaigns || []).length) {
            return false;
          }
          const sameName = canonicalArtistName(item.talentName) === canonicalArtistName(talentName);
          const sameEmail = normalizedEmail && String(item.email || "").trim().toLowerCase() === normalizedEmail;
          return sameName || sameEmail;
        })
      : null;
    if (duplicateItem) {
      marketingItemSubmitRef.current = false;
      setMarketingItemSaving(false);
      openMarketingItemModal(duplicateItem);
      flash(`${talentName} already has an assignment for ${normalizedCampaigns[0] || "No campaign"}`, "err");
      return;
    }
    const itemId = marketingForm.id || `mkt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const nextItem = normalizeMarketingItem({
      ...marketingForm,
      id: itemId,
      talentName,
      campaign: normalizedCampaigns[0] || "",
      campaigns: normalizedCampaigns,
      channels: normalizedChannels,
      instagramHandle: normalizeSocialHandle(marketingForm.instagramUrl || marketingForm.instagramHandle),
      tiktokHandle: normalizeSocialHandle(marketingForm.tiktokUrl || marketingForm.tiktokHandle),
      title,
      updatedAt: new Date().toISOString(),
      createdAt: marketingForm.id
        ? (proj.marketingItems || []).find(item => item.id === marketingForm.id)?.createdAt || new Date().toISOString()
        : new Date().toISOString(),
    }, proj.teamUsers || DEFAULT_TEAM_USERS);
    const exists = (proj.marketingItems || []).some(item => item.id === itemId);
    const previousStatus = exists
      ? normalizeMarketingStatus((proj.marketingItems || []).find(item => item.id === itemId)?.status)
      : "prospect";
    const campaignLabel = normalizedCampaigns[0] || "No campaign";
    let nextActivityLog = proj.activityLog || {};
    if (!exists) {
      nextActivityLog = logAction({ ...proj, activityLog: nextActivityLog }, talentName, `Campaign assignment created · ${campaignLabel}`, "event", {
        assignmentId: itemId,
        campaign: campaignLabel,
      });
    } else if (previousStatus !== nextItem.status) {
      nextActivityLog = logAction({ ...proj, activityLog: nextActivityLog }, talentName, `Marketing status → ${MM[nextItem.status]?.label || titleCaseWords(nextItem.status)}`, "event", {
        assignmentId: itemId,
        campaign: campaignLabel,
      });
    } else {
      nextActivityLog = logAction({ ...proj, activityLog: nextActivityLog }, talentName, `Campaign assignment updated · ${campaignLabel}`, "event", {
        assignmentId: itemId,
        campaign: campaignLabel,
      });
    }
    const nextProj = {
      ...proj,
      marketingItems: exists
        ? (proj.marketingItems || []).map(item => item.id === itemId ? nextItem : item)
        : [nextItem, ...(proj.marketingItems || [])],
      activityLog: nextActivityLog,
      settings: {
        ...(proj.settings || {}),
        marketingCampaignBank: normalizeMarketingCampaignBank([
          ...(proj.settings?.marketingCampaignBank || []),
          ...normalizedCampaigns,
        ]),
      },
    };
    const shouldAwaitSave = !exists || previousStatus !== nextItem.status;
    closeMarketingItemModal();
    if (shouldAwaitSave) {
      await saveProject(nextProj);
    } else {
      saveProjectFast(nextProj);
    }
    flash(exists ? `Updated ${talentName}` : `Added ${talentName}`);
    setTimeout(() => {
      marketingItemSubmitRef.current = false;
      setMarketingItemSaving(false);
    }, 350);
  };

  const addTalentProfileToProject = async () => {
    if (!requireEditor()) return;
    if (!selectedTalentProfile) return;
    if (!talentTargetProject) {
      flash("Choose a target project first", "err");
      return;
    }
    if (talentTargetSaving) return;

    setTalentTargetSaving(true);
    const now = new Date().toISOString();
    const profile = selectedTalentProfile;
    const targetTeamUsers = talentTargetProject.teamUsers || DEFAULT_TEAM_USERS;
    const primaryEmail = profile.primaryEmail || profile.emails?.[0] || "";
    const emailKey = canonicalEmail(primaryEmail);

    try {
      if (talentTargetProjectType === "marketing") {
        const selectedCampaign = String(talentTargetNewCampaign || talentTargetCampaign || "").trim();
        const normalizedCampaigns = normalizeMarketingCampaigns(selectedCampaign);
        const campaignKey = canonicalArtistName(normalizedCampaigns[0] || "");
        const existingItems = (talentTargetProject.marketingItems || []).map(item => normalizeMarketingItem(item, targetTeamUsers));
        const existingAssignment = existingItems.find(item => {
          const hasCampaign = campaignKey
            ? (item.campaigns?.length ? item.campaigns : [item.campaign || ""]).some(campaign => canonicalArtistName(campaign) === campaignKey)
            : !(item.campaigns || []).length;
          if (!hasCampaign) return false;
          const sameEmail = emailKey && canonicalEmail(item.email) === emailKey;
          const sameName = canonicalArtistName(item.talentName) === canonicalArtistName(profile.displayName);
          return sameEmail || sameName;
        });

        if (existingAssignment) {
          closeTalentProfileModal();
          updateWorkspaceUrl(talentTargetProject.id, "", "", existingAssignment.id);
          setApId(talentTargetProject.id);
          setProjectMode("work");
          setScreen("project");
          flash(`${profile.displayName} is already in ${talentTargetProject.name}`);
          return;
        }

        const leadMarketing = profile.marketingAssignments[0] || null;
        const leadAr = profile.arRecords[0] || null;
        const nextItem = normalizeMarketingItem({
          id: `mkt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          talentName: profile.displayName,
          talentType: profile.talentTypes[0] || "Internal Artist",
          title: [profile.displayName, normalizedCampaigns[0] || leadMarketing?.deliverableType || "UGC"].filter(Boolean).join(" · "),
          campaign: normalizedCampaigns[0] || "",
          campaigns: normalizedCampaigns,
          trafficType: leadMarketing?.trafficType || "Organic",
          channels: leadMarketing?.channels || [],
          deliverableType: leadMarketing?.deliverableType || "UGC",
          status: normalizeMarketingStatus(talentTargetStatus),
          owner: talentTargetOwner || "",
          dueDate: "",
          email: primaryEmail,
          instagramHandle: profile.instagramHandle || "",
          instagramUrl: profile.instagramUrl || "",
          instagramFollowers: profile.instagramFollowers || "",
          tiktokHandle: profile.tiktokHandle || "",
          tiktokUrl: profile.tiktokUrl || "",
          tiktokFollowers: profile.tiktokFollowers || "",
          spotifyUrl: profile.spotifyUrl || "",
          spotifyMonthlyListeners: profile.spotifyMonthlyListeners || leadAr?.monthlyListeners || "",
          briefUrl: "",
          contentUrl: "",
          notes: "",
          rejectedReason: "",
          createdAt: now,
          updatedAt: now,
        }, targetTeamUsers);

        const nextTargetProject = {
          ...talentTargetProject,
          marketingItems: [nextItem, ...(talentTargetProject.marketingItems || [])],
          settings: {
            ...(talentTargetProject.settings || {}),
            marketingCampaignBank: normalizeMarketingCampaignBank([
              ...(talentTargetProject.settings?.marketingCampaignBank || []),
              ...normalizedCampaigns,
            ]),
          },
        };
        const nextProjects = projects.map(project => project.id === nextTargetProject.id ? nextTargetProject : project);
        await saveProjectsList(nextProjects);
        closeTalentProfileModal();
        updateWorkspaceUrl(nextTargetProject.id, "", "", nextItem.id);
        setApId(nextTargetProject.id);
        setProjectMode("work");
        setScreen("project");
        flash(`Added ${profile.displayName} to ${nextTargetProject.name}`);
        return;
      }

      const targetProjectType = normalizeProjectType(talentTargetProject.type);
      const targetStage = normalizeStageId(talentTargetStatus);
      const existingArtist = (talentTargetProject.artists || []).find(artist => {
        const sameName = canonicalArtistName(artist.n) === canonicalArtistName(profile.displayName);
        const sameEmail = emailKey && canonicalEmail(artist.e) === emailKey;
        return sameName || sameEmail;
      });

      if (existingArtist) {
        closeTalentProfileModal();
        updateWorkspaceUrl(talentTargetProject.id, existingArtist.n, "overview", "");
        setApId(talentTargetProject.id);
        setProjectMode("work");
        setScreen("project");
        flash(`${profile.displayName} is already in ${talentTargetProject.name}`);
        return;
      }

      const leadAr = profile.arRecords[0] || null;
      const nextArtist = {
        n: profile.displayName,
        g: leadAr?.genre || "",
        l: profile.spotifyMonthlyListeners || leadAr?.monthlyListeners || "",
        h: leadAr?.hitTrack || "",
        ig: profile.instagramHandle ? `@${profile.instagramHandle}` : "",
        soc: profile.instagramHandle || "",
        e: targetProjectType === "curator" ? "" : primaryEmail,
        loc: leadAr?.location || "",
        curatorPageUrl: "",
        curatedArtists: [],
        s: false,
        o: "Shared Talent Profile",
      };
      const nextPipeline = { ...(talentTargetProject.pipeline || {}) };
      if (targetStage !== "prospect") {
        nextPipeline[nextArtist.n] = { stage: targetStage, date: now };
      }
      const nextAssignments = talentTargetOwner
        ? { ...(talentTargetProject.assignments || {}), [nextArtist.n]: talentTargetOwner }
        : { ...(talentTargetProject.assignments || {}) };
      const nextActivityLog = logAction(talentTargetProject, nextArtist.n, "Added from shared talent profile");
      const nextTargetProject = {
        ...talentTargetProject,
        artists: [nextArtist, ...(talentTargetProject.artists || [])],
        pipeline: nextPipeline,
        assignments: nextAssignments,
        activityLog: nextActivityLog,
      };
      const nextProjects = projects.map(project => project.id === nextTargetProject.id ? nextTargetProject : project);
      await saveProjectsList(nextProjects);
      closeTalentProfileModal();
      updateWorkspaceUrl(nextTargetProject.id, nextArtist.n, "overview", "");
      setApId(nextTargetProject.id);
      setProjectMode("work");
      setScreen("project");
      flash(`Added ${profile.displayName} to ${nextTargetProject.name}`);
    } finally {
      setTalentTargetSaving(false);
    }
  };

  const deleteMarketingItem = async itemId => {
    if (!requireEditor()) return;
    if (!proj) return;
    const target = (proj.marketingItems || []).find(item => item.id === itemId);
    if (!target) return;
    if (!window.confirm(`Delete "${marketingItemPrimaryLabel(target)}" from this marketing project?`)) return;
    const nextProj = {
      ...proj,
      marketingItems: (proj.marketingItems || []).filter(item => item.id !== itemId),
    };
    await saveProject(nextProj);
    if (marketingForm.id === itemId) {
      closeMarketingItemModal();
    }
    flash(`${marketingItemPrimaryLabel(target)} deleted`);
  };

  const setMarketingItemStatus = async (itemId, status) => {
    if (!requireEditor()) return;
    if (!proj) return;
    const target = (proj.marketingItems || []).find(item => item.id === itemId);
    if (!target) return;
    const normalized = normalizeMarketingStatus(status);
    const nextProj = {
      ...proj,
      marketingItems: (proj.marketingItems || []).map(item =>
        item.id === itemId
          ? { ...item, status: normalized, updatedAt: new Date().toISOString() }
          : item
      ),
      activityLog: logAction(proj, target?.talentName || "", `Marketing status → ${MM[normalized]?.label || titleCaseWords(normalized)}`, "event", {
        assignmentId: itemId,
        campaign: target?.campaign || "",
      }),
    };
    await saveProject(nextProj);
    flash(`Status → ${MM[normalized]?.label}`);
  };

  const assignMarketingItemOwner = async (itemId, owner) => {
    if (!requireEditor()) return;
    if (!proj) return;
    const target = (proj.marketingItems || []).find(item => item.id === itemId);
    if (!target) return;
    const nextProj = {
      ...proj,
      marketingItems: (proj.marketingItems || []).map(item =>
        item.id === itemId
          ? { ...item, owner, updatedAt: new Date().toISOString() }
          : item
      ),
      activityLog: logAction(proj, target?.talentName || "", owner ? `Marketing owner → ${owner}` : "Marketing owner cleared", "event", {
        assignmentId: itemId,
        campaign: target?.campaign || "",
      }),
    };
    await saveProject(nextProj);
    flash(owner ? `Assigned to ${owner}` : "Owner cleared");
  };

  const saveArtistProfileEdits = async artist => {
    if (!requireEditor()) return;
    if (!proj || !artist) return;
    const previousName = String(artist.n || "");
    const nextName = artistEditForm.name.trim();
    if (!nextName) {
      flash("Artist name is required", "err");
      return;
    }
    const renamed = nextName !== previousName;
    const nextCanon = canonicalArtistName(nextName);
    const hasCollision = proj.artists.some(item => item.n !== previousName && canonicalArtistName(item.n) === nextCanon);
    if (hasCollision) {
      flash(`${nextName} already exists in this project`, "err");
      return;
    }

    const socialHandle = normalizeSocialHandle(artistEditForm.social);
    const nextArtist = {
      ...artist,
      n: nextName,
      g: artistEditForm.genre.trim(),
      l: artistEditForm.listeners.trim(),
      h: artistEditForm.hitTrack.trim(),
      ig: socialHandle ? `@${socialHandle}` : "",
      soc: socialHandle,
      e: artistEditForm.email.trim(),
      loc: artistEditForm.location.trim(),
      curatorPageUrl: String(artistEditForm.curatorPageUrl || "").trim(),
      curatedArtists: normalizeCuratedArtists(artistEditForm.curatedArtists),
    };

    setArtistEditSaving(true);
    try {
      const nextArtists = proj.artists.map(item => item.n === previousName ? nextArtist : item);
      let nextProj = {
        ...proj,
        artists: nextArtists,
        pipeline: renamed ? renameObjectKey(proj.pipeline, previousName, nextName) : { ...(proj.pipeline || {}) },
        notes: renamed ? renameObjectKey(proj.notes, previousName, nextName) : { ...(proj.notes || {}) },
        followUps: renamed ? renameObjectKey(proj.followUps, previousName, nextName) : { ...(proj.followUps || {}) },
        assignments: renamed ? renameObjectKey(proj.assignments, previousName, nextName) : { ...(proj.assignments || {}) },
        replyIntel: renamed ? renameObjectKey(proj.replyIntel, previousName, nextName) : { ...(proj.replyIntel || {}) },
        sequenceState: renamed ? renameObjectKey(proj.sequenceState, previousName, nextName) : { ...(proj.sequenceState || {}) },
        activityLog: renamed ? renameObjectKey(proj.activityLog, previousName, nextName) : { ...(proj.activityLog || {}) },
        sendLog: renamed
          ? (proj.sendLog || []).map(item => item.artist === previousName ? { ...item, artist: nextName } : item)
          : [...(proj.sendLog || [])],
      };

      let activityLog = nextProj.activityLog || {};
      if (renamed) {
        activityLog = logAction({ ...nextProj, activityLog }, nextName, `Artist renamed from ${previousName}`);
      }
      activityLog = logAction({ ...nextProj, activityLog }, nextName, "Artist profile updated");
      nextProj = { ...nextProj, activityLog };

      await saveProject(nextProj);

      if (renamed) {
        try {
          await apiRelabelArtistInbox({
            projectId: proj.id,
            previousArtistName: previousName,
            nextArtistName: nextName,
          });
        } catch (error) {
          console.error("[gemfinder] artist inbox relabel failed", error);
          flash("Artist saved, but inbox labels could not be updated yet", "err");
        }
      }

      setSelA(nextArtist);
      seedArtistEditForm(nextArtist);
      flash(renamed ? `Updated ${previousName} → ${nextName}` : `Updated ${nextName}`);
    } finally {
      setArtistEditSaving(false);
    }
  };

  const copyProjectCsvLink = async () => {
    if (!proj) return;
    let nextProj = proj;
    let token = proj.settings?.publicCsvToken || "";
    if (!token) {
      token = makeShareToken();
      nextProj = {
        ...proj,
        settings: {
          ...(proj.settings || {}),
          publicCsvToken: token,
        },
      };
      await saveProject(nextProj);
    }
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/api/ar/projects/${proj.id}/csv?token=${encodeURIComponent(token)}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const el = document.createElement("textarea");
        el.value = url;
        el.style.cssText = "position:fixed;top:-9999px";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }
      flash("Live CSV link copied");
    } catch {
      flash("Could not copy CSV link", "err");
    }
  };

  const archiveArtist = async artist => {
    if (!requireEditor()) return;
    if (!proj || !artist) return;
    if (!window.confirm(`Archive ${artist.n}? This removes the artist from the active pipeline but keeps a recovery snapshot.`)) return;

    const name = artist.n;
    const archiveRecord = {
      id: `arch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      artist,
      archivedAt: new Date().toISOString(),
      archivedBy: currentActor,
      note: proj.notes?.[name] || "",
      followUp: proj.followUps?.[name] || "",
      owner: proj.assignments?.[name] || "",
      stage: proj.pipeline?.[name]?.stage || "prospect",
      stageDate: proj.pipeline?.[name]?.date || "",
      activityLog: [
        ...((proj.activityLog || {})[name] || []),
        {
          id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          action: "Artist archived",
          kind: "event",
          actor: currentActor,
          time: new Date().toISOString(),
        },
      ],
      replyIntel: proj.replyIntel?.[name] || null,
      sequenceState: proj.sequenceState?.[name] || null,
      sendLog: (proj.sendLog || []).filter(item => item.artist === name),
    };

    const nextProj = {
      ...proj,
      artists: proj.artists.filter(item => item.n !== name),
      archivedArtists: [archiveRecord, ...(proj.archivedArtists || [])],
      pipeline: omitKey(proj.pipeline, name),
      notes: omitKey(proj.notes, name),
      followUps: omitKey(proj.followUps, name),
      assignments: omitKey(proj.assignments, name),
      replyIntel: omitKey(proj.replyIntel, name),
      sequenceState: omitKey(proj.sequenceState, name),
      activityLog: omitKey(proj.activityLog, name),
      sendLog: (proj.sendLog || []).filter(item => item.artist !== name),
    };
    await saveProject(nextProj);
    setSelA(null);
    setScreen("project");
    flash(`${name} archived`);
  };

  const deleteArtistPermanently = async artist => {
    if (!requireEditor()) return;
    if (!proj || !artist) return;
    if (!window.confirm(`Delete ${artist.n} permanently? This removes notes, activity, send logs, and pipeline history for this artist.`)) return;

    const name = artist.n;
    const nextProj = {
      ...proj,
      artists: proj.artists.filter(item => item.n !== name),
      archivedArtists: (proj.archivedArtists || []).filter(item => item?.artist?.n !== name),
      pipeline: omitKey(proj.pipeline, name),
      notes: omitKey(proj.notes, name),
      followUps: omitKey(proj.followUps, name),
      assignments: omitKey(proj.assignments, name),
      replyIntel: omitKey(proj.replyIntel, name),
      sequenceState: omitKey(proj.sequenceState, name),
      activityLog: omitKey(proj.activityLog, name),
      sendLog: (proj.sendLog || []).filter(item => item.artist !== name),
    };
    await saveProject(nextProj);
    setSelA(null);
    setScreen("project");
    flash(`${name} deleted`);
  };

  const setSt = async (n, sid) => {
    if (!requireEditor()) return;
    if (!proj) return;
    const prevStage = proj.pipeline[n]?.stage || "prospect";
    const nl = { ...proj.pipeline, [n]: { ...(proj.pipeline[n] || {}), stage: sid, date: new Date().toISOString() } };
    let al = logAction(proj, n, `Stage → ${SM[sid]?.label}`);
    const credited = creditABOutcome(proj, n, sid, prevStage);
    if ((sid === "replied" || sid === "won" || sid === "live") && credited.abStats !== proj.abStats) {
      al = logAction({ ...proj, activityLog: al }, n, `A/B outcome credited (${sid})`);
    }
    const nextProj = { ...proj, pipeline: nl, activityLog: al, abStats: credited.abStats, abCredits: credited.abCredits };
    await saveProject(nextProj);
    flash(`${n} → ${SM[sid]?.label}`);
  };

  const batchSt = async sid => {
    if (!requireEditor()) return;
    if (!proj || bSel.size === 0) return;
    const nl = { ...proj.pipeline };
    let al = proj.activityLog || {};
    bSel.forEach(n => {
      nl[n] = { ...(nl[n] || {}), stage: sid, date: new Date().toISOString() };
      al = logAction({ ...proj, activityLog: al }, n, `Batch → ${SM[sid]?.label}`);
    });
    const nextProj = { ...proj, pipeline: nl, activityLog: al };
    await saveProject(nextProj);
    flash(`Moved ${bSel.size} → ${SM[sid]?.label}`);
    setBSel(new Set());
    setBatch(false);
  };

  const saveN = async (n, note) => {
    if (!requireEditor()) return;
    if (!proj) return;
    const al = logAction(proj, n, "Note updated");
    const nextProj = { ...proj, notes: { ...proj.notes, [n]: note }, activityLog: al };
    await saveProject(nextProj);
  };

  const saveFU = async (n, d) => {
    if (!requireEditor()) return;
    if (!proj) return;
    const al = logAction(proj, n, d ? `Follow-up: ${sD(d)}` : "Follow-up cleared");
    const nextProj = { ...proj, followUps: { ...proj.followUps, [n]: d }, activityLog: al };
    await saveProject(nextProj);
    flash(d ? `Follow-up: ${sD(d)}` : "Cleared");
  };

  const addActivityNote = async n => {
    if (!requireEditor()) return;
    if (!proj) return;
    const note = logNoteDraft.trim();
    if (!note) return;
    const al = logAction(proj, n, "Activity note", "note", { note, author: currentActor });
    const nextProj = { ...proj, activityLog: al };
    await saveProject(nextProj);
    setLogNoteDraft("");
    flash("Activity note added");
  };

  const startEditActivityNote = entry => {
    if (!entry?.id || entry.kind !== "note") return;
    setEditLogNoteId(entry.id);
    setEditLogNoteText(entry.note || "");
  };

  const cancelEditActivityNote = () => {
    setEditLogNoteId("");
    setEditLogNoteText("");
  };

  const saveActivityNoteEdit = async n => {
    if (!requireEditor()) return;
    if (!proj || !editLogNoteId) return;
    const note = editLogNoteText.trim();
    if (!note) { flash("Note cannot be empty", "err"); return; }
    const current = (proj.activityLog || {})[n] || [];
    const updated = current.map(l => {
      if (l.id !== editLogNoteId) return l;
      return { ...l, note, editedAt: new Date().toISOString(), editedBy: currentActor };
    });
    const nextProj = {
      ...proj,
      activityLog: { ...(proj.activityLog || {}), [n]: updated },
    };
    await saveProject(nextProj);
    cancelEditActivityNote();
    flash("Activity note updated");
  };

  const cp = (text, key) => {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.style.cssText = "position:fixed;top:-9999px";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    } catch {
      navigator.clipboard?.writeText(text).catch(() => {});
    }
    setCopied(key);
    setTimeout(() => setCopied(null), 1800);
    if (canEdit && proj && selA) {
      const al = logAction(proj, selA.n, `Copied ${key} draft`);
      const nextProj = { ...proj, activityLog: al };
      setProjects(projects.map(p => p.id === proj.id ? nextProj : p));
      persist(projects.map(p => p.id === proj.id ? nextProj : p));
    }
  };

  const primeArtistContext = a => {
    const bucket = bucketGenre(a.g);
    const plan = buildABPlan(proj?.abStats || {}, a, bucket);
    const defaultPlatform = a.e ? "email" : "instagram_dm";
    setDetailTab(isCuratorProject ? "overview" : (a.e ? "outreach" : "overview"));
    setDraftPlatform(defaultPlatform);
    setSelA(a);
    setDrafts(genQuickDrafts(a, bucket, plan, defaultPlatform));
    setDraftTab(0);
    setDraftMode("template");
    setTemplateNameDraft("");
    setSelectedTemplateId("");
    setANote(proj?.notes?.[a.n] || "");
    setAFU(proj?.followUps?.[a.n] || "");
    setIntel(null);
    setShowLog(false);
    setLogNoteDraft("");
    setEditLogNoteId("");
    setEditLogNoteText("");
    setSeqPick(proj?.sequenceState?.[a.n]?.sequenceId || SEQUENCES[0].id);
    const existingReply = proj?.replyIntel?.[a.n] || null;
    setReplyResult(existingReply);
    setReplyInput("");
    setFollowUpDraft("");
    setGmailReplyDraft("");
    setArtistInbox({ threads: [], messages: [], connections: gmailStatus.connections || [] });
    setSelectedThreadKey("");
  };

  const openQuickArtist = a => {
    primeArtistContext(a);
    setShowProjectMenu(false);
    setShowQuickDrawer(true);
  };

  const openA = a => {
    primeArtistContext(a);
    setShowQuickDrawer(false);
    setScreen("detail");
  };

  const updateTalentOverviewKickoffStage = async (record, nextStage) => {
    if (!requireEditor()) return;
    if (!record?.projectId || !record?.artistName) return;
    const targetProject = projects.find(project => project.id === record.projectId);
    if (!targetProject) {
      flash("Could not find that kickoff source record", "err");
      return;
    }
    const normalizedStage = normalizeStageId(nextStage);
    const currentStage = normalizeStageId(targetProject.pipeline?.[record.artistName]?.stage || "prospect");
    if (normalizedStage === currentStage) return;
    const nextProject = {
      ...targetProject,
      pipeline: {
        ...(targetProject.pipeline || {}),
        [record.artistName]: {
          ...(targetProject.pipeline?.[record.artistName] || {}),
          stage: normalizedStage,
          date: new Date().toISOString(),
        },
      },
      activityLog: logAction(targetProject, record.artistName, `Stage → ${SM[normalizedStage]?.label || "Prospect"}`),
    };
    await saveProjectsList(projects.map(project => project.id === targetProject.id ? nextProject : project));
    flash(`${record.artistName} → ${SM[normalizedStage]?.label || "Prospect"}`);
  };

  const updateTalentOverviewKickoffOwner = async (record, nextOwner) => {
    if (!requireEditor()) return;
    if (!record?.projectId || !record?.artistName) return;
    const targetProject = projects.find(project => project.id === record.projectId);
    if (!targetProject) {
      flash("Could not find that kickoff source record", "err");
      return;
    }
    const currentOwner = String(targetProject.assignments?.[record.artistName] || "");
    if (currentOwner === String(nextOwner || "")) return;
    const nextAssignments = { ...(targetProject.assignments || {}) };
    if (nextOwner) nextAssignments[record.artistName] = nextOwner;
    else delete nextAssignments[record.artistName];
    const nextProject = {
      ...targetProject,
      assignments: nextAssignments,
      activityLog: logAction(targetProject, record.artistName, nextOwner ? `Assigned to ${nextOwner}` : "Owner cleared"),
    };
    await saveProjectsList(projects.map(project => project.id === targetProject.id ? nextProject : project));
    flash(nextOwner ? `${record.artistName} assigned to ${nextOwner}` : `${record.artistName} unassigned`);
  };

  const updateTalentOverviewKickoffNote = async (record, nextNote) => {
    if (!requireEditor()) return;
    if (!record?.projectId || !record?.artistName) return;
    const targetProject = projects.find(project => project.id === record.projectId);
    if (!targetProject) {
      flash("Could not find that kickoff source record", "err");
      return;
    }
    const currentNote = String(targetProject.notes?.[record.artistName] || "");
    if (currentNote === String(nextNote || "")) return;
    const nextNotes = { ...(targetProject.notes || {}) };
    if (nextNote) nextNotes[record.artistName] = nextNote;
    else delete nextNotes[record.artistName];
    const nextProject = {
      ...targetProject,
      notes: nextNotes,
      activityLog: logAction(targetProject, record.artistName, "Note updated"),
    };
    await saveProjectsList(projects.map(project => project.id === targetProject.id ? nextProject : project));
    flash("Kickoff note saved");
  };

  const updateTalentOverviewKickoffFollowUp = async (record, nextFollowUp) => {
    if (!requireEditor()) return;
    if (!record?.projectId || !record?.artistName) return;
    const targetProject = projects.find(project => project.id === record.projectId);
    if (!targetProject) {
      flash("Could not find that kickoff source record", "err");
      return;
    }
    const currentFollowUp = String(targetProject.followUps?.[record.artistName] || "");
    if (currentFollowUp === String(nextFollowUp || "")) return;
    const nextFollowUps = { ...(targetProject.followUps || {}) };
    if (nextFollowUp) nextFollowUps[record.artistName] = nextFollowUp;
    else delete nextFollowUps[record.artistName];
    const nextProject = {
      ...targetProject,
      followUps: nextFollowUps,
      activityLog: logAction(targetProject, record.artistName, nextFollowUp ? `Follow-up: ${sD(nextFollowUp)}` : "Follow-up cleared"),
    };
    await saveProjectsList(projects.map(project => project.id === targetProject.id ? nextProject : project));
    flash(nextFollowUp ? `Follow-up: ${sD(nextFollowUp)}` : "Follow-up cleared");
  };

  const updateTalentOverviewMarketingStatus = async (assignment, nextStatus) => {
    if (!requireEditor()) return;
    if (!assignment?.projectId || !assignment?.assignmentId) return;
    const targetProject = projects.find(project => project.id === assignment.projectId);
    if (!targetProject) {
      flash("Could not find that live campaign source record", "err");
      return;
    }
    const normalizedStatus = normalizeMarketingStatus(nextStatus);
    const currentItem = (targetProject.marketingItems || []).find(item => String(item?.id || "") === String(assignment.assignmentId));
    if (!currentItem) {
      flash("Could not find that campaign assignment", "err");
      return;
    }
    const currentStatus = normalizeMarketingStatus(currentItem.status || "prospect");
    if (currentStatus === normalizedStatus) return;
    const nextProject = {
      ...targetProject,
      marketingItems: (targetProject.marketingItems || []).map(item =>
        String(item?.id || "") === String(assignment.assignmentId)
          ? { ...item, status: normalizedStatus, updatedAt: new Date().toISOString() }
          : item
      ),
      activityLog: logAction(targetProject, assignment.talentName || "", `Marketing status → ${MM[normalizedStatus]?.label || titleCaseWords(normalizedStatus)}`, "event", {
        assignmentId: assignment.assignmentId,
        campaign: assignment.campaign || "",
      }),
    };
    await saveProjectsList(projects.map(project => project.id === targetProject.id ? nextProject : project));
    flash(`${assignment.talentName || "Assignment"} → ${MM[normalizedStatus]?.label || titleCaseWords(normalizedStatus)}`);
  };

  const updateTalentOverviewMarketingOwner = async (assignment, nextOwner) => {
    if (!requireEditor()) return;
    if (!assignment?.projectId || !assignment?.assignmentId) return;
    const targetProject = projects.find(project => project.id === assignment.projectId);
    if (!targetProject) {
      flash("Could not find that live campaign source record", "err");
      return;
    }
    const currentItem = (targetProject.marketingItems || []).find(item => String(item?.id || "") === String(assignment.assignmentId));
    if (!currentItem) {
      flash("Could not find that campaign assignment", "err");
      return;
    }
    if (String(currentItem.owner || "") === String(nextOwner || "")) return;
    const nextProject = {
      ...targetProject,
      marketingItems: (targetProject.marketingItems || []).map(item =>
        String(item?.id || "") === String(assignment.assignmentId)
          ? { ...item, owner: nextOwner || "", updatedAt: new Date().toISOString() }
          : item
      ),
      activityLog: logAction(targetProject, assignment.talentName || "", nextOwner ? `Marketing owner → ${nextOwner}` : "Marketing owner cleared", "event", {
        assignmentId: assignment.assignmentId,
        campaign: assignment.campaign || "",
      }),
    };
    await saveProjectsList(projects.map(project => project.id === targetProject.id ? nextProject : project));
    flash(nextOwner ? `${assignment.talentName || "Assignment"} assigned to ${nextOwner}` : "Marketing owner cleared");
  };

  const updateTalentOverviewMarketingNotes = async (assignment, nextNotes) => {
    if (!requireEditor()) return;
    if (!assignment?.projectId || !assignment?.assignmentId) return;
    const targetProject = projects.find(project => project.id === assignment.projectId);
    if (!targetProject) {
      flash("Could not find that live campaign source record", "err");
      return;
    }
    const currentItem = (targetProject.marketingItems || []).find(item => String(item?.id || "") === String(assignment.assignmentId));
    if (!currentItem) {
      flash("Could not find that campaign assignment", "err");
      return;
    }
    if (String(currentItem.notes || "") === String(nextNotes || "")) return;
    const nextProject = {
      ...targetProject,
      marketingItems: (targetProject.marketingItems || []).map(item =>
        String(item?.id || "") === String(assignment.assignmentId)
          ? { ...item, notes: nextNotes || "", updatedAt: new Date().toISOString() }
          : item
      ),
      activityLog: logAction(targetProject, assignment.talentName || "", "Marketing note updated", "note", {
        assignmentId: assignment.assignmentId,
        campaign: assignment.campaign || "",
        note: nextNotes || "",
      }),
    };
    await saveProjectsList(projects.map(project => project.id === targetProject.id ? nextProject : project));
    flash("Campaign notes saved");
  };

  const runIntel = async a => {
    if (!requireEditor()) return;
    setIntelLoading(true);
    setIntel(null);
    const result = await fetchAIIntel(a, bucketGenre(a.g), currentAiProvider, getStoredAiKey(currentAiProvider), taskModel("intel"));
    setIntel(result);
    if (!result.ok) flash(result.text || "AI Intel failed", "err");
    setIntelLoading(false);
    if (proj && result.ok) {
      const al = logAction(proj, a.n, "AI Intel generated");
      const nextProj = { ...proj, activityLog: al };
      await saveProject(nextProj);
    }
  };

  const runAIDrafts = async a => {
    if (!requireEditor()) return;
    setAiDraftLoading(true);
    const bucket = bucketGenre(a.g);
    const plan = buildABPlan(proj?.abStats || {}, a, bucket);
    const result = await generateAIDrafts(a, bucket, intel?.ok ? intel.text : null, plan, draftPlatform, currentAiProvider, getStoredAiKey(currentAiProvider), taskModel("drafts"));
    if (result.ok) {
      const parsed = parseAIDrafts(result.text, a, draftPlatform);
      setDrafts(parsed);
      setDraftTab(0);
      setDraftMode("ai");
      flash("AI drafts generated");
    } else {
      flash(result.text || "Draft generation failed", "err");
    }
    setAiDraftLoading(false);
    if (proj && result.ok) {
      const al = logAction(proj, a.n, "AI drafts generated");
      const nextProj = { ...proj, activityLog: al };
      await saveProject(nextProj);
    }
  };

  const switchToTemplates = a => {
    const bucket = bucketGenre(a.g);
    const plan = buildABPlan(proj?.abStats || {}, a, bucket);
    setDrafts(genQuickDrafts(a, bucket, plan, draftPlatform));
    setDraftTab(0);
    setDraftMode("template");
  };

  const changeDraftPlatform = (artist, platformId) => {
    setDraftPlatform(platformId);
    if (!artist || draftMode !== "template") return;
    const bucket = bucketGenre(artist.g);
    const plan = buildABPlan(proj?.abStats || {}, artist, bucket);
    setDrafts(genQuickDrafts(artist, bucket, plan, platformId));
    setDraftTab(0);
  };

  const trackSend = async (artist, draft, provider = "manual", opts = {}) => {
    if (!requireEditor()) return;
    if (!proj || !artist || !draft) return;

    const now = new Date().toISOString();
    const date = todayISO();
    const channel = draft.channel || draftChannelFromKey(draft.key);
    const bucket = bucketGenre(artist.g);
    const parsed = parseDraftSubject(draft.text || "", `Quick idea for ${artist.n}`);
    const subject = opts.subject || parsed.subject;

    const pipeline = { ...proj.pipeline };
    const prevStage = pipeline[artist.n]?.stage || "prospect";
    if (["prospect", "drafted"].includes(prevStage)) {
      pipeline[artist.n] = { ...(pipeline[artist.n] || {}), stage: "sent", date: now };
    }

    let abStats = { ...(proj.abStats || {}) };
    const variantId = draft.variantId || (draft.ai ? "AI" : "");
    if (variantId && (channel === "dm" || channel === "email")) {
      abStats = bumpABStat(abStats, bucket, channel, variantId, { sent: 1 });
    }

    const sequenceState = { ...(proj.sequenceState || {}) };
    const followUps = { ...(proj.followUps || {}) };
    const ss = sequenceState[artist.n];
    let seqMsg = "";

    if (ss?.status === "active") {
      const seq = SEQ_MAP[ss.sequenceId];
      const step = seq?.steps?.[ss.stepIndex];
      if (step && (step.channel === channel || step.channel === "any")) {
        const history = [...(ss.history || []), {
          stepId: step.id,
          label: step.label,
          channel: step.channel,
          sentAt: now,
          provider,
          variantId,
          subject,
        }];
        const nextIdx = ss.stepIndex + 1;
        const nextStep = seq.steps[nextIdx];
        if (nextStep) {
          const nextDue = addDaysISO(date, nextStep.delayDays || 0);
          sequenceState[artist.n] = { ...ss, status: "active", stepIndex: nextIdx, nextDue, lastSentAt: now, history };
          followUps[artist.n] = nextDue;
          seqMsg = `Follow-up plan advanced → ${nextStep.label} due ${sD(nextDue)}`;
        } else {
          sequenceState[artist.n] = { ...ss, status: "done", stepIndex: nextIdx, nextDue: "", completedAt: now, lastSentAt: now, history };
          if (!followUps[artist.n]) followUps[artist.n] = addDaysISO(date, 7);
          seqMsg = "Follow-up plan completed";
        }
      }
    }

    if (!followUps[artist.n]) followUps[artist.n] = addDaysISO(date, 7);

    const sendEvent = {
      id: `send_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      artist: artist.n,
      actor: currentActor,
      bucket,
      channel,
      provider,
      variantId,
      draftKey: draft.key || "manual",
      subject,
      sentAt: now,
      sequenceStep: opts.sequenceStep || "",
    };

    const sendLog = [...(proj.sendLog || []), sendEvent];
    let activityLog = logAction(proj, artist.n, `Sent via ${provider} (${channel.toUpperCase()})${variantId ? ` • v${variantId}` : ""}`);
    if (seqMsg) activityLog = logAction({ ...proj, activityLog }, artist.n, seqMsg);

    const nextProj = {
      ...proj,
      pipeline,
      abStats,
      sequenceState,
      followUps,
      sendLog,
      activityLog,
      settings: { ...(proj.settings || {}), provider, autoLogCompose },
    };

    await saveProject(nextProj);
    flash(seqMsg ? `Send logged. ${seqMsg}` : "Send logged");
  };

  const openCompose = async (artist, draft, provider) => {
    if (!requireEditor()) return;
    const channel = draft?.channel || draftChannelFromKey(draft?.key);
    if (channel !== "email") { flash("Use 'Log Sent' for DM drafts", "err"); return; }
    if (!artist.e) { flash("No email on file for this artist", "err"); return; }
    const parsed = parseDraftSubject(draft.text || "", `Idea for ${artist.n}`);
    const url = provider === "outlook"
      ? outlookComposeUrl(artist.e, parsed.subject, parsed.body)
      : gmailComposeUrl(artist.e, parsed.subject, parsed.body);
    window.open(url, "_blank", "noopener,noreferrer");
    flash(`${provider === "outlook" ? "Outlook" : "Gmail"} compose opened`);
    if (autoLogCompose) await trackSend(artist, draft, provider, { subject: parsed.subject });
  };

  const sendDraftViaGmail = async (artist, draft) => {
    if (!requireEditor()) return;
    if (!artist?.e) { flash("No email on file for this artist", "err"); return; }
    if (!gmailSendUserId) { flash("Select a connected Gmail sender first", "err"); return; }
    const parsed = parseDraftSubject(draft?.text || "", `Idea for ${artist.n}`);
    setGmailSending(true);
    const result = await apiSendGmail({
      projectId: proj.id,
      artistName: artist.n,
      artistEmail: artist.e,
      senderUserId: gmailSendUserId,
      subject: parsed.subject,
      body: parsed.body,
    });
    setGmailSending(false);
    if (!result.ok) {
      if (String(result.error || "").toLowerCase().includes("not connected")) {
        await refreshGmailStatus();
      }
      flash(result.error || "Could not send email", "err");
      return;
    }
    setArtistInbox({
      threads: result.threads || [],
      messages: result.messages || [],
      connections: result.connections || gmailStatus.connections || [],
    });
    setSelectedThreadKey(result.threadKey || result.threads?.[0]?.threadKey || "");
    setDetailTab("inbox");
    if (proj?.id) {
      await loadProjectInbox(proj.id, result.threadKey || selectedProjectThreadKey || "");
    }
    await refreshGmailStatus();
    await trackSend(artist, draft, "gmail_api", { subject: parsed.subject });
    flash(`Email sent from ${result.senderGmailEmail || "Gmail"}`);
  };

  const sendInboxReply = async artist => {
    if (!requireEditor()) return;
    if (!artist?.e) { flash("No email on file for this artist", "err"); return; }
    if (!gmailSendUserId) { flash("Select a connected Gmail sender first", "err"); return; }
    const body = gmailReplyDraft.trim();
    if (!body) { flash("Reply body is empty", "err"); return; }
    const selectedThread = artistInbox.threads.find((item) => item.threadKey === selectedThreadKey) || null;
    const selectedMessages = selectedThread
      ? artistInbox.messages.filter((item) => item.threadKey === selectedThread.threadKey)
      : [];
    const latestSubject = selectedMessages[selectedMessages.length - 1]?.subject || selectedThread?.subject || `Re: ${artist.n}`;
    const subject = /^re:/i.test(latestSubject) ? latestSubject : `Re: ${latestSubject}`;
    setGmailSending(true);
    const result = await apiSendGmail({
      projectId: proj.id,
      artistName: artist.n,
      artistEmail: artist.e,
      senderUserId: gmailSendUserId,
      subject,
      body,
      ...(selectedThread ? { threadKey: selectedThread.threadKey, externalThreadId: selectedThread.externalThreadId } : {}),
    });
    setGmailSending(false);
    if (!result.ok) {
      if (String(result.error || "").toLowerCase().includes("not connected")) {
        await refreshGmailStatus();
      }
      flash(result.error || "Could not send reply", "err");
      return;
    }
    setArtistInbox({
      threads: result.threads || [],
      messages: result.messages || [],
      connections: result.connections || gmailStatus.connections || [],
    });
    setSelectedThreadKey(result.threadKey || selectedThreadKey || result.threads?.[0]?.threadKey || "");
    setGmailReplyDraft("");
    if (proj?.id) {
      await loadProjectInbox(proj.id, result.threadKey || selectedProjectThreadKey || "");
    }
    await refreshGmailStatus();
    await trackSend(artist, { key: "gmail_reply", channel: "email", text: `Subject: ${subject}\n\n${body}`, variantId: "GMAIL" }, "gmail_api", { subject, sequenceStep: "Inbox reply" });
    flash(`Reply sent from ${result.senderGmailEmail || "Gmail"}`);
  };

  const sendProjectInboxReply = async thread => {
    if (!requireEditor()) return;
    if (!proj || !thread) return;
    if (!gmailSendUserId) { flash("Select a connected Gmail sender first", "err"); return; }
    const artist = thread.artist || null;
    const targetEmail = artist?.e || thread.counterpartyEmail || "";
    if (!targetEmail) { flash("No artist email on file for this thread", "err"); return; }
    const body = gmailReplyDraft.trim();
    if (!body) { flash("Reply body is empty", "err"); return; }
    const latestSubject = selectedProjectThreadMessages[selectedProjectThreadMessages.length - 1]?.subject || thread.subject || `Re: ${thread.artistName}`;
    const subject = /^re:/i.test(latestSubject) ? latestSubject : `Re: ${latestSubject}`;
    setGmailSending(true);
    const result = await apiSendGmail({
      projectId: proj.id,
      artistName: thread.artistName,
      artistEmail: targetEmail,
      senderUserId: gmailSendUserId,
      subject,
      body,
      threadKey: thread.primaryThreadKey || thread.threadKey,
      externalThreadId: thread.primaryExternalThreadId || thread.externalThreadId,
    });
    setGmailSending(false);
    if (!result.ok) {
      if (String(result.error || "").toLowerCase().includes("not connected")) {
        await refreshGmailStatus();
      }
      flash(result.error || "Could not send reply", "err");
      return;
    }
    const refreshedKeys = Array.from(new Set([...(thread.sourceThreadKeys || []), result.threadKey || thread.primaryThreadKey || thread.threadKey].filter(Boolean)));
    await loadProjectInbox(proj.id, thread.threadKey, refreshedKeys);
    if (selA?.n === thread.artistName) {
      await loadArtistInbox(selA);
    }
    await refreshGmailStatus();
    setGmailReplyDraft("");
    if (artist) {
      await trackSend(artist, { key: "gmail_reply", channel: "email", text: `Subject: ${subject}\n\n${body}`, variantId: "GMAIL" }, "gmail_api", { subject, sequenceStep: "Inbox reply" });
    }
    flash(`Reply sent from ${result.senderGmailEmail || "Gmail"}`);
  };

  const updateInboxThread = async (threadKey, changes) => {
    if (!requireEditor()) return null;
    const threadKeys = Array.isArray(threadKey) ? Array.from(new Set(threadKey.filter(Boolean))) : [threadKey].filter(Boolean);
    if (!threadKeys.length) return null;
    setThreadWorkflowSaving(true);
    const results = await Promise.all(threadKeys.map(key => apiUpdateGmailThread({ threadKey: key, ...changes })));
    setThreadWorkflowSaving(false);
    const failed = results.find(result => !result.ok || !result.thread);
    if (failed) {
      flash(failed.error || "Could not update thread", "err");
      return null;
    }
    const updates = new Map(results.filter(result => result.thread).map(result => [result.thread.threadKey, result.thread]));
    setProjectInbox(prev => ({
      ...prev,
      threads: (prev.threads || []).map(item => updates.get(item.threadKey) || item),
    }));
    setArtistInbox(prev => ({
      ...prev,
      threads: (prev.threads || []).map(item => updates.get(item.threadKey) || item),
    }));
    return results[0]?.thread || null;
  };

  const deleteInboxThreads = async (threadKey, label = "this synced inbox thread") => {
    if (!requireEditor()) return false;
    const threadKeys = Array.isArray(threadKey) ? Array.from(new Set(threadKey.filter(Boolean))) : [threadKey].filter(Boolean);
    if (!threadKeys.length) return false;
    const ok = typeof window === "undefined"
      ? true
      : window.confirm(`Delete ${label} from GEMFINDER inbox?\n\nThis only removes the synced copy here. It will not delete the email from Gmail.`);
    if (!ok) return false;
    setThreadWorkflowSaving(true);
    const result = await apiDeleteGmailThreads(threadKeys);
    setThreadWorkflowSaving(false);
    if (!result.ok) {
      flash(result.error || "Could not delete inbox thread", "err");
      return false;
    }
    const keySet = new Set(threadKeys);
    setProjectInbox(prev => ({
      ...prev,
      threads: (prev.threads || []).filter(item => !keySet.has(item.threadKey)),
      messages: (prev.messages || []).filter(item => !keySet.has(item.threadKey)),
    }));
    setArtistInbox(prev => ({
      ...prev,
      threads: (prev.threads || []).filter(item => !keySet.has(item.threadKey)),
      messages: (prev.messages || []).filter(item => !keySet.has(item.threadKey)),
    }));
    if (selectedThreadKey && keySet.has(selectedThreadKey)) setSelectedThreadKey("");
    if (selectedProjectThreadKey && keySet.has(selectedProjectThreadKey)) setSelectedProjectThreadKey("");
    flash(`Removed ${result.deleted || threadKeys.length} synced inbox ${threadKeys.length === 1 ? "thread" : "threads"}. Gmail mailbox unchanged.`);
    return true;
  };

  const enrollSeq = async (artist, sequenceId) => {
    if (!requireEditor()) return;
    if (!proj) return;
    const now = new Date().toISOString();
    const due = todayISO();
    const state = {
      ...(proj.sequenceState || {}),
      [artist.n]: { sequenceId, status: "active", stepIndex: 0, nextDue: due, startedAt: now, history: [] },
    };
    const al = logAction(proj, artist.n, `Follow-up plan started: ${SEQ_MAP[sequenceId]?.name || sequenceId}`);
    const nextProj = {
      ...proj,
      sequenceState: state,
      followUps: { ...(proj.followUps || {}), [artist.n]: due },
      activityLog: al,
    };
    await saveProject(nextProj);
    flash(`Started ${SEQ_MAP[sequenceId]?.name || sequenceId} for ${artist.n}`);
  };

  const toggleSeqPause = async artist => {
    if (!requireEditor()) return;
    if (!proj) return;
    const cur = proj.sequenceState?.[artist.n];
    if (!cur) return;
    const nextStatus = cur.status === "active" ? "paused" : "active";
    const state = { ...(proj.sequenceState || {}), [artist.n]: { ...cur, status: nextStatus } };
    const al = logAction(proj, artist.n, `Follow-up plan ${nextStatus}`);
    await saveProject({ ...proj, sequenceState: state, activityLog: al });
    flash(`Follow-up plan ${nextStatus}`);
  };

  const resetSeq = async artist => {
    if (!requireEditor()) return;
    if (!proj) return;
    const cur = proj.sequenceState?.[artist.n];
    if (!cur) return;
    const state = { ...(proj.sequenceState || {}), [artist.n]: { ...cur, status: "active", stepIndex: 0, nextDue: todayISO(), history: [] } };
    const al = logAction(proj, artist.n, "Follow-up plan restarted");
    await saveProject({ ...proj, sequenceState: state, activityLog: al, followUps: { ...(proj.followUps || {}), [artist.n]: todayISO() } });
    flash("Follow-up plan restarted");
  };

  const markSeqStepSent = async artist => {
    if (!requireEditor()) return;
    if (!proj) return;
    const ss = proj.sequenceState?.[artist.n];
    if (!ss || ss.status !== "active") { flash("No active follow-up plan", "err"); return; }
    const seq = SEQ_MAP[ss.sequenceId];
    const step = seq?.steps?.[ss.stepIndex];
    if (!step) { flash("Follow-up plan already complete", "err"); return; }

    const bucket = bucketGenre(artist.g);
    const plan = buildABPlan(proj.abStats || {}, artist, bucket);
    const fn = artist.n.includes(" ") ? artist.n.split(" ")[0] : artist.n;

    const pseudoDraft = step.channel === "email"
      ? {
        key: `seq_${step.id}`,
        channel: "email",
        variantId: plan.email.id,
        text: `Subject: ${plan.email.subject(plan.ctx)}\n\n${artist.e ? "Hey team," : `Hey ${fn},`}\n\nQuick follow-up from Greg at Songfinch. Happy to send one-pager + examples if useful.\n\nBest,\nGreg\nGreg@songfinch.com`,
      }
      : {
        key: `seq_${step.id}`,
        channel: "dm",
        variantId: plan.dm.id,
        text: `Hey ${fn}, quick follow-up from Greg at Songfinch.`,
      };

    await trackSend(artist, pseudoDraft, "manual", { sequenceStep: step.label });
  };

  const runDiscover = async () => {
    if (!requireEditor()) return;
    if (!discQuery.trim()) return;
    setDiscLoading(true);
    setDiscResults([]);
    const r = await discoverArtists(discQuery, currentAiProvider, getStoredAiKey(currentAiProvider), taskModel("discovery"));
    if (r.ok) {
      const artists = parseDiscovered(r.text);
      setDiscResults(artists);
      if (!artists.length) flash("No artists parsed - try different criteria", "err");
    } else {
      flash(r.text || "Discovery failed", "err");
    }
    setDiscLoading(false);
  };

  const addDiscovered = async a => {
    if (!requireEditor()) return;
    if (!proj) return;
    const ex = new Set(proj.artists.map(x => canonicalArtistName(x.n)));
    if (ex.has(canonicalArtistName(a.n))) { flash(`${a.n} already in project`, "err"); return; }
    const activityLog = logAction(proj, a.n, "Artist added from AI Discovery");
    const nextProj = {
      ...proj,
      artists: [...proj.artists, { n: a.n, g: a.g, l: a.l, h: a.h, ig: a.ig || "", soc: a.soc || "", e: a.e || "", loc: a.loc || "", s: false, o: "AI Discovery" }],
      activityLog,
    };
    await saveProject(nextProj);
    const alreadyOnPlatform = (proj.internalRoster?.names || []).some(item => canonicalArtistName(item) === canonicalArtistName(a.n));
    flash(alreadyOnPlatform ? `Added ${a.n} · already found in internal roster` : `Added ${a.n}`);
  };

  const enriched = useMemo(() => {
    if (!proj) return [];
    const internalSet = new Set((proj.internalRoster?.names || []).map(canonicalArtistName));
    return proj.artists.map(a => ({
      ...a,
      bucket: bucketGenre(a.g),
      priority: pS(a),
      stage: proj.pipeline[a.n]?.stage || "prospect",
      stageDate: proj.pipeline[a.n]?.date || null,
      note: proj.notes?.[a.n] || "",
      followUp: proj.followUps?.[a.n] || "",
      owner: proj.assignments?.[a.n] || "",
      onPlatform: internalSet.has(canonicalArtistName(a.n)),
    }));
  }, [proj]);

  const marketingItems = useMemo(() => {
    if (!proj) return [];
    return (proj.marketingItems || []).map(item => normalizeMarketingItem(item, proj.teamUsers || DEFAULT_TEAM_USERS));
  }, [proj]);

  const marketingDuplicateGroups = useMemo(() => {
    const groups = new Map();
    marketingItems.forEach(item => {
      const key = marketingDuplicateKey(item);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
    return [...groups.values()].filter(group => group.length > 1);
  }, [marketingItems]);

  const marketingDuplicateRemovalCount = useMemo(
    () => marketingDuplicateGroups.reduce((sum, group) => sum + Math.max(0, group.length - 1), 0),
    [marketingDuplicateGroups]
  );

  const marketingItemIds = useMemo(
    () => marketingItems.map(item => String(item.id || "")).filter(Boolean),
    [marketingItems]
  );

  const marketingCampaignOptions = useMemo(() => {
    const fromSettings = Array.isArray(proj?.settings?.marketingCampaignBank) ? proj.settings.marketingCampaignBank : [];
    const fromItems = marketingItems.flatMap(item => item.campaigns || []);
    return normalizeMarketingCampaignBank([...fromSettings, ...fromItems]);
  }, [proj?.settings?.marketingCampaignBank, marketingItems]);

  const editingMarketingItem = useMemo(
    () => marketingForm.id
      ? marketingItems.find(item => String(item.id || "") === String(marketingForm.id || "")) || null
      : null,
    [marketingItems, marketingForm.id]
  );

  const marketingSlackNotice = useMemo(() => {
    if (!showMarketingItemModal) return null;
    const nextStatus = normalizeMarketingStatus(marketingForm.status || "prospect");
    const previousStatus = editingMarketingItem
      ? normalizeMarketingStatus(editingMarketingItem.status || "prospect")
      : "prospect";
    const isNewAssignment = !editingMarketingItem;
    const nextLabel = MM[nextStatus]?.label || "Prospect";
    const previousLabel = MM[previousStatus]?.label || "Prospect";
    const notifies = MARKETING_SLACK_NOTIFY_STATUS_IDS.has(nextStatus) && (isNewAssignment || previousStatus !== nextStatus);

    if (notifies) {
      return {
        notifies: true,
        tone: C.gn,
        bg: C.gb,
        border: C.gbd || C.gn,
        headline: `Saving will post to #marketing-gems: ${previousLabel} -> ${nextLabel}`,
        detail: isNewAssignment
          ? "This is a new marketing assignment entering an active workflow status."
          : "This is a real status transition, so the marketing Slack notifier will fire.",
      };
    }

    if (!MARKETING_SLACK_NOTIFY_STATUS_IDS.has(nextStatus)) {
      return {
        notifies: false,
        tone: C.ts,
        bg: C.sa,
        border: C.bd,
        headline: "Save will not post to Slack yet",
        detail: "Slack starts once the assignment moves beyond Prospect into an active marketing workflow status.",
      };
    }

    return {
      notifies: false,
      tone: C.ts,
      bg: C.sa,
      border: C.bd,
      headline: `Slack stays quiet because the status is still ${nextLabel}`,
      detail: "This save is updating the assignment, but it is not changing the marketing status.",
    };
  }, [showMarketingItemModal, marketingForm.status, editingMarketingItem, C]);

  const relatedMarketingAssignments = useMemo(() => {
    if (!showMarketingItemModal) return [];
    const emailKey = canonicalEmail(marketingForm.email || editingMarketingItem?.email || "");
    const nameKey = canonicalArtistName(marketingForm.talentName || editingMarketingItem?.talentName || "");
    if (!emailKey && !nameKey) return [];
    return marketingItems
      .filter(item => {
        const sameEmail = emailKey && canonicalEmail(item.email) === emailKey;
        const sameName = nameKey && canonicalArtistName(item.talentName) === nameKey;
        return sameEmail || sameName;
      })
      .sort((a, b) => {
        if (String(a.id || "") === String(marketingForm.id || "")) return -1;
        if (String(b.id || "") === String(marketingForm.id || "")) return 1;
        const campaignA = String(a.campaign || a.campaigns?.[0] || "No campaign");
        const campaignB = String(b.campaign || b.campaigns?.[0] || "No campaign");
        return campaignA.localeCompare(campaignB) || String(a.title || "").localeCompare(String(b.title || ""));
      });
  }, [showMarketingItemModal, marketingItems, marketingForm.id, marketingForm.email, marketingForm.talentName, editingMarketingItem]);

  const marketingFormHasUnsavedChanges = useMemo(() => {
    if (!showMarketingItemModal) return false;
    if (editingMarketingItem) {
      return marketingFormSnapshot(marketingForm) !== marketingFormSnapshot(editingMarketingItem);
    }
    return marketingFormSnapshot(marketingForm) !== marketingFormSnapshot(emptyMarketingForm());
  }, [showMarketingItemModal, marketingForm, editingMarketingItem]);

  const confirmMarketingModalDiscard = useCallback((nextActionLabel = "continue") => {
    if (!marketingFormHasUnsavedChanges) return true;
    return window.confirm(`Discard unsaved changes and ${nextActionLabel}?`);
  }, [marketingFormHasUnsavedChanges]);

  const openRelatedMarketingAssignment = useCallback((assignmentId) => {
    const target = marketingItems.find(item => String(item.id || "") === String(assignmentId || ""));
    if (!target) return;
    if (!confirmMarketingModalDiscard("open another campaign assignment")) return;
    openMarketingItemModal(target);
  }, [marketingItems, confirmMarketingModalDiscard]);

  const startNewCampaignFromMarketingForm = useCallback(() => {
    if (!marketingForm.talentName.trim()) {
      flash("Talent name is required first", "err");
      return;
    }
    if (!confirmMarketingModalDiscard("start a new campaign assignment")) return;
    setMarketingForm({
      ...emptyMarketingForm(),
      talentName: marketingForm.talentName.trim(),
      talentType: marketingForm.talentType || "Internal Artist",
      title: "",
      trafficType: marketingForm.trafficType || "Organic",
      channels: normalizeMarketingChannels(marketingForm.channels),
      deliverableType: marketingForm.deliverableType || "UGC",
      status: "prospect",
      owner: marketingForm.owner || "",
      email: marketingForm.email || "",
      instagramHandle: marketingForm.instagramHandle || normalizeSocialHandle(marketingForm.instagramUrl),
      instagramUrl: marketingForm.instagramUrl || "",
      instagramFollowers: marketingForm.instagramFollowers || "",
      tiktokHandle: marketingForm.tiktokHandle || normalizeSocialHandle(marketingForm.tiktokUrl),
      tiktokUrl: marketingForm.tiktokUrl || "",
      tiktokFollowers: marketingForm.tiktokFollowers || "",
      spotifyUrl: marketingForm.spotifyUrl || "",
      spotifyMonthlyListeners: marketingForm.spotifyMonthlyListeners || "",
    });
  }, [marketingForm, confirmMarketingModalDiscard, flash]);

  const marketingGroupOptions = useMemo(
    () => normalizeMarketingGroups(proj?.settings?.marketingGroups || [], marketingItemIds),
    [proj?.settings?.marketingGroups, marketingItemIds]
  );

  useEffect(() => {
    const validIds = new Set(marketingItemIds);
    setSelectedMarketingIds(prev => {
      const next = new Set([...prev].filter(id => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [marketingItemIds]);

  useEffect(() => {
    if (marketingGroupFilter === "all") return;
    if (marketingGroupOptions.some(group => group.id === marketingGroupFilter)) return;
    setMarketingGroupFilter("all");
  }, [marketingGroupFilter, marketingGroupOptions]);

  const marketingBulkRows = useMemo(
    () => parseMarketingBulkUpdateText(marketingBulkText, marketingBulkDefaultCampaign, marketingBulkDefaultStatus, marketingBulkDefaultOwner, proj?.teamUsers || DEFAULT_TEAM_USERS),
    [marketingBulkText, marketingBulkDefaultCampaign, marketingBulkDefaultStatus, marketingBulkDefaultOwner, proj?.teamUsers]
  );

  const marketingBulkPreview = useMemo(() => {
    if (!proj || !marketingBulkRows.length) return [];
    const existingItems = (proj.marketingItems || []).map(item => normalizeMarketingItem(item, proj.teamUsers || DEFAULT_TEAM_USERS));
    const byName = new Map();
    const byNameCampaign = new Map();
    const byEmail = new Map();
    const byEmailCampaign = new Map();
    existingItems.forEach(item => {
      const nameKey = canonicalArtistName(item.talentName);
      if (!nameKey) return;
      const list = byName.get(nameKey) || [];
      list.push(item);
      byName.set(nameKey, list);
      const campaigns = item.campaigns?.length ? item.campaigns : [""];
      campaigns.forEach(campaign => {
        byNameCampaign.set(`${nameKey}::${canonicalArtistName(campaign)}`, item);
      });
      splitMultiValueField(item.email || "").forEach(email => {
        const emailKey = String(email || "").trim().toLowerCase();
        if (!emailKey || !/@/.test(emailKey)) return;
        const emailList = byEmail.get(emailKey) || [];
        emailList.push(item);
        byEmail.set(emailKey, emailList);
        campaigns.forEach(campaign => {
          byEmailCampaign.set(`${emailKey}::${canonicalArtistName(campaign)}`, item);
        });
      });
    });

    const artistRosterByName = new Map();
    const artistRosterByEmail = new Map();
    (proj.artists || []).forEach(artist => {
      const key = canonicalArtistName(artist?.n || "");
      if (key) artistRosterByName.set(key, artist);
      const emailKey = String(artist?.e || "").trim().toLowerCase();
      if (emailKey && /@/.test(emailKey)) artistRosterByEmail.set(emailKey, artist);
    });

    return marketingBulkRows.map(row => {
      const nameKey = canonicalArtistName(row.talentName);
      const emailKey = String(row.email || "").trim().toLowerCase();
      const campaignKey = canonicalArtistName(row.campaign || "");
      const exactMatch = (emailKey && byEmailCampaign.get(`${emailKey}::${campaignKey}`))
        || byNameCampaign.get(`${nameKey}::${campaignKey}`);
      if (exactMatch) {
        return {
          ...row,
          action: "update",
          source: "assignment",
          targetId: exactMatch.id,
          previewLabel: `${marketingItemPrimaryLabel(exactMatch)} · ${row.campaign || "No campaign"}`,
        };
      }

      const sameTalent = (emailKey && byEmail.get(emailKey)) || byName.get(nameKey) || [];
      if (sameTalent.length) {
        return {
          ...row,
          action: "create",
          source: "existing_talent",
          baseItem: sameTalent[0],
          previewLabel: `${row.talentName} · ${row.campaign || "No campaign"}`,
        };
      }

      const rosterArtist = (emailKey && artistRosterByEmail.get(emailKey)) || artistRosterByName.get(nameKey);
      if (rosterArtist) {
        return {
          ...row,
          action: "create",
          source: "artist_roster",
          baseArtist: rosterArtist,
          previewLabel: `${row.talentName} · ${row.campaign || "No campaign"}`,
        };
      }

      return {
        ...row,
        action: "skip",
        source: "unmatched",
        reason: "No matching talent found in this project yet",
      };
    });
  }, [proj, marketingBulkRows]);

  const marketingBulkSummary = useMemo(() => {
    return marketingBulkPreview.reduce((acc, row) => {
      acc[row.action] = (acc[row.action] || 0) + 1;
      return acc;
    }, { update: 0, create: 0, skip: 0 });
  }, [marketingBulkPreview]);

  const effectiveMarketingOwnerFilter = useMemo(() => {
    if (marketingOwnerFilter === "__view__") {
      if (workspaceUser === ALL_USER_VIEW) return "all";
      if (workspaceUser === UNASSIGNED_USER_VIEW) return "";
      return workspaceUser;
    }
    return marketingOwnerFilter;
  }, [marketingOwnerFilter, workspaceUser]);

  const scopedMarketingItems = useMemo(() => {
    let list = marketingItems;
    if (effectiveMarketingOwnerFilter !== "all") {
      if (!effectiveMarketingOwnerFilter) list = list.filter(item => !item.owner);
      else list = list.filter(item => item.owner === effectiveMarketingOwnerFilter);
    }
    return list;
  }, [marketingItems, effectiveMarketingOwnerFilter]);

  const activeMarketingGroup = useMemo(
    () => marketingGroupOptions.find(group => group.id === marketingGroupFilter) || null,
    [marketingGroupOptions, marketingGroupFilter]
  );

  const groupScopedMarketingItems = useMemo(() => {
    if (!activeMarketingGroup) return scopedMarketingItems;
    const allowedIds = new Set(activeMarketingGroup.assignmentIds || []);
    return scopedMarketingItems.filter(item => allowedIds.has(item.id));
  }, [scopedMarketingItems, activeMarketingGroup]);

  const marketingSelectedItems = useMemo(
    () => marketingItems.filter(item => selectedMarketingIds.has(item.id)),
    [marketingItems, selectedMarketingIds]
  );

  const marketingSelectedEmails = useMemo(
    () => uniqStrings(
      marketingSelectedItems.flatMap(item => splitMultiValueField(item.email || ""))
        .map(email => String(email || "").trim())
        .filter(email => /@/.test(email))
    ),
    [marketingSelectedItems]
  );

  const marketingCampaigns = useMemo(() => {
    const counts = {};
    groupScopedMarketingItems.forEach(item => {
      const buckets = item.campaigns?.length ? item.campaigns : ["No campaign"];
      buckets.forEach(key => {
        counts[key] = (counts[key] || 0) + 1;
      });
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [groupScopedMarketingItems]);

  const marketingStatusCounts = useMemo(() => {
    const counts = {};
    MARKETING_STATUSES.forEach(status => { counts[status.id] = 0; });
    groupScopedMarketingItems.forEach(item => {
      counts[item.status] = (counts[item.status] || 0) + 1;
    });
    return counts;
  }, [groupScopedMarketingItems]);

  const saveMarketingCampaignBank = async nextBank => {
    if (!requireEditor()) return;
    if (!proj) return;
    const nextProj = {
      ...proj,
      settings: {
        ...(proj.settings || {}),
        marketingCampaignBank: normalizeMarketingCampaignBank(nextBank),
      },
    };
    await saveProject(nextProj);
  };

  const addMarketingCampaignBankEntry = async () => {
    const nextName = campaignBankDraft.trim();
    if (!nextName) {
      flash("Campaign name is required", "err");
      return;
    }
    const nextBank = normalizeMarketingCampaignBank([...(proj?.settings?.marketingCampaignBank || []), nextName]);
    await saveMarketingCampaignBank(nextBank);
    setCampaignBankDraft("");
    flash(`Added "${nextName}" to campaign bank`);
  };

  const removeMarketingCampaignBankEntry = async (campaignName) => {
    if (!window.confirm(`Remove "${campaignName}" from the campaign bank? Existing assignments will keep their campaign labels.`)) return;
    const nextBank = (proj?.settings?.marketingCampaignBank || []).filter(item => item !== campaignName);
    await saveMarketingCampaignBank(nextBank);
    flash(`Removed "${campaignName}" from campaign bank`);
  };

  const toggleMarketingSelection = itemId => {
    setSelectedMarketingIds(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const clearMarketingSelection = () => {
    setSelectedMarketingIds(new Set());
  };

  const toggleKickoffSelection = profileId => {
    setSelectedKickoffIds(prev => {
      const next = new Set(prev);
      if (next.has(profileId)) next.delete(profileId);
      else next.add(profileId);
      return next;
    });
  };

  const clearKickoffSelection = () => {
    setSelectedKickoffIds(new Set());
    setKickoffSelectionOwnerDraft("");
  };

  const selectVisibleKickoffProfiles = () => {
    const visibleIds = kickoffProfiles.map(profile => profile.id).filter(Boolean);
    if (!visibleIds.length) {
      flash("No visible kickoff talent to select", "err");
      return;
    }
    setSelectedKickoffIds(new Set(visibleIds));
    flash(`Selected ${visibleIds.length} kickoff talent row${visibleIds.length === 1 ? "" : "s"}`);
  };

  const batchAssignKickoffOwner = async owner => {
    if (!requireEditor()) return;
    if (!kickoffSelectedProfiles.length) {
      flash("Select kickoff talent first", "err");
      return;
    }
    const nextProjects = projects.map(project => {
      const records = kickoffSelectedProfiles
        .flatMap(profile => profile.arRecords)
        .filter(record => record.projectId === project.id);
      if (!records.length) return project;
      let nextAssignments = { ...(project.assignments || {}) };
      let nextActivityLog = project.activityLog || {};
      records.forEach(record => {
        if (owner) nextAssignments[record.artistName] = owner;
        else delete nextAssignments[record.artistName];
        nextActivityLog = logAction(
          { ...project, activityLog: nextActivityLog },
          record.artistName,
          owner ? `Assigned to ${owner} (kickoff bulk)` : "Owner cleared (kickoff bulk)"
        );
      });
      return {
        ...project,
        assignments: nextAssignments,
        activityLog: nextActivityLog,
      };
    });
    await saveProjectsList(nextProjects);
    flash(owner
      ? `Assigned ${kickoffSelectedProfiles.length} kickoff talent to ${owner}`
      : `Cleared owner on ${kickoffSelectedProfiles.length} kickoff talent`);
    clearKickoffSelection();
  };

  const batchSetKickoffStage = async stageId => {
    if (!requireEditor()) return;
    if (!kickoffSelectedProfiles.length) {
      flash("Select kickoff talent first", "err");
      return;
    }
    const normalizedStage = normalizeStageId(stageId);
    const now = new Date().toISOString();
    const nextProjects = projects.map(project => {
      const records = kickoffSelectedProfiles
        .flatMap(profile => profile.arRecords)
        .filter(record => record.projectId === project.id);
      if (!records.length) return project;
      const nextPipeline = { ...(project.pipeline || {}) };
      let nextActivityLog = project.activityLog || {};
      records.forEach(record => {
        nextPipeline[record.artistName] = {
          ...(nextPipeline[record.artistName] || {}),
          stage: normalizedStage,
          date: now,
        };
        nextActivityLog = logAction(
          { ...project, activityLog: nextActivityLog },
          record.artistName,
          `Stage → ${SM[normalizedStage]?.label || titleCaseWords(normalizedStage)} (kickoff bulk)`
        );
      });
      return {
        ...project,
        pipeline: nextPipeline,
        activityLog: nextActivityLog,
      };
    });
    await saveProjectsList(nextProjects);
    flash(`Moved ${kickoffSelectedProfiles.length} kickoff talent → ${SM[normalizedStage]?.label || titleCaseWords(normalizedStage)}`);
    clearKickoffSelection();
  };

  const selectVisibleMarketingItems = () => {
    const visibleIds = filteredMarketingItems.map(item => item.id).filter(Boolean);
    if (!visibleIds.length) {
      flash("No visible assignments to select", "err");
      return;
    }
    setSelectedMarketingIds(new Set(visibleIds));
    flash(`Selected ${visibleIds.length} filtered assignment${visibleIds.length === 1 ? "" : "s"}`);
  };

  const deleteSelectedMarketingItems = async () => {
    if (!requireEditor()) return;
    if (!proj) return;
    const ids = marketingSelectedItems.map(item => item.id).filter(Boolean);
    if (!ids.length) {
      flash("Select assignments first", "err");
      return;
    }
    if (!window.confirm(`Delete ${ids.length} selected assignment${ids.length === 1 ? "" : "s"} from this marketing project? This cannot be undone.`)) return;
    const deleteSet = new Set(ids);
    const nextMarketingItems = (proj.marketingItems || []).filter(item => !deleteSet.has(item.id));
    const nextMarketingIds = nextMarketingItems.map(item => item.id);
    const nextMarketingGroups = normalizeMarketingGroups(
      proj.settings?.marketingGroups || [],
      nextMarketingIds
    ).filter(group => group.assignmentIds.length);
    const ok = await saveProject({
      ...proj,
      marketingItems: nextMarketingItems,
      settings: {
        ...(proj.settings || {}),
        marketingGroups: nextMarketingGroups,
      },
    });
    if (!ok) return;
    if (marketingForm.id && deleteSet.has(marketingForm.id)) {
      closeMarketingItemModal();
    }
    if (marketingGroupFilter !== "all" && !nextMarketingGroups.some(group => group.id === marketingGroupFilter)) {
      setMarketingGroupFilter("all");
    }
    setSelectedMarketingIds(new Set());
    setMarketingSelectionMode(false);
    flash(`Deleted ${ids.length} assignment${ids.length === 1 ? "" : "s"}`);
  };

  const removeDuplicateMarketingItems = async () => {
    if (!requireEditor()) return;
    if (!proj) return;
    if (!marketingDuplicateGroups.length) {
      flash("No duplicate marketing assignments found");
      return;
    }
    const duplicateCount = marketingDuplicateRemovalCount;
    if (!window.confirm(`Remove ${duplicateCount} duplicate assignment${duplicateCount === 1 ? "" : "s"}? GemFinder will keep the strongest copy of each exact duplicate set.`)) return;
    const teamUsers = proj.teamUsers || DEFAULT_TEAM_USERS;
    const keepById = new Map();
    const removeIds = new Set();

    marketingDuplicateGroups.forEach(group => {
      const sorted = [...group].sort((a, b) => compareMarketingItemStrength(b, a));
      let survivor = normalizeMarketingItem(sorted[0], teamUsers);
      for (const candidate of sorted.slice(1)) {
        const merged = mergeMarketingImportedItem(survivor, candidate, teamUsers);
        survivor = merged.merged;
      }
      keepById.set(survivor.id, survivor);
      sorted.slice(1).forEach(item => removeIds.add(item.id));
    });

    const nextMarketingItems = (proj.marketingItems || []).reduce((acc, rawItem) => {
      const item = normalizeMarketingItem(rawItem, teamUsers);
      if (removeIds.has(item.id)) return acc;
      acc.push(keepById.get(item.id) || item);
      return acc;
    }, []);
    const nextMarketingIds = nextMarketingItems.map(item => item.id);
    const nextMarketingGroups = normalizeMarketingGroups(
      (proj.settings?.marketingGroups || []).map(group => ({
        ...group,
        assignmentIds: uniqStrings(
          (group.assignmentIds || [])
            .map(id => (removeIds.has(id) ? "" : id))
            .filter(Boolean)
        ),
      })),
      nextMarketingIds
    ).filter(group => group.assignmentIds.length);
    const nextProj = {
      ...proj,
      marketingItems: nextMarketingItems,
      settings: {
        ...(proj.settings || {}),
        marketingGroups: nextMarketingGroups,
      },
    };
    const ok = await saveProject(nextProj);
    if (!ok) return;
    if (marketingForm.id && removeIds.has(marketingForm.id)) {
      closeMarketingItemModal();
    }
    if (marketingGroupFilter !== "all" && !nextMarketingGroups.some(group => group.id === marketingGroupFilter)) {
      setMarketingGroupFilter("all");
    }
    setSelectedMarketingIds(prev => new Set([...prev].filter(id => !removeIds.has(id))));
    flash(`Removed ${duplicateCount} duplicate assignment${duplicateCount === 1 ? "" : "s"}`);
  };

  const batchAssignMarketingOwner = async owner => {
    if (!requireEditor()) return;
    if (!proj) return;
    const ids = marketingSelectedItems.map(item => item.id).filter(Boolean);
    if (!ids.length) {
      flash("Select assignments first", "err");
      return;
    }
    const idSet = new Set(ids);
    const nextProj = {
      ...proj,
      marketingItems: (proj.marketingItems || []).map(item =>
        idSet.has(item.id)
          ? { ...item, owner, updatedAt: new Date().toISOString() }
          : item
      ),
    };
    const ok = await saveProject(nextProj);
    if (!ok) return;
    flash(owner ? `${ids.length} assignment${ids.length === 1 ? "" : "s"} assigned to ${owner}` : `${ids.length} assignment${ids.length === 1 ? "" : "s"} unassigned`);
  };

  const saveMarketingGroupSelection = async () => {
    if (!requireEditor()) return;
    if (!proj) return;
    if (!marketingSelectedItems.length) {
      flash("Select assignments first", "err");
      return;
    }
    const suggestedCampaign = uniqStrings(marketingSelectedItems.flatMap(item => item.campaigns || []).filter(Boolean))[0] || "";
    const defaultName = suggestedCampaign ? `${suggestedCampaign} batch` : "Saved talent group";
    const rawName = window.prompt("Save this selection as which group?", defaultName);
    const nextName = String(rawName || "").replace(/\s+/g, " ").trim();
    if (!nextName) return;

    const existingGroups = normalizeMarketingGroups(proj.settings?.marketingGroups || [], marketingItemIds);
    const matchingGroup = existingGroups.find(group => canonicalArtistName(group.name) === canonicalArtistName(nextName));
    if (matchingGroup && !window.confirm(`Overwrite the saved group "${matchingGroup.name}" with the current selection?`)) return;

    const now = new Date().toISOString();
    const nextGroup = normalizeMarketingGroup({
      id: matchingGroup?.id || `mg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: nextName,
      assignmentIds: marketingSelectedItems.map(item => item.id),
      createdAt: matchingGroup?.createdAt || now,
      updatedAt: now,
    }, existingGroups.length, marketingItemIds);
    const nextGroups = normalizeMarketingGroups(
      [
        ...existingGroups.filter(group => group.id !== matchingGroup?.id),
        nextGroup,
      ],
      marketingItemIds
    );
    const ok = await saveProject({
      ...proj,
      settings: {
        ...(proj.settings || {}),
        marketingGroups: nextGroups,
      },
    });
    if (!ok) return;
    setMarketingGroupFilter(nextGroup.id);
    flash(`Saved group "${nextGroup.name}"`);
  };

  const removeMarketingGroup = async groupId => {
    if (!requireEditor()) return;
    if (!proj) return;
    const target = marketingGroupOptions.find(group => group.id === groupId);
    if (!target) return;
    if (!window.confirm(`Delete the saved group "${target.name}"?`)) return;
    const nextGroups = marketingGroupOptions.filter(group => group.id !== groupId);
    const ok = await saveProject({
      ...proj,
      settings: {
        ...(proj.settings || {}),
        marketingGroups: nextGroups,
      },
    });
    if (!ok) return;
    if (marketingGroupFilter === groupId) setMarketingGroupFilter("all");
    flash(`Removed group "${target.name}"`);
  };

  const copyMarketingBccEmails = async () => {
    if (!marketingSelectedEmails.length) {
      flash("Selected assignments do not have email addresses", "err");
      return;
    }
    const payload = marketingSelectedEmails.join(", ");
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
      } else {
        const el = document.createElement("textarea");
        el.value = payload;
        el.style.cssText = "position:fixed;top:-9999px";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }
      flash(`Copied ${marketingSelectedEmails.length} BCC email${marketingSelectedEmails.length === 1 ? "" : "s"}`);
    } catch {
      flash("Could not copy BCC list", "err");
    }
  };

  const openMarketingBccDraft = () => {
    if (!marketingSelectedEmails.length) {
      flash("Selected assignments do not have email addresses", "err");
      return;
    }
    const campaignNames = uniqStrings(marketingSelectedItems.flatMap(item => item.campaigns || []).filter(Boolean));
    const subject = campaignNames.length === 1
      ? `${campaignNames[0]} outreach`
      : campaignNames.length > 1
        ? "Campaign outreach"
        : "Marketing outreach";
    const url = `https://mail.google.com/mail/?view=cm&fs=1&bcc=${encodeURIComponent(marketingSelectedEmails.join(","))}&su=${encodeURIComponent(subject)}`;
    window.open(url, "_blank", "noopener");
    flash(`Opened Gmail draft for ${marketingSelectedEmails.length} recipient${marketingSelectedEmails.length === 1 ? "" : "s"}`);
  };

  const openMarketingBulkUpdateModal = () => {
    setMarketingBulkText("");
    setMarketingBulkDefaultCampaign(marketingCampaignFilter !== "all" ? marketingCampaignFilter : "");
    setMarketingBulkDefaultStatus(marketingStatusFilter !== "all" && marketingStatusFilter !== "active" ? marketingStatusFilter : "prospect");
    setMarketingBulkDefaultOwner(
      effectiveMarketingOwnerFilter && effectiveMarketingOwnerFilter !== "all"
        ? effectiveMarketingOwnerFilter
        : workspaceUser !== ALL_USER_VIEW && workspaceUser !== UNASSIGNED_USER_VIEW
          ? workspaceUser
          : ""
    );
    setShowMarketingBulkUpdateModal(true);
  };

  const closeMarketingBulkUpdateModal = () => {
    setShowMarketingBulkUpdateModal(false);
    setMarketingBulkText("");
    setMarketingBulkDefaultCampaign("");
    setMarketingBulkDefaultStatus("prospect");
    setMarketingBulkDefaultOwner("");
  };

  const applyMarketingBulkUpdate = async () => {
    if (!requireEditor()) return;
    if (!proj) return;
    if (!marketingBulkPreview.length) {
      flash("Paste a list of talent first", "err");
      return;
    }
    const teamUsers = proj.teamUsers || DEFAULT_TEAM_USERS;
    const now = new Date().toISOString();
    const existingItems = (proj.marketingItems || []).map(item => normalizeMarketingItem(item, teamUsers));
    const nextItems = [...existingItems];
    const itemIndexById = new Map(nextItems.map((item, index) => [item.id, index]));
    const seenNameCampaign = new Set();
    let nextActivityLog = proj.activityLog || {};
    nextItems.forEach(item => {
      const campaigns = item.campaigns?.length ? item.campaigns : [""];
      campaigns.forEach(campaign => {
        seenNameCampaign.add(`${canonicalArtistName(item.talentName)}::${canonicalArtistName(campaign)}`);
      });
    });

    let updatedCount = 0;
    let createdCount = 0;
    let skippedCount = 0;

    marketingBulkPreview.forEach(entry => {
      const normalizedCampaign = String(entry.campaign || "").trim();
      const exactKey = `${canonicalArtistName(entry.talentName)}::${canonicalArtistName(normalizedCampaign)}`;
      if (entry.action === "update") {
        const itemIndex = itemIndexById.get(entry.targetId);
        if (typeof itemIndex !== "number") {
          skippedCount += 1;
          return;
        }
        const current = normalizeMarketingItem(nextItems[itemIndex], teamUsers);
        const nextCampaigns = normalizedCampaign
          ? normalizeMarketingCampaigns([...(current.campaigns || []), normalizedCampaign])
          : current.campaigns || [];
        const updatedItem = normalizeMarketingItem({
          ...current,
          status: entry.status,
          owner: entry.owner || current.owner || "",
          campaigns: nextCampaigns,
          campaign: normalizedCampaign || current.campaign || "",
          updatedAt: now,
        }, teamUsers);
        if (JSON.stringify(updatedItem) !== JSON.stringify(current)) {
          nextItems[itemIndex] = updatedItem;
          updatedCount += 1;
          nextActivityLog = logAction({ ...proj, activityLog: nextActivityLog }, entry.talentName, `Marketing bulk → ${MM[entry.status]?.label || titleCaseWords(entry.status)}`, "event", {
            assignmentId: updatedItem.id,
            campaign: normalizedCampaign || current.campaign || "",
          });
        }
        seenNameCampaign.add(exactKey);
        return;
      }

      if (entry.action === "create") {
        if (seenNameCampaign.has(exactKey)) {
          skippedCount += 1;
          return;
        }
        const baseFromMarketing = entry.baseItem ? normalizeMarketingItem(entry.baseItem, teamUsers) : null;
        const baseFromArtist = entry.baseArtist
          ? {
              talentName: entry.baseArtist.n || entry.talentName,
              talentType: "Internal Artist",
              title: entry.baseArtist.n || entry.talentName,
              campaign: "",
              campaigns: [],
              trafficType: "Organic",
              channels: [],
              deliverableType: "UGC",
              owner: "",
              dueDate: "",
              email: entry.baseArtist.e || "",
              instagramHandle: normalizeSocialHandle(entry.baseArtist.ig || entry.baseArtist.soc || ""),
              instagramUrl: /instagram\.com/i.test(entry.baseArtist.ig || "") ? entry.baseArtist.ig : "",
              instagramFollowers: "",
              tiktokHandle: "",
              tiktokUrl: "",
              tiktokFollowers: "",
              spotifyUrl: "",
              spotifyMonthlyListeners: normalizeFollowerCount(entry.baseArtist.l || ""),
              briefUrl: "",
              contentUrl: "",
              notes: "",
              rejectedReason: "",
            }
          : null;
        const base = baseFromMarketing || baseFromArtist || {
          talentName: entry.talentName,
          talentType: "Internal Artist",
          title: entry.talentName,
          trafficType: "Organic",
          channels: [],
          deliverableType: "UGC",
        };
        const nextItem = normalizeMarketingItem({
          ...base,
          id: `mkt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          talentName: entry.talentName,
          email: entry.email || base.email || "",
          title: String(base.title || "").trim() && String(base.title || "").trim() !== String(base.talentName || "").trim()
            ? base.title
            : [entry.talentName, normalizedCampaign || base.deliverableType || "UGC"].filter(Boolean).join(" · "),
          campaign: normalizedCampaign,
          campaigns: normalizedCampaign ? [normalizedCampaign] : [],
          status: entry.status,
          owner: entry.owner || base.owner || "",
          createdAt: now,
          updatedAt: now,
        }, teamUsers);
        nextItems.push(nextItem);
        itemIndexById.set(nextItem.id, nextItems.length - 1);
        seenNameCampaign.add(exactKey);
        createdCount += 1;
        nextActivityLog = logAction({ ...proj, activityLog: nextActivityLog }, entry.talentName, `Campaign assignment created · ${normalizedCampaign || "No campaign"}`, "event", {
          assignmentId: nextItem.id,
          campaign: normalizedCampaign || "",
        });
        return;
      }

      skippedCount += 1;
    });

    const nextProj = {
      ...proj,
      marketingItems: nextItems,
      activityLog: nextActivityLog,
      settings: {
        ...(proj.settings || {}),
        marketingCampaignBank: normalizeMarketingCampaignBank([
          ...(proj.settings?.marketingCampaignBank || []),
          ...marketingBulkPreview.map(row => row.campaign).filter(Boolean),
        ]),
      },
    };

    await saveProject(nextProj);
    setSearch("");
    setMarketingStatusFilter("all");
    setMarketingCampaignFilter("all");
    setMarketingTrafficFilter("all");
    setMarketingOwnerFilter("all");
    setMarketingGroupFilter("all");
    setSelectedMarketingIds(new Set());
    setMarketingSelectionMode(false);
    changeWorkspaceUser(ALL_USER_VIEW);
    await persist(undefined, undefined, undefined, undefined, undefined, ALL_USER_VIEW, "work");
    closeMarketingBulkUpdateModal();
    flash(`Bulk update applied · ${updatedCount} updated · ${createdCount} created · ${skippedCount} skipped`);
  };

  const filteredMarketingItems = useMemo(() => {
    let list = groupScopedMarketingItems;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(item =>
        `${item.talentName} ${item.talentType} ${item.title} ${(item.campaigns || []).join(" ")} ${item.trafficType} ${(item.channels || []).join(" ")} ${item.deliverableType} ${item.owner} ${item.email} ${item.instagramHandle} ${item.instagramUrl} ${item.instagramFollowers} ${item.tiktokHandle} ${item.tiktokUrl} ${item.tiktokFollowers} ${item.spotifyUrl} ${item.spotifyMonthlyListeners} ${item.notes} ${item.rejectedReason || ""}`.toLowerCase().includes(q)
      );
    }
    if (marketingStatusFilter !== "all") {
      list = list.filter(item => matchesMarketingStatusFilter(item.status, marketingStatusFilter));
    }
    if (marketingCampaignFilter !== "all") {
      list = list.filter(item => {
        const campaigns = item.campaigns?.length ? item.campaigns : ["No campaign"];
        return campaigns.includes(marketingCampaignFilter);
      });
    }
    if (marketingTrafficFilter !== "all") {
      list = list.filter(item => item.trafficType === marketingTrafficFilter);
    }
    return [...list].sort((a, b) => {
      const aDue = a.dueDate || "9999-12-31";
      const bDue = b.dueDate || "9999-12-31";
      if (aDue !== bDue) return aDue.localeCompare(bDue);
      return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
    });
  }, [groupScopedMarketingItems, search, marketingStatusFilter, marketingCampaignFilter, marketingTrafficFilter]);

  const marketingQueue = useMemo(() => {
    const today = todayISO();
    return filteredMarketingItems
      .filter(item => item.status !== "complete" && item.status !== "rejected")
      .map(item => ({
        ...item,
        priorityLabel: item.dueDate
          ? item.dueDate < today
            ? `Overdue since ${sD(item.dueDate)}`
            : item.dueDate === today
              ? "Due today"
              : `Due ${sD(item.dueDate)}`
          : `${MM[item.status]?.label || "In motion"} · no due date`,
      }))
      .sort((a, b) => {
        const aDue = a.dueDate || "9999-12-31";
        const bDue = b.dueDate || "9999-12-31";
        if (aDue !== bDue) return aDue.localeCompare(bDue);
        return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
      })
      .slice(0, 6);
  }, [filteredMarketingItems]);

  const activeArtist = useMemo(() => {
    if (!selA) return null;
    return enriched.find(a => a.n === selA.n) || selA;
  }, [enriched, selA]);

  useEffect(() => {
    if (!activeArtist) return;
    seedArtistEditForm(activeArtist);
  }, [activeArtist?.n, activeArtist?.g, activeArtist?.l, activeArtist?.h, activeArtist?.soc, activeArtist?.ig, activeArtist?.e, activeArtist?.loc]);

  const gBuckets = useMemo(() => {
    const c = {};
    enriched.forEach(a => { c[a.bucket] = (c[a.bucket] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [enriched]);

  const effectiveOwnerFilter = useMemo(() => {
    if (ownerFilter === "__view__") {
      if (workspaceUser === ALL_USER_VIEW) return "all";
      if (workspaceUser === UNASSIGNED_USER_VIEW) return "";
      return workspaceUser;
    }
    return ownerFilter;
  }, [ownerFilter, workspaceUser]);

  const stageBase = useMemo(() => {
    let l = enriched;
    if (search) {
      const q = search.toLowerCase();
      l = l.filter(a => a.n.toLowerCase().includes(q) || a.g.toLowerCase().includes(q) || (a.h || "").toLowerCase().includes(q));
    }
    if (gf !== "All") l = l.filter(a => a.bucket === gf);
    if (pf !== "all") l = l.filter(a => pT(a.priority, C).label === pf);
    if (effectiveOwnerFilter !== "all") l = l.filter(a => a.owner === effectiveOwnerFilter);
    return l;
  }, [enriched, search, gf, pf, effectiveOwnerFilter, C]);

  const filtered = useMemo(() => {
    let l = stageBase;
    if (sf !== "all") l = l.filter(a => matchesStageFilter(a.stage, sf));
    if (sortBy === "priority") l = [...l].sort((a, b) => b.priority - a.priority);
    else if (sortBy === "name") l = [...l].sort((a, b) => a.n.localeCompare(b.n));
    else if (sortBy === "listeners") l = [...l].sort((a, b) => parseMl(b.l) - parseMl(a.l));
    else if (sortBy === "recent") l = [...l].sort((a, b) => (b.stageDate || "").localeCompare(a.stageDate || ""));
    return l;
  }, [stageBase, sf, sortBy, C]);

  const stCounts = useMemo(() => {
    const c = {};
    STAGES.forEach(s => { c[s.id] = 0; });
    stageBase.forEach(a => { c[a.stage] = (c[a.stage] || 0) + 1; });
    return c;
  }, [stageBase]);
  const contactedCount = useMemo(() => stageBase.filter(a => isContactedStage(a.stage)).length, [stageBase]);

  const reportScopedArtists = useMemo(() => {
    if (reportScopeMode === "team") return enriched;
    if (workspaceUser === UNASSIGNED_USER_VIEW) return enriched.filter(a => !a.owner);
    return enriched.filter(a => a.owner === workspaceUser);
  }, [enriched, reportScopeMode, workspaceUser]);

  const reportScopedArtistNames = useMemo(() => new Set(reportScopedArtists.map(a => a.n)), [reportScopedArtists]);

  const reportStageCounts = useMemo(() => {
    const c = {};
    STAGES.forEach(s => { c[s.id] = 0; });
    reportScopedArtists.forEach(a => { c[a.stage] = (c[a.stage] || 0) + 1; });
    return c;
  }, [reportScopedArtists]);
  const reportContactedCount = useMemo(() => reportScopedArtists.filter(a => isContactedStage(a.stage)).length, [reportScopedArtists]);

  const reportFunnel = useMemo(() => {
    const t = reportScopedArtists.length || 1;
    const contacted = reportContactedCount;
    const replied = reportScopedArtists.filter(a => isRepliedStage(a.stage)).length;
    const engaged = reportScopedArtists.filter(a => isEngagedStage(a.stage)).length;
    const won = reportStageCounts.won || 0;
    const live = reportStageCounts.live || 0;
    return [
      { id: "all", l: "All", c: reportScopedArtists.length, p: 100, hint: "All artists in current scope" },
      { id: "contacted", l: "Contacted", c: contacted, p: Math.round((contacted / t) * 100), hint: "Sent or later" },
      { id: "prospect", l: "Prospect", c: reportStageCounts.prospect || 0, p: Math.round(((reportStageCounts.prospect || 0) / t) * 100), hint: "Not worked yet" },
      { id: "drafted", l: "Draft Ready", c: reportStageCounts.drafted || 0, p: Math.round(((reportStageCounts.drafted || 0) / t) * 100), hint: "Ready to send" },
      { id: "sent", l: "Sent", c: reportStageCounts.sent || 0, p: Math.round(((reportStageCounts.sent || 0) / t) * 100), hint: "Initial outreach sent" },
      { id: "replied", l: "Replied", c: reportStageCounts.replied || 0, p: Math.round(((reportStageCounts.replied || 0) / t) * 100), hint: "Exact replied stage" },
      { id: "engaged", l: "Engaged", c: reportStageCounts.engaged || 0, p: Math.round(((reportStageCounts.engaged || 0) / t) * 100), hint: "Interested and active" },
      { id: "won", l: "Won", c: won, p: Math.round((won / t) * 100), hint: "Closed but not yet live" },
      { id: "live", l: "Live", c: live, p: Math.round((live / t) * 100), hint: "Profile fully set up" },
      { id: "dead", l: "Dead", c: reportStageCounts.dead || 0, p: Math.round(((reportStageCounts.dead || 0) / t) * 100), hint: "Closed out" },
    ];
  }, [reportScopedArtists, reportStageCounts, reportContactedCount]);

  const reportActivityEntries = useMemo(() => {
    const rows = [];
    const source = proj?.activityLog || {};
    Object.entries(source).forEach(([artistName, logs]) => {
      (logs || []).forEach(entry => {
        if (reportScopeMode === "workspace") {
          if (workspaceUser === UNASSIGNED_USER_VIEW) {
            if (!reportScopedArtistNames.has(artistName)) return;
          } else if ((entry.actor || "") !== workspaceUser) return;
        }
        if (!isWithinDateRange(entry.time)) return;
        rows.push({ ...entry, artistName });
      });
    });
    return rows.sort((a, b) => String(a.time).localeCompare(String(b.time)));
  }, [proj?.activityLog, reportScopeMode, workspaceUser, reportScopedArtistNames, isWithinDateRange]);

  const reportSendEntries = useMemo(() => {
    return (proj?.sendLog || [])
      .filter(entry => {
        if (reportScopeMode === "team") return true;
        if (workspaceUser === UNASSIGNED_USER_VIEW) return reportScopedArtistNames.has(entry.artist);
        return (entry.actor || "") === workspaceUser;
      })
      .filter(entry => isWithinDateRange(entry.sentAt));
  }, [proj?.sendLog, reportScopeMode, workspaceUser, reportScopedArtistNames, isWithinDateRange]);

  const reportActivityStats = useMemo(() => {
    const stageMoves = reportActivityEntries.filter(entry => String(entry.action || "").startsWith("Stage →") || String(entry.action || "").startsWith("Batch →")).length;
    const noteUpdates = reportActivityEntries.filter(entry => entry.kind === "note" || entry.action === "Note updated").length;
    const aiActions = reportActivityEntries.filter(entry => /AI /i.test(String(entry.action || "")) || /Reply intelligence|Follow-up draft/i.test(String(entry.action || ""))).length;
    const assignments = reportActivityEntries.filter(entry => /Assigned to|Owner cleared/i.test(String(entry.action || ""))).length;
    return {
      actions: reportActivityEntries.length,
      sends: reportSendEntries.length,
      stageMoves,
      noteUpdates,
      aiActions,
      assignments,
    };
  }, [reportActivityEntries, reportSendEntries]);

  const activeReportPreset = useMemo(() => {
    const end = todayISO();
    if (reportEnd !== end) return "custom";
    if (reportStart === addDaysISO(end, -6)) return "7d";
    if (reportStart === addDaysISO(end, -29)) return "30d";
    if (reportStart === addDaysISO(end, -89)) return "90d";
    return "custom";
  }, [reportStart, reportEnd]);

  const reportTimeline = useMemo(() => {
    if (!reportStart || !reportEnd) return [];
    const start = new Date(`${reportStart}T00:00:00`);
    const end = new Date(`${reportEnd}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];

    const rows = [];
    const map = {};
    const cursor = new Date(start);
    let guard = 0;
    while (cursor <= end && guard < 180) {
      const iso = cursor.toISOString().slice(0, 10);
      map[iso] = { day: iso, actions: 0, sends: 0, stageMoves: 0 };
      rows.push(map[iso]);
      cursor.setDate(cursor.getDate() + 1);
      guard += 1;
    }
    reportActivityEntries.forEach(entry => {
      const day = String(entry.time || "").slice(0, 10);
      if (!map[day]) return;
      map[day].actions += 1;
      if (String(entry.action || "").startsWith("Stage →") || String(entry.action || "").startsWith("Batch →")) map[day].stageMoves += 1;
    });
    reportSendEntries.forEach(entry => {
      const day = String(entry.sentAt || "").slice(0, 10);
      if (!map[day]) return;
      map[day].sends += 1;
    });
    const max = rows.reduce((acc, item) => Math.max(acc, item.actions, item.sends), 1);
    return rows.map(item => ({
      ...item,
      max,
      label: new Date(`${item.day}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    }));
  }, [reportStart, reportEnd, reportActivityEntries, reportSendEntries]);

  const operationalDayLabel = useMemo(() => operationalDateLabelFor(clockNow), [clockNow]);
  const queueUpdatedLabel = useMemo(() => nowLabelFor(clockNow), [clockNow]);
  const queue = useMemo(() => buildQueue(reportScopedArtists, proj?.sequenceState || {}, clockNow), [reportScopedArtists, proj, clockNow]);
  const abRows = useMemo(() => buildABLeaderboard(proj?.abStats || {}), [proj]);
  const dueSeqCount = useMemo(
    () => Object.values(proj?.sequenceState || {}).filter(ss => ss?.status === "active" && ss.nextDue && ss.nextDue <= operationalTodayISOFor(clockNow)).length,
    [proj, clockNow],
  );
  const healthAlerts = useMemo(() => buildHealthAlerts(reportScopedArtists, proj || {}, clockNow), [reportScopedArtists, proj, clockNow]);
  const internalMatchCount = useMemo(() => enriched.filter(a => a.onPlatform).length, [enriched]);
  const workspaceOverview = useMemo(() => {
    return projects.reduce((acc, project) => {
      acc.projects += 1;
      if (normalizeProjectType(project.type) === "marketing") {
        const mk = summarizeMarketingItems(project.marketingItems || [], operationalTodayISOFor(clockNow));
        acc.marketingItems += mk.items;
        acc.marketingComplete += mk.complete;
        acc.due += mk.overdue + mk.dueSoon;
      } else {
        acc.artists += project.artists?.length || 0;
        Object.values(project.pipeline || {}).forEach(state => {
          if (isContactedStage(state?.stage)) acc.contacted += 1;
          if (state?.stage === "live") acc.live += 1;
        });
        acc.due += Object.values(project.sequenceState || {}).filter(ss => ss?.status === "active" && ss.nextDue && ss.nextDue <= operationalTodayISOFor(clockNow)).length;
      }
      return acc;
    }, { projects: 0, artists: 0, marketingItems: 0, contacted: 0, live: 0, marketingComplete: 0, due: 0 });
  }, [projects, clockNow]);
  const inboxMailboxOptions = useMemo(() => {
    const source = (projectInbox.connections?.length ? projectInbox.connections : gmailStatus.connections) || [];
    return source.filter(item => item?.connected);
  }, [projectInbox.connections, gmailStatus.connections]);
  const artistByName = useMemo(() => Object.fromEntries(enriched.map(item => [item.n, item])), [enriched]);
  const projectInboxThreads = useMemo(() => {
    const rows = (projectInbox.threads || []).map(thread => {
      const artist = artistByName[thread.artistName] || null;
      const mailbox = inboxMailboxOptions.find(item => item.userId === thread.senderUserId) || null;
      const threadOwner = inboxMailboxOptions.find(item => item.userId === thread.threadOwnerUserId) || null;
      return {
        ...thread,
        artist,
        mailboxLabel: mailbox ? `${mailbox.workspaceEmail.split("@")[0]} · ${mailbox.gmailEmail}` : thread.senderGmailEmail,
        threadOwnerLabel: threadOwner ? threadOwner.workspaceEmail.split("@")[0] : "",
        needsReply: threadNeedsReply(thread),
      };
    });
    const grouped = new Map();
    rows.forEach(thread => {
      const artistKey = String(thread.artist?.n || thread.artistName || thread.counterpartyEmail || thread.subject || thread.threadKey).trim().toLowerCase();
      const mailboxKey = String(thread.senderUserId || thread.senderGmailEmail || "mailbox").trim().toLowerCase();
      const groupKey = `${mailboxKey}::${artistKey}`;
      const existing = grouped.get(groupKey);
      if (!existing) {
        grouped.set(groupKey, {
          ...thread,
          threadKey: groupKey,
          primaryThreadKey: thread.threadKey,
          primaryExternalThreadId: thread.externalThreadId,
          sourceThreadKeys: [thread.threadKey],
          threadCount: 1,
          searchHaystack: `${thread.artistName} ${thread.subject || ""} ${thread.snippet || ""} ${thread.counterpartyEmail || ""}`.toLowerCase(),
        });
        return;
      }
      const existingTime = existing.lastMessageAt || "";
      const nextTime = thread.lastMessageAt || "";
      const shouldReplace = nextTime > existingTime;
      const mergedThread = shouldReplace ? { ...existing, ...thread } : { ...existing };
      mergedThread.threadKey = groupKey;
      mergedThread.primaryThreadKey = shouldReplace ? thread.threadKey : existing.primaryThreadKey;
      mergedThread.primaryExternalThreadId = shouldReplace ? thread.externalThreadId : existing.primaryExternalThreadId;
      mergedThread.sourceThreadKeys = Array.from(new Set([...(existing.sourceThreadKeys || []), thread.threadKey]));
      mergedThread.threadCount = mergedThread.sourceThreadKeys.length;
      mergedThread.needsReply = existing.needsReply || thread.needsReply;
      mergedThread.status = existing.status === "open" || thread.status === "open"
        ? "open"
        : existing.status === "waiting" || thread.status === "waiting"
          ? "waiting"
          : shouldReplace ? thread.status : existing.status;
      mergedThread.threadOwnerUserId = existing.threadOwnerUserId || thread.threadOwnerUserId || "";
      mergedThread.threadOwnerLabel = existing.threadOwnerLabel || thread.threadOwnerLabel || "";
      mergedThread.nextFollowUpAt = existing.nextFollowUpAt || thread.nextFollowUpAt || "";
      mergedThread.internalNote = existing.internalNote || thread.internalNote || "";
      mergedThread.internalNoteUpdatedAt = existing.internalNoteUpdatedAt || thread.internalNoteUpdatedAt || "";
      mergedThread.internalNoteUpdatedBy = existing.internalNoteUpdatedBy || thread.internalNoteUpdatedBy || "";
      mergedThread.searchHaystack = `${existing.searchHaystack || ""} ${thread.artistName} ${thread.subject || ""} ${thread.snippet || ""} ${thread.counterpartyEmail || ""}`.toLowerCase();
      grouped.set(groupKey, mergedThread);
    });
    return [...grouped.values()]
      .filter(thread => {
        if (inboxArtistQuery) {
          const q = inboxArtistQuery.toLowerCase();
          const hay = thread.searchHaystack || `${thread.artistName} ${thread.subject} ${thread.snippet} ${thread.counterpartyEmail}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (inboxStageFilter !== "all") {
          const stage = thread.artist?.stage || "prospect";
          if (!matchesStageFilter(stage, inboxStageFilter)) return false;
        }
        if (inboxOwnerFilter !== "all") {
          const owner = thread.artist?.owner || "";
          if (inboxOwnerFilter === "__unassigned__") {
            if (owner) return false;
          } else if (owner !== inboxOwnerFilter) {
            return false;
          }
        }
        if (inboxMailboxFilter !== "all" && thread.senderUserId !== inboxMailboxFilter) return false;
        if (inboxNeedsReplyOnly && !thread.needsReply) return false;
        if (!matchesInboundWindow(thread, inboxInboundDays, clockNow)) return false;
        return true;
      })
      .sort((a, b) => (b.lastMessageAt || "").localeCompare(a.lastMessageAt || ""));
  }, [
    projectInbox.threads,
    artistByName,
    inboxMailboxOptions,
    inboxArtistQuery,
    inboxStageFilter,
    inboxOwnerFilter,
    inboxMailboxFilter,
    inboxNeedsReplyOnly,
    inboxInboundDays,
    clockNow,
  ]);
  const projectInboxActionableCount = useMemo(
    () => projectInboxThreads.filter(threadIsActionable).length,
    [projectInboxThreads],
  );
  const selectedProjectThread = useMemo(
    () => projectInboxThreads.find(item => item.threadKey === selectedProjectThreadKey) || projectInboxThreads[0] || null,
    [projectInboxThreads, selectedProjectThreadKey],
  );
  const selectedProjectThreadMessages = useMemo(
    () => {
      if (!selectedProjectThread) return [];
      const keySet = new Set(selectedProjectThread.sourceThreadKeys || [selectedProjectThread.primaryThreadKey || selectedProjectThread.threadKey]);
      return (projectInbox.messages || [])
        .filter(item => keySet.has(item.threadKey))
        .sort((a, b) => (a.sentAt || "").localeCompare(b.sentAt || ""));
    },
    [selectedProjectThread, projectInbox.messages],
  );
  const activeArtistInboxThread = useMemo(() => {
    const threads = (artistInbox.threads || []).slice().sort((a, b) => (b.lastMessageAt || "").localeCompare(a.lastMessageAt || ""));
    return threads.find(item => item.threadKey === selectedThreadKey) || threads[0] || null;
  }, [artistInbox.threads, selectedThreadKey]);
  const latestProjectInboundMessage = useMemo(
    () => [...selectedProjectThreadMessages].reverse().find(item => item.direction === "inbound") || null,
    [selectedProjectThreadMessages],
  );
  useEffect(() => {
    if (!projectMode || projectMode !== "inbox") return;
    if (!projectInboxThreads.length) {
      if (selectedProjectThreadKey) setSelectedProjectThreadKey("");
      return;
    }
    const targetThread = selectedProjectThread || projectInboxThreads[0] || null;
    if (!targetThread) return;
    const sourceKeys = new Set(targetThread.sourceThreadKeys || [targetThread.primaryThreadKey || targetThread.threadKey]);
    const hasLoadedMessages = (projectInbox.messages || []).some(item => sourceKeys.has(item.threadKey));
    if (targetThread.threadKey !== selectedProjectThreadKey || !hasLoadedMessages) {
      selectProjectInboxThread(targetThread);
    }
  }, [projectMode, projectInboxThreads, selectedProjectThread, selectedProjectThreadKey, projectInbox.messages]);
  useEffect(() => {
    setReplyInput("");
    setFollowUpDraft("");
    setGmailReplyDraft("");
    if (screen === "detail" && selA && proj) {
      setReplyResult(proj.replyIntel?.[selA.n] || null);
      return;
    }
    setReplyResult(null);
  }, [selectedThreadKey, selectedProjectThreadKey]);
  useEffect(() => {
    setArtistThreadNoteDraft(activeArtistInboxThread?.internalNote || "");
  }, [activeArtistInboxThread?.threadKey, activeArtistInboxThread?.internalNote]);
  useEffect(() => {
    setProjectThreadNoteDraft(selectedProjectThread?.internalNote || "");
  }, [selectedProjectThread?.threadKey, selectedProjectThread?.internalNote]);
  useEffect(() => {
    if (!gmailConnected) return undefined;
    if (syncingInbox) return undefined;
    let pollArtist = null;
    let pollSenderUserId = "";
    if (screen === "detail" && detailTab === "inbox" && selA?.e && activeArtistInboxThread?.senderUserId) {
      pollArtist = selA;
      pollSenderUserId = activeArtistInboxThread.senderUserId;
    } else if (isArProject && projectMode === "inbox" && selectedProjectThread?.artist?.e && selectedProjectThread?.senderUserId) {
      pollArtist = selectedProjectThread.artist;
      pollSenderUserId = selectedProjectThread.senderUserId;
    }
    if (!pollArtist || !pollSenderUserId) return undefined;
    const timer = setInterval(() => {
      syncArtistInbox(pollArtist, pollSenderUserId, { silent: true, background: true }).catch(() => null);
    }, 75000);
    return () => clearInterval(timer);
  }, [
    gmailConnected,
    syncingInbox,
    screen,
    detailTab,
    selA?.n,
    selA?.e,
    activeArtistInboxThread?.threadKey,
    activeArtistInboxThread?.senderUserId,
    projectMode,
    selectedProjectThread?.threadKey,
    selectedProjectThread?.senderUserId,
    selectedProjectThread?.artist?.n,
    selectedProjectThread?.artist?.e,
  ]);
  const handleKanbanDrop = async (stageId, droppedName = "") => {
    if (!canEdit) {
      flash("Viewer role is read-only", "err");
      return;
    }
    const name = droppedName || dragArtistName;
    setDragOverStage("");
    setDragArtistName("");
    if (!name) return;
    const currentStage = proj?.pipeline?.[name]?.stage || "prospect";
    if (currentStage === stageId) return;
    await setSt(name, stageId);
  };

  const Toast = () => toast ? (
    <div style={{ position: "fixed", top: 20, right: 20, zIndex: 999, background: toast.t === "err" ? C.rb : C.sf, border: `1px solid ${toast.t === "err" ? C.rbd : C.bd}`, borderRadius: 12, padding: "10px 20px", boxShadow: C.sm, fontSize: 13, color: toast.t === "err" ? C.rd : C.tx, fontFamily: ft, animation: "si 0.2s ease" }}>
      {toast.t === "err" ? "✕ " : "✓ "}{toast.m}
    </div>
  ) : null;

  const DkBtn = () => (
    <button onClick={togDark} title={dark ? "Light" : "Dark"} style={{ background: C.sa, border: `1.5px solid ${C.bd}`, width: 36, height: 36, borderRadius: 10, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", color: C.ts, flexShrink: 0 }}>
      {dark ? "☀" : "☾"}
    </button>
  );

  // ═══ WORKSPACE ═══
  if (screen === "workspace") return (
    <div style={{ fontFamily: ft, background: C.bg, minHeight: "100vh", color: C.tx }}>
      <Toast /><style>{css}</style>
      <div style={{ borderBottom: `1px solid ${C.bd}`, background: C.sf }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            onClick={() => { setScreen("hub"); updateWorkspaceUrl("", "", "", ""); }}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, fontFamily: ft, color: C.ac, fontWeight: 600 }}
          >
            ← Project Home
          </button>
          <DkBtn />
        </div>
      </div>

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "24px" }}>
        <div style={{ ...cS, marginBottom: 18, padding: "22px 24px", background: dark ? "linear-gradient(135deg, #111a2b 0%, #162238 100%)" : "linear-gradient(135deg, #ffffff 0%, #eef4ff 100%)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1.3fr) minmax(280px, 1fr)", gap: 18, alignItems: "stretch" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: C.ac, marginBottom: 8 }}>Workspace</div>
              <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.04em", marginBottom: 8 }}>{selectedWorkspace.name}</div>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: C.ts, maxWidth: 560 }}>
                This is the master workspace shell. Kickoff is the pre-live scout and onboarding layer. Live Roster is the live roster and campaign operating hub. The underlying records stay intact while we transition the product model.
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                <span style={{ ...mkP(true, C.ac, C.al), cursor: "default" }}>{selectedWorkspace.projects.length} source records</span>
                <span style={{ ...mkP(true, C.bu, C.bb), cursor: "default" }}>{kickoffOverview.talents} pre-live talent</span>
                <span style={{ ...mkP(true, C.lv, C.lvb), cursor: "default" }}>{liveCrmOverview.liveTalents} live talent</span>
                <span style={{ ...mkP(true, C.pr, C.pb), cursor: "default" }}>{liveCrmOverview.assignments} marketing assignments</span>
              </div>
            </div>
            <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
              <button
                onClick={() => setScreen("kickoff")}
                style={{
                  borderRadius: 16,
                  border: `1px solid ${C.ac}40`,
                  background: C.al,
                  padding: "16px 18px",
                  cursor: "pointer",
                  display: "grid",
                  gap: 6,
                  textAlign: "left",
                  fontFamily: ft,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: C.ac }}>Open Kickoff</span>
                  <span style={{ ...mkP(true, C.ac, C.sf), cursor: "pointer" }}>{kickoffOverview.talents}</span>
                </div>
                <div style={{ fontSize: 12, color: C.ts, lineHeight: 1.5 }}>
                  Intake, scouting, curator advocacy, and onboarding for all pre-live talent.
                </div>
              </button>
              <button
                onClick={() => setScreen("live-crm")}
                style={{
                  borderRadius: 16,
                  border: `1px solid ${C.lv}40`,
                  background: C.lvb,
                  padding: "16px 18px",
                  cursor: "pointer",
                  display: "grid",
                  gap: 6,
                  textAlign: "left",
                  fontFamily: ft,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: C.lv }}>Open Live Roster</span>
                  <span style={{ ...mkP(true, C.lv, C.sf), cursor: "pointer" }}>{liveCrmOverview.liveTalents}</span>
                </div>
                <div style={{ fontSize: 12, color: C.ts, lineHeight: 1.5 }}>
                  Shared live talent roster with campaign assignments, groups, and marketing operations.
                </div>
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Source Records</div>
            <div style={{ fontSize: 12, color: C.tt }}>These are the underlying records still powering this workspace while Kickoff and Live Roster become the main operating surfaces.</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontSize: 11, color: C.tt }}>{selectedWorkspace.roles.map(role => workspaceRoleLabel(role)).join(" · ") || "No mapped roles yet"}</div>
            <button
              onClick={() => setShowWorkspaceSourceRecords(prev => !prev)}
              style={actionBtn(false, "neutral")}
            >
              {showWorkspaceSourceRecords ? "Hide Source Records" : "Show Source Records"}
            </button>
          </div>
        </div>

        {showWorkspaceSourceRecords && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16 }}>
            {selectedWorkspace.projects.map((project, index) => {
              const summary = summarizeProjectForHub(project, todayISO());
              const toneColor = normalizeProjectType(project.type) === "marketing" ? C.pr : normalizeProjectType(project.type) === "curator" ? C.gn : C.ac;
              const toneBg = normalizeProjectType(project.type) === "marketing" ? C.pb : normalizeProjectType(project.type) === "curator" ? C.gb : C.al;
              return (
                <div
                  key={project.id}
                  onClick={() => { void openProjectWorkspace(project.id); }}
                  style={{ ...cS, padding: "20px 22px", cursor: "pointer", transition: "all 0.2s", animation: `fu 0.3s ease ${index * 0.05}s both` }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = C.ac; e.currentTarget.style.boxShadow = C.sm; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = C.bd; e.currentTarget.style.boxShadow = C.sw; }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{project.name}</div>
                      <div style={{ fontSize: 12, color: C.ts }}>{workspaceRoleLabel(project.workspaceRole)}</div>
                    </div>
                    <span style={{ ...mkP(true, toneColor, toneBg), cursor: "default" }}>{projectTypeLabel(project.type)}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                    {(summary.cards || []).map(([label, value, tone]) => {
                      const fg = tone === "good" ? C.gn : tone === "live" ? C.lv : tone === "accent" ? C.ac : tone === "warn" ? C.ab : C.tx;
                      const bg = tone === "good" ? C.gb : tone === "live" ? C.lvb : tone === "accent" ? C.al : tone === "warn" ? C.abb : C.sa;
                      return (
                        <div key={`${project.id}:${label}`} style={{ borderRadius: 12, border: `1px solid ${C.bd}`, background: bg, padding: "10px 12px" }}>
                          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: C.tt, marginBottom: 6 }}>{label}</div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: fg, lineHeight: 1 }}>{value}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  // ═══ KICKOFF ═══
  if (screen === "kickoff") return (
    <div style={{ fontFamily: ft, background: C.bg, minHeight: "100vh", color: C.tx }}>
      <Toast /><style>{css}</style>
      <div style={{ borderBottom: `1px solid ${C.bd}`, background: C.sf }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            onClick={() => { setScreen("workspace"); updateWorkspaceUrl("", "", "", ""); }}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, fontFamily: ft, color: C.ac, fontWeight: 600 }}
          >
            ← {selectedWorkspace.name}
          </button>
          <DkBtn />
        </div>
      </div>

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "24px" }}>
        <div style={{ ...cS, marginBottom: 18, padding: "22px 24px", background: dark ? "linear-gradient(135deg, #111a2b 0%, #162238 100%)" : "linear-gradient(135deg, #ffffff 0%, #eef4ff 100%)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1.3fr) minmax(280px, 1fr)", gap: 18, alignItems: "stretch" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: C.ac, marginBottom: 8 }}>Kickoff</div>
              <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.04em", marginBottom: 8 }}>{selectedWorkspace.name} · Kickoff</div>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: C.ts, maxWidth: 560 }}>
                This is the pre-live operating view for artist scouting, curator advocacy, and onboarding. Everyone here is still in motion. Once they go live, the same shared talent profile shows up inside Live Roster with the full history intact.
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                <span style={{ ...mkP(true, C.ac, C.al), cursor: "default" }}>{kickoffOverview.talents} pre-live talent</span>
                <span style={{ ...mkP(true, C.ts, C.sa), cursor: "default" }}>{kickoffOverview.projects} source records</span>
                <span style={{ ...mkP(true, C.bu, C.bb), cursor: "default" }}>{kickoffOverview.stages.contacted} contacted</span>
                <span style={{ ...mkP(true, C.pr, C.pb), cursor: "default" }}>{kickoffOverview.stages.engaged} engaged</span>
                <span style={{ ...mkP(true, C.ac, C.al), cursor: "default" }}>{kickoffOverview.stages.won} onboarding</span>
                {kickoffOverview.curators > 0 && <span style={{ ...mkP(true, C.gn, C.gb), cursor: "default" }}>{kickoffOverview.curators} curators</span>}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(120px, 1fr))", gap: 10 }}>
              {[
                ["Pre-Live", kickoffOverview.talents, C.ac, C.al],
                ["Source Records", kickoffOverview.projects, C.ts, C.sa],
                ["Artists", kickoffOverview.artists, C.bu, C.bb],
                ["Curators", kickoffOverview.curators, C.gn, C.gb],
                ["Contacted", kickoffOverview.stages.contacted, C.bu, C.bb],
                ["Onboarding", kickoffOverview.stages.won, C.ac, C.al],
              ].map(([label, value, tone, bg]) => (
                <div key={label} style={{ borderRadius: 14, border: `1px solid ${C.bd}`, background: bg, padding: "14px 16px" }}>
                  <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: C.tt, marginBottom: 8 }}>{label}</div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: tone, lineHeight: 1 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ ...cS, padding: "18px 20px", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Kickoff Actions</div>
              <div style={{ fontSize: 12, color: C.ts, maxWidth: 620 }}>
                Use these to add or bulk-load new artists and curators directly from Kickoff. The workspace keeps the legacy intake records synced behind the scenes so we can transition safely without breaking current data.
              </div>
            </div>
            <div style={{ fontSize: 11, color: C.tt, textAlign: "right" }}>
              {defaultKickoffArtistProject ? `Artists feed into ${defaultKickoffArtistProject.name}` : "No artist intake record yet"}
              <br />
              {defaultKickoffCuratorProject ? `Curators feed into ${defaultKickoffCuratorProject.name}` : "No curator intake record yet"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={() => { void launchWorkspaceProjectAction(defaultKickoffArtistProject?.id || "", "show-add-artist", "No artist intake record is mapped in this workspace yet"); }}
              style={{ ...actionBtn(true, "good"), ...lockStyle(isReadOnly) }}
            >
              + Artist
            </button>
            <button
              onClick={() => { void launchWorkspaceProjectAction(defaultKickoffArtistProject?.id || "", "import-csv", "No artist intake record is mapped in this workspace yet"); }}
              style={{ ...actionBtn(false, "neutral"), ...lockStyle(isReadOnly) }}
            >
              Bulk Add Artists
            </button>
            <button
              onClick={() => { void launchWorkspaceProjectAction(defaultKickoffCuratorProject?.id || "", "show-add-artist", "No curator intake record is mapped in this workspace yet"); }}
              style={{ ...actionBtn(true, "accent"), ...lockStyle(isReadOnly) }}
            >
              + Curator
            </button>
            <button
              onClick={() => { void launchWorkspaceProjectAction(defaultKickoffCuratorProject?.id || "", "import-csv", "No curator intake record is mapped in this workspace yet"); }}
              style={{ ...actionBtn(false, "neutral"), ...lockStyle(isReadOnly) }}
            >
              Bulk Add Curators
            </button>
            <button
              onClick={exportKickoffView}
              style={{ ...actionBtn(false, "neutral"), ...lockStyle(!kickoffProfiles.length) }}
            >
              Export Current View CSV
            </button>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
            <button
              onClick={() => {
                setKickoffSelectionMode(prev => {
                  const next = !prev;
                  if (!next) clearKickoffSelection();
                  return next;
                });
              }}
              style={{ ...actionBtn(kickoffSelectionMode, "neutral"), ...lockStyle(isReadOnly) }}
            >
              {kickoffSelectionMode ? "Done Selecting" : "Select Talent"}
            </button>
            {(kickoffSelectionMode || selectedKickoffIds.size > 0) && (
              <>
                <button onClick={selectVisibleKickoffProfiles} style={{ ...actionBtn(false, "neutral"), ...lockStyle(isReadOnly) }}>
                  Select All Visible
                </button>
                <button onClick={clearKickoffSelection} style={{ ...actionBtn(false, "neutral"), ...lockStyle(!selectedKickoffIds.size) }}>
                  Clear Selection
                </button>
                <span style={{ ...mkP(true, C.ac, C.al), cursor: "default" }}>
                  {selectedKickoffIds.size} selected · {kickoffSelectedRecordCount} source record{kickoffSelectedRecordCount === 1 ? "" : "s"}
                </span>
                <select
                  value={kickoffSelectionOwnerDraft}
                  onChange={e => setKickoffSelectionOwnerDraft(e.target.value)}
                  style={{ ...iS, width: 190, ...lockStyle(isReadOnly || !selectedKickoffIds.size) }}
                >
                  <option value="">Assign owner...</option>
                  {(workspaceTeamUsers || DEFAULT_TEAM_USERS).map(owner => <option key={owner} value={owner}>{owner}</option>)}
                  <option value="__clear__">Clear owner</option>
                </select>
                <button
                  onClick={() => batchAssignKickoffOwner(kickoffSelectionOwnerDraft === "__clear__" ? "" : kickoffSelectionOwnerDraft)}
                  style={{ ...actionBtn(false, "good"), ...lockStyle(isReadOnly || !selectedKickoffIds.size || !kickoffSelectionOwnerDraft) }}
                >
                  Apply Owner
                </button>
                {KICKOFF_STAGE_ACTIONS.map(stage => (
                  <button
                    key={`kickoff-bulk-stage-${stage.id}`}
                    onClick={() => batchSetKickoffStage(stage.id)}
                    style={{ ...mkP(false, sc(stage.id, C), sb(stage.id, C)), ...lockStyle(isReadOnly || !selectedKickoffIds.size) }}
                    title={`Move selected kickoff talent to ${stage.label}`}
                  >
                    {stage.label}
                  </button>
                ))}
              </>
            )}
          </div>
          <input type="file" accept=".csv" ref={workspaceCsvRef} onChange={importCSV} disabled={isReadOnly} style={{ display: "none" }} />
        </div>

        <div style={{ ...cS, padding: "18px 20px", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, color: C.tt }}>
              {kickoffProfiles.length} kickoff talent shown
              {kickoffSelectionMode || selectedKickoffIds.size ? ` · ${selectedKickoffIds.size} selected` : ""}
            </div>
            <div style={{ display: "flex", gap: 2, background: C.sa, borderRadius: 10, padding: 3, border: `1px solid ${C.bd}` }}>
              {[
                ["cards", "Cards"],
                ["board", "Pipeline"],
                ["table", "Table"],
              ].map(([mode, label]) => (
                <button
                  key={`kickoff-view-${mode}`}
                  onClick={() => { void setKickoffView(mode); }}
                  style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: kickoffViewMode === mode ? C.ac : "transparent", color: kickoffViewMode === mode ? "#fff" : C.ts, cursor: "pointer", fontSize: 12, fontFamily: ft, fontWeight: 600 }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1.2fr) repeat(4, minmax(150px, 0.8fr))", gap: 12, alignItems: "end" }}>
            <label style={{ display: "grid", gap: 6, fontSize: 12, color: C.ts }}>
              <span>Search kickoff talent</span>
              <input
                value={kickoffQuery}
                onChange={e => setKickoffQuery(e.target.value)}
                placeholder="Search name, email, project, owner..."
                style={{ ...iS, width: "100%" }}
              />
            </label>
            <label style={{ display: "grid", gap: 6, fontSize: 12, color: C.ts }}>
              <span>Talent type</span>
              <select value={kickoffTypeFilter} onChange={e => setKickoffTypeFilter(e.target.value)} style={{ ...iS, width: "100%" }}>
                <option value="all">All types</option>
                {kickoffTypeOptions.map(type => (
                  <option key={type} value={canonicalArtistName(type)}>{type}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 6, fontSize: 12, color: C.ts }}>
              <span>Source</span>
              <select value={kickoffSourceFilter} onChange={e => setKickoffSourceFilter(e.target.value)} style={{ ...iS, width: "100%" }}>
                <option value="all">All sources</option>
                {kickoffSourceOptions.map(source => (
                  <option key={source} value={source}>{TALENT_SOURCE_LABELS[source] || source}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 6, fontSize: 12, color: C.ts }}>
              <span>Owner</span>
              <select value={kickoffOwnerFilter} onChange={e => setKickoffOwnerFilter(e.target.value)} style={{ ...iS, width: "100%" }}>
                <option value="all">All owners</option>
                <option value="__unassigned__">Unassigned</option>
                {kickoffOwnerOptions.map(owner => (
                  <option key={owner} value={owner}>{owner}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 6, fontSize: 12, color: C.ts }}>
              <span>Stage</span>
              <select value={kickoffStageFilter} onChange={e => setKickoffStageFilter(e.target.value)} style={{ ...iS, width: "100%" }}>
                <option value="all">All stages</option>
                {STAGES.filter(stage => stage.id !== "live").map(stage => (
                  <option key={stage.id} value={stage.id}>{stage.label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {kickoffProfiles.length === 0 ? (
          <div style={{ ...cS, padding: "32px 28px", textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>No kickoff talent matches this view yet</div>
            <div style={{ fontSize: 12, color: C.ts, maxWidth: 520, margin: "0 auto" }}>
              Try widening the filters. This view is meant to be the shared scout and onboarding layer for new artists and curators before they become live.
            </div>
          </div>
        ) : kickoffViewMode === "board" ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12, alignItems: "start" }}>
            {kickoffBoardColumns.map(stage => {
              const tone = { tone: sc(stage.id, C), bg: sb(stage.id, C) };
              return (
                <div key={`kickoff-board-${stage.id}`} style={{ minWidth: 0 }}>
                  <div style={{ padding: "10px 12px", borderRadius: 12, border: `1px solid ${tone.tone}`, background: tone.bg, fontSize: 12, fontWeight: 700, color: tone.tone, marginBottom: 8 }}>
                    {stage.icon} {stage.label} ({stage.profiles.length})
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {stage.profiles.length ? stage.profiles.map(profile => (
                      <div
                        key={`kickoff-board-card-${profile.id}`}
                        onClick={() => openTalentProfileFromWorkspaceProfile(profile)}
                        style={{
                          ...cS,
                          padding: "12px 14px",
                          borderColor: selectedKickoffIds.has(profile.id) ? C.ac : C.bd,
                          background: selectedKickoffIds.has(profile.id) ? C.al : C.sf,
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 800, color: C.tx }}>{profile.displayName}</div>
                            <div style={{ fontSize: 11, color: C.ts, marginTop: 4 }}>
                              {summarizeWorkspaceValues(profile.talentTypes, 2)} · {summarizeWorkspaceValues(profile.owners, 1)}
                            </div>
                          </div>
                          {kickoffSelectionMode && (
                            <button onClick={e => { e.stopPropagation(); toggleKickoffSelection(profile.id); }} style={actionBtn(selectedKickoffIds.has(profile.id), "accent")}>
                              {selectedKickoffIds.has(profile.id) ? "Selected" : "Select"}
                            </button>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                          {profile.sources.map(source => (
                            <span key={`${profile.id}:board-source:${source}`} style={{ ...mkP(true, C.pr, C.pb), cursor: "default" }}>
                              {TALENT_SOURCE_LABELS[source] || source}
                            </span>
                          ))}
                        </div>
                        <div style={{ fontSize: 11, color: C.tt, lineHeight: 1.5, marginBottom: 8 }}>
                          {profile.primaryEmail || "No email yet"}
                          {profile.instagramHandle ? ` · @${profile.instagramHandle}` : ""}
                          {profile.spotifyMonthlyListeners ? ` · ${profile.spotifyMonthlyListeners} listeners` : ""}
                        </div>
                        {profile.recentActivity?.[0] && (
                          <div style={{ fontSize: 11, color: C.ts, lineHeight: 1.5, marginBottom: 8 }}>
                            {profile.recentActivity[0].note || profile.recentActivity[0].action}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button onClick={e => { e.stopPropagation(); openTalentProfileFromWorkspaceProfile(profile); }} style={actionBtn(false, "accent")}>
                            View Talent
                          </button>
                        </div>
                      </div>
                    )) : (
                      <div style={{ ...cS, padding: "16px 14px", color: C.tt, fontSize: 12 }}>
                        No talent in this stage for the current view.
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : kickoffViewMode === "table" ? (
          <div style={{ ...cS, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead style={{ background: C.sa }}>
                  <tr>
                    {["Talent", "Type", "Source", "Stage", "Owners", "Social / Contact", "Records", "Actions"].map(h => (
                      <th key={`kickoff-table-${h}`} style={{ textAlign: "left", padding: "10px 12px", color: C.ts, fontSize: 11, borderBottom: `1px solid ${C.bd}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {kickoffProfiles.map(profile => {
                    const stageId = kickoffStageBucket(profile.stages);
                    return (
                      <tr key={`kickoff-row-${profile.id}`} style={{ background: selectedKickoffIds.has(profile.id) ? C.al : "transparent" }}>
                        <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.sa}` }}>
                          <div style={{ fontWeight: 700 }}>{profile.displayName}</div>
                          <div style={{ fontSize: 11, color: C.tt, marginTop: 4 }}>{profile.primaryEmail || "No email yet"}</div>
                        </td>
                        <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.sa}`, color: C.ts }}>{summarizeWorkspaceValues(profile.talentTypes, 2)}</td>
                        <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.sa}`, color: C.ts }}>{summarizeWorkspaceValues(profile.sources, 2, source => TALENT_SOURCE_LABELS[source] || source)}</td>
                        <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.sa}` }}>
                          <span style={{ ...mkP(true, sc(stageId, C), sb(stageId, C)), cursor: "default" }}>{kickoffStageSummaryLabel(profile)}</span>
                        </td>
                        <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.sa}`, color: C.ts }}>{summarizeWorkspaceValues(profile.owners, 2)}</td>
                        <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.sa}`, color: C.ts }}>
                          {[
                            profile.instagramHandle ? `IG @${profile.instagramHandle}` : "",
                            profile.tiktokHandle ? `TikTok @${profile.tiktokHandle}` : "",
                            profile.spotifyMonthlyListeners ? `${profile.spotifyMonthlyListeners} listeners` : "",
                          ].filter(Boolean).join(" · ") || "No social details yet"}
                        </td>
                        <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.sa}`, color: C.ts }}>{profile.projectSummaries.length}</td>
                        <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.sa}` }}>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {kickoffSelectionMode && (
                              <button onClick={() => toggleKickoffSelection(profile.id)} style={actionBtn(selectedKickoffIds.has(profile.id), "accent")}>
                                {selectedKickoffIds.has(profile.id) ? "Selected" : "Select"}
                              </button>
                            )}
                            <button onClick={() => openTalentProfileFromWorkspaceProfile(profile)} style={actionBtn(false, "accent")}>
                              View Talent
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {kickoffProfiles.map(profile => (
              <div
                key={profile.id}
                onClick={() => openTalentProfileFromWorkspaceProfile(profile)}
                style={{
                  ...cS,
                  padding: "18px 20px",
                  border: `1px solid ${selectedKickoffIds.has(profile.id) ? `${C.ac}55` : C.bd}`,
                  background: selectedKickoffIds.has(profile.id) ? C.al : C.sf,
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 14 }}>
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.03em" }}>{profile.displayName}</span>
                      <span style={{ ...mkP(true, talentLifecycleTone(profile.platformLifecycle, C).tone, talentLifecycleTone(profile.platformLifecycle, C).bg), cursor: "default" }}>
                        {TALENT_LIFECYCLE_LABELS[profile.platformLifecycle] || "Pre-Live"}
                      </span>
                      {profile.talentTypes.map(type => (
                        <span key={`${profile.id}:type:${type}`} style={{ ...mkP(true, C.ts, C.sa), cursor: "default" }}>{type}</span>
                      ))}
                      {profile.sources.map(source => (
                        <span key={`${profile.id}:source:${source}`} style={{ ...mkP(true, C.pr, C.pb), cursor: "default" }}>
                          {TALENT_SOURCE_LABELS[source] || source}
                        </span>
                      ))}
                    </div>
                    <div style={{ fontSize: 12, color: C.ts, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <span>{profile.primaryEmail || "No email yet"}</span>
                      {profile.instagramHandle && <span>Instagram @{profile.instagramHandle}</span>}
                      {profile.tiktokHandle && <span>TikTok @{profile.tiktokHandle}</span>}
                      {profile.spotifyUrl && <span>Spotify linked</span>}
                      {profile.curatorPageUrl && <span>Curator page linked</span>}
                    </div>
                    {profile.recentActivity?.[0] && (
                      <div style={{ fontSize: 12, color: C.tt, lineHeight: 1.6 }}>
                        {profile.recentActivity[0].note || profile.recentActivity[0].action}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {kickoffSelectionMode && (
                      <button
                        onClick={e => { e.stopPropagation(); toggleKickoffSelection(profile.id); }}
                        style={actionBtn(selectedKickoffIds.has(profile.id), "accent")}
                      >
                        {selectedKickoffIds.has(profile.id) ? "Selected" : "Select"}
                      </button>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); openTalentProfileFromWorkspaceProfile(profile); }}
                      style={actionBtn(false, "accent")}
                    >
                      View Talent
                    </button>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(110px, 1fr))", gap: 10, marginBottom: 14 }}>
                  {[
                    ["Records", profile.projectSummaries.length, C.ac, C.al],
                    ["Owners", profile.owners.length || "—", C.ts, C.sa],
                    ["Curated Artists", profile.curatedArtists.length || "—", C.gn, C.gb],
                    ["Sources", profile.sources.length, C.pr, C.pb],
                  ].map(([label, value, tone, bg]) => (
                    <div key={`${profile.id}:${label}`} style={{ borderRadius: 12, border: `1px solid ${C.bd}`, background: bg, padding: "10px 12px" }}>
                      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: C.tt, marginBottom: 6 }}>{label}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: tone, lineHeight: 1 }}>{value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  {profile.projectSummaries.map(summary => (
                    <div key={`${profile.id}:project:${summary.projectId || summary.projectName}`} style={{ borderRadius: 14, border: `1px solid ${C.bd}`, background: C.sa, padding: "12px 14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <span style={{ fontSize: 14, fontWeight: 700 }}>{summary.projectName}</span>
                          <span style={{ ...mkP(true, summary.projectType === "curator" ? C.gn : C.ac, summary.projectType === "curator" ? C.gb : C.al), cursor: "default" }}>
                            {projectTypeLabel(summary.projectType)}
                          </span>
                        </div>
                        <span style={{ ...mkP(true, C.tt, C.sf), cursor: "default" }}>
                          Backed by synced intake record
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {summary.owners.map(owner => (
                          <span key={`${summary.projectId}:owner:${owner}`} style={{ ...mkP(true, C.ts, C.sf), cursor: "default" }}>{owner}</span>
                        ))}
                        {summary.stages.map(stage => (
                          <span key={`${summary.projectId}:stage:${stage}`} style={{ ...mkP(true, sc(stage, C), sb(stage, C)), cursor: "default" }}>
                            {SM[stage]?.label || "Prospect"}
                          </span>
                        ))}
                        {summary.genres.map(genre => (
                          <span key={`${summary.projectId}:genre:${genre}`} style={{ ...mkP(true, C.ts, C.sa), cursor: "default" }}>{genre}</span>
                        ))}
                        {summary.locations.map(location => (
                          <span key={`${summary.projectId}:location:${location}`} style={{ ...mkP(true, C.tt, C.sa), cursor: "default" }}>{location}</span>
                        ))}
                        {!summary.owners.length && !summary.stages.length && !summary.genres.length && !summary.locations.length && (
                          <span style={{ ...mkP(true, C.ts, C.sf), cursor: "default" }}>No kickoff metadata yet</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // ═══ LIVE CRM ═══
  if (screen === "live-crm") return (
    <div style={{ fontFamily: ft, background: C.bg, minHeight: "100vh", color: C.tx }}>
      <Toast /><style>{css}</style>
      <div style={{ borderBottom: `1px solid ${C.bd}`, background: C.sf }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            onClick={() => { setScreen("workspace"); updateWorkspaceUrl("", "", "", ""); }}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, fontFamily: ft, color: C.ac, fontWeight: 600 }}
          >
            ← {selectedWorkspace.name}
          </button>
          <DkBtn />
        </div>
      </div>

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "24px" }}>
        <div style={{ ...cS, marginBottom: 18, padding: "22px 24px", background: dark ? "linear-gradient(135deg, #111a2b 0%, #162238 100%)" : "linear-gradient(135deg, #ffffff 0%, #eef4ff 100%)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1.3fr) minmax(280px, 1fr)", gap: 18, alignItems: "stretch" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: C.lv, marginBottom: 8 }}>Live Roster</div>
              <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.04em", marginBottom: 8 }}>{selectedWorkspace.name} · Live Roster</div>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: C.ts, maxWidth: 560 }}>
                This is the shared live roster. Legacy roster talent already lives here, and pre-live artists or curators can graduate into this view without losing their notes, project history, or marketing context.
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                <span style={{ ...mkP(true, C.lv, C.lvb), cursor: "default" }}>{liveCrmOverview.liveTalents} live talent</span>
                <span style={{ ...mkP(true, C.ac, C.al), cursor: "default" }}>{liveCrmOverview.projects} source records</span>
                <span style={{ ...mkP(true, C.pr, C.pb), cursor: "default" }}>{liveCrmOverview.assignments} campaign assignments</span>
                <span style={{ ...mkP(true, C.bu, C.bb), cursor: "default" }}>{liveCrmOverview.campaigns} campaigns</span>
                {liveCrmOverview.internalArtists > 0 && <span style={{ ...mkP(true, C.ts, C.sa), cursor: "default" }}>{liveCrmOverview.internalArtists} internal artists</span>}
                {liveCrmOverview.curators > 0 && <span style={{ ...mkP(true, C.ac, C.al), cursor: "default" }}>{liveCrmOverview.curators} curators</span>}
                {liveCrmOverview.creators > 0 && <span style={{ ...mkP(true, C.gn, C.gb), cursor: "default" }}>{liveCrmOverview.creators} creators / AI UGC</span>}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(120px, 1fr))", gap: 10 }}>
              {[
                ["Live Talent", liveCrmOverview.liveTalents, C.lv, C.lvb],
                ["Source Records", liveCrmOverview.projects, C.ac, C.al],
                ["Campaigns", liveCrmOverview.campaigns, C.bu, C.bb],
                ["Assignments", liveCrmOverview.assignments, C.pr, C.pb],
              ].map(([label, value, tone, bg]) => (
                <div key={label} style={{ borderRadius: 14, border: `1px solid ${C.bd}`, background: bg, padding: "14px 16px" }}>
                  <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: C.tt, marginBottom: 8 }}>{label}</div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: tone, lineHeight: 1 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ ...cS, padding: "18px 20px", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Live Roster Actions</div>
              <div style={{ fontSize: 12, color: C.ts, maxWidth: 620 }}>
                Use the live roster as the main campaign operating surface. The workspace keeps the older mapped records synced behind the scenes while we move daily work fully into this view.
              </div>
            </div>
            <div style={{ fontSize: 11, color: C.tt, textAlign: "right" }}>
              {defaultLiveMarketingProject ? `Campaign work flows into ${defaultLiveMarketingProject.name}` : "No live campaign record yet"}
              <br />
              {liveCrmProfiles.length ? `${liveCrmProfiles.length} live talent in this view` : "Live roster is empty in this view"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={() => { void launchWorkspaceProjectAction(defaultLiveMarketingProject?.id || "", "show-marketing-item", "No live campaign record is mapped in this workspace yet"); }}
              style={{ ...actionBtn(true, "good"), ...lockStyle(isReadOnly) }}
            >
              + Campaign Assignment
            </button>
            <button
              onClick={() => { void launchWorkspaceProjectAction(defaultLiveMarketingProject?.id || "", "show-marketing-bulk-update", "No live campaign record is mapped in this workspace yet"); }}
              style={{ ...actionBtn(false, "neutral"), ...lockStyle(isReadOnly) }}
            >
              Bulk Update
            </button>
            <button
              onClick={() => { void launchWorkspaceProjectAction(defaultLiveMarketingProject?.id || "", "import-csv", "No live campaign record is mapped in this workspace yet"); }}
              style={{ ...actionBtn(false, "neutral"), ...lockStyle(isReadOnly) }}
            >
              Import Talent CSV
            </button>
            <button
              onClick={exportLiveRosterView}
              style={{ ...actionBtn(false, "neutral"), ...lockStyle(!liveCrmProfiles.length) }}
            >
              Export Current View CSV
            </button>
          </div>
          <input type="file" accept=".csv" ref={workspaceCsvRef} onChange={importCSV} disabled={isReadOnly} style={{ display: "none" }} />
        </div>

        <div style={{ ...cS, padding: "18px 20px", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, color: C.tt }}>
              {liveCrmProfiles.length} live talent shown
            </div>
            <div style={{ display: "flex", gap: 2, background: C.sa, borderRadius: 10, padding: 3, border: `1px solid ${C.bd}` }}>
              {[
                ["cards", "Cards"],
                ["table", "Table"],
              ].map(([mode, label]) => (
                <button
                  key={`live-view-${mode}`}
                  onClick={() => { void setLiveRosterView(mode); }}
                  style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: liveRosterViewMode === mode ? C.lv : "transparent", color: liveRosterViewMode === mode ? "#fff" : C.ts, cursor: "pointer", fontSize: 12, fontFamily: ft, fontWeight: 600 }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1.2fr) repeat(3, minmax(170px, 0.8fr))", gap: 12, alignItems: "end" }}>
            <label style={{ display: "grid", gap: 6, fontSize: 12, color: C.ts }}>
              <span>Search live talent</span>
              <input
                value={liveCrmQuery}
                onChange={e => setLiveCrmQuery(e.target.value)}
                placeholder="Search name, email, socials, campaign..."
                style={{ ...iS, width: "100%" }}
              />
            </label>
            <label style={{ display: "grid", gap: 6, fontSize: 12, color: C.ts }}>
              <span>Talent type</span>
              <select value={liveCrmTypeFilter} onChange={e => setLiveCrmTypeFilter(e.target.value)} style={{ ...iS, width: "100%" }}>
                <option value="all">All types</option>
                {liveCrmTypeOptions.map(type => (
                  <option key={type} value={canonicalArtistName(type)}>{type}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 6, fontSize: 12, color: C.ts }}>
              <span>Source</span>
              <select value={liveCrmSourceFilter} onChange={e => setLiveCrmSourceFilter(e.target.value)} style={{ ...iS, width: "100%" }}>
                <option value="all">All sources</option>
                {liveCrmSourceOptions.map(source => (
                  <option key={source} value={source}>{TALENT_SOURCE_LABELS[source] || source}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 6, fontSize: 12, color: C.ts }}>
              <span>Owner</span>
              <select value={liveCrmOwnerFilter} onChange={e => setLiveCrmOwnerFilter(e.target.value)} style={{ ...iS, width: "100%" }}>
                <option value="all">All owners</option>
                <option value="__unassigned__">Unassigned</option>
                {liveCrmOwnerOptions.map(owner => (
                  <option key={owner} value={owner}>{owner}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {liveCrmProfiles.length === 0 ? (
          <div style={{ ...cS, padding: "32px 28px", textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>No live talent matches this view yet</div>
            <div style={{ fontSize: 12, color: C.ts, maxWidth: 520, margin: "0 auto" }}>
              Try widening the filters, or keep seeding the shared talent layer. Legacy roster talent and any pre-live artist or curator who becomes live will show up here.
            </div>
          </div>
        ) : liveRosterViewMode === "table" ? (
          <div style={{ ...cS, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead style={{ background: C.sa }}>
                  <tr>
                    {["Talent", "Type", "Sources", "Owners", "Campaigns", "Assignments", "Status Mix", "Last Updated", "Actions"].map(h => (
                      <th key={`live-table-${h}`} style={{ textAlign: "left", padding: "10px 12px", color: C.ts, fontSize: 11, borderBottom: `1px solid ${C.bd}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {liveCrmProfiles.map(profile => (
                    <tr key={`live-row-${profile.id}`}>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.sa}` }}>
                        <div style={{ fontWeight: 700 }}>{profile.displayName}</div>
                        <div style={{ fontSize: 11, color: C.tt, marginTop: 4 }}>
                          {profile.primaryEmail || "No email yet"}
                          {profile.instagramHandle ? ` · @${profile.instagramHandle}` : ""}
                        </div>
                      </td>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.sa}`, color: C.ts }}>{summarizeWorkspaceValues(profile.talentTypes, 2)}</td>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.sa}`, color: C.ts }}>{summarizeWorkspaceValues(profile.sources, 2, source => TALENT_SOURCE_LABELS[source] || source)}</td>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.sa}`, color: C.ts }}>{summarizeWorkspaceValues(profile.owners, 2)}</td>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.sa}`, color: C.ts }}>{summarizeWorkspaceValues(profile.campaigns, 2)}</td>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.sa}`, color: C.ts }}>{profile.marketingAssignments.length}</td>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.sa}`, color: C.ts }}>{liveStatusSummaryLabel(profile)}</td>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.sa}`, color: C.tt }}>{profile.lastTouched ? rD(profile.lastTouched) : "—"}</td>
                      <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.sa}` }}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {defaultLiveMarketingProject && (
                            <button
                              onClick={() => {
                                void launchWorkspaceProjectAction(
                                  defaultLiveMarketingProject.id,
                                  "show-marketing-item",
                                  "No live campaign record is mapped in this workspace yet",
                                  { profileId: profile.id }
                                );
                              }}
                              style={{ ...actionBtn(true, "good"), ...lockStyle(isReadOnly) }}
                            >
                              + Campaign
                            </button>
                          )}
                          <button onClick={() => openTalentProfileFromWorkspaceProfile(profile)} style={actionBtn(false, "accent")}>
                            View Talent
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {liveCrmProfiles.map(profile => (
              <div key={profile.id} onClick={() => openTalentProfileFromWorkspaceProfile(profile)} style={{ ...cS, padding: "18px 20px", cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 14 }}>
                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.03em" }}>{profile.displayName}</span>
                      <span style={{ ...mkP(true, C.lv, C.lvb), cursor: "default" }}>
                        {TALENT_LIFECYCLE_LABELS[profile.platformLifecycle] || "Live"}
                      </span>
                      {profile.talentTypes.map(type => (
                        <span key={`${profile.id}:type:${type}`} style={{ ...mkP(true, C.ts, C.sa), cursor: "default" }}>{type}</span>
                      ))}
                      {profile.sources.map(source => (
                        <span key={`${profile.id}:source:${source}`} style={{ ...mkP(true, C.pr, C.pb), cursor: "default" }}>
                          {TALENT_SOURCE_LABELS[source] || source}
                        </span>
                      ))}
                    </div>
                    <div style={{ fontSize: 12, color: C.ts, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <span>{profile.primaryEmail || "No email yet"}</span>
                      {profile.instagramHandle && <span>Instagram @{profile.instagramHandle}</span>}
                      {profile.tiktokHandle && <span>TikTok @{profile.tiktokHandle}</span>}
                      {profile.spotifyUrl && <span>Spotify linked</span>}
                    </div>
                    {profile.recentActivity?.[0] && (
                      <div style={{ fontSize: 12, color: C.tt, lineHeight: 1.6 }}>
                        {profile.recentActivity[0].note || profile.recentActivity[0].action}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {defaultLiveMarketingProject && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          void launchWorkspaceProjectAction(
                            defaultLiveMarketingProject.id,
                            "show-marketing-item",
                            "No live campaign record is mapped in this workspace yet",
                            { profileId: profile.id }
                          );
                        }}
                        style={{ ...actionBtn(true, "good"), ...lockStyle(isReadOnly) }}
                      >
                        + Campaign
                      </button>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); openTalentProfileFromWorkspaceProfile(profile); }}
                      style={actionBtn(false, "accent")}
                    >
                      View Talent
                    </button>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(110px, 1fr))", gap: 10, marginBottom: 14 }}>
                  {[
                    ["Records", profile.projectSummaries.length, C.ac, C.al],
                    ["Campaigns", profile.campaigns.length, C.bu, C.bb],
                    ["Assignments", profile.marketingAssignments.length, C.pr, C.pb],
                    ["Owners", profile.owners.length || "—", C.ts, C.sa],
                  ].map(([label, value, tone, bg]) => (
                    <div key={`${profile.id}:${label}`} style={{ borderRadius: 12, border: `1px solid ${C.bd}`, background: bg, padding: "10px 12px" }}>
                      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: C.tt, marginBottom: 6 }}>{label}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: tone, lineHeight: 1 }}>{value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  {profile.projectSummaries.map(summary => (
                    <div key={`${profile.id}:project:${summary.projectId || summary.projectName}`} style={{ borderRadius: 14, border: `1px solid ${C.bd}`, background: C.sa, padding: "12px 14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <span style={{ fontSize: 14, fontWeight: 700 }}>{summary.projectName}</span>
                          <span style={{ ...mkP(true, summary.projectType === "marketing" ? C.pr : C.ac, summary.projectType === "marketing" ? C.pb : C.al), cursor: "default" }}>
                            {projectTypeLabel(summary.projectType)}
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          {summary.lastTouched && <span style={{ fontSize: 11, color: C.tt }}>Updated {rD(summary.lastTouched)}</span>}
                          <span style={{ ...mkP(true, C.tt, C.sf), cursor: "default" }}>Synced backup record</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {summary.owners.map(owner => (
                          <span key={`${summary.projectId}:owner:${owner}`} style={{ ...mkP(true, C.ts, C.sf), cursor: "default" }}>{owner}</span>
                        ))}
                        {summary.arStages.map(stage => (
                          <span key={`${summary.projectId}:stage:${stage}`} style={{ ...mkP(true, sc(stage, C), sb(stage, C)), cursor: "default" }}>{SM[stage]?.label || "Prospect"}</span>
                        ))}
                        {summary.marketingStatuses.map(status => {
                          const tone = marketingStatusTone(status, C);
                          return (
                            <span key={`${summary.projectId}:status:${status}`} style={{ ...mkP(true, tone.fg, tone.bg), borderColor: tone.border, cursor: "default" }}>
                              {MM[status]?.label || "Prospect"}
                            </span>
                          );
                        })}
                        {summary.campaigns.map(campaign => (
                          <span key={`${summary.projectId}:campaign:${campaign}`} style={{ ...mkP(true, C.bu, C.bb), cursor: "default" }}>{campaign}</span>
                        ))}
                        {!summary.owners.length && !summary.arStages.length && !summary.marketingStatuses.length && !summary.campaigns.length && (
                          <span style={{ ...mkP(true, C.ts, C.sf), cursor: "default" }}>No workflow metadata yet</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // ═══ HUB ═══
  if (screen === "hub") return (
    <div style={{ fontFamily: ft, background: C.bg, minHeight: "100vh", color: C.tx }}>
      <Toast /><style>{css}</style>
      <div style={{ borderBottom: `1px solid ${C.bd}`, background: C.sf }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 24px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <img src="/gemfinder-logo.png" alt="GEMFINDER logo" style={{ width: 44, height: 44, objectFit: "contain", marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 5, color: C.ac, textTransform: "uppercase", marginBottom: 4 }}>GEMFINDER</div>
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em" }}>Artist + Campaign Ops</div>
            <div style={{ fontSize: 13, color: C.ts, marginTop: 3 }}>Shared A&R and marketing workspaces, team coordination, and AI-assisted drafting.</div>
            {loading && <div style={{ fontSize: 11, color: C.tt, marginTop: 8 }}>Loading saved workspace...</div>}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: C.tt, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {authLabel}
            </span>
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, border: `1px solid ${C.bd}`, background: C.sa, color: C.ts, textTransform: "uppercase" }}>
              {roleLabel}
            </span>
            {isAdmin && (
              <a href="/ar/admin" style={{ ...actionBtn(false, "neutral"), textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                Admin
              </a>
            )}
            <button onClick={signOut} style={{ ...actionBtn(false, "neutral"), padding: "8px 10px" }}>
              Sign out
            </button>
            <DkBtn />
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px 40px" }}>
        {isReadOnly && (
          <div style={{ ...cS, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: C.ts }}>
            Viewer mode is active. You can review data but cannot make edits.
          </div>
        )}
        <div style={{ ...cS, marginBottom: 20, padding: "22px 24px", background: dark ? "linear-gradient(135deg, #111a2b 0%, #162238 100%)" : "linear-gradient(135deg, #ffffff 0%, #eef4ff 100%)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1.4fr) minmax(280px, 1fr)", gap: 18, alignItems: "stretch" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: C.ac, marginBottom: 8 }}>Workspace</div>
              <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.04em", marginBottom: 8 }}>Project Home</div>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: C.ts, maxWidth: 520 }}>
                Shared workspaces for A&R pipeline management, curator advocacy, paid and organic campaigns, and team visibility in one place.
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                <span style={{ ...mkP(true, C.ac, C.al) }}>{workspaceOverview.projects} projects</span>
                <span style={{ ...mkP(true, C.ts, C.sa) }}>{workspaceOverview.artists} artists</span>
                <span style={{ ...mkP(true, C.pr, C.pb) }}>{workspaceOverview.marketingItems} assignments</span>
                <span style={{ ...mkP(true, C.bu, C.bb) }}>{workspaceOverview.contacted} contacted</span>
                <span style={{ ...mkP(true, C.lv, C.lvb) }}>{workspaceOverview.live} live</span>
                <span style={{ ...mkP(true, C.lv, C.gb) }}>{liveCrmOverview.liveTalents} in Live Roster</span>
                <span style={{ ...mkP(true, C.gn, C.gb) }}>{workspaceOverview.marketingComplete} complete</span>
                <span style={{ ...mkP(true, C.ab, C.abb) }}>{workspaceOverview.due} due items</span>
                {gmailStatus.available && <span style={{ ...mkP(true, gmailStatus.connections?.length ? C.gn : C.tt, gmailStatus.connections?.length ? C.gb : C.sa) }}>{gmailStatus.connections?.length || 0} connected mailboxes</span>}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(120px, 1fr))", gap: 10 }}>
              {[
                ["Projects", workspaceOverview.projects, C.ac, C.al],
                ["Artists", workspaceOverview.artists, C.tx, C.sa],
                ["Contacted", workspaceOverview.contacted, C.bu, C.bb],
                ["Assignments", workspaceOverview.marketingItems, C.pr, C.pb],
                ["Live", workspaceOverview.live, C.lv, C.lvb],
                ["Complete", workspaceOverview.marketingComplete, C.gn, C.gb],
              ].map(([label, value, tone, bg]) => (
                <div key={label} style={{ borderRadius: 14, border: `1px solid ${C.bd}`, background: bg, padding: "14px 16px" }}>
                  <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: C.tt, marginBottom: 8 }}>{label}</div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: tone, lineHeight: 1 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Workspaces</div>
            <div style={{ fontSize: 12, color: C.tt }}>Use a workspace as the master shell for kickoff, live CRM, and reporting.</div>
          </div>
          <div style={{ fontSize: 11, color: C.tt }}>{workspaces.length} workspace{workspaces.length === 1 ? "" : "s"}</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 16, marginBottom: 26 }}>
          {workspaces.map((workspace, index) => (
            <div
              key={workspace.id}
              onClick={() => { void openWorkspace(workspace.id); }}
              style={{ ...cS, padding: "22px 24px", cursor: "pointer", transition: "all 0.2s", animation: `fu 0.3s ease ${index * 0.04}s both`, background: dark ? "linear-gradient(180deg, #111a2b 0%, #0f1729 100%)" : "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.ac; e.currentTarget.style.boxShadow = C.sm; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.bd; e.currentTarget.style.boxShadow = C.sw; }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: C.ac, marginBottom: 6 }}>Workspace</div>
                  <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 6 }}>{workspace.name}</div>
                  <div style={{ fontSize: 12, color: C.ts, lineHeight: 1.5 }}>
                    Kickoff and Live Roster both live here, while the older backup records stay synced quietly underneath.
                  </div>
                </div>
                {workspace.id === currentWorkspaceId && (
                  <span style={{ ...mkP(true, C.gn, C.gb), cursor: "default" }}>Current</span>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginBottom: 12 }}>
                {[
                  ["Underlying Records", workspace.projects.length, C.ac, C.al],
                  ["Kickoff", workspace.summary.kickoff, C.bu, C.bb],
                  ["Live", workspace.summary.live, C.lv, C.lvb],
                  ["Assignments", workspace.summary.assignments, C.pr, C.pb],
                ].map(([label, value, tone, bg]) => (
                  <div key={`${workspace.id}:${label}`} style={{ borderRadius: 12, border: `1px solid ${C.bd}`, background: bg, padding: "10px 12px" }}>
                    <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: C.tt, marginBottom: 6 }}>{label}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: tone, lineHeight: 1 }}>{value}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {workspace.roles.map(role => (
                  <span key={`${workspace.id}:${role}`} style={{ ...mkP(true, C.ts, C.sa), cursor: "default" }}>{workspaceRoleLabel(role)}</span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Legacy Project Records</div>
            <div style={{ fontSize: 12, color: C.tt }}>These stay available as backup while the workspace surfaces become the primary place we work.</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => setScreen("kickoff")} style={actionBtn(false, "neutral")}>
              Open Kickoff
            </button>
            <button onClick={() => setScreen("live-crm")} style={actionBtn(false, "accent")}>
              Open Live Roster
            </button>
            <div style={{ fontSize: 11, color: C.tt }}>{gmailStatus.currentUserConnected ? `Your Gmail: ${gmailStatus.currentUserGmail}` : "Your Gmail is not connected yet"}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16 }}>
          {projects.map((p, i) => {
            const projectTypeName = projectTypeLabel(p.type);
            const summary = summarizeProjectForHub(p, todayISO());
            const hubTone = tone => {
              switch (tone) {
                case "accent":
                  return [C.ac, C.al];
                case "good":
                  return [C.gn, C.gb];
                case "live":
                  return [C.lv, C.lvb];
                case "warn":
                  return [C.ab, C.abb];
                default:
                  return [C.tx, C.sa];
              }
            };
            const seqDue = normalizeProjectType(p.type) === "marketing"
              ? summarizeMarketingItems(p.marketingItems || [], todayISO()).overdue + summarizeMarketingItems(p.marketingItems || [], todayISO()).dueSoon
              : Object.values(p.sequenceState || {}).filter(ss => ss?.status === "active" && ss.nextDue && ss.nextDue <= todayISO()).length;
            return (
              <div key={p.id} onClick={() => { void openProjectWorkspace(p.id); }}
                style={{ ...cS, padding: "22px 24px", cursor: "pointer", transition: "all 0.2s", animation: `fu 0.3s ease ${i * 0.06}s both`, background: dark ? "linear-gradient(180deg, #111a2b 0%, #0f1729 100%)" : "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.ac; e.currentTarget.style.boxShadow = C.sm; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.bd; e.currentTarget.style.boxShadow = C.sw; }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{p.name}</div>
                    {p.desc && <div style={{ fontSize: 12, color: C.ts, lineHeight: 1.5 }}>{p.desc}</div>}
                  </div>
                  <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
                    <span style={{ ...mkP(true, projectTypeName === "Marketing" ? C.pr : C.ac, projectTypeName === "Marketing" ? C.pb : C.al), cursor: "default" }}>{projectTypeName}</span>
                    {seqDue > 0 && <span style={{ ...mkP(true, C.ab, C.abb), cursor: "default" }}>{seqDue} due</span>}
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginBottom: 12 }}>
                  {(summary.cards || []).map(([label, value, tone]) => {
                    const [toneColor, toneBg] = hubTone(tone);
                    return (
                    <div key={label} style={{ borderRadius: 12, border: `1px solid ${C.bd}`, background: toneBg, padding: "10px 12px" }}>
                      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: C.tt, marginBottom: 6 }}>{label}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: toneColor, lineHeight: 1 }}>{value}</div>
                    </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginTop: 10 }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 11, color: C.tt }}>Created {sD(p.created)}</span>
                    {!!summary.badges?.length && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {summary.badges.map((badge, index) => (
                          <span key={`${p.id}-badge-${index}`} style={{ ...mkP(true, C.tt, C.sa), fontSize: 10, cursor: "default" }}>
                            {badge}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={e => {
                    e.stopPropagation();
                    if (!requireEditor()) return;
                    if (confirm(`Delete "${p.name}"?`)) {
                      const u = projects.filter(pp => pp.id !== p.id);
                      setProjects(u);
                      if (apId === p.id) setApId(null);
                      persist(u, null);
                      flash("Deleted");
                    }
                  }} style={{ fontSize: 11, color: C.tt, background: "none", border: "none", cursor: "pointer", fontFamily: ft }}>✕</button>
                </div>
              </div>
            );
          })}
          <div onClick={() => { if (requireEditor()) setShowNew(true); }} style={{ background: dark ? "linear-gradient(180deg, #111a2b 0%, #17243b 100%)" : "linear-gradient(180deg, #f8fbff 0%, #eef4ff 100%)", border: `2px dashed ${C.bd}`, borderRadius: 18, padding: "22px 24px", cursor: canEdit ? "pointer" : "not-allowed", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 188, transition: "all 0.2s", ...lockStyle(isReadOnly) }}
            onMouseEnter={e => { if (!canEdit) return; e.currentTarget.style.borderColor = C.ac; e.currentTarget.style.background = C.al; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.bd; e.currentTarget.style.background = dark ? "linear-gradient(180deg, #111a2b 0%, #17243b 100%)" : "linear-gradient(180deg, #f8fbff 0%, #eef4ff 100%)"; }}>
            <div style={{ fontSize: 32, color: C.tt, marginBottom: 8 }}>+</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.tx, marginBottom: 4 }}>{canEdit ? "New Project" : "Read-only"}</div>
            <div style={{ fontSize: 12, color: C.tt, textAlign: "center", maxWidth: 220 }}>
              {canEdit ? "Create a dedicated workspace for a new roster, campaign, or genre push." : "View-only access is enabled for this workspace."}
            </div>
          </div>
        </div>

        {showNew && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={e => { if (e.target === e.currentTarget) setShowNew(false); }}>
            <div style={{ background: C.sf, borderRadius: 18, padding: "28px 32px", width: 420, boxShadow: "0 25px 70px rgba(0,0,0,0.2)" }}>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: C.tx }}>New Project</div>
              <input placeholder="Project name" value={npN} onChange={e => setNpN(e.target.value)} autoFocus style={{ ...iS, width: "100%", marginBottom: 10 }} />
              <input placeholder="Description (optional)" value={npD} onChange={e => setNpD(e.target.value)} style={{ ...iS, width: "100%", marginBottom: 10, fontSize: 12 }} />
              <label style={{ fontSize: 12, color: C.ts, display: "grid", gap: 4, marginBottom: 18 }}>
                <span>Project type</span>
                <select value={newProjectType} onChange={e => setNewProjectType(e.target.value)} style={{ ...iS, width: "100%" }}>
                  {PROJECT_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
                </select>
              </label>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={() => setShowNew(false)} style={{ padding: "8px 18px", borderRadius: 10, border: `1px solid ${C.bd}`, background: "transparent", cursor: "pointer", fontSize: 13, fontFamily: ft, color: C.ts }}>Cancel</button>
                <button onClick={() => { if (npN.trim()) createProj(npN.trim(), npD.trim(), newProjectType); }} style={{ padding: "8px 24px", borderRadius: 10, border: "none", background: C.ac, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: ft, opacity: npN.trim() ? 1 : 0.4 }}>Create</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ═══ DETAIL ═══
  if (screen === "detail" && selA) {
    const a = activeArtist || selA;
    const bucket = bucketGenre(a.g);
    const pri = pS(a);
    const pt = pT(pri, C);
    const stage = proj?.pipeline?.[a.n]?.stage || "prospect";
    const postSendUnlocked = isContactedStage(stage);
    const logs = (proj?.activityLog || {})[a.n] || [];

    const ss = proj?.sequenceState?.[a.n] || null;
    const seq = ss ? SEQ_MAP[ss.sequenceId] : null;
    const seqStep = seq?.steps?.[ss?.stepIndex] || null;
    const seqHistory = ss?.history || [];
    const lastSeqTouch = seqHistory[seqHistory.length - 1] || null;
    const remainingSeqSteps = seq ? seq.steps.slice(Math.max(ss?.stepIndex || 0, 0)) : [];
    const sendHistory = (proj?.sendLog || []).filter(s => s.artist === a.n).slice(-8).reverse();
    const connectedGmailAccounts = availableGmailConnections;
    const inboxThreads = (artistInbox.threads || []).slice().sort((x, y) => (y.lastMessageAt || "").localeCompare(x.lastMessageAt || ""));
    const artistInboxActionableCount = inboxThreads.filter(threadIsActionable).length;
    const selectedThread = inboxThreads.find((item) => item.threadKey === selectedThreadKey) || inboxThreads[0] || null;
    const selectedThreadMessages = selectedThread
      ? (artistInbox.messages || []).filter((item) => item.threadKey === selectedThread.threadKey).sort((x, y) => (x.sentAt || "").localeCompare(y.sentAt || ""))
      : [];
    const latestInboundMessage = [...selectedThreadMessages].reverse().find((item) => item.direction === "inbound") || null;
    const latestInboundThread = inboxThreads.find((item) => item.lastInboundAt) || null;
    const latestArtistInboundMessage = latestInboundThread
      ? [...(artistInbox.messages || [])]
        .filter((item) => item.threadKey === latestInboundThread.threadKey && item.direction === "inbound")
        .sort((x, y) => (y.sentAt || "").localeCompare(x.sentAt || ""))[0] || null
      : null;
    const intelSections = parseIntelSections(intel?.text || "");
    const selectedMailbox = connectedGmailAccounts.find(conn => conn.userId === gmailSendUserId)
      || connectedGmailAccounts.find(conn => conn.userId === authUserId)
      || connectedGmailAccounts[0]
      || null;
    const selectedMailboxReady = !!(selectedMailbox && connectedGmailAccounts.some(conn => conn.userId === selectedMailbox.userId));
    const latestReplyAt = latestArtistInboundMessage?.sentAt || latestInboundThread?.lastInboundAt || "";
    const latestReplyPreview = compactText(
      latestArtistInboundMessage?.bodyText || latestArtistInboundMessage?.snippet || latestInboundThread?.snippet || "",
      160,
    );
    const curatorPageUrl = String(a.curatorPageUrl || "").trim();
    const activeCuratedArtists = normalizeCuratedArtists(a.curatedArtists);
    const currentStageMeta = SM[stage] || SM.prospect;
    const currentOwner = proj?.assignments?.[a.n] || "Unassigned";
    const mailboxSummary = selectedMailbox
      ? `${selectedMailbox.workspaceEmail.split("@")[0]} · ${selectedMailbox.gmailEmail}`
      : gmailConnected
        ? (gmailConnectionMeta?.provider_email || gmailStatus.currentUserGmail)
        : "Not connected";
    const railStats = isCuratorProject
      ? [
        { label: "Stage", value: currentStageMeta.label, tone: sc(stage, C) },
        { label: "Owner", value: currentOwner, tone: C.tx },
        { label: "Curated Artists", value: activeCuratedArtists.length || "None yet", tone: activeCuratedArtists.length ? C.ac : C.ts },
        { label: "Curator Page", value: curatorPageUrl ? "Linked" : "Not added", tone: curatorPageUrl ? C.gn : C.ts },
      ]
      : [
        { label: "Stage", value: currentStageMeta.label, tone: sc(stage, C) },
        { label: "Owner", value: currentOwner, tone: C.tx },
        { label: "Next Follow-up", value: aFU ? sD(aFU) : "Not set", tone: aFU ? C.tx : C.ts },
        { label: "Latest Reply", value: latestReplyAt ? rD(latestReplyAt) : "No synced reply", tone: latestReplyAt ? C.tx : C.ts },
      ];
    const detailTabs = isCuratorProject
      ? [
        ["overview", "Overview"],
        ["activity", "Activity"],
      ]
      : [
        ["overview", "Overview"],
        ["outreach", "Outreach"],
        ["inbox", `Inbox${artistInboxActionableCount ? ` (${artistInboxActionableCount})` : ""}`],
        ["activity", "Activity"],
      ];

    const d = drafts[draftTab] || null;
    const savedTemplates = sanitizeSavedTemplates(proj?.settings?.savedTemplates || []);
    const activePlatform = d?.platform || draftPlatform || "";
    const compatibleTemplates = savedTemplates
      .filter(t => {
        if (!d) return true;
        const activeChannel = d.channel === "email" ? "email" : "dm";
        return t.channel === activeChannel;
      })
      .sort((a, b) => {
        const as = a.platform && a.platform === activePlatform ? 1 : 0;
        const bs = b.platform && b.platform === activePlatform ? 1 : 0;
        if (as !== bs) return bs - as;
        return (b.updatedAt || "").localeCompare(a.updatedAt || "");
      });
    const dStats = d?.variantId && (d.channel === "dm" || d.channel === "email")
      ? variantStats(proj?.abStats || {}, bucket, d.channel, d.variantId)
      : null;
    const guardrails = { ...DEFAULT_DRAFT_GUARDRAILS, ...(proj?.settings?.draftGuardrails || {}) };
    const quality = d ? evaluateDraftQuality(d, a, bucket, guardrails) : null;

    const gateDraftAction = (verb = "use this draft") => {
      if (!d || !guardrails.enabled || !quality || quality.pass) return true;
      const summary = quality.issues.join(" ");
      if (guardrails.strict) {
        flash(`Draft blocked: ${summary}`, "err");
        return false;
      }
      return window.confirm(`Draft quality warnings: ${summary}\nDo you want to ${verb} anyway?`);
    };

    const strengthenDraft = async () => {
      if (!d) return;
      const issues = quality?.issues?.length ? quality.issues.join("; ") : "Improve specificity and professional tone";
      const intelContext = intel?.ok ? `\nAI Intel:\n${intel.text}\n` : "";
      setImproveLoading(true);
      const res = await aiCall(`You are Greg from Songfinch.
Rewrite this outreach draft to be stronger and professional while keeping the core intent.

Artist: ${a.n}
Genre: ${a.g || "Unknown"} (${bucket})
Hit Track: ${a.h || "Unknown"}
Current draft:
${d.text}
${intelContext}
Fix these issues:
${issues}

Requirements:
- Keep this as a ${d.channel === "email" ? "professional email" : "professional DM"}
- Keep tone direct and respectful
- Include at least one clear CTA question
- Include artist-specific personalization
- Center value on direct fan-to-artist collaboration and monetizing top fans
- Avoid gift, occasion, wedding, birthday, or anniversary framing
- No em dash punctuation
- Avoid generic lines like "love your music"
- Use 150 to 230 words
- Return only the rewritten draft text, no explanation`, 1200, currentAiProvider, getStoredAiKey(currentAiProvider), taskModel("drafts"));
      setImproveLoading(false);
      if (!res.ok) { flash(res.text || "Draft improvement failed", "err"); return; }
      const nd = [...drafts];
      nd[draftTab] = { ...nd[draftTab], text: res.text.trim() };
      setDrafts(nd);
      flash("Draft strengthened");
    };

    return (
      <div style={{ fontFamily: ft, background: C.bg, minHeight: "100vh", color: C.tx }}>
        <Toast /><style>{css}</style>
        <div style={{ borderBottom: `1px solid ${C.bd}`, background: C.sf }}>
          <div style={{ maxWidth: 1180, margin: "0 auto", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button onClick={() => { setScreen("project"); setSelA(null); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, fontFamily: ft, color: C.ac, fontWeight: 600 }}>← Pipeline</button>
            <DkBtn />
          </div>
        </div>

        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "24px", animation: "fu 0.25s ease" }}>
          {isReadOnly && (
            <div style={{ ...cS, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: C.ts }}>
              Viewer mode is active. You can review drafts and analytics, but editing and stage changes are disabled.
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>{a.n}</span>
                <span style={{ ...mkP(true, pt.color, pt.bg), fontSize: 11 }}>{pt.label}</span>
                {a.onPlatform && <span style={{ ...mkP(true, C.pr, C.pb), fontSize: 11 }}>On Platform</span>}
              </div>
              <div style={{ display: "flex", gap: 12, fontSize: 12, color: C.ts, flexWrap: "wrap", alignItems: "center" }}>
                {a.g && <span>{a.g}</span>}
                {a.l && <span>🎧 {a.l}</span>}
                {a.loc && <span>📍 {a.loc}</span>}
                <a href={spotifyUrl(a.n)} target="_blank" rel="noopener" style={{ color: C.gn, textDecoration: "none", fontWeight: 600, fontSize: 11, padding: "2px 10px", background: C.gb, borderRadius: 12, border: `1px solid ${C.gd}` }}>🎵 Spotify</a>
                {a.soc && <a href={`https://instagram.com/${a.soc}`} target="_blank" rel="noopener" style={{ color: C.pr, textDecoration: "none", fontSize: 11, fontWeight: 600, padding: "2px 10px", background: C.pb, borderRadius: 12, border: `1px solid ${C.pbd}` }}>📷 @{a.soc}</a>}
                {isCuratorProject && curatorPageUrl && (
                  <a href={curatorPageUrl} target="_blank" rel="noopener" style={{ color: C.ac, textDecoration: "none", fontSize: 11, fontWeight: 600, padding: "2px 10px", background: C.al, borderRadius: 12, border: `1px solid ${C.ac}35` }}>
                    ↗ Curator Page
                  </a>
                )}
              </div>
              {a.h && <div style={{ fontSize: 12, color: C.ts, marginTop: 6 }}>🎵 {a.h}</div>}
              {!isCuratorProject && a.e && <div style={{ fontSize: 12, color: C.ts, marginTop: 3 }}>✉ {a.e}</div>}
              {isCuratorProject && activeCuratedArtists.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  {activeCuratedArtists.slice(0, 5).map(name => (
                    <span key={name} style={{ ...mkP(true, C.ac, C.al), cursor: "default", fontSize: 10, padding: "2px 8px" }}>{name}</span>
                  ))}
                  {activeCuratedArtists.length > 5 && (
                    <span style={{ fontSize: 11, color: C.tt }}>+{activeCuratedArtists.length - 5} more curated artists</span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
            {STAGES.map(s => (
              <button key={s.id} title={s.label} disabled={isReadOnly} onClick={() => setSt(a.n, s.id)} style={{ ...mkP(stage === s.id, sc(s.id, C), sb(s.id, C)), fontSize: 11, ...lockStyle(isReadOnly) }}>
                {s.icon} {s.label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: C.tt, marginTop: -10, marginBottom: 14 }}>
            Pipeline flow: Prospect → Draft Ready → Sent → Replied → Engaged → Won → Live or Dead.
          </div>

          <div className="gf-detail-shell">
            <div className="gf-detail-main">
              <div className="gf-detail-tabs">
                {detailTabs.map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setDetailTab(id)}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 10,
                      border: `1px solid ${detailTab === id ? C.ac : C.bd}`,
                      background: detailTab === id ? C.al : C.sf,
                      color: detailTab === id ? C.ac : C.ts,
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 600,
                      fontFamily: ft,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

          {!isCuratorProject && detailTab === "outreach" && <div style={{ ...cS, padding: "18px 22px", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>🧭 Follow-up Plan</div>
              {postSendUnlocked && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {!ss && (
                    <>
                      <select value={seqPick} disabled={isReadOnly} onChange={e => setSeqPick(e.target.value)} style={{ ...iS, padding: "6px 10px", fontSize: 12, ...lockStyle(isReadOnly) }}>
                        {SEQUENCES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      <button disabled={isReadOnly} onClick={() => enrollSeq(a, seqPick)} style={{ padding: "6px 12px", borderRadius: 9, border: `1.5px solid ${C.ac}`, background: C.al, color: C.ac, cursor: isReadOnly ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 600, fontFamily: ft, ...lockStyle(isReadOnly) }}>Start Plan</button>
                    </>
                  )}
                </div>
              )}
            </div>
            <div style={{ fontSize: 11, color: C.tt, marginBottom: 8 }}>
              Keep this simple. It is only a reminder plan for what to send next and when to send it.
            </div>

            {!postSendUnlocked && (
              <div style={{ fontSize: 12, color: C.ts }}>
                This unlocks after the first outreach is logged. Send the initial message first, then use this area to track the next touch.
              </div>
            )}

            {postSendUnlocked && !ss && (
              <div style={{ fontSize: 12, color: C.ts }}>
                No follow-up plan is running. Pick a plan if you want GEMFINDER to remind you when the next touch is due.
              </div>
            )}

            {postSendUnlocked && ss && (
              <div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                  <span style={{ ...mkP(true, ss.status === "active" ? C.gn : ss.status === "paused" ? C.ab : C.tt, ss.status === "active" ? C.gb : ss.status === "paused" ? C.abb : C.sa), fontSize: 10, padding: "2px 8px" }}>{ss.status.toUpperCase()}</span>
                  <span style={{ fontSize: 12, color: C.ts }}>{seq?.name}</span>
                  {seqStep && <span style={{ fontSize: 12, color: C.ts }}>Next touch: <strong style={{ color: C.tx }}>{seqStep.label}</strong> via {seqStep.channel.toUpperCase()}{ss.nextDue ? ` · due ${sD(ss.nextDue)}` : ""}</span>}
                  {!seqStep && <span style={{ fontSize: 12, color: C.ts }}>Plan complete</span>}
                </div>

                {lastSeqTouch && (
                  <div style={{ fontSize: 11, color: C.tt, marginBottom: 8 }}>
                    Last logged touch: {lastSeqTouch.label} on {sD(String(lastSeqTouch.sentAt || "").slice(0, 10))}.
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                  {ss.status === "active" && seqStep && <button disabled={isReadOnly} onClick={() => markSeqStepSent(a)} style={{ padding: "6px 12px", borderRadius: 9, border: `1.5px solid ${C.gn}`, background: C.gb, color: C.gn, cursor: isReadOnly ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 600, fontFamily: ft, ...lockStyle(isReadOnly) }}>Mark Touch Sent</button>}
                  {(ss.status === "active" || ss.status === "paused") && <button disabled={isReadOnly} onClick={() => toggleSeqPause(a)} style={{ padding: "6px 12px", borderRadius: 9, border: `1px solid ${C.bd}`, background: "transparent", color: C.ts, cursor: isReadOnly ? "not-allowed" : "pointer", fontSize: 11, fontFamily: ft, ...lockStyle(isReadOnly) }}>{ss.status === "active" ? "Pause Plan" : "Resume Plan"}</button>}
                  <button disabled={isReadOnly} onClick={() => resetSeq(a)} style={{ padding: "6px 12px", borderRadius: 9, border: `1px solid ${C.bd}`, background: "transparent", color: C.ts, cursor: isReadOnly ? "not-allowed" : "pointer", fontSize: 11, fontFamily: ft, ...lockStyle(isReadOnly) }}>Restart Plan</button>
                </div>

                <div style={{ fontSize: 11, color: C.ts, display: "grid", gap: 5 }}>
                  {(remainingSeqSteps || []).slice(0, 3).map((step, idx) => (
                    <div key={step.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span>{idx === 0 && ss.status !== "done" ? "→" : "•"}</span>
                      <span>{step.label} via {step.channel.toUpperCase()}</span>
                      {idx === 0 && ss.nextDue && ss.status !== "done" && <span style={{ color: C.tt }}>due {sD(ss.nextDue)}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>}

          {detailTab === "overview" && <div style={{ ...cS, padding: "20px 24px", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{isCuratorProject ? "Curator profile" : "Artist profile"}</div>
                <div style={{ fontSize: 11, color: C.tt }}>
                  {isCuratorProject
                    ? "Track the curator profile, their showcase page, and the artists they vouch for without touching email workflows."
                    : "Update the working profile here without losing notes, ownership, or pipeline history."}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={() => openTalentProfileFromArtist(a)}
                  style={{ padding: "6px 12px", borderRadius: 10, border: `1px solid ${C.bd}`, background: "transparent", color: C.ts, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: ft }}
                >
                  Open Talent Profile
                </button>
                <button
                  disabled={artistEditSaving}
                  onClick={() => seedArtistEditForm(a)}
                  style={{ padding: "6px 12px", borderRadius: 10, border: `1px solid ${C.bd}`, background: "transparent", color: C.ts, cursor: artistEditSaving ? "wait" : "pointer", fontSize: 11, fontWeight: 600, fontFamily: ft }}
                >
                  Reset
                </button>
                <button
                  disabled={artistEditSaving || isReadOnly}
                  onClick={() => saveArtistProfileEdits(a)}
                  style={{ padding: "6px 16px", borderRadius: 10, border: `1.5px solid ${C.ac}`, background: artistEditSaving ? C.sa : C.al, color: C.ac, cursor: artistEditSaving ? "wait" : isReadOnly ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 700, fontFamily: ft, ...lockStyle(artistEditSaving || isReadOnly) }}
                >
                  {artistEditSaving ? "Saving..." : "Save changes"}
                </button>
              </div>
            </div>
            <div className="gf-detail-profile-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: C.tt, marginBottom: 6 }}>Artist name</div>
                <input value={artistEditForm.name} readOnly={isReadOnly} onChange={e => setArtistEditForm(prev => ({ ...prev, name: e.target.value }))} style={{ ...iS, width: "100%", ...lockStyle(isReadOnly) }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: C.tt, marginBottom: 6 }}>Genre / vibe</div>
                <input value={artistEditForm.genre} readOnly={isReadOnly} onChange={e => setArtistEditForm(prev => ({ ...prev, genre: e.target.value }))} style={{ ...iS, width: "100%", ...lockStyle(isReadOnly) }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: C.tt, marginBottom: 6 }}>Monthly listeners</div>
                <input value={artistEditForm.listeners} readOnly={isReadOnly} onChange={e => setArtistEditForm(prev => ({ ...prev, listeners: e.target.value }))} style={{ ...iS, width: "100%", ...lockStyle(isReadOnly) }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: C.tt, marginBottom: 6 }}>Hit track</div>
                <input value={artistEditForm.hitTrack} readOnly={isReadOnly} onChange={e => setArtistEditForm(prev => ({ ...prev, hitTrack: e.target.value }))} style={{ ...iS, width: "100%", ...lockStyle(isReadOnly) }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: C.tt, marginBottom: 6 }}>Social handle</div>
                <input value={artistEditForm.social} readOnly={isReadOnly} onChange={e => setArtistEditForm(prev => ({ ...prev, social: e.target.value }))} style={{ ...iS, width: "100%", ...lockStyle(isReadOnly) }} />
              </div>
              {!isCuratorProject && (
                <div>
                  <div style={{ fontSize: 11, color: C.tt, marginBottom: 6 }}>Email</div>
                  <input value={artistEditForm.email} readOnly={isReadOnly} onChange={e => setArtistEditForm(prev => ({ ...prev, email: e.target.value }))} style={{ ...iS, width: "100%", ...lockStyle(isReadOnly) }} />
                </div>
              )}
              {isCuratorProject && (
                <div>
                  <div style={{ fontSize: 11, color: C.tt, marginBottom: 6 }}>Curator page link</div>
                  <input value={artistEditForm.curatorPageUrl} readOnly={isReadOnly} onChange={e => setArtistEditForm(prev => ({ ...prev, curatorPageUrl: e.target.value }))} placeholder="https://..." style={{ ...iS, width: "100%", ...lockStyle(isReadOnly) }} />
                </div>
              )}
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ fontSize: 11, color: C.tt, marginBottom: 6 }}>Location</div>
                <input value={artistEditForm.location} readOnly={isReadOnly} onChange={e => setArtistEditForm(prev => ({ ...prev, location: e.target.value }))} style={{ ...iS, width: "100%", ...lockStyle(isReadOnly) }} />
              </div>
              {isCuratorProject && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={{ fontSize: 11, color: C.tt, marginBottom: 8 }}>Curated artists they vouch for</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                    {artistEditForm.curatedArtists.map((value, index) => (
                      <input
                        key={`curated-${index}`}
                        value={value}
                        readOnly={isReadOnly}
                        onChange={e => setArtistEditForm(prev => {
                          const next = [...prev.curatedArtists];
                          next[index] = e.target.value;
                          return { ...prev, curatedArtists: next };
                        })}
                        placeholder={`Curated artist ${index + 1}`}
                        style={{ ...iS, width: "100%", ...lockStyle(isReadOnly) }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
            {artistEditForm.name.trim() && proj?.artists?.some(item => item.n !== a.n && canonicalArtistName(item.n) === canonicalArtistName(artistEditForm.name)) && (
              <div style={{ marginTop: 10, fontSize: 12, color: C.rd }}>Another artist in this project already uses that name.</div>
            )}
          </div>}

          {detailTab === "overview" && <div style={{ ...cS, padding: "20px 24px", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>🧠 AI Intel</div>
                <div style={{ fontSize: 11, color: C.tt }}>Model: {modelLabel(taskModel("intel"))} · {providerLabel(currentAiProvider)}</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {intel?.text && (
                  <button onClick={() => cp(intel.text, "intel_full")} style={{ padding: "6px 12px", borderRadius: 10, border: `1px solid ${C.bd}`, background: "transparent", color: C.ts, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: ft }}>
                    Copy Full Intel
                  </button>
                )}
                <button onClick={() => runIntel(a)} disabled={intelLoading || isReadOnly} style={{ padding: "6px 16px", borderRadius: 10, border: `1.5px solid ${C.ac}`, background: intelLoading ? C.sa : C.al, color: C.ac, cursor: intelLoading ? "wait" : isReadOnly ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600, fontFamily: ft, ...lockStyle(isReadOnly) }}>{intelLoading ? "Analyzing..." : intel ? "Re-analyze" : "Analyze Artist"}</button>
              </div>
            </div>
            {intelLoading && <div style={{ fontSize: 12, color: C.ts, padding: "12px 0" }}>Running AI analysis on {a.n}...</div>}
            {intelSections.length > 0 && (
              <div className="gf-detail-intel-grid">
                {intelSections.map((section, idx) => (
                  <div key={section.id} style={{ border: `1px solid ${C.bd}`, borderRadius: 14, background: idx === 0 ? C.al : C.sa, padding: "14px 14px 12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: idx === 0 ? C.ac : C.tt }}>{section.title}</div>
                      <button onClick={() => cp(section.body, `intel_${section.id}`)} style={{ padding: "4px 8px", borderRadius: 8, border: `1px solid ${C.bd}`, background: C.sf, color: C.ts, cursor: "pointer", fontSize: 10, fontFamily: ft }}>
                        Copy
                      </button>
                    </div>
                    <div style={{ fontSize: section.title === "Fit Score" ? 18 : 12, fontWeight: section.title === "Fit Score" ? 800 : 500, lineHeight: 1.7, color: C.tx, whiteSpace: "pre-wrap" }}>
                      {section.body || "No details yet."}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!intel && !intelLoading && (
              <div style={{ fontSize: 12, color: C.ts, paddingTop: 10 }}>
                {isCuratorProject
                  ? "Use AI Intel when you need fit analysis, curator positioning, and sharper talking points for who they should champion."
                  : "Use AI Intel when you need fit analysis and tailored talking points. Keep daily workflow in Outreach and Inbox."}
              </div>
            )}
          </div>}

          {!isCuratorProject && detailTab === "outreach" && <div style={{ ...cS, padding: "20px 24px", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>✉ Outreach Drafts</div>
                <div style={{ fontSize: 11, color: C.tt }}>Model: {modelLabel(taskModel("drafts"))} · {providerLabel(currentAiProvider)}</div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                <select value={draftPlatform} disabled={isReadOnly} onChange={e => changeDraftPlatform(a, e.target.value)} style={{ ...iS, padding: "5px 10px", fontSize: 11, ...lockStyle(isReadOnly) }}>
                  {DRAFT_PLATFORMS.map(pf => <option key={pf.id} value={pf.id}>Initial: {pf.label}</option>)}
                </select>
                {draftMode === "ai" ? (
                  <button disabled={isReadOnly} onClick={() => switchToTemplates(a)} style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${C.bd}`, background: "transparent", color: C.ts, cursor: isReadOnly ? "not-allowed" : "pointer", fontSize: 11, fontFamily: ft, ...lockStyle(isReadOnly) }}>Templates</button>
                ) : (
                  <button onClick={() => runAIDrafts(a)} disabled={aiDraftLoading || isReadOnly} style={{ padding: "5px 12px", borderRadius: 8, border: `1.5px solid ${C.pr}`, background: aiDraftLoading ? C.sa : C.pb, color: C.pr, cursor: aiDraftLoading ? "wait" : isReadOnly ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 600, fontFamily: ft, ...lockStyle(isReadOnly) }}>✨ {aiDraftLoading ? "Generating..." : "AI Personalize"}</button>
                )}
              </div>
            </div>

            {aiDraftLoading && <div style={{ fontSize: 12, color: C.ts, padding: "8px 0" }}>🔄 Writing personalized drafts{intel?.ok ? " using intel context" : ""}...</div>}

            <div style={{ display: "flex", gap: 4, marginBottom: 12, borderBottom: `1px solid ${C.bd}`, paddingBottom: 8 }}>
              {drafts.map((dd, i) => (
                <button key={dd.key} onClick={() => setDraftTab(i)} style={{ padding: "6px 14px", borderRadius: "8px 8px 0 0", border: "none", background: draftTab === i ? C.ac : "transparent", color: draftTab === i ? "#fff" : C.ts, cursor: "pointer", fontSize: 12, fontWeight: draftTab === i ? 600 : 400, fontFamily: ft, transition: "all 0.15s" }}>{dd.label}</button>
              ))}
            </div>

            {d && (
              <div>
                <div style={{ fontSize: 11, color: C.ts, marginBottom: 8 }}>{d.sub}</div>
                <textarea value={d.text} readOnly={isReadOnly} onChange={e => { const nd = [...drafts]; nd[draftTab] = { ...nd[draftTab], text: e.target.value }; setDrafts(nd); }} style={{ ...iS, width: "100%", minHeight: 200, lineHeight: 1.65, fontSize: 13, resize: "vertical", boxSizing: "border-box", ...lockStyle(isReadOnly) }} />
                {d.channel === "email" && !a.e && (
                  <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 12, border: `1px solid ${C.abd}`, background: C.abb, fontSize: 12, color: C.ts }}>
                    Add an artist email to send from GEMFINDER or open a compose link.
                  </div>
                )}
                {d.channel === "email" && a.e && !connectedGmailAccounts.length && (
                  <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 12, border: `1px solid ${C.abd}`, background: C.abb, fontSize: 12, color: C.ts, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <span>No Gmail mailbox is connected yet. Connect a mailbox before sending directly from GEMFINDER.</span>
                    <button onClick={connectGmail} disabled={gmailStatusLoading || isReadOnly} style={{ padding: "6px 12px", borderRadius: 9, border: `1px solid ${C.ac}`, background: C.al, color: C.ac, cursor: gmailStatusLoading || isReadOnly ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 600, fontFamily: ft, ...lockStyle(gmailStatusLoading || isReadOnly) }}>
                      Connect My Gmail
                    </button>
                  </div>
                )}

                <details style={{ marginTop: 10, border: `1px solid ${C.bd}`, borderRadius: 12, background: C.sa, padding: "10px 12px" }}>
                  <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 700, color: C.tx }}>Templates and saved copy ({compatibleTemplates.length})</summary>
                  <div style={{ fontSize: 11, color: C.ts, marginTop: 10, marginBottom: 8 }}>
                    Saved templates for {d.channel === "email" ? "Email" : "DM"} in this project.
                    Placeholders: {"{{artist_first_name}}"}, {"{{artist_name}}"}, {"{{hit_track}}"}, {"{{genre_bucket}}"}, {"{{monthly_listeners}}"}, {"{{location}}"}, {"{{social_handle}}"}, {"{{platform_label}}"}, {"{{spotify_url}}"}, {"{{today}}"}.
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                    <select
                      value={selectedTemplateId}
                      disabled={isReadOnly}
                      onChange={e => setSelectedTemplateId(e.target.value)}
                      style={{ ...iS, padding: "6px 10px", fontSize: 11, minWidth: 260, ...lockStyle(isReadOnly) }}
                    >
                      <option value="">Saved templates ({compatibleTemplates.length})</option>
                      {compatibleTemplates.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                          {t.platform ? ` · ${platformMeta(t.platform)?.label || t.platform}` : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      disabled={isReadOnly || !selectedTemplateId}
                      onClick={() => applySavedTemplateToDraft(a, d, selectedTemplateId)}
                      style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.ac}`, background: C.al, color: C.ac, cursor: isReadOnly || !selectedTemplateId ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 600, fontFamily: ft, ...lockStyle(isReadOnly || !selectedTemplateId) }}
                    >
                      Apply Template
                    </button>
                    <button
                      disabled={isReadOnly || !selectedTemplateId}
                      onClick={() => {
                        if (!selectedTemplateId) return;
                        if (!window.confirm("Delete this template?")) return;
                        deleteSavedTemplate(selectedTemplateId);
                      }}
                      style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.rbd}`, background: C.rb, color: C.rd, cursor: isReadOnly || !selectedTemplateId ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 600, fontFamily: ft, ...lockStyle(isReadOnly || !selectedTemplateId) }}
                    >
                      Delete
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <input
                      value={templateNameDraft}
                      disabled={isReadOnly}
                      onChange={e => setTemplateNameDraft(e.target.value)}
                      placeholder="Template name (example: Warm intro for indie)"
                      style={{ ...iS, padding: "6px 10px", fontSize: 11, minWidth: 320, flex: 1, ...lockStyle(isReadOnly) }}
                    />
                    <button
                      disabled={isReadOnly || !templateNameDraft.trim()}
                      onClick={() => saveCurrentDraftAsTemplate(a, d, templateNameDraft)}
                      style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.gd}`, background: C.gb, color: C.gn, cursor: isReadOnly || !templateNameDraft.trim() ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 600, fontFamily: ft, ...lockStyle(isReadOnly || !templateNameDraft.trim()) }}
                    >
                      Save As Template
                    </button>
                  </div>
                </details>
                {guardrails.enabled && quality && (
                  <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 10, border: `1px solid ${quality.pass ? C.gd : C.abd}`, background: quality.pass ? C.gb : C.abb, fontSize: 11 }}>
                    <div style={{ color: quality.pass ? C.gn : C.ab, fontWeight: 700, marginBottom: quality.issues.length ? 4 : 0 }}>
                      {quality.pass ? "Quality check passed" : "Quality check needs work"}
                      {` · score ${quality.score} · ${quality.words}/${quality.minWords}+ words`}
                    </div>
                    {!quality.pass && <div style={{ color: C.ts }}>{quality.issues.join(" ")}</div>}
                    {quality.hits.length > 0 && <div style={{ color: C.ts, marginTop: 3 }}>Personalization hits: {quality.hits.join(", ")}</div>}
                  </div>
                )}

                <div className="gf-detail-sticky-footer">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: C.ts }}>
                      {d.channel === "email"
                        ? (selectedMailboxReady ? `Mail from ${mailboxSummary}` : "Direct send is blocked until a connected Gmail mailbox is selected.")
                        : `Working in ${platformMeta(d.platform || draftPlatform)?.label || "DM"} mode.`}
                    </div>
                    {d.channel === "email" && (
                      <select value={gmailSendUserId} disabled={isReadOnly || !connectedGmailAccounts.length} onChange={e => setGmailSendUserId(e.target.value)} style={{ ...iS, padding: "6px 10px", fontSize: 11, minWidth: 220, ...lockStyle(isReadOnly || !connectedGmailAccounts.length) }}>
                        <option value="">Send as Gmail mailbox</option>
                        {connectedGmailAccounts.map((conn) => (
                          <option key={conn.userId} value={conn.userId}>
                            {conn.workspaceEmail.split("@")[0]} · {conn.gmailEmail}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button onClick={() => { if (!gateDraftAction("copy this draft")) return; cp(d.text, d.key); }} style={{ padding: "7px 20px", borderRadius: 10, border: "none", background: copied === d.key ? C.gn : C.ac, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: ft, transition: "all 0.2s" }}>{copied === d.key ? "Copied ✓" : "Copy"}</button>

                  {guardrails.enabled && !quality?.pass && (
                    <button onClick={strengthenDraft} disabled={improveLoading || isReadOnly} style={{ padding: "7px 12px", borderRadius: 10, border: `1px solid ${C.ab}`, background: C.abb, color: C.ab, cursor: improveLoading ? "wait" : isReadOnly ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 600, fontFamily: ft, ...lockStyle(isReadOnly) }}>
                      {improveLoading ? "Improving..." : "Strengthen Draft"}
                    </button>
                  )}

                  {d.channel === "email" && (
                    <>
                      <button onClick={() => { if (!gateDraftAction("send this draft")) return; sendDraftViaGmail(a, d); }} disabled={!a.e || !selectedMailboxReady || gmailSending || isReadOnly} style={{ padding: "7px 12px", borderRadius: 10, border: `1.5px solid ${C.gn}`, background: C.gb, color: C.gn, cursor: !a.e || !selectedMailboxReady || gmailSending || isReadOnly ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 600, fontFamily: ft, opacity: !a.e || !selectedMailboxReady || isReadOnly ? 0.45 : 1, ...lockStyle(!a.e || !selectedMailboxReady || gmailSending || isReadOnly) }}>
                        {gmailSending ? "Sending..." : "Send in GEMFINDER"}
                      </button>
                      <select value={sendProvider} disabled={isReadOnly} onChange={e => { const v = e.target.value; setSendProvider(v); saveSendPrefs(v, autoLogCompose); }} style={{ ...iS, padding: "6px 10px", fontSize: 11, ...lockStyle(isReadOnly) }}>
                        <option value="gmail">Gmail</option>
                        <option value="outlook">Outlook</option>
                      </select>
                      <label style={{ fontSize: 11, color: C.ts, display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <input type="checkbox" disabled={isReadOnly} checked={autoLogCompose} onChange={e => { const v = e.target.checked; setAutoLogCompose(v); saveSendPrefs(sendProvider, v); }} />
                        Auto-log on compose
                      </label>
                      <button onClick={() => { if (!gateDraftAction("send this draft")) return; openCompose(a, d, sendProvider); }} disabled={!a.e || isReadOnly} style={{ padding: "7px 12px", borderRadius: 10, border: `1.5px solid ${C.bu}`, background: C.bb, color: C.bu, cursor: a.e && !isReadOnly ? "pointer" : "not-allowed", fontSize: 11, fontWeight: 600, fontFamily: ft, opacity: a.e && !isReadOnly ? 1 : 0.45 }}>
                        Open in {sendProvider === "outlook" ? "Outlook" : "Gmail"}
                      </button>
                    </>
                  )}

                  <button disabled={isReadOnly} onClick={() => { if (!gateDraftAction("log this as sent")) return; trackSend(a, d, "manual"); }} style={{ padding: "7px 12px", borderRadius: 10, border: `1.5px solid ${C.gn}`, background: C.gb, color: C.gn, cursor: isReadOnly ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 600, fontFamily: ft, ...lockStyle(isReadOnly) }}>Log Sent + Advance</button>

                  {draftMode === "template" && <span style={{ fontSize: 11, color: C.tt }}>💡 Hit "AI Personalize" above for a custom version{intel?.ok ? " (uses intel)" : ""}</span>}
                  {draftMode === "ai" && <span style={{ fontSize: 11, color: C.pr }}>✨ AI generated. Edit freely.</span>}
                </div>
                </div>

                {dStats && (
                  <div style={{ fontSize: 11, color: C.ts, marginTop: 8 }}>
                    A/B stats for <strong>v{d.variantId}</strong> ({d.channel.toUpperCase()}): {dStats.sent} sent · {dStats.replied} replies · {dStats.rr}% reply rate
                  </div>
                )}
              </div>
            )}
          </div>}

          {!isCuratorProject && detailTab === "inbox" && (
            <div style={{ ...cS, padding: "20px 24px", marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>📬 Shared Gmail Inbox</div>
                  <div style={{ fontSize: 11, color: C.tt }}>
                    Connect one Gmail mailbox per team member. Synced threads stay visible here for the whole team.
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {!gmailConnected ? (
                    <button onClick={connectGmail} disabled={gmailStatusLoading || isReadOnly} style={{ padding: "6px 12px", borderRadius: 9, border: `1.5px solid ${C.ac}`, background: C.al, color: C.ac, cursor: gmailStatusLoading || isReadOnly ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 600, fontFamily: ft, ...lockStyle(gmailStatusLoading || isReadOnly) }}>
                      Connect My Gmail
                    </button>
                  ) : (
                    <button onClick={disconnectGmail} disabled={gmailStatusLoading || isReadOnly} style={{ padding: "6px 12px", borderRadius: 9, border: `1px solid ${C.rbd}`, background: C.rb, color: C.rd, cursor: gmailStatusLoading || isReadOnly ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 600, fontFamily: ft, ...lockStyle(gmailStatusLoading || isReadOnly) }}>
                      Disconnect My Gmail
                    </button>
                  )}
                  <button onClick={() => runGmailProfileCheck()} disabled={gmailProfileTesting || !gmailConnected || isReadOnly} style={{ padding: "6px 12px", borderRadius: 9, border: `1px solid ${C.bd}`, background: C.sf, color: C.ts, cursor: gmailProfileTesting || !gmailConnected || isReadOnly ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 600, fontFamily: ft, ...lockStyle(gmailProfileTesting || !gmailConnected || isReadOnly) }}>
                    {gmailProfileTesting ? "Checking..." : "Test Profile"}
                  </button>
                  <button onClick={runGmailListCheck} disabled={gmailListTesting || !gmailConnected || isReadOnly} style={{ padding: "6px 12px", borderRadius: 9, border: `1px solid ${C.bd}`, background: C.sf, color: C.ts, cursor: gmailListTesting || !gmailConnected || isReadOnly ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 600, fontFamily: ft, ...lockStyle(gmailListTesting || !gmailConnected || isReadOnly) }}>
                    {gmailListTesting ? "Testing API..." : "Test Gmail API"}
                  </button>
                  <button onClick={() => syncArtistInbox(a)} disabled={!a.e || syncingInbox || isReadOnly} style={{ padding: "6px 12px", borderRadius: 9, border: `1px solid ${C.bd}`, background: syncingInbox ? C.sa : C.sf, color: C.ts, cursor: !a.e || syncingInbox || isReadOnly ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 600, fontFamily: ft, ...lockStyle(!a.e || syncingInbox || isReadOnly) }}>
                    {syncingInbox ? "Syncing..." : "Sync Gmail"}
                  </button>
                </div>
              </div>

              {gmailBanner && (
                <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 12, border: `1px solid ${gmailBannerTone.border}`, background: gmailBannerTone.bg }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: gmailBannerTone.fg }}>{gmailBanner.message}</div>
                  {gmailBanner.details ? <div style={{ fontSize: 11, color: C.ts, marginTop: 4, lineHeight: 1.5 }}>{gmailBanner.details}</div> : null}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 12 }}>
                <div style={{ padding: "10px 12px", borderRadius: 12, border: `1px solid ${C.bd}`, background: C.sa }}>
                  <div style={{ fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: C.tt, marginBottom: 4 }}>Connected</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: gmailConnected ? C.gn : C.rd }}>{gmailConnected ? "Yes" : "No"}</div>
                </div>
                <div style={{ padding: "10px 12px", borderRadius: 12, border: `1px solid ${C.bd}`, background: C.sa }}>
                  <div style={{ fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: C.tt, marginBottom: 4 }}>Connected Gmail</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>{gmailConnectionMeta?.provider_email || "Not connected"}</div>
                </div>
                <div style={{ padding: "10px 12px", borderRadius: 12, border: `1px solid ${C.bd}`, background: C.sa }}>
                  <div style={{ fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: C.tt, marginBottom: 4 }}>Last Token Refresh</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>{fmtDateTime(gmailConnectionMeta?.last_refresh_at)}</div>
                </div>
                <div style={{ padding: "10px 12px", borderRadius: 12, border: `1px solid ${C.bd}`, background: C.sa }}>
                  <div style={{ fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: C.tt, marginBottom: 4 }}>Last Sync</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>{fmtDateTime(gmailConnectionMeta?.last_sync_at)}</div>
                </div>
              </div>

              <div style={{ fontSize: 11, color: C.tt, lineHeight: 1.5, marginBottom: 12 }}>
                {gmailConnected
                  ? `Scopes: ${(gmailConnectionMeta?.scopes || []).join(", ") || "none reported yet"}`
                  : "Use a songfinch.com Google account. This Gmail OAuth app is internal to Songfinch."}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                {connectedGmailAccounts.length ? connectedGmailAccounts.map((conn) => (
                  <span key={conn.userId} style={{ ...mkP(true, conn.userId === authUserId ? C.gn : C.ts, conn.userId === authUserId ? C.gb : C.sa), cursor: "default" }}>
                    {conn.workspaceEmail.split("@")[0]} · {conn.gmailEmail}
                  </span>
                )) : (
                  <span style={{ fontSize: 12, color: C.ts }}>No Gmail accounts connected yet.</span>
                )}
              </div>

              {!a.e ? (
                <div style={{ fontSize: 12, color: C.ts }}>Add an artist email to unlock Gmail sync and in-app sending.</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: selectedThread ? "280px 1fr" : "1fr", gap: 14 }}>
                  <div style={{ border: `1px solid ${C.bd}`, borderRadius: 12, background: C.sa, padding: 10, maxHeight: 520, overflowY: "auto" }}>
                    <div style={{ fontSize: 11, color: C.tt, marginBottom: 8 }}>Threads for {a.e}</div>
                    {inboxLoading ? (
                      <div style={{ fontSize: 12, color: C.ts }}>Loading inbox...</div>
                    ) : inboxThreads.length ? (
                      <div style={{ display: "grid", gap: 8 }}>
                        {inboxThreads.map((thread) => (
                          <button
                            key={thread.threadKey}
                            onClick={() => setSelectedThreadKey(thread.threadKey)}
                            style={{
                              textAlign: "left",
                              padding: "10px 12px",
                              borderRadius: 10,
                              border: `1px solid ${selectedThread?.threadKey === thread.threadKey ? C.ac : C.bd}`,
                              background: selectedThread?.threadKey === thread.threadKey ? C.al : C.sf,
                              cursor: "pointer",
                              fontFamily: ft,
                            }}
                          >
                            <div className="gf-thread-card-title">{thread.subject || "No subject"}</div>
                            <div style={{ fontSize: 11, color: C.ts, marginBottom: 4 }}>{thread.senderGmailEmail}</div>
                            <div className="gf-thread-card-snippet">{thread.snippet || "No preview yet."}</div>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                              <span style={{ fontSize: 10, color: C.tt }}>{rD(thread.lastMessageAt)}</span>
                              {threadIsActionable(thread) && <span style={{ ...mkP(true, C.rd, C.rb), cursor: "default", fontSize: 10, padding: "1px 8px" }}>Needs reply</span>}
                              {thread.internalNote && <span style={{ ...mkP(true, C.ab, C.abb), cursor: "default", fontSize: 10, padding: "1px 8px" }}>Team note</span>}
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: C.ts }}>No synced threads yet. Connect Gmail and sync, or send the first email from GEMFINDER.</div>
                    )}
                  </div>

                  {selectedThread && (
                    <div style={{ border: `1px solid ${C.bd}`, borderRadius: 12, background: C.sf, overflow: "hidden" }}>
                      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.bd}`, background: C.sa }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700 }}>{selectedThread.subject || "No subject"}</div>
                            <div style={{ fontSize: 11, color: C.tt, marginTop: 3 }}>
                              Mailbox: {selectedThread.senderGmailEmail} · {selectedThreadMessages.length} message{selectedThreadMessages.length === 1 ? "" : "s"}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <select
                              value={selectedThread.status || "open"}
                              disabled={threadWorkflowSaving || isReadOnly}
                              onChange={e => updateInboxThread(selectedThread.threadKey, { status: e.target.value })}
                              style={{ ...iS, padding: "6px 10px", fontSize: 11, minWidth: 120, ...lockStyle(threadWorkflowSaving || isReadOnly) }}
                            >
                              <option value="open">Open</option>
                              <option value="waiting">Waiting</option>
                              <option value="closed">Closed</option>
                            </select>
                            <button
                              onClick={() => updateInboxThread(selectedThread.threadKey, { status: "closed" })}
                              disabled={threadWorkflowSaving || isReadOnly || selectedThread.status === "closed"}
                              style={{ padding: "6px 10px", borderRadius: 9, border: `1px solid ${C.bd}`, background: C.sf, color: C.ts, cursor: threadWorkflowSaving || isReadOnly || selectedThread.status === "closed" ? "not-allowed" : "pointer", fontSize: 11, fontFamily: ft, ...lockStyle(threadWorkflowSaving || isReadOnly || selectedThread.status === "closed") }}
                            >
                              Mark Done
                            </button>
                            <button
                              onClick={() => deleteInboxThreads(selectedThread.threadKey, `the synced thread for ${a.n}`)}
                              disabled={threadWorkflowSaving || isReadOnly}
                              style={{ padding: "6px 10px", borderRadius: 9, border: `1px solid ${C.rbd}`, background: C.rb, color: C.rd, cursor: threadWorkflowSaving || isReadOnly ? "not-allowed" : "pointer", fontSize: 11, fontFamily: ft, ...lockStyle(threadWorkflowSaving || isReadOnly) }}
                            >
                              Delete Thread
                            </button>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                          <span style={{ ...mkP(true, threadIsActionable(selectedThread) ? C.rd : C.ts, threadIsActionable(selectedThread) ? C.rb : C.sa), cursor: "default", fontSize: 10, padding: "2px 8px" }}>
                            {threadIsActionable(selectedThread) ? "Needs reply" : "No reply needed"}
                          </span>
                          <span style={{ ...mkP(true, C.ts, C.sa), cursor: "default", fontSize: 10, padding: "2px 8px" }}>
                            Inbox badge counts open threads that still need a reply
                          </span>
                        </div>
                      </div>

                      <div style={{ padding: 16, borderBottom: `1px solid ${C.bd}`, background: C.abb }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: C.ab }}>Internal team note</div>
                          <button
                            onClick={() => updateInboxThread(selectedThread.threadKey, { internalNote: artistThreadNoteDraft })}
                            disabled={threadWorkflowSaving || isReadOnly || artistThreadNoteDraft === String(selectedThread.internalNote || "")}
                            style={{ padding: "6px 10px", borderRadius: 9, border: `1px solid ${C.abd}`, background: "#fff8cc", color: C.ab, cursor: threadWorkflowSaving || isReadOnly || artistThreadNoteDraft === String(selectedThread.internalNote || "") ? "not-allowed" : "pointer", fontSize: 11, fontFamily: ft, ...lockStyle(threadWorkflowSaving || isReadOnly || artistThreadNoteDraft === String(selectedThread.internalNote || "")) }}
                          >
                            Save note
                          </button>
                        </div>
                        <div style={{ fontSize: 11, color: C.ts, marginBottom: 8 }}>Yellow note only for GEMFINDER. This never sends to the contact.</div>
                        <textarea
                          value={artistThreadNoteDraft}
                          readOnly={isReadOnly}
                          onChange={e => setArtistThreadNoteDraft(e.target.value)}
                          placeholder="Leave an internal note for the team..."
                          style={{ ...iS, width: "100%", minHeight: 78, resize: "vertical", fontSize: 12, background: "#fff8cc", borderColor: C.abd, ...lockStyle(isReadOnly) }}
                        />
                        {selectedThread.internalNoteUpdatedAt && (
                          <div style={{ fontSize: 10, color: C.tt, marginTop: 6 }}>
                            Updated {rD(selectedThread.internalNoteUpdatedAt)}{selectedThread.internalNoteUpdatedBy ? ` by ${selectedThread.internalNoteUpdatedBy}` : ""}
                          </div>
                        )}
                      </div>

                      <div style={{ maxHeight: 320, overflowY: "auto", padding: 16, display: "grid", gap: 10 }}>
                        {selectedThreadMessages.map((message) => (
                          <div key={message.messageKey} style={{ border: `1px solid ${message.direction === "inbound" ? C.bd : C.gd}`, borderRadius: 12, padding: "10px 12px", background: message.direction === "inbound" ? C.sa : C.gb }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: C.tx }}>
                                {message.direction === "inbound" ? "Artist reply" : "Team send"} · {message.senderEmail || message.senderGmailEmail}
                              </div>
                              <div style={{ fontSize: 10, color: C.tt }}>{new Date(message.sentAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
                            </div>
                            <div style={{ fontSize: 12, color: C.ts, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                              {message.bodyText || message.snippet || "No message body"}
                            </div>
                            {message.direction === "inbound" && (
                              <div style={{ marginTop: 8 }}>
                                <button onClick={() => setReplyInput(message.bodyText || message.snippet || "")} style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${C.ac}`, background: C.al, color: C.ac, cursor: "pointer", fontSize: 11, fontFamily: ft }}>
                                  Use as AI Context
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      <div style={{ padding: 16, borderTop: `1px solid ${C.bd}`, background: C.sa }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                          <span style={{ fontSize: 11, color: C.ts }}>Send as</span>
                          <select value={gmailSendUserId} disabled={isReadOnly || !connectedGmailAccounts.length} onChange={e => setGmailSendUserId(e.target.value)} style={{ ...iS, padding: "6px 10px", fontSize: 11, minWidth: 220, ...lockStyle(isReadOnly || !connectedGmailAccounts.length) }}>
                            <option value="">Select mailbox</option>
                            {connectedGmailAccounts.map((conn) => (
                              <option key={conn.userId} value={conn.userId}>
                                {conn.workspaceEmail.split("@")[0]} · {conn.gmailEmail}
                              </option>
                          ))}
                          </select>
                          {latestInboundMessage && <span style={{ fontSize: 11, color: C.tt }}>Latest inbound: {rD(latestInboundMessage.sentAt)}</span>}
                          <button onClick={() => syncArtistInbox(a, selectedThread.senderUserId)} disabled={syncingInbox || isReadOnly} style={{ padding: "6px 10px", borderRadius: 9, border: `1px solid ${C.bd}`, background: C.sf, color: C.ts, cursor: syncingInbox || isReadOnly ? "not-allowed" : "pointer", fontSize: 11, fontFamily: ft, ...lockStyle(syncingInbox || isReadOnly) }}>
                            {syncingInbox ? "Syncing..." : "Sync This Artist"}
                          </button>
                        </div>
                        {!selectedMailboxReady && (
                          <div style={{ marginBottom: 8, padding: "8px 10px", borderRadius: 10, border: `1px solid ${C.abd}`, background: C.abb, fontSize: 11, color: C.ts }}>
                            Select a connected Gmail mailbox before sending a reply. If none are connected, use Connect My Gmail above.
                          </div>
                        )}
                        <textarea value={gmailReplyDraft} readOnly={isReadOnly} onChange={e => setGmailReplyDraft(e.target.value)} placeholder="Write a Gmail reply here. The team will see the thread after send." style={{ ...iS, width: "100%", minHeight: 120, resize: "vertical", fontSize: 12, ...lockStyle(isReadOnly) }} />
                        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                          <button onClick={() => sendInboxReply(a)} disabled={gmailSending || !selectedMailboxReady || isReadOnly} style={{ padding: "7px 14px", borderRadius: 10, border: "none", background: gmailSending ? C.bl : C.ac, color: "#fff", cursor: gmailSending || !selectedMailboxReady || isReadOnly ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600, fontFamily: ft, ...lockStyle(gmailSending || !selectedMailboxReady || isReadOnly) }}>
                            {gmailSending ? "Sending..." : "Send Reply"}
                          </button>
                          <button onClick={() => latestInboundMessage && setReplyInput(latestInboundMessage.bodyText || latestInboundMessage.snippet || "")} disabled={!latestInboundMessage} style={{ padding: "7px 12px", borderRadius: 10, border: `1px solid ${C.bd}`, background: "transparent", color: C.ts, cursor: latestInboundMessage ? "pointer" : "not-allowed", fontSize: 11, fontFamily: ft, opacity: latestInboundMessage ? 1 : 0.55 }}>
                            Use Latest Inbound
                          </button>
                          <button onClick={() => runReplyClassifier(a, latestInboundMessage?.bodyText || latestInboundMessage?.snippet || "")} disabled={!postSendUnlocked || replyLoading || isReadOnly} style={{ padding: "7px 12px", borderRadius: 10, border: `1px solid ${C.ac}`, background: C.al, color: C.ac, cursor: !postSendUnlocked || replyLoading || isReadOnly ? "not-allowed" : "pointer", fontSize: 11, fontFamily: ft, opacity: !postSendUnlocked ? 0.55 : 1, ...lockStyle(!postSendUnlocked || replyLoading || isReadOnly) }}>
                            {replyLoading ? "Analyzing..." : "Analyze Reply"}
                          </button>
                          <button onClick={() => runFollowUpWriter(a, latestInboundMessage?.bodyText || latestInboundMessage?.snippet || "")} disabled={!postSendUnlocked || followUpLoading || isReadOnly} style={{ padding: "7px 12px", borderRadius: 10, border: `1px solid ${C.pr}`, background: C.pb, color: C.pr, cursor: !postSendUnlocked || followUpLoading || isReadOnly ? "not-allowed" : "pointer", fontSize: 11, fontFamily: ft, opacity: !postSendUnlocked ? 0.55 : 1, ...lockStyle(!postSendUnlocked || followUpLoading || isReadOnly) }}>
                            {followUpLoading ? "Generating..." : "AI Follow-up"}
                          </button>
                          {replyResult?.draftResponse && (
                            <button onClick={() => setGmailReplyDraft(replyResult.draftResponse)} style={{ padding: "7px 12px", borderRadius: 10, border: `1px solid ${C.pr}`, background: C.pb, color: C.pr, cursor: "pointer", fontSize: 11, fontFamily: ft }}>
                              Load AI Reply Draft
                            </button>
                          )}
                          {followUpDraft && (
                            <button onClick={() => setGmailReplyDraft(followUpDraft)} style={{ padding: "7px 12px", borderRadius: 10, border: `1px solid ${C.abd}`, background: C.abb, color: C.ab, cursor: "pointer", fontSize: 11, fontFamily: ft }}>
                              Load AI Follow-up
                            </button>
                          )}
                        </div>
                        {replyResult && (
                          <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.bd}`, background: C.sf }}>
                            <div style={{ fontSize: 11, color: C.ts }}>
                              <strong style={{ color: C.tx }}>Intent:</strong> {replyResult.intent || "unknown"} · <strong style={{ color: C.tx }}>Sentiment:</strong> {replyResult.sentiment || "unknown"} · <strong style={{ color: C.tx }}>Urgency:</strong> {replyResult.urgency || "unknown"}
                            </div>
                            <div style={{ marginTop: 4, fontSize: 11, color: C.ts }}>
                              <strong style={{ color: C.tx }}>Recommended:</strong> {replyResult.nextAction || "No recommendation"}
                            </div>
                            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                              {replyResult.nextStage && SM[replyResult.nextStage] && (
                                <button disabled={isReadOnly} onClick={() => applyReplySuggestedStage(a)} style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${C.bd}`, background: "transparent", color: C.ts, cursor: isReadOnly ? "not-allowed" : "pointer", fontSize: 11, fontFamily: ft, ...lockStyle(isReadOnly) }}>
                                  Apply Stage: {SM[replyResult.nextStage].label}
                                </button>
                              )}
                              {replyResult.draftResponse && (
                                <button onClick={() => cp(replyResult.draftResponse, "reply_response")} style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${C.bd}`, background: "transparent", color: C.ts, cursor: "pointer", fontSize: 11, fontFamily: ft }}>
                                  Copy AI Reply
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                        {followUpDraft && (
                          <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.abd}`, background: C.abb }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: C.ab, marginBottom: 4 }}>AI follow-up draft</div>
                            <div style={{ fontSize: 12, color: C.ts, whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{compactText(followUpDraft, 340)}</div>
                            <div style={{ marginTop: 8 }}>
                              <button onClick={() => cp(followUpDraft, "followup")} style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${C.abd}`, background: "transparent", color: C.ab, cursor: "pointer", fontSize: 11, fontFamily: ft }}>
                                Copy Follow-up
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {detailTab === "activity" && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div style={{ ...cS, padding: "16px 20px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>📝 Notes</div>
              <textarea value={aNote} readOnly={isReadOnly} onChange={e => setANote(e.target.value)} onBlur={() => { if (!isReadOnly) saveN(a.n, aNote); }} placeholder="Add notes..." style={{ ...iS, width: "100%", minHeight: 80, fontSize: 12, resize: "vertical", boxSizing: "border-box", ...lockStyle(isReadOnly) }} />
            </div>
            <div style={{ ...cS, padding: "16px 20px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>📅 Follow-Up</div>
              <input type="date" value={aFU} disabled={isReadOnly} onChange={e => { setAFU(e.target.value); saveFU(a.n, e.target.value); }} style={{ ...iS, width: "100%", boxSizing: "border-box", ...lockStyle(isReadOnly) }} />
              {aFU && !isReadOnly && <button onClick={() => { setAFU(""); saveFU(a.n, ""); }} style={{ fontSize: 11, color: C.rd, background: "none", border: "none", cursor: "pointer", marginTop: 6, fontFamily: ft }}>Clear follow-up</button>}
            </div>
          </div>}

          {!isCuratorProject && detailTab === "activity" && <div style={{ ...cS, padding: "16px 20px", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>📨 Send Log ({sendHistory.length})</div>
            {sendHistory.length ? (
              <div style={{ display: "grid", gap: 6 }}>
                {sendHistory.map(s => (
                  <div key={s.id} style={{ fontSize: 11, color: C.ts, padding: "6px 8px", borderRadius: 8, background: C.sa, border: `1px solid ${C.bd}` }}>
                    <span style={{ color: C.tt, fontFamily: mn }}>{new Date(s.sentAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                    {` · ${s.provider} · ${s.channel.toUpperCase()}${s.variantId ? ` · v${s.variantId}` : ""}`}
                    {s.sequenceStep ? ` · ${s.sequenceStep}` : ""}
                    {s.actor ? ` · by ${s.actor}` : ""}
                  </div>
                ))}
              </div>
            ) : <div style={{ fontSize: 12, color: C.tt }}>No sends logged yet.</div>}
          </div>}

          {detailTab === "activity" && <div style={{ ...cS, padding: "16px 20px" }}>
            <button onClick={() => setShowLog(!showLog)} style={{ fontSize: 13, fontWeight: 700, background: "none", border: "none", cursor: "pointer", color: C.tx, fontFamily: ft, width: "100%", textAlign: "left", padding: 0 }}>📋 Activity Log ({logs.length}) {showLog ? "▾" : "▸"}</button>
            {showLog && (
              <>
                <div style={{ marginTop: 10, marginBottom: 10, display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <textarea
                    value={logNoteDraft}
                    readOnly={isReadOnly}
                    onChange={e => setLogNoteDraft(e.target.value)}
                    placeholder="Add activity note..."
                    style={{ ...iS, flex: 1, minHeight: 62, fontSize: 12, resize: "vertical", ...lockStyle(isReadOnly) }}
                  />
                  <button
                    onClick={() => addActivityNote(a.n)}
                    disabled={!logNoteDraft.trim() || isReadOnly}
                    style={{
                      padding: "7px 12px",
                      borderRadius: 8,
                      border: `1.5px solid ${C.ac}`,
                      background: logNoteDraft.trim() && !isReadOnly ? C.al : C.sa,
                      color: C.ac,
                      cursor: logNoteDraft.trim() && !isReadOnly ? "pointer" : "not-allowed",
                      fontSize: 11,
                      fontWeight: 600,
                      fontFamily: ft,
                      opacity: logNoteDraft.trim() && !isReadOnly ? 1 : 0.55,
                    }}
                  >
                    Add Note
                  </button>
                </div>

                {logs.length > 0 ? (
                  <div style={{ marginTop: 10, maxHeight: 280, overflowY: "auto" }}>
                    {[...logs].reverse().map((l, i) => {
                      const isNote = l.kind === "note";
                      const isEditing = isNote && !!l.id && editLogNoteId === l.id;
                      const ts = new Date(l.time).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
                      return (
                        <div key={l.id || `${l.time}_${i}`} style={{ fontSize: 11, color: C.ts, padding: "8px 0", borderBottom: i < logs.length - 1 ? `1px solid ${C.sa}` : "none" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                            <span style={{ color: C.tt, fontFamily: mn }}>{ts}</span>
                            {(l.actor || l.author) ? <span style={{ fontSize: 10, color: C.tt }}>by {l.actor || l.author}</span> : null}
                          </div>

                          {isNote ? (
                            isEditing ? (
                              <div style={{ marginTop: 6 }}>
                                <textarea
                                  value={editLogNoteText}
                                  readOnly={isReadOnly}
                                  onChange={e => setEditLogNoteText(e.target.value)}
                                  style={{ ...iS, width: "100%", minHeight: 64, fontSize: 12, resize: "vertical", ...lockStyle(isReadOnly) }}
                                />
                                <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                                  <button disabled={isReadOnly} onClick={() => saveActivityNoteEdit(a.n)} style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${C.gd}`, background: C.gb, color: C.gn, cursor: isReadOnly ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 600, fontFamily: ft, ...lockStyle(isReadOnly) }}>Save</button>
                                  <button onClick={cancelEditActivityNote} style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${C.bd}`, background: "transparent", color: C.ts, cursor: "pointer", fontSize: 11, fontFamily: ft }}>Cancel</button>
                                </div>
                              </div>
                            ) : (
                              <div style={{ marginTop: 6 }}>
                                <div style={{ fontSize: 12, color: C.tx, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{l.note || ""}</div>
                                {l.editedAt ? <div style={{ marginTop: 4, fontSize: 10, color: C.tt }}>edited {new Date(l.editedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}{l.editedBy ? ` by ${l.editedBy}` : ""}</div> : null}
                                {l.id && !isReadOnly ? (
                                  <button onClick={() => startEditActivityNote(l)} style={{ marginTop: 5, padding: "4px 8px", borderRadius: 7, border: `1px solid ${C.bd}`, background: "transparent", color: C.ts, cursor: "pointer", fontSize: 10, fontFamily: ft }}>
                                    Edit Note
                                  </button>
                                ) : null}
                              </div>
                            )
                          ) : (
                            <div style={{ marginTop: 4 }}>{l.action || "Activity updated"}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: C.tt, marginTop: 8 }}>No activity yet.</div>
                )}
              </>
            )}
          </div>}
            </div>

            <aside className="gf-detail-rail">
              <div className="gf-detail-rail-sticky">
                <div style={{ ...cS, padding: "16px 18px" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{isCuratorProject ? "Curator Summary" : "Artist Summary"}</div>
                  <div style={{ display: "grid", gap: 12 }}>
                    {railStats.map((item) => (
                      <div key={item.label} className="gf-rail-kv">
                        <div className="gf-rail-kv-label">{item.label}</div>
                        <div className="gf-rail-kv-value" style={{ color: item.tone }}>{item.value}</div>
                      </div>
                    ))}
                    {!isCuratorProject && (
                      <>
                        <div className="gf-rail-kv">
                          <div className="gf-rail-kv-label">Mailbox</div>
                          <div className="gf-rail-kv-value">{mailboxSummary}</div>
                          <div style={{ fontSize: 11, color: C.tt }}>
                            {gmailConnected
                              ? `Current user connected as ${gmailConnectionMeta?.provider_email || gmailStatus.currentUserGmail}`
                              : "Current user is not connected yet"}
                          </div>
                        </div>
                        <div className="gf-rail-kv">
                          <div className="gf-rail-kv-label">Shared Inbox</div>
                          <div className="gf-rail-kv-value">{inboxThreads.length} thread{inboxThreads.length === 1 ? "" : "s"}</div>
                        </div>
                      </>
                    )}
                    {isCuratorProject && curatorPageUrl && (
                      <a href={curatorPageUrl} target="_blank" rel="noopener" style={{ ...actionBtn(true, "accent"), textDecoration: "none", justifyContent: "center" }}>
                        Open Curator Page
                      </a>
                    )}
                    {isCuratorProject && activeCuratedArtists.length > 0 && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {activeCuratedArtists.map(name => (
                          <span key={name} style={{ ...mkP(true, C.ac, C.al), cursor: "default", fontSize: 10, padding: "2px 8px" }}>{name}</span>
                        ))}
                      </div>
                    )}
                    {a.onPlatform && (
                      <div style={{ ...mkP(true, C.pr, C.pb), cursor: "default", width: "fit-content" }}>
                        Already on platform
                      </div>
                    )}
                  </div>
                  <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
                    <select value={proj?.assignments?.[a.n] || ""} disabled={isReadOnly} onChange={e => assignOwner(a.n, e.target.value)} style={{ ...iS, padding: "7px 10px", fontSize: 12, ...lockStyle(isReadOnly) }}>
                      <option value="">Owner: Unassigned</option>
                      {(proj?.teamUsers || []).map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <button onClick={() => exportBrief(a)} style={{ ...actionBtn(false, "neutral"), width: "100%" }}>Export Brief</button>
                  </div>
                </div>

                {!isCuratorProject && <div style={{ ...cS, padding: "16px 18px" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Mailboxes</div>
                  <div style={{ fontSize: 11, color: C.ts, lineHeight: 1.6, marginBottom: 12 }}>
                    This is where to verify direct Gmail sending. If a mailbox is connected here, GEMFINDER can send from it in Outreach and Inbox.
                  </div>
                  <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
                    <div className="gf-rail-kv">
                      <div className="gf-rail-kv-label">Connected</div>
                      <div className="gf-rail-kv-value" style={{ color: gmailConnected ? C.gn : C.rd }}>{gmailConnected ? "Yes" : "No"}</div>
                    </div>
                    <div className="gf-rail-kv">
                      <div className="gf-rail-kv-label">Connected Gmail</div>
                      <div className="gf-rail-kv-value">{gmailConnectionMeta?.provider_email || "Not connected"}</div>
                    </div>
                    <div className="gf-rail-kv">
                      <div className="gf-rail-kv-label">Last Token Refresh</div>
                      <div className="gf-rail-kv-value">{fmtDateTime(gmailConnectionMeta?.last_refresh_at)}</div>
                    </div>
                    <div className="gf-rail-kv">
                      <div className="gf-rail-kv-label">Last Sync</div>
                      <div className="gf-rail-kv-value">{fmtDateTime(gmailConnectionMeta?.last_sync_at)}</div>
                    </div>
                  </div>
                  {gmailConnectionMeta?.last_error ? (
                    <div style={{ marginBottom: 12, padding: "9px 10px", borderRadius: 10, border: `1px solid ${C.rbd}`, background: C.rb, color: C.rd, fontSize: 11, lineHeight: 1.5 }}>
                      {gmailConnectionMeta.last_error}
                    </div>
                  ) : null}
                  {connectedGmailAccounts.length ? (
                    <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
                      {connectedGmailAccounts.map((conn) => (
                        <div key={conn.userId} style={{ padding: "8px 10px", borderRadius: 10, border: `1px solid ${selectedMailbox?.userId === conn.userId ? `${C.ac}40` : C.bd}`, background: selectedMailbox?.userId === conn.userId ? C.al : C.sa }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: C.tx }}>{conn.workspaceEmail.split("@")[0]}</div>
                          <div style={{ fontSize: 11, color: C.ts, marginTop: 2 }}>{conn.providerEmail || conn.gmailEmail}</div>
                          <div style={{ fontSize: 10, color: C.tt, marginTop: 4 }}>
                            Refresh {fmtDateTime(conn.lastRefreshAt)} · Sync {fmtDateTime(conn.lastSyncAt)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.abd}`, background: C.abb, color: C.ts, fontSize: 12, marginBottom: 12 }}>
                      No Gmail mailbox is connected yet.
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {!gmailConnected ? (
                      <button onClick={connectGmail} disabled={gmailStatusLoading || isReadOnly} style={{ ...actionBtn(true, "accent"), ...lockStyle(gmailStatusLoading || isReadOnly) }}>
                        {gmailStatusLoading ? "Checking..." : "Connect My Gmail"}
                      </button>
                    ) : (
                      <button onClick={disconnectGmail} disabled={gmailStatusLoading || isReadOnly} style={{ ...actionBtn(true, "danger"), ...lockStyle(gmailStatusLoading || isReadOnly) }}>
                        Disconnect My Gmail
                      </button>
                    )}
                    <button onClick={() => runGmailProfileCheck()} disabled={gmailProfileTesting || !gmailConnected || isReadOnly} style={{ ...actionBtn(false, "neutral"), ...lockStyle(gmailProfileTesting || !gmailConnected || isReadOnly) }}>
                      {gmailProfileTesting ? "Checking..." : "Test Profile"}
                    </button>
                    <button onClick={runGmailListCheck} disabled={gmailListTesting || !gmailConnected || isReadOnly} style={{ ...actionBtn(false, "neutral"), ...lockStyle(gmailListTesting || !gmailConnected || isReadOnly) }}>
                      {gmailListTesting ? "Testing API..." : "Test Gmail API"}
                    </button>
                    {a.e && (
                      <button onClick={() => syncArtistInbox(a)} disabled={syncingInbox || isReadOnly} style={{ ...actionBtn(false, "neutral"), ...lockStyle(syncingInbox || isReadOnly) }}>
                        {syncingInbox ? "Syncing..." : "Sync Artist Inbox"}
                      </button>
                    )}
                  </div>
                </div>}

                {!isCuratorProject && <div style={{ ...cS, padding: "16px 18px" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Latest Reply</div>
                  {latestReplyAt ? (
                    <>
                      <div style={{ fontSize: 12, color: C.ts, marginBottom: 8 }}>{rD(latestReplyAt)}</div>
                      <div style={{ fontSize: 12, color: C.tx, lineHeight: 1.6 }}>{latestReplyPreview || "Reply synced with no preview."}</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: C.ts, lineHeight: 1.6 }}>No synced inbound reply yet. Once Gmail is connected and synced, the latest artist response will appear here.</div>
                  )}
                  <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                    <button onClick={() => setDetailTab("inbox")} style={{ ...actionBtn(false, "neutral") }}>
                      Open Inbox
                    </button>
                    {latestArtistInboundMessage && (
                      <button onClick={() => { setDetailTab("inbox"); setReplyInput(latestArtistInboundMessage.bodyText || latestArtistInboundMessage.snippet || ""); }} style={{ ...actionBtn(true, "accent") }}>
                        Load Reply Context
                      </button>
                    )}
                  </div>
                </div>}

                {!isReadOnly && (
                  <details style={{ ...cS, padding: "14px 16px", borderColor: C.rbd }}>
                    <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700, color: C.rd }}>More actions</summary>
                    <div style={{ fontSize: 11, color: C.ts, marginTop: 10, marginBottom: 10 }}>
                      Archive keeps a recovery snapshot. Delete permanently removes the artist and all associated project data.
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button onClick={() => archiveArtist(a)} style={{ padding: "7px 12px", borderRadius: 9, border: `1px solid ${C.abd}`, background: C.abb, color: C.ab, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: ft }}>
                        Archive Artist
                      </button>
                      <button onClick={() => deleteArtistPermanently(a)} style={{ padding: "7px 12px", borderRadius: 9, border: `1px solid ${C.rbd}`, background: C.rb, color: C.rd, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: ft }}>
                        Delete Permanently
                      </button>
                    </div>
                  </details>
                )}
              </div>
            </aside>
          </div>
        </div>
      </div>
    );
  }

  // ═══ PROJECT ═══
  if (screen === "project" && proj) {
    const greetingHour = clockNow.getHours();
    const greetingLabel = greetingHour < 12 ? "Good morning" : greetingHour < 18 ? "Good afternoon" : "Good evening";
    const greetingName = (currentActor || "Team").split("@")[0];
    const marketingSummary = summarizeMarketingItems(groupScopedMarketingItems, operationalTodayISOFor(clockNow));
    const projectDateLabel = clockNow.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    const projectModeMeta = isMarketingProject ? {
      work: {
        nav: "Campaign Board",
        eyebrow: "Marketing",
        title: proj.name,
        helper: `${operationalDayLabel} · updated ${queueUpdatedLabel} · resets 6:00 AM`,
      },
      report: {
        nav: "Reports",
        eyebrow: "Performance",
        title: "Campaign reporting",
        helper: "Status mix, talent coverage, and campaign visibility for paid and organic work.",
      },
    } : isCuratorProject ? {
      work: {
        nav: "Pipeline",
        eyebrow: "Curator",
        title: proj.name,
        helper: `${operationalDayLabel} · updated ${queueUpdatedLabel} · resets 6:00 AM`,
      },
      report: {
        nav: "Reports",
        eyebrow: "Reporting",
        title: "Curator reporting",
        helper: "Curator pipeline movement, live advocates, and roster visibility without inbox dependencies.",
      },
    } : {
      work: {
        nav: "Pipeline",
        eyebrow: "Pipeline",
        title: proj.name,
        helper: `${operationalDayLabel} · updated ${queueUpdatedLabel} · resets 6:00 AM`,
      },
      inbox: {
        nav: `Inbox${projectInboxActionableCount ? ` (${projectInboxActionableCount})` : ""}`,
        eyebrow: "Joint Inbox",
        title: "Shared project inbox",
        helper: "Team-visible Gmail threads, follow-up ownership, and reply handling.",
      },
      report: {
        nav: "Reports",
        eyebrow: "Reporting",
        title: "Pipeline reporting",
        helper: "Scope-based funnel, activity timeline, and operating review.",
      },
    };
    const activeModeMeta = projectModeMeta[projectMode] || projectModeMeta.work;
    const connectedMailboxText = gmailConnected
      ? (gmailConnectionMeta?.provider_email || "Connected")
      : "Not connected";
    const spotlightLine = isMarketingProject
      ? projectMode === "work"
        ? `${marketingQueue.length} priority assignments in scope. ${marketingSummary.overdue} overdue and ${marketingSummary.dueSoon} due soon.`
        : `${marketingSummary.items} talent assignments across ${marketingSummary.campaigns} campaign${marketingSummary.campaigns === 1 ? "" : "s"}.`
      : isCuratorProject
        ? projectMode === "work"
          ? `${queue.length} curator actions in scope. ${(stCounts.engaged || 0)} engaged and ${(stCounts.live || 0)} live advocates in the current view.`
          : `${enriched.length} curators tracked with ${(stCounts.contacted || 0) + (stCounts.sent || 0) + (stCounts.replied || 0)} contacted or later in the current scope.`
      : projectMode === "work"
        ? `${queue.length} priority actions in scope. ${dueSeqCount} follow-ups due by 6:00 AM.`
        : projectMode === "inbox"
          ? `${projectInboxActionableCount} inbox threads still need attention. Sync from artist inboxes to pull the latest replies.`
          : `${reportActivityStats.actions} logged actions in range. ${reportScopedArtists.length} artists in the current reporting scope.`;
    const sidebarModeItems = isMarketingProject ? [
      { id: "work", label: projectModeMeta.work.nav, icon: "◫", hint: "talent + campaign pipeline" },
      { id: "report", label: projectModeMeta.report.nav, icon: "↗", hint: "status + campaign view" },
      { id: "settings", label: "Settings", icon: "⚙", hint: "models + links + tools", action: () => setShowProjectMenu(true) },
    ] : isCuratorProject ? [
      { id: "work", label: projectModeMeta.work.nav, icon: "◫", hint: "curator pipeline view" },
      { id: "report", label: projectModeMeta.report.nav, icon: "↗", hint: "status + curator view" },
      { id: "settings", label: "Settings", icon: "⚙", hint: "models + links + tools", action: () => setShowProjectMenu(true) },
    ] : [
      { id: "work", label: projectModeMeta.work.nav, icon: "◫", hint: "daily operating view" },
      { id: "inbox", label: projectModeMeta.inbox.nav, icon: "✉", hint: "shared comms" },
      { id: "report", label: projectModeMeta.report.nav, icon: "↗", hint: "funnel + timeline" },
      { id: "settings", label: "Settings", icon: "⚙", hint: "models + keys + tools", action: () => setShowProjectMenu(true) },
    ];
    const overviewCards = isMarketingProject ? [
      { label: "Assignments", value: marketingSummary.items, tone: C.tx, accent: C.ac, helper: "in this project" },
      { label: "Prospect", value: marketingSummary.prospect, tone: C.tt, accent: C.tt, helper: "uploaded or queued" },
      { label: "In Progress", value: marketingSummary.creating + marketingSummary.reviewing + marketingSummary.revising + marketingSummary.editing, tone: C.pr, accent: C.pr, helper: "creating, reviewing, revising, editing" },
      { label: "Complete", value: marketingSummary.complete, tone: C.gn, accent: C.gn, helper: operationalDayLabel },
    ] : isCuratorProject ? [
      { label: "Curators", value: enriched.length, tone: C.tx, accent: C.ac, helper: "in this project" },
      { label: "Contacted", value: (stCounts.sent || 0) + (stCounts.replied || 0) + (stCounts.contacted || 0), tone: C.bu, accent: C.bu, helper: "contacted or beyond" },
      { label: "Engaged", value: stCounts.engaged || 0, tone: C.pr, accent: C.pr, helper: "vouching and active" },
      { label: "Live", value: stCounts.live || 0, tone: C.lv, accent: C.lv, helper: "fully active" },
    ] : [
      { label: "Artists", value: enriched.length, tone: C.tx, accent: C.ac, helper: "in this project" },
      { label: "Contacted", value: contactedCount, tone: C.bu, accent: C.bu, helper: "sent or beyond" },
      { label: "Live", value: stCounts.live || 0, tone: C.lv, accent: C.lv, helper: "fully set up" },
      { label: "Due Today", value: dueSeqCount, tone: C.ab, accent: C.ab, helper: operationalDayLabel },
    ];
    const sidebarQuickStats = isMarketingProject ? [
      { label: "Assignments", value: marketingSummary.items },
      { label: "Prospect", value: marketingSummary.prospect },
      { label: "Complete", value: marketingSummary.complete },
    ] : isCuratorProject ? [
      { label: "Curators", value: enriched.length },
      { label: "Contacted", value: (stCounts.sent || 0) + (stCounts.replied || 0) + (stCounts.contacted || 0) },
      { label: "Live", value: stCounts.live || 0 },
    ] : [
      { label: "Artists", value: enriched.length },
      { label: "Contacted", value: contactedCount },
      { label: "Live", value: stCounts.live || 0 },
    ];
    const marketingScopeBaseLabel = effectiveMarketingOwnerFilter === "all"
      ? "All assignments"
      : !effectiveMarketingOwnerFilter
        ? "Unassigned assignments only"
        : `${effectiveMarketingOwnerFilter}'s assignments only`;
    const marketingScopeLabel = activeMarketingGroup
      ? `${marketingScopeBaseLabel} · ${activeMarketingGroup.name}`
      : marketingScopeBaseLabel;
    const sidebarUtilityCards = isMarketingProject ? [
      { label: "Campaigns", value: marketingSummary.campaigns, tone: C.tx },
      { label: "Due soon", value: marketingSummary.dueSoon, tone: marketingSummary.dueSoon ? C.ab : C.tx },
      { label: "Scope", value: marketingScopeLabel },
      { label: "Updated", value: queueUpdatedLabel, tone: C.tx },
    ] : isCuratorProject ? [
      { label: "Curator pages", value: enriched.filter(item => String(item.curatorPageUrl || "").trim()).length, tone: C.tx },
      { label: "Curated artists", value: enriched.reduce((sum, item) => sum + normalizeCuratedArtists(item.curatedArtists).length, 0), tone: C.ac },
      { label: "Scope", value: workspaceUser === ALL_USER_VIEW ? "All" : workspaceUser === UNASSIGNED_USER_VIEW ? "Unassigned" : workspaceUser },
      { label: "Updated", value: queueUpdatedLabel, tone: C.tx },
    ] : [
      { label: "Mailbox", value: connectedMailboxText, tone: gmailConnected ? C.gn : C.rd },
      { label: "Follow-ups due", value: dueSeqCount, tone: dueSeqCount ? C.ab : C.tx },
      { label: "Scope", value: workspaceUser === ALL_USER_VIEW ? "All" : workspaceUser === UNASSIGNED_USER_VIEW ? "Unassigned" : workspaceUser },
      { label: "Updated", value: queueUpdatedLabel, tone: C.tx },
    ];
    const scopeDescription = workspaceUser === ALL_USER_VIEW
      ? "Whole team view"
      : workspaceUser === UNASSIGNED_USER_VIEW
        ? "Only unassigned artists"
        : `${workspaceUser}'s workspace`;

    return (
      <div className="gf-project-shell" style={{ fontFamily: ft, color: C.tx }}>
        <Toast /><style>{css}</style>

        <aside className="gf-project-sidebar">
          <div className="gf-project-sidebar-section gf-project-divider" style={{ borderTop: "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <img src="/gemfinder-logo.png" alt="GEMFINDER logo" style={{ width: 42, height: 42, objectFit: "contain" }} />
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3.2, color: C.ac, textTransform: "uppercase", marginBottom: 2 }}>GEMFINDER</div>
                <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: "-0.02em" }}>Artist Ops Hub</div>
              </div>
            </div>
            <div className="gf-project-sidebar-card gf-project-project-card">
              <div style={{ fontSize: 11, color: C.tt, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8 }}>Current project</div>
              <div className="gf-project-project-card-title">{proj.name}</div>
              <div style={{ fontSize: 13, color: C.ts, lineHeight: 1.7, marginBottom: 16 }}>
                {proj.desc || (isMarketingProject
                  ? "Shared talent workspace for campaigns, briefs, review cycles, and deliverable tracking."
                  : isCuratorProject
                    ? "Shared curator workspace for championing artists, tracking advocacy, and keeping curated rosters visible."
                    : "Shared outreach workspace for pipeline movement, inbox handling, and reporting.")}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, marginBottom: 12 }}>
                {sidebarQuickStats.map(({ label, value }) => (
                  <div key={label} style={{ borderRadius: 14, border: `1px solid ${C.bd}`, background: C.sf, padding: "10px 11px", minWidth: 0 }}>
                    <div style={{ fontSize: 8, color: C.tt, textTransform: "uppercase", letterSpacing: 0.5, lineHeight: 1.15, whiteSpace: "normal", overflowWrap: "anywhere" }}>{label}</div>
                    <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.08, marginTop: 4 }}>{value}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontSize: 11, color: C.ts }}>
                <span>{operationalDayLabel}</span>
                <button onClick={() => { setScreen("hub"); setShowQuickDrawer(false); setSearch(""); setGf("All"); setSf("all"); setPf("all"); }} style={{ background: "none", border: "none", padding: 0, color: C.ac, cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: ft }}>
                  Back to projects
                </button>
              </div>
            </div>
          </div>

          <div className="gf-project-sidebar-section gf-project-divider">
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.3, color: C.tt, marginBottom: 10 }}>Workspace</div>
            <div className="gf-project-sidebar-nav">
              {sidebarModeItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => {
                    if (item.action) {
                      item.action();
                      return;
                    }
                    setProjectMode(item.id);
                  }}
                  className={`gf-project-nav-btn${projectMode === item.id ? " active" : ""}`}
                >
                  <span className="gf-project-nav-icon">{item.icon}</span>
                  <span className="gf-project-nav-meta">
                    <span>{item.label}</span>
                    <span className="gf-project-nav-hint">{item.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="gf-project-sidebar-section gf-project-divider">
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.3, color: C.tt, marginBottom: 10 }}>Scope</div>
            <div className="gf-project-sidebar-card" style={{ padding: "14px 14px 12px", borderRadius: 18 }}>
              <select value={workspaceUser} onChange={e => changeWorkspaceUser(e.target.value)} style={{ ...iS, width: "100%", padding: "11px 12px", fontSize: 13, marginBottom: 8 }}>
                <option value={ALL_USER_VIEW}>All</option>
                <option value={UNASSIGNED_USER_VIEW}>Unassigned</option>
                {(proj.teamUsers || DEFAULT_TEAM_USERS).map(u => <option key={u} value={u}>{u}</option>)}
              </select>
              <div style={{ fontSize: 11, color: C.tt, lineHeight: 1.5 }}>{scopeDescription}</div>
            </div>
          </div>

          <div className="gf-project-sidebar-section gf-project-divider">
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.3, color: C.tt, marginBottom: 10 }}>Snapshot</div>
            <div className="gf-project-utility-grid">
              {sidebarUtilityCards.map(card => (
                <div key={card.label} className="gf-project-utility-card">
                  <div className="gf-project-utility-label">{card.label}</div>
                  <div className="gf-project-utility-value" style={{ color: card.tone || C.tx, fontSize: card.label === "Mailbox" ? 13 : 22, lineHeight: card.label === "Mailbox" ? 1.3 : 1.12, overflowWrap: "anywhere", wordBreak: card.label === "Mailbox" ? "normal" : "break-word" }}>
                    {card.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="gf-project-sidebar-section gf-project-divider" style={{ marginTop: "auto" }}>
            <div style={{ fontSize: 11, color: C.tt, lineHeight: 1.6 }}>
              {authLabel}
              <span style={{ display: "inline-block", marginLeft: 6, fontSize: 10, padding: "2px 8px", borderRadius: 999, border: `1px solid ${C.bd}`, background: C.sa, color: C.ts, textTransform: "uppercase" }}>
                {roleLabel}
              </span>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <button onClick={() => setShowProjectMenu(true)} style={{ ...actionBtn(false, "neutral"), width: "100%", justifyContent: "center" }}>Open Settings</button>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button onClick={signOut} style={{ ...actionBtn(false, "neutral"), flex: 1, justifyContent: "center" }}>Sign out</button>
              <DkBtn />
            </div>
          </div>
        </aside>

        <main className="gf-project-main">
          <div className="gf-project-main-inner">
            <div className="gf-project-hero">
              <div className="gf-project-spotlight">
                <div className="gf-project-kicker">{activeModeMeta.eyebrow}</div>
                <div className="gf-project-headline">{activeModeMeta.title}</div>
                <div style={{ fontSize: 15, color: C.tt, marginTop: 12, marginBottom: 8 }}>
                  {greetingLabel}, {greetingName}
                </div>
                <div className="gf-project-subline" style={{ marginBottom: 14 }}>
                  {activeModeMeta.helper}
                </div>
                <div className="gf-project-subline" style={{ fontSize: 13 }}>
                  {spotlightLine}
                </div>
              </div>

              <div style={{ display: "grid", gap: 12 }}>
                <div className="gf-project-sidebar-card" style={{ padding: "18px 18px 16px" }}>
                  <div className="gf-project-toolbar">
                    <div>
                      <div style={{ fontSize: 12, color: C.tt, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 6 }}>Today</div>
                      <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1.02 }}>{projectDateLabel}</div>
                      <div style={{ fontSize: 12, color: C.ts, marginTop: 8 }}>
                        {projectMode === "inbox" ? `Connected mailbox: ${connectedMailboxText}` : `${isMarketingProject ? marketingScopeLabel : scopeDescription} · ${operationalDayLabel}`}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="gf-project-overview-grid">
                  {overviewCards.map(card => (
                    <div key={card.label} className="gf-project-stat-card">
                      <div className="gf-project-stat-label">{card.label}</div>
                      <div className="gf-project-stat-value" style={{ color: card.tone }}>{card.value}</div>
                      <div style={{ fontSize: 11, color: C.ts, marginTop: 4 }}>{card.helper}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="gf-project-sidebar-card" style={{ padding: "16px 18px", marginBottom: 18 }}>
              <div className="gf-project-mode-banner">
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.8, textTransform: "uppercase", color: C.ac, marginBottom: 6 }}>Actions</div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
                    {isMarketingProject
                      ? (projectMode === "work" ? "Talent workflow" : "Campaign reporting")
                      : isCuratorProject
                        ? (projectMode === "work" ? "Curator workflow" : "Curator reporting")
                        : (projectMode === "work" ? "Pipeline execution" : projectMode === "inbox" ? "Inbox handling" : "Reporting cadence")}
                  </div>
                  <div style={{ fontSize: 12, color: C.ts, lineHeight: 1.6 }}>
                    {isMarketingProject
                      ? (projectMode === "work"
                        ? "Track talent from prospect to completion, keep briefs organized, and keep campaign assets attached to the assignment."
                        : "Review campaign mix, completion rate, and overdue work without leaving the project.")
                      : isCuratorProject
                        ? (projectMode === "work"
                          ? "Track curator outreach, the artists they vouch for, and the pages you want the team to keep in rotation."
                          : "Review curator pipeline movement, live advocates, and stage health without inbox dependencies.")
                      : (projectMode === "work"
                        ? "Keep the core moves high-signal. Add artists, import CSVs, and move the pipeline forward from here."
                        : projectMode === "inbox"
                          ? "Handle team-visible comms, ownership, follow-ups, and response decisions from one place."
                          : "Review funnel movement, timeline output, and health issues without leaving the project.")}
                  </div>
                </div>
                <div className="gf-project-toolbar-actions">
                  {projectMode === "work" && !isReadOnly && (isMarketingProject ? (
                    <>
                      <button onClick={() => openMarketingItemModal(null)} style={{ ...actionBtn(true, "good"), ...lockStyle(isReadOnly) }}>+ Campaign Assignment</button>
                      <button onClick={openMarketingBulkUpdateModal} style={{ ...actionBtn(false, "accent"), ...lockStyle(isReadOnly) }}>Bulk Update</button>
                      <button onClick={removeDuplicateMarketingItems} style={{ ...actionBtn(false, "warn"), ...lockStyle(isReadOnly || !marketingDuplicateRemovalCount) }}>
                        Clean Duplicates{marketingDuplicateRemovalCount ? ` (${marketingDuplicateRemovalCount})` : ""}
                      </button>
                      <button onClick={() => setMarketingSelectionMode(prev => !prev)} style={{ ...actionBtn(marketingSelectionMode, "neutral"), ...lockStyle(isReadOnly) }}>
                        {marketingSelectionMode ? "Done Selecting" : "Select Assignments"}
                      </button>
                      {(marketingSelectionMode || selectedMarketingIds.size > 0) && (
                        <>
                          <button onClick={selectVisibleMarketingItems} style={{ ...actionBtn(false, "neutral"), ...lockStyle(isReadOnly) }}>Select All Filtered</button>
                          <button onClick={clearMarketingSelection} style={{ ...actionBtn(false, "neutral"), ...lockStyle(isReadOnly) }}>Clear Selection</button>
                          <select
                            value={marketingSelectionOwnerDraft}
                            onChange={e => setMarketingSelectionOwnerDraft(e.target.value)}
                            disabled={isReadOnly}
                            style={{ ...iS, minWidth: 160, opacity: isReadOnly ? 0.5 : 1 }}
                          >
                            <option value="">Assign owner…</option>
                            {(proj.teamUsers || DEFAULT_TEAM_USERS).map(owner => (
                              <option key={owner} value={owner}>{owner}</option>
                            ))}
                            <option value="__clear__">Clear owner</option>
                          </select>
                          <button
                            onClick={() => batchAssignMarketingOwner(marketingSelectionOwnerDraft === "__clear__" ? "" : marketingSelectionOwnerDraft)}
                            style={{ ...actionBtn(false, "good"), ...lockStyle(isReadOnly || !selectedMarketingIds.size || !marketingSelectionOwnerDraft) }}
                          >
                            Apply Owner
                          </button>
                          <button onClick={saveMarketingGroupSelection} style={{ ...actionBtn(false, "accent"), ...lockStyle(isReadOnly || !selectedMarketingIds.size) }}>Save Group</button>
                          <button onClick={copyMarketingBccEmails} style={{ ...actionBtn(false, "neutral"), ...lockStyle(isReadOnly || !marketingSelectedEmails.length) }}>Copy BCC</button>
                          <button onClick={openMarketingBccDraft} style={{ ...actionBtn(false, "neutral"), ...lockStyle(isReadOnly || !marketingSelectedEmails.length) }}>Open Gmail Draft</button>
                          <button onClick={deleteSelectedMarketingItems} style={{ ...actionBtn(false, "danger"), ...lockStyle(isReadOnly || !selectedMarketingIds.size) }}>Delete Selected</button>
                        </>
                      )}
                      <label style={{ ...actionBtn(false, "neutral"), ...lockStyle(isReadOnly) }}>
                        Import Talent CSV
                        <input type="file" accept=".csv" ref={fr} onChange={importCSV} disabled={isReadOnly} />
                      </label>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setShowDiscover(true)} style={{ ...actionBtn(true, "accent"), ...lockStyle(isReadOnly) }}>AI Discover</button>
                      <button onClick={() => setShowAddArtist(true)} style={{ ...actionBtn(true, "good"), ...lockStyle(isReadOnly) }}>{isCuratorProject ? "+ Curator" : "+ Artist"}</button>
                      <label style={{ ...actionBtn(false, "neutral"), ...lockStyle(isReadOnly) }}>
                        Import + Merge CSV
                        <input type="file" accept=".csv" ref={fr} onChange={importCSV} disabled={isReadOnly} />
                      </label>
                    </>
                  ))}
                {projectMode === "report" && (
                  <>
                    {[
                      ["7d", "7D"],
                      ["30d", "30D"],
                      ["90d", "90D"],
                    ].map(([id, label]) => (
                      <button key={id} onClick={() => setReportPreset(id)} style={actionBtn(activeReportPreset === id, "neutral")}>{label}</button>
                    ))}
                    <input type="date" value={reportStart} onChange={e => setReportStart(e.target.value)} style={{ ...iS, padding: "8px 10px", fontSize: 12 }} />
                    <input type="date" value={reportEnd} onChange={e => setReportEnd(e.target.value)} style={{ ...iS, padding: "8px 10px", fontSize: 12 }} />
                  </>
                )}
                {isArProject && projectMode === "inbox" && (
                  <>
                    {!gmailConnected ? (
                      <button onClick={connectGmail} disabled={gmailStatusLoading || isReadOnly} style={{ ...actionBtn(true, "accent"), ...lockStyle(gmailStatusLoading || isReadOnly) }}>
                        {gmailStatusLoading ? "Checking..." : "Connect My Gmail"}
                      </button>
                    ) : (
                      <button onClick={disconnectGmail} disabled={gmailStatusLoading || isReadOnly} style={{ ...actionBtn(true, "danger"), ...lockStyle(gmailStatusLoading || isReadOnly) }}>
                        Disconnect My Gmail
                      </button>
                    )}
                    <button onClick={() => loadProjectInbox(proj.id, selectedProjectThread?.threadKey || "", selectedProjectThread?.sourceThreadKeys || [])} disabled={projectInboxLoading} style={actionBtn(false, "neutral")}>
                      {projectInboxLoading ? "Reloading..." : "Reload Stored Threads"}
                    </button>
                  </>
                )}
            </div>
          </div>
        </div>
        {isReadOnly && (
          <div style={{ ...cS, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: C.ts }}>
            Viewer mode is active for this workspace. Editing, importing, and follow-up plan actions are disabled.
          </div>
        )}
        {isArProject && !!proj.internalRoster?.names?.length && (
          <div style={{ ...cS, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: C.ts, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div>
              Internal roster loaded from <strong style={{ color: C.tx }}>{proj.internalRoster.fileName || "CSV"}</strong>
              {` · ${proj.internalRoster.names.length} artists · ${internalMatchCount} current project matches`}
              {proj.internalRoster.uploadedAt ? ` · updated ${sD(proj.internalRoster.uploadedAt)}` : ""}
            </div>
            {!isReadOnly && <button onClick={clearInternalRoster} style={{ ...actionBtn(false, "danger"), padding: "6px 10px" }}>Clear Check</button>}
          </div>
        )}
        {!isMarketingProject && projectMode === "report" && (
          <div style={{ ...cS, padding: "14px 18px", marginBottom: 12, animation: "si 0.18s ease" }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
              {isCuratorProject ? `🧭 Curator Health · ${reportViewLabel}` : `🚨 Pipeline Health · ${reportViewLabel}`}
            </div>
            {healthAlerts.length > 0 ? (
              <div style={{ display: "grid", gap: 6 }}>
                {healthAlerts.map((h, i) => (
                  <div key={i} style={{ fontSize: 12, color: C.ts, padding: "8px 10px", background: C.sa, borderRadius: 8, border: `1px solid ${C.bd}` }}>
                    <strong style={{ color: h.level === "high" ? C.rd : h.level === "medium" ? C.ab : C.ac }}>{h.label}</strong>
                    <span style={{ color: C.tt }}> · {h.action}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: C.ts, padding: "8px 10px", background: C.sa, borderRadius: 8, border: `1px solid ${C.bd}` }}>
                {isCuratorProject ? "No urgent curator health alerts right now." : "No urgent health alerts right now."}
              </div>
            )}
          </div>
        )}

        {false && (
          <div style={{ ...cS, padding: "14px 18px", marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>🤖 AI Model Routing</div>
            {!isAdmin && <div style={{ fontSize: 11, color: C.tt, marginBottom: 8 }}>Admin role required to change model routing, provider, and guardrails.</div>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10, marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: C.ts, display: "grid", gap: 4 }}>
                <span>AI Provider</span>
                <select value={currentAiProvider} disabled={!isAdmin} onChange={e => saveAiProvider(e.target.value)} style={{ ...iS, padding: "6px 10px", fontSize: 12, ...lockStyle(!isAdmin) }}>
                  {AI_PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </label>
              <div style={{ fontSize: 12, color: C.ts, display: "grid", gap: 4 }}>
                <span>API Key Status</span>
                <div style={{ ...iS, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span>{aiKeySet ? "Saved" : "Missing"}</span>
                  <button disabled={!isAdmin} onClick={configureAiKey} style={{ border: "none", background: "transparent", color: C.ac, cursor: isAdmin ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 700, fontFamily: ft, ...lockStyle(!isAdmin) }}>Update</button>
                </div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
              {[["intel", "Intel"], ["drafts", "Drafts"], ["discovery", "Discovery"], ["reply", "Reply Classifier"], ["followup", "Follow-up Writer"]].map(([task, label]) => (
                <label key={task} style={{ fontSize: 12, color: C.ts, display: "grid", gap: 4 }}>
                  <span>{label}</span>
                  <select value={taskModel(task)} disabled={!isAdmin} onChange={e => saveAiModel(task, e.target.value)} style={{ ...iS, padding: "6px 10px", fontSize: 12, ...lockStyle(!isAdmin) }}>
                    {aiOptions.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.bd}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Draft Quality Guardrails</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 8, alignItems: "end" }}>
                <label style={{ fontSize: 11, color: C.ts, display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" disabled={!isAdmin} checked={!!proj.settings?.draftGuardrails?.enabled} onChange={e => saveDraftGuardrails({ enabled: e.target.checked })} />
                  Enabled
                </label>
                <label style={{ fontSize: 11, color: C.ts, display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" disabled={!isAdmin} checked={!!proj.settings?.draftGuardrails?.strict} onChange={e => saveDraftGuardrails({ strict: e.target.checked })} />
                  Strict block mode
                </label>
                <label style={{ fontSize: 11, color: C.ts, display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" disabled={!isAdmin} checked={!!proj.settings?.draftGuardrails?.requireQuestion} onChange={e => saveDraftGuardrails({ requireQuestion: e.target.checked })} />
                  Require CTA question
                </label>
                <label style={{ fontSize: 11, color: C.ts, display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" disabled={!isAdmin} checked={!!proj.settings?.draftGuardrails?.requirePersonalization} onChange={e => saveDraftGuardrails({ requirePersonalization: e.target.checked })} />
                  Require personalization
                </label>
                <label style={{ fontSize: 11, color: C.ts, display: "grid", gap: 4 }}>
                  <span>Min DM words</span>
                  <input type="number" disabled={!isAdmin} min={40} max={400} value={proj.settings?.draftGuardrails?.minDmWords || DEFAULT_DRAFT_GUARDRAILS.minDmWords} onChange={e => saveDraftGuardrails({ minDmWords: Math.max(40, Number(e.target.value) || DEFAULT_DRAFT_GUARDRAILS.minDmWords) })} style={{ ...iS, padding: "6px 10px", fontSize: 12, ...lockStyle(!isAdmin) }} />
                </label>
                <label style={{ fontSize: 11, color: C.ts, display: "grid", gap: 4 }}>
                  <span>Min Email words</span>
                  <input type="number" disabled={!isAdmin} min={60} max={500} value={proj.settings?.draftGuardrails?.minEmailWords || DEFAULT_DRAFT_GUARDRAILS.minEmailWords} onChange={e => saveDraftGuardrails({ minEmailWords: Math.max(60, Number(e.target.value) || DEFAULT_DRAFT_GUARDRAILS.minEmailWords) })} style={{ ...iS, padding: "6px 10px", fontSize: 12, ...lockStyle(!isAdmin) }} />
                </label>
                <label style={{ fontSize: 11, color: C.ts, display: "grid", gap: 4 }}>
                  <span>Min Warm words</span>
                  <input type="number" disabled={!isAdmin} min={40} max={300} value={proj.settings?.draftGuardrails?.minWarmWords || DEFAULT_DRAFT_GUARDRAILS.minWarmWords} onChange={e => saveDraftGuardrails({ minWarmWords: Math.max(40, Number(e.target.value) || DEFAULT_DRAFT_GUARDRAILS.minWarmWords) })} style={{ ...iS, padding: "6px 10px", fontSize: 12, ...lockStyle(!isAdmin) }} />
                </label>
              </div>
            </div>
          </div>
        )}

        {false && (
          <div style={{ ...cS, padding: "14px 18px", marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>👥 Team Assignment</div>
            {!isAdmin && <div style={{ fontSize: 11, color: C.tt, marginBottom: 8 }}>Admin role required to add team users.</div>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              {(proj.teamUsers || []).map(u => (
                <span key={u} style={{ fontSize: 11, padding: "3px 9px", borderRadius: 999, border: `1px solid ${C.bd}`, background: C.sa, color: C.ts }}>{u}</span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, maxWidth: 360 }}>
              <input value={newTeamUser} disabled={!isAdmin} onChange={e => setNewTeamUser(e.target.value)} placeholder="Add team user" style={{ ...iS, flex: 1, ...lockStyle(!isAdmin) }} />
              <button disabled={!isAdmin} onClick={addTeamMember} style={{ padding: "8px 12px", borderRadius: 10, border: "none", background: C.ac, color: "#fff", cursor: isAdmin ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 600, fontFamily: ft, ...lockStyle(!isAdmin) }}>Add</button>
            </div>
          </div>
        )}

        {isMarketingProject && projectMode === "report" && (
          <div style={{ display: "grid", gap: 16, marginBottom: 16 }}>
            <div style={{ ...cS, padding: "18px 24px", animation: "si 0.2s ease" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>Marketing Reporting</div>
                  <div style={{ fontSize: 11, color: C.tt }}>
                    Current view is {marketingScopeLabel.toLowerCase()} across paid and organic campaign work.
                  </div>
                </div>
                <div style={{ fontSize: 11, color: C.tt }}>
                  {reportStart} to {reportEnd}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
                {[
                  ["Assignments", marketingSummary.items, "all", "All tracked campaign assignments"],
                  ["Prospect", marketingSummary.prospect, "prospect", "Queued or newly uploaded talent"],
                  ["Contacted", marketingSummary.contacted, "contacted", "The opportunity has been sent to the talent"],
                  ["Interested", marketingSummary.interested, "interested", "Talent who replied about the opportunity"],
                  ["In Progress", marketingSummary.creating + marketingSummary.reviewing + marketingSummary.revising + marketingSummary.editing, "__active__", "Creating, reviewing, revising, and editing"],
                  ["Complete", marketingSummary.complete, "complete", "Finished deliverables"],
                  ["Campaigns", marketingSummary.campaigns, "__campaigns__", "Distinct campaign buckets"],
                ].map(([label, value, filterId, helper]) => (
                  <button
                    key={label}
                    onClick={() => {
                      setProjectMode("work");
                      setShowFilters(true);
                      if (filterId === "__active__") setMarketingStatusFilter("active");
                      else if (filterId === "__overdue__") setMarketingStatusFilter("all");
                      else if (filterId !== "__campaigns__") setMarketingStatusFilter(filterId);
                      if (filterId === "__campaigns__") setMarketingCampaignFilter("all");
                    }}
                    style={{ textAlign: "left", padding: "12px 14px", borderRadius: 12, border: `1px solid ${C.bd}`, background: C.sa, cursor: "pointer", fontFamily: ft }}
                  >
                    <div style={{ fontSize: 10, color: C.tt, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: C.tx, marginTop: 4 }}>{value}</div>
                    <div style={{ fontSize: 11, color: C.ts, marginTop: 4 }}>{helper}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ ...cS, padding: "18px 24px", animation: "si 0.2s ease" }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Status Mix</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10 }}>
                {MARKETING_STATUSES.map(status => (
                  <button
                    key={status.id}
                    onClick={() => { setProjectMode("work"); setShowFilters(true); setMarketingStatusFilter(status.id); }}
                    style={{ textAlign: "left", padding: "12px 14px", borderRadius: 12, border: `1px solid ${C.bd}`, background: C.sa, cursor: "pointer", fontFamily: ft }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 700, color: marketingStatusTone(status.id, C).tone, marginBottom: 6 }}>
                      {status.icon} {status.label}
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: C.tx }}>{marketingStatusCounts[status.id] || 0}</div>
                    <div style={{ fontSize: 10, color: C.tt, marginTop: 4 }}>{status.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1.1fr) minmax(320px, 1.4fr)", gap: 16 }}>
              <div style={{ ...cS, padding: "18px 20px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Campaign Breakdown</div>
                {marketingCampaigns.length ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    {marketingCampaigns.map(([campaign, count]) => (
                      <button
                        key={campaign}
                        onClick={() => { setProjectMode("work"); setShowFilters(true); setMarketingCampaignFilter(campaign); }}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.bd}`, background: C.sa, cursor: "pointer", fontFamily: ft }}
                      >
                        <span style={{ fontSize: 12, color: C.tx, fontWeight: 600 }}>{campaign}</span>
                        <span style={{ ...mkP(true, C.ac, C.al), cursor: "pointer" }}>{count}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: C.tt }}>No campaigns grouped yet.</div>
                )}
              </div>

              <div style={{ ...cS, padding: "18px 20px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Priority Work</div>
                {marketingQueue.length ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    {marketingQueue.map(item => (
                      <button
                        key={item.id}
                        onClick={() => openMarketingItemModal(item)}
                        style={{ display: "grid", gap: 4, textAlign: "left", padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.bd}`, background: C.sa, cursor: "pointer", fontFamily: ft }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>{marketingItemPrimaryLabel(item)}</span>
                          <span style={{ ...mkP(true, marketingStatusTone(item.status, C).tone, marketingStatusTone(item.status, C).bg), cursor: "pointer" }}>{MM[item.status]?.label}</span>
                        </div>
                        <div style={{ fontSize: 11, color: C.ts }}>{item.talentType} · {marketingCampaignsLabel(item)} · {item.trafficType} · {marketingChannelsLabel(item)}</div>
                        {marketingItemTitleLabel(item) && <div style={{ fontSize: 11, color: C.tt }}>{marketingItemTitleLabel(item)}</div>}
                        <div style={{ fontSize: 11, color: item.dueDate && item.dueDate < operationalTodayISOFor(clockNow) ? C.rd : C.tt }}>{item.priorityLabel}</div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: C.tt }}>No active talent assignments in the current scope.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {!isMarketingProject && projectMode === "report" && (
          <div style={{ ...cS, padding: "18px 24px", marginBottom: 16, animation: "si 0.2s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Reporting</div>
                <div style={{ fontSize: 11, color: C.tt }}>
                  Current funnel is {reportScopeMode === "team" ? "the whole team" : `${workspaceUser}'s assigned artists`}. Activity timeline is {reportScopeMode === "team" ? "whole team output" : `${workspaceUser}'s logged actions`}.
                </div>
              </div>
              <div style={{ fontSize: 11, color: C.tt }}>
                {reportStart} to {reportEnd}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 16 }}>
              <div style={{ ...cS, boxShadow: "none", padding: "12px 14px", background: C.sa }}>
                <div style={{ fontSize: 10, color: C.tt, textTransform: "uppercase", letterSpacing: 1 }}>Current Artists</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: C.tx }}>{reportScopedArtists.length}</div>
                <div style={{ fontSize: 11, color: C.ts }}>in selected reporting scope</div>
              </div>
              <div style={{ ...cS, boxShadow: "none", padding: "12px 14px", background: C.sa }}>
                <div style={{ fontSize: 10, color: C.tt, textTransform: "uppercase", letterSpacing: 1 }}>Actions</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: C.tx }}>{reportActivityStats.actions}</div>
                <div style={{ fontSize: 11, color: C.ts }}>{reportStart} to {reportEnd}</div>
              </div>
              <div style={{ ...cS, boxShadow: "none", padding: "12px 14px", background: C.sa }}>
                <div style={{ fontSize: 10, color: C.tt, textTransform: "uppercase", letterSpacing: 1 }}>Sends</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: C.tx }}>{reportActivityStats.sends}</div>
                <div style={{ fontSize: 11, color: C.ts }}>logged in selected range</div>
              </div>
              <div style={{ ...cS, boxShadow: "none", padding: "12px 14px", background: C.sa }}>
                <div style={{ fontSize: 10, color: C.tt, textTransform: "uppercase", letterSpacing: 1 }}>Stage Moves</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: C.tx }}>{reportActivityStats.stageMoves}</div>
                <div style={{ fontSize: 11, color: C.ts }}>pipeline progress logged</div>
              </div>
              <div style={{ ...cS, boxShadow: "none", padding: "12px 14px", background: C.sa }}>
                <div style={{ fontSize: 10, color: C.tt, textTransform: "uppercase", letterSpacing: 1 }}>AI + Notes</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: C.tx }}>{reportActivityStats.aiActions + reportActivityStats.noteUpdates}</div>
                <div style={{ fontSize: 11, color: C.ts }}>{reportActivityStats.aiActions} AI · {reportActivityStats.noteUpdates} notes</div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>Status Drilldown</div>
              <div style={{ fontSize: 11, color: C.tt }}>Click any card to open the matching artist list in work view.</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginBottom: 18 }}>
              {reportFunnel.map(card => (
                <button
                  key={card.id}
                  onClick={() => drillDownToStatus(card.id)}
                  style={{
                    textAlign: "left",
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: `1px solid ${card.id === "contacted" ? C.ac : card.id === "live" ? C.lvd : card.id === "dead" ? C.rbd : C.bd}`,
                    background: card.id === "contacted" ? C.al : card.id === "live" ? C.lvb : card.id === "dead" ? C.rb : C.sa,
                    cursor: "pointer",
                    fontFamily: ft,
                  }}
                >
                  <div style={{ fontSize: 11, color: card.id === "contacted" ? C.ac : card.id === "live" ? C.lv : card.id === "dead" ? C.rd : C.ts, fontWeight: 700, marginBottom: 8 }}>
                    {card.l}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: C.tx, lineHeight: 1.05 }}>{card.c}</div>
                  <div style={{ fontSize: 10, color: C.tt, marginTop: 4 }}>{card.hint}</div>
                  <div style={{ fontSize: 10, color: C.tt, marginTop: 6 }}>{card.p}% of scope</div>
                </button>
              ))}
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Activity Timeline</div>
            {reportTimeline.length > 0 ? (
              <div style={{ overflowX: "auto", paddingBottom: 4 }}>
                <div style={{ display: "flex", gap: 8, minWidth: Math.max(680, reportTimeline.length * 58) }}>
                  {reportTimeline.map(day => (
                    <div key={day.day} style={{ width: 50, flex: "0 0 auto", textAlign: "center" }}>
                      <div style={{ height: 88, display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 4, marginBottom: 6 }}>
                        <div title={`${day.actions} actions`} style={{ width: 18, height: Math.max(6, Math.round((day.actions / day.max) * 80)), background: C.ac, borderRadius: "6px 6px 0 0" }} />
                        <div title={`${day.sends} sends`} style={{ width: 18, height: Math.max(4, Math.round((day.sends / day.max) * 80)), background: C.gn, borderRadius: "6px 6px 0 0" }} />
                      </div>
                      <div style={{ fontSize: 10, color: C.tx, fontWeight: 700 }}>{day.actions}</div>
                      <div style={{ fontSize: 9, color: C.tt }}>{day.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: C.tt }}>No activity in the selected range.</div>
            )}
            <div style={{ marginTop: 8, fontSize: 10, color: C.tt }}>Blue bars are total actions. Green bars are sends.</div>
          </div>
        )}

        {isMarketingProject && projectMode === "work" && (
          <div ref={workSurfaceRef}>
            <div style={{ ...cS, padding: "12px 14px", marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: showQueue ? 10 : 0, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Today Queue</div>
                  <div style={{ fontSize: 11, color: C.tt }}>
                    {operationalDayLabel} · top talent assignments for the current scope · resets at 6:00 AM
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button onClick={() => workspaceUser === currentActor ? changeWorkspaceUser(ALL_USER_VIEW) : changeWorkspaceUser(currentActor)} style={actionBtn(false, "neutral")}>
                    {workspaceUser === currentActor ? "Team Queue" : `My Queue (${currentActor})`}
                  </button>
                  <button onClick={() => setShowQueue(!showQueue)} style={actionBtn(false, "neutral")}>
                    {showQueue ? "Minimize" : "Expand"}
                  </button>
                  <button onClick={() => setProjectMode("report")} style={actionBtn(false, "neutral")}>Open Reports</button>
                </div>
              </div>
              {showQueue && (
                marketingQueue.length ? (
                  <div style={{ display: "grid", gap: 6 }}>
                    {marketingQueue.map(item => (
                      <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, border: `1px solid ${C.bd}`, background: C.sa }}>
                        <button onClick={() => openMarketingItemModal(item)} style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, background: "none", border: "none", cursor: "pointer", fontFamily: ft, textAlign: "left", padding: 0 }}>
                          <span style={{ fontSize: 14 }}>{MM[item.status]?.icon || "•"}</span>
                          <span style={{ fontWeight: 700, minWidth: 120, color: C.tx }}>{marketingItemPrimaryLabel(item)}</span>
                          <span style={{ color: C.ts, flex: 1, fontSize: 12 }}>{item.priorityLabel}</span>
                          <span style={{ ...mkP(true, marketingStatusTone(item.status, C).tone, marketingStatusTone(item.status, C).bg), fontSize: 10, padding: "2px 8px", cursor: "pointer" }}>{MM[item.status]?.label}</span>
                        </button>
                        {!item.owner && !isReadOnly && (
                          <button onClick={() => assignMarketingItemOwner(item.id, currentActor)} style={{ ...actionBtn(true, "good"), padding: "6px 10px", fontSize: 11 }}>
                            Assign to Me
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: C.ts }}>No queued talent assignments for this scope right now. Last refreshed {queueUpdatedLabel}.</div>
                )
              )}
            </div>

            <div style={{ ...cS, padding: "12px 14px", marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Status Board</div>
                  <div style={{ fontSize: 11, color: C.tt }}>Quick filter by assignment stage.</div>
                </div>
                {marketingStatusFilter !== "all" && <button onClick={() => setMarketingStatusFilter("all")} style={actionBtn(false, "neutral")}>Clear Status Filter</button>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8 }}>
                {MARKETING_STATUSES.map(status => {
                  const tone = marketingStatusTone(status.id, C);
                  return (
                    <button key={status.id} onClick={() => setMarketingStatusFilter(marketingStatusFilter === status.id ? "all" : status.id)} style={{ textAlign: "left", padding: "10px 12px", borderRadius: 12, border: `1px solid ${marketingStatusFilter === status.id ? tone.tone : C.bd}`, background: marketingStatusFilter === status.id ? tone.bg : C.sf, cursor: "pointer", fontFamily: ft }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: marketingStatusFilter === status.id ? tone.tone : C.ts, marginBottom: 6 }}>{status.icon} {status.label}</div>
                      <div style={{ fontSize: 24, fontWeight: 800, color: marketingStatusFilter === status.id ? tone.tone : C.tx, lineHeight: 1 }}>{marketingStatusCounts[status.id] || 0}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
              <input placeholder="Search talent, campaign, or title..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...iS, width: 260 }} />
              <div style={{ display: "flex", gap: 2, background: C.sa, borderRadius: 10, padding: 3, border: `1px solid ${C.bd}` }}>
                {[ ["list", "☰"], ["kanban", "▦"], ["table", "▤"] ].map(([v, ic]) => (
                  <button key={v} title={`${v[0].toUpperCase()}${v.slice(1)} view`} onClick={() => setView(v)} style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: viewMode === v ? C.ac : "transparent", color: viewMode === v ? "#fff" : C.ts, cursor: "pointer", fontSize: 13, fontFamily: ft }}>{ic}</button>
                ))}
              </div>
              <button onClick={() => setShowFilters(!showFilters)} style={actionBtn(showFilters, "neutral")}>
                {showFilters ? "Hide Filters" : "Show Filters"}
              </button>
            </div>

            {showFilters && (
              <div style={{ ...cS, padding: "12px 14px", marginBottom: 14 }}>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                  <button onClick={() => setMarketingStatusFilter("all")} style={mkP(marketingStatusFilter === "all", C.ac, C.al)}>All {marketingSummary.items}</button>
                  <button onClick={() => setMarketingStatusFilter("active")} style={mkP(marketingStatusFilter === "active", C.pr, C.pb)}>In Progress {marketingSummary.creating + marketingSummary.reviewing + marketingSummary.revising + marketingSummary.editing}</button>
                  {MARKETING_STATUSES.map(status => (
                    <button key={status.id} onClick={() => setMarketingStatusFilter(marketingStatusFilter === status.id ? "all" : status.id)} style={mkP(marketingStatusFilter === status.id, marketingStatusTone(status.id, C).tone, marketingStatusTone(status.id, C).bg)}>
                      {status.icon} {status.label} {marketingStatusCounts[status.id]}
                    </button>
                  ))}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "minmax(180px,260px) minmax(180px,260px) minmax(180px,260px) auto", gap: 8, alignItems: "center", marginBottom: 8 }}>
                  <label style={{ fontSize: 11, color: C.tt, display: "grid", gap: 4 }}>
                    <span>Campaign</span>
                    <select
                      value={marketingCampaignFilter}
                      onChange={e => setMarketingCampaignFilter(e.target.value)}
                      style={{ ...iS, width: "100%", padding: "8px 10px", fontSize: 12 }}
                    >
                      <option value="all">All Campaigns</option>
                      <option value="No campaign">No campaign</option>
                      {marketingCampaignOptions.map(campaign => (
                        <option key={campaign} value={campaign}>{campaign}</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ fontSize: 11, color: C.tt, display: "grid", gap: 4 }}>
                    <span>Owner Scope</span>
                    <select
                      value={marketingOwnerFilter}
                      onChange={e => setMarketingOwnerFilter(e.target.value)}
                      style={{ ...iS, width: "100%", padding: "8px 10px", fontSize: 12 }}
                    >
                      <option value="__view__">Current view ({workspaceUser === ALL_USER_VIEW ? "All" : workspaceUser === UNASSIGNED_USER_VIEW ? "Unassigned" : workspaceUser})</option>
                      <option value="all">All owners</option>
                      <option value="">Unassigned only</option>
                      {(proj?.teamUsers || DEFAULT_TEAM_USERS).map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </label>
                  <label style={{ fontSize: 11, color: C.tt, display: "grid", gap: 4 }}>
                    <span>Group</span>
                    <select
                      value={marketingGroupFilter}
                      onChange={e => setMarketingGroupFilter(e.target.value)}
                      style={{ ...iS, width: "100%", padding: "8px 10px", fontSize: 12 }}
                    >
                      <option value="all">All Groups</option>
                      {marketingGroupOptions.map(group => (
                        <option key={group.id} value={group.id}>
                          {group.name} ({group.assignmentIds.length})
                        </option>
                      ))}
                    </select>
                  </label>
                  <button onClick={() => setShowProjectMenu(true)} style={{ ...actionBtn(false, "neutral"), alignSelf: "end" }}>
                    {isMarketingProject ? "Campaigns + Groups" : "Settings"}
                  </button>
                </div>

                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <button onClick={() => setMarketingTrafficFilter("all")} style={mkP(marketingTrafficFilter === "all", C.ac, C.al)}>All Traffic</button>
                  {MARKETING_TRAFFIC_TYPES.map(type => (
                    <button key={type} onClick={() => setMarketingTrafficFilter(marketingTrafficFilter === type ? "all" : type)} style={mkP(marketingTrafficFilter === type, C.ac, C.al)}>{type}</button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ fontSize: 12, color: C.tt, marginBottom: 12 }}>
              {filteredMarketingItems.length} assignment{filteredMarketingItems.length !== 1 ? "s" : ""} shown
              {marketingSummary.items !== filteredMarketingItems.length ? ` · ${marketingScopeLabel}` : ""}
              {activeMarketingGroup ? ` · group: ${activeMarketingGroup.name}` : ""}
              {selectedMarketingIds.size ? ` · ${selectedMarketingIds.size} selected` : ""}
            </div>

            {viewMode === "list" && (
              <div style={{ display: "grid", gap: 8 }}>
                {filteredMarketingItems.map((item, i) => {
                  const tone = marketingStatusTone(item.status, C);
                  const primary = marketingItemPrimaryLabel(item);
                  const titleLabel = marketingItemTitleLabel(item);
                  const isSelected = selectedMarketingIds.has(item.id);
                  return (
                    <div
                      key={item.id}
                      onClick={() => marketingSelectionMode ? toggleMarketingSelection(item.id) : openMarketingItemModal(item)}
                      style={{
                        ...cS,
                        padding: "14px 18px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        transition: "all 0.15s",
                        animation: `fu 0.2s ease ${Math.min(i, 15) * 0.02}s both`,
                        borderColor: isSelected ? C.ac : C.bd,
                        background: isSelected ? C.al : C.sf,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 14, fontWeight: 700 }}>{primary}</span>
                          {marketingSelectionMode && <span style={{ ...mkP(true, isSelected ? C.ac : C.tt, isSelected ? C.al : C.sa), cursor: "pointer" }}>{isSelected ? "Selected" : "Select"}</span>}
                          <span style={{ ...mkP(true, tone.tone, tone.bg), cursor: "pointer" }}>{MM[item.status]?.label}</span>
                          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 12, background: C.sa, color: C.ts, border: `1px solid ${C.bd}` }}>{item.talentType}</span>
                          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 12, background: C.sa, color: item.owner ? C.ts : C.rd, border: `1px solid ${C.bd}` }}>{item.owner || "Unassigned"}</span>
                        </div>
                        <div style={{ fontSize: 11, color: C.ts, marginTop: 3, display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <span>{item.campaign || "No campaign"}</span>
                          <span>{item.trafficType}</span>
                          <span>{marketingChannelsLabel(item)}</span>
                          {item.deliverableType && <span>{item.deliverableType}</span>}
                          {marketingDueLabel(item, clockNow) && <span style={{ color: item.dueDate < operationalTodayISOFor(clockNow) ? C.rd : C.ab }}>{marketingDueLabel(item, clockNow)}</span>}
                        </div>
                        {titleLabel && <div style={{ fontSize: 11, color: C.tt, marginTop: 5 }}>{titleLabel}</div>}
                        {item.status === "rejected" && item.rejectedReason && (
                          <div style={{ fontSize: 11, color: C.rd, marginTop: 6, lineHeight: 1.5 }}>
                            Rejected: {item.rejectedReason}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        {item.briefUrl && <a href={item.briefUrl} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{ ...actionBtn(false, "neutral"), textDecoration: "none" }}>Brief</a>}
                        {item.contentUrl && <a href={item.contentUrl} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{ ...actionBtn(false, "neutral"), textDecoration: "none" }}>Content</a>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {viewMode === "kanban" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, alignItems: "start", paddingBottom: 20 }}>
                {MARKETING_STATUSES.map(status => {
                  const tone = marketingStatusTone(status.id, C);
                  const col = filteredMarketingItems.filter(item => item.status === status.id);
                  return (
                    <div key={status.id} style={{ minWidth: 0 }}>
                      <div style={{ padding: "10px 12px", borderRadius: 12, border: `1px solid ${tone.tone}`, background: tone.bg, fontSize: 12, fontWeight: 700, color: tone.tone, marginBottom: 8 }}>
                        {status.icon} {status.label} ({col.length})
                      </div>
                      <div style={{ display: "grid", gap: 8 }}>
                        {col.map(item => (
                          <button
                            key={item.id}
                            onClick={() => marketingSelectionMode ? toggleMarketingSelection(item.id) : openMarketingItemModal(item)}
                            style={{
                              ...cS,
                              padding: "12px 14px",
                              textAlign: "left",
                              cursor: "pointer",
                              fontFamily: ft,
                              borderColor: selectedMarketingIds.has(item.id) ? C.ac : C.bd,
                              background: selectedMarketingIds.has(item.id) ? C.al : C.sf,
                            }}
                          >
                            <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, marginBottom: 4 }}>{marketingItemPrimaryLabel(item)}</div>
                            {marketingSelectionMode && (
                              <div style={{ fontSize: 10, marginBottom: 5, color: selectedMarketingIds.has(item.id) ? C.ac : C.tt }}>
                                {selectedMarketingIds.has(item.id) ? "Selected" : "Click to select"}
                              </div>
                            )}
                            <div style={{ fontSize: 11, color: C.ts }}>{item.talentType} · {marketingCampaignsLabel(item)} · {item.trafficType} · {marketingChannelsLabel(item)}</div>
                            {marketingItemTitleLabel(item) && <div style={{ fontSize: 11, color: C.tt, marginTop: 5 }}>{marketingItemTitleLabel(item)}</div>}
                            {item.status === "rejected" && item.rejectedReason && (
                              <div style={{ fontSize: 10, color: C.rd, marginTop: 6, lineHeight: 1.5 }}>Rejected: {item.rejectedReason}</div>
                            )}
                            <div style={{ fontSize: 11, color: C.tt, marginTop: 6 }}>{item.owner || "Unassigned"}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {viewMode === "table" && (
              <div style={{ ...cS, overflow: "hidden", marginBottom: 12 }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead style={{ background: C.sa }}>
                      <tr>
                        {["Talent", "Type", "Title", "Campaign", "Traffic", "Channels", "Deliverable", "Owner", "Status", "Rejected Reason", "Due", "Links", "Updated"].map(h => (
                          <th key={h} style={{ textAlign: "left", padding: "10px 12px", color: C.ts, fontSize: 11, borderBottom: `1px solid ${C.bd}` }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMarketingItems.map(item => {
                        const tone = marketingStatusTone(item.status, C);
                        return (
                          <tr
                            key={item.id}
                            onClick={() => marketingSelectionMode ? toggleMarketingSelection(item.id) : openMarketingItemModal(item)}
                            style={{ cursor: "pointer", background: selectedMarketingIds.has(item.id) ? C.al : "transparent" }}
                          >
                            <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.sa}`, fontWeight: 700 }}>{marketingItemPrimaryLabel(item)}</td>
                            <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.sa}`, color: C.ts }}>{item.talentType}</td>
                            <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.sa}`, color: C.ts }}>{marketingItemTitleLabel(item) || "—"}</td>
                            <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.sa}`, color: C.ts }}>{item.campaign || "—"}</td>
                            <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.sa}`, color: C.ts }}>{item.trafficType}</td>
                            <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.sa}`, color: C.ts }}>{marketingChannelsLabel(item)}</td>
                            <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.sa}`, color: C.ts }}>{item.deliverableType || "—"}</td>
                            <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.sa}`, color: item.owner ? C.tx : C.rd }}>{item.owner || "Unassigned"}</td>
                            <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.sa}` }}><span style={{ ...mkP(true, tone.tone, tone.bg), cursor: "pointer" }}>{MM[item.status]?.label}</span></td>
                            <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.sa}`, color: item.rejectedReason ? C.rd : C.tt }}>{item.rejectedReason || "—"}</td>
                            <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.sa}`, color: C.ts }}>{marketingShowsDue(item) && item.dueDate ? sD(item.dueDate) : "—"}</td>
                            <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.sa}`, color: C.ts }}>
                              {item.briefUrl && <a href={item.briefUrl} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{ marginRight: 8 }}>Brief</a>}
                              {item.contentUrl && <a href={item.contentUrl} target="_blank" rel="noopener" onClick={e => e.stopPropagation()}>Content</a>}
                            </td>
                            <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.sa}`, color: C.tt }}>{rD(item.updatedAt)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {!isMarketingProject && projectMode === "work" && (
          <div style={{ ...cS, padding: "12px 14px", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: showQueue ? 10 : 0, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{isCuratorProject ? "Curator Queue" : "Today Queue"}</div>
                <div style={{ fontSize: 11, color: C.tt }}>
                  {operationalDayLabel} · {isCuratorProject ? "highest-priority curator actions for the current scope" : "highest-priority actions for the current scope"} · resets at 6:00 AM
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button onClick={() => workspaceUser === currentActor ? changeWorkspaceUser(ALL_USER_VIEW) : changeWorkspaceUser(currentActor)} style={actionBtn(false, "neutral")}>
                  {workspaceUser === currentActor ? "Team Queue" : `My Queue (${currentActor})`}
                </button>
                <button onClick={() => setShowQueue(!showQueue)} style={actionBtn(false, "neutral")}>
                  {showQueue ? "Minimize" : "Expand"}
                </button>
                <button onClick={() => setProjectMode("report")} style={actionBtn(false, "neutral")}>Open Reports</button>
              </div>
            </div>
            {showQueue && (
              queue.length > 0 ? (
                <div style={{ display: "grid", gap: 6 }}>
                  {queue.slice(0, 6).map((q, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, border: `1px solid ${C.bd}`, background: C.sa }}>
                      <button onClick={() => openQuickArtist(q.artist)} style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, background: "none", border: "none", cursor: "pointer", fontFamily: ft, textAlign: "left", padding: 0 }}>
                        <span style={{ fontSize: 14 }}>{q.icon}</span>
                        <span style={{ fontWeight: 700, minWidth: 120, color: C.tx }}>{q.artist.n}</span>
                        <span style={{ color: C.ts, flex: 1, fontSize: 12 }}>{q.label}</span>
                        <span style={{ ...mkP(true, sc(q.artist.stage, C), sb(q.artist.stage, C)), fontSize: 10, padding: "2px 8px", cursor: "pointer" }}>{SM[q.artist.stage]?.label}</span>
                      </button>
                      {!q.artist.owner && !isReadOnly && (
                        <button onClick={() => assignOwner(q.artist.n, currentActor)} style={{ ...actionBtn(true, "good"), padding: "6px 10px", fontSize: 11 }}>
                          Assign to Me
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: C.ts }}>No queued {isCuratorProject ? "curator " : ""}actions for this scope right now. Last refreshed {queueUpdatedLabel}.</div>
              )
            )}
          </div>
        )}

        {!isMarketingProject && projectMode === "work" && (
          <div style={{ ...cS, padding: "12px 14px", marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{isCuratorProject ? "Curator Board" : "Status Board"}</div>
                <div style={{ fontSize: 11, color: C.tt }}>{isCuratorProject ? "Quick filter by curator stage." : "Quick filter by stage."}</div>
              </div>
              {sf !== "all" && <button onClick={() => setSf("all")} style={actionBtn(false, "neutral")}>Clear Status Filter</button>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(118px,1fr))", gap: 8 }}>
              <button onClick={() => setSf(sf === "contacted" ? "all" : "contacted")} style={{ textAlign: "left", padding: "10px 12px", borderRadius: 12, border: `1px solid ${sf === "contacted" ? C.ac : C.bd}`, background: sf === "contacted" ? C.al : C.sf, cursor: "pointer", fontFamily: ft }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: sf === "contacted" ? C.ac : C.ts, marginBottom: 6 }}>◌ Contacted</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: sf === "contacted" ? C.ac : C.tx, lineHeight: 1 }}>{contactedCount}</div>
              </button>
              {STAGES.map(stage => (
                <button key={stage.id} onClick={() => setSf(sf === stage.id ? "all" : stage.id)} style={{ textAlign: "left", padding: "10px 12px", borderRadius: 12, border: `1px solid ${sf === stage.id ? sc(stage.id, C) : C.bd}`, background: sf === stage.id ? sb(stage.id, C) : C.sf, cursor: "pointer", fontFamily: ft }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: sf === stage.id ? sc(stage.id, C) : C.ts, marginBottom: 6 }}>{stage.icon} {stage.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: sf === stage.id ? sc(stage.id, C) : C.tx, lineHeight: 1 }}>{stCounts[stage.id] || 0}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {isArProject && projectMode === "report" && (
          <div style={{ ...cS, padding: "16px 20px", marginBottom: 16, animation: "si 0.2s ease" }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>🧪 A/B Performance by Genre</div>
            {abRows.length > 0 ? (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${C.bd}`, textAlign: "left" }}>
                      {["Genre", "Channel", "Winner", "Winner Rate", "Confidence", "Total Sent", "Total Replies", "Variants"].map(h => (
                        <th key={h} style={{ padding: "8px 10px", fontWeight: 600, color: C.ts, fontSize: 11, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {abRows.map((r, i) => (
                      <tr key={`${r.bucket}_${r.channel}_${i}`} style={{ borderBottom: `1px solid ${C.sa}` }}>
                        <td style={{ padding: "8px 10px", fontWeight: 600 }}>{r.bucket}</td>
                        <td style={{ padding: "8px 10px", color: C.ts }}>{r.channel.toUpperCase()}</td>
                        <td style={{ padding: "8px 10px" }}>v{r.best.variantId}</td>
                        <td style={{ padding: "8px 10px", color: C.gn }}>{r.best.rr}%</td>
                        <td style={{ padding: "8px 10px", color: C.ts }}>{r.best.confidence}%</td>
                        <td style={{ padding: "8px 10px", color: C.ts }}>{r.totalSent}</td>
                        <td style={{ padding: "8px 10px", color: C.ts }}>{r.totalReplied}</td>
                        <td style={{ padding: "8px 10px", color: C.ts, fontSize: 11 }}>
                          {r.variants.map(v => `v${v.variantId}:${v.sent}s/${v.replied}r/${v.confidence}%`).join(" · ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: C.tt }}>No A/B data yet. Send from detail drafts to start logging variants.</div>
            )}
          </div>
        )}

        {!isMarketingProject && projectMode === "report" && (
          <div style={{ ...cS, padding: "16px 20px", marginBottom: 16, animation: "si 0.2s ease" }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
              {isCuratorProject ? `🎯 Curator Queue · ${reportViewLabel}` : `🎯 Smart Queue - Top Actions · ${reportViewLabel}`}
            </div>
            {queue.length > 0 ? (
              <div style={{ display: "grid", gap: 6 }}>
                {queue.slice(0, 12).map((q, i) => (
                  <div key={i} onClick={() => openQuickArtist(q.artist)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, background: C.sa, cursor: "pointer", fontSize: 12, transition: "background 0.15s" }} onMouseEnter={e => { e.currentTarget.style.background = C.sh; }} onMouseLeave={e => { e.currentTarget.style.background = C.sa; }}>
                    <span style={{ fontSize: 14 }}>{q.icon}</span>
                    <span style={{ fontWeight: 600, minWidth: 120 }}>{q.artist.n}</span>
                    <span style={{ color: C.ts, flex: 1 }}>{q.label}</span>
                    <span style={{ ...mkP(true, sc(q.artist.stage, C), sb(q.artist.stage, C)), fontSize: 10, padding: "2px 8px" }}>{SM[q.artist.stage]?.label}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: C.tt }}>No queued actions in the selected reporting scope.</div>
            )}
          </div>
        )}

        {isArProject && projectMode === "inbox" && (
          <div style={{ display: "grid", gap: 14, marginBottom: 16 }}>
            <div style={{ ...cS, padding: "16px 18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>Joint Inbox</div>
                  <div style={{ fontSize: 11, color: C.tt }}>
                    Shared thread view across this project. New replies appear after you sync an artist inbox. Sent Gmail threads land here automatically.
                  </div>
                </div>
                <div style={{ fontSize: 11, color: C.tt }}>
                  {gmailConnected ? `Connected mailbox: ${gmailConnectionMeta?.provider_email || "ready"}` : "Connect your Gmail from the top action bar"}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(160px, 1.4fr) repeat(5, minmax(120px, 1fr))", gap: 8 }}>
                <input value={inboxArtistQuery} onChange={e => setInboxArtistQuery(e.target.value)} placeholder="Search artist, subject, or email" style={{ ...iS, width: "100%" }} />
                <select value={inboxStageFilter} onChange={e => setInboxStageFilter(e.target.value)} style={{ ...iS, padding: "8px 10px", fontSize: 12 }}>
                  <option value="all">All Stages</option>
                  <option value="contacted">Contacted</option>
                  {STAGES.map(stage => <option key={stage.id} value={stage.id}>{stage.label}</option>)}
                </select>
                <select value={inboxOwnerFilter} onChange={e => setInboxOwnerFilter(e.target.value)} style={{ ...iS, padding: "8px 10px", fontSize: 12 }}>
                  <option value="all">All Owners</option>
                  <option value="__unassigned__">Unassigned</option>
                  {(proj.teamUsers || []).map(owner => <option key={owner} value={owner}>{owner}</option>)}
                </select>
                <select value={inboxMailboxFilter} onChange={e => setInboxMailboxFilter(e.target.value)} style={{ ...iS, padding: "8px 10px", fontSize: 12 }}>
                  <option value="all">All Mailboxes</option>
                  {inboxMailboxOptions.map(conn => (
                    <option key={conn.userId} value={conn.userId}>{conn.workspaceEmail.split("@")[0]} · {conn.gmailEmail}</option>
                  ))}
                </select>
                <select value={inboxInboundDays} onChange={e => setInboxInboundDays(e.target.value)} style={{ ...iS, padding: "8px 10px", fontSize: 12 }}>
                  <option value="all">Any inbound age</option>
                  <option value="3">Inbound last 3d</option>
                  <option value="7">Inbound last 7d</option>
                  <option value="14">Inbound last 14d</option>
                  <option value="30">Inbound last 30d</option>
                </select>
                <label style={{ ...iS, display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                  <input type="checkbox" checked={inboxNeedsReplyOnly} onChange={e => setInboxNeedsReplyOnly(e.target.checked)} />
                  Needs reply
                </label>
              </div>
            </div>

            <div style={{ ...cS, padding: "12px 14px" }}>
              <div style={{ display: "grid", gridTemplateColumns: selectedProjectThread ? "380px 1fr" : "1fr", gap: 14 }}>
                <div style={{ border: `1px solid ${C.bd}`, borderRadius: 14, overflow: "hidden", background: C.sa }}>
                  <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.bd}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>Threads</div>
                      <div style={{ fontSize: 10, color: C.tt }}>{projectInboxThreads.length} visible · updated {queueUpdatedLabel}</div>
                    </div>
                    {projectInboxLoading && <span style={{ fontSize: 10, color: C.tt }}>Loading…</span>}
                  </div>
                  <div style={{ maxHeight: "70vh", overflowY: "auto", padding: 10, display: "grid", gap: 8 }}>
                    {projectInboxThreads.length ? projectInboxThreads.map(thread => (
                      <button
                        key={thread.threadKey}
                        onClick={() => selectProjectInboxThread(thread)}
                        style={{
                          textAlign: "left",
                          padding: "12px 12px",
                          borderRadius: 12,
                          border: `1px solid ${selectedProjectThread?.threadKey === thread.threadKey ? C.ac : C.bd}`,
                          background: selectedProjectThread?.threadKey === thread.threadKey ? C.al : C.sf,
                          cursor: "pointer",
                          fontFamily: ft,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 800, color: C.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{thread.artistName}</div>
                            <div style={{ fontSize: 11, color: C.ts, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{thread.subject || "No subject"}</div>
                          </div>
                          <span style={{ fontSize: 10, color: thread.lastMessageDirection === "inbound" ? C.gn : C.bu, fontWeight: 700 }}>
                            {thread.lastMessageDirection === "inbound" ? "Inbound" : thread.lastMessageDirection === "outbound" ? "Outbound" : "None"}
                          </span>
                        </div>
                        <div className="gf-thread-card-snippet" style={{ marginBottom: 6 }}>{thread.snippet || "No preview yet."}</div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                          <span style={{ ...mkP(true, thread.artist ? sc(thread.artist.stage, C) : C.tt, thread.artist ? sb(thread.artist.stage, C) : C.sa), cursor: "default", fontSize: 10, padding: "2px 8px" }}>
                            {thread.artist ? SM[thread.artist.stage]?.label : "No artist"}
                          </span>
                          <span style={{ ...mkP(true, thread.status === "closed" ? C.tt : thread.status === "waiting" ? C.ab : C.ac, thread.status === "closed" ? C.sa : thread.status === "waiting" ? C.abb : C.al), cursor: "default", fontSize: 10, padding: "2px 8px" }}>
                            {thread.status}
                          </span>
                          {thread.needsReply && <span style={{ ...mkP(true, C.rd, C.rb), cursor: "default", fontSize: 10, padding: "2px 8px" }}>Needs reply</span>}
                          {thread.internalNote && <span style={{ ...mkP(true, C.ab, C.abb), cursor: "default", fontSize: 10, padding: "2px 8px" }}>Team note</span>}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 10, color: C.tt, flexWrap: "wrap" }}>
                          <span>{thread.mailboxLabel}</span>
                          <span>{thread.artist?.owner || "Unassigned"} · {thread.artist?.followUp ? sD(thread.artist.followUp) : "No follow-up"}</span>
                          <span>{rD(thread.lastMessageAt)}</span>
                        </div>
                      </button>
                    )) : (
                      <div style={{ fontSize: 12, color: C.ts, padding: "14px 8px" }}>
                        No synced threads match the current filters.
                      </div>
                    )}
                  </div>
                </div>

                {selectedProjectThread && (
                  <div style={{ border: `1px solid ${C.bd}`, borderRadius: 14, background: C.sf, overflow: "hidden" }}>
                    <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.bd}`, background: C.sa }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                          <div>
                            <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.25, overflowWrap: "anywhere" }}>{selectedProjectThread.subject || "No subject"}</div>
                            <div style={{ fontSize: 11, color: C.tt, marginTop: 3 }}>
                              {selectedProjectThread.artistName} · {selectedProjectThread.mailboxLabel} · last activity {rD(selectedProjectThread.lastMessageAt)}
                            </div>
                          </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {selectedProjectThread.artist && (
                            <button onClick={() => openA(selectedProjectThread.artist)} style={actionBtn(false, "accent")}>Open Artist</button>
                          )}
                          <button
                            onClick={() => deleteInboxThreads(selectedProjectThread.sourceThreadKeys || [selectedProjectThread.primaryThreadKey || selectedProjectThread.threadKey], `the synced conversation for ${selectedProjectThread.artistName}`)}
                            disabled={threadWorkflowSaving || isReadOnly}
                            style={Object.assign({}, actionBtn(false, "danger"), lockStyle(threadWorkflowSaving || isReadOnly))}
                          >
                            Delete Thread
                          </button>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                        <span style={{ ...mkP(true, selectedProjectThread.artist ? sc(selectedProjectThread.artist.stage, C) : C.tt, selectedProjectThread.artist ? sb(selectedProjectThread.artist.stage, C) : C.sa), cursor: "default" }}>
                          {selectedProjectThread.artist ? SM[selectedProjectThread.artist.stage]?.label : "No artist"}
                        </span>
                        <span style={{ ...mkP(true, selectedProjectThread.artist?.owner ? C.ts : C.rd, C.sa), cursor: "default" }}>
                          Owner: {selectedProjectThread.artist?.owner || "Unassigned"}
                        </span>
                        <span style={{ ...mkP(true, C.ts, C.sa), cursor: "default" }}>
                          Next follow-up: {selectedProjectThread.artist?.followUp ? sD(selectedProjectThread.artist.followUp) : "Not set"}
                        </span>
                        <span style={{ ...mkP(true, threadIsActionable(selectedProjectThread) ? C.rd : C.ts, threadIsActionable(selectedProjectThread) ? C.rb : C.sa), cursor: "default" }}>
                          {threadIsActionable(selectedProjectThread) ? "Needs reply" : "No reply needed"}
                        </span>
                      </div>
                    </div>

                    <div style={{ padding: 16, borderBottom: `1px solid ${C.bd}`, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                      <label style={{ fontSize: 11, color: C.ts, display: "grid", gap: 4 }}>
                        <span>Thread owner</span>
                        <select
                          value={selectedProjectThread.threadOwnerUserId || ""}
                          disabled={threadWorkflowSaving || isReadOnly}
                          onChange={e => updateInboxThread(selectedProjectThread.sourceThreadKeys || [selectedProjectThread.primaryThreadKey || selectedProjectThread.threadKey], { threadOwnerUserId: e.target.value })}
                          style={{ ...iS, padding: "7px 10px", fontSize: 12, ...lockStyle(threadWorkflowSaving || isReadOnly) }}
                        >
                          <option value="">Unassigned</option>
                          {inboxMailboxOptions.map(conn => (
                            <option key={conn.userId} value={conn.userId}>{conn.workspaceEmail.split("@")[0]} · {conn.gmailEmail}</option>
                          ))}
                        </select>
                      </label>
                      <label style={{ fontSize: 11, color: C.ts, display: "grid", gap: 4 }}>
                        <span>Status</span>
                        <select
                          value={selectedProjectThread.status || "open"}
                          disabled={threadWorkflowSaving || isReadOnly}
                          onChange={e => updateInboxThread(selectedProjectThread.sourceThreadKeys || [selectedProjectThread.primaryThreadKey || selectedProjectThread.threadKey], { status: e.target.value })}
                          style={{ ...iS, padding: "7px 10px", fontSize: 12, ...lockStyle(threadWorkflowSaving || isReadOnly) }}
                        >
                          <option value="open">Open</option>
                          <option value="waiting">Waiting</option>
                          <option value="closed">Closed</option>
                        </select>
                      </label>
                      <label style={{ fontSize: 11, color: C.ts, display: "grid", gap: 4 }}>
                        <span>Thread follow-up</span>
                        <input
                          type="date"
                          value={selectedProjectThread.nextFollowUpAt ? String(selectedProjectThread.nextFollowUpAt).slice(0, 10) : ""}
                          disabled={threadWorkflowSaving || isReadOnly}
                          onChange={e => updateInboxThread(selectedProjectThread.sourceThreadKeys || [selectedProjectThread.primaryThreadKey || selectedProjectThread.threadKey], { nextFollowUpAt: e.target.value })}
                          style={{ ...iS, padding: "7px 10px", fontSize: 12, ...lockStyle(threadWorkflowSaving || isReadOnly) }}
                        />
                      </label>
                    </div>

                    <div style={{ padding: 16, borderBottom: `1px solid ${C.bd}`, background: C.abb }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.ab }}>Internal team note</div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            onClick={() => updateInboxThread(selectedProjectThread.sourceThreadKeys || [selectedProjectThread.primaryThreadKey || selectedProjectThread.threadKey], { internalNote: projectThreadNoteDraft })}
                            disabled={threadWorkflowSaving || isReadOnly || projectThreadNoteDraft === String(selectedProjectThread.internalNote || "")}
                            style={{ padding: "6px 10px", borderRadius: 9, border: `1px solid ${C.abd}`, background: "#fff8cc", color: C.ab, cursor: threadWorkflowSaving || isReadOnly || projectThreadNoteDraft === String(selectedProjectThread.internalNote || "") ? "not-allowed" : "pointer", fontSize: 11, fontFamily: ft, ...lockStyle(threadWorkflowSaving || isReadOnly || projectThreadNoteDraft === String(selectedProjectThread.internalNote || "")) }}
                          >
                            Save note
                          </button>
                          <button
                            onClick={() => updateInboxThread(selectedProjectThread.sourceThreadKeys || [selectedProjectThread.primaryThreadKey || selectedProjectThread.threadKey], { status: "closed" })}
                            disabled={threadWorkflowSaving || isReadOnly || selectedProjectThread.status === "closed"}
                            style={{ padding: "6px 10px", borderRadius: 9, border: `1px solid ${C.bd}`, background: C.sf, color: C.ts, cursor: threadWorkflowSaving || isReadOnly || selectedProjectThread.status === "closed" ? "not-allowed" : "pointer", fontSize: 11, fontFamily: ft, ...lockStyle(threadWorkflowSaving || isReadOnly || selectedProjectThread.status === "closed") }}
                          >
                            Mark Done
                          </button>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: C.ts, marginBottom: 8 }}>Yellow note only for the team. This never sends to the contact.</div>
                      <textarea
                        value={projectThreadNoteDraft}
                        readOnly={isReadOnly}
                        onChange={e => setProjectThreadNoteDraft(e.target.value)}
                        placeholder="Leave an internal note for this thread..."
                        style={{ ...iS, width: "100%", minHeight: 78, resize: "vertical", fontSize: 12, background: "#fff8cc", borderColor: C.abd, ...lockStyle(isReadOnly) }}
                      />
                      {selectedProjectThread.internalNoteUpdatedAt && (
                        <div style={{ fontSize: 10, color: C.tt, marginTop: 6 }}>
                          Updated {rD(selectedProjectThread.internalNoteUpdatedAt)}{selectedProjectThread.internalNoteUpdatedBy ? ` by ${selectedProjectThread.internalNoteUpdatedBy}` : ""}
                        </div>
                      )}
                    </div>

                    <div style={{ maxHeight: 360, overflowY: "auto", padding: 16, display: "grid", gap: 10, borderBottom: `1px solid ${C.bd}` }}>
                      {selectedProjectThreadMessages.length ? selectedProjectThreadMessages.map((message) => (
                        <div key={message.messageKey} style={{ border: `1px solid ${message.direction === "inbound" ? C.bd : C.gd}`, borderRadius: 12, padding: "10px 12px", background: message.direction === "inbound" ? C.sa : C.gb }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: C.tx }}>
                              {message.direction === "inbound" ? "Inbound" : "Outbound"} · {message.senderEmail || message.senderGmailEmail}
                            </div>
                            <div style={{ fontSize: 10, color: C.tt }}>{new Date(message.sentAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
                          </div>
                          <div style={{ fontSize: 12, color: C.ts, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                            {message.bodyText || message.snippet || "No message body"}
                          </div>
                          {message.direction === "inbound" && (
                            <div style={{ marginTop: 8 }}>
                              <button onClick={() => setReplyInput(message.bodyText || message.snippet || "")} style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${C.ac}`, background: C.al, color: C.ac, cursor: "pointer", fontSize: 11, fontFamily: ft }}>
                                Use as AI Context
                              </button>
                            </div>
                          )}
                        </div>
                      )) : (
                        <div style={{ fontSize: 12, color: C.ts }}>No messages loaded for this thread yet.</div>
                      )}
                    </div>

                    <div style={{ padding: 16, background: C.sa }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                        <span style={{ fontSize: 11, color: C.ts }}>Send as</span>
                        <select value={gmailSendUserId} disabled={isReadOnly || !inboxMailboxOptions.length} onChange={e => setGmailSendUserId(e.target.value)} style={{ ...iS, padding: "6px 10px", fontSize: 11, minWidth: 240, ...lockStyle(isReadOnly || !inboxMailboxOptions.length) }}>
                          <option value="">Select mailbox</option>
                          {inboxMailboxOptions.map((conn) => (
                            <option key={conn.userId} value={conn.userId}>
                              {conn.workspaceEmail.split("@")[0]} · {conn.gmailEmail}
                            </option>
                          ))}
                        </select>
                        {latestProjectInboundMessage && <span style={{ fontSize: 11, color: C.tt }}>Latest inbound: {rD(latestProjectInboundMessage.sentAt)}</span>}
                        {selectedProjectThread.artist && (
                          <button onClick={() => syncArtistInbox(selectedProjectThread.artist, selectedProjectThread.senderUserId)} disabled={syncingInbox || isReadOnly} style={{ padding: "6px 10px", borderRadius: 9, border: `1px solid ${C.bd}`, background: C.sf, color: C.ts, cursor: syncingInbox || isReadOnly ? "not-allowed" : "pointer", fontSize: 11, fontFamily: ft, ...lockStyle(syncingInbox || isReadOnly) }}>
                            {syncingInbox ? "Syncing..." : "Sync This Artist"}
                          </button>
                        )}
                      </div>
                      <textarea value={gmailReplyDraft} readOnly={isReadOnly} onChange={e => setGmailReplyDraft(e.target.value)} placeholder="Write a reply here. Everyone in the project can see synced thread history." style={{ ...iS, width: "100%", minHeight: 120, resize: "vertical", fontSize: 12, ...lockStyle(isReadOnly) }} />
                      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                        <button onClick={() => sendProjectInboxReply(selectedProjectThread)} disabled={gmailSending || !gmailSendUserId || isReadOnly} style={{ padding: "7px 14px", borderRadius: 10, border: "none", background: gmailSending ? C.bl : C.ac, color: "#fff", cursor: gmailSending || !gmailSendUserId || isReadOnly ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600, fontFamily: ft, ...lockStyle(gmailSending || !gmailSendUserId || isReadOnly) }}>
                          {gmailSending ? "Sending..." : "Send Reply"}
                        </button>
                        <button onClick={() => latestProjectInboundMessage && setReplyInput(latestProjectInboundMessage.bodyText || latestProjectInboundMessage.snippet || "")} disabled={!latestProjectInboundMessage} style={{ padding: "7px 12px", borderRadius: 10, border: `1px solid ${C.bd}`, background: "transparent", color: C.ts, cursor: latestProjectInboundMessage ? "pointer" : "not-allowed", fontSize: 11, fontFamily: ft, opacity: latestProjectInboundMessage ? 1 : 0.55 }}>
                          Use Latest Inbound
                        </button>
                        <button onClick={() => selectedProjectThread.artist && runReplyClassifier(selectedProjectThread.artist, latestProjectInboundMessage?.bodyText || latestProjectInboundMessage?.snippet || "")} disabled={!selectedProjectThread.artist || replyLoading || isReadOnly} style={{ padding: "7px 12px", borderRadius: 10, border: `1px solid ${C.ac}`, background: C.al, color: C.ac, cursor: !selectedProjectThread.artist || replyLoading || isReadOnly ? "not-allowed" : "pointer", fontSize: 11, fontFamily: ft, opacity: selectedProjectThread.artist ? 1 : 0.55, ...lockStyle(!selectedProjectThread.artist || replyLoading || isReadOnly) }}>
                          {replyLoading ? "Analyzing..." : "Analyze Reply"}
                        </button>
                        <button onClick={() => selectedProjectThread.artist && runFollowUpWriter(selectedProjectThread.artist, latestProjectInboundMessage?.bodyText || latestProjectInboundMessage?.snippet || "")} disabled={!selectedProjectThread.artist || followUpLoading || isReadOnly} style={{ padding: "7px 12px", borderRadius: 10, border: `1px solid ${C.pr}`, background: C.pb, color: C.pr, cursor: !selectedProjectThread.artist || followUpLoading || isReadOnly ? "not-allowed" : "pointer", fontSize: 11, fontFamily: ft, opacity: selectedProjectThread.artist ? 1 : 0.55, ...lockStyle(!selectedProjectThread.artist || followUpLoading || isReadOnly) }}>
                          {followUpLoading ? "Generating..." : "AI Follow-up"}
                        </button>
                        {replyResult?.draftResponse && (
                          <button onClick={() => setGmailReplyDraft(replyResult.draftResponse)} style={{ padding: "7px 12px", borderRadius: 10, border: `1px solid ${C.pr}`, background: C.pb, color: C.pr, cursor: "pointer", fontSize: 11, fontFamily: ft }}>
                            Load AI Reply Draft
                          </button>
                        )}
                        {followUpDraft && (
                          <button onClick={() => setGmailReplyDraft(followUpDraft)} style={{ padding: "7px 12px", borderRadius: 10, border: `1px solid ${C.abd}`, background: C.abb, color: C.ab, cursor: "pointer", fontSize: 11, fontFamily: ft }}>
                            Load AI Follow-up
                          </button>
                        )}
                      </div>
                      {replyResult && (
                        <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.bd}`, background: C.sf }}>
                          <div style={{ fontSize: 11, color: C.ts }}>
                            <strong style={{ color: C.tx }}>Intent:</strong> {replyResult.intent || "unknown"} · <strong style={{ color: C.tx }}>Sentiment:</strong> {replyResult.sentiment || "unknown"} · <strong style={{ color: C.tx }}>Urgency:</strong> {replyResult.urgency || "unknown"}
                          </div>
                          <div style={{ marginTop: 4, fontSize: 11, color: C.ts }}>
                            <strong style={{ color: C.tx }}>Recommended:</strong> {replyResult.nextAction || "No recommendation"}
                          </div>
                          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                            {selectedProjectThread.artist && replyResult.nextStage && SM[replyResult.nextStage] && (
                              <button disabled={isReadOnly} onClick={() => applyReplySuggestedStage(selectedProjectThread.artist)} style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${C.bd}`, background: "transparent", color: C.ts, cursor: isReadOnly ? "not-allowed" : "pointer", fontSize: 11, fontFamily: ft, ...lockStyle(isReadOnly) }}>
                                Apply Stage: {SM[replyResult.nextStage].label}
                              </button>
                            )}
                            {replyResult.draftResponse && (
                              <button onClick={() => cp(replyResult.draftResponse, "reply_response")} style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${C.bd}`, background: "transparent", color: C.ts, cursor: "pointer", fontSize: 11, fontFamily: ft }}>
                                Copy AI Reply
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                      {followUpDraft && (
                        <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.abd}`, background: C.abb }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: C.ab, marginBottom: 4 }}>AI follow-up draft</div>
                          <div style={{ fontSize: 12, color: C.ts, whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{compactText(followUpDraft, 340)}</div>
                          <div style={{ marginTop: 8 }}>
                            <button onClick={() => cp(followUpDraft, "followup")} style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${C.abd}`, background: "transparent", color: C.ab, cursor: "pointer", fontSize: 11, fontFamily: ft }}>
                              Copy Follow-up
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {showDiscover && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={e => { if (e.target === e.currentTarget) setShowDiscover(false); }}>
            <div style={{ background: C.sf, borderRadius: 18, padding: "28px 32px", width: 640, maxHeight: "80vh", overflow: "auto", boxShadow: "0 25px 70px rgba(0,0,0,0.25)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>🔍 AI Artist Discovery</div>
                  <div style={{ fontSize: 11, color: C.tt }}>Model: {modelLabel(taskModel("discovery"))} · {providerLabel(currentAiProvider)}</div>
                </div>
                <button onClick={() => setShowDiscover(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.ts }}>✕</button>
              </div>
              <div style={{ fontSize: 12, color: C.ts, marginBottom: 12 }}>Describe what you're looking for - genre, location, listener range, vibe, career stage, etc.</div>
              <textarea value={discQuery} readOnly={isReadOnly} onChange={e => setDiscQuery(e.target.value)} placeholder='e.g. "Chicago indie artists, 10K-100K listeners, released in last year, strong IG presence"' style={{ ...iS, width: "100%", minHeight: 60, fontSize: 13, resize: "vertical", boxSizing: "border-box", marginBottom: 12, ...lockStyle(isReadOnly) }} />
              <button onClick={runDiscover} disabled={discLoading || !discQuery.trim() || isReadOnly} style={{ padding: "8px 24px", borderRadius: 10, border: "none", background: discLoading ? C.sa : C.pr, color: "#fff", cursor: discLoading ? "wait" : isReadOnly ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, fontFamily: ft, marginBottom: 16, ...lockStyle(isReadOnly) }}>{discLoading ? "🔄 Discovering..." : "Discover Artists"}</button>

              {discResults.length > 0 && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{discResults.length} artists found</div>
                  {discResults.map((da, i) => (
                    <div key={i} style={{ padding: "14px 16px", background: C.sa, borderRadius: 10, marginBottom: 8, border: `1px solid ${C.bd}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 15, fontWeight: 700 }}>{da.n}</span>
                            <a href={spotifyUrl(da.n)} target="_blank" rel="noopener" style={{ fontSize: 10, color: C.gn, background: C.gb, padding: "1px 8px", borderRadius: 8, textDecoration: "none", fontWeight: 600, border: `1px solid ${C.gd}` }}>Spotify</a>
                          </div>
                          <div style={{ fontSize: 12, color: C.ts, marginTop: 3 }}>{da.g} · {da.l} listeners{da.loc ? ` · ${da.loc}` : ""}</div>
                          {da.h && <div style={{ fontSize: 11, color: C.ts, marginTop: 2 }}>🎵 {da.h}</div>}
                          {da.why && <div style={{ fontSize: 12, color: C.tx, marginTop: 6, lineHeight: 1.5 }}>{da.why}</div>}
                        </div>
                        <button disabled={isReadOnly} onClick={() => addDiscovered(da)} style={{ padding: "5px 14px", borderRadius: 8, border: `1.5px solid ${C.gn}`, background: C.gb, color: C.gn, cursor: isReadOnly ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 600, fontFamily: ft, flexShrink: 0, ...lockStyle(isReadOnly) }}>+ Add</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {showProjectMenu && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.28)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 115 }} onClick={e => { if (e.target === e.currentTarget) setShowProjectMenu(false); }}>
            <div style={{ background: C.sf, borderRadius: 18, padding: "22px 24px", width: 760, maxWidth: "calc(100vw - 32px)", maxHeight: "80vh", overflow: "auto", boxShadow: C.sm }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800 }}>Project Settings</div>
                  <div style={{ fontSize: 12, color: C.ts }}>Lower-frequency controls live here so the main workspace stays clean.</div>
                </div>
                <button onClick={() => setShowProjectMenu(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.ts }}>✕</button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 }}>
                <div style={{ ...cS, boxShadow: "none", padding: "14px 16px", background: C.sa }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Project Tools</div>
                  <div style={{ display: "grid", gap: 10 }}>
                    <label style={{ fontSize: 12, color: C.ts, display: "grid", gap: 4 }}>
                      <span>Project type</span>
                      <select value={projectType} disabled={!canEdit} onChange={e => saveProjectType(e.target.value)} style={{ ...iS, ...lockStyle(!canEdit) }}>
                        {PROJECT_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
                      </select>
                    </label>
                    <div style={{ fontSize: 11, color: C.tt, lineHeight: 1.5 }}>
                      {isMarketingProject
                        ? "Marketing projects use talent assignments with campaign status, brief links, content links, and person-level tracking. A&R data stays untouched."
                        : isCuratorProject
                          ? "Curator projects keep the artist-style pipeline, AI analysis, and profile tracking, but skip email and Gmail inbox workflows."
                          : "A&R projects keep the artist pipeline, outreach workflow, Gmail inbox, and roster tools."}
                    </div>
                    {isArProject && (
                      <>
                        <label style={{ ...actionBtn(false, "neutral"), ...lockStyle(isReadOnly), display: "inline-flex", justifyContent: "center" }}>
                          Internal CSV Check
                          <input type="file" accept=".csv" ref={rosterRef} onChange={importInternalRoster} disabled={isReadOnly} />
                        </label>
                        <button onClick={copyProjectCsvLink} style={actionBtn(false, "neutral")}>Copy CSV Link</button>
                      </>
                    )}
                    <button onClick={() => isMarketingProject ? exportMarketingItems(proj) : exportPipeline(proj, enriched)} style={actionBtn(false, "neutral")}>
                      {isMarketingProject ? "Export Assignment CSV" : isCuratorProject ? "Export Curator CSV" : "Export Project CSV"}
                    </button>
                    {isAdmin && (
                      <a href="/ar/admin" style={{ ...actionBtn(false, "neutral"), textDecoration: "none", display: "inline-flex", justifyContent: "center" }}>
                        Open Admin
                      </a>
                    )}
                    <button onClick={signOut} style={actionBtn(false, "neutral")}>Sign out</button>
                  </div>
                </div>

                {isMarketingProject && (
                  <div style={{ ...cS, boxShadow: "none", padding: "14px 16px", background: C.sa }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Campaign Bank</div>
                    <div style={{ fontSize: 11, color: C.tt, lineHeight: 1.5, marginBottom: 10 }}>
                      Keep a clean list of campaign names so assignments use consistent dropdown options instead of one-off text.
                    </div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                      <input
                        value={campaignBankDraft}
                        onChange={e => setCampaignBankDraft(e.target.value)}
                        placeholder="Add campaign name"
                        style={{ ...iS, flex: 1 }}
                      />
                      <button onClick={addMarketingCampaignBankEntry} disabled={!canEdit} style={{ ...actionBtn(true, "accent"), ...lockStyle(!canEdit) }}>
                        Add
                      </button>
                    </div>
                    {marketingCampaignOptions.length ? (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {marketingCampaignOptions.map(campaign => (
                          <span key={campaign} style={{ ...mkP(true, C.ac, C.al), cursor: "default", display: "inline-flex", alignItems: "center", gap: 6 }}>
                            {campaign}
                            <button
                              type="button"
                              disabled={!canEdit}
                              onClick={() => removeMarketingCampaignBankEntry(campaign)}
                              style={{ border: "none", background: "transparent", color: C.ac, cursor: canEdit ? "pointer" : "not-allowed", fontSize: 11, padding: 0, lineHeight: 1, ...lockStyle(!canEdit) }}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: C.ts }}>No campaigns saved yet.</div>
                    )}
                  </div>
                )}

                {isMarketingProject && (
                  <div style={{ ...cS, boxShadow: "none", padding: "14px 16px", background: C.sa }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Saved Groups</div>
                    <div style={{ fontSize: 11, color: C.tt, lineHeight: 1.5, marginBottom: 10 }}>
                      Use selection mode in the campaign board to save reusable outreach or review groups for BCC and batch work.
                    </div>
                    {marketingGroupOptions.length ? (
                      <div style={{ display: "grid", gap: 8 }}>
                        {marketingGroupOptions.map(group => (
                          <div key={group.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", padding: "10px 12px", borderRadius: 12, border: `1px solid ${marketingGroupFilter === group.id ? C.ac : C.bd}`, background: marketingGroupFilter === group.id ? C.al : C.sf }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: C.tx }}>{group.name}</div>
                              <div style={{ fontSize: 11, color: C.ts }}>{group.assignmentIds.length} assignment{group.assignmentIds.length === 1 ? "" : "s"}</div>
                            </div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button onClick={() => setMarketingGroupFilter(group.id)} style={actionBtn(marketingGroupFilter === group.id, "neutral")}>
                                Use
                              </button>
                              <button disabled={!canEdit} onClick={() => removeMarketingGroup(group.id)} style={{ ...actionBtn(false, "danger"), ...lockStyle(!canEdit) }}>
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: C.ts }}>No saved groups yet. Select assignments from the board to create one.</div>
                    )}
                  </div>
                )}

                <div style={{ ...cS, boxShadow: "none", padding: "14px 16px", background: C.sa }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>AI Settings</div>
                  <div style={{ display: "grid", gap: 10 }}>
                    <label style={{ fontSize: 12, color: C.ts, display: "grid", gap: 4 }}>
                      <span>Provider</span>
                      <select value={currentAiProvider} disabled={!canEdit} onChange={e => saveAiProvider(e.target.value)} style={{ ...iS, ...lockStyle(!canEdit) }}>
                        {AI_PROVIDERS.map(provider => (
                          <option key={provider.id} value={provider.id}>{provider.label}</option>
                        ))}
                      </select>
                    </label>
                    <button disabled={!canEdit} onClick={configureAiKey} style={{ ...actionBtn(true, aiKeySet ? "good" : "danger"), ...lockStyle(!canEdit) }}>
                      {providerLabel(currentAiProvider)} Key {aiKeySet ? "Set" : "Missing"}
                    </button>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {[["intel", "Intel"], ["drafts", "Drafts"], ["discovery", "Discovery"], ["reply", "Reply"], ["followup", "Follow-up"]].map(([task, label]) => (
                        <label key={task} style={{ fontSize: 11, color: C.ts, display: "grid", gap: 4 }}>
                          <span>{label}</span>
                          <select value={taskModel(task)} disabled={!canEdit} onChange={e => saveAiModel(task, e.target.value)} style={{ ...iS, padding: "6px 10px", fontSize: 11, ...lockStyle(!canEdit) }}>
                            {aiOptions.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                          </select>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ ...cS, boxShadow: "none", padding: "14px 16px", background: C.sa }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Appearance</div>
                  <div style={{ fontSize: 11, color: C.tt, marginBottom: 10 }}>Accent color for this project workspace.</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                    {Object.entries(ACCENT_PRESETS).map(([accentId, preset]) => {
                      const active = currentAccent === accentId;
                      const swatch = dark ? preset.dark.ac : preset.light.ac;
                      return (
                        <button
                          key={accentId}
                          disabled={!canEdit}
                          onClick={() => saveAppearanceAccent(accentId)}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 12,
                            border: `1.5px solid ${active ? swatch : C.bd}`,
                            background: active ? (dark ? preset.dark.al : preset.light.al) : C.sf,
                            color: active ? swatch : C.ts,
                            cursor: canEdit ? "pointer" : "not-allowed",
                            fontSize: 11,
                            fontWeight: 700,
                            fontFamily: ft,
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            justifyContent: "center",
                            ...lockStyle(!canEdit),
                          }}
                        >
                          <span style={{ width: 10, height: 10, borderRadius: 999, background: swatch, display: "inline-block" }} />
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {isArProject && <div style={{ ...cS, boxShadow: "none", padding: "14px 16px", background: C.sa }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Mailboxes</div>
                  {!gmailStatus.available ? (
                    <div style={{ fontSize: 12, color: C.ts }}>Google OAuth is not configured yet.</div>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      {gmailBanner && (
                        <div style={{ padding: "10px 12px", borderRadius: 12, border: `1px solid ${gmailBannerTone.border}`, background: gmailBannerTone.bg }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: gmailBannerTone.fg }}>{gmailBanner.message}</div>
                          {gmailBanner.details ? <div style={{ fontSize: 11, color: C.ts, marginTop: 4, lineHeight: 1.5 }}>{gmailBanner.details}</div> : null}
                        </div>
                      )}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
                        <div style={{ padding: "9px 10px", borderRadius: 10, border: `1px solid ${C.bd}`, background: C.sf }}>
                          <div style={{ fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase", color: C.tt, marginBottom: 4 }}>Connected</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: gmailConnected ? C.gn : C.rd }}>{gmailConnected ? "Yes" : "No"}</div>
                        </div>
                        <div style={{ padding: "9px 10px", borderRadius: 10, border: `1px solid ${C.bd}`, background: C.sf }}>
                          <div style={{ fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase", color: C.tt, marginBottom: 4 }}>Provider Email</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>{gmailConnectionMeta?.provider_email || "Not connected"}</div>
                        </div>
                        <div style={{ padding: "9px 10px", borderRadius: 10, border: `1px solid ${C.bd}`, background: C.sf }}>
                          <div style={{ fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase", color: C.tt, marginBottom: 4 }}>Last Refresh</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>{fmtDateTime(gmailConnectionMeta?.last_refresh_at)}</div>
                        </div>
                        <div style={{ padding: "9px 10px", borderRadius: 10, border: `1px solid ${C.bd}`, background: C.sf }}>
                          <div style={{ fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase", color: C.tt, marginBottom: 4 }}>Last Sync</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>{fmtDateTime(gmailConnectionMeta?.last_sync_at)}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: C.tt, lineHeight: 1.5 }}>
                        {(gmailConnectionMeta?.scopes || []).length
                          ? `Granted scopes: ${gmailConnectionMeta.scopes.join(", ")}`
                          : "Use a songfinch.com Google account. This OAuth app is internal to Songfinch."}
                      </div>
                      {gmailConnectionMeta?.last_error ? (
                        <div style={{ padding: "9px 10px", borderRadius: 10, border: `1px solid ${C.rbd}`, background: C.rb, color: C.rd, fontSize: 11, lineHeight: 1.5 }}>
                          {gmailConnectionMeta.last_error}
                        </div>
                      ) : null}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {!gmailConnected ? (
                          <button disabled={gmailStatusLoading || isReadOnly} onClick={connectGmail} style={{ ...actionBtn(true, "accent"), ...lockStyle(gmailStatusLoading || isReadOnly) }}>
                            {gmailStatusLoading ? "Checking..." : "Connect My Gmail"}
                          </button>
                        ) : (
                          <button disabled={gmailStatusLoading || isReadOnly} onClick={disconnectGmail} style={{ ...actionBtn(true, "danger"), ...lockStyle(gmailStatusLoading || isReadOnly) }}>
                            Disconnect My Gmail
                          </button>
                        )}
                        <button disabled={gmailProfileTesting || !gmailConnected || isReadOnly} onClick={() => runGmailProfileCheck()} style={{ ...actionBtn(false, "neutral"), ...lockStyle(gmailProfileTesting || !gmailConnected || isReadOnly) }}>
                          {gmailProfileTesting ? "Checking..." : "Test Profile"}
                        </button>
                        <button disabled={gmailListTesting || !gmailConnected || isReadOnly} onClick={runGmailListCheck} style={{ ...actionBtn(false, "neutral"), ...lockStyle(gmailListTesting || !gmailConnected || isReadOnly) }}>
                          {gmailListTesting ? "Testing API..." : "Test Gmail API"}
                        </button>
                      </div>
                      <div style={{ fontSize: 11, color: C.tt }}>Connected team mailboxes</div>
                      {(gmailStatus.connections || []).length ? (
                        <div style={{ display: "grid", gap: 6 }}>
                          {gmailStatus.connections.map(conn => (
                            <div key={conn.userId} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "8px 10px", borderRadius: 10, border: `1px solid ${conn.userId === authUserId ? C.gd : C.bd}`, background: conn.userId === authUserId ? C.gb : C.sf, fontSize: 11, color: C.ts }}>
                              <span>{conn.workspaceEmail}</span>
                              <span style={{ color: C.tx, fontWeight: 700 }}>{conn.providerEmail || conn.gmailEmail}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: C.tt }}>No connected Gmail accounts yet.</div>
                      )}
                    </div>
                  )}
                </div>}

                <div style={{ ...cS, boxShadow: "none", padding: "14px 16px", background: C.sa, gridColumn: "1 / -1" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Workspace Contacts</div>
                  <div style={{ fontSize: 11, color: C.tt, lineHeight: 1.5, marginBottom: 10 }}>
                    Add someone here once and they become available in every project owner dropdown, including future projects.
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                    {workspaceTeamUsers.map(u => (
                      <span key={u} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 999, border: `1px solid ${C.bd}`, background: C.sf, color: C.ts }}>{u}</span>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8, maxWidth: 420 }}>
                    <input value={newWorkspaceContact} disabled={!canEdit} onChange={e => setNewWorkspaceContact(e.target.value)} placeholder="Add workspace contact" style={{ ...iS, flex: 1, ...lockStyle(!canEdit) }} />
                    <button disabled={!canEdit} onClick={addWorkspaceContact} style={{ padding: "8px 12px", borderRadius: 10, border: "none", background: C.ac, color: "#fff", cursor: canEdit ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 600, fontFamily: ft, ...lockStyle(!canEdit) }}>
                      Add to all projects
                    </button>
                  </div>
                </div>

                <div style={{ ...cS, boxShadow: "none", padding: "14px 16px", background: C.sa, gridColumn: "1 / -1" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Project Team</div>
                  <div style={{ fontSize: 11, color: C.tt, lineHeight: 1.5, marginBottom: 10 }}>
                    Use this if someone should only appear inside this project. Workspace Contacts above are shared everywhere.
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                    {(proj.teamUsers || []).map(u => (
                      <span key={u} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 999, border: `1px solid ${C.bd}`, background: C.sf, color: C.ts }}>{u}</span>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8, maxWidth: 360 }}>
                    <input value={newTeamUser} disabled={!canEdit} onChange={e => setNewTeamUser(e.target.value)} placeholder="Add project-only user" style={{ ...iS, flex: 1, ...lockStyle(!canEdit) }} />
                    <button disabled={!canEdit} onClick={addTeamMember} style={{ padding: "8px 12px", borderRadius: 10, border: "none", background: C.ac, color: "#fff", cursor: canEdit ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 600, fontFamily: ft, ...lockStyle(!canEdit) }}>Add</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {showQuickDrawer && activeArtist && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.18)", zIndex: 110 }} onClick={e => { if (e.target === e.currentTarget) setShowQuickDrawer(false); }}>
            <div style={{ position: "absolute", top: 0, right: 0, width: 420, maxWidth: "100vw", height: "100%", background: C.sf, borderLeft: `1px solid ${C.bd}`, boxShadow: C.sm, padding: "20px 18px", overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 11, color: C.tt, textTransform: "uppercase", letterSpacing: 1.2 }}>{isCuratorProject ? "Curator Snapshot" : "Quick View"}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>{activeArtist.n}</div>
                  <div style={{ fontSize: 12, color: C.ts, marginTop: 4 }}>{activeArtist.bucket}{activeArtist.l ? ` · ${activeArtist.l}` : ""}{activeArtist.loc ? ` · ${activeArtist.loc}` : ""}</div>
                </div>
                <button onClick={() => setShowQuickDrawer(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.ts }}>✕</button>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                <span style={{ ...mkP(true, pT(activeArtist.priority, C).color, pT(activeArtist.priority, C).bg) }}>{pT(activeArtist.priority, C).label}</span>
                <span style={{ ...mkP(true, sc(activeArtist.stage, C), sb(activeArtist.stage, C)) }}>{SM[activeArtist.stage]?.icon} {SM[activeArtist.stage]?.label}</span>
                {activeArtist.onPlatform && <span style={{ ...mkP(true, C.pr, C.pb) }}>On Platform</span>}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                <a href={spotifyUrl(activeArtist.n)} target="_blank" rel="noopener" style={{ ...actionBtn(false, "neutral"), textDecoration: "none" }}>Spotify</a>
                {activeArtist.soc && <a href={`https://instagram.com/${activeArtist.soc}`} target="_blank" rel="noopener" style={{ ...actionBtn(false, "neutral"), textDecoration: "none" }}>Instagram</a>}
                {isCuratorProject && activeArtist.curatorPageUrl && (
                  <a href={activeArtist.curatorPageUrl} target="_blank" rel="noopener" style={{ ...actionBtn(false, "neutral"), textDecoration: "none" }}>
                    Curator Page
                  </a>
                )}
                {!isCuratorProject && activeArtist.e && <a href={`mailto:${activeArtist.e}`} style={{ ...actionBtn(false, "neutral"), textDecoration: "none" }}>Email</a>}
                <button onClick={() => openA(activeArtist)} style={actionBtn(false, "accent")}>Open Full Profile</button>
              </div>

              {isCuratorProject && normalizeCuratedArtists(activeArtist.curatedArtists).length > 0 && (
                <div style={{ ...cS, boxShadow: "none", padding: "12px 14px", marginBottom: 12, background: C.sa }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Curated Artists</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {normalizeCuratedArtists(activeArtist.curatedArtists).map(name => (
                      <span key={name} style={{ ...mkP(true, C.ac, C.al) }}>{name}</span>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ ...cS, boxShadow: "none", padding: "12px 14px", marginBottom: 12, background: C.sa }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Status</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {STAGES.map(s => (
                    <button key={s.id} disabled={isReadOnly} onClick={() => setSt(activeArtist.n, s.id)} style={{ ...mkP(activeArtist.stage === s.id, sc(s.id, C), sb(s.id, C)), ...lockStyle(isReadOnly) }}>
                      {s.icon} {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ ...cS, boxShadow: "none", padding: "12px 14px", marginBottom: 12, background: C.sa }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{isCuratorProject ? "Owner" : "Owner and Next Step"}</div>
                <div style={{ display: "grid", gap: 8 }}>
                  <select value={proj?.assignments?.[activeArtist.n] || ""} disabled={isReadOnly} onChange={e => assignOwner(activeArtist.n, e.target.value)} style={{ ...iS, ...lockStyle(isReadOnly) }}>
                    <option value="">Unassigned</option>
                    {(proj?.teamUsers || []).map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                  {!isCuratorProject && <input type="date" value={proj?.followUps?.[activeArtist.n] || ""} disabled={isReadOnly} onChange={e => { setAFU(e.target.value); saveFU(activeArtist.n, e.target.value); }} style={{ ...iS, ...lockStyle(isReadOnly) }} />}
                </div>
              </div>

              <div style={{ ...cS, boxShadow: "none", padding: "12px 14px", marginBottom: 12, background: C.sa }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Notes</div>
                <textarea value={aNote} readOnly={isReadOnly} onChange={e => setANote(e.target.value)} onBlur={() => { if (!isReadOnly) saveN(activeArtist.n, aNote); }} placeholder="Add notes..." style={{ ...iS, width: "100%", minHeight: 110, resize: "vertical", ...lockStyle(isReadOnly) }} />
              </div>

              <div style={{ ...cS, boxShadow: "none", padding: "12px 14px", background: C.sa }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Recent Activity</div>
                {(((proj?.activityLog || {})[activeArtist.n] || []).slice(-5).reverse()).length ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    {((proj?.activityLog || {})[activeArtist.n] || []).slice(-5).reverse().map((entry, idx) => (
                      <div key={entry.id || idx} style={{ fontSize: 11, color: C.ts, paddingBottom: 8, borderBottom: idx < Math.min(4, ((proj?.activityLog || {})[activeArtist.n] || []).length - 1) ? `1px solid ${C.bd}` : "none" }}>
                        <div style={{ color: C.tx }}>{entry.note || entry.action}</div>
                        <div style={{ color: C.tt, marginTop: 3 }}>{rD(entry.time)}{entry.actor ? ` · ${entry.actor}` : ""}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: C.tt }}>No activity yet.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {!isMarketingProject && projectMode === "work" && (
        <div ref={workSurfaceRef}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
          <input placeholder={isCuratorProject ? "Search curators..." : "Search artists..."} value={search} onChange={e => setSearch(e.target.value)} style={{ ...iS, width: 220 }} />
          <div style={{ display: "flex", gap: 2, background: C.sa, borderRadius: 10, padding: 3, border: `1px solid ${C.bd}` }}>
            {[ ["list", "☰"], ["kanban", "▦"], ["table", "▤"] ].map(([v, ic]) => (
              <button key={v} title={`${v[0].toUpperCase()}${v.slice(1)} view`} onClick={() => setView(v)} style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: viewMode === v ? C.ac : "transparent", color: viewMode === v ? "#fff" : C.ts, cursor: "pointer", fontSize: 13, fontFamily: ft }}>{ic}</button>
            ))}
          </div>
          <button onClick={() => setShowFilters(!showFilters)} style={actionBtn(showFilters, "neutral")}>
            {showFilters ? "Hide Filters" : "Show Filters"}
          </button>
          {batch && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              <button disabled={isReadOnly || !bSel.size} onClick={() => batchAssignOwner(currentActor)} style={{ ...mkP(false, C.gn, C.gb), fontSize: 10, padding: "3px 8px", ...lockStyle(isReadOnly || !bSel.size) }}>
                Assign to {currentActor}
              </button>
              <button disabled={isReadOnly || !bSel.size} onClick={() => batchAssignOwner("")} style={{ ...mkP(false, C.ts, C.sa), fontSize: 10, padding: "3px 8px", ...lockStyle(isReadOnly || !bSel.size) }}>
                Unassign
              </button>
              {STAGES.map(s => <button key={s.id} disabled={isReadOnly || !bSel.size} title={s.label} onClick={() => batchSt(s.id)} style={{ ...mkP(false, sc(s.id, C), sb(s.id, C)), fontSize: 10, padding: "3px 8px", ...lockStyle(isReadOnly || !bSel.size) }}>{s.icon}</button>)}
            </div>
          )}
          <button disabled={isReadOnly} onClick={() => { setBatch(!batch); setBSel(new Set()); }} style={{ ...mkP(batch, C.ab, C.abb), fontSize: 11, ...lockStyle(isReadOnly) }}>{batch ? "Batch On" : "Batch"}</button>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ ...iS, padding: "6px 10px", fontSize: 12 }}>
            <option value="priority">Sort: Priority</option>
            <option value="name">Sort: Name</option>
            <option value="listeners">Sort: Listeners</option>
            <option value="recent">Sort: Recent</option>
          </select>
        </div>

        {showFilters && (
          <div style={{ ...cS, padding: "12px 14px", marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
              <button onClick={() => setSf("all")} style={mkP(sf === "all", C.ac, C.al)}>All {enriched.length}</button>
              <button onClick={() => setSf(sf === "contacted" ? "all" : "contacted")} style={mkP(sf === "contacted", C.ac, C.al)}>Contacted {contactedCount}</button>
              {STAGES.map(s => stCounts[s.id] > 0 && <button key={s.id} onClick={() => setSf(s.id)} style={mkP(sf === s.id, sc(s.id, C), sb(s.id, C))}>{s.icon} {s.label} {stCounts[s.id]}</button>)}
            </div>

            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
              <button onClick={() => setGf("All")} style={mkP(gf === "All", C.ac, C.al)}>All Genres</button>
              {gBuckets.slice(0, 12).map(([b, c]) => <button key={b} onClick={() => setGf(gf === b ? "All" : b)} style={mkP(gf === b, C.ac, C.al)}>{b} {c}</button>)}
            </div>

            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              <button onClick={() => setPf("all")} style={mkP(pf === "all", C.ac, C.al)}>All Priority</button>
              {["HOT", "WARM", "COOL"].map(p => <button key={p} onClick={() => setPf(pf === p ? "all" : p)} style={mkP(pf === p, p === "HOT" ? C.rd : p === "WARM" ? C.ab : C.tt, p === "HOT" ? C.rb : p === "WARM" ? C.abb : C.sa)}>{p}</button>)}
            </div>
          </div>
        )}

        <div style={{ fontSize: 12, color: C.tt, marginBottom: 12 }}>{filtered.length} {isCuratorProject ? `curator${filtered.length !== 1 ? "s" : ""}` : `artist${filtered.length !== 1 ? "s" : ""}`}</div>

        {viewMode === "list" && (
          <div style={{ display: "grid", gap: 8 }}>
            {filtered.slice(0, 220).map((a, i) => {
              const pt2 = pT(a.priority, C);
              const ss = proj.sequenceState?.[a.n];
              const seqDue = ss?.status === "active" && ss.nextDue && ss.nextDue <= todayISO();
              return (
                <div key={a.n} onClick={() => { if (batch) { const ns = new Set(bSel); ns.has(a.n) ? ns.delete(a.n) : ns.add(a.n); setBSel(ns); } else openQuickArtist(a); }}
                  style={{ ...cS, padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, transition: "all 0.15s", animation: `fu 0.2s ease ${Math.min(i, 15) * 0.02}s both`, borderLeft: batch && bSel.has(a.n) ? `3px solid ${C.ac}` : "3px solid transparent" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = C.ac; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = batch && bSel.has(a.n) ? C.ac : C.bd; }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{a.n}</span>
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 12, background: pt2.bg, color: pt2.color, fontWeight: 600, border: `1px solid ${pt2.border}` }}>{pt2.label}</span>
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 12, background: sb(a.stage, C), color: sc(a.stage, C), fontWeight: 500 }}>{SM[a.stage]?.icon} {SM[a.stage]?.label}</span>
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 12, background: C.sa, color: a.owner ? C.ts : C.rd, border: `1px solid ${C.bd}` }}>{a.owner || "Unassigned"}</span>
                      {a.onPlatform && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 12, background: C.pb, color: C.pr, fontWeight: 600, border: `1px solid ${C.pbd}` }}>On Platform</span>}
                      {seqDue && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 12, background: C.abb, color: C.ab, fontWeight: 600 }}>🧭 Seq Due</span>}
                    </div>
                    <div style={{ fontSize: 11, color: C.ts, marginTop: 3, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {a.g && <span>{a.bucket}</span>}
                      {a.l && <span>🎧 {a.l}</span>}
                      {!isCuratorProject && a.e && <span style={{ color: C.gn }}>✉</span>}
                      {a.soc && <span>📷</span>}
                      {isCuratorProject && a.curatorPageUrl && <span>↗ Page</span>}
                      {a.followUp && <span style={{ color: a.followUp <= todayISO() ? C.rd : C.ab }}>📅 {sD(a.followUp)}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <a href={spotifyUrl(a.n)} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{ fontSize: 10, color: C.gn, textDecoration: "none", fontWeight: 600, padding: "3px 10px", background: C.gb, borderRadius: 8, border: `1px solid ${C.gd}`, flexShrink: 0 }}>Spotify</a>
                    {isCuratorProject && a.curatorPageUrl && (
                      <a href={a.curatorPageUrl} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{ fontSize: 10, color: C.ac, textDecoration: "none", fontWeight: 600, padding: "3px 10px", background: C.al, borderRadius: 8, border: `1px solid ${C.ac}`, flexShrink: 0 }}>
                        Curator Page
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {viewMode === "kanban" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, alignItems: "start", paddingBottom: 20 }}>
            {STAGES.map(s => {
              const col = filtered.filter(a => a.stage === s.id);
              return (
                <div
                  key={s.id}
                  style={{
                    minWidth: 0,
                    width: "100%",
                    border: dragOverStage === s.id ? `2px dashed ${C.ac}` : "2px dashed transparent",
                    borderRadius: 10,
                    padding: 4,
                    transition: "border-color 0.15s",
                  }}
                  onDragOver={e => { e.preventDefault(); }}
                  onDragEnter={e => { e.preventDefault(); if (!canEdit) return; setDragOverStage(s.id); }}
                  onDragLeave={() => { if (dragOverStage === s.id) setDragOverStage(""); }}
                  onDrop={async e => {
                    e.preventDefault();
                    if (!canEdit) return;
                    const droppedName = e.dataTransfer.getData("text/plain");
                    await handleKanbanDrop(s.id, droppedName);
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, padding: "6px 12px", borderRadius: 8, background: sb(s.id, C), color: sc(s.id, C), textAlign: "center" }}>{s.icon} {s.label} ({col.length})</div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {col.slice(0, 60).map(a => {
                      const pt2 = pT(a.priority, C);
                      const ss = proj.sequenceState?.[a.n];
                      const seqDue = ss?.status === "active" && ss.nextDue && ss.nextDue <= todayISO();
                      return (
                        <div
                          key={a.n}
                          draggable={canEdit}
                          onDragStart={e => {
                            if (!canEdit) return;
                            setDragArtistName(a.n);
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", a.n);
                          }}
                          onDragEnd={() => {
                            setDragArtistName("");
                            setDragOverStage("");
                          }}
                          onClick={() => openQuickArtist(a)}
                          style={{ ...cS, padding: "10px 12px", cursor: canEdit ? "grab" : "pointer", transition: "all 0.15s", fontSize: 12, ...lockStyle(!canEdit) }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = C.ac; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = C.bd; }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                            <span style={{ fontWeight: 700, fontSize: 13 }}>{a.n}</span>
                            <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 8, background: pt2.bg, color: pt2.color, fontWeight: 600 }}>{pt2.label}</span>
                          </div>
                          <div style={{ color: C.ts, marginTop: 3, fontSize: 11 }}>{a.bucket}{a.l ? ` · ${a.l}` : ""}</div>
                          <div style={{ color: a.owner ? C.ts : C.rd, marginTop: 2, fontSize: 10 }}>👤 {a.owner || "Unassigned"}</div>
                          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                            {!isCuratorProject && a.e && <span style={{ fontSize: 10 }}>✉</span>}
                            {a.soc && <span style={{ fontSize: 10 }}>📷</span>}
                            {isCuratorProject && a.curatorPageUrl && <span style={{ fontSize: 10 }}>↗</span>}
                            {a.onPlatform && <span style={{ fontSize: 10, color: C.pr }}>◆</span>}
                            {seqDue && <span style={{ fontSize: 10 }}>🧭</span>}
                            <a href={spotifyUrl(a.n)} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{ fontSize: 9, color: C.gn, textDecoration: "none" }}>🎵</a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {viewMode === "table" && (
          <div style={{ ...cS, padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto", maxHeight: "68vh" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${C.bd}`, textAlign: "left", background: C.sa }}>
                  {[(isCuratorProject ? "Curator" : "Artist"), "Owner", "Genre", "Listeners", "Stage", "Priority", "Links", "Plan", "Follow-up", "Updated"].map((h, index) => (
                    <th key={h} style={{ padding: "10px 12px", fontWeight: 700, color: C.ts, fontSize: 11, whiteSpace: "nowrap", position: "sticky", top: 0, background: C.sa, zIndex: index === 0 ? 3 : 2 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 600).map((a, rowIndex) => {
                  const pt2 = pT(a.priority, C);
                  const ss = proj.sequenceState?.[a.n];
                  return (
                    <tr key={a.n} onClick={() => openQuickArtist(a)} style={{ borderBottom: `1px solid ${C.sa}`, cursor: "pointer", transition: "background 0.1s", background: rowIndex % 2 === 0 ? "transparent" : C.sa }} onMouseEnter={e => { e.currentTarget.style.background = C.sh; }} onMouseLeave={e => { e.currentTarget.style.background = rowIndex % 2 === 0 ? "transparent" : C.sa; }}>
                      <td style={{ padding: "10px 12px", fontWeight: 700, position: "sticky", left: 0, background: rowIndex % 2 === 0 ? C.cb : C.sa, zIndex: 1 }}>{a.n}</td>
                      <td style={{ padding: "10px 12px", color: a.owner ? C.ts : C.rd, fontWeight: 600 }}>{a.owner || "Unassigned"}</td>
                      <td style={{ padding: "10px 12px", color: C.ts }}>{a.bucket}</td>
                      <td style={{ padding: "10px 12px", color: C.ts }}>{a.l || "-"}</td>
                      <td style={{ padding: "10px 12px" }}><span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: sb(a.stage, C), color: sc(a.stage, C), fontWeight: 700 }}>{SM[a.stage]?.icon} {SM[a.stage]?.label}</span></td>
                      <td style={{ padding: "10px 12px" }}><span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 8, background: pt2.bg, color: pt2.color, fontWeight: 700 }}>{pt2.label}</span></td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          {!isCuratorProject ? (
                            a.e ? <a href={`mailto:${a.e}`} onClick={e => e.stopPropagation()} style={{ color: C.gn, textDecoration: "none", fontSize: 12 }}>✉</a> : <span style={{ color: C.tt, fontSize: 12 }}>✉</span>
                          ) : null}
                          {a.soc ? <a href={`https://instagram.com/${a.soc}`} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{ color: C.pr, textDecoration: "none", fontSize: 12 }}>@</a> : <span style={{ color: C.tt, fontSize: 12 }}>@</span>}
                          <a href={spotifyUrl(a.n)} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{ color: C.gn, textDecoration: "none", fontSize: 12 }}>🎵</a>
                          {isCuratorProject && a.curatorPageUrl && <a href={a.curatorPageUrl} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{ color: C.ac, textDecoration: "none", fontSize: 12 }}>↗</a>}
                          {a.onPlatform && <span style={{ color: C.pr, fontSize: 11, fontWeight: 700 }}>◆</span>}
                        </div>
                      </td>
                      <td style={{ padding: "10px 12px", color: ss ? (ss.status === "active" ? C.ab : C.ts) : C.tt, fontSize: 11 }}>{ss ? `${ss.status}${ss.nextDue ? ` · ${sD(ss.nextDue)}` : ""}` : "-"}</td>
                      <td style={{ padding: "10px 12px", color: a.followUp ? (a.followUp <= todayISO() ? C.rd : C.ab) : C.tt, fontSize: 11, fontWeight: a.followUp ? 600 : 400 }}>{a.followUp ? sD(a.followUp) : "-"}</td>
                      <td style={{ padding: "10px 12px", color: C.tt, fontSize: 11 }}>{rD(a.stageDate)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </div>
        )}

        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px", color: C.tt }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>◎</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{isCuratorProject ? "No curators yet" : "No artists yet"}</div>
            <div style={{ fontSize: 13 }}>{isCuratorProject ? "Import a CSV, add one manually, or use AI Discover to seed the curator roster." : "Import a CSV, add one manually, or use AI Discover."}</div>
          </div>
        )}
        </div>
        )}

        {showAddArtist && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 120 }} onClick={e => { if (e.target === e.currentTarget) { setShowAddArtist(false); resetArtistForm(); } }}>
            <div style={{ background: C.sf, borderRadius: 18, padding: "24px 28px", width: 640, maxWidth: "calc(100vw - 32px)", boxShadow: "0 25px 70px rgba(0,0,0,0.2)" }}>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6, color: C.tx }}>{isCuratorProject ? "Add Curator" : "Add Artist"}</div>
              <div style={{ fontSize: 12, color: C.ts, marginBottom: 14 }}>
                {isCuratorProject
                  ? "Manual add for curator contacts you want in the pipeline before a CSV import."
                  : "Manual add for artists you want in the pipeline before a CSV import."}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <input value={artistForm.name} onChange={e => setArtistForm({ ...artistForm, name: e.target.value })} placeholder={isCuratorProject ? "Curator name*" : "Artist name*"} autoFocus style={{ ...iS, width: "100%" }} />
                <input value={artistForm.genre} onChange={e => setArtistForm({ ...artistForm, genre: e.target.value })} placeholder="Genre / vibe" style={{ ...iS, width: "100%" }} />
                <input value={artistForm.listeners} onChange={e => setArtistForm({ ...artistForm, listeners: e.target.value })} placeholder="Monthly listeners" style={{ ...iS, width: "100%" }} />
                <input value={artistForm.hitTrack} onChange={e => setArtistForm({ ...artistForm, hitTrack: e.target.value })} placeholder="Hit track" style={{ ...iS, width: "100%" }} />
                <input value={artistForm.social} onChange={e => setArtistForm({ ...artistForm, social: e.target.value })} placeholder="@handle or profile URL" style={{ ...iS, width: "100%" }} />
                {!isCuratorProject ? (
                  <input value={artistForm.email} onChange={e => setArtistForm({ ...artistForm, email: e.target.value })} placeholder="Email" style={{ ...iS, width: "100%" }} />
                ) : (
                  <input value={artistForm.curatorPageUrl} onChange={e => setArtistForm({ ...artistForm, curatorPageUrl: e.target.value })} placeholder="Curator page link" style={{ ...iS, width: "100%" }} />
                )}
                <input value={artistForm.location} onChange={e => setArtistForm({ ...artistForm, location: e.target.value })} placeholder="Location" style={{ ...iS, width: "100%", gridColumn: "1 / span 2" }} />
                {isCuratorProject && (
                  <div style={{ gridColumn: "1 / span 2" }}>
                    <div style={{ fontSize: 11, color: C.tt, marginBottom: 8 }}>Curated artists they vouch for</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                      {artistForm.curatedArtists.map((value, index) => (
                        <input
                          key={`new-curated-${index}`}
                          value={value}
                          onChange={e => setArtistForm(prev => {
                            const next = [...prev.curatedArtists];
                            next[index] = e.target.value;
                            return { ...prev, curatedArtists: next };
                          })}
                          placeholder={`Curated artist ${index + 1}`}
                          style={{ ...iS, width: "100%" }}
                        />
                      ))}
                    </div>
                  </div>
                )}
                <textarea value={artistForm.note} onChange={e => setArtistForm({ ...artistForm, note: e.target.value })} placeholder="Optional note" style={{ ...iS, width: "100%", minHeight: 80, resize: "vertical", gridColumn: "1 / span 2" }} />
              </div>
              <div style={{ marginTop: 10, fontSize: 11, color: C.ts }}>
                {artistForm.name.trim() && proj?.artists?.some(a => canonicalArtistName(a.n) === canonicalArtistName(artistForm.name)) && (
                  <div style={{ color: C.rd }}>This artist is already in the project.</div>
                )}
                {artistForm.name.trim() && (proj?.internalRoster?.names || []).some(name => canonicalArtistName(name) === canonicalArtistName(artistForm.name)) && (
                  <div style={{ color: C.pr }}>This artist appears in your internal roster check.</div>
                )}
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
                <button onClick={() => { setShowAddArtist(false); resetArtistForm(); }} style={{ padding: "8px 18px", borderRadius: 10, border: `1px solid ${C.bd}`, background: "transparent", cursor: "pointer", fontSize: 13, fontFamily: ft, color: C.ts }}>Cancel</button>
                <button disabled={!artistForm.name.trim() || manualArtistSaving} onClick={addManualArtist} style={{ padding: "8px 24px", borderRadius: 10, border: "none", background: C.ac, color: "#fff", cursor: !artistForm.name.trim() || manualArtistSaving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, fontFamily: ft, opacity: artistForm.name.trim() && !manualArtistSaving ? 1 : 0.45 }}>
                  {manualArtistSaving ? "Adding..." : isCuratorProject ? "Add Curator" : "Add Artist"}
                </button>
              </div>
            </div>
          </div>
        )}

        {showMarketingBulkUpdateModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 125 }} onClick={e => { if (e.target === e.currentTarget) closeMarketingBulkUpdateModal(); }}>
            <div style={{ background: C.sf, borderRadius: 18, padding: "24px 28px", width: 880, maxWidth: "calc(100vw - 32px)", boxShadow: "0 25px 70px rgba(0,0,0,0.2)", maxHeight: "88vh", overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6, color: C.tx }}>Bulk Update Assignments</div>
                  <div style={{ fontSize: 12, color: C.ts, lineHeight: 1.6 }}>
                    Paste a quick list of <code style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>name | campaign | status | owner</code> rows.
                    We will update exact talent + campaign matches, create a new campaign assignment when the talent already exists in the project, and skip unmatched names safely.
                  </div>
                </div>
                <button onClick={closeMarketingBulkUpdateModal} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.ts }}>✕</button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 220px 220px 220px", gap: 10, alignItems: "end", marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: C.ts, display: "grid", gap: 4 }}>
                  <span>Paste list</span>
                  <textarea
                    value={marketingBulkText}
                    onChange={e => setMarketingBulkText(e.target.value)}
                    placeholder={`Patrick James Clark | D2F Paid 1 | Contacted | Greg\nTejai Moore | D2F Paid 1 | Interested\nfeeljones | Direct To Fan Focus | Complete | Brad`}
                    style={{ ...iS, width: "100%", minHeight: 170, resize: "vertical", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", lineHeight: 1.5 }}
                  />
                </label>
                <label style={{ fontSize: 12, color: C.ts, display: "grid", gap: 4 }}>
                  <span>Default campaign</span>
                  <select value={marketingBulkDefaultCampaign} onChange={e => setMarketingBulkDefaultCampaign(e.target.value)} style={{ ...iS, width: "100%" }}>
                    <option value="">None</option>
                    {marketingCampaignOptions.map(campaign => <option key={campaign} value={campaign}>{campaign}</option>)}
                  </select>
                  <div style={{ fontSize: 11, color: C.tt }}>Used when a pasted row omits the campaign.</div>
                </label>
                <label style={{ fontSize: 12, color: C.ts, display: "grid", gap: 4 }}>
                  <span>Default status</span>
                  <select value={marketingBulkDefaultStatus} onChange={e => setMarketingBulkDefaultStatus(e.target.value)} style={{ ...iS, width: "100%" }}>
                    {MARKETING_STATUSES.map(status => <option key={status.id} value={status.id}>{status.label}</option>)}
                  </select>
                  <div style={{ fontSize: 11, color: C.tt }}>Used when a pasted row omits the status.</div>
                </label>
                <label style={{ fontSize: 12, color: C.ts, display: "grid", gap: 4 }}>
                  <span>Default owner</span>
                  <select value={marketingBulkDefaultOwner} onChange={e => setMarketingBulkDefaultOwner(e.target.value)} style={{ ...iS, width: "100%" }}>
                    <option value="">Leave unchanged / unassigned</option>
                    {(proj?.teamUsers || DEFAULT_TEAM_USERS).map(owner => <option key={owner} value={owner}>{owner}</option>)}
                  </select>
                  <div style={{ fontSize: 11, color: C.tt }}>Used when a pasted row omits the owner.</div>
                </label>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                <span style={{ ...mkP(true, C.ac, C.al), cursor: "default" }}>{marketingBulkRows.length} parsed</span>
                <span style={{ ...mkP(true, C.bu, C.bb), cursor: "default" }}>{marketingBulkSummary.update || 0} updates</span>
                <span style={{ ...mkP(true, C.gn, C.gb), cursor: "default" }}>{marketingBulkSummary.create || 0} new assignments</span>
                <span style={{ ...mkP(true, C.rd, C.rb), cursor: "default" }}>{marketingBulkSummary.skip || 0} unmatched / skipped</span>
              </div>

              <div style={{ borderRadius: 16, border: `1px solid ${C.bd}`, overflow: "hidden", marginBottom: 18 }}>
                <div style={{ display: "grid", gridTemplateColumns: "88px minmax(180px, 1.3fr) minmax(160px, 1fr) 120px minmax(160px, 1.2fr)", gap: 0, background: C.sa, padding: "10px 12px", fontSize: 11, color: C.tt, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>
                  <div>Action</div>
                  <div>Talent</div>
                  <div>Campaign</div>
                  <div>Status</div>
                  <div>Match / Result</div>
                </div>
                <div style={{ maxHeight: 280, overflowY: "auto" }}>
                  {marketingBulkPreview.length ? marketingBulkPreview.map(entry => {
                    const actionTone = entry.action === "update"
                      ? [C.bu, C.bb]
                      : entry.action === "create"
                        ? [C.gn, C.gb]
                        : [C.rd, C.rb];
                    return (
                      <div key={`${entry.lineNumber}-${entry.talentName}-${entry.campaign}`} style={{ display: "grid", gridTemplateColumns: "88px minmax(180px, 1.3fr) minmax(160px, 1fr) 120px minmax(160px, 1.2fr)", gap: 0, padding: "10px 12px", borderTop: `1px solid ${C.bd}`, alignItems: "start" }}>
                        <div><span style={{ ...mkP(true, actionTone[0], actionTone[1]), cursor: "default", fontSize: 11 }}>{entry.action === "update" ? "Update" : entry.action === "create" ? "Create" : "Skip"}</span></div>
                        <div>
                          <div style={{ fontWeight: 600, color: C.tx }}>{entry.talentName}</div>
                          <div style={{ fontSize: 11, color: C.tt }}>Line {entry.lineNumber}</div>
                        </div>
                        <div style={{ color: C.ts }}>{entry.campaign || "No campaign"}</div>
                        <div style={{ color: C.ts }}>{MM[entry.status]?.label || titleCaseWords(entry.status)}</div>
                        <div style={{ color: C.ts, lineHeight: 1.45 }}>
                          {entry.action === "update" && `Existing assignment match${entry.owner ? ` · Owner → ${entry.owner}` : ""}`}
                          {entry.action === "create" && `${entry.source === "existing_talent" ? "Existing talent found" : "Matched artist from project roster"} · new campaign assignment${entry.owner ? ` · Owner → ${entry.owner}` : ""}`}
                          {entry.action === "skip" && entry.reason}
                        </div>
                      </div>
                    );
                  }) : (
                    <div style={{ padding: "18px 14px", fontSize: 12, color: C.tt }}>
                      Paste rows above to preview what will happen before applying changes.
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 11, color: C.tt, lineHeight: 1.5 }}>
                  Supported formats: pipe-separated, comma-separated, or tab-separated. Header rows like <code style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>name,campaign,status,owner</code> also work.
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={closeMarketingBulkUpdateModal} style={{ padding: "8px 18px", borderRadius: 10, border: `1px solid ${C.bd}`, background: "transparent", cursor: "pointer", fontSize: 13, fontFamily: ft, color: C.ts }}>
                    Cancel
                  </button>
                  <button onClick={applyMarketingBulkUpdate} style={{ padding: "8px 24px", borderRadius: 10, border: "none", background: C.ac, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: ft, opacity: marketingBulkPreview.some(entry => entry.action !== "skip") ? 1 : 0.45 }}>
                    Apply Updates
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showMarketingItemModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 120 }} onClick={e => { if (e.target === e.currentTarget) { closeMarketingItemModal(); } }}>
            <div style={{ background: C.sf, borderRadius: 18, padding: "24px 28px", width: 720, maxWidth: "calc(100vw - 32px)", boxShadow: "0 25px 70px rgba(0,0,0,0.2)", maxHeight: "88vh", overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6, color: C.tx }}>{marketingForm.id ? "Edit Campaign Assignment" : "New Campaign Assignment"}</div>
                  <div style={{ fontSize: 12, color: C.ts }}>Track the talent, the campaign, the deliverable, and the links your team needs to move the work.</div>
                </div>
                <button onClick={closeMarketingItemModal} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.ts }}>✕</button>
              </div>

              {(relatedMarketingAssignments.length > 1 || marketingForm.talentName.trim()) && (
                <div style={{ display: "flex", gap: 10, alignItems: "end", justifyContent: "space-between", flexWrap: "wrap", marginBottom: 14 }}>
                  <div style={{ display: "grid", gap: 4, minWidth: 280, flex: "1 1 320px" }}>
                    <span style={{ fontSize: 12, color: C.ts }}>
                      {relatedMarketingAssignments.length > 1
                        ? `This talent already has ${relatedMarketingAssignments.length} campaign assignments in this project.`
                        : "Create a fresh campaign assignment for this same talent without retyping their profile details."}
                    </span>
                    {relatedMarketingAssignments.length > 1 && (
                      <select
                        value={marketingForm.id || ""}
                        onChange={e => openRelatedMarketingAssignment(e.target.value)}
                        style={{ ...iS, width: "100%" }}
                      >
                        {!marketingForm.id && (
                          <option value="">New campaign draft</option>
                        )}
                        {relatedMarketingAssignments.map(item => {
                          const campaignLabel = item.campaigns?.length ? item.campaigns.join(", ") : "No campaign";
                          const statusLabel = MM[item.status]?.label || "Prospect";
                          return (
                            <option key={item.id} value={item.id}>
                              {`${campaignLabel} · ${statusLabel}`}
                            </option>
                          );
                        })}
                      </select>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={startNewCampaignFromMarketingForm}
                    style={{ ...actionBtn(true, "accent"), whiteSpace: "nowrap" }}
                  >
                    + New Campaign
                  </button>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 10 }}>
                <input value={marketingForm.talentName} onChange={e => setMarketingForm({ ...marketingForm, talentName: e.target.value })} placeholder="Talent name*" autoFocus style={{ ...iS, width: "100%" }} />
                <input value={marketingForm.title} onChange={e => setMarketingForm({ ...marketingForm, title: e.target.value })} placeholder="Title or deliverable headline" style={{ ...iS, width: "100%" }} />

                <label style={{ fontSize: 12, color: C.ts, display: "grid", gap: 4 }}>
                  <span>Talent type</span>
                  <select value={marketingForm.talentType} onChange={e => setMarketingForm({ ...marketingForm, talentType: e.target.value })} style={{ ...iS, width: "100%" }}>
                    {MARKETING_TALENT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 12, color: C.ts, display: "grid", gap: 4 }}>
                  <span>Deliverable type</span>
                  <select value={marketingForm.deliverableType} onChange={e => setMarketingForm({ ...marketingForm, deliverableType: e.target.value })} style={{ ...iS, width: "100%" }}>
                    {MARKETING_DELIVERABLE_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                  </select>
                </label>

                <label style={{ fontSize: 12, color: C.ts, display: "grid", gap: 4 }}>
                  <span>Campaign</span>
                  <select value={marketingForm.campaign} onChange={e => setMarketingForm({ ...marketingForm, campaign: e.target.value, newCampaign: "" })} style={{ ...iS, width: "100%" }}>
                    <option value="">Select campaign</option>
                    {marketingCampaignOptions.map(campaign => <option key={campaign} value={campaign}>{campaign}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 12, color: C.ts, display: "grid", gap: 4 }}>
                  <span>Owner</span>
                  <select value={marketingForm.owner} onChange={e => setMarketingForm({ ...marketingForm, owner: e.target.value })} style={{ ...iS, width: "100%" }}>
                    <option value="">Unassigned</option>
                    {(proj?.teamUsers || DEFAULT_TEAM_USERS).map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </label>

                <input value={marketingForm.newCampaign} onChange={e => setMarketingForm({ ...marketingForm, newCampaign: e.target.value })} placeholder="Or create a new campaign" style={{ ...iS, width: "100%" }} />

                <label style={{ fontSize: 12, color: C.ts, display: "grid", gap: 4 }}>
                  <span>Traffic type</span>
                  <select value={marketingForm.trafficType} onChange={e => setMarketingForm({ ...marketingForm, trafficType: e.target.value })} style={{ ...iS, width: "100%" }}>
                    {MARKETING_TRAFFIC_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                  </select>
                </label>
                <div style={{ fontSize: 12, color: C.ts, display: "grid", gap: 6 }}>
                  <span>Channels</span>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {MARKETING_CHANNELS.map(type => {
                      const active = (marketingForm.channels || []).includes(type);
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setMarketingForm({
                            ...marketingForm,
                            channels: active
                              ? (marketingForm.channels || []).filter(channel => channel !== type)
                              : [...(marketingForm.channels || []), type],
                          })}
                          style={mkP(active, C.ac, C.al)}
                        >
                          {type}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label style={{ fontSize: 12, color: C.ts, display: "grid", gap: 4 }}>
                  <span>Status</span>
                  <select value={marketingForm.status} onChange={e => setMarketingForm({ ...marketingForm, status: e.target.value, rejectedReason: e.target.value === "rejected" ? marketingForm.rejectedReason : "" })} style={{ ...iS, width: "100%" }}>
                    {MARKETING_STATUSES.map(status => <option key={status.id} value={status.id}>{status.label}</option>)}
                  </select>
                </label>
                <input value={marketingForm.email} onChange={e => setMarketingForm({ ...marketingForm, email: e.target.value })} placeholder="Talent email" style={{ ...iS, width: "100%" }} />

                <label style={{ fontSize: 12, color: C.ts, display: "grid", gap: 4 }}>
                  <span>Due date</span>
                  <input type="date" value={marketingForm.dueDate} onChange={e => setMarketingForm({ ...marketingForm, dueDate: e.target.value })} style={{ ...iS, width: "100%" }} />
                </label>
                <input value={marketingForm.instagramUrl} onChange={e => setMarketingForm({ ...marketingForm, instagramUrl: e.target.value, instagramHandle: normalizeSocialHandle(e.target.value) })} placeholder="Instagram URL" style={{ ...iS, width: "100%" }} />

                <input value={marketingForm.instagramFollowers} onChange={e => setMarketingForm({ ...marketingForm, instagramFollowers: normalizeFollowerCount(e.target.value) })} placeholder="Instagram followers" style={{ ...iS, width: "100%" }} />
                <input value={marketingForm.tiktokUrl} onChange={e => setMarketingForm({ ...marketingForm, tiktokUrl: e.target.value, tiktokHandle: normalizeSocialHandle(e.target.value) })} placeholder="TikTok URL" style={{ ...iS, width: "100%" }} />

                <input value={marketingForm.tiktokFollowers} onChange={e => setMarketingForm({ ...marketingForm, tiktokFollowers: normalizeFollowerCount(e.target.value) })} placeholder="TikTok followers" style={{ ...iS, width: "100%" }} />
                <input value={marketingForm.spotifyUrl} onChange={e => setMarketingForm({ ...marketingForm, spotifyUrl: e.target.value })} placeholder="Spotify artist link" style={{ ...iS, width: "100%" }} />

                <input value={marketingForm.spotifyMonthlyListeners} onChange={e => setMarketingForm({ ...marketingForm, spotifyMonthlyListeners: normalizeFollowerCount(e.target.value) })} placeholder="Spotify monthly listeners" style={{ ...iS, width: "100%" }} />

                <input value={marketingForm.briefUrl} onChange={e => setMarketingForm({ ...marketingForm, briefUrl: e.target.value })} placeholder="Brief link" style={{ ...iS, width: "100%" }} />
                <input value={marketingForm.contentUrl} onChange={e => setMarketingForm({ ...marketingForm, contentUrl: e.target.value })} placeholder="Content link" style={{ ...iS, width: "100%" }} />

                {marketingForm.status === "rejected" && (
                  <textarea
                    value={marketingForm.rejectedReason}
                    onChange={e => setMarketingForm({ ...marketingForm, rejectedReason: e.target.value })}
                    placeholder="Why did the artist reject the opportunity?"
                    style={{ ...iS, width: "100%", minHeight: 84, resize: "vertical", gridColumn: "1 / span 2" }}
                  />
                )}

                <textarea value={marketingForm.notes} onChange={e => setMarketingForm({ ...marketingForm, notes: e.target.value })} placeholder="Notes, revision context, feedback, deliverable details..." style={{ ...iS, width: "100%", minHeight: 110, resize: "vertical", gridColumn: "1 / span 2" }} />
              </div>

              {marketingSlackNotice && (
                <div
                  style={{
                    marginTop: 14,
                    padding: "11px 14px",
                    borderRadius: 12,
                    border: `1px solid ${marketingSlackNotice.border}`,
                    background: marketingSlackNotice.bg,
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: marketingSlackNotice.tone, marginBottom: 4 }}>
                    Slack Notice
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: marketingSlackNotice.tone, marginBottom: 3 }}>
                    {marketingSlackNotice.headline}
                  </div>
                  <div style={{ fontSize: 12, color: C.ts, lineHeight: 1.5 }}>
                    {marketingSlackNotice.detail}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 18 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {marketingForm.id && workspaceTalentData.marketingTalentIds.get(String(marketingForm.id || "")) && (
                    <button
                      type="button"
                      onClick={() => openTalentProfileFromMarketingItem({ id: marketingForm.id })}
                      style={{ ...actionBtn(false, "accent") }}
                    >
                      Open Talent Profile
                    </button>
                  )}
                  {marketingForm.email && <a href={`mailto:${marketingForm.email}`} style={{ ...actionBtn(false, "neutral"), textDecoration: "none" }}>Email Talent</a>}
                  {(marketingForm.instagramUrl || marketingForm.instagramHandle) && <a href={marketingForm.instagramUrl || `https://instagram.com/${marketingForm.instagramHandle}`} target="_blank" rel="noopener" style={{ ...actionBtn(false, "neutral"), textDecoration: "none" }}>Instagram</a>}
                  {(marketingForm.tiktokUrl || marketingForm.tiktokHandle) && <a href={marketingForm.tiktokUrl || `https://www.tiktok.com/@${marketingForm.tiktokHandle}`} target="_blank" rel="noopener" style={{ ...actionBtn(false, "neutral"), textDecoration: "none" }}>TikTok</a>}
                  {marketingForm.spotifyUrl && <a href={marketingForm.spotifyUrl} target="_blank" rel="noopener" style={{ ...actionBtn(false, "neutral"), textDecoration: "none" }}>Spotify</a>}
                  {marketingForm.briefUrl && <a href={marketingForm.briefUrl} target="_blank" rel="noopener" style={{ ...actionBtn(false, "neutral"), textDecoration: "none" }}>Open Brief</a>}
                  {marketingForm.contentUrl && <a href={marketingForm.contentUrl} target="_blank" rel="noopener" style={{ ...actionBtn(false, "neutral"), textDecoration: "none" }}>Open Content</a>}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  {marketingForm.id && (
                    <button onClick={() => deleteMarketingItem(marketingForm.id)} style={{ padding: "8px 18px", borderRadius: 10, border: `1px solid ${C.rbd}`, background: C.rb, cursor: "pointer", fontSize: 13, fontFamily: ft, color: C.rd }}>
                      Delete
                    </button>
                  )}
                  <button onClick={closeMarketingItemModal} style={{ padding: "8px 18px", borderRadius: 10, border: `1px solid ${C.bd}`, background: "transparent", cursor: "pointer", fontSize: 13, fontFamily: ft, color: C.ts }}>Cancel</button>
                  <button disabled={!marketingForm.talentName.trim() || marketingItemSaving} onClick={saveMarketingItem} style={{ padding: "8px 24px", borderRadius: 10, border: "none", background: C.ac, color: "#fff", cursor: !marketingForm.talentName.trim() || marketingItemSaving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, fontFamily: ft, opacity: marketingForm.talentName.trim() && !marketingItemSaving ? 1 : 0.45 }}>
                    {marketingItemSaving ? (marketingForm.id ? "Saving..." : "Adding...") : (marketingForm.id ? "Save Changes" : "Add Assignment")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {showTalentProfileModal && selectedTalentProfile && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.38)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 126 }} onClick={e => { if (e.target === e.currentTarget) closeTalentProfileModal(); }}>
            <div style={{ background: C.sf, borderRadius: 18, padding: "24px 28px", width: 960, maxWidth: "calc(100vw - 32px)", boxShadow: "0 25px 70px rgba(0,0,0,0.2)", maxHeight: "88vh", overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.ac, fontWeight: 700, marginBottom: 8 }}>Talent Overview</div>
                  <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.04em", color: C.tx, marginBottom: 8 }}>{selectedTalentProfile.displayName}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {selectedTalentProfile.talentTypes.map(type => (
                      <span key={type} style={{ ...mkP(true, C.ac, C.al), cursor: "default" }}>{type}</span>
                    ))}
                    <span style={{ ...mkP(true, talentLifecycleTone(selectedTalentProfile.platformLifecycle, C).tone, talentLifecycleTone(selectedTalentProfile.platformLifecycle, C).bg), cursor: "default" }}>
                      {TALENT_LIFECYCLE_LABELS[selectedTalentProfile.platformLifecycle] || "Pre-Live"}
                    </span>
                    {selectedTalentProfile.sources.map(source => (
                      <span key={source} style={{ ...mkP(true, C.ts, C.sa), cursor: "default" }}>
                        {TALENT_SOURCE_LABELS[source] || source}
                      </span>
                    ))}
                    <span style={{ ...mkP(true, C.ts, C.sa), cursor: "default" }}>{selectedTalentProjectSummaries.length} project{selectedTalentProjectSummaries.length === 1 ? "" : "s"}</span>
                    <span style={{ ...mkP(true, C.ts, C.sa), cursor: "default" }}>{selectedTalentProfile.marketingAssignments.length} marketing assignment{selectedTalentProfile.marketingAssignments.length === 1 ? "" : "s"}</span>
                    <span style={{ ...mkP(true, C.ts, C.sa), cursor: "default" }}>{selectedTalentProfile.arRecords.length} A&R record{selectedTalentProfile.arRecords.length === 1 ? "" : "s"}</span>
                  </div>
                </div>
                <button onClick={closeTalentProfileModal} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: C.ts }}>✕</button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
                <div style={{ ...cS, padding: "18px 20px" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Identity</div>
                  <div style={{ display: "grid", gap: 10, fontSize: 13 }}>
                    <div className="gf-rail-kv">
                      <span className="gf-rail-kv-label">Platform lifecycle</span>
                      <span className="gf-rail-kv-value">{TALENT_LIFECYCLE_LABELS[selectedTalentProfile.platformLifecycle] || "Pre-Live"}</span>
                    </div>
                    <div className="gf-rail-kv">
                      <span className="gf-rail-kv-label">Sources</span>
                      <span className="gf-rail-kv-value">
                        {selectedTalentProfile.sources.length
                          ? selectedTalentProfile.sources.map(source => TALENT_SOURCE_LABELS[source] || source).join(" · ")
                          : "Not labeled yet"}
                      </span>
                    </div>
                    <div className="gf-rail-kv">
                      <span className="gf-rail-kv-label">Primary email</span>
                      <span className="gf-rail-kv-value">{selectedTalentProfile.primaryEmail || "No email yet"}</span>
                    </div>
                    <div className="gf-rail-kv">
                      <span className="gf-rail-kv-label">Instagram</span>
                      <span className="gf-rail-kv-value">
                        {selectedTalentProfile.instagramHandle
                          ? `@${selectedTalentProfile.instagramHandle}${selectedTalentProfile.instagramFollowers ? ` · ${selectedTalentProfile.instagramFollowers}` : ""}`
                          : "Not linked yet"}
                      </span>
                    </div>
                    <div className="gf-rail-kv">
                      <span className="gf-rail-kv-label">TikTok</span>
                      <span className="gf-rail-kv-value">
                        {selectedTalentProfile.tiktokHandle
                          ? `@${selectedTalentProfile.tiktokHandle}${selectedTalentProfile.tiktokFollowers ? ` · ${selectedTalentProfile.tiktokFollowers}` : ""}`
                          : "Not linked yet"}
                      </span>
                    </div>
                    <div className="gf-rail-kv">
                      <span className="gf-rail-kv-label">Spotify</span>
                      <span className="gf-rail-kv-value">
                        {selectedTalentProfile.spotifyUrl
                          ? `${selectedTalentProfile.spotifyMonthlyListeners || "Linked"}`
                          : "Not linked yet"}
                      </span>
                    </div>
                    {selectedTalentProfile.curatorPageUrl && (
                      <div className="gf-rail-kv">
                        <span className="gf-rail-kv-label">Curator page</span>
                        <span className="gf-rail-kv-value">Linked</span>
                      </div>
                    )}
                    {selectedTalentProfile.curatedArtists.length > 0 && (
                      <div className="gf-rail-kv">
                        <span className="gf-rail-kv-label">Curated artists</span>
                        <span className="gf-rail-kv-value">{selectedTalentProfile.curatedArtists.length}</span>
                      </div>
                    )}
                    {selectedTalentProfile.aliases.length > 0 && (
                      <div className="gf-rail-kv">
                        <span className="gf-rail-kv-label">Aliases</span>
                        <span className="gf-rail-kv-value">{selectedTalentProfile.aliases.join(" · ")}</span>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                      {selectedTalentProfile.primaryEmail && (
                        <a href={`mailto:${selectedTalentProfile.primaryEmail}`} style={{ ...actionBtn(false, "neutral"), textDecoration: "none" }}>Email</a>
                      )}
                      {selectedTalentProfile.instagramHandle && (
                        <a href={selectedTalentProfile.instagramUrl || `https://instagram.com/${selectedTalentProfile.instagramHandle}`} target="_blank" rel="noopener" style={{ ...actionBtn(false, "neutral"), textDecoration: "none" }}>Instagram</a>
                      )}
                      {selectedTalentProfile.tiktokHandle && (
                        <a href={selectedTalentProfile.tiktokUrl || `https://www.tiktok.com/@${selectedTalentProfile.tiktokHandle}`} target="_blank" rel="noopener" style={{ ...actionBtn(false, "neutral"), textDecoration: "none" }}>TikTok</a>
                      )}
                      {selectedTalentProfile.spotifyUrl && (
                        <a href={selectedTalentProfile.spotifyUrl} target="_blank" rel="noopener" style={{ ...actionBtn(false, "neutral"), textDecoration: "none" }}>Spotify</a>
                      )}
                      {selectedTalentProfile.curatorPageUrl && (
                        <a href={selectedTalentProfile.curatorPageUrl} target="_blank" rel="noopener" style={{ ...actionBtn(false, "neutral"), textDecoration: "none" }}>Curator Page</a>
                      )}
                    </div>
                    {selectedTalentProfile.curatedArtists.length > 0 && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                        {selectedTalentProfile.curatedArtists.map(name => (
                          <span key={name} style={{ ...mkP(true, C.ac, C.al), cursor: "default" }}>{name}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ ...cS, padding: "18px 20px" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Workspace Coverage</div>
                  <div style={{ fontSize: 12, color: C.ts, marginBottom: 12 }}>
                    Identity stays shared here, while kickoff progress, curator context, and live campaign work stay separated underneath.
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {selectedTalentProjectSummaries.length ? selectedTalentProjectSummaries.map(summary => (
                      <div key={summary.projectId} style={{ padding: "12px 14px", borderRadius: 14, border: `1px solid ${C.bd}`, background: C.sa }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, marginBottom: 4 }}>{summary.projectName}</div>
                            <div style={{ fontSize: 11, color: C.tt }}>
                              {projectTypeLabel(summary.projectType)} record
                              {" · "}
                              {summary.arRecords.length ? `${summary.arRecords.length} A&R record${summary.arRecords.length === 1 ? "" : "s"}` : "No A&R record"}
                              {" · "}
                              {summary.marketingAssignments.length ? `${summary.marketingAssignments.length} marketing assignment${summary.marketingAssignments.length === 1 ? "" : "s"}` : "No marketing assignments"}
                            </div>
                          </div>
                          <span style={{ ...mkP(true, C.tt, C.sf), cursor: "default" }}>
                            Synced backup record
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {summary.owners.map(owner => (
                            <span key={`${summary.projectId}:owner:${owner}`} style={{ ...mkP(true, C.ts, C.sa), cursor: "default" }}>Owner: {owner}</span>
                          ))}
                          {summary.arStages.map(stage => (
                            <span key={`${summary.projectId}:stage:${stage}`} style={{ ...mkP(true, sc(stage, C), sb(stage, C)), cursor: "default" }}>{SM[stage]?.label || "Prospect"}</span>
                          ))}
                          {summary.marketingStatuses.map(status => {
                            const tone = marketingStatusTone(status, C);
                            return (
                              <span key={`${summary.projectId}:status:${status}`} style={{ ...mkP(true, tone.tone, tone.bg), cursor: "default" }}>{MM[status]?.label || "Prospect"}</span>
                            );
                          })}
                        </div>
                      </div>
                    )) : (
                      <div style={{ fontSize: 12, color: C.tt }}>No linked projects yet.</div>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ ...cS, padding: "18px 20px", marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Latest Notes + Timeline</div>
                    <div style={{ fontSize: 12, color: C.ts }}>
                      The newest kickoff, curator, and campaign updates tied to this person across the workspace.
                    </div>
                  </div>
                  <div style={{ ...mkP(true, C.ts, C.sa), cursor: "default" }}>
                    {selectedTalentRecentActivity.length} recent item{selectedTalentRecentActivity.length === 1 ? "" : "s"}
                  </div>
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  {selectedTalentRecentActivity.length ? selectedTalentRecentActivity.map((entry, index) => (
                    <div key={`${entry.id || entry.time || entry.action || "activity"}:${index}`} style={{ padding: "12px 14px", borderRadius: 14, border: `1px solid ${C.bd}`, background: C.sa }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, marginBottom: 4 }}>
                            {entry.action || "Workspace update"}
                          </div>
                          {entry.note && entry.note !== entry.action && (
                            <div style={{ fontSize: 12, color: C.ts, lineHeight: 1.6 }}>
                              {entry.note}
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: C.tt, whiteSpace: "nowrap" }}>
                          {entry.time ? fmtDateTime(entry.time) : "Time unknown"}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {entry.projectName && <span style={{ ...mkP(true, C.ac, C.al), cursor: "default" }}>{entry.projectName}</span>}
                        {entry.campaign && entry.campaign !== "No campaign" && <span style={{ ...mkP(true, C.bu, C.bb), cursor: "default" }}>{entry.campaign}</span>}
                        {entry.actor && <span style={{ ...mkP(true, C.ts, C.sa), cursor: "default" }}>{entry.actor}</span>}
                        {entry.kind && <span style={{ ...mkP(true, C.tt, C.sa), cursor: "default" }}>{titleCaseWords(entry.kind)}</span>}
                      </div>
                    </div>
                  )) : (
                    <div style={{ fontSize: 12, color: C.tt }}>No linked notes or timeline items yet.</div>
                  )}
                </div>
              </div>

              <div style={{ ...cS, padding: "18px 20px", marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Place in workspace</div>
                    <div style={{ fontSize: 12, color: C.ts }}>
                      Reuse this shared talent in another workspace without retyping their profile details.
                    </div>
                  </div>
                  <button
                    onClick={addTalentProfileToProject}
                    disabled={!talentTargetProjectId || talentTargetSaving}
                    style={{
                      ...actionBtn(false, "accent"),
                      opacity: talentTargetProjectId && !talentTargetSaving ? 1 : 0.45,
                      cursor: talentTargetProjectId && !talentTargetSaving ? "pointer" : "not-allowed",
                    }}
                  >
                    {talentTargetSaving
                      ? "Adding..."
                      : talentTargetProjectType === "marketing" && talentTargetExistingMarketingAssignment
                        ? "Open Existing Assignment"
                        : talentTargetProjectType !== "marketing" && talentTargetExistingArRecord
                          ? `Open Existing ${talentTargetProjectType === "curator" ? "Curator" : "Artist"}`
                        : "Add to Record"}
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: talentTargetProjectType === "marketing" ? "1.2fr 1fr 1fr 1fr" : "1.4fr 1fr 1fr", gap: 12, alignItems: "end", marginBottom: 12 }}>
                  <label style={{ fontSize: 12, color: C.ts, display: "grid", gap: 6 }}>
                    <span>Target record</span>
                    <select
                      value={talentTargetProjectId}
                      onChange={e => setTalentTargetProjectId(e.target.value)}
                      style={{ ...iS, width: "100%" }}
                    >
                      <option value="">Choose a project…</option>
                      {talentTargetProjectOptions.map(option => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                  </label>

                  {talentTargetProjectType === "marketing" && (
                    <label style={{ fontSize: 12, color: C.ts, display: "grid", gap: 6 }}>
                      <span>Campaign</span>
                      <select
                        value={talentTargetCampaign}
                        onChange={e => setTalentTargetCampaign(e.target.value)}
                        style={{ ...iS, width: "100%" }}
                      >
                        <option value="">No campaign</option>
                        {talentTargetCampaignOptions.map(campaign => (
                          <option key={campaign} value={campaign}>{campaign}</option>
                        ))}
                      </select>
                    </label>
                  )}

                  <label style={{ fontSize: 12, color: C.ts, display: "grid", gap: 6 }}>
                    <span>{talentTargetProjectType === "marketing" ? "Assignment status" : "Pipeline stage"}</span>
                    <select
                      value={talentTargetStatus}
                      onChange={e => setTalentTargetStatus(e.target.value)}
                      style={{ ...iS, width: "100%" }}
                    >
                      {(talentTargetProjectType === "marketing" ? MARKETING_STATUSES : STAGES).map(status => (
                        <option key={status.id} value={status.id}>{status.label}</option>
                      ))}
                    </select>
                  </label>

                  <label style={{ fontSize: 12, color: C.ts, display: "grid", gap: 6 }}>
                    <span>Owner</span>
                    <select
                      value={talentTargetOwner}
                      onChange={e => setTalentTargetOwner(e.target.value)}
                      style={{ ...iS, width: "100%" }}
                    >
                      <option value="">Unassigned</option>
                      {talentTargetTeamUsers.map(user => (
                        <option key={user} value={user}>{user}</option>
                      ))}
                    </select>
                  </label>
                </div>

                {talentTargetProjectType === "marketing" && (
                  <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
                    <label style={{ fontSize: 12, color: C.ts, display: "grid", gap: 6 }}>
                      <span>Or create a new campaign</span>
                      <input
                        value={talentTargetNewCampaign}
                        onChange={e => setTalentTargetNewCampaign(e.target.value)}
                        placeholder="Type a new campaign name"
                        style={{ ...iS, width: "100%" }}
                      />
                    </label>
                    <div style={{ fontSize: 11, color: C.tt }}>
                      {talentTargetNewCampaign.trim()
                        ? `New assignment will use "${talentTargetNewCampaign.trim()}".`
                        : talentTargetCampaign
                          ? `New assignment will use "${talentTargetCampaign}".`
                          : "Leave both blank if this belongs in the project without a campaign yet."}
                    </div>
                  </div>
                )}

                <div style={{ fontSize: 12, color: C.ts, background: C.sa, border: `1px solid ${C.bd}`, borderRadius: 14, padding: "10px 12px" }}>
                  {!talentTargetProjectId
                    ? "Choose a destination project to prepare the new placement."
                    : talentTargetProjectType === "marketing" && talentTargetExistingMarketingAssignment
                      ? `This talent already has an assignment in ${talentTargetProject?.name} for ${talentTargetExistingMarketingAssignment.campaign || "No campaign"}. Clicking the button will open it.`
                      : talentTargetProjectType === "marketing" && talentTargetMarketingAssignments.length
                        ? `This talent is already in ${talentTargetProject?.name} on ${talentTargetMarketingAssignments.length} other marketing assignment${talentTargetMarketingAssignments.length === 1 ? "" : "s"}.`
                        : talentTargetProjectType !== "marketing" && talentTargetExistingArRecord
                          ? `This talent is already in ${talentTargetProject?.name} as a ${talentTargetProjectType === "curator" ? "curator" : "pipeline"} record. Clicking the button will open it.`
                          : talentTargetProjectType === "marketing"
                            ? "We’ll create a new campaign assignment and keep the shared talent profile intact."
                            : talentTargetProjectType === "curator"
                              ? "We’ll add this talent into the curator roster for that project and keep their shared profile linked here."
                              : "We’ll add this talent into the A&R roster for that project and keep their shared profile linked here."}
                </div>
              </div>

              <div style={{ ...cS, padding: "18px 20px", marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Kickoff Details</div>
                <div style={{ display: "grid", gap: 10 }}>
                  {selectedTalentArProjectSummaries.length ? selectedTalentArProjectSummaries.map(summary => (
                    <div key={`ar:${summary.projectId}`} style={{ padding: "12px 14px", borderRadius: 14, border: `1px solid ${C.bd}`, background: C.sa }}>
                      <div style={{ fontSize: 12, color: C.tt, marginBottom: 10 }}>{summary.projectName}</div>
                      <div style={{ display: "grid", gap: 10 }}>
                        {summary.arRecords.map(record => (
                          <div key={`${record.projectId}:${record.artistName}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", padding: "12px 14px", borderRadius: 14, border: `1px solid ${C.bd}`, background: C.sf }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>{record.artistName}</div>
                                <span style={{ ...mkP(true, record.projectType === "curator" ? C.ac : C.ts, record.projectType === "curator" ? C.al : C.sa), cursor: "default" }}>
                                  {record.projectType === "curator" ? "Curator" : "A&R"}
                                </span>
                                <span style={{ ...mkP(true, sc(record.stage, C), sb(record.stage, C)), cursor: "default" }}>{SM[record.stage]?.label || "Prospect"}</span>
                                {record.owner && <span style={{ ...mkP(true, C.ts, C.sa), cursor: "default" }}>{record.owner}</span>}
                              </div>
                              <div style={{ fontSize: 11, color: C.tt }}>
                                {[record.genre, record.monthlyListeners ? `${record.monthlyListeners} listeners` : "", record.location].filter(Boolean).join(" · ") || (record.projectType === "curator" ? "Working curator record" : "Working A&R record")}
                              </div>
                              {(record.note || record.followUp) && (
                                <div style={{ display: "grid", gap: 4, marginTop: 8, fontSize: 11, color: C.ts, lineHeight: 1.5 }}>
                                  {record.note && <div><strong style={{ color: C.tx }}>Notes:</strong> {record.note}</div>}
                                  {record.followUp && <div><strong style={{ color: C.tx }}>Follow-up:</strong> {record.followUp}</div>}
                                </div>
                              )}
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                                <label style={{ fontSize: 11, color: C.ts, display: "grid", gap: 4 }}>
                                  <span>Kickoff stage</span>
                                  <select
                                    value={normalizeStageId(record.stage || "prospect")}
                                    disabled={isReadOnly}
                                    onChange={e => { void updateTalentOverviewKickoffStage(record, e.target.value); }}
                                    style={{ ...iS, width: "100%", fontSize: 12, ...lockStyle(isReadOnly) }}
                                  >
                                    {KICKOFF_STAGE_ACTIONS.map(stage => (
                                      <option key={`talent-stage-${record.projectId}-${record.artistName}-${stage.id}`} value={stage.id}>
                                        {stage.label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label style={{ fontSize: 11, color: C.ts, display: "grid", gap: 4 }}>
                                  <span>Owner</span>
                                  <select
                                    value={record.owner || ""}
                                    disabled={isReadOnly}
                                    onChange={e => { void updateTalentOverviewKickoffOwner(record, e.target.value); }}
                                    style={{ ...iS, width: "100%", fontSize: 12, ...lockStyle(isReadOnly) }}
                                  >
                                    <option value="">Unassigned</option>
                                    {(projects.find(project => project.id === record.projectId)?.teamUsers || DEFAULT_TEAM_USERS).map(user => (
                                      <option key={`talent-owner-${record.projectId}-${record.artistName}-${user}`} value={user}>{user}</option>
                                    ))}
                                  </select>
                                </label>
                              </div>
                              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                                <label style={{ fontSize: 11, color: C.ts, display: "grid", gap: 4 }}>
                                  <span>Kickoff notes</span>
                                  <textarea
                                    defaultValue={record.note || ""}
                                    readOnly={isReadOnly}
                                    onClick={e => e.stopPropagation()}
                                    onBlur={e => { void updateTalentOverviewKickoffNote(record, e.currentTarget.value.trim()); }}
                                    placeholder="Add kickoff notes here..."
                                    style={{ ...iS, width: "100%", minHeight: 72, resize: "vertical", fontSize: 12, ...lockStyle(isReadOnly) }}
                                  />
                                </label>
                                <label style={{ fontSize: 11, color: C.ts, display: "grid", gap: 4 }}>
                                  <span>Follow-up date</span>
                                  <input
                                    type="date"
                                    defaultValue={record.followUp || ""}
                                    disabled={isReadOnly}
                                    onClick={e => e.stopPropagation()}
                                    onChange={e => { void updateTalentOverviewKickoffFollowUp(record, e.target.value); }}
                                    style={{ ...iS, width: "100%", fontSize: 12, ...lockStyle(isReadOnly) }}
                                  />
                                </label>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )) : (
                    <div style={{ fontSize: 12, color: C.tt }}>No A&R placements linked yet.</div>
                  )}
                </div>
              </div>

              <div style={{ ...cS, padding: "18px 20px" }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Live Roster Campaigns</div>
                <div style={{ display: "grid", gap: 10 }}>
                  {selectedTalentMarketingProjectSummaries.length ? selectedTalentMarketingProjectSummaries.map(summary => (
                    <div key={`marketing:${summary.projectId}`} style={{ padding: "12px 14px", borderRadius: 14, border: `1px solid ${C.bd}`, background: C.sa }}>
                      <div style={{ fontSize: 12, color: C.tt, marginBottom: 10 }}>{summary.projectName}</div>
                      <div style={{ display: "grid", gap: 10 }}>
                        {summary.marketingAssignments.map(assignment => (
                          <div key={assignment.assignmentId} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", padding: "12px 14px", borderRadius: 14, border: `1px solid ${C.bd}`, background: C.sf }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>{assignment.campaign || "No campaign"}</div>
                                <span style={{ ...mkP(true, marketingStatusTone(assignment.status, C).tone, marketingStatusTone(assignment.status, C).bg), cursor: "default" }}>{MM[assignment.status]?.label || "Prospect"}</span>
                                {assignment.owner && <span style={{ ...mkP(true, C.ts, C.sa), cursor: "default" }}>{assignment.owner}</span>}
                              </div>
                              <div style={{ fontSize: 11, color: C.tt }}>
                                {[assignment.title, assignment.trafficType, assignment.deliverableType, assignment.dueDate ? `Due ${sD(assignment.dueDate)}` : ""].filter(Boolean).join(" · ") || "Marketing assignment"}
                              </div>
                              {(assignment.notes || assignment.rejectedReason) && (
                                <div style={{ display: "grid", gap: 4, marginTop: 8, fontSize: 11, color: C.ts, lineHeight: 1.5 }}>
                                  {assignment.notes && <div><strong style={{ color: C.tx }}>Notes:</strong> {assignment.notes}</div>}
                                  {assignment.rejectedReason && <div><strong style={{ color: C.tx }}>Rejected:</strong> {assignment.rejectedReason}</div>}
                                </div>
                              )}
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                                <label style={{ fontSize: 11, color: C.ts, display: "grid", gap: 4 }}>
                                  <span>Campaign status</span>
                                  <select
                                    value={normalizeMarketingStatus(assignment.status || "prospect")}
                                    disabled={isReadOnly}
                                    onChange={e => { void updateTalentOverviewMarketingStatus(assignment, e.target.value); }}
                                    style={{ ...iS, width: "100%", fontSize: 12, ...lockStyle(isReadOnly) }}
                                  >
                                    {MARKETING_STATUSES.map(status => (
                                      <option key={`talent-assignment-status-${assignment.assignmentId}-${status.id}`} value={status.id}>
                                        {status.label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label style={{ fontSize: 11, color: C.ts, display: "grid", gap: 4 }}>
                                  <span>Owner</span>
                                  <select
                                    value={assignment.owner || ""}
                                    disabled={isReadOnly}
                                    onChange={e => { void updateTalentOverviewMarketingOwner(assignment, e.target.value); }}
                                    style={{ ...iS, width: "100%", fontSize: 12, ...lockStyle(isReadOnly) }}
                                  >
                                    <option value="">Unassigned</option>
                                    {(projects.find(project => project.id === assignment.projectId)?.teamUsers || DEFAULT_TEAM_USERS).map(user => (
                                      <option key={`talent-assignment-owner-${assignment.assignmentId}-${user}`} value={user}>{user}</option>
                                    ))}
                                  </select>
                                </label>
                              </div>
                              <label style={{ fontSize: 11, color: C.ts, display: "grid", gap: 4, marginTop: 10 }}>
                                <span>Campaign notes</span>
                                <textarea
                                  defaultValue={assignment.notes || ""}
                                  readOnly={isReadOnly}
                                  onClick={e => e.stopPropagation()}
                                  onBlur={e => { void updateTalentOverviewMarketingNotes(assignment, e.currentTarget.value.trim()); }}
                                  placeholder="Add campaign notes here..."
                                  style={{ ...iS, width: "100%", minHeight: 78, resize: "vertical", fontSize: 12, ...lockStyle(isReadOnly) }}
                                />
                              </label>
                            </div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                              {assignment.briefUrl && <a href={assignment.briefUrl} target="_blank" rel="noopener" style={{ ...actionBtn(false, "neutral"), textDecoration: "none" }}>Brief</a>}
                              {assignment.contentUrl && <a href={assignment.contentUrl} target="_blank" rel="noopener" style={{ ...actionBtn(false, "neutral"), textDecoration: "none" }}>Content</a>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )) : (
                    <div style={{ fontSize: 12, color: C.tt }}>No marketing assignments linked yet.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  </div>
  );
  }

  return null;
} 
