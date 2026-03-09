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
const VALID_STAGE_IDS = new Set(STAGES.map(s => s.id));
const CONTACTED_STAGE_IDS = ["sent", "replied", "engaged", "won", "live"];
const REPLIED_STAGE_IDS = ["replied", "engaged", "won", "live"];
const ENGAGED_STAGE_IDS = ["engaged", "won", "live"];
const WON_STAGE_IDS = ["won", "live"];
const CLOSED_STAGE_IDS = ["won", "live", "dead"];
const OPEN_STAGE_IDS = STAGES.map(s => s.id).filter(id => !CLOSED_STAGE_IDS.includes(id));

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
];

const AI_PROVIDER_LABELS = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google Gemini",
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
function isClosedStage(stage) {
  return CLOSED_STAGE_IDS.includes(stage);
}
function matchesStageFilter(stage, filterId) {
  if (filterId === "all") return true;
  if (filterId === "contacted") return isContactedStage(stage);
  return stage === filterId;
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
function rD(iso) { if (!iso) return ""; const d = Math.floor((new Date() - new Date(iso)) / 864e5); if (d === 0) return "today"; if (d === 1) return "yesterday"; if (d < 7) return `${d}d ago`; if (d < 30) return `${Math.floor(d / 7)}w ago`; return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
function sD(iso) { if (!iso) return ""; return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }); }
function daysBetween(a, b) { return Math.floor((new Date(b) - new Date(a)) / 864e5); }
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
  };
  return {
    ...p,
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
    teamUsers: Array.isArray(p.teamUsers) && p.teamUsers.length ? p.teamUsers : [...DEFAULT_TEAM_USERS],
    assignments: p.assignments || {},
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
      ...(p.settings || {}),
      publicCsvToken: p.settings?.publicCsvToken || "",
      aiModelsByProvider,
      draftGuardrails: { ...DEFAULT_DRAFT_GUARDRAILS, ...(p.settings?.draftGuardrails || {}) },
      savedTemplates: sanitizeSavedTemplates(p.settings?.savedTemplates || []),
    },
  };
}

