"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const STORAGE = {
  cards: "ingest_io_v3_cards",
  manual: "ingest_io_v3_manual_positions",
  prefs: "ingest_io_v3_preferences",
  collections: "ingest_io_v3_collections",
  refresh: "ingest_io_v3_refresh",
  scenes: "ingest_io_v3_scenes",
  collapsedCards: "ingest_io_v3_collapsed_cards",
  collapsedCategories: "ingest_io_v3_collapsed_categories",
};

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = DAY_MS * 7;
const NODE_WIDTH = 280;
const NODE_BODY_HEIGHT = 176;
const NODE_COLLAPSED_HEIGHT = 64;
const UI_PRESET_VERSION = 2;

const VIEW_OPTIONS = [
  { id: "web", label: "Web" },
  { id: "lanes", label: "Lanes" },
  { id: "matrix", label: "Matrix" },
  { id: "list", label: "List" },
  { id: "timeline", label: "Timeline" },
];

const INSIGHT_TABS = [
  { id: "overview", label: "Overview" },
  { id: "category", label: "Category" },
  { id: "card", label: "Card" },
  { id: "compare", label: "Compare" },
  { id: "radar", label: "Radar" },
];

const THEME_OPTIONS = [
  { id: "lumen", label: "Lumen" },
  { id: "cloud", label: "Cloud" },
  { id: "mono", label: "Mono" },
];

const DENSITY_OPTIONS = [
  { id: "airy", label: "Airy" },
  { id: "balanced", label: "Balanced" },
  { id: "dense", label: "Dense" },
];

const MOTION_OPTIONS = [
  { id: "smooth", label: "Smooth" },
  { id: "steady", label: "Steady" },
];

const SORT_OPTIONS = [
  { id: "relevance", label: "Relevance" },
  { id: "newest", label: "Newest" },
  { id: "alpha", label: "A-Z" },
  { id: "freshness", label: "Freshness" },
  { id: "confidence", label: "Confidence" },
];

const FRESHNESS_FILTERS = ["ALL", "Fresh", "Aging", "Stale", "Analyzing"];

const REFRESH_INTERVAL_OPTIONS = [
  { id: 5, label: "5m" },
  { id: 15, label: "15m" },
  { id: 30, label: "30m" },
  { id: 60, label: "60m" },
];

const TYPE_META = {
  TOOL: { label: "Tool", hue: 212 },
  ARTICLE: { label: "Article", hue: 164 },
  VIDEO: { label: "Video", hue: 20 },
  SOCIAL_POST: { label: "Social", hue: 286 },
  GITHUB: { label: "Repo", hue: 200 },
  PAPER: { label: "Paper", hue: 248 },
  PDF: { label: "PDF", hue: 34 },
  OTHER: { label: "Other", hue: 222 },
};

const DEMO_LINKS = [
  "https://cursor.com",
  "https://github.com/langchain-ai/langchain",
  "https://x.com/karpathy/status/example123",
  "https://openai.com/research",
  "https://huggingface.co/papers",
];

const SEED_CARDS = [
  {
    id: "seed-cursor",
    url: "https://cursor.com",
    canonical_url: "https://cursor.com",
    title: "Cursor - AI-native code editor",
    type: "TOOL",
    source_domain: "cursor.com",
    ingested_at: "2026-03-01T12:20:00.000Z",
    last_checked_at: "2026-03-04T20:00:00.000Z",
    summary_short: "Code editor with deep AI workflows for autocomplete, edits, and repo-aware navigation.",
    summary_full: [
      "Strong for teams iterating quickly on product and infrastructure code.",
      "Quality gain grows with large codebases and frequent context switching.",
      "Security policy review still matters for regulated environments.",
    ],
    usefulness: {
      best_for: ["Engineering velocity", "Prototype loops"],
      pros: ["Fast setup", "Large productivity jump"],
      cons: ["Subscription cost", "Needs policy check"],
      who_should_use: ["Product engineering teams"],
      who_should_skip: ["Strict offline teams"],
    },
    tags: ["ai", "coding", "editor"],
    categories: { primary: "Developer Tools", secondary: ["AI/ML", "Productivity"] },
    entities: [
      { name: "Cursor", type: "PRODUCT", confidence: 0.95 },
      { name: "Anysphere", type: "COMPANY", confidence: 0.85 },
    ],
    relevance: {
      score: 90,
      explanation: ["High market pull", "Frequent updates"],
      longevity_bucket: "12mo+",
      staleness_flags: [],
    },
    relevance_history: [
      { at: "2026-02-26T12:20:00.000Z", score: 84 },
      { at: "2026-03-04T20:00:00.000Z", score: 90 },
    ],
    change_log: [],
    user_intent: "Editor selection",
    user_notes: "Compare against Windsurf and Copilot.",
    confidence_notes: ["Strong category signal from title and domain"],
    pinned: true,
    processing_status: "complete",
    archived: false,
  },
  {
    id: "seed-langchain",
    url: "https://github.com/langchain-ai/langchain",
    canonical_url: "https://github.com/langchain-ai/langchain",
    title: "LangChain repository",
    type: "GITHUB",
    source_domain: "github.com",
    ingested_at: "2026-03-02T08:30:00.000Z",
    last_checked_at: "2026-03-03T19:00:00.000Z",
    summary_short: "Open-source framework for LLM apps with broad integrations and active ecosystem momentum.",
    summary_full: [
      "Useful baseline for agent architecture comparisons.",
      "Great for rapid experiments and connector-heavy flows.",
      "Abstraction can obscure internals during debugging.",
    ],
    usefulness: {
      best_for: ["Agent prototypes", "Provider optionality"],
      pros: ["Large ecosystem", "Community support"],
      cons: ["API churn", "Abstraction overhead"],
      who_should_use: ["Teams shipping quickly"],
      who_should_skip: ["Minimal dependency stacks"],
    },
    tags: ["framework", "agents", "oss"],
    categories: { primary: "AI/ML Frameworks", secondary: ["Open Source", "Developer Tools"] },
    entities: [{ name: "LangChain", type: "PRODUCT", confidence: 0.97 }],
    relevance: {
      score: 79,
      explanation: ["Strong repository activity", "Large adoption footprint"],
      longevity_bucket: "6-12mo",
      staleness_flags: [],
    },
    relevance_history: [
      { at: "2026-02-27T08:30:00.000Z", score: 74 },
      { at: "2026-03-03T19:00:00.000Z", score: 79 },
    ],
    change_log: [],
    user_intent: "Framework benchmark",
    user_notes: "Track release cadence and migration overhead.",
    confidence_notes: ["Type and host strongly match framework category"],
    pinned: false,
    processing_status: "complete",
    archived: false,
  },
  {
    id: "seed-karpathy",
    url: "https://x.com/karpathy/status/example123",
    canonical_url: "https://x.com/karpathy/status/example123",
    title: "Karpathy on agentic workflows",
    type: "SOCIAL_POST",
    source_domain: "x.com",
    ingested_at: "2026-03-03T11:00:00.000Z",
    last_checked_at: "2026-03-03T11:00:00.000Z",
    summary_short: "Directional claim that tool-enabled workflows can outpace single-turn chat use.",
    summary_full: [
      "Useful for strategy context but not implementation specifics.",
      "High social engagement with mixed confidence on timing.",
      "Treat as directional signal, not source-of-truth documentation.",
    ],
    usefulness: {
      best_for: ["Narrative tracking", "Strategy framing"],
      pros: ["Fast sentiment signal", "Large audience reach"],
      cons: ["High noise", "Low verification depth"],
      who_should_use: ["Product strategy teams"],
      who_should_skip: ["Evidence-first implementation planning"],
    },
    tags: ["agents", "strategy", "social"],
    categories: { primary: "AI/ML Strategy", secondary: ["Industry Analysis"] },
    entities: [{ name: "Andrej Karpathy", type: "PERSON", confidence: 0.99 }],
    relevance: {
      score: 73,
      explanation: ["Fresh social context", "Narrative can shift quickly"],
      longevity_bucket: "3-6mo",
      staleness_flags: ["Opinion dynamics may move fast."],
    },
    relevance_history: [{ at: "2026-03-03T11:00:00.000Z", score: 73 }],
    change_log: [],
    user_intent: "Watch macro direction",
    user_notes: "Need corroborating references.",
    confidence_notes: ["Source quality medium due social format"],
    pinned: false,
    processing_status: "complete",
    archived: false,
  },
];

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function unique(list) {
  return Array.from(new Set(list));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function nowIso() {
  return new Date().toISOString();
}

function safeJsonRead(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function safeJsonWrite(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage failures.
  }
}

function hashHue(value) {
  let hash = 0;
  const text = String(value || "");
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 360;
  }
  return hash;
}

function typeMeta(type) {
  return TYPE_META[type] || TYPE_META.OTHER;
}

function confidenceScore(card) {
  const direct = Number(card?.category_pipeline?.final?.confidence ?? card?.category_pipeline?.confidence);
  if (Number.isFinite(direct) && direct > 0) {
    const normalized = direct <= 1 ? direct * 100 : direct;
    return Math.round(clamp(normalized, 35, 99));
  }
  const scoreBase = Number(card?.relevance?.score || 50) * 0.66;
  const entityBoost = Math.min(18, toArray(card?.entities).length * 2.3);
  const detailBoost = Math.min(14, toArray(card?.relevance?.explanation).length * 2.2);
  return Math.round(clamp(scoreBase + entityBoost + detailBoost, 35, 96));
}

function confidenceLabel(score) {
  if (score >= 84) return "High";
  if (score >= 68) return "Medium";
  return "Low";
}

function cardFreshness(card, nowMs) {
  if (String(card.processing_status || "").toLowerCase() !== "complete") {
    return { label: "Analyzing", tone: "warm" };
  }
  const checked = new Date(card.last_checked_at || card.ingested_at || 0).getTime();
  const age = nowMs - checked;
  const flagged = toArray(card?.relevance?.staleness_flags).length > 0;

  if (flagged || age > 7 * DAY_MS) return { label: "Stale", tone: "risk" };
  if (age > 2 * DAY_MS) return { label: "Aging", tone: "muted" };
  return { label: "Fresh", tone: "good" };
}

function scoreTone(score) {
  if (score >= 84) return "strong";
  if (score >= 70) return "steady";
  if (score >= 55) return "mixed";
  return "weak";
}

