"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";

/* ═══════════════════════════════════════════════════════════
   GEM FINDER v7 - AI-Powered A&R Management System
   + Team Assignment + Model Routing + Reply Intelligence
   ═══════════════════════════════════════════════════════════ */

const STAGES = [
  { id: "prospect", label: "Prospect", icon: "◎" },
  { id: "researched", label: "Researched", icon: "◉" },
  { id: "drafted", label: "Draft Ready", icon: "✎" },
  { id: "sent", label: "Sent", icon: "→" },
  { id: "replied", label: "Replied", icon: "←" },
  { id: "won", label: "Won", icon: "★" },
  { id: "dead", label: "Dead", icon: "✕" },
];
const SM = Object.fromEntries(STAGES.map(s => [s.id, s]));

const SEQUENCES = [
  {
    id: "fast_dm",
    name: "Fast DM (2-touch)",
    steps: [
      { id: "dm_intro", label: "Initial DM", channel: "dm", delayDays: 0 },
      { id: "dm_followup", label: "Follow-up DM", channel: "dm", delayDays: 3 },
    ],
  },
  {
    id: "email_3step",
    name: "Email (3-step)",
    steps: [
      { id: "em_intro", label: "Initial Email", channel: "email", delayDays: 0 },
      { id: "em_followup_1", label: "Follow-up Email #1", channel: "email", delayDays: 4 },
      { id: "em_followup_2", label: "Follow-up Email #2", channel: "email", delayDays: 10 },
    ],
  },
  {
    id: "hybrid",
    name: "Hybrid (DM + Email)",
    steps: [
      { id: "hy_dm_intro", label: "Initial DM", channel: "dm", delayDays: 0 },
      { id: "hy_email", label: "Email Pitch", channel: "email", delayDays: 1 },
      { id: "hy_dm_followup", label: "DM Follow-up", channel: "dm", delayDays: 4 },
      { id: "hy_email_last", label: "Final Email Follow-up", channel: "email", delayDays: 7 },
    ],
  },
];
const SEQ_MAP = Object.fromEntries(SEQUENCES.map(s => [s.id, s]));

const DEFAULT_TEAM_USERS = ["Greg", "Vinny", "Brad", "Jen", "JB"];

const AI_PROVIDERS = [
  { id: "anthropic", label: "Anthropic" },
  { id: "openai", label: "OpenAI" },
];

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
  showQueue: false,
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

function sc(id, C) { return { prospect: C.tt, researched: C.ac, drafted: C.ab, sent: C.bu, replied: C.gn, won: C.pr, dead: C.rd }[id] || C.tt; }
function sb(id, C) { return { prospect: C.sa, researched: C.al, drafted: C.abb, sent: C.bb, replied: C.gb, won: C.pb, dead: C.rb }[id] || C.sa; }
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
  if (nextStage === "replied" && !["replied", "won"].includes(prevStage)) credit("replied");
  if (nextStage === "won" && prevStage !== "won") {
    if (prevStage !== "replied") credit("replied");
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
  };
  return {
    ...p,
    artists: p.artists || [],
    pipeline: p.pipeline || {},
    notes: p.notes || {},
    followUps: p.followUps || {},
    activityLog: p.activityLog || {},
    sequenceState: p.sequenceState || {},
    sendLog: p.sendLog || [],
    abStats: p.abStats || {},
    abCredits: p.abCredits || {},
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
};

function getStoredAiKey(provider = "anthropic") {
  const storageKey = AI_KEY_STORAGE[provider] || AI_KEY_STORAGE.anthropic;
  try {
    const local = window.localStorage.getItem(storageKey);
    if (local) return local.trim();
  } catch {}
  return "";
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

// ═══ AI CALL HELPER ═══
async function aiCall(prompt, maxTokens = 1200, provider = "anthropic", apiKey = "", model = "") {
  const key = (apiKey || getStoredAiKey(provider)).trim();
  const providerLabel = provider === "openai" ? "OpenAI" : "Anthropic";
  if (!key) {
    return { ok: false, text: `Missing ${providerLabel} API key. Click 'AI Key' and save a key for ${providerLabel}.` };
  }
  const safeModel = model || (provider === "openai" ? DEFAULT_AI_MODELS.openai.intel : DEFAULT_AI_MODELS.anthropic.intel);
  const proxyEndpoint = provider === "openai" ? "/api/ai/openai" : "/api/ai/anthropic";
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
      let msg = `${providerLabel} API error ${proxy.status}`;
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
      let msg = `${providerLabel} API error ${r.status}`;
      try {
        const parsed = JSON.parse(raw);
        msg = parsed?.error?.message || parsed?.error || msg;
      } catch {}
      return { ok: false, text: msg };
    }
    const d = await r.json();
    const t = provider === "openai"
      ? parseOpenAIResponseText(d)
      : (d.content?.map(i => i.type === "text" ? i.text : "").filter(Boolean).join("\n") || "");
    if (!t) {
      return { ok: false, text: `${providerLabel} returned an empty response. Try GPT-4.1 or Sonnet.` };
    }
    return { ok: true, text: t };
  } catch (e) {
    return { ok: false, text: `${providerLabel} API error: ${e.message}. If this keeps failing, run both services with \"npm run dev:full\".` };
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
NEXT_STAGE: [replied | won | dead | sent]
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

function buildHealthAlerts(enriched, proj) {
  const alerts = [];
  const today = todayISO();
  const seqDue = Object.values(proj?.sequenceState || {}).filter(ss => ss?.status === "active" && ss.nextDue && ss.nextDue <= today).length;
  if (seqDue > 0) alerts.push({ level: "high", label: `${seqDue} sequence steps due now`, action: "Open Queue and clear due sequence touches first." });

  const staleSent = enriched.filter(a => a.stage === "sent" && a.stageDate && daysBetween(a.stageDate, today) >= 10).length;
  if (staleSent > 0) alerts.push({ level: "high", label: `${staleSent} artists sent >10 days without reply`, action: "Run follow-up drafts and send today." });

  const unassigned = enriched.filter(a => !a.owner).length;
  if (unassigned > 0) alerts.push({ level: "medium", label: `${unassigned} artists unassigned`, action: "Assign owners so outreach accountability is clear." });

  const noFollowUp = enriched.filter(a => a.stage === "sent" && !a.followUp).length;
  if (noFollowUp > 0) alerts.push({ level: "medium", label: `${noFollowUp} sent artists missing follow-up dates`, action: "Set follow-up dates or enroll sequence." });

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
    ...extra,
  });
  return { ...logs, [name]: al.slice(-120) };
}

