import { useState, useEffect, useMemo, useCallback, useRef } from "react";

/* ═══════════════════════════════════════════════════════════
   GEM FINDER v6 — AI-Powered A&R Management System
   + Sequence Engine + Send Tracking + A/B Testing
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

const LT = {
  bg: "#f5f5f7", sf: "#fff", sa: "#f0f0f3", sh: "#fafafa", bd: "#e0e0e6", bl: "#ccccd4",
  tx: "#1a1a2e", ts: "#5c5c72", tt: "#9494a8",
  ac: "#5046e5", al: "#ededff", am: "#7c75f0", at: "#3d35b8",
  gn: "#0f9d58", gb: "#e8f8ef", gd: "#a3e4be",
  bu: "#1a73e8", bb: "#e8f0fe", bd2: "#aecbfa",
  rd: "#d93025", rb: "#fce8e6", rbd: "#f5b7b1",
  ab: "#e37400", abb: "#fef3e0", abd: "#fdd888",
  pr: "#7c3aed", pb: "#f3edff", pbd: "#c9b8f8",
  sw: "0 1px 4px rgba(0,0,0,0.06)", sm: "0 4px 20px rgba(0,0,0,0.07)", cb: "#fff",
};
const DK = {
  bg: "#0c0c14", sf: "#13131f", sa: "#1a1a2a", sh: "#1e1e30", bd: "#28283e", bl: "#35355a",
  tx: "#e8e8f0", ts: "#8888a4", tt: "#5c5c76",
  ac: "#7c75f0", al: "#1e1c3a", am: "#6860e6", at: "#a9a4f7",
  gn: "#34d399", gb: "#0c2a1a", gd: "#166534",
  bu: "#60a5fa", bb: "#0c1a2e", bd2: "#1e3a5f",
  rd: "#f87171", rb: "#2a0c0c", rbd: "#5f1e1e",
  ab: "#fbbf24", abb: "#2a1e0c", abd: "#5f4410",
  pr: "#a78bfa", pb: "#1a0c2e", pbd: "#3d1e6f",
  sw: "0 1px 4px rgba(0,0,0,0.3)", sm: "0 4px 20px rgba(0,0,0,0.4)", cb: "#16162a",
};

const AB_VARIANTS = {
  dm: [
    {
      id: "A",
      label: "Song-first hook",
      open: ({ fn, ht, hk }) => ht ? `Hey ${fn}! Greg from Songfinch. Big fan of "${ht}".` : `Hey ${fn}! Greg from Songfinch — love ${hk}.`,
    },
    {
      id: "B",
      label: "Outcome-first hook",
      open: ({ fn }) => `Hey ${fn}! Greg from Songfinch. Quick idea: turn your most engaged fans into direct custom-song revenue.`,
    },
    {
      id: "C",
      label: "Proof-first hook",
      open: ({ fn }) => `Hey ${fn}! Greg from Songfinch — we've paid out $50M+ to artists and thought of you right away.`,
    },
  ],
  email: [
    {
      id: "A",
      label: "Superfan monetization",
      subject: ({ a }) => `Idea for ${a.n}: monetize superfans with custom songs`,
      lead: ({ th }) => `Greg here — Head of Content & Partnerships at Songfinch. ${th}`,
    },
    {
      id: "B",
      label: "Low-lift revenue lane",
      subject: ({ a }) => `${a.n} x Songfinch: low-lift revenue from fan requests`,
      lead: () => `Greg here from Songfinch. Reaching out with a lightweight revenue lane for your artist without touching release schedules.`,
    },
    {
      id: "C",
      label: "Partnership invite",
      subject: ({ a }) => `Partnership conversation for ${a.n}`,
      lead: ({ th }) => `Greg here from Songfinch — ${th} Wanted to reach out directly with a partnership idea.`,
    },
  ],
};

function sc(id, C) { return { prospect: C.tt, researched: C.ac, drafted: C.ab, sent: C.bu, replied: C.gn, won: C.pr, dead: C.rd }[id] || C.tt; }
function sb(id, C) { return { prospect: C.sa, researched: C.al, drafted: C.abb, sent: C.bb, replied: C.gb, won: C.pb, dead: C.rb }[id] || C.sa; }
function bucketGenre(g) { if (!g) return "Other"; const l = g.toLowerCase(); if (/country|americana|bluegrass/.test(l)) return "Country"; if (/hip.?hop|rap/.test(l)) return "Hip Hop"; if (/r&b|soul|neo.?soul/.test(l)) return "R&B / Soul"; if (/^indie/.test(l)) return "Indie"; if (/folk/.test(l)) return "Folk"; if (/punk|emo|hardcore/.test(l)) return "Punk / Emo"; if (/rock|grunge|metal/.test(l)) return "Rock"; if (/electronic|edm|house|techno|hyperpop|synth/.test(l)) return "Electronic"; if (/pop/.test(l)) return "Pop"; if (/jazz/.test(l)) return "Jazz"; if (/christian|gospel|worship/.test(l)) return "Christian"; if (/latin|reggaeton/.test(l)) return "Latin"; if (/singer.?songwriter/.test(l)) return "Singer-Songwriter"; if (/^alt/.test(l)) return "Alternative"; return "Other"; }
function parseMl(s) { if (!s) return 0; const m = s.replace(/[\,\s]/g, "").match(/([\d.]+)(k|m)?/i); if (!m) return 0; let v = parseFloat(m[1]); if (m[2]?.toLowerCase() === "m") v *= 1e6; else if (m[2]?.toLowerCase() === "k") v *= 1e3; return v; }
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
  return `https://open.spotify.com/search/${encodeURIComponent(clean)}/artists`;
}
function draftChannelFromKey(k) { if (!k) return "dm"; if (k.includes("email")) return "email"; return "dm"; }
function parseDraftSubject(text, fallback) { const m = (text || "").match(/^Subject:\s*(.+)\n/i); const subject = m ? m[1].trim() : fallback; const body = m ? (text || "").replace(/^Subject:.*\n+/i, "") : (text || ""); return { subject, body }; }
function gmailComposeUrl(to, subject, body) { return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to || "")}&su=${encodeURIComponent(subject || "")}&body=${encodeURIComponent(body || "")}`; }
function outlookComposeUrl(to, subject, body) { return `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(to || "")}&subject=${encodeURIComponent(subject || "")}&body=${encodeURIComponent(body || "")}`; }

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
      const entries = Object.entries(variants || {}).map(([variantId, v]) => ({ variantId, sent: v.sent || 0, replied: v.replied || 0, won: v.won || 0, rr: v.sent ? Math.round((v.replied / v.sent) * 100) : 0 }));
      if (!entries.length) return;
      const totalSent = entries.reduce((a, b) => a + b.sent, 0);
      const totalReplied = entries.reduce((a, b) => a + b.replied, 0);
      const best = entries.slice().sort((a, b) => (b.rr - a.rr) || (b.sent - a.sent))[0];
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
    settings: p.settings || { provider: "gmail", autoLogCompose: false },
  };
}

const AI_KEY_STORAGE = "gemfinder-anthropic-key";

function getStoredAiKey() {
  try {
    const local = window.localStorage.getItem(AI_KEY_STORAGE);
    if (local) return local.trim();
  } catch {}
  try {
    if (typeof import.meta !== "undefined" && import.meta.env?.VITE_ANTHROPIC_API_KEY) {
      return String(import.meta.env.VITE_ANTHROPIC_API_KEY).trim();
    }
  } catch {}
  return "";
}

// ═══ AI CALL HELPER ═══
async function aiCall(prompt, maxTokens = 1200, apiKey = "") {
  const key = (apiKey || getStoredAiKey()).trim();
  if (!key) {
    return { ok: false, text: "Missing API key. Click 'AI Key' in the project header and paste your Anthropic key." };
  }
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
    });
    if (!r.ok) {
      const raw = await r.text();
      let msg = `API error ${r.status}`;
      try {
        const parsed = JSON.parse(raw);
        msg = parsed?.error?.message || msg;
      } catch {}
      return { ok: false, text: msg };
    }
    const d = await r.json();
    const t = d.content?.map(i => i.type === "text" ? i.text : "").filter(Boolean).join("\n") || "No response.";
    return { ok: true, text: t };
  } catch (e) {
    return { ok: false, text: `API error: ${e.message}` };
  }
}

// ═══ AI INTEL ═══
async function fetchAIIntel(a, bucket, apiKey = "") {
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

SUGGESTED ANGLE: [The single best personalized pitch angle — reference their actual work]

TALKING POINTS: [3 bullet points specific to this artist Greg can use in outreach]

RED FLAGS: [Honest concerns or "None obvious"]

SPOTIFY NOTE: [What you know about their Spotify presence — top tracks, listener range, recent releases. If unsure say "Verify on Spotify"]

PRIORITY MOVE: [One specific next action]

Be punchy, honest, specific. Bad fit? Say so.`, 1200, apiKey);
}

// ═══ AI DRAFTS ═══
async function generateAIDrafts(a, bucket, intelText, abPlan, apiKey = "") {
  const fn = a.n.includes(" ") ? a.n.split(" ")[0] : a.n;
  const hasE = !!a.e;
  const ctx = intelText ? `\n\nAI INTEL (use to personalize):\n${intelText}` : "";
  const abHint = abPlan ? `\n\nA/B WINNER HINTS:\n- DM opener winner: Variant ${abPlan.dm.id} (${abPlan.dm.label})\n- Email subject winner: Variant ${abPlan.email.id} (${abPlan.email.label})\nUse these as directional hints, but write naturally.` : "";
  return aiCall(`You are Greg, Head of Content & Partnerships at Songfinch. Write outreach to recruit ${a.n}.

SONGFINCH: Fans pay artists to create one-of-one custom songs. $50M+ paid since 2016. No contracts, no AI, no cost. Artists own 100%, set price, accept only what they want.

ARTIST:
Name: ${a.n} | Genre: ${a.g || "Unknown"} (${bucket}) | Listeners: ${a.l || "Unknown"}
Hit Track: ${a.h || "Unknown"} | Social: ${a.ig || "None"} | Email: ${hasE ? "Yes" : "No"} | Location: ${a.loc || "Unknown"}${ctx}${abHint}

Write 3 drafts. Each must feel genuinely personal and professional. Reference specific things about this artist. Do not use generic filler.

===COLD_DM===
[Instagram/TikTok DM. 120 to 170 words. 4 to 6 short paragraphs. Confident and respectful. Mention 2 specific details about the artist. Avoid slang and avoid sounding desperate. End with a clear CTA question.]

===EMAIL===
[${hasE ? `Management email (Hey team,)` : `Direct email (Hey ${fn},)`} Professional but warm. Specific value prop for THIS artist. Start with Subject: line. Sign: Greg, Head of Content & Partnerships, Songfinch, Greg@songfinch.com]

===WARM_INTRO===
[As if you have a mutual or have been following them. Personal, less salesy. Reference specific admiration. Low-pressure CTA. Sign with title + email.]

Each draft should be genuinely DIFFERENT in approach.`, 2200, apiKey);
}

function parseAIDrafts(text, a) {
  const hasE = !!a.e;
  const sections = text.split(/===(\w+)===/);
  const drafts = [];
  for (let i = 1; i < sections.length; i += 2) {
    const k = sections[i].trim().toLowerCase();
    const c = (sections[i + 1] || "").trim();
    if (k === "cold_dm") drafts.push({ key: "cold_dm", label: "Cold DM ✨", sub: "AI-personalized → IG/TikTok", text: c, ai: true, channel: "dm", variantId: "AI" });
    else if (k === "email") drafts.push({ key: "formal_email", label: hasE ? "Mgmt Email ✨" : "Direct Email ✨", sub: hasE ? (a.e || "Find email") : "Greg@songfinch.com", text: c, ai: true, channel: "email", variantId: "AI" });
    else if (k === "warm_intro") drafts.push({ key: "warm_intro", label: "Warm Intro ✨", sub: "AI-personalized warm outreach", text: c, ai: true, channel: "dm", variantId: "AI" });
  }
  if (!drafts.length) drafts.push({ key: "ai_full", label: "AI Draft ✨", sub: "Full AI output", text, ai: true, channel: "dm", variantId: "AI" });
  return drafts;
}

// ═══ QUICK TEMPLATES (A/B aware) ═══
function genQuickDrafts(a, bucket, abPlan) {
  const fn = a.n.includes(" ") ? a.n.split(" ")[0] : a.n;
  const ht = a.h && !/tbd|high|known|rising|low|presence/i.test(a.h) ? a.h.split("(")[0].trim() : "";
  const hooks = { Country: "the way your songs connect", "Hip Hop": "the energy you bring", "R&B / Soul": "the emotional depth", Indie: "your sound and fanbase", Pop: "your music and fanbase", Rock: "your sound", Folk: "the intimacy in your writing", Electronic: "the production energy" };
  const hk = hooks[bucket] || "your music";
  const th = ht ? `Big fan of "${ht}".` : `Love ${hk}.`;

  const dmVariant = abPlan?.dm || AB_VARIANTS.dm[0];
  const emVariant = abPlan?.email || AB_VARIANTS.email[0];
  const dmIntro = dmVariant.open({ a, fn, ht, hk, th, bucket });
  const emSubject = emVariant.subject({ a, fn, ht, hk, th, bucket });
  const emLead = emVariant.lead({ a, fn, ht, hk, th, bucket });

  return [
    {
      key: "cold_dm",
      label: `Cold DM (v${dmVariant.id})`,
      sub: `A/B variant ${dmVariant.id}: ${dmVariant.label}`,
      text: `${dmIntro}\n\nI run Artist Partnerships at Songfinch. We help artists open a direct revenue lane by letting fans commission one-of-one custom songs.\n\nFor context, the platform has paid out more than $50M to artists since 2016. There are no contracts, no exclusivity, no cost to join, and artists keep ownership of everything they create.\n\nI think your audience would respond well to this because ${bucket === "Country" || bucket === "Folk" || bucket === "Singer-Songwriter" ? "your catalog already connects to personal moments and storytelling." : "your fanbase is engaged and values direct artist access."}\n\nIf you are open, I can send a one-page breakdown plus real artist examples.\n\nGreg\nHead of Content & Partnerships, Songfinch\nGreg@songfinch.com`,
      ai: false,
      channel: "dm",
      variantId: dmVariant.id,
    },
    {
      key: "formal_email",
      label: `${a.e ? "Mgmt" : "Direct"} Email (v${emVariant.id})`,
      sub: `A/B variant ${emVariant.id}: ${emVariant.label}`,
      text: `Subject: ${emSubject}\n\n${a.e ? "Hey team," : `Hey ${fn},`}\n\n${emLead}\n\nSongfinch lets fans commission custom songs from artists. $50M+ paid since 2016. No contracts, no exclusivity, no AI. Artists set price and keep ownership.\n\nWould love 15 mins to walk through it.\n\nBest,\nGreg\nHead of Content & Partnerships, Songfinch\nGreg@songfinch.com`,
      ai: false,
      channel: "email",
      variantId: emVariant.id,
      subject: emSubject,
    },
    {
      key: "warm_intro",
      label: `Warm Intro (v${dmVariant.id})`,
      sub: `A/B variant ${dmVariant.id} warm approach`,
      text: `Hey ${fn},\n\nGreg here from Songfinch. ${ht ? `I have had "${ht}" on repeat` : "I have been following your recent releases"}, and I wanted to reach out directly.\n\nAt Songfinch, fans commission personal songs from artists, and it has become a meaningful high-margin lane for many artists with loyal communities. The platform has paid out more than $50M since 2016.\n\nThere is no contract, no exclusivity, and no upfront cost. Artists choose which requests to accept, set their own pricing, and keep ownership.\n\nIf this is interesting, I can send a short overview so you can evaluate quickly.\n\nGreg\nHead of Content & Partnerships, Songfinch\nGreg@songfinch.com`,
      ai: false,
      channel: "dm",
      variantId: dmVariant.id,
    },
  ];
}

// ═══ AI DISCOVERY ═══
async function discoverArtists(criteria, apiKey = "") {
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
WHY: [2-3 sentences on Songfinch fit — specific fanbase traits, career moment, engagement]

Only recommend artists you're confident exist and are currently active. Skip obvious mainstream. Prioritize hidden gems Greg probably doesn't know.`, 3000, apiKey);
}

function parseDiscovered(text) {
  return text.split("===ARTIST===").filter(b => b.trim()).map(block => {
    const g = k => { const m = block.match(new RegExp(`${k}:\\s*(.+?)(?:\\n|$)`)); return m ? m[1].trim() : ""; };
    return { n: g("NAME"), g: g("GENRE"), l: g("LISTENERS"), loc: g("LOCATION"), h: g("TOP_TRACK"), ig: "", soc: g("SOCIAL").replace(/^@/, ""), e: "", s: false, o: "", why: g("WHY") };
  }).filter(a => a.n);
}

// ═══ ACTIVITY LOG ═══
function addLog(proj, name, action) { const logs = proj.activityLog || {}; const al = logs[name] || []; al.push({ action, time: new Date().toISOString() }); return { ...logs, [name]: al.slice(-80) }; }

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
    if (a.priority >= 5 && a.stage === "prospect") items.push({ type: "hot", artist: a, priority: 9, label: "HOT — still in Prospect", icon: "🔥" });
    if (a.stage === "drafted") {
      const d = a.stageDate ? daysBetween(a.stageDate, today) : 0;
      items.push({ type: "draft", artist: a, priority: 6 + Math.min(d, 3), label: `Draft ${d}d — send it`, icon: "✎" });
    }
    if (a.stage === "sent" && a.stageDate) {
      const d = daysBetween(a.stageDate, today);
      if (d >= 7) items.push({ type: "stale", artist: a, priority: 5, label: `Sent ${d}d — no reply`, icon: "⏳" });
    }
    if (a.priority >= 3 && a.priority < 5 && a.stage === "prospect" && a.e) items.push({ type: "warm", artist: a, priority: 4, label: "WARM + email — start outreach", icon: "📧" });
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
const SK = "gemfinder-v6";
async function sGet(k) {
  try {
    if (window.storage?.get) {
      const r = await window.storage.get(k);
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
      await window.storage.set(k, raw);
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
    if (!name || seen.has(name)) continue;
    seen.add(name);
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

function exportPipeline(proj, enriched) {
  const rows = [["Artist", "Genre", "Bucket", "Listeners", "Hit Track", "Email", "Social", "Stage", "Priority", "Spotify", "Notes", "Follow-Up", "Sequence", "Next Step", "Sends Logged"]];
  enriched.forEach(a => {
    const ss = proj.sequenceState?.[a.n];
    const seq = ss ? SEQ_MAP[ss.sequenceId] : null;
    const step = ss && seq ? seq.steps?.[ss.stepIndex] : null;
    const sends = (proj.sendLog || []).filter(s => s.artist === a.n).length;
    rows.push([
      a.n,
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
  link.download = `${proj.name.replace(/\s+/g, "_")}_pipeline_v6.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [dark, setDark] = useState(false);
  const [projects, setProjects] = useState([]);
  const [apId, setApId] = useState(null);
  const [screen, setScreen] = useState("hub");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const fr = useRef(null);

  const [search, setSearch] = useState("");
  const [gf, setGf] = useState("All");
  const [sf, setSf] = useState("all");
  const [pf, setPf] = useState("all");
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

  const [batch, setBatch] = useState(false);
  const [bSel, setBSel] = useState(new Set());
  const [showFunnel, setShowFunnel] = useState(false);
  const [showAB, setShowAB] = useState(false);

  const [viewMode, setViewMode] = useState("list");
  const [intel, setIntel] = useState(null);
  const [intelLoading, setIntelLoading] = useState(false);

  const [showLog, setShowLog] = useState(false);
  const [showQueue, setShowQueue] = useState(false);

  const [aiDraftLoading, setAiDraftLoading] = useState(false);
  const [draftMode, setDraftMode] = useState("template");

  const [showDiscover, setShowDiscover] = useState(false);
  const [discQuery, setDiscQuery] = useState("");
  const [discResults, setDiscResults] = useState([]);
  const [discLoading, setDiscLoading] = useState(false);

  const [seqPick, setSeqPick] = useState(SEQUENCES[0].id);
  const [sendProvider, setSendProvider] = useState("gmail");
  const [autoLogCompose, setAutoLogCompose] = useState(false);
  const [aiKeySet, setAiKeySet] = useState(false);
  const [dragArtistName, setDragArtistName] = useState("");
  const [dragOverStage, setDragOverStage] = useState("");

  const C = dark ? DK : LT;
  const ft = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
  const mn = "'JetBrains Mono','Fira Code','SF Mono',monospace";
  const mkP = (a, cl, bg) => ({ padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: a ? 600 : 400, border: `1.5px solid ${a ? cl : C.bd}`, cursor: "pointer", fontFamily: ft, background: a ? bg : "transparent", color: a ? cl : C.ts, transition: "all 0.15s", whiteSpace: "nowrap" });
  const iS = { padding: "8px 14px", border: `1.5px solid ${C.bd}`, borderRadius: 10, fontSize: 13, fontFamily: ft, outline: "none", color: C.tx, background: C.sa, boxSizing: "border-box" };
  const cS = { background: C.cb, border: `1.5px solid ${C.bd}`, borderRadius: 14, boxShadow: C.sw };
  const css = `@keyframes si{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}@keyframes fu{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}html,body,#root{margin:0;padding:0;cursor:auto!important}input[type="file"]{display:none}::selection{background:${C.ac}33}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${C.bd};border-radius:3px}`;

  useEffect(() => {
    (async () => {
      const d = await sGet(SK);
      if (d?.projects) {
        const norm = d.projects.map(normalizeProject);
        setProjects(norm);
        if (d.lastActive) setApId(d.lastActive);
        if (d.dark) setDark(d.dark);
        if (d.viewMode) setViewMode(d.viewMode);
      }
      setAiKeySet(!!getStoredAiKey());
      setLoading(false);
    })();
  }, []);

  const persist = useCallback(async (np, la, dk, vm) => {
    await sSet(SK, {
      projects: np || projects,
      lastActive: la !== undefined ? la : apId,
      dark: dk !== undefined ? dk : dark,
      viewMode: vm !== undefined ? vm : viewMode,
    });
  }, [projects, apId, dark, viewMode]);

  const flash = (m, t = "ok") => { setToast({ m, t }); setTimeout(() => setToast(null), 2500); };
  const togDark = async () => { const nd = !dark; setDark(nd); await persist(undefined, undefined, nd); };
  const setView = async v => { setViewMode(v); await persist(undefined, undefined, undefined, v); };
  const configureAiKey = () => {
    const existing = getStoredAiKey();
    const val = window.prompt("Paste Anthropic API key (starts with sk-ant-). Leave empty to clear.", existing || "");
    if (val === null) return;
    const clean = val.trim();
    try {
      if (clean) {
        window.localStorage.setItem(AI_KEY_STORAGE, clean);
        setAiKeySet(true);
        flash("AI key saved");
      } else {
        window.localStorage.removeItem(AI_KEY_STORAGE);
        setAiKeySet(false);
        flash("AI key cleared");
      }
    } catch {
      flash("Could not save API key", "err");
    }
  };

  const proj = projects.find(p => p.id === apId);

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
    if (!proj) return;
    const nextProj = { ...proj, settings: { ...(proj.settings || {}), provider, autoLogCompose: autoLog } };
    await saveProject(nextProj);
  };

  const createProj = async (name, desc) => {
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
      settings: { provider: "gmail", autoLogCompose: false },
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
    const f = e.target.files?.[0];
    if (!f || !proj) return;
    const t = await f.text();
    const p = parseCSV(t);
    if (!p.length) { flash("No valid artists", "err"); return; }
    const ex = new Set(proj.artists.map(a => a.n));
    const nw = p.filter(a => !ex.has(a.n));
    const mg = [...proj.artists, ...nw];
    const nl = { ...proj.pipeline };
    nw.forEach(a => { if (a.s && !nl[a.n]) nl[a.n] = { stage: "sent", date: new Date().toISOString() }; });
    const nextProj = { ...proj, artists: mg, pipeline: nl };
    await saveProject(nextProj);
    flash(`+${nw.length} artists (${p.length - nw.length} dupes skipped)`);
    e.target.value = "";
  };

  const setSt = async (n, sid) => {
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
    if (!proj) return;
    const al = addLog(proj, n, "Note updated");
    const nextProj = { ...proj, notes: { ...proj.notes, [n]: note }, activityLog: al };
    await saveProject(nextProj);
  };

  const saveFU = async (n, d) => {
    if (!proj) return;
    const al = addLog(proj, n, d ? `Follow-up: ${sD(d)}` : "Follow-up cleared");
    const nextProj = { ...proj, followUps: { ...proj.followUps, [n]: d }, activityLog: al };
    await saveProject(nextProj);
    flash(d ? `Follow-up: ${sD(d)}` : "Cleared");
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
    if (proj && selA) {
      const al = addLog(proj, selA.n, `Copied ${key} draft`);
      const nextProj = { ...proj, activityLog: al };
      setProjects(projects.map(p => p.id === proj.id ? nextProj : p));
      persist(projects.map(p => p.id === proj.id ? nextProj : p));
    }
  };

  const openA = a => {
    const bucket = bucketGenre(a.g);
    const plan = buildABPlan(proj?.abStats || {}, a, bucket);
    setSelA(a);
    setDrafts(genQuickDrafts(a, bucket, plan));
    setDraftTab(0);
    setDraftMode("template");
    setANote(proj?.notes?.[a.n] || "");
    setAFU(proj?.followUps?.[a.n] || "");
    setIntel(null);
    setShowLog(false);
    setSeqPick(proj?.sequenceState?.[a.n]?.sequenceId || SEQUENCES[0].id);
    setScreen("detail");
  };

  const runIntel = async a => {
    setIntelLoading(true);
    setIntel(null);
    const result = await fetchAIIntel(a, bucketGenre(a.g), getStoredAiKey());
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
    setAiDraftLoading(true);
    const bucket = bucketGenre(a.g);
    const plan = buildABPlan(proj?.abStats || {}, a, bucket);
    const result = await generateAIDrafts(a, bucket, intel?.ok ? intel.text : null, plan, getStoredAiKey());
    if (result.ok) {
      const parsed = parseAIDrafts(result.text, a);
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
    setDrafts(genQuickDrafts(a, bucket, plan));
    setDraftTab(0);
    setDraftMode("template");
  };

  const trackSend = async (artist, draft, provider = "manual", opts = {}) => {
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
    if (!proj) return;
    const cur = proj.sequenceState?.[artist.n];
    if (!cur) return;
    const state = { ...(proj.sequenceState || {}), [artist.n]: { ...cur, status: "active", stepIndex: 0, nextDue: todayISO(), history: [] } };
    const al = addLog(proj, artist.n, "Sequence reset to step 1");
    await saveProject({ ...proj, sequenceState: state, activityLog: al, followUps: { ...(proj.followUps || {}), [artist.n]: todayISO() } });
    flash("Sequence reset");
  };

  const markSeqStepSent = async artist => {
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
    if (!discQuery.trim()) return;
    setDiscLoading(true);
    setDiscResults([]);
    const r = await discoverArtists(discQuery, getStoredAiKey());
    if (r.ok) {
      const artists = parseDiscovered(r.text);
      setDiscResults(artists);
      if (!artists.length) flash("No artists parsed — try different criteria", "err");
    } else {
      flash(r.text || "Discovery failed", "err");
    }
    setDiscLoading(false);
  };

  const addDiscovered = async a => {
    if (!proj) return;
    const ex = new Set(proj.artists.map(x => x.n));
    if (ex.has(a.n)) { flash(`${a.n} already in project`, "err"); return; }
    const nextProj = {
      ...proj,
      artists: [...proj.artists, { n: a.n, g: a.g, l: a.l, h: a.h, ig: a.ig || "", soc: a.soc || "", e: a.e || "", loc: a.loc || "", s: false, o: "AI Discovery" }],
    };
    await saveProject(nextProj);
    flash(`Added ${a.n}`);
  };

  const enriched = useMemo(() => {
    if (!proj) return [];
    return proj.artists.map(a => ({
      ...a,
      bucket: bucketGenre(a.g),
      priority: pS(a),
      stage: proj.pipeline[a.n]?.stage || "prospect",
      stageDate: proj.pipeline[a.n]?.date || null,
      note: proj.notes?.[a.n] || "",
      followUp: proj.followUps?.[a.n] || "",
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
    if (sortBy === "priority") l = [...l].sort((a, b) => b.priority - a.priority);
    else if (sortBy === "name") l = [...l].sort((a, b) => a.n.localeCompare(b.n));
    else if (sortBy === "listeners") l = [...l].sort((a, b) => parseMl(b.l) - parseMl(a.l));
    else if (sortBy === "recent") l = [...l].sort((a, b) => (b.stageDate || "").localeCompare(a.stageDate || ""));
    return l;
  }, [enriched, search, gf, sf, pf, sortBy, C]);

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
  const handleKanbanDrop = async (stageId, droppedName = "") => {
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

  if (loading) return (
    <div style={{ fontFamily: ft, background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: C.ts }}>
      <style>{css}</style>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 4, color: C.ac, textTransform: "uppercase", marginBottom: 6 }}>Gem Finder v6</div>
        <div style={{ fontSize: 13, color: C.tt }}>Loading...</div>
      </div>
    </div>
  );

  // ═══ HUB ═══
  if (screen === "hub") return (
    <div style={{ fontFamily: ft, background: C.bg, minHeight: "100vh", color: C.tx }}>
      <Toast /><style>{css}</style>
      <div style={{ borderBottom: `1px solid ${C.bd}`, background: C.sf }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 24px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 5, color: C.ac, textTransform: "uppercase", marginBottom: 4 }}>Gem Finder v6</div>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em" }}>AI-Powered A&R</div>
            <div style={{ fontSize: 13, color: C.ts, marginTop: 3 }}>Sequence engine, send tracking, and A/B-optimized outreach.</div>
          </div>
          <DkBtn />
        </div>
      </div>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 24px" }}>
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
          <div onClick={() => setShowNew(true)} style={{ background: C.sa, border: `2px dashed ${C.bd}`, borderRadius: 14, padding: "22px 24px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 140, transition: "all 0.2s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.ac; e.currentTarget.style.background = C.al; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.bd; e.currentTarget.style.background = C.sa; }}>
            <div style={{ fontSize: 28, color: C.tt, marginBottom: 6 }}>+</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.ts }}>New Project</div>
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
    const logs = (proj?.activityLog || {})[a.n] || [];

    const ss = proj?.sequenceState?.[a.n] || null;
    const seq = ss ? SEQ_MAP[ss.sequenceId] : null;
    const seqStep = seq?.steps?.[ss?.stepIndex] || null;
    const sendHistory = (proj?.sendLog || []).filter(s => s.artist === a.n).slice(-8).reverse();

    const d = drafts[draftTab] || null;
    const dStats = d?.variantId && (d.channel === "dm" || d.channel === "email")
      ? variantStats(proj?.abStats || {}, bucket, d.channel, d.variantId)
      : null;

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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>{a.n}</span>
                <span style={{ ...mkP(true, pt.color, pt.bg), fontSize: 11 }}>{pt.label}</span>
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
              <button key={s.id} onClick={() => setSt(a.n, s.id)} style={{ ...mkP(stage === s.id, sc(s.id, C), sb(s.id, C)), fontSize: 11 }}>
                {s.icon} {s.label}
              </button>
            ))}
          </div>

          <div style={{ ...cS, padding: "18px 22px", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>🧭 Sequence Engine</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <select value={seqPick} onChange={e => setSeqPick(e.target.value)} style={{ ...iS, padding: "6px 10px", fontSize: 12 }}>
                  {SEQUENCES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {!ss && <button onClick={() => enrollSeq(a, seqPick)} style={{ padding: "6px 12px", borderRadius: 9, border: `1.5px solid ${C.ac}`, background: C.al, color: C.ac, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: ft }}>Enroll</button>}
              </div>
            </div>

            {!ss && <div style={{ fontSize: 12, color: C.ts }}>No active sequence. Enroll this artist to automate multi-step follow-ups with due dates.</div>}

            {ss && (
              <div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                  <span style={{ ...mkP(true, ss.status === "active" ? C.gn : ss.status === "paused" ? C.ab : C.tt, ss.status === "active" ? C.gb : ss.status === "paused" ? C.abb : C.sa), fontSize: 10, padding: "2px 8px" }}>{ss.status.toUpperCase()}</span>
                  <span style={{ fontSize: 12, color: C.ts }}>{seq?.name}</span>
                  {seqStep && <span style={{ fontSize: 12, color: C.ts }}>Next: <strong style={{ color: C.tx }}>{seqStep.label}</strong> ({seqStep.channel.toUpperCase()}){ss.nextDue ? ` · due ${sD(ss.nextDue)}` : ""}</span>}
                  {!seqStep && <span style={{ fontSize: 12, color: C.ts }}>Sequence complete</span>}
                </div>

                <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                  {ss.status === "active" && seqStep && <button onClick={() => markSeqStepSent(a)} style={{ padding: "6px 12px", borderRadius: 9, border: `1.5px solid ${C.gn}`, background: C.gb, color: C.gn, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: ft }}>Mark Step Sent</button>}
                  {(ss.status === "active" || ss.status === "paused") && <button onClick={() => toggleSeqPause(a)} style={{ padding: "6px 12px", borderRadius: 9, border: `1px solid ${C.bd}`, background: "transparent", color: C.ts, cursor: "pointer", fontSize: 11, fontFamily: ft }}>{ss.status === "active" ? "Pause" : "Resume"}</button>}
                  <button onClick={() => resetSeq(a)} style={{ padding: "6px 12px", borderRadius: 9, border: `1px solid ${C.bd}`, background: "transparent", color: C.ts, cursor: "pointer", fontSize: 11, fontFamily: ft }}>Reset</button>
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
              <div style={{ fontSize: 14, fontWeight: 700 }}>🧠 AI Intel</div>
              <button onClick={() => runIntel(a)} disabled={intelLoading} style={{ padding: "6px 16px", borderRadius: 10, border: `1.5px solid ${C.ac}`, background: intelLoading ? C.sa : C.al, color: C.ac, cursor: intelLoading ? "wait" : "pointer", fontSize: 12, fontWeight: 600, fontFamily: ft }}>{intelLoading ? "Analyzing..." : intel ? "Re-analyze" : "Analyze Artist"}</button>
            </div>
            {intelLoading && <div style={{ fontSize: 12, color: C.ts, padding: "12px 0" }}>🔄 Running AI analysis on {a.n}...</div>}
            {intel && <div style={{ fontSize: 13, lineHeight: 1.7, color: C.tx, whiteSpace: "pre-wrap", padding: "12px 16px", background: C.sa, borderRadius: 10, marginTop: 8, border: `1px solid ${C.bd}` }}>{intel.text}</div>}
          </div>

          <div style={{ ...cS, padding: "20px 24px", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>✉ Outreach Drafts</div>
              <div style={{ display: "flex", gap: 6 }}>
                {draftMode === "ai" ? (
                  <button onClick={() => switchToTemplates(a)} style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${C.bd}`, background: "transparent", color: C.ts, cursor: "pointer", fontSize: 11, fontFamily: ft }}>Templates</button>
                ) : (
                  <button onClick={() => runAIDrafts(a)} disabled={aiDraftLoading} style={{ padding: "5px 12px", borderRadius: 8, border: `1.5px solid ${C.pr}`, background: aiDraftLoading ? C.sa : C.pb, color: C.pr, cursor: aiDraftLoading ? "wait" : "pointer", fontSize: 11, fontWeight: 600, fontFamily: ft }}>✨ {aiDraftLoading ? "Generating..." : "AI Personalize"}</button>
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
                <textarea value={d.text} onChange={e => { const nd = [...drafts]; nd[draftTab] = { ...nd[draftTab], text: e.target.value }; setDrafts(nd); }} style={{ ...iS, width: "100%", minHeight: 200, lineHeight: 1.65, fontSize: 13, resize: "vertical", boxSizing: "border-box" }} />

                <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button onClick={() => cp(d.text, d.key)} style={{ padding: "7px 20px", borderRadius: 10, border: "none", background: copied === d.key ? C.gn : C.ac, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: ft, transition: "all 0.2s" }}>{copied === d.key ? "Copied ✓" : "Copy"}</button>

                  <select value={sendProvider} onChange={e => { const v = e.target.value; setSendProvider(v); saveSendPrefs(v, autoLogCompose); }} style={{ ...iS, padding: "6px 10px", fontSize: 11 }}>
                    <option value="gmail">Gmail</option>
                    <option value="outlook">Outlook</option>
                  </select>

                  <label style={{ fontSize: 11, color: C.ts, display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <input type="checkbox" checked={autoLogCompose} onChange={e => { const v = e.target.checked; setAutoLogCompose(v); saveSendPrefs(sendProvider, v); }} />
                    Auto-log on compose
                  </label>

                  {d.channel === "email" && (
                    <button onClick={() => openCompose(a, d, sendProvider)} disabled={!a.e} style={{ padding: "7px 12px", borderRadius: 10, border: `1.5px solid ${C.bu}`, background: C.bb, color: C.bu, cursor: a.e ? "pointer" : "not-allowed", fontSize: 11, fontWeight: 600, fontFamily: ft, opacity: a.e ? 1 : 0.45 }}>
                      Open in {sendProvider === "outlook" ? "Outlook" : "Gmail"}
                    </button>
                  )}

                  <button onClick={() => trackSend(a, d, "manual")} style={{ padding: "7px 12px", borderRadius: 10, border: `1.5px solid ${C.gn}`, background: C.gb, color: C.gn, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: ft }}>Log Sent + Advance</button>

                  {draftMode === "template" && <span style={{ fontSize: 11, color: C.tt }}>💡 Hit "AI Personalize" above for a custom version{intel?.ok ? " (uses intel)" : ""}</span>}
                  {draftMode === "ai" && <span style={{ fontSize: 11, color: C.pr }}>✨ AI-generated — edit freely</span>}
                </div>

                {dStats && (
                  <div style={{ fontSize: 11, color: C.ts, marginTop: 8 }}>
                    A/B stats for <strong>v{d.variantId}</strong> ({d.channel.toUpperCase()}): {dStats.sent} sent · {dStats.replied} replies · {dStats.rr}% reply rate
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div style={{ ...cS, padding: "16px 20px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>📝 Notes</div>
              <textarea value={aNote} onChange={e => setANote(e.target.value)} onBlur={() => saveN(a.n, aNote)} placeholder="Add notes..." style={{ ...iS, width: "100%", minHeight: 80, fontSize: 12, resize: "vertical", boxSizing: "border-box" }} />
            </div>
            <div style={{ ...cS, padding: "16px 20px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>📅 Follow-Up</div>
              <input type="date" value={aFU} onChange={e => { setAFU(e.target.value); saveFU(a.n, e.target.value); }} style={{ ...iS, width: "100%", boxSizing: "border-box" }} />
              {aFU && <button onClick={() => { setAFU(""); saveFU(a.n, ""); }} style={{ fontSize: 11, color: C.rd, background: "none", border: "none", cursor: "pointer", marginTop: 6, fontFamily: ft }}>Clear follow-up</button>}
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
            {showLog && logs.length > 0 && (
              <div style={{ marginTop: 10, maxHeight: 240, overflowY: "auto" }}>
                {[...logs].reverse().map((l, i) => (
                  <div key={i} style={{ fontSize: 11, color: C.ts, padding: "4px 0", borderBottom: i < logs.length - 1 ? `1px solid ${C.sa}` : "none" }}>
                    <span style={{ color: C.tt, fontFamily: mn }}>{new Date(l.time).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span> — {l.action}
                  </div>
                ))}
              </div>
            )}
            {showLog && logs.length === 0 && <div style={{ fontSize: 12, color: C.tt, marginTop: 8 }}>No activity yet.</div>}
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
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "16px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
            <div>
              <button onClick={() => { setScreen("hub"); setSearch(""); setGf("All"); setSf("all"); setPf("all"); }} style={{ fontSize: 11, color: C.ac, background: "none", border: "none", cursor: "pointer", fontFamily: ft, fontWeight: 600, padding: 0, marginBottom: 4 }}>← Projects</button>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>{proj.name}</div>
              <div style={{ fontSize: 12, color: C.ts, marginTop: 2 }}>{enriched.length} artists · {stCounts.sent + stCounts.replied + stCounts.won} contacted · {stCounts.won} won · {(proj.sendLog || []).length} sends logged · {dueSeqCount} seq due</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button onClick={() => setShowDiscover(true)} style={{ padding: "7px 16px", borderRadius: 10, border: `1.5px solid ${C.pr}`, background: C.pb, color: C.pr, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: ft }}>🔍 AI Discover</button>
              <button onClick={configureAiKey} style={{ padding: "7px 14px", borderRadius: 10, border: `1.5px solid ${aiKeySet ? C.gn : C.rd}`, background: aiKeySet ? C.gb : C.rb, color: aiKeySet ? C.gn : C.rd, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: ft }}>🔑 AI Key {aiKeySet ? "Set" : "Missing"}</button>
              <button onClick={() => setShowQueue(!showQueue)} style={{ padding: "7px 14px", borderRadius: 10, border: `1.5px solid ${C.ab}`, background: queue.length ? C.abb : "transparent", color: C.ab, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: ft }}>🎯 Queue {queue.length > 0 && `(${queue.length})`}</button>
              <button onClick={() => setShowFunnel(!showFunnel)} style={{ padding: "7px 14px", borderRadius: 10, border: `1.5px solid ${C.bd}`, background: "transparent", color: C.ts, cursor: "pointer", fontSize: 12, fontFamily: ft }}>📊</button>
              <button onClick={() => setShowAB(!showAB)} style={{ padding: "7px 14px", borderRadius: 10, border: `1.5px solid ${C.bu}`, background: showAB ? C.bb : "transparent", color: C.bu, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: ft }}>🧪 A/B</button>
              <label style={{ padding: "7px 14px", borderRadius: 10, border: `1.5px solid ${C.bd}`, background: "transparent", color: C.ts, cursor: "pointer", fontSize: 12, fontFamily: ft }}>Import CSV<input type="file" accept=".csv" ref={fr} onChange={importCSV} /></label>
              <button onClick={() => exportPipeline(proj, enriched)} style={{ padding: "7px 14px", borderRadius: 10, border: `1.5px solid ${C.bd}`, background: "transparent", color: C.ts, cursor: "pointer", fontSize: 12, fontFamily: ft }}>Export</button>
              <DkBtn />
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "16px 24px" }}>
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
                      {["Genre", "Channel", "Winner", "Winner Rate", "Total Sent", "Total Replies", "Variants"].map(h => (
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
                        <td style={{ padding: "8px 10px", color: C.ts }}>{r.totalSent}</td>
                        <td style={{ padding: "8px 10px", color: C.ts }}>{r.totalReplied}</td>
                        <td style={{ padding: "8px 10px", color: C.ts, fontSize: 11 }}>
                          {r.variants.map(v => `v${v.variantId}:${v.sent}s/${v.replied}r`).join(" · ")}
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
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>🎯 Smart Queue — Top Actions</div>
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
                <div style={{ fontSize: 18, fontWeight: 700 }}>🔍 AI Artist Discovery</div>
                <button onClick={() => setShowDiscover(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.ts }}>✕</button>
              </div>
              <div style={{ fontSize: 12, color: C.ts, marginBottom: 12 }}>Describe what you're looking for — genre, location, listener range, vibe, career stage, etc.</div>
              <textarea value={discQuery} onChange={e => setDiscQuery(e.target.value)} placeholder='e.g. "Chicago indie artists, 10K-100K listeners, released in last year, strong IG presence"' style={{ ...iS, width: "100%", minHeight: 60, fontSize: 13, resize: "vertical", boxSizing: "border-box", marginBottom: 12 }} />
              <button onClick={runDiscover} disabled={discLoading || !discQuery.trim()} style={{ padding: "8px 24px", borderRadius: 10, border: "none", background: discLoading ? C.sa : C.pr, color: "#fff", cursor: discLoading ? "wait" : "pointer", fontSize: 13, fontWeight: 600, fontFamily: ft, marginBottom: 16 }}>{discLoading ? "🔄 Discovering..." : "Discover Artists"}</button>

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
                        <button onClick={() => addDiscovered(da)} style={{ padding: "5px 14px", borderRadius: 8, border: `1.5px solid ${C.gn}`, background: C.gb, color: C.gn, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: ft, flexShrink: 0 }}>+ Add</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
          <input placeholder="Search artists..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...iS, width: 220 }} />
          <div style={{ display: "flex", gap: 2, background: C.sa, borderRadius: 10, padding: 3, border: `1px solid ${C.bd}` }}>
            {[ ["list", "☰"], ["kanban", "▦"], ["table", "▤"] ].map(([v, ic]) => (
              <button key={v} onClick={() => setView(v)} style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: viewMode === v ? C.ac : "transparent", color: viewMode === v ? "#fff" : C.ts, cursor: "pointer", fontSize: 13, fontFamily: ft }}>{ic}</button>
            ))}
          </div>
          {batch && <div style={{ display: "flex", gap: 4 }}>{STAGES.map(s => <button key={s.id} onClick={() => batchSt(s.id)} style={{ ...mkP(false, sc(s.id, C), sb(s.id, C)), fontSize: 10, padding: "3px 8px" }}>{s.icon}</button>)}</div>}
          <button onClick={() => { setBatch(!batch); setBSel(new Set()); }} style={{ ...mkP(batch, C.ab, C.abb), fontSize: 11 }}>Batch</button>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ ...iS, padding: "6px 10px", fontSize: 12 }}>
            <option value="priority">Sort: Priority</option>
            <option value="name">Sort: Name</option>
            <option value="listeners">Sort: Listeners</option>
            <option value="recent">Sort: Recent</option>
          </select>
        </div>

        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
          <button onClick={() => setSf("all")} style={mkP(sf === "all", C.ac, C.al)}>All {enriched.length}</button>
          {STAGES.map(s => stCounts[s.id] > 0 && <button key={s.id} onClick={() => setSf(s.id)} style={mkP(sf === s.id, sc(s.id, C), sb(s.id, C))}>{s.icon} {s.label} {stCounts[s.id]}</button>)}
        </div>

        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
          <button onClick={() => setGf("All")} style={mkP(gf === "All", C.ac, C.al)}>All Genres</button>
          {gBuckets.slice(0, 12).map(([b, c]) => <button key={b} onClick={() => setGf(gf === b ? "All" : b)} style={mkP(gf === b, C.ac, C.al)}>{b} {c}</button>)}
        </div>

        <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
          <button onClick={() => setPf("all")} style={mkP(pf === "all", C.ac, C.al)}>All Priority</button>
          {["HOT", "WARM", "COOL"].map(p => <button key={p} onClick={() => setPf(pf === p ? "all" : p)} style={mkP(pf === p, p === "HOT" ? C.rd : p === "WARM" ? C.ab : C.tt, p === "HOT" ? C.rb : p === "WARM" ? C.abb : C.sa)}>{p}</button>)}
        </div>

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
                  onDragEnter={e => { e.preventDefault(); setDragOverStage(s.id); }}
                  onDragLeave={() => { if (dragOverStage === s.id) setDragOverStage(""); }}
                  onDrop={async e => {
                    e.preventDefault();
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
                          draggable
                          onDragStart={e => {
                            setDragArtistName(a.n);
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", a.n);
                          }}
                          onDragEnd={() => {
                            setDragArtistName("");
                            setDragOverStage("");
                          }}
                          onClick={() => openA(a)}
                          style={{ ...cS, padding: "10px 12px", cursor: "grab", transition: "all 0.15s", fontSize: 12 }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = C.ac; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = C.bd; }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                            <span style={{ fontWeight: 700, fontSize: 13 }}>{a.n}</span>
                            <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 8, background: pt2.bg, color: pt2.color, fontWeight: 600 }}>{pt2.label}</span>
                          </div>
                          <div style={{ color: C.ts, marginTop: 3, fontSize: 11 }}>{a.bucket}{a.l ? ` · ${a.l}` : ""}</div>
                          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                            {a.e && <span style={{ fontSize: 10 }}>✉</span>}
                            {a.soc && <span style={{ fontSize: 10 }}>📷</span>}
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
                  {["Artist", "Genre", "Listeners", "Stage", "Priority", "Email", "Social", "Spotify", "Sequence", "Follow-up", "Updated"].map(h => (
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
                      <td style={{ padding: "8px 10px", color: C.ts }}>{a.bucket}</td>
                      <td style={{ padding: "8px 10px", color: C.ts }}>{a.l || "-"}</td>
                      <td style={{ padding: "8px 10px" }}><span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: sb(a.stage, C), color: sc(a.stage, C) }}>{SM[a.stage]?.icon} {SM[a.stage]?.label}</span></td>
                      <td style={{ padding: "8px 10px" }}><span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 8, background: pt2.bg, color: pt2.color, fontWeight: 600 }}>{pt2.label}</span></td>
                      <td style={{ padding: "8px 10px", color: a.e ? C.gn : C.tt, fontSize: 11 }}>{a.e ? "✓" : "—"}</td>
                      <td style={{ padding: "8px 10px" }}>{a.soc ? <a href={`https://instagram.com/${a.soc}`} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{ color: C.pr, textDecoration: "none", fontSize: 11 }}>@{a.soc}</a> : "—"}</td>
                      <td style={{ padding: "8px 10px" }}><a href={spotifyUrl(a.n)} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{ color: C.gn, textDecoration: "none", fontSize: 11 }}>🎵</a></td>
                      <td style={{ padding: "8px 10px", color: ss ? (ss.status === "active" ? C.ab : C.ts) : C.tt, fontSize: 11 }}>{ss ? `${ss.status}${ss.nextDue ? ` · ${sD(ss.nextDue)}` : ""}` : "—"}</td>
                      <td style={{ padding: "8px 10px", color: a.followUp ? C.ab : C.tt, fontSize: 11 }}>{a.followUp ? sD(a.followUp) : "—"}</td>
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
            <div style={{ fontSize: 13 }}>Import a CSV or use AI Discover to find artists.</div>
          </div>
        )}
      </div>
    </div>
  );

  return null;
}