function prettyTime(ts) {
  const date = new Date(ts);
  if (!Number.isFinite(date.getTime())) return "Pending";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function timeAgo(iso, nowMs) {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return "Unknown";
  const delta = nowMs - ts;
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < DAY_MS) return `${Math.floor(delta / 3_600_000)}h ago`;
  if (delta < WEEK_MS) return `${Math.floor(delta / DAY_MS)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function extractUrls(text) {
  const matches = String(text || "").match(/https?:\/\/[^\s"'<>]+/gi) || [];
  return unique(
    matches
      .map(item => item.trim().replace(/[),.;]+$/, ""))
      .filter(Boolean)
  );
}

function extractDroppedUrls(dataTransfer) {
  const values = [
    dataTransfer.getData("text/uri-list"),
    dataTransfer.getData("text/plain"),
    dataTransfer.getData("text/html"),
  ];
  return unique(values.flatMap(item => extractUrls(item)));
}

function ensureCard(raw) {
  const now = nowIso();
  return {
    id: String(raw?.id || `card-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`),
    url: String(raw?.url || ""),
    canonical_url: String(raw?.canonical_url || raw?.url || ""),
    title: String(raw?.title || "Untitled link"),
    type: String(raw?.type || "OTHER"),
    source_domain: String(raw?.source_domain || "unknown"),
    ingested_at: String(raw?.ingested_at || now),
    last_checked_at: String(raw?.last_checked_at || raw?.ingested_at || now),
    summary_short: String(raw?.summary_short || "No summary yet."),
    summary_full: toArray(raw?.summary_full).map(String).slice(0, 10),
    usefulness: {
      best_for: toArray(raw?.usefulness?.best_for).map(String),
      pros: toArray(raw?.usefulness?.pros).map(String),
      cons: toArray(raw?.usefulness?.cons).map(String),
      who_should_use: toArray(raw?.usefulness?.who_should_use).map(String),
      who_should_skip: toArray(raw?.usefulness?.who_should_skip).map(String),
    },
    tags: unique(toArray(raw?.tags).map(item => String(item).toLowerCase())).slice(0, 20),
    categories: {
      primary: String(raw?.categories?.primary || "General Intelligence"),
      secondary: toArray(raw?.categories?.secondary).map(String).slice(0, 10),
    },
    entities: toArray(raw?.entities)
      .map(item => ({
        name: String(item?.name || "Unknown"),
        type: String(item?.type || "CONCEPT"),
        confidence: Number(item?.confidence || 0.5),
      }))
      .slice(0, 12),
    relevance: {
      score: Number(raw?.relevance?.score || 50),
      explanation: toArray(raw?.relevance?.explanation).map(String).slice(0, 8),
      longevity_bucket: String(raw?.relevance?.longevity_bucket || "3-6mo"),
      staleness_flags: toArray(raw?.relevance?.staleness_flags).map(String).slice(0, 8),
    },
    relevance_history: toArray(raw?.relevance_history)
      .map(item => ({ at: String(item?.at || now), score: Number(item?.score || 50) }))
      .slice(0, 40),
    change_log: toArray(raw?.change_log)
      .map(item => ({
        id: String(item?.id || `event-${Math.random().toString(16).slice(2, 8)}`),
        timestamp: String(item?.timestamp || now),
        severity: String(item?.severity || "LOW"),
        title: String(item?.title || "Update"),
        detail: String(item?.detail || ""),
        category: item?.category ? String(item.category) : undefined,
        card_id: item?.card_id ? String(item.card_id) : undefined,
      }))
      .slice(0, 50),
    confidence_notes: toArray(raw?.confidence_notes).map(String).slice(0, 12),
    user_intent: String(raw?.user_intent || ""),
    user_notes: String(raw?.user_notes || ""),
    pinned: Boolean(raw?.pinned),
    processing_status: String(raw?.processing_status || "complete"),
    category_pipeline: raw?.category_pipeline || null,
    archived: Boolean(raw?.archived),
  };
}

function groupByCategory(cards) {
  const map = new Map();
  for (const card of cards) {
    const key = card?.categories?.primary || "General Intelligence";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(card);
  }
  return map;
}

function layoutWeb(cards, width, height, collapsedCategories) {
  const groups = groupByCategory(cards);
  const categories = Array.from(groups.keys());
  const anchors = {};
  const positions = {};

  const radius = Math.max(220, Math.min(width, height) * 0.34);
  const cx = width / 2;
  const cy = height / 2;

  categories.forEach((category, index) => {
    const angle = (index / Math.max(1, categories.length)) * Math.PI * 2 - Math.PI / 2;
    anchors[category] = {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
      radius: Math.max(180, Math.min(300, 190 + groups.get(category).length * 8)),
    };
  });

  for (const [category, items] of groups.entries()) {
    const anchor = anchors[category];
    const hidden = collapsedCategories.includes(category);
    if (hidden) {
      items.forEach((card, index) => {
        positions[card.id] = {
          x: anchor.x + 8,
          y: anchor.y + index * 6,
        };
      });
      continue;
    }

    const itemCount = Math.max(1, items.length);
    const stepRadius = Math.max(86, Math.min(anchor.radius - 40, 96 + itemCount * 5));

    items.forEach((card, index) => {
      const ring = Math.floor(index / 8);
      const angle = (index / itemCount) * Math.PI * 2;
      const r = stepRadius + ring * 50;
      positions[card.id] = {
        x: anchor.x + Math.cos(angle) * r,
        y: anchor.y + Math.sin(angle) * r,
      };
    });
  }

  return { positions, anchors };
}

function layoutLanes(cards, width, height, collapsedCategories) {
  const groups = Array.from(groupByCategory(cards).entries());
  const anchors = {};
  const positions = {};

  const laneWidth = Math.max(280, width / Math.max(1, groups.length));

  groups.forEach(([category, items], laneIndex) => {
    const laneCenterX = laneWidth * laneIndex + laneWidth / 2;
    anchors[category] = {
      x: laneCenterX,
      y: 116,
      radius: laneWidth * 0.42,
    };

    const hidden = collapsedCategories.includes(category);
    items.forEach((card, index) => {
      positions[card.id] = {
        x: laneCenterX,
        y: hidden ? 188 + index * 6 : 220 + index * 122,
      };
    });
  });

  return {
    positions,
    anchors,
    sceneWidth: Math.max(width, groups.length * 300 + 180),
    sceneHeight: Math.max(height, Math.max(...groups.map(([, items]) => 240 + items.length * 122), 860)),
  };
}

function layoutMatrix(cards, width, height, collapsedCategories) {
  const anchors = {};
  const positions = {};

  const xPad = 180;
  const yPad = 150;
  const innerWidth = Math.max(420, width - xPad * 2);
  const innerHeight = Math.max(340, height - yPad * 2);

  const groups = groupByCategory(cards);
  for (const [category, items] of groups.entries()) {
    const hidden = collapsedCategories.includes(category);
    let stack = 0;

    items.forEach(card => {
      const relevance = clamp(Number(card?.relevance?.score || 50), 0, 100);
      const confidence = clamp(confidenceScore(card), 0, 100);
      const jitterX = hidden ? 0 : ((stack % 3) - 1) * 16;
      const jitterY = hidden ? stack * 5 : (Math.floor(stack / 3) % 3) * 10;

      positions[card.id] = {
        x: xPad + (relevance / 100) * innerWidth + jitterX,
        y: yPad + ((100 - confidence) / 100) * innerHeight + jitterY,
      };
      stack += 1;
    });

    anchors[category] = {
      x: xPad + innerWidth * 0.08,
      y: yPad + innerHeight * 0.12,
      radius: 130,
    };
  }

  return {
    positions,
    anchors,
    axes: {
      xPad,
      yPad,
      innerWidth,
      innerHeight,
    },
  };
}

function getNodeHeight(cardId, collapsedCardIds) {
  return collapsedCardIds.includes(cardId) ? NODE_COLLAPSED_HEIGHT : NODE_BODY_HEIGHT;
}

function computeBounds(cards, positions, collapsedCardIds) {
  const points = cards
    .map(card => {
      const pos = positions[card.id];
      if (!pos) return null;
      const nodeHeight = getNodeHeight(card.id, collapsedCardIds);
      return {
        minX: pos.x - NODE_WIDTH / 2,
        maxX: pos.x + NODE_WIDTH / 2,
        minY: pos.y - nodeHeight / 2,
        maxY: pos.y + nodeHeight / 2,
      };
    })
    .filter(Boolean);

  if (!points.length) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  const minX = Math.min(...points.map(p => p.minX));
  const minY = Math.min(...points.map(p => p.minY));
  const maxX = Math.max(...points.map(p => p.maxX));
  const maxY = Math.max(...points.map(p => p.maxY));

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function compareCards(cards) {
  if (!cards || cards.length < 2) return null;

  const ranked = [...cards].sort((a, b) => Number(b?.relevance?.score || 0) - Number(a?.relevance?.score || 0));
  const lead = ranked[0];
  const tail = ranked[ranked.length - 1];

  return {
    lead,
    tail,
    spread: Number(lead?.relevance?.score || 0) - Number(tail?.relevance?.score || 0),
    sharedPros: unique(cards.flatMap(card => toArray(card?.usefulness?.pros))).slice(0, 8),
    sharedCons: unique(cards.flatMap(card => toArray(card?.usefulness?.cons))).slice(0, 8),
    overlapTags: unique(cards.flatMap(card => toArray(card?.tags))).slice(0, 12),
  };
}

function buildFallbackInsights(cards) {
  const safeCards = cards.map(ensureCard);
  const grouped = Array.from(groupByCategory(safeCards).entries());

  const aggregates = grouped.map(([name, items]) => ({
    category: name,
    cards: items.length,
    avg_relevance: Math.round(
      items.reduce((sum, card) => sum + Number(card?.relevance?.score || 0), 0) / Math.max(1, items.length)
    ),
    avg_confidence: Math.round(
      items.reduce((sum, card) => sum + confidenceScore(card), 0) / Math.max(1, items.length)
    ),
    fresh: items.filter(card => cardFreshness(card, Date.now()).label === "Fresh").length,
  }));

  const coverageGaps = [];
  if (!safeCards.some(card => card.type === "PAPER" || card.type === "PDF")) {
    coverageGaps.push({
      category: "Validation",
      reason: "No research-grade sources found.",
      recommendation: "Add papers or detailed benchmarks for stronger confidence.",
    });
  }
  if (!safeCards.some(card => card.type === "GITHUB" || card.type === "TOOL")) {
    coverageGaps.push({
      category: "Implementation",
      reason: "No practical tools or repos captured.",
      recommendation: "Ingest implementation sources to connect strategy with execution.",
    });
  }

  const radar = safeCards
    .slice()
    .sort((a, b) => new Date(b.last_checked_at).getTime() - new Date(a.last_checked_at).getTime())
    .slice(0, 6)
    .map(card => ({
      id: `fallback-${card.id}`,
      timestamp: card.last_checked_at,
      severity: Number(card?.relevance?.score || 0) < 60 ? "MEDIUM" : "LOW",
      title: `Watch ${card.title}`,
      detail: card.summary_short,
      card_id: card.id,
      category: card?.categories?.primary || "General Intelligence",
    }));

  return {
    generatedAt: nowIso(),
    aggregates,
    coverageGaps,
    radar,
    decision: {
      recommendation: safeCards[0]
        ? {
            card_id: safeCards[0].id,
            title: safeCards[0].title,
            reason: "Highest currently visible relevance score.",
          }
        : null,
      ranking: safeCards
        .slice()
        .sort((a, b) => Number(b?.relevance?.score || 0) - Number(a?.relevance?.score || 0))
        .slice(0, 5)
        .map((card, index) => ({
          rank: index + 1,
          card_id: card.id,
          title: card.title,
          score: Number(card?.relevance?.score || 0),
        })),
      summary: "Fallback insights generated locally.",
    },
  };
}

function sceneSnapshot(cards, manualPositions, collections, selectedIds, collapsedCards, collapsedCategories) {
  return {
    cards,
    manualPositions,
    collections,
    selectedIds,
    collapsedCards,
    collapsedCategories,
  };
}

function normalizeCategory(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return "General Intelligence";
  return trimmed
    .split(" ")
    .filter(Boolean)
    .map((part, index) => {
      if (index && part.length <= 3 && part.toUpperCase() === part) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

function cleanCollectionName(value) {
  const trimmed = String(value || "").trim();
  return trimmed || "Untitled Collection";
}

export default function IngestIOApp() {
  const viewportRef = useRef(null);
  const queueControlRef = useRef({ paused: false, canceled: false });
  const dragNodeRef = useRef(null);
  const dragPanRef = useRef(null);
  const rafRef = useRef(0);
  const pendingDragRef = useRef(null);
  const cardsRef = useRef([]);
  const refreshRef = useRef({ auto: true, intervalMin: 30 });
  const importRef = useRef(null);
  const captureInputRef = useRef(null);

  const [hydrated, setHydrated] = useState(false);
  const [tickNow, setTickNow] = useState(Date.now());

  const [cards, setCards] = useState(SEED_CARDS.map(ensureCard));
  const [manualPositions, setManualPositions] = useState({});
  const [collections, setCollections] = useState({});
  const [savedScenes, setSavedScenes] = useState([]);

  const [activeCardId, setActiveCardId] = useState(SEED_CARDS[0].id);
  const [selectedIds, setSelectedIds] = useState([]);
  const [collapsedCardIds, setCollapsedCardIds] = useState([]);
  const [collapsedCategories, setCollapsedCategories] = useState([]);
  const [history, setHistory] = useState([]);

  const [viewMode, setViewMode] = useState("web");
  const [insightTab, setInsightTab] = useState("overview");

  const [showNavigator, setShowNavigator] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [showCapture, setShowCapture] = useState(true);
  const [captureExpanded, setCaptureExpanded] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [focusMode, setFocusMode] = useState(false);

  const [theme, setTheme] = useState("lumen");
  const [density, setDensity] = useState("airy");
  const [motion, setMotion] = useState("smooth");

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("ALL");
  const [filterCategory, setFilterCategory] = useState("All");
  const [filterFreshness, setFilterFreshness] = useState("ALL");
  const [sortMode, setSortMode] = useState("relevance");
  const [activeCollection, setActiveCollection] = useState("All");

  const [captureText, setCaptureText] = useState("");
  const [captureIntent, setCaptureIntent] = useState("");

  const [queueItems, setQueueItems] = useState([]);
  const [queueRunning, setQueueRunning] = useState(false);
  const [queuePaused, setQueuePaused] = useState(false);

  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [autoLayout, setAutoLayout] = useState(true);
  const [snapGrid, setSnapGrid] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 1400, height: 900 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const [refreshState, setRefreshState] = useState({
    auto: true,
    intervalMin: 30,
    dailyLast: 0,
    weeklyLast: 0,
    lastRun: 0,
  });

  const [decisionInput, setDecisionInput] = useState({
    goal: "",
    speedWeight: 50,
    depthWeight: 50,
    stabilityWeight: 50,
  });

  const [insights, setInsights] = useState(buildFallbackInsights(SEED_CARDS));
  const [compareCache, setCompareCache] = useState(null);
  const [severityFilter, setSeverityFilter] = useState("ALL");

  useEffect(() => {
    setHydrated(true);

    const storedCards = safeJsonRead(STORAGE.cards, null);
    if (Array.isArray(storedCards) && storedCards.length) {
      const hydratedCards = storedCards.map(ensureCard);
      setCards(hydratedCards);
      setActiveCardId(hydratedCards[0]?.id || "");
    }

    const storedManual = safeJsonRead(STORAGE.manual, null);
    if (storedManual && typeof storedManual === "object") {
      setManualPositions(storedManual);
    }

    const storedCollections = safeJsonRead(STORAGE.collections, null);
    if (storedCollections && typeof storedCollections === "object") {
      setCollections(storedCollections);
    }

    const storedScenes = safeJsonRead(STORAGE.scenes, null);
    if (Array.isArray(storedScenes)) {
      setSavedScenes(storedScenes.slice(0, 30));
    }

    const storedCollapsedCards = safeJsonRead(STORAGE.collapsedCards, null);
    if (Array.isArray(storedCollapsedCards)) {
      setCollapsedCardIds(storedCollapsedCards.map(String));
    }

    const storedCollapsedCategories = safeJsonRead(STORAGE.collapsedCategories, null);
    if (Array.isArray(storedCollapsedCategories)) {
      setCollapsedCategories(storedCollapsedCategories.map(String));
    }

    const storedRefresh = safeJsonRead(STORAGE.refresh, null);
    if (storedRefresh && typeof storedRefresh === "object") {
      setRefreshState({
        auto: storedRefresh.auto !== false,
        intervalMin: Number(storedRefresh.intervalMin || 30),
        dailyLast: Number(storedRefresh.dailyLast || 0),
        weeklyLast: Number(storedRefresh.weeklyLast || 0),
        lastRun: Number(storedRefresh.lastRun || 0),
      });
    }

    const storedPrefs = safeJsonRead(STORAGE.prefs, null);
    if (storedPrefs && typeof storedPrefs === "object") {
      const isLatestPreset = Number(storedPrefs.uiPresetVersion || 0) === UI_PRESET_VERSION;
      if (storedPrefs.viewMode) setViewMode(storedPrefs.viewMode);
      if (storedPrefs.insightTab) setInsightTab(storedPrefs.insightTab);
      if (typeof storedPrefs.showNavigator === "boolean" && isLatestPreset) setShowNavigator(storedPrefs.showNavigator);
      if (typeof storedPrefs.showPanel === "boolean" && isLatestPreset) setShowPanel(storedPrefs.showPanel);
      if (typeof storedPrefs.showCapture === "boolean") setShowCapture(storedPrefs.showCapture);
      if (typeof storedPrefs.captureExpanded === "boolean" && isLatestPreset) setCaptureExpanded(storedPrefs.captureExpanded);
      if (typeof storedPrefs.showAdvanced === "boolean" && isLatestPreset) setShowAdvanced(storedPrefs.showAdvanced);
      if (typeof storedPrefs.focusMode === "boolean") setFocusMode(storedPrefs.focusMode);
      if (typeof storedPrefs.theme === "string") setTheme(storedPrefs.theme);
      if (typeof storedPrefs.density === "string") setDensity(storedPrefs.density);
      if (typeof storedPrefs.motion === "string") setMotion(storedPrefs.motion);
      if (typeof storedPrefs.search === "string") setSearch(storedPrefs.search);
      if (typeof storedPrefs.filterType === "string") setFilterType(storedPrefs.filterType);
      if (typeof storedPrefs.filterCategory === "string") setFilterCategory(storedPrefs.filterCategory);
      if (typeof storedPrefs.filterFreshness === "string") setFilterFreshness(storedPrefs.filterFreshness);
      if (typeof storedPrefs.sortMode === "string") setSortMode(storedPrefs.sortMode);
      if (typeof storedPrefs.activeCollection === "string") setActiveCollection(storedPrefs.activeCollection);
      if (typeof storedPrefs.zoom === "number") setZoom(clamp(storedPrefs.zoom, 0.3, 2.8));
      if (storedPrefs.pan && typeof storedPrefs.pan === "object") {
        setPan({
          x: Number(storedPrefs.pan.x || 0),
          y: Number(storedPrefs.pan.y || 0),
        });
      }
      if (typeof storedPrefs.autoLayout === "boolean") setAutoLayout(storedPrefs.autoLayout);
      if (typeof storedPrefs.snapGrid === "boolean") setSnapGrid(storedPrefs.snapGrid);
      if (typeof storedPrefs.captureIntent === "string") setCaptureIntent(storedPrefs.captureIntent);
      if (storedPrefs.decisionInput && typeof storedPrefs.decisionInput === "object") {
        setDecisionInput({
          goal: String(storedPrefs.decisionInput.goal || ""),
          speedWeight: Number(storedPrefs.decisionInput.speedWeight || 50),
          depthWeight: Number(storedPrefs.decisionInput.depthWeight || 50),
          stabilityWeight: Number(storedPrefs.decisionInput.stabilityWeight || 50),
        });
      }
    }
  }, []);

  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  useEffect(() => {
    refreshRef.current = {
      auto: refreshState.auto,
      intervalMin: refreshState.intervalMin,
    };
  }, [refreshState.auto, refreshState.intervalMin]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTickNow(Date.now());
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => safeJsonWrite(STORAGE.cards, cards.slice(0, 600)), 160);
    return () => window.clearTimeout(t);
  }, [cards]);

  useEffect(() => {
    const t = window.setTimeout(() => safeJsonWrite(STORAGE.manual, manualPositions), 160);
    return () => window.clearTimeout(t);
  }, [manualPositions]);

  useEffect(() => {
    const t = window.setTimeout(() => safeJsonWrite(STORAGE.collections, collections), 220);
    return () => window.clearTimeout(t);
  }, [collections]);

  useEffect(() => {
    const t = window.setTimeout(() => safeJsonWrite(STORAGE.scenes, savedScenes.slice(0, 30)), 220);
    return () => window.clearTimeout(t);
  }, [savedScenes]);

  useEffect(() => {
    const t = window.setTimeout(() => safeJsonWrite(STORAGE.collapsedCards, collapsedCardIds), 180);
    return () => window.clearTimeout(t);
  }, [collapsedCardIds]);

  useEffect(() => {
    const t = window.setTimeout(() => safeJsonWrite(STORAGE.collapsedCategories, collapsedCategories), 180);
    return () => window.clearTimeout(t);
  }, [collapsedCategories]);

  useEffect(() => {
    const t = window.setTimeout(() => safeJsonWrite(STORAGE.refresh, refreshState), 220);
    return () => window.clearTimeout(t);
  }, [refreshState]);

  useEffect(() => {
    const t = window.setTimeout(
      () =>
        safeJsonWrite(STORAGE.prefs, {
          uiPresetVersion: UI_PRESET_VERSION,
          viewMode,
          insightTab,
          showNavigator,
          showPanel,
          showCapture,
          captureExpanded,
          showAdvanced,
          focusMode,
          theme,
          density,
          motion,
          search,
          filterType,
          filterCategory,
          filterFreshness,
          sortMode,
          activeCollection,
          zoom,
          pan,
          autoLayout,
          snapGrid,
          captureIntent,
          decisionInput,
        }),
      180
    );
    return () => window.clearTimeout(t);
  }, [
    viewMode,
    insightTab,
    showNavigator,
    showPanel,
    showCapture,
    captureExpanded,
    showAdvanced,
    focusMode,
    theme,
    density,
    motion,
    search,
    filterType,
    filterCategory,
    filterFreshness,
    sortMode,
    activeCollection,
    zoom,
    pan,
    autoLayout,
    snapGrid,
    captureIntent,
    decisionInput,
  ]);

  const categories = useMemo(() => {
    const list = unique(cards.filter(card => !card.archived).map(card => card?.categories?.primary || "General Intelligence"));
    return ["All", ...list.sort((a, b) => a.localeCompare(b))];
  }, [cards]);

  const collectionOptions = useMemo(() => {
    return ["All", ...Object.keys(collections).sort((a, b) => a.localeCompare(b))];
  }, [collections]);

  const typeOptions = useMemo(() => {
    return ["ALL", ...unique(cards.filter(card => !card.archived).map(card => card.type || "OTHER"))];
  }, [cards]);

  const visibleCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    let next = cards.filter(card => !card.archived);

    if (activeCollection !== "All") {
      const ids = new Set(toArray(collections[activeCollection]).map(String));
      next = next.filter(card => ids.has(card.id));
    }

    if (filterType !== "ALL") {
      next = next.filter(card => card.type === filterType);
    }

    if (filterCategory !== "All") {
      next = next.filter(card => card?.categories?.primary === filterCategory);
    }

    if (filterFreshness !== "ALL") {
      next = next.filter(card => cardFreshness(card, tickNow).label === filterFreshness);
    }

    if (q) {
      next = next.filter(card => {
        const hay = [
          card.title,
          card.summary_short,
          card.user_intent,
          card.user_notes,
          card?.categories?.primary,
          ...(card.tags || []),
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    next.sort((a, b) => {
      if (sortMode === "newest") {
        return new Date(b.ingested_at).getTime() - new Date(a.ingested_at).getTime();
      }
      if (sortMode === "alpha") {
        return String(a.title).localeCompare(String(b.title));
      }
      if (sortMode === "freshness") {
        return new Date(b.last_checked_at).getTime() - new Date(a.last_checked_at).getTime();
      }
      if (sortMode === "confidence") {
        return confidenceScore(b) - confidenceScore(a);
      }
      return Number(b?.relevance?.score || 0) - Number(a?.relevance?.score || 0);
    });

    return next;
  }, [
    cards,
    search,
    filterType,
    filterCategory,
    filterFreshness,
    sortMode,
    activeCollection,
    collections,
    tickNow,
  ]);

  const boardCards = useMemo(() => visibleCards.slice(0, 260), [visibleCards]);

  const activeCard = useMemo(() => cards.find(card => card.id === activeCardId) || null, [cards, activeCardId]);

  const selectedCards = useMemo(() => {
    return cards.filter(card => selectedIds.includes(card.id));
  }, [cards, selectedIds]);

  const categoryDigest = useMemo(() => {
    return Array.from(groupByCategory(visibleCards).entries())
      .map(([name, items]) => ({
        name,
        count: items.length,
        avgRelevance: Math.round(
          items.reduce((sum, item) => sum + Number(item?.relevance?.score || 0), 0) / Math.max(1, items.length)
        ),
        avgConfidence: Math.round(
          items.reduce((sum, item) => sum + confidenceScore(item), 0) / Math.max(1, items.length)
        ),
        fresh: items.filter(item => cardFreshness(item, tickNow).label === "Fresh").length,
      }))
      .sort((a, b) => b.count - a.count || b.avgRelevance - a.avgRelevance);
  }, [visibleCards, tickNow]);

  const summaryStats = useMemo(() => {
    const active = visibleCards.length;
    const avgRelevance = active
      ? Math.round(visibleCards.reduce((sum, card) => sum + Number(card?.relevance?.score || 0), 0) / active)
      : 0;
    const avgConfidence = active
      ? Math.round(visibleCards.reduce((sum, card) => sum + confidenceScore(card), 0) / active)
      : 0;
    const stale = visibleCards.filter(card => cardFreshness(card, tickNow).label === "Stale").length;
    const pinned = visibleCards.filter(card => card.pinned).length;

    const duplicateMap = new Map();
    for (const card of visibleCards) {
      const key = card.canonical_url || card.url;
      duplicateMap.set(key, (duplicateMap.get(key) || 0) + 1);
    }
    const duplicates = Array.from(duplicateMap.values()).reduce((sum, count) => sum + (count > 1 ? count - 1 : 0), 0);

    return { active, avgRelevance, avgConfidence, stale, pinned, duplicates };
  }, [visibleCards, tickNow]);

  const layout = useMemo(() => {
    if (viewMode === "lanes") return layoutLanes(boardCards, canvasSize.width, canvasSize.height, collapsedCategories);
    if (viewMode === "matrix") return layoutMatrix(boardCards, canvasSize.width, canvasSize.height, collapsedCategories);
    return layoutWeb(boardCards, canvasSize.width, canvasSize.height, collapsedCategories);
  }, [boardCards, canvasSize.width, canvasSize.height, viewMode, collapsedCategories]);

  const positions = useMemo(() => {
    if (!autoLayout) {
      return { ...layout.positions, ...manualPositions };
    }
    return layout.positions;
  }, [layout.positions, autoLayout, manualPositions]);

  const compareData = useMemo(() => {
    return compareCache || compareCards(selectedCards);
  }, [compareCache, selectedCards]);

  const timelineEvents = useMemo(() => {
    const events = [];
    const cardMap = new Map(cards.map(card => [card.id, card]));

    for (const card of cards) {
      events.push({
        id: `ingested-${card.id}`,
        timestamp: card.ingested_at,
        severity: "LOW",
        source: "Ingest",
        title: `Added ${card.title}`,
        detail: card.summary_short,
        category: card?.categories?.primary || "General Intelligence",
        card_id: card.id,
      });

      toArray(card.change_log).forEach(event => {
        events.push({
          id: `card-${card.id}-${event.id}`,
          timestamp: event.timestamp,
          severity: event.severity || "LOW",
          source: "Card",
          title: event.title || "Card update",
          detail: event.detail || "",
          category: event.category || card?.categories?.primary || "General Intelligence",
          card_id: card.id,
        });
      });
    }

    toArray(insights.radar).forEach(event => {
      const related = event.card_id ? cardMap.get(String(event.card_id)) : null;
      events.push({
        id: `radar-${event.id}`,
        timestamp: event.timestamp,
        severity: event.severity || "LOW",
        source: "Radar",
        title: event.title || "Radar event",
        detail: event.detail || "",
        category: event.category || related?.categories?.primary || "General Intelligence",
        card_id: event.card_id ? String(event.card_id) : undefined,
      });
    });

    let sorted = events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 180);
    if (severityFilter !== "ALL") {
      sorted = sorted.filter(item => item.severity === severityFilter);
    }
    return sorted;
  }, [cards, insights.radar, severityFilter]);

  const categoryForInsight = useMemo(() => {
    if (filterCategory !== "All") return filterCategory;
    if (activeCard?.categories?.primary) return activeCard.categories.primary;
    return categoryDigest[0]?.name || "General Intelligence";
  }, [filterCategory, activeCard, categoryDigest]);

  const categoryInsight = useMemo(() => {
    const target = categoryForInsight;
    const items = visibleCards.filter(card => (card?.categories?.primary || "General Intelligence") === target);
    if (!items.length) {
      return {
        name: target,
        count: 0,
        avgRelevance: 0,
        avgConfidence: 0,
        topTags: [],
        topEntities: [],
        stale: 0,
      };
    }

    const tagCounts = new Map();
    const entityCounts = new Map();

    items.forEach(card => {
      toArray(card.tags).forEach(tag => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
      toArray(card.entities).forEach(entity => {
        const key = entity?.name || "Unknown";
        entityCounts.set(key, (entityCounts.get(key) || 0) + 1);
      });
    });

    return {
      name: target,
      count: items.length,
      avgRelevance: Math.round(items.reduce((sum, card) => sum + Number(card?.relevance?.score || 0), 0) / items.length),
      avgConfidence: Math.round(items.reduce((sum, card) => sum + confidenceScore(card), 0) / items.length),
      topTags: Array.from(tagCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8),
      topEntities: Array.from(entityCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8),
      stale: items.filter(card => cardFreshness(card, tickNow).label === "Stale").length,
    };
  }, [visibleCards, categoryForInsight, tickNow]);

  const isSpatialView = viewMode === "web" || viewMode === "lanes" || viewMode === "matrix";

  const miniMapData = useMemo(() => {
    if (!isSpatialView || !boardCards.length) return [];
    const bounds = computeBounds(boardCards, positions, collapsedCardIds);
    const width = Math.max(1, bounds.width);
    const height = Math.max(1, bounds.height);

    return boardCards
      .map(card => {
        const pos = positions[card.id];
        if (!pos) return null;
        return {
          id: card.id,
          x: (pos.x - bounds.minX) / width,
          y: (pos.y - bounds.minY) / height,
          selected: selectedIds.includes(card.id),
        };
      })
      .filter(Boolean);
  }, [isSpatialView, boardCards, positions, collapsedCardIds, selectedIds]);

  const pushHistory = useCallback(() => {
    setHistory(prev => {
      const snapshot = sceneSnapshot(
        cards.map(card => ({ ...card })),
        { ...manualPositions },
        JSON.parse(JSON.stringify(collections || {})),
        [...selectedIds],
        [...collapsedCardIds],
        [...collapsedCategories]
      );
      return [snapshot, ...prev].slice(0, 25);
    });
  }, [cards, manualPositions, collections, selectedIds, collapsedCardIds, collapsedCategories]);

  const undoLast = useCallback(() => {
    setHistory(prev => {
      const [first, ...rest] = prev;
      if (!first) return prev;
      setCards(first.cards.map(ensureCard));
      setManualPositions(first.manualPositions || {});
      setCollections(first.collections || {});
      setSelectedIds(first.selectedIds || []);
      setCollapsedCardIds(first.collapsedCards || []);
      setCollapsedCategories(first.collapsedCategories || []);
      setStatusMessage("Undid last change.");
      window.setTimeout(() => setStatusMessage(""), 1500);
      return rest;
    });
  }, []);

  const markStatus = useCallback(message => {
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(""), 2200);
  }, []);

  const refreshInsights = useCallback(
    async currentCards => {
      const payloadCards = (currentCards || cardsRef.current || []).filter(card => !card.archived).map(ensureCard);
      if (!payloadCards.length) {
        setInsights(buildFallbackInsights([]));
        return;
      }

      try {
        const response = await fetch("/api/ingest-io/insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cards: payloadCards,
            decision: {
              goal: String(decisionInput.goal || "").slice(0, 300),
              budget: decisionInput.speedWeight > decisionInput.depthWeight ? "medium" : "high",
              stack: "",
              priority: decisionInput.stabilityWeight > 56 ? "stability" : decisionInput.depthWeight > 56 ? "depth" : "speed",
            },
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || "Insights request failed.");
        }
        setInsights(payload);
      } catch {
        setInsights(buildFallbackInsights(payloadCards));
      }
    },
    [decisionInput]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshInsights(cards);
    }, 260);
    return () => window.clearTimeout(timer);
  }, [cards, decisionInput, refreshInsights]);

  useEffect(() => {
    const onKeyDown = event => {
      const key = String(event.key || "").toLowerCase();

      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        setShowCapture(true);
        window.requestAnimationFrame(() => captureInputRef.current?.focus());
      }

      if ((event.metaKey || event.ctrlKey) && key === "z") {
        event.preventDefault();
        undoLast();
      }

      if ((event.metaKey || event.ctrlKey) && key === "0") {
        event.preventDefault();
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }

      if ((event.metaKey || event.ctrlKey) && key === "=") {
        event.preventDefault();
        setZoom(prev => clamp(prev + 0.08, 0.3, 2.8));
      }

      if ((event.metaKey || event.ctrlKey) && key === "-") {
        event.preventDefault();
        setZoom(prev => clamp(prev - 0.08, 0.3, 2.8));
      }

      if ((event.metaKey || event.ctrlKey) && key === "1") {
        event.preventDefault();
        setViewMode("web");
      }
      if ((event.metaKey || event.ctrlKey) && key === "2") {
        event.preventDefault();
        setViewMode("lanes");
      }
      if ((event.metaKey || event.ctrlKey) && key === "3") {
        event.preventDefault();
        setViewMode("matrix");
      }
      if ((event.metaKey || event.ctrlKey) && key === "4") {
        event.preventDefault();
        setViewMode("list");
      }
      if ((event.metaKey || event.ctrlKey) && key === "5") {
        event.preventDefault();
        setViewMode("timeline");
      }

      if (event.key === "Escape") {
        queueControlRef.current.paused = false;
        setQueuePaused(false);
        dragNodeRef.current = null;
        dragPanRef.current = null;
        setDropActive(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undoLast]);

  useEffect(() => {
    if (!viewportRef.current) return;
    const updateSize = () => {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      setCanvasSize({
        width: Math.max(900, rect.width),
        height: Math.max(560, rect.height),
      });
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, [viewMode, showPanel, showNavigator, focusMode]);

  useEffect(() => {
    const ids = new Set(cards.map(card => card.id));
    setSelectedIds(prev => prev.filter(id => ids.has(id)));
    setCollapsedCardIds(prev => prev.filter(id => ids.has(id)));
    if (activeCardId && !ids.has(activeCardId)) {
      setActiveCardId(cards[0]?.id || "");
    }
  }, [cards, activeCardId]);

  const ingestOne = useCallback(
    async (url, intent = "", dropPos = null, options = {}) => {
      const { silent = false } = options;

      let normalized;
      try {
        normalized = new URL(String(url || "").trim()).toString();
      } catch {
        return { ok: false, error: "Invalid URL" };
      }

      if (!silent) {
        setIsSubmitting(true);
        setError("");
        setStatusMessage("Analyzing link...");
      }

      try {
        const response = await fetch("/api/ingest-io", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: normalized,
            intent: String(intent || "").slice(0, 220),
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.card) {
          throw new Error(payload?.error || "Ingestion failed.");
        }

        const incoming = ensureCard(payload.card);
        pushHistory();

        setCards(prev => {
          const next = [incoming, ...prev.filter(card => card.id !== incoming.id && card.canonical_url !== incoming.canonical_url)];
          return next.map(ensureCard);
        });

        if (dropPos) {
          setManualPositions(prev => ({ ...prev, [incoming.id]: dropPos }));
          setAutoLayout(false);
        }

        setActiveCardId(incoming.id);
        setInsightTab("card");
        setSelectedIds([incoming.id]);

        if (!silent) {
          markStatus("Mapped into workspace.");
        }

        return { ok: true, card: incoming };
      } catch (ingestError) {
        const message = ingestError?.message || "Ingestion failed.";
        if (!silent) {
          setError(message);
          setStatusMessage("");
        }
        return { ok: false, error: message };
      } finally {
        if (!silent) {
          setIsSubmitting(false);
        }
      }
    },
    [markStatus, pushHistory]
  );

  const runQueue = useCallback(
    async items => {
      if (!items.length) return;
      queueControlRef.current.paused = false;
      queueControlRef.current.canceled = false;
      setQueueRunning(true);
      setQueuePaused(false);
      setIsSubmitting(true);
      setError("");

      const queue = items.map(item => ({
        id: item.id,
        url: item.url,
        status: "queued",
        error: "",
      }));
      let results = queue;
      setQueueItems(results);
      setStatusMessage(`Queue started (${queue.length}).`);

      for (const item of queue) {
        if (queueControlRef.current.canceled) break;

        while (queueControlRef.current.paused && !queueControlRef.current.canceled) {
          await new Promise(resolve => window.setTimeout(resolve, 140));
        }

        if (queueControlRef.current.canceled) break;

        results = results.map(entry => (entry.id === item.id ? { ...entry, status: "running" } : entry));
        setQueueItems(results);

        const result = await ingestOne(item.url, captureIntent, null, { silent: true });
        if (result.ok) {
          results = results.map(entry => (entry.id === item.id ? { ...entry, status: "done" } : entry));
          setQueueItems(results);
        } else {
          results = results.map(entry =>
            entry.id === item.id ? { ...entry, status: "failed", error: result.error || "Failed" } : entry
          );
          setQueueItems(results);
        }
      }

      setQueueRunning(false);
      setIsSubmitting(false);

      if (queueControlRef.current.canceled) {
        markStatus("Queue canceled.");
      } else {
        const failed = results.filter(item => item.status === "failed").length;
        if (failed) {
          markStatus(`Queue done with ${failed} failed item${failed > 1 ? "s" : ""}.`);
        } else {
          markStatus("Queue complete.");
        }
      }
    },
    [captureIntent, ingestOne, markStatus]
  );

  const runCapture = useCallback(async () => {
    const urls = extractUrls(captureText);
    if (!urls.length) {
      setError("Paste at least one valid URL.");
      return;
    }

    const known = new Set(cardsRef.current.map(card => card.canonical_url || card.url));
    const deduped = urls.filter(url => !known.has(url));
    if (!deduped.length) {
      markStatus("All links are already in the workspace.");
      return;
    }

    const queue = deduped.map((url, index) => ({
      id: `q-${Date.now()}-${index}`,
      url,
    }));

    await runQueue(queue);
  }, [captureText, markStatus, runQueue]);

  const pauseResumeQueue = () => {
    if (!queueRunning) return;
    queueControlRef.current.paused = !queueControlRef.current.paused;
    setQueuePaused(queueControlRef.current.paused);
    markStatus(queueControlRef.current.paused ? "Queue paused." : "Queue resumed.");
  };

  const cancelQueue = () => {
    if (!queueRunning) return;
    queueControlRef.current.canceled = true;
    queueControlRef.current.paused = false;
    setQueuePaused(false);
  };

  const retryFailedQueue = async () => {
    const failed = queueItems.filter(item => item.status === "failed");
    if (!failed.length) {
      markStatus("No failed items to retry.");
      return;
    }

    await runQueue(
      failed.map((item, index) => ({
        id: `retry-${Date.now()}-${index}`,
        url: item.url,
      }))
    );
  };

  const addDemoLinks = () => {
    setCaptureText(prev => {
      const base = prev.trim();
      return base ? `${base}\n${DEMO_LINKS.join("\n")}` : DEMO_LINKS.join("\n");
    });
    setShowCapture(true);
    window.requestAnimationFrame(() => captureInputRef.current?.focus());
  };

  const pasteClipboard = async () => {
    try {
      if (!navigator?.clipboard?.readText) throw new Error("Clipboard unavailable");
      const text = await navigator.clipboard.readText();
      if (!String(text || "").trim()) {
        setError("Clipboard is empty.");
        return;
      }
      setCaptureText(prev => (prev.trim() ? `${prev.trim()}\n${text}` : text));
      setShowCapture(true);
      setError("");
      window.requestAnimationFrame(() => captureInputRef.current?.focus());
    } catch {
      setError("Clipboard permission blocked. Paste manually.");
    }
  };

  const runRefresh = useCallback(
    async (mode = "daily", targetIds = []) => {
      const source = cardsRef.current.filter(card => !card.archived);
      const target = Array.isArray(targetIds) && targetIds.length
        ? source.filter(card => targetIds.includes(card.id))
        : source;

      if (!target.length) {
        markStatus("No cards available for refresh.");
        return;
      }

      try {
        setError("");
        setStatusMessage(mode === "weekly" ? "Running weekly refresh..." : "Running daily refresh...");

        const response = await fetch("/api/ingest-io/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            cards: target.map(ensureCard),
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(payload?.cards)) {
          throw new Error(payload?.error || "Refresh request failed.");
        }

        const map = new Map(payload.cards.map(item => [item.id, ensureCard(item)]));
        pushHistory();
        setCards(prev => prev.map(card => map.get(card.id) || card));

        const now = Date.now();
        setRefreshState(prev => ({
          ...prev,
          lastRun: now,
          dailyLast: mode === "daily" ? now : prev.dailyLast,
          weeklyLast: mode === "weekly" ? now : prev.weeklyLast,
        }));

        if (Array.isArray(payload.events) && payload.events.length) {
          setInsights(prev => ({
            ...prev,
            radar: [...payload.events, ...toArray(prev.radar)].slice(0, 200),
          }));
        }

        markStatus(mode === "weekly" ? "Weekly refresh complete." : "Daily refresh complete.");
      } catch (refreshError) {
        setError(refreshError?.message || "Refresh request failed.");
        setStatusMessage("");
      }
    },
    [markStatus, pushHistory]
  );

  useEffect(() => {
    if (!refreshState.auto) return;

    const timer = window.setInterval(() => {
      const cfg = refreshRef.current;
      if (!cfg.auto) return;
      void runRefresh("daily", []);
    }, Math.max(1, refreshState.intervalMin) * 60_000);

    return () => window.clearInterval(timer);
  }, [refreshState.auto, refreshState.intervalMin, runRefresh]);

  useEffect(() => {
    if (refreshState.dailyLast || refreshState.weeklyLast) return;
    const now = Date.now();
    setRefreshState(prev => ({ ...prev, dailyLast: now, weeklyLast: now }));
  }, [refreshState.dailyLast, refreshState.weeklyLast]);

  const queueProgress = useMemo(() => {
    if (!queueItems.length) return 0;
    const done = queueItems.filter(item => item.status === "done").length;
    return Math.round((done / queueItems.length) * 100);
  }, [queueItems]);

  const toggleSelected = (cardId, event) => {
    const multi = event?.metaKey || event?.ctrlKey || event?.shiftKey;
    if (multi) {
      setSelectedIds(prev => (prev.includes(cardId) ? prev.filter(id => id !== cardId) : [...prev, cardId]));
    } else {
      setSelectedIds([cardId]);
      setActiveCardId(cardId);
    }
    setInsightTab("card");
  };

  const selectCategoryCards = category => {
    const ids = visibleCards
      .filter(card => (card?.categories?.primary || "General Intelligence") === category)
      .map(card => card.id);
    setSelectedIds(ids);
    if (ids[0]) setActiveCardId(ids[0]);
    setInsightTab("category");
  };

  const clearSelection = () => {
    setSelectedIds([]);
    setCompareCache(null);
  };

  const toggleCardCollapse = cardId => {
    setCollapsedCardIds(prev => (prev.includes(cardId) ? prev.filter(id => id !== cardId) : [...prev, cardId]));
  };

  const collapseAllCards = () => {
    setCollapsedCardIds(visibleCards.map(card => card.id));
  };

  const expandAllCards = () => {
    setCollapsedCardIds([]);
  };

  const toggleCategoryCollapse = category => {
    setCollapsedCategories(prev => (prev.includes(category) ? prev.filter(item => item !== category) : [...prev, category]));
  };

  const recategorizeCard = (cardId, nextCategory) => {
    pushHistory();
    const normalized = normalizeCategory(nextCategory);
    setCards(prev =>
      prev.map(card => {
        if (card.id !== cardId) return card;
        return ensureCard({
          ...card,
          categories: {
            primary: normalized,
            secondary: unique([...(card?.categories?.secondary || []), card?.categories?.primary || ""])
              .filter(Boolean)
              .slice(0, 8),
          },
          last_checked_at: nowIso(),
        });
      })
    );
    markStatus(`Moved to ${normalized}.`);
  };

  const updateCardNotes = (cardId, notes) => {
    setCards(prev => prev.map(card => (card.id === cardId ? ensureCard({ ...card, user_notes: notes }) : card)));
  };

  const togglePin = cardId => {
    pushHistory();
    setCards(prev => prev.map(card => (card.id === cardId ? ensureCard({ ...card, pinned: !card.pinned }) : card)));
  };

  const archiveSelected = () => {
    if (!selectedIds.length) {
      markStatus("No selected cards to archive.");
      return;
    }
    pushHistory();
    const selected = new Set(selectedIds);
    setCards(prev => prev.map(card => (selected.has(card.id) ? ensureCard({ ...card, archived: true }) : card)));
    setSelectedIds([]);
    markStatus("Archived selected cards.");
  };

  const clearArchived = () => {
    pushHistory();
    setCards(prev => prev.map(card => ensureCard({ ...card, archived: false })));
    markStatus("Restored all archived cards.");
  };

  const createCollection = () => {
    const name = window.prompt("Collection name", `Collection ${Object.keys(collections).length + 1}`);
    if (!name) return;
    const key = cleanCollectionName(name);
    if (collections[key]) {
      setError("Collection already exists.");
      return;
    }
    setCollections(prev => ({ ...prev, [key]: [] }));
    setActiveCollection(key);
  };

  const deleteCollection = name => {
    if (!name || name === "All") return;
    pushHistory();
    setCollections(prev => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    setActiveCollection("All");
  };

  const addSelectedToCollection = name => {
    if (!name || name === "All" || !selectedIds.length) return;
    pushHistory();
    setCollections(prev => {
      const current = toArray(prev[name]).map(String);
      const next = unique([...current, ...selectedIds]);
      return {
        ...prev,
        [name]: next,
      };
    });
    markStatus(`Added ${selectedIds.length} to ${name}.`);
  };

  const removeSelectedFromCollection = name => {
    if (!name || name === "All" || !selectedIds.length) return;
    pushHistory();
    const remove = new Set(selectedIds);
    setCollections(prev => ({
      ...prev,
      [name]: toArray(prev[name]).filter(id => !remove.has(String(id))),
    }));
    markStatus(`Removed selection from ${name}.`);
  };

  const saveScene = () => {
    const name = window.prompt("Save current scene", `Scene ${savedScenes.length + 1}`);
    if (!name) return;

    const scene = {
      id: `scene-${Date.now().toString(16)}`,
      name: name.trim(),
      config: {
        viewMode,
        insightTab,
        filterType,
        filterCategory,
        filterFreshness,
        sortMode,
        activeCollection,
        zoom,
        pan,
        autoLayout,
        snapGrid,
        showNavigator,
        showPanel,
        theme,
        density,
        motion,
      },
    };

    setSavedScenes(prev => [scene, ...prev].slice(0, 30));
    markStatus("Scene saved.");
  };

  const applyScene = scene => {
    if (!scene?.config) return;
    const cfg = scene.config;
    setViewMode(cfg.viewMode || "web");
    setInsightTab(cfg.insightTab || "overview");
    setFilterType(cfg.filterType || "ALL");
    setFilterCategory(cfg.filterCategory || "All");
    setFilterFreshness(cfg.filterFreshness || "ALL");
    setSortMode(cfg.sortMode || "relevance");
    setActiveCollection(cfg.activeCollection || "All");
    setZoom(clamp(Number(cfg.zoom || 1), 0.3, 2.8));
    setPan({ x: Number(cfg?.pan?.x || 0), y: Number(cfg?.pan?.y || 0) });
    setAutoLayout(cfg.autoLayout !== false);
    setSnapGrid(Boolean(cfg.snapGrid));
    setShowNavigator(cfg.showNavigator !== false);
    setShowPanel(cfg.showPanel !== false);
    setTheme(cfg.theme || "lumen");
    setDensity(cfg.density || "airy");
    setMotion(cfg.motion || "smooth");
    markStatus(`Loaded ${scene.name}.`);
  };

  const deleteScene = sceneId => {
    setSavedScenes(prev => prev.filter(scene => scene.id !== sceneId));
  };

  const exportWorkspace = () => {
    const payload = {
      exportedAt: nowIso(),
      cards,
      manualPositions,
      collections,
      savedScenes,
      collapsedCardIds,
      collapsedCategories,
      refreshState,
      preferences: {
        viewMode,
        insightTab,
        filterType,
        filterCategory,
        filterFreshness,
        sortMode,
        activeCollection,
        zoom,
        pan,
        autoLayout,
        snapGrid,
      },
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ingest-workspace-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    markStatus("Workspace exported.");
  };

  const importWorkspace = async event => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const payload = JSON.parse(content);
      pushHistory();

      if (Array.isArray(payload.cards) && payload.cards.length) {
        setCards(payload.cards.map(ensureCard));
      }
      if (payload.manualPositions && typeof payload.manualPositions === "object") {
        setManualPositions(payload.manualPositions);
      }
      if (payload.collections && typeof payload.collections === "object") {
        setCollections(payload.collections);
      }
      if (Array.isArray(payload.savedScenes)) {
        setSavedScenes(payload.savedScenes.slice(0, 30));
      }
      if (Array.isArray(payload.collapsedCardIds)) {
        setCollapsedCardIds(payload.collapsedCardIds.map(String));
      }
      if (Array.isArray(payload.collapsedCategories)) {
        setCollapsedCategories(payload.collapsedCategories.map(String));
      }

      markStatus("Workspace imported.");
      setError("");
    } catch {
      setError("Import failed. Use a valid workspace JSON file.");
    } finally {
      if (event.target) event.target.value = "";
    }
  };

  const openImportPicker = () => {
    importRef.current?.click();
  };

  const handleWheel = event => {
    if (!isSpatialView) return;
    event.preventDefault();

    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;

    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;

    const worldX = (px - pan.x) / zoom;
    const worldY = (py - pan.y) / zoom;

    const nextZoom = clamp(zoom * (event.deltaY > 0 ? 0.92 : 1.08), 0.3, 2.8);
    const nextPan = {
      x: px - worldX * nextZoom,
      y: py - worldY * nextZoom,
    };

    setZoom(nextZoom);
    setPan(nextPan);
  };

  const adjustZoom = delta => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) {
      setZoom(prev => clamp(prev + delta, 0.3, 2.8));
      return;
    }

    const px = rect.width / 2;
    const py = rect.height / 2;
    const worldX = (px - pan.x) / zoom;
    const worldY = (py - pan.y) / zoom;

    const nextZoom = clamp(zoom + delta, 0.3, 2.8);
    setZoom(nextZoom);
    setPan({ x: px - worldX * nextZoom, y: py - worldY * nextZoom });
  };

  const resetViewport = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const fitToContent = () => {
    if (!boardCards.length || !viewportRef.current) return;

    const viewport = viewportRef.current.getBoundingClientRect();
    const bounds = computeBounds(boardCards, positions, collapsedCardIds);
    if (!bounds.width || !bounds.height) return;

    const availableWidth = Math.max(320, viewport.width - 140);
    const availableHeight = Math.max(260, viewport.height - 140);

    const targetZoom = clamp(
      Math.min(availableWidth / bounds.width, availableHeight / bounds.height),
      0.3,
      2.4
    );

    const targetPan = {
      x: viewport.width / 2 - (bounds.minX + bounds.width / 2) * targetZoom,
      y: viewport.height / 2 - (bounds.minY + bounds.height / 2) * targetZoom,
    };

    setZoom(targetZoom);
    setPan(targetPan);
  };

  const centerOnCard = cardId => {
    if (!isSpatialView || !viewportRef.current) return;
    const pos = positions[cardId];
    if (!pos) return;

    const rect = viewportRef.current.getBoundingClientRect();
    setPan({
      x: rect.width / 2 - pos.x * zoom,
      y: rect.height / 2 - pos.y * zoom,
    });
  };

  const beginNodeDrag = (event, cardId) => {
    if (!isSpatialView || event.button !== 0) return;
    if (event.target.closest("button") || event.target.closest("a") || event.target.closest("select") || event.target.closest("textarea") || event.target.closest("input")) {
      return;
    }

    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;

    const start = positions[cardId] || layout.positions[cardId];
    if (!start) return;

    dragNodeRef.current = {
      cardId,
      offsetX: (event.clientX - rect.left - pan.x) / zoom - start.x,
      offsetY: (event.clientY - rect.top - pan.y) / zoom - start.y,
    };

    setAutoLayout(false);
    event.preventDefault();
  };

  const beginPanDrag = event => {
    if (!isSpatialView || event.button !== 0) return;
    if (event.target.closest(".web-node")) return;

    dragPanRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
    };
  };

  useEffect(() => {
    const onMove = event => {
      if (dragNodeRef.current && viewportRef.current) {
        const rect = viewportRef.current.getBoundingClientRect();
        const pointerX = (event.clientX - rect.left - pan.x) / zoom;
        const pointerY = (event.clientY - rect.top - pan.y) / zoom;

        const rawX = pointerX - dragNodeRef.current.offsetX;
        const rawY = pointerY - dragNodeRef.current.offsetY;

        const snappedX = snapGrid ? Math.round(rawX / 24) * 24 : rawX;
        const snappedY = snapGrid ? Math.round(rawY / 24) * 24 : rawY;

        pendingDragRef.current = {
          cardId: dragNodeRef.current.cardId,
          x: clamp(snappedX, 72, Math.max(72, canvasSize.width - 72)),
          y: clamp(snappedY, 72, Math.max(72, canvasSize.height - 72)),
        };

        if (!rafRef.current) {
          rafRef.current = window.requestAnimationFrame(() => {
            const pending = pendingDragRef.current;
            if (pending) {
              setManualPositions(prev => ({
                ...prev,
                [pending.cardId]: { x: pending.x, y: pending.y },
              }));
            }
            pendingDragRef.current = null;
            rafRef.current = 0;
          });
        }
      }

      if (dragPanRef.current) {
        const deltaX = event.clientX - dragPanRef.current.startX;
        const deltaY = event.clientY - dragPanRef.current.startY;
        setPan({
          x: dragPanRef.current.originX + deltaX,
          y: dragPanRef.current.originY + deltaY,
        });
      }
    };

    const onUp = () => {
      dragNodeRef.current = null;
      dragPanRef.current = null;
      pendingDragRef.current = null;

      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [isSpatialView, pan.x, pan.y, zoom, snapGrid, canvasSize.width, canvasSize.height]);

  const onWorkspaceDrop = async event => {
    event.preventDefault();
    setDropActive(false);

    const dropped = extractDroppedUrls(event.dataTransfer);
    if (!dropped.length) {
      setError("No URL found in dropped content.");
      return;
    }

    if (dropped.length === 1 && isSpatialView) {
      const rect = viewportRef.current?.getBoundingClientRect();
      const dropPos = rect
        ? {
            x: clamp((event.clientX - rect.left - pan.x) / zoom, 72, Math.max(72, canvasSize.width - 72)),
            y: clamp((event.clientY - rect.top - pan.y) / zoom, 72, Math.max(72, canvasSize.height - 72)),
          }
        : null;
      await ingestOne(dropped[0], captureIntent, dropPos, { silent: false });
      return;
    }

    setCaptureText(dropped.join("\n"));
    setShowCapture(true);
    await runQueue(
      dropped.map((url, index) => ({
        id: `drop-${Date.now()}-${index}`,
        url,
      }))
    );
  };

  const computeDecisionText = () => {
    if (!selectedCards.length) {
      return "Select cards to compute decision guidance.";
    }

    const ranking = [...selectedCards].sort((a, b) => {
      const scoreA = Number(a?.relevance?.score || 0);
      const scoreB = Number(b?.relevance?.score || 0);
      const confA = confidenceScore(a);
      const confB = confidenceScore(b);

      const weightedA = scoreA * (decisionInput.speedWeight / 100) + confA * (decisionInput.stabilityWeight / 100);
      const weightedB = scoreB * (decisionInput.speedWeight / 100) + confB * (decisionInput.stabilityWeight / 100);

      return weightedB - weightedA;
    });

    const top = ranking[0];
    if (!top) return "No decision recommendation available.";

    return `${top.title} leads under your current weighting profile.`;
  };

  const runCompare = () => {
    const result = compareCards(selectedCards);
    setCompareCache(result);
    setInsightTab("compare");
  };

  const refreshSelected = async () => {
    if (!selectedIds.length) {
      markStatus("No cards selected.");
      return;
    }
    await runRefresh("daily", selectedIds);
  };

  const refreshAllDaily = async () => {
    await runRefresh("daily", []);
  };

  const refreshAllWeekly = async () => {
    await runRefresh("weekly", []);
  };

  const nextAutoRefresh = refreshState.lastRun
    ? prettyTime(refreshState.lastRun + Math.max(1, refreshState.intervalMin) * 60_000)
    : "Pending";

  if (!hydrated) {
    return (
      <div className="ingest-shell loading-state">
        <div className="loading-card">
          <img src="/ingest-logo-mark.svg" alt="INGEST mark" className="loading-logo" />
          <p>Building intelligence workspace...</p>
        </div>

        <style jsx>{`
          .ingest-shell {
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: linear-gradient(135deg, #f7fafc, #eef3ff 60%, #eef7f6);
            font-family: "Sora", "Avenir Next", "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          }

          .loading-card {
            display: grid;
            justify-items: center;
            gap: 16px;
            padding: 24px 26px;
            border-radius: 20px;
            background: rgba(255, 255, 255, 0.78);
            border: 1px solid rgba(27, 28, 33, 0.08);
            box-shadow: 0 22px 40px rgba(32, 54, 92, 0.12);
            color: #243863;
          }

          .loading-logo {
            width: 52px;
            height: 52px;
            opacity: 0.9;
          }

          p {
            margin: 0;
            font-size: 14px;
            letter-spacing: 0.03em;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div
      className={`ingest-shell theme-${theme} density-${density} motion-${motion} ${focusMode ? "focus-mode" : ""} ${showAdvanced ? "advanced-open" : "advanced-closed"}`}
    >
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />
      <div className="ambient ambient-c" />

      <header className="top-shell compact-shell">
        <div className="brand-panel compact">
          <img src="/ingest-logo-mark.svg" alt="INGEST mark" className="brand-mark" />
          <div className="brand-copy compact">
            <h1>Intelligence Web</h1>
            <p>{summaryStats.active} cards · Avg relevance {summaryStats.avgRelevance}</p>
          </div>
        </div>

        <div className="search-panel compact">
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search cards, tags, notes"
            aria-label="Search cards"
          />
          <button className="pill" onClick={() => setShowCapture(prev => !prev)}>
            {showCapture ? "Capture On" : "Capture Off"}
          </button>
          <button className="pill" onClick={() => setShowNavigator(prev => !prev)}>
            {showNavigator ? "Left On" : "Left Off"}
          </button>
          <button className="pill" onClick={() => setShowPanel(prev => !prev)}>
            {showPanel ? "Panel On" : "Panel Off"}
          </button>
          <button className="pill" onClick={() => setFocusMode(prev => !prev)}>
            {focusMode ? "Exit Focus" : "Focus"}
          </button>
          <button className="pill" onClick={() => setShowAdvanced(prev => !prev)}>
            {showAdvanced ? "Simple" : "Advanced"}
          </button>
        </div>
      </header>

      <section className="quick-strip">
        <div className="view-switches compact">
          {VIEW_OPTIONS.map(view => (
            <button
              key={view.id}
              className={viewMode === view.id ? "active" : ""}
              onClick={() => setViewMode(view.id)}
            >
              {view.label}
            </button>
          ))}
        </div>

        <div className="quick-actions">
          <select value={filterCategory} onChange={event => setFilterCategory(event.target.value)}>
            {categories.map(option => (
              <option key={option} value={option}>
                {option === "All" ? "All Categories" : option}
              </option>
            ))}
          </select>
          <select value={sortMode} onChange={event => setSortMode(event.target.value)}>
            {SORT_OPTIONS.map(option => (
              <option key={option.id} value={option.id}>
                Sort: {option.label}
              </option>
            ))}
          </select>
          <button className="pill" onClick={refreshSelected}>Refresh Selected</button>
          <button className="pill" onClick={runCompare}>Compare</button>
          <span className="next-refresh">Next auto: {nextAutoRefresh}</span>
        </div>
      </section>

      {showAdvanced && (
        <>
          <section className="control-strip">
            <div className="filter-row">
              <select value={filterType} onChange={event => setFilterType(event.target.value)}>
                {typeOptions.map(option => (
                  <option key={option} value={option}>
                    {option === "ALL" ? "All Types" : typeMeta(option).label}
                  </option>
                ))}
              </select>

              <select value={filterFreshness} onChange={event => setFilterFreshness(event.target.value)}>
                {FRESHNESS_FILTERS.map(option => (
                  <option key={option} value={option}>
                    {option === "ALL" ? "All Freshness" : option}
                  </option>
                ))}
              </select>

              <select value={activeCollection} onChange={event => setActiveCollection(event.target.value)}>
                {collectionOptions.map(name => (
                  <option key={name} value={name}>
                    {name === "All" ? "All Collections" : name}
                  </option>
                ))}
              </select>

              <select value={theme} onChange={event => setTheme(event.target.value)}>
                {THEME_OPTIONS.map(option => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>

              <select value={density} onChange={event => setDensity(event.target.value)}>
                {DENSITY_OPTIONS.map(option => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>

              <select value={motion} onChange={event => setMotion(event.target.value)}>
                {MOTION_OPTIONS.map(option => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </div>
          </section>

          <section className="action-strip">
            <div className="left-actions">
              <button className="pill" onClick={refreshAllDaily}>Daily Refresh</button>
              <button className="pill" onClick={refreshAllWeekly}>Weekly Refresh</button>
              <button className="pill warning" onClick={archiveSelected}>Archive Selected</button>
              <button className="pill" onClick={clearArchived}>Restore Archived</button>
            </div>
            <div className="right-actions">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={refreshState.auto}
                  onChange={event => setRefreshState(prev => ({ ...prev, auto: event.target.checked }))}
                />
                Auto refresh
              </label>
              <select
                value={String(refreshState.intervalMin)}
                onChange={event =>
                  setRefreshState(prev => ({
                    ...prev,
                    intervalMin: Number(event.target.value || 30),
                  }))
                }
              >
                {REFRESH_INTERVAL_OPTIONS.map(option => (
                  <option key={option.id} value={String(option.id)}>
                    Every {option.label}
                  </option>
                ))}
              </select>
              <span className="next-refresh">Next auto: {nextAutoRefresh}</span>
            </div>
          </section>
        </>
      )}

      {(statusMessage || error) && (
        <section className={`status-strip ${error ? "error" : ""}`}>
          <span>{error || statusMessage}</span>
        </section>
      )}

      <main className="workspace-grid">
        {!focusMode && showNavigator && (
          <aside className="navigator">
            <div className="nav-section">
              <h3>Board Controls</h3>
              <div className="inline-controls">
                <button className="ghost" onClick={() => setAutoLayout(prev => !prev)}>
                  {autoLayout ? "Auto Layout On" : "Auto Layout Off"}
                </button>
                <button className="ghost" onClick={() => setSnapGrid(prev => !prev)}>
                  {snapGrid ? "Snap On" : "Snap Off"}
                </button>
              </div>
              <div className="inline-controls">
                <button className="ghost" onClick={fitToContent}>Fit Content</button>
                <button className="ghost" onClick={resetViewport}>Reset View</button>
              </div>
              <div className="inline-controls">
                <button className="ghost" onClick={collapseAllCards}>Collapse All Cards</button>
                <button className="ghost" onClick={expandAllCards}>Expand All Cards</button>
              </div>
            </div>

            <div className="nav-section">
              <h3>Category Map</h3>
              <ul className="category-list">
                {categoryDigest.map(item => {
                  const collapsed = collapsedCategories.includes(item.name);
                  const selected = filterCategory === item.name;
                  const hue = hashHue(item.name);
                  return (
                    <li key={item.name} className={selected ? "selected" : ""}>
                      <button
                        className="category-chip"
                        onClick={() => {
                          setFilterCategory(selected ? "All" : item.name);
                          setInsightTab("category");
                        }}
                        style={{ borderColor: `hsla(${hue}, 60%, 62%, 0.45)` }}
                      >
                        <strong>{item.name}</strong>
                        <span>{item.count} cards</span>
                        <span>Avg {item.avgRelevance}</span>
                      </button>
                      <div className="category-actions">
                        <button onClick={() => selectCategoryCards(item.name)}>Select</button>
                        <button onClick={() => toggleCategoryCollapse(item.name)}>{collapsed ? "Expand" : "Collapse"}</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="nav-section">
              <h3>Collections</h3>
              <div className="inline-controls">
                <button className="ghost" onClick={createCollection}>New</button>
                <button
                  className="ghost"
                  onClick={() => addSelectedToCollection(activeCollection)}
                  disabled={activeCollection === "All"}
                >
                  Add Selected
                </button>
                <button
                  className="ghost"
                  onClick={() => removeSelectedFromCollection(activeCollection)}
                  disabled={activeCollection === "All"}
                >
                  Remove Selected
                </button>
              </div>
              <ul className="collection-list">
                {Object.keys(collections)
                  .sort((a, b) => a.localeCompare(b))
                  .map(name => (
                    <li key={name}>
                      <button onClick={() => setActiveCollection(name)} className={activeCollection === name ? "active" : ""}>
                        {name} ({toArray(collections[name]).length})
                      </button>
                      <button className="danger" onClick={() => deleteCollection(name)}>Delete</button>
                    </li>
                  ))}
              </ul>
            </div>

            <div className="nav-section">
              <h3>Scenes</h3>
              <div className="inline-controls">
                <button className="ghost" onClick={saveScene}>Save Scene</button>
                <button className="ghost" onClick={undoLast} disabled={!history.length}>Undo</button>
              </div>
              <ul className="scene-list">
                {savedScenes.map(scene => (
                  <li key={scene.id}>
                    <button onClick={() => applyScene(scene)}>{scene.name}</button>
                    <button className="danger" onClick={() => deleteScene(scene.id)}>Delete</button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="nav-section">
              <h3>Workspace IO</h3>
              <div className="inline-controls">
                <button className="ghost" onClick={exportWorkspace}>Export</button>
                <button className="ghost" onClick={openImportPicker}>Import</button>
              </div>
              <input ref={importRef} type="file" accept="application/json" onChange={importWorkspace} hidden />
            </div>

            <div className="nav-section mini-note">
              <h3>Shortcuts</h3>
              <p>Cmd/Ctrl + K capture</p>
              <p>Cmd/Ctrl + 1..5 views</p>
              <p>Cmd/Ctrl + 0 reset viewport</p>
              <p>Cmd/Ctrl + Z undo</p>
            </div>
          </aside>
        )}

        <section className="stage-column">
          <div className="stage-topbar compact">
            <div className="stage-top-left">
              <button className="compact" onClick={() => setShowCapture(prev => !prev)}>
                {showCapture ? "Capture On" : "Capture Off"}
              </button>
              {showCapture && (
                <button className="compact" onClick={() => setCaptureExpanded(prev => !prev)}>
                  {captureExpanded ? "Compact Capture" : "Expand Capture"}
                </button>
              )}
              <button className="compact" onClick={() => setShowAdvanced(prev => !prev)}>
                {showAdvanced ? "Simple Controls" : "Advanced Controls"}
              </button>
            </div>
            <div className="stage-top-right">
              <span className="micro-metric">Stale {summaryStats.stale}</span>
              <span className="micro-metric">Pinned {summaryStats.pinned}</span>
              <span className="micro-metric">Dupes {summaryStats.duplicates}</span>
            </div>
          </div>

          {showCapture && (
            <div className={`capture-dock ${captureExpanded ? "expanded" : "collapsed"}`}>
              <div className="capture-header">
                <strong>Capture Links</strong>
                <span>{captureExpanded ? "Paste bulk URLs and intent." : "Quick paste and analyze."}</span>
              </div>

              {captureExpanded ? (
                <>
                  <textarea
                    ref={captureInputRef}
                    value={captureText}
                    onChange={event => setCaptureText(event.target.value)}
                    placeholder="https://example.com\nhttps://another-link.com"
                  />
                  <div className="capture-controls">
                    <input
                      value={captureIntent}
                      onChange={event => setCaptureIntent(event.target.value)}
                      placeholder="Intent (optional)"
                      maxLength={220}
                    />
                    <button className="compact primary" onClick={runCapture} disabled={isSubmitting}>
                      {isSubmitting ? "Running..." : "Analyze Links"}
                    </button>
                    <button className="compact" onClick={pasteClipboard}>Paste Clipboard</button>
                    <button className="compact" onClick={addDemoLinks}>Add Demo Links</button>
                  </div>
                </>
              ) : (
                <div className="capture-inline">
                  <input
                    ref={captureInputRef}
                    value={captureText}
                    onChange={event => setCaptureText(event.target.value)}
                    placeholder="Drop or paste links here"
                  />
                  <button className="compact primary" onClick={runCapture} disabled={isSubmitting}>
                    {isSubmitting ? "Running..." : "Analyze"}
                  </button>
                  <button className="compact" onClick={pasteClipboard}>Paste</button>
                </div>
              )}
            </div>
          )}

          {queueItems.length > 0 && (
            <div className="queue-bar">
              <div className="queue-head">
                <strong>Queue</strong>
                <span>{queueProgress}% complete</span>
                <div className="queue-actions">
                  <button className="ghost" onClick={pauseResumeQueue} disabled={!queueRunning}>
                    {queuePaused ? "Resume" : "Pause"}
                  </button>
                  <button className="ghost" onClick={cancelQueue} disabled={!queueRunning}>
                    Cancel
                  </button>
                  <button className="ghost" onClick={retryFailedQueue}>Retry Failed</button>
                </div>
              </div>
              <div className="queue-track">
                <span style={{ width: `${queueProgress}%` }} />
              </div>
              <ul>
                {queueItems.slice(0, 8).map(item => (
                  <li key={item.id} className={item.status}>
                    <span>{item.url}</span>
                    <em>{item.status}</em>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div
            ref={viewportRef}
            className={`stage-viewport ${dropActive ? "drop-active" : ""}`}
            onMouseDown={beginPanDrag}
            onWheel={handleWheel}
            onDragOver={event => {
              event.preventDefault();
              setDropActive(true);
            }}
            onDragLeave={event => {
              if (event.currentTarget === event.target) {
                setDropActive(false);
              }
            }}
            onDrop={onWorkspaceDrop}
          >
            <div className="stage-grid" />

            {isSpatialView && (
              <div
                className="stage-scene"
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
              >
                {viewMode === "matrix" && layout.axes && (
                  <svg className="matrix-guides" width={canvasSize.width} height={canvasSize.height}>
                    <rect
                      x={layout.axes.xPad}
                      y={layout.axes.yPad}
                      width={layout.axes.innerWidth}
                      height={layout.axes.innerHeight}
                      fill="none"
                      stroke="rgba(44, 66, 106, 0.25)"
                      strokeDasharray="7 7"
                    />
                    <line
                      x1={layout.axes.xPad + layout.axes.innerWidth * 0.5}
                      y1={layout.axes.yPad}
                      x2={layout.axes.xPad + layout.axes.innerWidth * 0.5}
                      y2={layout.axes.yPad + layout.axes.innerHeight}
                      stroke="rgba(44, 66, 106, 0.2)"
                    />
                    <line
                      x1={layout.axes.xPad}
                      y1={layout.axes.yPad + layout.axes.innerHeight * 0.5}
                      x2={layout.axes.xPad + layout.axes.innerWidth}
                      y2={layout.axes.yPad + layout.axes.innerHeight * 0.5}
                      stroke="rgba(44, 66, 106, 0.2)"
                    />
                    <text x={layout.axes.xPad} y={layout.axes.yPad - 18}>Confidence ↑</text>
                    <text x={layout.axes.xPad + layout.axes.innerWidth - 78} y={layout.axes.yPad + layout.axes.innerHeight + 28}>
                      Relevance →
                    </text>
                  </svg>
                )}

                <svg className="board-links" width={canvasSize.width} height={canvasSize.height}>
                  {boardCards.map(card => {
                    const pos = positions[card.id];
                    if (!pos) return null;
                    const category = card?.categories?.primary || "General Intelligence";
                    const anchor = layout.anchors?.[category];
                    if (!anchor) return null;
                    const hue = hashHue(category);
                    return (
                      <line
                        key={`line-${card.id}`}
                        x1={anchor.x}
                        y1={anchor.y}
                        x2={pos.x}
                        y2={pos.y}
                        stroke={`hsla(${hue}, 70%, 55%, 0.25)`}
                        strokeWidth={selectedIds.includes(card.id) ? 2.3 : 1.2}
                      />
                    );
                  })}
                </svg>

                {Object.entries(layout.anchors || {}).map(([category, anchor]) => {
                  const hue = hashHue(category);
                  const collapsed = collapsedCategories.includes(category);
                  const items = boardCards.filter(card => (card?.categories?.primary || "General Intelligence") === category);

                  return (
                    <button
                      key={`anchor-${category}`}
                      className={`category-bubble ${collapsed ? "collapsed" : ""}`}
                      style={{
                        left: anchor.x,
                        top: anchor.y,
                        width: Math.max(140, Math.min(420, anchor.radius * 1.65)),
                        height: Math.max(140, Math.min(420, anchor.radius * 1.65)),
                        borderColor: `hsla(${hue}, 70%, 50%, 0.24)`,
                        background: `radial-gradient(circle at 28% 20%, hsla(${hue}, 80%, 76%, 0.14), hsla(${hue}, 85%, 68%, 0.05) 62%, transparent 100%)`,
                      }}
                      onClick={() => {
                        setFilterCategory(filterCategory === category ? "All" : category);
                        setInsightTab("category");
                      }}
                      onDoubleClick={() => toggleCategoryCollapse(category)}
                      title="Click to filter. Double click to collapse category."
                    >
                      <strong>{category}</strong>
                      <span>{items.length} cards</span>
                      <em>{collapsed ? "Collapsed" : `Avg ${Math.round(items.reduce((sum, card) => sum + Number(card?.relevance?.score || 0), 0) / Math.max(1, items.length))}`}</em>
                    </button>
                  );
                })}

                {boardCards.map(card => {
                  const pos = positions[card.id];
                  if (!pos) return null;

                  const selected = selectedIds.includes(card.id);
                  const active = activeCardId === card.id;
                  const collapsed = collapsedCardIds.includes(card.id);
                  const status = cardFreshness(card, tickNow);
                  const confidence = confidenceScore(card);
                  const tone = scoreTone(Number(card?.relevance?.score || 0));
                  const meta = typeMeta(card.type);

                  const category = card?.categories?.primary || "General Intelligence";
                  const categoryHidden = collapsedCategories.includes(category);
                  if (categoryHidden && !selected && !active) return null;

                  return (
                    <article
                      key={card.id}
                      className={`web-node tone-${tone} ${selected ? "selected" : ""} ${active ? "active" : ""} ${collapsed ? "collapsed" : ""}`}
                      style={{
                        left: `${pos.x}px`,
                        top: `${pos.y}px`,
                        borderColor: `hsla(${meta.hue}, 76%, 54%, ${selected ? 0.58 : 0.2})`,
                      }}
                      onMouseDown={event => beginNodeDrag(event, card.id)}
                      onClick={event => toggleSelected(card.id, event)}
                      onDoubleClick={() => {
                        setActiveCardId(card.id);
                        setInsightTab("card");
                      }}
                    >
                      <header>
                        <span className="type-tag" style={{ background: `hsla(${meta.hue}, 85%, 60%, 0.14)` }}>
                          {meta.label}
                        </span>
                        <div className="score-row">
                          <span className={`freshness ${status.tone}`}>{status.label}</span>
                          <span className="score">{Math.round(Number(card?.relevance?.score || 0))}</span>
                        </div>
                      </header>

                      <h4>{card.title}</h4>

                      {!collapsed && (
                        <>
                          <p>{card.summary_short}</p>
                          <div className="meta-row">
                            <span>{card?.categories?.primary || "General Intelligence"}</span>
                            <span>{confidenceLabel(confidence)} {confidence}%</span>
                          </div>
                          <div className="tag-row">
                            {toArray(card.tags)
                              .slice(0, 4)
                              .map(tag => (
                                <span key={tag}>#{tag}</span>
                              ))}
                          </div>
                        </>
                      )}

                      <footer>
                        <button
                          onClick={event => {
                            event.stopPropagation();
                            toggleCardCollapse(card.id);
                          }}
                        >
                          {collapsed ? "Expand" : "Collapse"}
                        </button>
                        <button
                          onClick={event => {
                            event.stopPropagation();
                            togglePin(card.id);
                          }}
                        >
                          {card.pinned ? "Unpin" : "Pin"}
                        </button>
                        <button
                          onClick={event => {
                            event.stopPropagation();
                            centerOnCard(card.id);
                          }}
                        >
                          Center
                        </button>
                      </footer>
                    </article>
                  );
                })}
              </div>
            )}

            {!isSpatialView && viewMode === "list" && (
              <div className="list-view">
                <table>
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Category</th>
                      <th>Type</th>
                      <th>Freshness</th>
                      <th>Relevance</th>
                      <th>Confidence</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCards.map(card => {
                      const fresh = cardFreshness(card, tickNow);
                      const confidence = confidenceScore(card);
                      return (
                        <tr key={card.id} className={selectedIds.includes(card.id) ? "selected" : ""}>
                          <td>
                            <button
                              className="row-title"
                              onClick={event => {
                                toggleSelected(card.id, event);
                                setViewMode("web");
                                centerOnCard(card.id);
                              }}
                            >
                              {card.title}
                            </button>
                          </td>
                          <td>{card?.categories?.primary || "General Intelligence"}</td>
                          <td>{typeMeta(card.type).label}</td>
                          <td>{fresh.label}</td>
                          <td>{Math.round(Number(card?.relevance?.score || 0))}</td>
                          <td>{confidence}%</td>
                          <td>
                            <div className="row-actions">
                              <button onClick={() => toggleCardCollapse(card.id)}>
                                {collapsedCardIds.includes(card.id) ? "Expand" : "Collapse"}
                              </button>
                              <button onClick={() => togglePin(card.id)}>{card.pinned ? "Unpin" : "Pin"}</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {!isSpatialView && viewMode === "timeline" && (
              <div className="timeline-view">
                <div className="timeline-controls">
                  <h3>Timeline</h3>
                  <select value={severityFilter} onChange={event => setSeverityFilter(event.target.value)}>
                    <option value="ALL">All severities</option>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                </div>
                <ul>
                  {timelineEvents.map(event => {
                    const related = event.card_id ? cards.find(card => card.id === event.card_id) : null;
                    return (
                      <li key={event.id} className={`sev-${String(event.severity || "LOW").toLowerCase()}`}>
                        <div className="timeline-meta">
                          <span>{event.source}</span>
                          <span>{event.severity}</span>
                          <span>{timeAgo(event.timestamp, tickNow)}</span>
                        </div>
                        <h4>{event.title}</h4>
                        <p>{event.detail || "No detail provided."}</p>
                        {related && (
                          <button
                            onClick={() => {
                              setViewMode("web");
                              setActiveCardId(related.id);
                              setSelectedIds([related.id]);
                              centerOnCard(related.id);
                              setInsightTab("card");
                            }}
                          >
                            Open card
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="stage-controls">
              <button onClick={() => adjustZoom(0.12)}>+</button>
              <button onClick={() => adjustZoom(-0.12)}>-</button>
              <button onClick={fitToContent}>Fit</button>
              <button onClick={resetViewport}>Reset</button>
              <span>{Math.round(zoom * 100)}%</span>
            </div>

            {isSpatialView && (
              <div className="mini-map">
                {miniMapData.map(point => (
                  <span
                    key={point.id}
                    className={point.selected ? "selected" : ""}
                    style={{
                      left: `${point.x * 100}%`,
                      top: `${point.y * 100}%`,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        {!focusMode && showPanel && (
          <aside className="insight-panel">
            <div className="panel-header">
              <h3>Intelligence Panel</h3>
              <p>Category and card-level synthesis with decision framing.</p>
            </div>

            <div className="tab-row">
              {INSIGHT_TABS.map(tab => (
                <button
                  key={tab.id}
                  className={insightTab === tab.id ? "active" : ""}
                  onClick={() => setInsightTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {insightTab === "overview" && (
              <div className="tab-content">
                <section>
                  <h4>Workspace Health</h4>
                  <ul>
                    <li>{summaryStats.active} active cards across {categoryDigest.length} categories</li>
                    <li>Average relevance {summaryStats.avgRelevance}</li>
                    <li>{summaryStats.stale} stale cards need refresh</li>
                    <li>{summaryStats.duplicates} duplicate links detected</li>
                  </ul>
                </section>

                <section>
                  <h4>Top Categories</h4>
                  <ul>
                    {categoryDigest.slice(0, 6).map(item => (
                      <li key={item.name}>
                        <strong>{item.name}</strong>
                        <span>{item.count} cards · Avg {item.avgRelevance}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                <section>
                  <h4>Coverage Gaps</h4>
                  <ul>
                    {toArray(insights.coverageGaps).length ? (
                      toArray(insights.coverageGaps).slice(0, 6).map((gap, index) => (
                        <li key={`gap-${index}`}>
                          <strong>{gap.category || "Gap"}</strong>
                          <p>{gap.reason || "Gap detected."}</p>
                        </li>
                      ))
                    ) : (
                      <li>No critical gaps detected.</li>
                    )}
                  </ul>
                </section>
              </div>
            )}

            {insightTab === "category" && (
              <div className="tab-content">
                <section>
                  <h4>{categoryInsight.name}</h4>
                  <p>
                    {categoryInsight.count} cards · Avg relevance {categoryInsight.avgRelevance} · Avg confidence {categoryInsight.avgConfidence}
                  </p>
                  <p>{categoryInsight.stale} stale cards in this category.</p>
                  <div className="inline-controls">
                    <button className="ghost" onClick={() => setFilterCategory(categoryInsight.name)}>Focus Category</button>
                    <button className="ghost" onClick={() => selectCategoryCards(categoryInsight.name)}>Select Category</button>
                  </div>
                </section>

                <section>
                  <h4>Top Tags</h4>
                  <div className="chip-wrap">
                    {categoryInsight.topTags.length ? (
                      categoryInsight.topTags.map(([tag, count]) => (
                        <span key={tag} className="chip">#{tag} ({count})</span>
                      ))
                    ) : (
                      <span className="chip">No tags</span>
                    )}
                  </div>
                </section>

                <section>
                  <h4>Frequent Entities</h4>
                  <ul>
                    {categoryInsight.topEntities.length ? (
                      categoryInsight.topEntities.map(([name, count]) => (
                        <li key={name}>{name} ({count})</li>
                      ))
                    ) : (
                      <li>No entities captured.</li>
                    )}
                  </ul>
                </section>

                <section>
                  <h4>Cards in Category</h4>
                  <ul>
                    {visibleCards
                      .filter(card => (card?.categories?.primary || "General Intelligence") === categoryInsight.name)
                      .slice(0, 12)
                      .map(card => (
                        <li key={card.id}>
                          <button
                            onClick={() => {
                              setViewMode("web");
                              setActiveCardId(card.id);
                              setSelectedIds([card.id]);
                              centerOnCard(card.id);
                              setInsightTab("card");
                            }}
                          >
                            {card.title}
                          </button>
                        </li>
                      ))}
                  </ul>
                </section>
              </div>
            )}

            {insightTab === "card" && (
              <div className="tab-content">
                {activeCard ? (
                  <>
                    <section>
                      <h4>{activeCard.title}</h4>
                      <p>{activeCard.summary_short}</p>
                      <div className="chip-wrap">
                        <span className="chip">{typeMeta(activeCard.type).label}</span>
                        <span className="chip">Score {Math.round(Number(activeCard?.relevance?.score || 0))}</span>
                        <span className="chip">{confidenceScore(activeCard)}% confidence</span>
                        <span className="chip">{cardFreshness(activeCard, tickNow).label}</span>
                      </div>
                    </section>

                    <section>
                      <h4>Category</h4>
                      <select
                        value={activeCard?.categories?.primary || "General Intelligence"}
                        onChange={event => recategorizeCard(activeCard.id, event.target.value)}
                      >
                        {categories
                          .filter(name => name !== "All")
                          .concat("General Intelligence")
                          .filter((value, index, arr) => arr.indexOf(value) === index)
                          .map(name => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                      </select>
                    </section>

                    <section>
                      <h4>Notes</h4>
                      <textarea
                        value={activeCard.user_notes || ""}
                        onChange={event => updateCardNotes(activeCard.id, event.target.value)}
                        placeholder="Add your decision notes"
                      />
                    </section>

                    <section>
                      <h4>Best For</h4>
                      <ul>
                        {toArray(activeCard?.usefulness?.best_for).length ? (
                          toArray(activeCard?.usefulness?.best_for).map(item => <li key={item}>{item}</li>)
                        ) : (
                          <li>No best-for guidance yet.</li>
                        )}
                      </ul>
                    </section>

                    <section>
                      <h4>Risks</h4>
                      <ul>
                        {toArray(activeCard?.usefulness?.cons).length ? (
                          toArray(activeCard?.usefulness?.cons).map(item => <li key={item}>{item}</li>)
                        ) : (
                          <li>No major risks captured.</li>
                        )}
                      </ul>
                    </section>

                    <section>
                      <h4>Actions</h4>
                      <div className="inline-controls">
                        <button className="ghost" onClick={() => runRefresh("daily", [activeCard.id])}>Refresh Card</button>
                        <button className="ghost" onClick={() => toggleCardCollapse(activeCard.id)}>
                          {collapsedCardIds.includes(activeCard.id) ? "Expand Card" : "Collapse Card"}
                        </button>
                        <button className="ghost" onClick={() => window.open(activeCard.url, "_blank", "noopener,noreferrer")}>Open Source</button>
                      </div>
                    </section>
                  </>
                ) : (
                  <p>Select a card to inspect details.</p>
                )}
              </div>
            )}

            {insightTab === "compare" && (
              <div className="tab-content">
                <section>
                  <h4>Decision Inputs</h4>
                  <input
                    value={decisionInput.goal}
                    onChange={event => setDecisionInput(prev => ({ ...prev, goal: event.target.value }))}
                    placeholder="Goal for this decision"
                    maxLength={280}
                  />
                  <label>
                    Speed {decisionInput.speedWeight}
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={decisionInput.speedWeight}
                      onChange={event =>
                        setDecisionInput(prev => ({
                          ...prev,
                          speedWeight: Number(event.target.value || 0),
                        }))
                      }
                    />
                  </label>
                  <label>
                    Depth {decisionInput.depthWeight}
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={decisionInput.depthWeight}
                      onChange={event =>
                        setDecisionInput(prev => ({
                          ...prev,
                          depthWeight: Number(event.target.value || 0),
                        }))
                      }
                    />
                  </label>
                  <label>
                    Stability {decisionInput.stabilityWeight}
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={decisionInput.stabilityWeight}
                      onChange={event =>
                        setDecisionInput(prev => ({
                          ...prev,
                          stabilityWeight: Number(event.target.value || 0),
                        }))
                      }
                    />
                  </label>
                </section>

                <section>
                  <h4>Recommendation</h4>
                  <p>{computeDecisionText()}</p>
                </section>

                {compareData ? (
                  <>
                    <section>
                      <h4>Lead</h4>
                      <p>{compareData.lead.title}</p>
                      <p>Score {Math.round(Number(compareData.lead?.relevance?.score || 0))}</p>
                    </section>

                    <section>
                      <h4>Spread</h4>
                      <p>{compareData.spread} points between top and bottom selection.</p>
                    </section>

                    <section>
                      <h4>Shared Strengths</h4>
                      <ul>
                        {compareData.sharedPros.length ? (
                          compareData.sharedPros.map(item => <li key={item}>{item}</li>)
                        ) : (
                          <li>No shared strengths found.</li>
                        )}
                      </ul>
                    </section>

                    <section>
                      <h4>Shared Risks</h4>
                      <ul>
                        {compareData.sharedCons.length ? (
                          compareData.sharedCons.map(item => <li key={item}>{item}</li>)
                        ) : (
                          <li>No shared risks found.</li>
                        )}
                      </ul>
                    </section>
                  </>
                ) : (
                  <p>Select at least two cards to compare.</p>
                )}
              </div>
            )}

            {insightTab === "radar" && (
              <div className="tab-content">
                <section>
                  <h4>Signal Radar</h4>
                  <ul>
                    {timelineEvents.slice(0, 18).map(event => (
                      <li key={event.id}>
                        <div className="radar-row">
                          <span>{event.severity}</span>
                          <strong>{event.title}</strong>
                        </div>
                        <p>{event.detail || "No detail"}</p>
                        <small>{timeAgo(event.timestamp, tickNow)} · {event.category}</small>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            )}
          </aside>
        )}
      </main>

      <style jsx>{`
        .ingest-shell {
          --bg: #f5f8ff;
          --bg-soft: #eef3ff;
          --panel: rgba(255, 255, 255, 0.77);
          --panel-strong: rgba(255, 255, 255, 0.88);
          --line: rgba(42, 63, 102, 0.12);
          --line-strong: rgba(42, 63, 102, 0.2);
          --text: #12244a;
          --text-soft: #49618d;
          --accent: #1f6cff;
          --accent-soft: rgba(31, 108, 255, 0.12);
          --danger: #c53f57;
          min-height: 100vh;
          padding: 14px;
          color: var(--text);
          background:
            radial-gradient(circle at 10% 2%, rgba(123, 168, 255, 0.22), transparent 38%),
            radial-gradient(circle at 86% -10%, rgba(138, 239, 196, 0.24), transparent 34%),
            radial-gradient(circle at 70% 106%, rgba(255, 209, 161, 0.2), transparent 36%),
            var(--bg);
          font-family: "Sora", "Avenir Next", "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          display: grid;
          gap: 12px;
          position: relative;
          overflow: hidden;
        }

        .theme-cloud {
          --bg: #f7fbff;
          --bg-soft: #f1f7ff;
          --panel: rgba(255, 255, 255, 0.8);
          --panel-strong: rgba(255, 255, 255, 0.92);
          --line: rgba(36, 63, 84, 0.12);
          --line-strong: rgba(36, 63, 84, 0.22);
          --text: #1f2e4f;
          --text-soft: #5b708f;
          --accent: #1d72d2;
          --accent-soft: rgba(29, 114, 210, 0.14);
        }

        .theme-mono {
          --bg: #f7f7f8;
          --bg-soft: #f1f2f4;
          --panel: rgba(255, 255, 255, 0.82);
          --panel-strong: rgba(255, 255, 255, 0.94);
          --line: rgba(32, 33, 37, 0.14);
          --line-strong: rgba(32, 33, 37, 0.24);
          --text: #191c24;
          --text-soft: #5f6470;
          --accent: #1764bd;
          --accent-soft: rgba(23, 100, 189, 0.14);
        }

        .density-balanced {
          gap: 10px;
        }

        .density-dense {
          gap: 8px;
        }

        .motion-steady * {
          transition-duration: 0.05s !important;
          animation-duration: 0.05s !important;
        }

        .ambient {
          position: absolute;
          pointer-events: none;
          filter: blur(20px);
          opacity: 0.3;
          z-index: 0;
        }

        .ambient-a {
          width: 340px;
          height: 340px;
          background: rgba(147, 193, 255, 0.33);
          border-radius: 50%;
          top: -140px;
          left: -120px;
        }

        .ambient-b {
          width: 320px;
          height: 320px;
          background: rgba(157, 248, 202, 0.24);
          border-radius: 50%;
          top: -90px;
          right: -110px;
        }

        .ambient-c {
          width: 300px;
          height: 300px;
          background: rgba(255, 213, 167, 0.26);
          border-radius: 50%;
          bottom: -140px;
          right: 32%;
        }

        .top-shell,
        .quick-strip,
        .control-strip,
        .action-strip,
        .status-strip,
        .workspace-grid {
          position: relative;
          z-index: 1;
        }

        .top-shell,
        .quick-strip,
        .control-strip,
        .action-strip,
        .status-strip {
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 14px;
          backdrop-filter: blur(12px);
          box-shadow: 0 14px 26px rgba(20, 46, 88, 0.07);
        }

        .top-shell {
          display: grid;
          gap: 8px;
          grid-template-columns: minmax(220px, auto) minmax(0, 1fr);
          align-items: center;
          padding: 8px 10px;
        }

        .top-shell.compact-shell {
          min-height: 58px;
        }

        .brand-panel {
          display: grid;
          grid-template-columns: 210px 1fr;
          align-items: center;
          gap: 14px;
        }

        .brand-logo {
          width: 210px;
          height: auto;
          object-fit: contain;
          display: block;
          max-height: 76px;
        }

        .brand-mark {
          width: 44px;
          height: 44px;
          display: block;
        }

        .brand-panel.compact {
          grid-template-columns: 44px 1fr;
          gap: 10px;
          align-items: center;
        }

        .brand-copy.compact h1 {
          font-size: clamp(18px, 1.8vw, 24px);
          line-height: 1;
        }

        .brand-copy.compact p {
          margin-top: 2px;
          font-size: 12px;
        }

        .brand-copy h1 {
          margin: 0;
          font-size: clamp(30px, 2.7vw, 42px);
          letter-spacing: -0.025em;
          color: var(--text);
        }

        .brand-copy p {
          margin: 4px 0 0;
          color: var(--text-soft);
          font-size: clamp(14px, 1.2vw, 20px);
        }

        .search-panel {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
        }

        .search-panel input {
          border: 1px solid var(--line);
          border-radius: 10px;
          height: 36px;
          padding: 0 12px;
          background: rgba(255, 255, 255, 0.75);
          color: var(--text);
          min-width: 220px;
          flex: 1 1 300px;
        }

        .quick-strip {
          padding: 8px 10px;
          display: grid;
          grid-template-columns: minmax(260px, 1fr) minmax(220px, auto);
          gap: 8px;
          align-items: center;
        }

        .quick-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          flex-wrap: wrap;
          gap: 6px;
        }

        .pill,
        .compact,
        .ghost,
        .category-actions button,
        .row-actions button,
        .timeline-view button,
        .tab-row button,
        .inline-controls button,
        .list-view .row-title {
          border: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.8);
          color: var(--text);
          border-radius: 999px;
          padding: 7px 10px;
          cursor: pointer;
          font-size: 12px;
          transition: all 0.2s ease;
        }

        .pill:hover,
        .compact:hover,
        .ghost:hover,
        .tab-row button:hover,
        .category-actions button:hover,
        .row-actions button:hover,
        .timeline-view button:hover,
        .inline-controls button:hover {
          transform: translateY(-1px);
          border-color: var(--line-strong);
          background: rgba(255, 255, 255, 0.96);
        }

        .pill.warning {
          border-color: rgba(197, 63, 87, 0.32);
          color: #9a3045;
          background: rgba(255, 236, 240, 0.8);
        }

        .compact.primary {
          background: linear-gradient(140deg, #2a75ff, #2268eb);
          color: white;
          border-color: rgba(38, 93, 194, 0.5);
        }

        .control-strip {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
          padding: 8px 10px;
        }

        .view-switches {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        .view-switches button {
          border: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.74);
          border-radius: 999px;
          padding: 8px 12px;
          cursor: pointer;
          color: var(--text);
          transition: all 0.2s ease;
        }

        .view-switches button.active {
          border-color: rgba(33, 103, 236, 0.55);
          background: rgba(37, 117, 255, 0.14);
          color: #1450ba;
        }

        .filter-row {
          display: grid;
          grid-template-columns: repeat(6, minmax(110px, 1fr));
          gap: 6px;
        }

        select,
        input,
        textarea {
          border: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.76);
          color: var(--text);
          border-radius: 12px;
          padding: 8px 10px;
          min-width: 0;
        }

        textarea {
          resize: vertical;
          min-height: 84px;
        }

        .action-strip {
          padding: 8px 10px;
          display: grid;
          grid-template-columns: 1.5fr 1fr;
          gap: 8px;
          align-items: center;
        }

        .left-actions,
        .right-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
        }

        .toggle {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: var(--text-soft);
          font-size: 13px;
        }

        .next-refresh {
          font-size: 12px;
          color: var(--text-soft);
        }

        .status-strip {
          padding: 9px 12px;
          font-size: 13px;
          color: var(--text);
        }

        .status-strip.error {
          border-color: rgba(200, 69, 87, 0.35);
          color: #8f2036;
          background: rgba(255, 236, 240, 0.86);
        }

        .workspace-grid {
          min-height: calc(100vh - 178px);
          display: grid;
          grid-template-columns: 300px minmax(0, 1fr) 360px;
          gap: 10px;
        }

        .advanced-open .workspace-grid {
          min-height: calc(100vh - 248px);
        }

        .focus-mode .workspace-grid {
          grid-template-columns: minmax(0, 1fr);
        }

        .navigator,
        .stage-column,
        .insight-panel {
          border: 1px solid var(--line);
          border-radius: 20px;
          background: var(--panel);
          backdrop-filter: blur(10px);
          box-shadow: 0 14px 30px rgba(25, 49, 91, 0.09);
          min-height: 0;
        }

        .navigator {
          padding: 10px;
          overflow: auto;
          display: grid;
          gap: 10px;
        }

        .nav-section {
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 10px;
          background: rgba(255, 255, 255, 0.64);
          display: grid;
          gap: 8px;
        }

        .nav-section h3 {
          margin: 0;
          font-size: 12px;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          color: var(--text-soft);
        }

        .mini-note p {
          margin: 0;
          color: var(--text-soft);
          font-size: 12px;
        }

        .inline-controls {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .category-list,
        .collection-list,
        .scene-list {
          margin: 0;
          padding: 0;
          list-style: none;
          display: grid;
          gap: 6px;
        }

        .category-list li,
        .collection-list li,
        .scene-list li {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 6px;
          align-items: center;
        }

        .category-list li.selected .category-chip {
          border-color: rgba(29, 106, 250, 0.5);
          background: rgba(25, 113, 255, 0.14);
        }

        .category-chip {
          display: grid;
          gap: 2px;
          align-items: flex-start;
          text-align: left;
          padding: 8px;
          border-radius: 12px;
          border: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.78);
          cursor: pointer;
        }

        .category-chip strong {
          font-size: 13px;
          color: var(--text);
        }

        .category-chip span,
        .category-chip em {
          font-size: 11px;
          font-style: normal;
          color: var(--text-soft);
        }

        .category-actions {
          display: grid;
          gap: 4px;
        }

        .collection-list button,
        .scene-list button {
          border: 1px solid var(--line);
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.78);
          padding: 6px 8px;
          cursor: pointer;
          text-align: left;
          color: var(--text);
          font-size: 12px;
        }

        .collection-list button.active {
          border-color: rgba(28, 105, 255, 0.46);
          background: rgba(34, 114, 255, 0.13);
        }

        .collection-list button.danger,
        .scene-list button.danger {
          border-color: rgba(193, 74, 96, 0.3);
          color: #9a3551;
          background: rgba(255, 237, 241, 0.72);
        }

        .stage-column {
          padding: 8px;
          display: grid;
          gap: 6px;
          grid-template-rows: auto auto auto minmax(0, 1fr);
          min-height: 0;
          overflow: hidden;
        }

        .stage-topbar {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 6px;
          align-items: center;
          border: 1px solid var(--line);
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.66);
          padding: 6px;
        }

        .stage-topbar.compact {
          min-height: 44px;
        }

        .stage-top-left,
        .stage-top-right {
          display: flex;
          gap: 5px;
          align-items: center;
          flex-wrap: wrap;
        }

        .micro-metric {
          font-size: 11px;
          color: var(--text-soft);
          border: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.78);
          border-radius: 999px;
          padding: 4px 8px;
        }

        .capture-dock {
          border: 1px solid var(--line);
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.72);
          padding: 8px;
          display: grid;
          gap: 6px;
        }

        .capture-dock.collapsed {
          gap: 4px;
        }

        .capture-header {
          display: grid;
          gap: 1px;
        }

        .capture-header strong {
          font-size: 12px;
        }

        .capture-header span {
          font-size: 11px;
          color: var(--text-soft);
        }

        .capture-controls {
          display: grid;
          grid-template-columns: minmax(160px, 1fr) repeat(3, auto);
          gap: 5px;
        }

        .capture-inline {
          display: grid;
          grid-template-columns: minmax(200px, 1fr) auto auto;
          gap: 6px;
          align-items: center;
        }

        .capture-inline input {
          height: 36px;
        }

        .capture-dock.collapsed textarea,
        .capture-dock.collapsed .capture-controls {
          display: none;
        }

        .queue-bar {
          border: 1px solid var(--line);
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.7);
          padding: 8px;
          display: grid;
          gap: 8px;
          max-height: 180px;
          overflow: auto;
        }

        .queue-head {
          display: grid;
          grid-template-columns: auto auto 1fr;
          gap: 10px;
          align-items: center;
        }

        .queue-head strong {
          font-size: 13px;
        }

        .queue-head span {
          font-size: 12px;
          color: var(--text-soft);
        }

        .queue-actions {
          justify-self: end;
          display: flex;
          gap: 6px;
        }

        .queue-track {
          height: 6px;
          border-radius: 999px;
          overflow: hidden;
          background: rgba(32, 68, 127, 0.14);
        }

        .queue-track span {
          display: block;
          height: 100%;
          border-radius: 999px;
          background: linear-gradient(90deg, #2a75ff, #6ca8ff);
        }

        .queue-bar ul {
          margin: 0;
          padding: 0;
          list-style: none;
          display: grid;
          gap: 4px;
        }

        .queue-bar li {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px;
          font-size: 11px;
          padding: 4px 6px;
          border-radius: 10px;
          border: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.74);
        }

        .queue-bar li.done {
          border-color: rgba(47, 166, 120, 0.34);
        }

        .queue-bar li.failed {
          border-color: rgba(191, 70, 92, 0.38);
        }

        .stage-viewport {
          position: relative;
          flex: 1;
          min-height: clamp(420px, 64vh, 980px);
          height: 100%;
          border: 1px solid var(--line);
          border-radius: 18px;
          overflow: hidden;
          background: var(--bg-soft);
          cursor: grab;
        }

        .stage-viewport:active {
          cursor: grabbing;
        }

        .stage-viewport.drop-active {
          border-color: rgba(28, 111, 255, 0.48);
          box-shadow: inset 0 0 0 2px rgba(33, 112, 255, 0.18);
        }

        .stage-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(to right, rgba(49, 86, 147, 0.08) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(49, 86, 147, 0.08) 1px, transparent 1px);
          background-size: 42px 42px;
          pointer-events: none;
        }

        .stage-scene {
          position: absolute;
          inset: 0;
          transform-origin: 0 0;
        }

        .matrix-guides {
          position: absolute;
          inset: 0;
          color: rgba(36, 67, 114, 0.48);
          font-size: 14px;
          pointer-events: none;
        }

        .board-links {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        .category-bubble {
          position: absolute;
          transform: translate(-50%, -50%);
          border-radius: 999px;
          border: 1px solid var(--line);
          display: grid;
          place-items: center;
          gap: 2px;
          text-align: center;
          color: var(--text-soft);
          pointer-events: auto;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .category-bubble strong {
          color: var(--text);
          font-size: 15px;
          max-width: 170px;
        }

        .category-bubble span,
        .category-bubble em {
          font-size: 12px;
          font-style: normal;
        }

        .category-bubble.collapsed {
          border-style: dashed;
          opacity: 0.72;
        }

        .web-node {
          position: absolute;
          width: ${NODE_WIDTH}px;
          min-height: ${NODE_BODY_HEIGHT}px;
          transform: translate(-50%, -50%);
          border-radius: 18px;
          border: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.9);
          box-shadow: 0 14px 28px rgba(20, 46, 88, 0.13);
          padding: 10px;
          display: grid;
          gap: 7px;
          cursor: grab;
          user-select: none;
          transition: box-shadow 0.2s ease, border-color 0.2s ease;
        }

        .web-node:hover {
          box-shadow: 0 18px 32px rgba(20, 46, 88, 0.18);
        }

        .web-node.selected {
          border-color: rgba(33, 106, 251, 0.56);
          box-shadow: 0 18px 38px rgba(31, 107, 255, 0.2);
        }

        .web-node.active {
          outline: 2px solid rgba(31, 103, 240, 0.4);
          outline-offset: 2px;
        }

        .web-node.collapsed {
          min-height: ${NODE_COLLAPSED_HEIGHT}px;
          gap: 4px;
        }

        .web-node header {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 6px;
          align-items: center;
        }

        .type-tag {
          justify-self: start;
          font-size: 10px;
          padding: 4px 8px;
          border-radius: 999px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-soft);
          border: 1px solid rgba(42, 76, 136, 0.18);
        }

        .score-row {
          display: inline-flex;
          gap: 6px;
          align-items: center;
        }

        .freshness,
        .score {
          font-size: 11px;
          padding: 4px 7px;
          border-radius: 999px;
          border: 1px solid var(--line);
          color: var(--text-soft);
          background: rgba(255, 255, 255, 0.84);
        }

        .freshness.good {
          border-color: rgba(43, 159, 112, 0.38);
          color: #1d8059;
          background: rgba(214, 249, 234, 0.7);
        }

        .freshness.warm {
          border-color: rgba(214, 141, 52, 0.36);
          color: #98642c;
          background: rgba(255, 241, 219, 0.72);
        }

        .freshness.risk {
          border-color: rgba(199, 78, 101, 0.36);
          color: #a7344c;
          background: rgba(255, 234, 239, 0.72);
        }

        .score {
          color: var(--text);
          font-weight: 700;
        }

        .web-node h4 {
          margin: 0;
          font-size: 18px;
          line-height: 1.2;
          letter-spacing: -0.01em;
          color: var(--text);
        }

        .web-node p {
          margin: 0;
          font-size: 13px;
          color: var(--text-soft);
          line-height: 1.4;
        }

        .meta-row {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          font-size: 11px;
          color: var(--text-soft);
        }

        .tag-row {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
        }

        .tag-row span {
          font-size: 10px;
          border: 1px solid var(--line);
          padding: 3px 7px;
          border-radius: 999px;
          color: var(--text-soft);
          background: rgba(255, 255, 255, 0.72);
        }

        .web-node footer {
          display: flex;
          gap: 5px;
          flex-wrap: wrap;
        }

        .web-node footer button {
          border: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.84);
          border-radius: 999px;
          font-size: 11px;
          padding: 4px 8px;
          cursor: pointer;
          color: var(--text-soft);
        }

        .web-node footer button:hover {
          border-color: var(--line-strong);
          color: var(--text);
        }

        .list-view,
        .timeline-view {
          position: absolute;
          inset: 0;
          padding: 12px;
          overflow: auto;
        }

        .list-view table {
          width: 100%;
          border-collapse: collapse;
          border: 1px solid var(--line);
          border-radius: 12px;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.78);
        }

        .list-view th,
        .list-view td {
          border-bottom: 1px solid var(--line);
          padding: 9px 8px;
          text-align: left;
          font-size: 12px;
        }

        .list-view th {
          color: var(--text-soft);
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          font-size: 11px;
          background: rgba(255, 255, 255, 0.84);
        }

        .list-view tr.selected {
          background: rgba(37, 111, 252, 0.08);
        }

        .list-view .row-title {
          border: none;
          background: transparent;
          padding: 0;
          text-align: left;
          color: var(--text);
          border-radius: 0;
        }

        .row-actions {
          display: flex;
          gap: 5px;
          flex-wrap: wrap;
        }

        .timeline-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }

        .timeline-controls h3 {
          margin: 0;
          font-size: 14px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--text-soft);
        }

        .timeline-view ul {
          margin: 0;
          padding: 0;
          list-style: none;
          display: grid;
          gap: 8px;
        }

        .timeline-view li {
          border: 1px solid var(--line);
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.76);
          padding: 8px;
          display: grid;
          gap: 6px;
        }

        .timeline-view li.sev-high {
          border-color: rgba(188, 70, 94, 0.38);
        }

        .timeline-view li.sev-medium {
          border-color: rgba(208, 146, 62, 0.34);
        }

        .timeline-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          font-size: 11px;
          color: var(--text-soft);
        }

        .timeline-view h4 {
          margin: 0;
          font-size: 14px;
          color: var(--text);
        }

        .timeline-view p {
          margin: 0;
          font-size: 12px;
          color: var(--text-soft);
        }

        .stage-controls {
          position: absolute;
          right: 12px;
          bottom: 12px;
          display: inline-flex;
          gap: 4px;
          align-items: center;
          border: 1px solid var(--line);
          border-radius: 999px;
          padding: 4px;
          background: rgba(255, 255, 255, 0.88);
          backdrop-filter: blur(8px);
        }

        .stage-controls button {
          border: 1px solid var(--line);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.86);
          padding: 4px 9px;
          cursor: pointer;
          color: var(--text);
          font-size: 12px;
        }

        .stage-controls span {
          font-size: 11px;
          color: var(--text-soft);
          padding: 0 6px;
        }

        .mini-map {
          position: absolute;
          left: 12px;
          bottom: 12px;
          width: 140px;
          height: 88px;
          border: 1px solid var(--line);
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.84);
          overflow: hidden;
          backdrop-filter: blur(8px);
        }

        .mini-map span {
          position: absolute;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: rgba(46, 83, 148, 0.6);
          transform: translate(-50%, -50%);
        }

        .mini-map span.selected {
          width: 8px;
          height: 8px;
          background: rgba(28, 104, 255, 0.9);
        }

        .insight-panel {
          padding: 10px;
          display: grid;
          grid-template-rows: auto auto 1fr;
          gap: 8px;
          min-height: 0;
        }

        .panel-header {
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 10px;
          background: rgba(255, 255, 255, 0.74);
        }

        .panel-header h3 {
          margin: 0;
          font-size: 13px;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          color: var(--text-soft);
        }

        .panel-header p {
          margin: 6px 0 0;
          font-size: 12px;
          color: var(--text-soft);
        }

        .tab-row {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 6px;
          background: rgba(255, 255, 255, 0.72);
        }

        .tab-row button.active {
          border-color: rgba(28, 106, 255, 0.5);
          background: rgba(28, 106, 255, 0.14);
          color: #1656c6;
        }

        .tab-content {
          border: 1px solid var(--line);
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.74);
          padding: 10px;
          display: grid;
          gap: 8px;
          overflow: auto;
        }

        .tab-content section {
          border: 1px solid var(--line);
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.84);
          padding: 8px;
          display: grid;
          gap: 6px;
        }

        .tab-content h4 {
          margin: 0;
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-soft);
        }

        .tab-content p,
        .tab-content li,
        .tab-content small,
        .tab-content label {
          margin: 0;
          font-size: 12px;
          color: var(--text-soft);
          line-height: 1.45;
        }

        .tab-content ul {
          margin: 0;
          padding-left: 18px;
          display: grid;
          gap: 4px;
        }

        .chip-wrap {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .chip {
          border: 1px solid var(--line);
          border-radius: 999px;
          padding: 4px 8px;
          background: rgba(255, 255, 255, 0.86);
          font-size: 11px;
          color: var(--text-soft);
        }

        .radar-row {
          display: flex;
          gap: 6px;
          align-items: center;
        }

        .radar-row span {
          font-size: 10px;
          border: 1px solid var(--line);
          border-radius: 999px;
          padding: 2px 6px;
          background: rgba(255, 255, 255, 0.8);
          color: var(--text-soft);
        }

        .radar-row strong {
          font-size: 12px;
          color: var(--text);
        }

        @media (max-width: 1440px) {
          .workspace-grid {
            grid-template-columns: 270px minmax(0, 1fr) 320px;
          }

          .quick-strip {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 1160px) {
          .top-shell,
          .quick-strip,
          .control-strip,
          .action-strip {
            grid-template-columns: 1fr;
          }

          .workspace-grid {
            grid-template-columns: 1fr;
          }

          .navigator,
          .insight-panel {
            max-height: 320px;
          }

          .focus-mode .workspace-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 800px) {
          .ingest-shell {
            padding: 8px;
          }

          .search-panel input {
            min-width: 0;
            flex-basis: 100%;
          }

          .filter-row {
            grid-template-columns: repeat(2, minmax(120px, 1fr));
          }

          .capture-inline {
            grid-template-columns: 1fr;
          }

          .capture-controls {
            grid-template-columns: 1fr 1fr;
          }

          .stage-topbar {
            grid-template-columns: 1fr;
          }

          .brand-panel.compact {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