// ═══ SMART QUEUE ═══
function buildQueue(enriched, sequenceState) {
  const today = todayISO();
  const items = [];
  const byName = Object.fromEntries(enriched.map(a => [a.n, a]));

  enriched.forEach(a => {
    if (a.followUp && a.followUp <= today && a.stage !== "won" && a.stage !== "dead") {
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
    if (a.priority >= 3 && a.priority < 5 && a.stage === "prospect" && a.e) items.push({ type: "warm", artist: a, priority: 4, label: "WARM + email - start outreach", icon: "📧" });
    if (!a.owner && a.stage !== "won" && a.stage !== "dead") items.push({ type: "owner", artist: a, priority: 3, label: "No owner assigned", icon: "👤" });
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
      label: `Sequence due: ${step?.label || "Next touch"}${overdue > 0 ? ` (${overdue}d overdue)` : ""}`,
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

function exportPipeline(proj, enriched) {
  const rows = [["Artist", "Owner", "Genre", "Bucket", "Listeners", "Hit Track", "Email", "Social", "Stage", "Priority", "Spotify", "Notes", "Follow-Up", "Sequence", "Next Step", "Sends Logged"]];
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

  const [search, setSearch] = useState("");
  const [gf, setGf] = useState("All");
  const [sf, setSf] = useState("all");
  const [pf, setPf] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
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
  const [showQueue, setShowQueue] = useState(false);

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
  const [workspaceUser, setWorkspaceUser] = useState("Greg");
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
  const authLabel = authEmail || authUserId || "Signed in";
  const roleLabel = authRole === "admin" ? "admin" : authRole === "viewer" ? "viewer" : "editor";
  const canEdit = roleLabel !== "viewer";
  const isAdmin = roleLabel === "admin";
  const isReadOnly = !canEdit;
  const storageKey = authUserId ? `${STORAGE_PREFIX}:${authUserId}` : STORAGE_PREFIX;
  const defaultWorkspaceUser = (() => {
    const local = (authEmail || "").split("@")[0] || "";
    const cleaned = local.replace(/[._-]+/g, " ").trim();
    if (!cleaned) return "Greg";
    return cleaned
      .split(/\s+/)
      .map(part => part.slice(0, 1).toUpperCase() + part.slice(1))
      .join(" ");
  })();

  const C = dark ? DK : LT;
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
  const css = `@keyframes si{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}@keyframes fu{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}html,body,#root{margin:0;padding:0;cursor:default;background:${C.bg}}input[type="file"]{display:none}::selection{background:${C.ac}2b}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${C.bd};border-radius:3px}`;
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
  const proj = projects.find(p => p.id === apId);
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
        const nextWorkspaceUser = d?.workspaceUser || defaultWorkspaceUser;
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
    if (users.length && !users.includes(workspaceUser)) {
      changeWorkspaceUser(users[0]);
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
    if (loading) return;
    persist(undefined, undefined, undefined, undefined, layoutByUser, workspaceUser);
  }, [layoutByUser, workspaceUser]);

  const changeWorkspaceUser = user => {
    setWorkspaceUser(user);
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
    const keyLabel = provider === "openai" ? "OpenAI" : "Anthropic";
    const storageKey = AI_KEY_STORAGE[provider];
    const existing = getStoredAiKey(provider);
    const val = window.prompt(`Paste ${keyLabel} API key. Leave empty to clear.`, existing || "");
    if (val === null) return;
    const clean = val.trim();
    try {
      if (clean) {
        const looksAnthropic = clean.startsWith("sk-ant-");
        const looksOpenAI = clean.startsWith("sk-proj-") || (clean.startsWith("sk-") && !looksAnthropic);
        let targetProvider = provider;

        if (provider === "anthropic" && looksOpenAI) {
          if (window.confirm("This key looks like OpenAI. Switch AI provider to OpenAI and save it there?")) {
            targetProvider = "openai";
          }
        } else if (provider === "openai" && looksAnthropic) {
          if (window.confirm("This key looks like Anthropic. Switch AI provider to Anthropic and save it there?")) {
            targetProvider = "anthropic";
          }
        }

        const targetStorageKey = AI_KEY_STORAGE[targetProvider];
        window.localStorage.setItem(targetStorageKey, clean);
        if (targetProvider !== provider && proj) {
          const nextProj = { ...proj, settings: { ...(proj.settings || {}), aiProvider: targetProvider } };
          saveProject(nextProj);
        }
        setAiKeySet(true);
        flash(`${targetProvider === "openai" ? "OpenAI" : "Anthropic"} key saved`);
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
    flash(`AI provider: ${providerId === "openai" ? "OpenAI" : "Anthropic"}`);
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

    const al = addLog(proj, artist.n, `Saved template: ${cleanName}`);
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

    const al = addLog(proj, artist.n, `Applied template: ${hit.name}`);
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
    const al = addLog(proj, artistName, owner ? `Assigned to ${owner}` : "Owner cleared");
    const nextProj = { ...proj, assignments: { ...(proj.assignments || {}), [artistName]: owner }, activityLog: al };
    await saveProject(nextProj);
    flash(owner ? `${artistName} assigned to ${owner}` : `${artistName} unassigned`);
  };

  const runReplyClassifier = async artist => {
    if (!requireEditor()) return;
    if (!replyInput.trim()) { flash("Paste a reply first", "err"); return; }
    setReplyLoading(true);
    const res = await classifyReplyText(artist, replyInput.trim(), intel?.ok ? intel.text : "", currentAiProvider, getStoredAiKey(currentAiProvider), taskModel("reply"));
    setReplyLoading(false);
    if (!res.ok) { flash(res.text || "Reply analysis failed", "err"); return; }
    const parsed = parseReplyIntel(res.text);
    setReplyResult(parsed);
    if (proj) {
      const al = addLog(proj, artist.n, "Reply intelligence generated");
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

  const runFollowUpWriter = async artist => {
    if (!requireEditor()) return;
    const sends = (proj?.sendLog || []).filter(s => s.artist === artist.n);
    const latestSend = sends.length ? sends[sends.length - 1] : null;
    const preferredChannel = latestSend?.channel || (artist.e ? "email" : "dm");
    const history = sends.slice(-4).map(s => `${new Date(s.sentAt).toLocaleDateString()}: ${s.channel.toUpperCase()} via ${s.provider} v${s.variantId || "NA"}`).join("\n");
    const replyText = replyInput.trim();
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
      const al = addLog(proj, artist.n, "Follow-up draft generated");
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
    const activityLog = addLog(proj, name, "Artist added manually");
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

  const setSt = async (n, sid) => {
    if (!requireEditor()) return;
    if (!proj) return;
    const prevStage = proj.pipeline[n]?.stage || "prospect";
    const nl = { ...proj.pipeline, [n]: { ...(proj.pipeline[n] || {}), stage: sid, date: new Date().toISOString() } };
    let al = addLog(proj, n, `Stage → ${SM[sid]?.label}`);
    const credited = creditABOutcome(proj, n, sid, prevStage);
    if ((sid === "replied" || sid === "won") && credited.abStats !== proj.abStats) {
      al = addLog({ ...proj, activityLog: al }, n, `A/B outcome credited (${sid})`);
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
      const logs = al[n] || [];
      logs.push({ action: `Batch → ${SM[sid]?.label}`, time: new Date().toISOString() });
      al = { ...al, [n]: logs.slice(-80) };
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
    const al = addLog(proj, n, "Note updated");
    const nextProj = { ...proj, notes: { ...proj.notes, [n]: note }, activityLog: al };
    await saveProject(nextProj);
  };

  const saveFU = async (n, d) => {
    if (!requireEditor()) return;
    if (!proj) return;
    const al = addLog(proj, n, d ? `Follow-up: ${sD(d)}` : "Follow-up cleared");
    const nextProj = { ...proj, followUps: { ...proj.followUps, [n]: d }, activityLog: al };
    await saveProject(nextProj);
    flash(d ? `Follow-up: ${sD(d)}` : "Cleared");
  };

  const addActivityNote = async n => {
    if (!requireEditor()) return;
    if (!proj) return;
    const note = logNoteDraft.trim();
    if (!note) return;
    const al = addLog(proj, n, "Activity note", "note", { note, author: workspaceUser || "Unknown" });
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
      return { ...l, note, editedAt: new Date().toISOString() };
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
      const al = addLog(proj, selA.n, `Copied ${key} draft`);
      const nextProj = { ...proj, activityLog: al };
      setProjects(projects.map(p => p.id === proj.id ? nextProj : p));
      persist(projects.map(p => p.id === proj.id ? nextProj : p));
    }
  };

  const openA = a => {
    const bucket = bucketGenre(a.g);
    const plan = buildABPlan(proj?.abStats || {}, a, bucket);
    const defaultPlatform = a.e ? "email" : "instagram_dm";
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
      const al = addLog(proj, a.n, "AI Intel generated");
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
      const al = addLog(proj, a.n, "AI drafts generated");
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
    if (["prospect", "researched", "drafted"].includes(prevStage)) {
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
          seqMsg = `Sequence advanced → ${nextStep.label} due ${sD(nextDue)}`;
        } else {
          sequenceState[artist.n] = { ...ss, status: "done", stepIndex: nextIdx, nextDue: "", completedAt: now, lastSentAt: now, history };
          if (!followUps[artist.n]) followUps[artist.n] = addDaysISO(date, 7);
          seqMsg = "Sequence completed";
        }
      }
    }

    if (!followUps[artist.n]) followUps[artist.n] = addDaysISO(date, 7);

    const sendEvent = {
      id: `send_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      artist: artist.n,
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
    let activityLog = addLog(proj, artist.n, `Sent via ${provider} (${channel.toUpperCase()})${variantId ? ` • v${variantId}` : ""}`);
    if (seqMsg) activityLog = addLog({ ...proj, activityLog }, artist.n, seqMsg);

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

  const enrollSeq = async (artist, sequenceId) => {
    if (!requireEditor()) return;
    if (!proj) return;
    const now = new Date().toISOString();
    const due = todayISO();
    const state = {
      ...(proj.sequenceState || {}),
      [artist.n]: { sequenceId, status: "active", stepIndex: 0, nextDue: due, startedAt: now, history: [] },
    };
    const al = addLog(proj, artist.n, `Sequence enrolled: ${SEQ_MAP[sequenceId]?.name || sequenceId}`);
    const nextProj = {
      ...proj,
      sequenceState: state,
      followUps: { ...(proj.followUps || {}), [artist.n]: due },
      activityLog: al,
    };
    await saveProject(nextProj);
    flash(`Enrolled ${artist.n} in ${SEQ_MAP[sequenceId]?.name || sequenceId}`);
  };

  const toggleSeqPause = async artist => {
    if (!requireEditor()) return;
    if (!proj) return;
    const cur = proj.sequenceState?.[artist.n];
    if (!cur) return;
    const nextStatus = cur.status === "active" ? "paused" : "active";
    const state = { ...(proj.sequenceState || {}), [artist.n]: { ...cur, status: nextStatus } };
    const al = addLog(proj, artist.n, `Sequence ${nextStatus}`);
    await saveProject({ ...proj, sequenceState: state, activityLog: al });
    flash(`Sequence ${nextStatus}`);
  };

  const resetSeq = async artist => {
    if (!requireEditor()) return;
    if (!proj) return;
    const cur = proj.sequenceState?.[artist.n];
    if (!cur) return;
    const state = { ...(proj.sequenceState || {}), [artist.n]: { ...cur, status: "active", stepIndex: 0, nextDue: todayISO(), history: [] } };
    const al = addLog(proj, artist.n, "Sequence reset to step 1");
    await saveProject({ ...proj, sequenceState: state, activityLog: al, followUps: { ...(proj.followUps || {}), [artist.n]: todayISO() } });
    flash("Sequence reset");
  };

  const markSeqStepSent = async artist => {
    if (!requireEditor()) return;
    if (!proj) return;
    const ss = proj.sequenceState?.[artist.n];
    if (!ss || ss.status !== "active") { flash("No active sequence", "err"); return; }
    const seq = SEQ_MAP[ss.sequenceId];
    const step = seq?.steps?.[ss.stepIndex];
    if (!step) { flash("Sequence already complete", "err"); return; }

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
    const nextProj = {
      ...proj,
      artists: [...proj.artists, { n: a.n, g: a.g, l: a.l, h: a.h, ig: a.ig || "", soc: a.soc || "", e: a.e || "", loc: a.loc || "", s: false, o: "AI Discovery" }],
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

  const gBuckets = useMemo(() => {
    const c = {};
    enriched.forEach(a => { c[a.bucket] = (c[a.bucket] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [enriched]);

  const filtered = useMemo(() => {
    let l = enriched;
    if (search) {
      const q = search.toLowerCase();
      l = l.filter(a => a.n.toLowerCase().includes(q) || a.g.toLowerCase().includes(q) || (a.h || "").toLowerCase().includes(q));
    }
    if (gf !== "All") l = l.filter(a => a.bucket === gf);
    if (sf !== "all") l = l.filter(a => a.stage === sf);
    if (pf !== "all") l = l.filter(a => pT(a.priority, C).label === pf);
    if (ownerFilter !== "all") l = l.filter(a => a.owner === ownerFilter);
    if (sortBy === "priority") l = [...l].sort((a, b) => b.priority - a.priority);
    else if (sortBy === "name") l = [...l].sort((a, b) => a.n.localeCompare(b.n));
    else if (sortBy === "listeners") l = [...l].sort((a, b) => parseMl(b.l) - parseMl(a.l));
    else if (sortBy === "recent") l = [...l].sort((a, b) => (b.stageDate || "").localeCompare(a.stageDate || ""));
    return l;
  }, [enriched, search, gf, sf, pf, ownerFilter, sortBy, C]);

  const stCounts = useMemo(() => {
    const c = {};
    STAGES.forEach(s => { c[s.id] = 0; });
    enriched.forEach(a => { c[a.stage] = (c[a.stage] || 0) + 1; });
    return c;
  }, [enriched]);

  const funnel = useMemo(() => {
    const t = enriched.length || 1;
    const ct = (stCounts.sent || 0) + (stCounts.replied || 0) + (stCounts.won || 0);
    const rp = (stCounts.replied || 0) + (stCounts.won || 0);
    const w = stCounts.won || 0;
    return [
      { l: "Total", c: enriched.length, p: 100 },
      { l: "Contacted", c: ct, p: Math.round((ct / t) * 100) },
      { l: "Replied", c: rp, p: Math.round((rp / t) * 100) },
      { l: "Won", c: w, p: Math.round((w / t) * 100) },
    ];
  }, [enriched, stCounts]);

  const queue = useMemo(() => buildQueue(enriched, proj?.sequenceState || {}), [enriched, proj]);
  const abRows = useMemo(() => buildABLeaderboard(proj?.abStats || {}), [proj]);
  const dueSeqCount = useMemo(() => Object.values(proj?.sequenceState || {}).filter(ss => ss?.status === "active" && ss.nextDue && ss.nextDue <= todayISO()).length, [proj]);
  const healthAlerts = useMemo(() => buildHealthAlerts(enriched, proj || {}), [enriched, proj]);
  const internalMatchCount = useMemo(() => enriched.filter(a => a.onPlatform).length, [enriched]);
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
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 24px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <img src="/gemfinder-logo.png" alt="GEMFINDER logo" style={{ width: 44, height: 44, objectFit: "contain", marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 5, color: C.ac, textTransform: "uppercase", marginBottom: 4 }}>GEMFINDER</div>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em" }}>AI-Powered A&R</div>
            <div style={{ fontSize: 13, color: C.ts, marginTop: 3 }}>Sequence engine, send tracking, and A/B-optimized outreach.</div>
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
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 24px" }}>
        {isReadOnly && (
          <div style={{ ...cS, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: C.ts }}>
            Viewer mode is active. You can review data but cannot make edits.
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>
          {projects.map((p, i) => {
            const ac = p.artists?.length || 0;
            const pl = p.pipeline || {};
            const sent = Object.values(pl).filter(v => ["sent", "replied", "won"].includes(v.stage)).length;
            const replied = Object.values(pl).filter(v => ["replied", "won"].includes(v.stage)).length;
            const won = Object.values(pl).filter(v => v.stage === "won").length;
            const seqDue = Object.values(p.sequenceState || {}).filter(ss => ss?.status === "active" && ss.nextDue && ss.nextDue <= todayISO()).length;
            return (
              <div key={p.id} onClick={() => { setApId(p.id); setScreen("project"); setSearch(""); setGf("All"); setSf("all"); setPf("all"); persist(projects, p.id); }}
                style={{ ...cS, padding: "22px 24px", cursor: "pointer", transition: "all 0.2s", animation: `fu 0.3s ease ${i * 0.06}s both` }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.ac; e.currentTarget.style.boxShadow = C.sm; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.bd; e.currentTarget.style.boxShadow = C.sw; }}>
                <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 3 }}>{p.name}</div>
                {p.desc && <div style={{ fontSize: 12, color: C.ts, marginBottom: 12, lineHeight: 1.5 }}>{p.desc}</div>}
                <div style={{ display: "flex", gap: 16, fontSize: 12, color: C.ts, flexWrap: "wrap" }}>
                  <span><strong style={{ color: C.tx }}>{ac}</strong> artists</span>
                  <span><strong style={{ color: C.bu }}>{sent}</strong> sent</span>
                  <span><strong style={{ color: C.gn }}>{replied}</strong> replied</span>
                  {won > 0 && <span><strong style={{ color: C.pr }}>{won}</strong> won</span>}
                  {seqDue > 0 && <span><strong style={{ color: C.ab }}>{seqDue}</strong> seq due</span>}
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
          <div onClick={() => { if (requireEditor()) setShowNew(true); }} style={{ background: C.sa, border: `2px dashed ${C.bd}`, borderRadius: 14, padding: "22px 24px", cursor: canEdit ? "pointer" : "not-allowed", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 140, transition: "all 0.2s", ...lockStyle(isReadOnly) }}
            onMouseEnter={e => { if (!canEdit) return; e.currentTarget.style.borderColor = C.ac; e.currentTarget.style.background = C.al; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.bd; e.currentTarget.style.background = C.sa; }}>
            <div style={{ fontSize: 28, color: C.tt, marginBottom: 6 }}>+</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.ts }}>{canEdit ? "New Project" : "Read-only"}</div>
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
    const a = selA;
    const bucket = bucketGenre(a.g);
    const pri = pS(a);
    const pt = pT(pri, C);
    const stage = proj?.pipeline?.[a.n]?.stage || "prospect";
    const postSendUnlocked = ["sent", "replied", "won"].includes(stage);
    const logs = (proj?.activityLog || {})[a.n] || [];

    const ss = proj?.sequenceState?.[a.n] || null;
    const seq = ss ? SEQ_MAP[ss.sequenceId] : null;
    const seqStep = seq?.steps?.[ss?.stepIndex] || null;
    const sendHistory = (proj?.sendLog || []).filter(s => s.artist === a.n).slice(-8).reverse();

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
          <div style={{ maxWidth: 900, margin: "0 auto", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button onClick={() => { setScreen("project"); setSelA(null); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, fontFamily: ft, color: C.ac, fontWeight: 600 }}>← Pipeline</button>
            <DkBtn />
          </div>
        </div>

        <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px", animation: "fu 0.25s ease" }}>
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
              <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: C.ts }}>Owner</span>
                <select value={proj?.assignments?.[a.n] || ""} disabled={isReadOnly} onChange={e => assignOwner(a.n, e.target.value)} style={{ ...iS, padding: "5px 10px", fontSize: 11, ...lockStyle(isReadOnly) }}>
                  <option value="">Unassigned</option>
                  {(proj?.teamUsers || []).map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <button onClick={() => exportBrief(a)} style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.bd}`, background: "transparent", color: C.ts, cursor: "pointer", fontSize: 11, fontFamily: ft }}>Export Brief</button>
              </div>
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
            Pipeline flow: Prospect → Researched → Draft Ready → Sent → Replied → Won or Dead.
          </div>

          <div style={{ ...cS, padding: "18px 22px", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>🧭 Sequence Engine</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <select value={seqPick} disabled={isReadOnly} onChange={e => setSeqPick(e.target.value)} style={{ ...iS, padding: "6px 10px", fontSize: 12, ...lockStyle(isReadOnly) }}>
                  {SEQUENCES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {!ss && <button disabled={isReadOnly} onClick={() => enrollSeq(a, seqPick)} style={{ padding: "6px 12px", borderRadius: 9, border: `1.5px solid ${C.ac}`, background: C.al, color: C.ac, cursor: isReadOnly ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 600, fontFamily: ft, ...lockStyle(isReadOnly) }}>Enroll</button>}
              </div>
            </div>
            <div style={{ fontSize: 11, color: C.tt, marginBottom: 8 }}>
              Optional cadence helper: enroll after first outreach to schedule and track follow-up steps.
            </div>

            {!ss && <div style={{ fontSize: 12, color: C.ts }}>No active sequence. Enroll this artist to automate multi-step follow-ups with due dates.</div>}

            {ss && (
              <div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                  <span style={{ ...mkP(true, ss.status === "active" ? C.gn : ss.status === "paused" ? C.ab : C.tt, ss.status === "active" ? C.gb : ss.status === "paused" ? C.abb : C.sa), fontSize: 10, padding: "2px 8px" }}>{ss.status.toUpperCase()}</span>
                  <span style={{ fontSize: 12, color: C.ts }}>{seq?.name}</span>
                  {seq?.steps?.length ? <span style={{ fontSize: 12, color: C.tt }}>Step {Math.min((ss.stepIndex || 0) + 1, seq.steps.length)} of {seq.steps.length}</span> : null}
                  {seqStep && <span style={{ fontSize: 12, color: C.ts }}>Next: <strong style={{ color: C.tx }}>{seqStep.label}</strong> ({seqStep.channel.toUpperCase()}){ss.nextDue ? ` · due ${sD(ss.nextDue)}` : ""}</span>}
                  {!seqStep && <span style={{ fontSize: 12, color: C.ts }}>Sequence complete</span>}
                </div>

                <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                  {ss.status === "active" && seqStep && <button disabled={isReadOnly} onClick={() => markSeqStepSent(a)} style={{ padding: "6px 12px", borderRadius: 9, border: `1.5px solid ${C.gn}`, background: C.gb, color: C.gn, cursor: isReadOnly ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 600, fontFamily: ft, ...lockStyle(isReadOnly) }}>Mark Step Sent + Advance</button>}
                  {(ss.status === "active" || ss.status === "paused") && <button disabled={isReadOnly} onClick={() => toggleSeqPause(a)} style={{ padding: "6px 12px", borderRadius: 9, border: `1px solid ${C.bd}`, background: "transparent", color: C.ts, cursor: isReadOnly ? "not-allowed" : "pointer", fontSize: 11, fontFamily: ft, ...lockStyle(isReadOnly) }}>{ss.status === "active" ? "Pause" : "Resume"}</button>}
                  <button disabled={isReadOnly} onClick={() => resetSeq(a)} style={{ padding: "6px 12px", borderRadius: 9, border: `1px solid ${C.bd}`, background: "transparent", color: C.ts, cursor: isReadOnly ? "not-allowed" : "pointer", fontSize: 11, fontFamily: ft, ...lockStyle(isReadOnly) }}>Reset</button>
                </div>

                <div style={{ display: "grid", gap: 5 }}>
                  {(seq?.steps || []).map((step, idx) => {
                    const done = idx < ss.stepIndex;
                    const current = idx === ss.stepIndex && ss.status !== "done";
                    return (
                      <div key={step.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: done ? C.gn : current ? C.ac : C.ts }}>
                        <span>{done ? "✓" : current ? "→" : "•"}</span>
                        <span>{step.label} ({step.channel.toUpperCase()})</span>
                        {current && ss.nextDue && <span style={{ color: C.tt }}>due {sD(ss.nextDue)}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div style={{ ...cS, padding: "20px 24px", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: intel ? 12 : 0 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>🧠 AI Intel</div>
                <div style={{ fontSize: 11, color: C.tt }}>Model: {modelLabel(taskModel("intel"))} · {currentAiProvider === "openai" ? "OpenAI" : "Anthropic"}</div>
              </div>
              <button onClick={() => runIntel(a)} disabled={intelLoading || isReadOnly} style={{ padding: "6px 16px", borderRadius: 10, border: `1.5px solid ${C.ac}`, background: intelLoading ? C.sa : C.al, color: C.ac, cursor: intelLoading ? "wait" : isReadOnly ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600, fontFamily: ft, ...lockStyle(isReadOnly) }}>{intelLoading ? "Analyzing..." : intel ? "Re-analyze" : "Analyze Artist"}</button>
            </div>
            {intelLoading && <div style={{ fontSize: 12, color: C.ts, padding: "12px 0" }}>🔄 Running AI analysis on {a.n}...</div>}
            {intel && <div style={{ fontSize: 13, lineHeight: 1.7, color: C.tx, whiteSpace: "pre-wrap", padding: "12px 16px", background: C.sa, borderRadius: 10, marginTop: 8, border: `1px solid ${C.bd}` }}>{intel.text}</div>}
          </div>

          <div style={{ ...cS, padding: "20px 24px", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>✉ Outreach Drafts</div>
                <div style={{ fontSize: 11, color: C.tt }}>Model: {modelLabel(taskModel("drafts"))} · {currentAiProvider === "openai" ? "OpenAI" : "Anthropic"}</div>
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

                <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 10, border: `1px solid ${C.bd}`, background: C.sa }}>
                  <div style={{ fontSize: 11, color: C.ts, marginBottom: 6 }}>
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
                </div>
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

                <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button onClick={() => { if (!gateDraftAction("copy this draft")) return; cp(d.text, d.key); }} style={{ padding: "7px 20px", borderRadius: 10, border: "none", background: copied === d.key ? C.gn : C.ac, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: ft, transition: "all 0.2s" }}>{copied === d.key ? "Copied ✓" : "Copy"}</button>

                  {guardrails.enabled && !quality?.pass && (
                    <button onClick={strengthenDraft} disabled={improveLoading || isReadOnly} style={{ padding: "7px 12px", borderRadius: 10, border: `1px solid ${C.ab}`, background: C.abb, color: C.ab, cursor: improveLoading ? "wait" : isReadOnly ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 600, fontFamily: ft, ...lockStyle(isReadOnly) }}>
                      {improveLoading ? "Improving..." : "Strengthen Draft"}
                    </button>
                  )}

                  <select value={sendProvider} disabled={isReadOnly} onChange={e => { const v = e.target.value; setSendProvider(v); saveSendPrefs(v, autoLogCompose); }} style={{ ...iS, padding: "6px 10px", fontSize: 11, ...lockStyle(isReadOnly) }}>
                    <option value="gmail">Gmail</option>
                    <option value="outlook">Outlook</option>
                  </select>

                  <label style={{ fontSize: 11, color: C.ts, display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <input type="checkbox" disabled={isReadOnly} checked={autoLogCompose} onChange={e => { const v = e.target.checked; setAutoLogCompose(v); saveSendPrefs(sendProvider, v); }} />
                    Auto-log on compose
                  </label>

                  {d.channel === "email" && (
                    <button onClick={() => { if (!gateDraftAction("send this draft")) return; openCompose(a, d, sendProvider); }} disabled={!a.e || isReadOnly} style={{ padding: "7px 12px", borderRadius: 10, border: `1.5px solid ${C.bu}`, background: C.bb, color: C.bu, cursor: a.e && !isReadOnly ? "pointer" : "not-allowed", fontSize: 11, fontWeight: 600, fontFamily: ft, opacity: a.e && !isReadOnly ? 1 : 0.45 }}>
                      Open in {sendProvider === "outlook" ? "Outlook" : "Gmail"}
                    </button>
                  )}

                  <button disabled={isReadOnly} onClick={() => { if (!gateDraftAction("log this as sent")) return; trackSend(a, d, "manual"); }} style={{ padding: "7px 12px", borderRadius: 10, border: `1.5px solid ${C.gn}`, background: C.gb, color: C.gn, cursor: isReadOnly ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 600, fontFamily: ft, ...lockStyle(isReadOnly) }}>Log Sent + Advance</button>

                  {draftMode === "template" && <span style={{ fontSize: 11, color: C.tt }}>💡 Hit "AI Personalize" above for a custom version{intel?.ok ? " (uses intel)" : ""}</span>}
                  {draftMode === "ai" && <span style={{ fontSize: 11, color: C.pr }}>✨ AI generated. Edit freely.</span>}
                </div>

                {dStats && (
                  <div style={{ fontSize: 11, color: C.ts, marginTop: 8 }}>
                    A/B stats for <strong>v{d.variantId}</strong> ({d.channel.toUpperCase()}): {dStats.sent} sent · {dStats.replied} replies · {dStats.rr}% reply rate
                  </div>
                )}
              </div>
            )}
          </div>

          {postSendUnlocked ? (
            <>
              <div style={{ ...cS, padding: "20px 24px", marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>💬 Reply Intelligence</div>
                    <div style={{ fontSize: 11, color: C.tt }}>Model: {modelLabel(taskModel("reply"))} · {currentAiProvider === "openai" ? "OpenAI" : "Anthropic"}</div>
                  </div>
                  <button onClick={() => runReplyClassifier(a)} disabled={replyLoading || isReadOnly} style={{ padding: "6px 14px", borderRadius: 9, border: `1.5px solid ${C.ac}`, background: replyLoading ? C.sa : C.al, color: C.ac, cursor: replyLoading ? "wait" : isReadOnly ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 600, fontFamily: ft, ...lockStyle(isReadOnly) }}>{replyLoading ? "Analyzing..." : "Analyze Reply"}</button>
                </div>
                <textarea value={replyInput} readOnly={isReadOnly} onChange={e => setReplyInput(e.target.value)} placeholder="Paste artist reply text here..." style={{ ...iS, width: "100%", minHeight: 90, resize: "vertical", fontSize: 12, marginBottom: 8, ...lockStyle(isReadOnly) }} />
                {replyResult && (
                  <div style={{ padding: "10px 12px", borderRadius: 10, background: C.sa, border: `1px solid ${C.bd}`, fontSize: 12, color: C.ts }}>
                    <div><strong style={{ color: C.tx }}>Intent:</strong> {replyResult.intent || "unknown"} | <strong style={{ color: C.tx }}>Sentiment:</strong> {replyResult.sentiment || "unknown"} | <strong style={{ color: C.tx }}>Urgency:</strong> {replyResult.urgency || "unknown"}</div>
                    <div style={{ marginTop: 4 }}><strong style={{ color: C.tx }}>Recommended:</strong> {replyResult.nextAction || "No recommendation"}</div>
                    {replyResult.draftResponse && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 11, color: C.tt, marginBottom: 4 }}>Suggested Response</div>
                        <textarea value={replyResult.draftResponse} readOnly={isReadOnly} onChange={e => setReplyResult({ ...replyResult, draftResponse: e.target.value })} style={{ ...iS, width: "100%", minHeight: 80, fontSize: 12, resize: "vertical", ...lockStyle(isReadOnly) }} />
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                      {replyResult.nextStage && SM[replyResult.nextStage] && <button disabled={isReadOnly} onClick={() => applyReplySuggestedStage(a)} style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${C.bd}`, background: "transparent", color: C.ts, cursor: isReadOnly ? "not-allowed" : "pointer", fontSize: 11, fontFamily: ft, ...lockStyle(isReadOnly) }}>Apply Stage: {SM[replyResult.nextStage].label}</button>}
                      {replyResult.draftResponse && <button onClick={() => cp(replyResult.draftResponse, "reply_response")} style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${C.bd}`, background: "transparent", color: C.ts, cursor: "pointer", fontSize: 11, fontFamily: ft }}>Copy Response</button>}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ ...cS, padding: "20px 24px", marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>⏭ Auto Follow-up Writer</div>
                    <div style={{ fontSize: 11, color: C.tt }}>Model: {modelLabel(taskModel("followup"))} · {currentAiProvider === "openai" ? "OpenAI" : "Anthropic"}</div>
                  </div>
                  <button onClick={() => runFollowUpWriter(a)} disabled={followUpLoading || isReadOnly} style={{ padding: "6px 14px", borderRadius: 9, border: `1.5px solid ${C.pr}`, background: followUpLoading ? C.sa : C.pb, color: C.pr, cursor: followUpLoading ? "wait" : isReadOnly ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 600, fontFamily: ft, ...lockStyle(isReadOnly) }}>{followUpLoading ? "Generating..." : "Generate Follow-up"}</button>
                </div>
                <textarea value={followUpDraft} readOnly={isReadOnly} onChange={e => setFollowUpDraft(e.target.value)} placeholder="Generated follow-up draft will appear here..." style={{ ...iS, width: "100%", minHeight: 95, resize: "vertical", fontSize: 12, ...lockStyle(isReadOnly) }} />
                {followUpDraft && <div style={{ marginTop: 8 }}><button onClick={() => cp(followUpDraft, "followup")} style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.bd}`, background: "transparent", color: C.ts, cursor: "pointer", fontSize: 11, fontFamily: ft }}>Copy Follow-up</button></div>}
              </div>
            </>
          ) : (
            <div style={{ ...cS, padding: "14px 16px", marginBottom: 16, fontSize: 12, color: C.ts }}>
              Reply intelligence and follow-up writer unlock once stage is <strong style={{ color: C.tx }}>Sent</strong> or later.
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div style={{ ...cS, padding: "16px 20px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>📝 Notes</div>
              <textarea value={aNote} readOnly={isReadOnly} onChange={e => setANote(e.target.value)} onBlur={() => { if (!isReadOnly) saveN(a.n, aNote); }} placeholder="Add notes..." style={{ ...iS, width: "100%", minHeight: 80, fontSize: 12, resize: "vertical", boxSizing: "border-box", ...lockStyle(isReadOnly) }} />
            </div>
            <div style={{ ...cS, padding: "16px 20px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>📅 Follow-Up</div>
              <input type="date" value={aFU} disabled={isReadOnly} onChange={e => { setAFU(e.target.value); saveFU(a.n, e.target.value); }} style={{ ...iS, width: "100%", boxSizing: "border-box", ...lockStyle(isReadOnly) }} />
              {aFU && !isReadOnly && <button onClick={() => { setAFU(""); saveFU(a.n, ""); }} style={{ fontSize: 11, color: C.rd, background: "none", border: "none", cursor: "pointer", marginTop: 6, fontFamily: ft }}>Clear follow-up</button>}
            </div>
          </div>

          <div style={{ ...cS, padding: "16px 20px", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>📨 Send Log ({sendHistory.length})</div>
            {sendHistory.length ? (
              <div style={{ display: "grid", gap: 6 }}>
                {sendHistory.map(s => (
                  <div key={s.id} style={{ fontSize: 11, color: C.ts, padding: "6px 8px", borderRadius: 8, background: C.sa, border: `1px solid ${C.bd}` }}>
                    <span style={{ color: C.tt, fontFamily: mn }}>{new Date(s.sentAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                    {` · ${s.provider} · ${s.channel.toUpperCase()}${s.variantId ? ` · v${s.variantId}` : ""}`}
                    {s.sequenceStep ? ` · ${s.sequenceStep}` : ""}
                  </div>
                ))}
              </div>
            ) : <div style={{ fontSize: 12, color: C.tt }}>No sends logged yet.</div>}
          </div>

          <div style={{ ...cS, padding: "16px 20px" }}>
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
                            {isNote && l.author ? <span style={{ fontSize: 10, color: C.tt }}>by {l.author}</span> : null}
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
                                {l.editedAt ? <div style={{ marginTop: 4, fontSize: 10, color: C.tt }}>edited {new Date(l.editedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div> : null}
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
          </div>
        </div>
      </div>
    );
  }

  // ═══ PROJECT ═══
  if (screen === "project" && proj) return (
    <div style={{ fontFamily: ft, background: C.bg, minHeight: "100vh", color: C.tx }}>
      <Toast /><style>{css}</style>

      <div style={{ borderBottom: `1px solid ${C.bd}`, background: C.sf }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "16px 24px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
            <div>
              <button onClick={() => { setScreen("hub"); setSearch(""); setGf("All"); setSf("all"); setPf("all"); }} style={{ fontSize: 11, color: C.ac, background: "none", border: "none", cursor: "pointer", fontFamily: ft, fontWeight: 600, padding: 0, marginBottom: 4 }}>← Projects</button>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>{proj.name}</div>
              <div style={{ fontSize: 12, color: C.ts, marginTop: 2, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <span>{enriched.length} artists</span>
                <span>{stCounts.sent + stCounts.replied + stCounts.won} contacted</span>
                <span>{stCounts.won} won</span>
                <span>{(proj.sendLog || []).length} sends logged</span>
                <span>{dueSeqCount} seq due</span>
                {!!proj.internalRoster?.names?.length && <span>{internalMatchCount} platform matches</span>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: C.tt, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{authLabel}</span>
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, border: `1px solid ${C.bd}`, background: C.sa, color: C.ts, textTransform: "uppercase" }}>
                {roleLabel}
              </span>
              {isAdmin && (
                <a href="/ar/admin" style={{ ...actionBtn(false, "neutral"), textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                  Admin
                </a>
              )}
              <button disabled={isReadOnly} onClick={() => setShowDiscover(true)} style={{ ...actionBtn(true, "accent"), ...lockStyle(isReadOnly) }}>AI Discover</button>
              <select value={currentAiProvider} disabled={!isAdmin} onChange={e => saveAiProvider(e.target.value)} style={{ ...iS, padding: "7px 10px", fontSize: 12, minWidth: 118, ...lockStyle(!isAdmin) }}>
                <option value="anthropic">AI: Anthropic</option>
                <option value="openai">AI: OpenAI</option>
              </select>
              <button disabled={!isAdmin} onClick={configureAiKey} style={{ ...actionBtn(true, aiKeySet ? "good" : "danger"), ...lockStyle(!isAdmin) }}>
                {currentAiProvider === "openai" ? "OpenAI Key" : "Anthropic Key"} {aiKeySet ? "Set" : "Missing"}
              </button>
              <button disabled={isReadOnly} onClick={() => setShowAddArtist(true)} style={{ ...actionBtn(true, "good"), ...lockStyle(isReadOnly) }}>+ Artist</button>
              <label style={{ ...actionBtn(false, "neutral"), ...lockStyle(isReadOnly) }}>
                Import CSV
                <input type="file" accept=".csv" ref={fr} onChange={importCSV} disabled={isReadOnly} />
              </label>
              <label style={{ ...actionBtn(false, "neutral"), ...lockStyle(isReadOnly) }}>
                Internal CSV Check
                <input type="file" accept=".csv" ref={rosterRef} onChange={importInternalRoster} disabled={isReadOnly} />
              </label>
              <button onClick={copyProjectCsvLink} style={actionBtn(false, "neutral")}>CSV Link</button>
              <button onClick={() => exportPipeline(proj, enriched)} style={actionBtn(false, "neutral")}>Export</button>
              <button onClick={signOut} style={actionBtn(false, "neutral")}>Sign out</button>
              <DkBtn />
            </div>
          </div>

          <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: C.tt }}>Layout user</span>
              <select value={workspaceUser} onChange={e => changeWorkspaceUser(e.target.value)} style={{ ...iS, padding: "6px 10px", fontSize: 12 }}>
                {(proj.teamUsers || DEFAULT_TEAM_USERS).map(u => <option key={u} value={u}>{u}</option>)}
              </select>
              <button onClick={toggleFocusMode} style={actionBtn(focusMode, "accent")}>{focusMode ? "Exit Focus" : "Focus Mode"}</button>
              <span style={{ fontSize: 11, color: C.tt, marginRight: 4 }}>Panels</span>
              <button onClick={() => togglePanel("health")} style={actionBtn(showHealth, "warn")}>Health</button>
              <button onClick={() => togglePanel("queue")} style={actionBtn(showQueue, "warn")}>Queue {queue.length > 0 ? `(${queue.length})` : ""}</button>
              <button onClick={() => togglePanel("models")} style={actionBtn(showModels, "accent")}>Models</button>
              <button onClick={() => togglePanel("team")} style={actionBtn(showTeam, "good")}>Team</button>
              <button onClick={() => togglePanel("funnel")} style={actionBtn(showFunnel, "neutral")}>Funnel</button>
              <button onClick={() => togglePanel("ab")} style={actionBtn(showAB, "neutral")}>A/B</button>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: C.tt }}>Auto-saved per user</span>
              <button onClick={expandPanels} style={actionBtn(false, "neutral")}>Expand Core</button>
              <button onClick={collapsePanels} style={actionBtn(false, "neutral")}>Collapse All</button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "16px 24px" }}>
        {isReadOnly && (
          <div style={{ ...cS, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: C.ts }}>
            Viewer mode is active for this workspace. Editing, importing, and sequence actions are disabled.
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
        {showHealth && (
          <div style={{ ...cS, padding: "14px 18px", marginBottom: 12, animation: "si 0.18s ease" }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>🚨 Pipeline Health</div>
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

        {showModels && (
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

        {showTeam && (
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

        {showFunnel && (
          <div style={{ ...cS, padding: "18px 24px", marginBottom: 16, animation: "si 0.2s ease" }}>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-end" }}>
              {funnel.map((f, i) => (
                <div key={i} style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ height: 80, display: "flex", alignItems: "flex-end", justifyContent: "center", marginBottom: 6 }}>
                    <div style={{ width: "100%", maxWidth: 80, height: Math.max(6, f.p * 0.7), background: i === 3 ? C.gn : i === 0 ? C.ac : C.am, borderRadius: "6px 6px 0 0", transition: "height 0.4s" }} />
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: C.tx }}>{f.c}</div>
                  <div style={{ fontSize: 11, color: C.ts }}>{f.l}</div>
                  {i > 0 && <div style={{ fontSize: 10, color: C.tt }}>{f.p}%</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {showAB && (
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

        {showQueue && queue.length > 0 && (
          <div style={{ ...cS, padding: "16px 20px", marginBottom: 16, animation: "si 0.2s ease" }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>🎯 Smart Queue - Top Actions</div>
            <div style={{ display: "grid", gap: 6 }}>
              {queue.slice(0, 12).map((q, i) => (
                <div key={i} onClick={() => openA(q.artist)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, background: C.sa, cursor: "pointer", fontSize: 12, transition: "background 0.15s" }} onMouseEnter={e => { e.currentTarget.style.background = C.sh; }} onMouseLeave={e => { e.currentTarget.style.background = C.sa; }}>
                  <span style={{ fontSize: 14 }}>{q.icon}</span>
                  <span style={{ fontWeight: 600, minWidth: 120 }}>{q.artist.n}</span>
                  <span style={{ color: C.ts, flex: 1 }}>{q.label}</span>
                  <span style={{ ...mkP(true, sc(q.artist.stage, C), sb(q.artist.stage, C)), fontSize: 10, padding: "2px 8px" }}>{SM[q.artist.stage]?.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {showDiscover && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={e => { if (e.target === e.currentTarget) setShowDiscover(false); }}>
            <div style={{ background: C.sf, borderRadius: 18, padding: "28px 32px", width: 640, maxHeight: "80vh", overflow: "auto", boxShadow: "0 25px 70px rgba(0,0,0,0.25)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>🔍 AI Artist Discovery</div>
                  <div style={{ fontSize: 11, color: C.tt }}>Model: {modelLabel(taskModel("discovery"))} · {currentAiProvider === "openai" ? "OpenAI" : "Anthropic"}</div>
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
          {batch && <div style={{ display: "flex", gap: 4 }}>{STAGES.map(s => <button key={s.id} disabled={isReadOnly} title={s.label} onClick={() => batchSt(s.id)} style={{ ...mkP(false, sc(s.id, C), sb(s.id, C)), fontSize: 10, padding: "3px 8px", ...lockStyle(isReadOnly) }}>{s.icon}</button>)}</div>}
          <button disabled={isReadOnly} onClick={() => { setBatch(!batch); setBSel(new Set()); }} style={{ ...mkP(batch, C.ab, C.abb), fontSize: 11, ...lockStyle(isReadOnly) }}>{batch ? "Batch On" : "Batch"}</button>
          <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} style={{ ...iS, padding: "6px 10px", fontSize: 12 }}>
            <option value="all">Owner: All</option>
            {(proj.teamUsers || []).map(u => <option key={u} value={u}>Owner: {u}</option>)}
            <option value="">Owner: Unassigned</option>
          </select>
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
                <div key={a.n} onClick={() => { if (batch) { const ns = new Set(bSel); ns.has(a.n) ? ns.delete(a.n) : ns.add(a.n); setBSel(ns); } else openA(a); }}
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
          <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 20 }}>
            {STAGES.map(s => {
              const col = filtered.filter(a => a.stage === s.id);
              return (
                <div
                  key={s.id}
                  style={{
                    minWidth: 220,
                    maxWidth: 260,
                    flex: "0 0 auto",
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
                          onClick={() => openA(a)}
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
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${C.bd}`, textAlign: "left" }}>
                  {["Artist", "Owner", "Genre", "Listeners", "Stage", "Priority", "Platform", "Email", "Social", "Spotify", "Sequence", "Follow-up", "Updated"].map(h => (
                    <th key={h} style={{ padding: "8px 10px", fontWeight: 600, color: C.ts, fontSize: 11, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 600).map(a => {
                  const pt2 = pT(a.priority, C);
                  const ss = proj.sequenceState?.[a.n];
                  return (
                    <tr key={a.n} onClick={() => openA(a)} style={{ borderBottom: `1px solid ${C.sa}`, cursor: "pointer", transition: "background 0.1s" }} onMouseEnter={e => { e.currentTarget.style.background = C.sh; }} onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                      <td style={{ padding: "8px 10px", fontWeight: 600 }}>{a.n}</td>
                      <td style={{ padding: "8px 10px", color: a.owner ? C.ts : C.rd }}>{a.owner || "Unassigned"}</td>
                      <td style={{ padding: "8px 10px", color: C.ts }}>{a.bucket}</td>
                      <td style={{ padding: "8px 10px", color: C.ts }}>{a.l || "-"}</td>
                      <td style={{ padding: "8px 10px" }}><span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: sb(a.stage, C), color: sc(a.stage, C) }}>{SM[a.stage]?.icon} {SM[a.stage]?.label}</span></td>
                      <td style={{ padding: "8px 10px" }}><span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 8, background: pt2.bg, color: pt2.color, fontWeight: 600 }}>{pt2.label}</span></td>
                      <td style={{ padding: "8px 10px", color: a.onPlatform ? C.pr : C.tt, fontSize: 11 }}>{a.onPlatform ? "On Platform" : "-"}</td>
                      <td style={{ padding: "8px 10px", color: a.e ? C.gn : C.tt, fontSize: 11 }}>{a.e ? "✓" : "-"}</td>
                      <td style={{ padding: "8px 10px" }}>{a.soc ? <a href={`https://instagram.com/${a.soc}`} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{ color: C.pr, textDecoration: "none", fontSize: 11 }}>@{a.soc}</a> : "-"}</td>
                      <td style={{ padding: "8px 10px" }}><a href={spotifyUrl(a.n)} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{ color: C.gn, textDecoration: "none", fontSize: 11 }}>🎵</a></td>
                      <td style={{ padding: "8px 10px", color: ss ? (ss.status === "active" ? C.ab : C.ts) : C.tt, fontSize: 11 }}>{ss ? `${ss.status}${ss.nextDue ? ` · ${sD(ss.nextDue)}` : ""}` : "-"}</td>
                      <td style={{ padding: "8px 10px", color: a.followUp ? C.ab : C.tt, fontSize: 11 }}>{a.followUp ? sD(a.followUp) : "-"}</td>
                      <td style={{ padding: "8px 10px", color: C.tt, fontSize: 11 }}>{rD(a.stageDate)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px", color: C.tt }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>◎</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No artists yet</div>
            <div style={{ fontSize: 13 }}>Import a CSV, add one manually, or use AI Discover.</div>
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
    </div>
  );

  return null;
} 