const AI_KEY_STORAGE = {
  anthropic: "gemfinder-anthropic-key",
  openai: "gemfinder-openai-key",
  google: "gemfinder-google-key",
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
  if (key.startsWith("sk-proj-") || key.startsWith("sk-")) return "openai";
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
    if (!res.ok) return { ok: false, error: data.error || "Could not load projects" };
    return { ok: true, projects: Array.isArray(data.projects) ? data.projects : [] };
  } catch {
    return { ok: false, error: "Network error loading projects" };
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

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim());
  const results = [];
  const seen = new Set();
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(",").map(v => v.trim());
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
    .replace(/^https?:\/\/(www\.)?tiktok\.com\/@/i, "")
    .replace(/^https?:\/\/(www\.)?x\.com\//i, "")
    .replace(/^https?:\/\/(www\.)?twitter\.com\//i, "");
  return withoutUrl.replace(/^@/, "").replace(/\/.*$/, "").trim();
}

function parseArtistNameCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const splitLine = line => line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
  const firstRow = splitLine(lines[0]);
  const headerCandidates = ["artist", "artist name", "name", "artist_name", "artistname"];
  const headerIndex = firstRow.findIndex(h => headerCandidates.includes(h.toLowerCase()));
  const startIndex = headerIndex >= 0 ? 1 : 0;
  const nameIndex = headerIndex >= 0 ? headerIndex : 0;
  const seen = new Set();
  const names = [];
  for (let i = startIndex; i < lines.length; i++) {
    const cols = splitLine(lines[i]);
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
  const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${proj.name.replace(/\s+/g, "_")}_pipeline_v7.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function App({ authUserId = "", authEmail = "", authRole = "editor" } = {}) {
  const [dark, setDark] = useState(false);
  const [projects, setProjects] = useState([]);
  const [apId, setApId] = useState(null);
  const [screen, setScreen] = useState("hub");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const fr = useRef(null);
  const rosterRef = useRef(null);
  const workSurfaceRef = useRef(null);

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
  const [showAddArtist, setShowAddArtist] = useState(false);
  const [artistForm, setArtistForm] = useState({
    name: "",
    genre: "",
    listeners: "",
    hitTrack: "",
    social: "",
    email: "",
    location: "",
    note: "",
  });

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
  const [newTeamUser, setNewTeamUser] = useState("");
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
  const proj = projects.find(p => p.id === apId);
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

  const C = dark ? DK : LT;
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
    .gf-project-nav-btn{display:flex;align-items:center;gap:12px;width:100%;padding:14px 16px;border-radius:18px;border:1px solid ${C.bd};background:transparent;color:${C.ts};cursor:pointer;font-size:14px;font-weight:700;font-family:${ft};text-align:left}
    .gf-project-nav-btn.active{border-color:${C.ac}50;background:${C.al};color:${C.ac}}
    .gf-project-nav-icon{width:28px;height:28px;border-radius:10px;border:1px solid ${C.bd};display:inline-flex;align-items:center;justify-content:center;background:${C.sa};flex-shrink:0}
    .gf-project-nav-btn.active .gf-project-nav-icon{border-color:${C.ac}34;background:${C.sf}}
    .gf-project-nav-meta{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;width:100%}
    .gf-project-nav-hint{font-size:11px;color:${C.tt};font-weight:500;line-height:1.3;text-align:right;max-width:92px}
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
    .gf-detail-intel-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .gf-detail-sticky-footer{position:sticky;bottom:16px;z-index:10;margin-top:12px;padding:12px;border:1px solid ${C.bd};border-radius:14px;background:${dark ? "rgba(11,18,32,0.96)" : "rgba(255,255,255,0.96)"};box-shadow:${C.sm};backdrop-filter:blur(12px)}
    .gf-rail-kv{display:grid;gap:4px}
    .gf-rail-kv-label{font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:${C.tt}}
    .gf-rail-kv-value{font-size:13px;font-weight:700;color:${C.tx};line-height:1.35}
    @media (min-width:1080px){.gf-detail-shell{grid-template-columns:minmax(0,1fr) 300px}}
    @media (max-width:1160px){.gf-project-shell{grid-template-columns:1fr}.gf-project-sidebar{position:static;height:auto;border-right:none;border-bottom:1px solid ${C.bd}}.gf-project-main-inner{padding:24px 20px 32px}.gf-project-hero{grid-template-columns:1fr}.gf-project-overview-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.gf-project-nav-hint{max-width:none}}
    @media (max-width:860px){.gf-detail-intel-grid{grid-template-columns:1fr}.gf-detail-tabs{top:8px}.gf-detail-sticky-footer{bottom:10px}.gf-project-overview-grid{grid-template-columns:1fr}.gf-project-headline{font-size:34px}}
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
    note: "",
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
        const nextLayouts = d?.layoutByUser || {};
        const localProjects = Array.isArray(d?.projects) ? d.projects : [];
        if (d?.lastActive) setApId(d.lastActive);
        if (d?.dark) setDark(d.dark);
        if (d?.viewMode) setViewMode(d.viewMode);
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
        setAiKeySet(!!getStoredAiKey("anthropic") || !!getStoredAiKey("openai"));

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

  const persist = useCallback(async (np, la, dk, vm, lb, wu) => {
    const nextProjects = np || projects;
    await sSet(storageKey, {
      projects: nextProjects,
      lastActive: la !== undefined ? la : apId,
      dark: dk !== undefined ? dk : dark,
      viewMode: vm !== undefined ? vm : viewMode,
      layoutByUser: lb !== undefined ? lb : layoutByUser,
      workspaceUser: wu !== undefined ? wu : workspaceUser,
    });
    if (np !== undefined && authUserId && canEdit) {
      const result = await apiSaveProjects(nextProjects);
      if (!result.ok) {
        console.error("Shared project save failed:", result.error);
      }
    }
  }, [storageKey, projects, apId, dark, viewMode, layoutByUser, workspaceUser, authUserId, canEdit]);

  const flash = (m, t = "ok") => { setToast({ m, t }); setTimeout(() => setToast(null), 2500); };
  const togDark = async () => { const nd = !dark; setDark(nd); await persist(undefined, undefined, nd); };
  const setView = async v => { setViewMode(v); await persist(undefined, undefined, undefined, v); };
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
    if (!requireAdmin()) return;
    if (!proj) return;
    const byProvider = {
      anthropic: { ...DEFAULT_AI_MODELS.anthropic, ...(proj.settings?.aiModelsByProvider?.anthropic || {}) },
      openai: { ...DEFAULT_AI_MODELS.openai, ...(proj.settings?.aiModelsByProvider?.openai || {}) },
      google: { ...DEFAULT_AI_MODELS.google, ...(proj.settings?.aiModelsByProvider?.google || {}) },
    };
    byProvider[currentAiProvider] = { ...byProvider[currentAiProvider], [task]: modelId };
    const nextProj = { ...proj, settings: { ...(proj.settings || {}), aiModelsByProvider: byProvider } };
    await saveProject(nextProj);
    flash(`${task} model: ${modelLabel(modelId)}`);
  };

  const saveAiProvider = async providerId => {
    if (!requireAdmin()) return;
    if (!proj) return;
    const nextProj = { ...proj, settings: { ...(proj.settings || {}), aiProvider: providerId } };
    await saveProject(nextProj);
    setAiKeySet(!!getStoredAiKey(providerId));
    flash(`AI provider: ${providerLabel(providerId)}`);
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
    if (!requireAdmin()) return;
    if (!proj) return;
    const name = newTeamUser.trim();
    if (!name) return;
    const exists = (proj.teamUsers || []).some(u => u.toLowerCase() === name.toLowerCase());
    if (exists) { flash("User already exists", "err"); return; }
    const nextProj = { ...proj, teamUsers: [...(proj.teamUsers || []), name] };
    await saveProject(nextProj);
    setNewTeamUser("");
    flash(`Added ${name}`);
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

  const syncArtistInbox = async (artist, senderUserId = "") => {
    if (!requireEditor()) return { ok: false, error: "Editor role required" };
    if (!proj?.id || !artist?.e) {
      flash("This artist does not have an email to sync", "err");
      return { ok: false, error: "Missing artist email" };
    }
    setSyncingInbox(true);
    const result = await apiSyncArtistInbox({
      projectId: proj.id,
      artistName: artist.n,
      artistEmail: artist.e,
      ...(senderUserId ? { senderUserId } : {}),
    });
    setSyncingInbox(false);
    if (!result.ok) {
      flash(result.error || "Inbox sync failed", "err");
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
    if (result.errors?.length) {
      flash(result.errors[0], "err");
    } else {
      flash(result.syncedUsers?.length ? `Synced ${result.syncedUsers.length} Gmail inbox${result.syncedUsers.length === 1 ? "" : "es"}` : "Inbox synced");
    }
    return result;
  };

  const createProj = async (name, desc) => {
    if (!requireEditor()) return;
    const id = `p_${Date.now()}`;
    const np = {
      id,
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
      teamUsers: [...DEFAULT_TEAM_USERS],
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
        },
        draftGuardrails: { ...DEFAULT_DRAFT_GUARDRAILS },
        savedTemplates: [],
        publicCsvToken: "",
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
    await persist(u, id);
    flash(`Created "${name}"`);
  };

  const importCSV = async e => {
    if (!requireEditor()) return;
    const f = e.target.files?.[0];
    if (!f || !proj) return;
    const t = await f.text();
    const p = parseCSV(t);
    if (!p.length) { flash("No valid artists", "err"); return; }
    const ex = new Set(proj.artists.map(a => canonicalArtistName(a.n)));
    const nw = p.filter(a => !ex.has(canonicalArtistName(a.n)));
    const mg = [...proj.artists, ...nw];
    const nl = { ...proj.pipeline };
    nw.forEach(a => { if (a.s && !nl[a.n]) nl[a.n] = { stage: "sent", date: new Date().toISOString() }; });
    const nextProj = { ...proj, artists: mg, pipeline: nl };
    await saveProject(nextProj);
    flash(`+${nw.length} artists (${p.length - nw.length} dupes skipped)`);
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
    await saveProject(nextProj);
    const alreadyOnPlatform = (proj.internalRoster?.names || []).some(item => canonicalArtistName(item) === canon);
    resetArtistForm();
    setShowAddArtist(false);
    flash(alreadyOnPlatform ? `Added ${name} · already found in internal roster` : `Added ${name}`);
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
    setDetailTab(a.e ? "outreach" : "overview");
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

  const activeArtist = useMemo(() => {
    if (!selA) return null;
    return enriched.find(a => a.n === selA.n) || selA;
  }, [enriched, selA]);

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
      acc.artists += project.artists?.length || 0;
      Object.values(project.pipeline || {}).forEach(state => {
        if (isContactedStage(state?.stage)) acc.contacted += 1;
        if (state?.stage === "live") acc.live += 1;
      });
      acc.due += Object.values(project.sequenceState || {}).filter(ss => ss?.status === "active" && ss.nextDue && ss.nextDue <= operationalTodayISOFor(clockNow)).length;
      return acc;
    }, { projects: 0, artists: 0, contacted: 0, live: 0, due: 0 });
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
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em" }}>AI-Powered A&R</div>
            <div style={{ fontSize: 13, color: C.ts, marginTop: 3 }}>Team outreach, follow-up tracking, and AI-assisted drafting.</div>
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
                Shared outreach projects, live pipeline counts, and team mailbox visibility in one place. Open a project to work the list or review reporting.
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                <span style={{ ...mkP(true, C.ac, C.al) }}>{workspaceOverview.projects} projects</span>
                <span style={{ ...mkP(true, C.ts, C.sa) }}>{workspaceOverview.artists} artists</span>
                <span style={{ ...mkP(true, C.bu, C.bb) }}>{workspaceOverview.contacted} contacted</span>
                <span style={{ ...mkP(true, C.lv, C.lvb) }}>{workspaceOverview.live} live</span>
                <span style={{ ...mkP(true, C.ab, C.abb) }}>{workspaceOverview.due} follow-ups due</span>
                {gmailStatus.available && <span style={{ ...mkP(true, gmailStatus.connections?.length ? C.gn : C.tt, gmailStatus.connections?.length ? C.gb : C.sa) }}>{gmailStatus.connections?.length || 0} connected mailboxes</span>}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(120px, 1fr))", gap: 10 }}>
              {[
                ["Projects", workspaceOverview.projects, C.ac, C.al],
                ["Artists", workspaceOverview.artists, C.tx, C.sa],
                ["Contacted", workspaceOverview.contacted, C.bu, C.bb],
                ["Live", workspaceOverview.live, C.lv, C.lvb],
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
            <div style={{ fontSize: 15, fontWeight: 700 }}>Projects</div>
            <div style={{ fontSize: 12, color: C.tt }}>Open an existing workspace or create a new one.</div>
          </div>
          <div style={{ fontSize: 11, color: C.tt }}>{gmailStatus.currentUserConnected ? `Your Gmail: ${gmailStatus.currentUserGmail}` : "Your Gmail is not connected yet"}</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16 }}>
          {projects.map((p, i) => {
            const ac = p.artists?.length || 0;
            const pl = p.pipeline || {};
            const sent = Object.values(pl).filter(v => isContactedStage(v.stage)).length;
            const replied = Object.values(pl).filter(v => isRepliedStage(v.stage)).length;
            const live = Object.values(pl).filter(v => v.stage === "live").length;
            const seqDue = Object.values(p.sequenceState || {}).filter(ss => ss?.status === "active" && ss.nextDue && ss.nextDue <= todayISO()).length;
            return (
              <div key={p.id} onClick={() => { setApId(p.id); setScreen("project"); setSearch(""); setGf("All"); setSf("all"); setPf("all"); setOwnerFilter("__view__"); persist(projects, p.id); }}
                style={{ ...cS, padding: "22px 24px", cursor: "pointer", transition: "all 0.2s", animation: `fu 0.3s ease ${i * 0.06}s both`, background: dark ? "linear-gradient(180deg, #111a2b 0%, #0f1729 100%)" : "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.ac; e.currentTarget.style.boxShadow = C.sm; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.bd; e.currentTarget.style.boxShadow = C.sw; }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{p.name}</div>
                    {p.desc && <div style={{ fontSize: 12, color: C.ts, lineHeight: 1.5 }}>{p.desc}</div>}
                  </div>
                  {seqDue > 0 && <span style={{ ...mkP(true, C.ab, C.abb), cursor: "default" }}>{seqDue} due</span>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginBottom: 12 }}>
                  {[
                    ["Artists", ac, C.tx, C.sa],
                    ["Contacted", sent, C.bu, C.bb],
                    ["Replied", replied, C.gn, C.gb],
                    ["Live", live, C.lv, C.lvb],
                  ].map(([label, value, tone, bg]) => (
                    <div key={label} style={{ borderRadius: 12, border: `1px solid ${C.bd}`, background: bg, padding: "10px 12px" }}>
                      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: C.tt, marginBottom: 6 }}>{label}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: tone, lineHeight: 1 }}>{value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
                  <span style={{ fontSize: 11, color: C.tt }}>Created {sD(p.created)}</span>
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
              <input placeholder="Description (optional)" value={npD} onChange={e => setNpD(e.target.value)} style={{ ...iS, width: "100%", marginBottom: 18, fontSize: 12 }} />
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={() => setShowNew(false)} style={{ padding: "8px 18px", borderRadius: 10, border: `1px solid ${C.bd}`, background: "transparent", cursor: "pointer", fontSize: 13, fontFamily: ft, color: C.ts }}>Cancel</button>
                <button onClick={() => { if (npN.trim()) createProj(npN.trim(), npD.trim()); }} style={{ padding: "8px 24px", borderRadius: 10, border: "none", background: C.ac, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: ft, opacity: npN.trim() ? 1 : 0.4 }}>Create</button>
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
    const currentStageMeta = SM[stage] || SM.prospect;
    const currentOwner = proj?.assignments?.[a.n] || "Unassigned";
    const mailboxSummary = selectedMailbox
      ? `${selectedMailbox.workspaceEmail.split("@")[0]} · ${selectedMailbox.gmailEmail}`
      : gmailConnected
        ? (gmailConnectionMeta?.provider_email || gmailStatus.currentUserGmail)
        : "Not connected";
    const railStats = [
      { label: "Stage", value: currentStageMeta.label, tone: sc(stage, C) },
      { label: "Owner", value: currentOwner, tone: C.tx },
      { label: "Next Follow-up", value: aFU ? sD(aFU) : "Not set", tone: aFU ? C.tx : C.ts },
      { label: "Latest Reply", value: latestReplyAt ? rD(latestReplyAt) : "No synced reply", tone: latestReplyAt ? C.tx : C.ts },
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
              </div>
              {a.h && <div style={{ fontSize: 12, color: C.ts, marginTop: 6 }}>🎵 {a.h}</div>}
              {a.e && <div style={{ fontSize: 12, color: C.ts, marginTop: 3 }}>✉ {a.e}</div>}
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
                {[
                  ["overview", "Overview"],
                  ["outreach", "Outreach"],
                  ["inbox", `Inbox${artistInboxActionableCount ? ` (${artistInboxActionableCount})` : ""}`],
                  ["activity", "Activity"],
                ].map(([id, label]) => (
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

          {detailTab === "outreach" && <div style={{ ...cS, padding: "18px 22px", marginBottom: 16 }}>
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
                Use AI Intel when you need fit analysis and tailored talking points. Keep daily workflow in Outreach and Inbox.
              </div>
            )}
          </div>}

          {detailTab === "outreach" && <div style={{ ...cS, padding: "20px 24px", marginBottom: 16 }}>
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

          {detailTab === "inbox" && (
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

          {detailTab === "activity" && <div style={{ ...cS, padding: "16px 20px", marginBottom: 16 }}>
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
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Artist Summary</div>
                  <div style={{ display: "grid", gap: 12 }}>
                    {railStats.map((item) => (
                      <div key={item.label} className="gf-rail-kv">
                        <div className="gf-rail-kv-label">{item.label}</div>
                        <div className="gf-rail-kv-value" style={{ color: item.tone }}>{item.value}</div>
                      </div>
                    ))}
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

                <div style={{ ...cS, padding: "16px 18px" }}>
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
                </div>

                <div style={{ ...cS, padding: "16px 18px" }}>
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
                </div>

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
    const projectDateLabel = clockNow.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    const projectModeMeta = {
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
    const spotlightLine = projectMode === "work"
      ? `${queue.length} priority actions in scope. ${dueSeqCount} follow-ups due by 6:00 AM.`
      : projectMode === "inbox"
        ? `${projectInboxActionableCount} inbox threads still need attention. Sync from artist inboxes to pull the latest replies.`
        : `${reportActivityStats.actions} logged actions in range. ${reportScopedArtists.length} artists in the current reporting scope.`;
    const sidebarModeItems = [
      { id: "work", label: projectModeMeta.work.nav, icon: "◫", hint: "daily operating view" },
      { id: "inbox", label: projectModeMeta.inbox.nav, icon: "✉", hint: "shared comms" },
      { id: "report", label: projectModeMeta.report.nav, icon: "↗", hint: "funnel + timeline" },
    ];
    const overviewCards = [
      { label: "Artists", value: enriched.length, tone: C.tx, accent: C.ac, helper: "in this project" },
      { label: "Contacted", value: contactedCount, tone: C.bu, accent: C.bu, helper: "sent or beyond" },
      { label: "Live", value: stCounts.live || 0, tone: C.lv, accent: C.lv, helper: "fully set up" },
      { label: "Due Today", value: dueSeqCount, tone: C.ab, accent: C.ab, helper: operationalDayLabel },
    ];
    const sidebarQuickStats = [
      { label: "Artists", value: enriched.length },
      { label: "Contacted", value: contactedCount },
      { label: "Live", value: stCounts.live || 0 },
    ];
    const sidebarUtilityCards = [
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
                {proj.desc || "Shared outreach workspace for pipeline movement, inbox handling, and reporting."}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginBottom: 12 }}>
                {sidebarQuickStats.map(({ label, value }) => (
                  <div key={label} style={{ borderRadius: 14, border: `1px solid ${C.bd}`, background: C.sf, padding: "8px 10px" }}>
                    <div style={{ fontSize: 10, color: C.tt, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1 }}>{value}</div>
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
                  onClick={() => setProjectMode(item.id)}
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
                  <div className="gf-project-utility-value" style={{ color: card.tone || C.tx, fontSize: card.label === "Mailbox" ? 18 : 22 }}>
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
              <button onClick={() => setShowProjectMenu(true)} style={{ ...actionBtn(false, "neutral"), width: "100%", justifyContent: "center" }}>Project Tools</button>
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
                        {projectMode === "inbox" ? `Connected mailbox: ${connectedMailboxText}` : `${scopeDescription} · ${operationalDayLabel}`}
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
                    {projectMode === "work" ? "Pipeline execution" : projectMode === "inbox" ? "Inbox handling" : "Reporting cadence"}
                  </div>
                  <div style={{ fontSize: 12, color: C.ts, lineHeight: 1.6 }}>
                    {projectMode === "work"
                      ? "Keep the core moves high-signal. Add artists, import CSVs, and move the pipeline forward from here."
                      : projectMode === "inbox"
                        ? "Handle team-visible comms, ownership, follow-ups, and response decisions from one place."
                        : "Review funnel movement, timeline output, and health issues without leaving the project."}
                  </div>
                </div>
                <div className="gf-project-toolbar-actions">
                  {projectMode === "work" && !isReadOnly && (
                    <>
                      <button onClick={() => setShowDiscover(true)} style={{ ...actionBtn(true, "accent"), ...lockStyle(isReadOnly) }}>AI Discover</button>
                    <button onClick={() => setShowAddArtist(true)} style={{ ...actionBtn(true, "good"), ...lockStyle(isReadOnly) }}>+ Artist</button>
                    <label style={{ ...actionBtn(false, "neutral"), ...lockStyle(isReadOnly) }}>
                      Import CSV
                      <input type="file" accept=".csv" ref={fr} onChange={importCSV} disabled={isReadOnly} />
                    </label>
                  </>
                )}
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
                {projectMode === "inbox" && (
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
        {!!proj.internalRoster?.names?.length && (
          <div style={{ ...cS, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: C.ts, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div>
              Internal roster loaded from <strong style={{ color: C.tx }}>{proj.internalRoster.fileName || "CSV"}</strong>
              {` · ${proj.internalRoster.names.length} artists · ${internalMatchCount} current project matches`}
              {proj.internalRoster.uploadedAt ? ` · updated ${sD(proj.internalRoster.uploadedAt)}` : ""}
            </div>
            {!isReadOnly && <button onClick={clearInternalRoster} style={{ ...actionBtn(false, "danger"), padding: "6px 10px" }}>Clear Check</button>}
          </div>
        )}
        {projectMode === "report" && (
          <div style={{ ...cS, padding: "14px 18px", marginBottom: 12, animation: "si 0.18s ease" }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>🚨 Pipeline Health · {reportViewLabel}</div>
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
                No urgent health alerts right now.
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

        {projectMode === "report" && (
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

        {projectMode === "work" && (
          <div style={{ ...cS, padding: "12px 14px", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: showQueue ? 10 : 0, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Today Queue</div>
                <div style={{ fontSize: 11, color: C.tt }}>
                  {operationalDayLabel} · highest-priority actions for the current scope · resets at 6:00 AM
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
                <div style={{ fontSize: 12, color: C.ts }}>No queued actions for this scope right now. Last refreshed {queueUpdatedLabel}.</div>
              )
            )}
          </div>
        )}

        {projectMode === "work" && (
          <div style={{ ...cS, padding: "12px 14px", marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Status Board</div>
                <div style={{ fontSize: 11, color: C.tt }}>Quick filter by stage.</div>
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

        {projectMode === "report" && (
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

        {projectMode === "report" && (
          <div style={{ ...cS, padding: "16px 20px", marginBottom: 16, animation: "si 0.2s ease" }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>🎯 Smart Queue - Top Actions · {reportViewLabel}</div>
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

        {projectMode === "inbox" && (
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
                  <div style={{ display: "grid", gap: 8 }}>
                    <label style={{ ...actionBtn(false, "neutral"), ...lockStyle(isReadOnly), display: "inline-flex", justifyContent: "center" }}>
                      Internal CSV Check
                      <input type="file" accept=".csv" ref={rosterRef} onChange={importInternalRoster} disabled={isReadOnly} />
                    </label>
                    <button onClick={copyProjectCsvLink} style={actionBtn(false, "neutral")}>Copy CSV Link</button>
                    <button onClick={() => exportPipeline(proj, enriched)} style={actionBtn(false, "neutral")}>Export Project CSV</button>
                    {isAdmin && (
                      <a href="/ar/admin" style={{ ...actionBtn(false, "neutral"), textDecoration: "none", display: "inline-flex", justifyContent: "center" }}>
                        Open Admin
                      </a>
                    )}
                    <button onClick={signOut} style={actionBtn(false, "neutral")}>Sign out</button>
                  </div>
                </div>

                <div style={{ ...cS, boxShadow: "none", padding: "14px 16px", background: C.sa }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>AI Settings</div>
                  <div style={{ display: "grid", gap: 10 }}>
                    <label style={{ fontSize: 12, color: C.ts, display: "grid", gap: 4 }}>
                      <span>Provider</span>
                      <select value={currentAiProvider} disabled={!isAdmin} onChange={e => saveAiProvider(e.target.value)} style={{ ...iS, ...lockStyle(!isAdmin) }}>
                        <option value="anthropic">Anthropic</option>
                        <option value="openai">OpenAI</option>
                      </select>
                    </label>
                    <button disabled={!isAdmin} onClick={configureAiKey} style={{ ...actionBtn(true, aiKeySet ? "good" : "danger"), ...lockStyle(!isAdmin) }}>
                      {providerLabel(currentAiProvider)} Key {aiKeySet ? "Set" : "Missing"}
                    </button>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {[["intel", "Intel"], ["drafts", "Drafts"], ["discovery", "Discovery"], ["reply", "Reply"], ["followup", "Follow-up"]].map(([task, label]) => (
                        <label key={task} style={{ fontSize: 11, color: C.ts, display: "grid", gap: 4 }}>
                          <span>{label}</span>
                          <select value={taskModel(task)} disabled={!isAdmin} onChange={e => saveAiModel(task, e.target.value)} style={{ ...iS, padding: "6px 10px", fontSize: 11, ...lockStyle(!isAdmin) }}>
                            {aiOptions.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                          </select>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ ...cS, boxShadow: "none", padding: "14px 16px", background: C.sa }}>
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
                </div>

                <div style={{ ...cS, boxShadow: "none", padding: "14px 16px", background: C.sa, gridColumn: "1 / -1" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Team</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                    {(proj.teamUsers || []).map(u => (
                      <span key={u} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 999, border: `1px solid ${C.bd}`, background: C.sf, color: C.ts }}>{u}</span>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8, maxWidth: 360 }}>
                    <input value={newTeamUser} disabled={!isAdmin} onChange={e => setNewTeamUser(e.target.value)} placeholder="Add team user" style={{ ...iS, flex: 1, ...lockStyle(!isAdmin) }} />
                    <button disabled={!isAdmin} onClick={addTeamMember} style={{ padding: "8px 12px", borderRadius: 10, border: "none", background: C.ac, color: "#fff", cursor: isAdmin ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 600, fontFamily: ft, ...lockStyle(!isAdmin) }}>Add</button>
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
                  <div style={{ fontSize: 11, color: C.tt, textTransform: "uppercase", letterSpacing: 1.2 }}>Quick View</div>
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
                {activeArtist.e && <a href={`mailto:${activeArtist.e}`} style={{ ...actionBtn(false, "neutral"), textDecoration: "none" }}>Email</a>}
                <button onClick={() => openA(activeArtist)} style={actionBtn(false, "accent")}>Open Full Profile</button>
              </div>

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
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Owner and Next Step</div>
                <div style={{ display: "grid", gap: 8 }}>
                  <select value={proj?.assignments?.[activeArtist.n] || ""} disabled={isReadOnly} onChange={e => assignOwner(activeArtist.n, e.target.value)} style={{ ...iS, ...lockStyle(isReadOnly) }}>
                    <option value="">Unassigned</option>
                    {(proj?.teamUsers || []).map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <input type="date" value={proj?.followUps?.[activeArtist.n] || ""} disabled={isReadOnly} onChange={e => { setAFU(e.target.value); saveFU(activeArtist.n, e.target.value); }} style={{ ...iS, ...lockStyle(isReadOnly) }} />
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

        {projectMode === "work" && (
        <div ref={workSurfaceRef}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
          <input placeholder="Search artists..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...iS, width: 220 }} />
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

        <div style={{ fontSize: 12, color: C.tt, marginBottom: 12 }}>{filtered.length} artist{filtered.length !== 1 ? "s" : ""}</div>

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
                      {a.e && <span style={{ color: C.gn }}>✉</span>}
                      {a.soc && <span>📷</span>}
                      {a.followUp && <span style={{ color: a.followUp <= todayISO() ? C.rd : C.ab }}>📅 {sD(a.followUp)}</span>}
                    </div>
                  </div>
                  <a href={spotifyUrl(a.n)} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{ fontSize: 10, color: C.gn, textDecoration: "none", fontWeight: 600, padding: "3px 10px", background: C.gb, borderRadius: 8, border: `1px solid ${C.gd}`, flexShrink: 0 }}>Spotify</a>
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
                            {a.e && <span style={{ fontSize: 10 }}>✉</span>}
                            {a.soc && <span style={{ fontSize: 10 }}>📷</span>}
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
                  {["Artist", "Owner", "Genre", "Listeners", "Stage", "Priority", "Links", "Plan", "Follow-up", "Updated"].map((h, index) => (
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
                          {a.e ? <a href={`mailto:${a.e}`} onClick={e => e.stopPropagation()} style={{ color: C.gn, textDecoration: "none", fontSize: 12 }}>✉</a> : <span style={{ color: C.tt, fontSize: 12 }}>✉</span>}
                          {a.soc ? <a href={`https://instagram.com/${a.soc}`} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{ color: C.pr, textDecoration: "none", fontSize: 12 }}>@</a> : <span style={{ color: C.tt, fontSize: 12 }}>@</span>}
                          <a href={spotifyUrl(a.n)} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{ color: C.gn, textDecoration: "none", fontSize: 12 }}>🎵</a>
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
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No artists yet</div>
            <div style={{ fontSize: 13 }}>Import a CSV, add one manually, or use AI Discover.</div>
          </div>
        )}
        </div>
        )}

        {showAddArtist && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 120 }} onClick={e => { if (e.target === e.currentTarget) { setShowAddArtist(false); resetArtistForm(); } }}>
            <div style={{ background: C.sf, borderRadius: 18, padding: "24px 28px", width: 640, maxWidth: "calc(100vw - 32px)", boxShadow: "0 25px 70px rgba(0,0,0,0.2)" }}>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6, color: C.tx }}>Add Artist</div>
              <div style={{ fontSize: 12, color: C.ts, marginBottom: 14 }}>Manual add for artists you want in the pipeline before a CSV import.</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <input value={artistForm.name} onChange={e => setArtistForm({ ...artistForm, name: e.target.value })} placeholder="Artist name*" autoFocus style={{ ...iS, width: "100%" }} />
                <input value={artistForm.genre} onChange={e => setArtistForm({ ...artistForm, genre: e.target.value })} placeholder="Genre / vibe" style={{ ...iS, width: "100%" }} />
                <input value={artistForm.listeners} onChange={e => setArtistForm({ ...artistForm, listeners: e.target.value })} placeholder="Monthly listeners" style={{ ...iS, width: "100%" }} />
                <input value={artistForm.hitTrack} onChange={e => setArtistForm({ ...artistForm, hitTrack: e.target.value })} placeholder="Hit track" style={{ ...iS, width: "100%" }} />
                <input value={artistForm.social} onChange={e => setArtistForm({ ...artistForm, social: e.target.value })} placeholder="@handle or profile URL" style={{ ...iS, width: "100%" }} />
                <input value={artistForm.email} onChange={e => setArtistForm({ ...artistForm, email: e.target.value })} placeholder="Email" style={{ ...iS, width: "100%" }} />
                <input value={artistForm.location} onChange={e => setArtistForm({ ...artistForm, location: e.target.value })} placeholder="Location" style={{ ...iS, width: "100%", gridColumn: "1 / span 2" }} />
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
                <button onClick={addManualArtist} style={{ padding: "8px 24px", borderRadius: 10, border: "none", background: C.ac, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: ft, opacity: artistForm.name.trim() ? 1 : 0.45 }}>
                  Add Artist
                </button>
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
