import { z } from "zod";

export const runtime = "nodejs";

export type CardType =
  | "TOOL"
  | "ARTICLE"
  | "VIDEO"
  | "SOCIAL_POST"
  | "GITHUB"
  | "PAPER"
  | "PDF"
  | "OTHER";

export type Consensus = null | {
  overall_sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "MIXED";
  key_themes: string[];
  representative_points: string[];
  dissenting_points: string[];
};

export type RelevanceHistoryPoint = {
  at: string;
  score: number;
};

export type RadarEvent = {
  id: string;
  timestamp: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  title: string;
  detail: string;
  card_id?: string;
  category?: string;
};

export type LinkCard = {
  id: string;
  url: string;
  canonical_url: string;
  title: string;
  type: CardType;
  source_domain: string;
  ingested_at: string;
  last_checked_at: string;
  summary_short: string;
  summary_full: string[];
  usefulness: {
    best_for: string[];
    pros: string[];
    cons: string[];
    who_should_use: string[];
    who_should_skip: string[];
  };
  tags: string[];
  categories: {
    primary: string;
    secondary: string[];
  };
  entities: Array<{
    name: string;
    type: "PRODUCT" | "COMPANY" | "PERSON" | "CONCEPT";
    confidence: number;
  }>;
  consensus: Consensus;
  relevance: {
    score: number;
    explanation: string[];
    longevity_bucket: "3-6mo" | "6-12mo" | "12mo+";
    staleness_flags: string[];
  };
  confidence_notes: string[];
  user_notes: string;
  user_intent: string;
  pinned: boolean;
  processing_status: "complete";
  category_pipeline: {
    deterministic: CategoryCandidate;
    llm: CategoryCandidate | null;
    embedding: CategoryCandidate;
    final: CategoryCandidate;
  };
  relevance_history: RelevanceHistoryPoint[];
  change_log: RadarEvent[];
};

export type CategoryCandidate = {
  primary: string;
  secondary: string[];
  confidence: number;
  reasons: string[];
  tags?: string[];
};

const requestSchema = z.object({
  url: z.string().url(),
  intent: z.string().max(240).optional().default(""),
});

const refreshSchema = z.object({
  mode: z.enum(["daily", "weekly"]).default("daily"),
  cards: z.array(z.any()).max(500),
});

const insightsSchema = z.object({
  cards: z.array(z.any()).max(500),
  decision: z
    .object({
      goal: z.string().max(400).optional().default(""),
      budget: z.enum(["low", "medium", "high"]).optional().default("medium"),
      stack: z.string().max(200).optional().default(""),
      priority: z.enum(["speed", "depth", "stability"]).optional().default("stability"),
    })
    .optional()
    .default({ goal: "", budget: "medium", stack: "", priority: "stability" }),
});

const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "gclid",
  "fbclid",
  "mc_cid",
  "mc_eid",
  "si",
];

const BASE_SCORE_BY_TYPE: Record<CardType, number> = {
  TOOL: 76,
  ARTICLE: 64,
  VIDEO: 70,
  SOCIAL_POST: 67,
  GITHUB: 74,
  PAPER: 66,
  PDF: 60,
  OTHER: 58,
};

const DETERMINISTIC_CATEGORY_BY_TYPE: Record<CardType, { primary: string; secondary: string[] }> = {
  TOOL: { primary: "Developer Tools", secondary: ["AI/ML", "Productivity"] },
  ARTICLE: { primary: "Research & Analysis", secondary: ["Industry"] },
  VIDEO: { primary: "AI/ML Tutorials", secondary: ["Learning"] },
  SOCIAL_POST: { primary: "AI/ML Strategy", secondary: ["Industry Analysis"] },
  GITHUB: { primary: "AI/ML Frameworks", secondary: ["Open Source", "Developer Tools"] },
  PAPER: { primary: "Research", secondary: ["Academic"] },
  PDF: { primary: "Documents", secondary: ["Reference"] },
  OTHER: { primary: "General Intelligence", secondary: ["Reference"] },
};

const CATEGORY_FINGERPRINTS: Array<{ primary: string; secondary: string[]; tokens: string[] }> = [
  {
    primary: "Developer Tools",
    secondary: ["AI/ML", "Productivity"],
    tokens: [
      "tool",
      "editor",
      "developer",
      "sdk",
      "api",
      "platform",
      "automation",
      "copilot",
      "workflow",
      "integration",
    ],
  },
  {
    primary: "AI/ML Frameworks",
    secondary: ["Open Source", "Developer Tools"],
    tokens: [
      "framework",
      "agent",
      "rag",
      "model",
      "inference",
      "langchain",
      "llm",
      "graph",
      "repository",
      "opensource",
    ],
  },
  {
    primary: "AI/ML Strategy",
    secondary: ["Industry Analysis"],
    tokens: [
      "strategy",
      "market",
      "trend",
      "opinion",
      "take",
      "twitter",
      "x",
      "founder",
      "narrative",
      "sentiment",
    ],
  },
  {
    primary: "AI/ML Tutorials",
    secondary: ["Learning"],
    tokens: [
      "tutorial",
      "video",
      "walkthrough",
      "demo",
      "course",
      "youtube",
      "lesson",
      "learn",
      "guide",
      "build",
    ],
  },
  {
    primary: "Research & Analysis",
    secondary: ["Industry", "Reference"],
    tokens: [
      "article",
      "analysis",
      "benchmark",
      "report",
      "comparison",
      "study",
      "findings",
      "review",
      "insight",
      "method",
    ],
  },
  {
    primary: "Research",
    secondary: ["Academic", "Reference"],
    tokens: [
      "paper",
      "arxiv",
      "dataset",
      "methodology",
      "citation",
      "experiment",
      "academic",
      "results",
      "abstract",
      "publication",
    ],
  },
  {
    primary: "Documents",
    secondary: ["Reference"],
    tokens: [
      "pdf",
      "document",
      "whitepaper",
      "deck",
      "spec",
      "proposal",
      "manual",
      "brief",
      "doc",
      "slides",
    ],
  },
  {
    primary: "General Intelligence",
    secondary: ["Reference"],
    tokens: [
      "resource",
      "news",
      "update",
      "note",
      "link",
      "overview",
      "context",
      "reference",
      "signal",
      "intelligence",
    ],
  },
];

function clampScore(score: number) {
  return Math.max(20, Math.min(95, Math.round(score)));
}

function nowIso() {
  return new Date().toISOString();
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeUrl(raw: string) {
  const parsed = new URL(raw);
  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLowerCase();
  if (parsed.hostname.startsWith("www.")) {
    parsed.hostname = parsed.hostname.slice(4);
  }
  for (const key of TRACKING_PARAMS) {
    parsed.searchParams.delete(key);
  }
  if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }
  return parsed.toString();
}

function hostToName(host: string) {
  return host
    .split(".")
    .slice(0, 2)
    .join(" ")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

function titleFromUrl(url: URL) {
  const path = url.pathname.split("/").filter(Boolean);
  const tail = path[path.length - 1]?.replace(/[-_]/g, " ");
  if (tail) {
    const cleaned = decodeURIComponent(tail);
    return cleaned.replace(/\b\w/g, c => c.toUpperCase());
  }
  return `${hostToName(url.hostname)} Overview`;
}

function detectType(url: URL): CardType {
  const host = url.hostname;
  const path = url.pathname.toLowerCase();
  if (host.includes("github.com")) return "GITHUB";
  if (host.includes("youtube.com") || host.includes("youtu.be") || host.includes("vimeo.com"))
    return "VIDEO";
  if (host.includes("x.com") || host.includes("twitter.com")) return "SOCIAL_POST";
  if (path.endsWith(".pdf")) return "PDF";
  if (host.includes("arxiv.org")) return "PAPER";
  if (/\.io$|\.ai$|\.dev$|\.app$/.test(host) || path === "/" || path.startsWith("/pricing")) {
    return "TOOL";
  }
  if (host.includes("medium.com") || host.includes("substack.com") || path.includes("/blog")) {
    return "ARTICLE";
  }
  return "ARTICLE";
}

function extractMeta(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*name=["']${escaped}["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*property=["']${escaped}["'][^>]*>`, "i"),
  ];
  for (const regex of patterns) {
    const match = html.match(regex);
    if (match?.[1]) return normalizeWhitespace(decodeHtmlEntities(match[1]));
  }
  return "";
}

function extractTitle(html: string) {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch?.[1]) {
    return normalizeWhitespace(decodeHtmlEntities(titleMatch[1]));
  }
  return "";
}

export async function fetchMetadata(url: string) {
  const notes: string[] = [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "INGEST.IO Bot/2.0 (+https://ingest.io)",
        accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
      },
      cache: "no-store",
    });
    clearTimeout(timeout);

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    const lastModified = response.headers.get("last-modified") || "";
    const finalUrl = response.url || url;

    if (!response.ok) {
      notes.push(`Source returned HTTP ${response.status}; used URL-level inference.`);
      return {
        ok: false,
        title: "",
        description: "",
        siteName: "",
        canonicalUrl: "",
        contentType,
        lastModified,
        finalUrl,
        confidenceNotes: notes,
      };
    }

    if (!contentType.includes("text/html")) {
      notes.push("Content was not HTML; extracted minimal metadata from headers and URL.");
      return {
        ok: true,
        title: "",
        description: "",
        siteName: "",
        canonicalUrl: "",
        contentType,
        lastModified,
        finalUrl,
        confidenceNotes: notes,
      };
    }

    const html = (await response.text()).slice(0, 350000);
    const canonicalUrl = extractMeta(html, "og:url");
    const title =
      extractMeta(html, "og:title") || extractMeta(html, "twitter:title") || extractTitle(html);
    const description =
      extractMeta(html, "description") ||
      extractMeta(html, "og:description") ||
      extractMeta(html, "twitter:description");
    const siteName = extractMeta(html, "og:site_name");

    notes.push("Title/description extracted from page metadata.");

    return {
      ok: true,
      title,
      description,
      siteName,
      canonicalUrl,
      contentType,
      lastModified,
      finalUrl,
      confidenceNotes: notes,
    };
  } catch (error) {
    clearTimeout(timeout);
    const message = error instanceof Error ? error.message : "unknown error";
    notes.push(`Fetch unavailable (${message}); generated structured card from URL and heuristics.`);
    return {
      ok: false,
      title: "",
      description: "",
      siteName: "",
      canonicalUrl: "",
      contentType: "",
      lastModified: "",
      finalUrl: url,
      confidenceNotes: notes,
    };
  }
}

function tokenize(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(token => token.length > 2);
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function deterministicCategory(params: {
  type: CardType;
  title: string;
  description: string;
  url: string;
}): CategoryCandidate {
  const base = DETERMINISTIC_CATEGORY_BY_TYPE[params.type] || DETERMINISTIC_CATEGORY_BY_TYPE.OTHER;
  const reasons = [`Base category from detected content type ${params.type}.`];

  const raw = `${params.title} ${params.description} ${params.url}`.toLowerCase();
  let confidence = 0.67;
  if (raw.includes("framework") || raw.includes("repository") || raw.includes("github")) {
    confidence += 0.08;
    if (params.type !== "GITHUB") {
      reasons.push("Keyword evidence indicates framework/repository semantics.");
    }
  }
  if (raw.includes("tutorial") || raw.includes("walkthrough")) {
    confidence += 0.05;
    reasons.push("Learning-oriented keywords present in metadata.");
  }

  return {
    primary: base.primary,
    secondary: base.secondary,
    confidence: Math.min(0.92, confidence),
    reasons,
  };
}

function embeddingFallbackCategory(params: {
  type: CardType;
  title: string;
  description: string;
  intent: string;
  tags: string[];
}): CategoryCandidate {
  const tokenList = tokenize(`${params.title} ${params.description} ${params.intent} ${params.tags.join(" ")}`);
  const tokenSet = new Set(tokenList);

  let best = CATEGORY_FINGERPRINTS[0];
  let bestScore = -1;

  for (const candidate of CATEGORY_FINGERPRINTS) {
    const overlap = candidate.tokens.filter(token => tokenSet.has(token)).length;
    const score = overlap / candidate.tokens.length;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return {
    primary: best.primary,
    secondary: best.secondary,
    confidence: Math.max(0.35, Math.min(0.86, 0.4 + bestScore * 2.2)),
    reasons: [
      "Embedding fallback approximated via lexical similarity to category fingerprints.",
      `Matched ${Math.max(0, Math.round(bestScore * best.tokens.length))} semantic tokens for ${best.primary}.`,
    ],
  };
}

async function llmCategory(params: {
  title: string;
  description: string;
  source_domain: string;
  type: CardType;
  intent: string;
}) {
  const openAiKey = (process.env.OPENAI_API_KEY || "").trim();
  const anthropicKey = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (!openAiKey && !anthropicKey) return null;

  const categories = CATEGORY_FINGERPRINTS.map(item => item.primary);
  const prompt = [
    "Classify this ingested resource into one of the provided categories.",
    `Allowed categories: ${categories.join(", ")}`,
    "Return strict JSON with keys: primary, secondary (array), confidence (0-1), reasons (array max 3), tags (array max 6).",
    `Type: ${params.type}`,
    `Domain: ${params.source_domain}`,
    `Title: ${params.title}`,
    `Description: ${params.description || "(none)"}`,
    `Intent: ${params.intent || "(none)"}`,
  ].join("\n");

  const parseJson = (raw: string) => {
    try {
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start < 0 || end < 0) return null;
      const parsed = JSON.parse(raw.slice(start, end + 1)) as {
        primary?: string;
        secondary?: string[];
        confidence?: number;
        reasons?: string[];
        tags?: string[];
      };
      if (!parsed?.primary) return null;
      return {
        primary: parsed.primary,
        secondary: Array.isArray(parsed.secondary) ? parsed.secondary.slice(0, 3) : ["Reference"],
        confidence:
          typeof parsed.confidence === "number"
            ? Math.max(0.15, Math.min(0.98, parsed.confidence))
            : 0.68,
        reasons: Array.isArray(parsed.reasons)
          ? parsed.reasons.slice(0, 3)
          : ["LLM category selection based on source context."],
        tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 6) : [],
      } satisfies CategoryCandidate;
    } catch {
      return null;
    }
  };

  try {
    if (openAiKey) {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          input: prompt,
          max_output_tokens: 350,
        }),
      });
      const text = await response.text();
      if (response.ok) {
        const direct = parseJson(text);
        if (direct) return direct;
        try {
          const parsed = JSON.parse(text) as { output_text?: string };
          const fallback = parseJson(parsed.output_text || "");
          if (fallback) return fallback;
        } catch {}
      }
    }

    if (anthropicKey) {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-5-haiku-latest",
          max_tokens: 320,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const text = await response.text();
      if (response.ok) {
        const fallback = parseJson(text);
        if (fallback) return fallback;
        try {
          const parsed = JSON.parse(text) as { content?: Array<{ type?: string; text?: string }> };
          const joined = (parsed.content || [])
            .filter(item => item?.type === "text")
            .map(item => item.text || "")
            .join("\n");
          const parsedJoined = parseJson(joined);
          if (parsedJoined) return parsedJoined;
        } catch {}
      }
    }
  } catch {
    return null;
  }

  return null;
}

function tagFromType(type: CardType) {
  return type.toLowerCase().replace("_", " ");
}

function deriveTags(params: {
  type: CardType;
  host: string;
  title: string;
  intent: string;
  llmTags: string[];
}) {
  const tags = new Set<string>();
  tags.add(tagFromType(params.type));
  tags.add(params.host.split(".")[0]);

  const raw = `${params.title} ${params.intent}`.toLowerCase();
  if (raw.includes("agent")) tags.add("agents");
  if (raw.includes("ai")) tags.add("ai");
  if (raw.includes("framework")) tags.add("framework");
  if (raw.includes("product")) tags.add("product");
  if (raw.includes("open source") || raw.includes("oss")) tags.add("open-source");
  if (raw.includes("video") || params.type === "VIDEO") tags.add("tutorial");
  if (raw.includes("github") || params.type === "GITHUB") tags.add("developer tools");
  for (const tag of params.llmTags || []) {
    tags.add(String(tag).toLowerCase());
  }

  return Array.from(tags).slice(0, 10);
}

function deriveEntities(title: string, host: string, intent: string) {
  const entities: LinkCard["entities"] = [{ name: hostToName(host), type: "COMPANY", confidence: 0.86 }];

  const candidate = title
    .split(/[\-|:|]/)
    .map(part => normalizeWhitespace(part))
    .find(Boolean);
  if (candidate && candidate.length > 2) {
    entities.unshift({ name: candidate, type: "PRODUCT", confidence: 0.8 });
  }

  if (intent && intent.length > 10) {
    entities.push({
      name: intent.split(/\s+/).slice(0, 3).join(" "),
      type: "CONCEPT",
      confidence: 0.56,
    });
  }
  return entities.slice(0, 6);
}

function buildConsensus(type: CardType): Consensus {
  if (type !== "SOCIAL_POST") return null;
  return {
    overall_sentiment: "MIXED",
    key_themes: [
      "Original claim has momentum but requires broader validation.",
      "Replies separate strategic value from implementation risk.",
      "Confidence depends on reply volume and source diversity.",
    ],
    representative_points: [
      "Supporters align on direction and practical upside.",
      "Practitioners cite emerging production examples.",
    ],
    dissenting_points: [
      "Counterpoints flag survivorship bias and hype inflation.",
      "Some replies argue simpler workflows solve most use cases.",
    ],
  };
}

function buildUsefulness(type: CardType) {
  switch (type) {
    case "GITHUB":
      return {
        best_for: ["Evaluating open-source project fit", "Checking momentum and ecosystem relevance"],
        pros: ["Transparent repository signal", "Easy competitive comparison"],
        cons: ["README quality can mask gaps", "Stars can overstate maturity"],
        who_should_use: ["Engineers making build-vs-buy decisions", "Teams benchmarking frameworks"],
        who_should_skip: ["Non-technical users seeking turnkey recommendations"],
      };
    case "VIDEO":
      return {
        best_for: ["Learning implementation patterns quickly", "Capturing creator intent"],
        pros: ["High information density", "Great onboarding resource"],
        cons: ["API details can age fast", "Transcript quality varies"],
        who_should_use: ["Operators evaluating workflows", "Demo-driven teams"],
        who_should_skip: ["Users needing strictly sourced written references"],
      };
    case "SOCIAL_POST":
      return {
        best_for: ["Tracking emerging narratives", "Collecting directional sentiment"],
        pros: ["Fast market pulse", "Diverse viewpoint surface"],
        cons: ["High noise-to-signal", "Often low evidence depth"],
        who_should_use: ["Founders monitoring category shifts", "Researchers tracking opinion patterns"],
        who_should_skip: ["Teams requiring audited sources"],
      };
    case "TOOL":
      return {
        best_for: ["Comparing product options", "Building evaluation shortlists"],
        pros: ["Structured snapshots are easy to revisit", "Strong fit for decision workflows"],
        cons: ["Landing pages bias toward strengths", "Hands-on validation still needed"],
        who_should_use: ["Product and engineering teams", "Founders making stack choices"],
        who_should_skip: ["Users expecting complete due diligence without testing"],
      };
    default:
      return {
        best_for: ["Building a searchable source-of-truth library", "Capturing context while links are fresh"],
        pros: ["Transforms passive links into structured intelligence", "Keeps intent attached to each source"],
        cons: ["Auto-inferred details can be incomplete", "Needs periodic refresh to stay current"],
        who_should_use: ["Teams managing high link volume", "Researchers curating references over time"],
        who_should_skip: ["Users needing only simple bookmarking"],
      };
  }
}

function buildSummary(params: {
  type: CardType;
  title: string;
  description: string;
  host: string;
  intent: string;
}) {
  const hostName = hostToName(params.host);
  const summaryShort =
    params.description && params.description.length > 40
      ? params.description.slice(0, 280)
      : `${params.title} was ingested from ${hostName} and converted into a structured intelligence card for comparison and retrieval.`;

  const summaryFull = [
    `Classified as ${params.type.replace("_", " ").toLowerCase()} via URL, metadata, and category-pipeline signals.`,
    params.description
      ? "Metadata extraction succeeded and provided enough context for first-pass analysis."
      : "Metadata was sparse; summary includes URL-level inference with lower confidence.",
    "Card includes usefulness guidance, tags, entities, relevance scoring, and confidence notes.",
    "Use intent and notes fields to preserve decision context over time.",
  ];

  if (params.intent) {
    summaryFull.push(`Saved with explicit intent: "${params.intent}".`);
  }

  return { summaryShort, summaryFull };
}

function relevanceFromSignals(params: {
  type: CardType;
  metadata: Awaited<ReturnType<typeof fetchMetadata>>;
  previousScore?: number;
  refreshMode?: "daily" | "weekly";
}) {
  let score = BASE_SCORE_BY_TYPE[params.type];
  const explanation: string[] = [];
  const stalenessFlags: string[] = [];

  if (params.metadata.ok) {
    score += 5;
    explanation.push("Source responded successfully during ingestion.");
  } else {
    score -= 12;
    explanation.push("Could not fully fetch source content; confidence reduced.");
    stalenessFlags.push("Live source fetch failed, so relevance is based on lower-confidence signals.");
  }

  if (params.metadata.description && params.metadata.description.length > 120) {
    score += 3;
    explanation.push("Rich metadata provided clearer context for scoring.");
  } else {
    stalenessFlags.push("Sparse metadata; this card should be reviewed manually.");
  }

  if (params.metadata.lastModified) {
    explanation.push("HTTP last-modified signal was available for freshness checks.");
  } else {
    explanation.push("No reliable update timestamp surfaced by the source.");
  }

  if (params.type === "GITHUB") {
    score += 4;
    explanation.push("Repository source enables ongoing maintenance signals.");
  }
  if (params.type === "SOCIAL_POST") {
    score -= 2;
    explanation.push("Social sentiment can shift quickly, lowering longevity confidence.");
  }

  if (typeof params.previousScore === "number") {
    const blended = Math.round(params.previousScore * 0.45 + score * 0.55);
    score = blended;
    explanation.push("Historical score blended with latest refresh signals.");
  }

  if (params.refreshMode === "daily") {
    explanation.push("Daily refresh applied lightweight re-score and drift checks.");
  }
  if (params.refreshMode === "weekly") {
    explanation.push("Weekly deep refresh applied full recategorization and source checks.");
  }

  const normalizedScore = clampScore(score);
  const longevity_bucket =
    normalizedScore >= 80 ? "12mo+" : normalizedScore >= 60 ? "6-12mo" : "3-6mo";

  return {
    score: normalizedScore,
    explanation,
    longevity_bucket,
    staleness_flags: stalenessFlags,
  } satisfies LinkCard["relevance"];
}

function pickFinalCategory(input: {
  deterministic: CategoryCandidate;
  llm: CategoryCandidate | null;
  embedding: CategoryCandidate;
}): CategoryCandidate {
  if (input.llm && input.llm.confidence >= 0.67) {
    return {
      primary: input.llm.primary,
      secondary: input.llm.secondary,
      confidence: input.llm.confidence,
      reasons: ["LLM classifier selected final category.", ...input.llm.reasons.slice(0, 2)],
      tags: input.llm.tags || [],
    };
  }

  const strongest =
    input.embedding.confidence > input.deterministic.confidence
      ? input.embedding
      : input.deterministic;

  return {
    primary: strongest.primary,
    secondary: strongest.secondary,
    confidence: strongest.confidence,
    reasons: [
      "Final category selected from deterministic and embedding fallback confidence.",
      ...strongest.reasons.slice(0, 2),
    ],
  };
}

function normalizedCard(input: Partial<LinkCard>): LinkCard {
  const now = nowIso();
  return {
    id: input.id || crypto.randomUUID(),
    url: String(input.url || ""),
    canonical_url: String(input.canonical_url || input.url || ""),
    title: String(input.title || "Untitled link"),
    type: (input.type || "OTHER") as CardType,
    source_domain: String(input.source_domain || "unknown"),
    ingested_at: String(input.ingested_at || now),
    last_checked_at: String(input.last_checked_at || now),
    summary_short: String(input.summary_short || "No summary available."),
    summary_full: Array.isArray(input.summary_full) ? input.summary_full.slice(0, 8) : [],
    usefulness: {
      best_for: Array.isArray(input.usefulness?.best_for) ? input.usefulness.best_for.slice(0, 6) : [],
      pros: Array.isArray(input.usefulness?.pros) ? input.usefulness.pros.slice(0, 6) : [],
      cons: Array.isArray(input.usefulness?.cons) ? input.usefulness.cons.slice(0, 6) : [],
      who_should_use: Array.isArray(input.usefulness?.who_should_use)
        ? input.usefulness.who_should_use.slice(0, 6)
        : [],
      who_should_skip: Array.isArray(input.usefulness?.who_should_skip)
        ? input.usefulness.who_should_skip.slice(0, 6)
        : [],
    },
    tags: Array.isArray(input.tags) ? unique(input.tags.map(tag => String(tag))).slice(0, 12) : [],
    categories: {
      primary: String(input.categories?.primary || "General Intelligence"),
      secondary: Array.isArray(input.categories?.secondary)
        ? unique(input.categories.secondary.map(item => String(item))).slice(0, 4)
        : ["Reference"],
    },
    entities: Array.isArray(input.entities)
      ? input.entities
          .map(entity => ({
            name: String(entity?.name || "Unknown"),
            type: (["PRODUCT", "COMPANY", "PERSON", "CONCEPT"] as const).includes(
              entity?.type as "PRODUCT" | "COMPANY" | "PERSON" | "CONCEPT"
            )
              ? (entity.type as "PRODUCT" | "COMPANY" | "PERSON" | "CONCEPT")
              : "CONCEPT",
            confidence:
              typeof entity?.confidence === "number"
                ? Math.max(0, Math.min(1, entity.confidence))
                : 0.5,
          }))
          .slice(0, 8)
      : [],
    consensus:
      input.consensus && typeof input.consensus === "object"
        ? {
            overall_sentiment:
              input.consensus.overall_sentiment === "POSITIVE" ||
              input.consensus.overall_sentiment === "NEGATIVE" ||
              input.consensus.overall_sentiment === "NEUTRAL" ||
              input.consensus.overall_sentiment === "MIXED"
                ? input.consensus.overall_sentiment
                : "MIXED",
            key_themes: Array.isArray(input.consensus.key_themes)
              ? input.consensus.key_themes.map(String).slice(0, 6)
              : [],
            representative_points: Array.isArray(input.consensus.representative_points)
              ? input.consensus.representative_points.map(String).slice(0, 6)
              : [],
            dissenting_points: Array.isArray(input.consensus.dissenting_points)
              ? input.consensus.dissenting_points.map(String).slice(0, 6)
              : [],
          }
        : null,
    relevance: {
      score:
        typeof input.relevance?.score === "number"
          ? Math.max(0, Math.min(100, Math.round(input.relevance.score)))
          : 50,
      explanation: Array.isArray(input.relevance?.explanation)
        ? input.relevance.explanation.map(String).slice(0, 8)
        : [],
      longevity_bucket:
        input.relevance?.longevity_bucket === "12mo+" ||
        input.relevance?.longevity_bucket === "6-12mo" ||
        input.relevance?.longevity_bucket === "3-6mo"
          ? input.relevance.longevity_bucket
          : "3-6mo",
      staleness_flags: Array.isArray(input.relevance?.staleness_flags)
        ? input.relevance.staleness_flags.map(String).slice(0, 8)
        : [],
    },
    confidence_notes: Array.isArray(input.confidence_notes)
      ? input.confidence_notes.map(String).slice(0, 10)
      : [],
    user_notes: String(input.user_notes || ""),
    user_intent: String(input.user_intent || ""),
    pinned: Boolean(input.pinned),
    processing_status: "complete" as const,
    category_pipeline:
      input.category_pipeline && typeof input.category_pipeline === "object"
        ? {
            deterministic: input.category_pipeline.deterministic,
            llm: input.category_pipeline.llm || null,
            embedding: input.category_pipeline.embedding,
            final: input.category_pipeline.final,
          }
        : {
            deterministic: {
              primary: "General Intelligence",
              secondary: ["Reference"],
              confidence: 0.4,
              reasons: ["Fallback"],
            },
            llm: null,
            embedding: {
              primary: "General Intelligence",
              secondary: ["Reference"],
              confidence: 0.4,
              reasons: ["Fallback"],
            },
            final: {
              primary: "General Intelligence",
              secondary: ["Reference"],
              confidence: 0.4,
              reasons: ["Fallback"],
            },
          },
    relevance_history: Array.isArray(input.relevance_history)
      ? input.relevance_history
          .map(point => ({ at: String(point?.at || now), score: Number(point?.score || 50) }))
          .slice(-30)
      : [{ at: now, score: Number(input.relevance?.score || 50) }],
    change_log: Array.isArray(input.change_log)
      ? input.change_log
          .map(event => {
            const normalizedEvent: RadarEvent = {
              id: String(event?.id || crypto.randomUUID()),
              timestamp: String(event?.timestamp || now),
              severity:
                event?.severity === "HIGH" ||
                event?.severity === "MEDIUM" ||
                event?.severity === "LOW"
                  ? event.severity
                  : "LOW",
              title: String(event?.title || "Update"),
              detail: String(event?.detail || ""),
            };
            if (event?.card_id) normalizedEvent.card_id = String(event.card_id);
            if (event?.category) normalizedEvent.category = String(event.category);
            return normalizedEvent;
          })
          .slice(-80)
      : [],
  } satisfies LinkCard;
}

export async function analyzeUrl(params: {
  url: string;
  intent: string;
  sourceCard?: Partial<LinkCard>;
  refreshMode?: "daily" | "weekly";
}) {
  const now = nowIso();
  const normalized = normalizeUrl(params.url);
  const metadata = await fetchMetadata(normalized);

  const canonicalCandidate = metadata.canonicalUrl
    ? normalizeUrl(metadata.canonicalUrl)
    : normalizeUrl(metadata.finalUrl || normalized);
  const parsed = new URL(canonicalCandidate);
  const type = detectType(parsed);
  const title = metadata.title || titleFromUrl(parsed);
  const sourceDomain = parsed.hostname;

  const deterministic = deterministicCategory({
    type,
    title,
    description: metadata.description,
    url: canonicalCandidate,
  });

  const embedding = embeddingFallbackCategory({
    type,
    title,
    description: metadata.description,
    intent: params.intent || "",
    tags: [],
  });

  const llm = await llmCategory({
    title,
    description: metadata.description,
    source_domain: sourceDomain,
    type,
    intent: params.intent,
  });

  const finalCategory = pickFinalCategory({ deterministic, llm, embedding });

  const tags = deriveTags({
    type,
    host: sourceDomain,
    title,
    intent: params.intent,
    llmTags: llm?.tags || [],
  });

  const { summaryShort, summaryFull } = buildSummary({
    type,
    title,
    description: metadata.description,
    host: sourceDomain,
    intent: params.intent,
  });

  const previousScore =
    typeof params.sourceCard?.relevance?.score === "number"
      ? Number(params.sourceCard.relevance.score)
      : undefined;

  const relevance = relevanceFromSignals({
    type,
    metadata,
    previousScore,
    refreshMode: params.refreshMode,
  });

  const history = Array.isArray(params.sourceCard?.relevance_history)
    ? params.sourceCard.relevance_history
        .map(point => ({ at: String(point?.at || now), score: Number(point?.score || 50) }))
        .slice(-20)
    : [];
  history.push({ at: now, score: relevance.score });

  const next = normalizedCard({
    id: params.sourceCard?.id || crypto.randomUUID(),
    url: normalized,
    canonical_url: canonicalCandidate,
    title,
    type,
    source_domain: sourceDomain,
    ingested_at: params.sourceCard?.ingested_at || now,
    last_checked_at: now,
    summary_short: summaryShort,
    summary_full: summaryFull,
    usefulness: buildUsefulness(type),
    tags,
    categories: {
      primary: finalCategory.primary,
      secondary: finalCategory.secondary,
    },
    entities: deriveEntities(title, sourceDomain, params.intent),
    consensus: buildConsensus(type),
    relevance,
    confidence_notes: [
      ...metadata.confidenceNotes,
      `Deterministic category confidence ${deterministic.confidence.toFixed(2)}.`,
      llm
        ? `LLM classifier available with confidence ${llm.confidence.toFixed(2)}.`
        : "LLM classifier unavailable; using deterministic + embedding fallback.",
      `Embedding fallback confidence ${embedding.confidence.toFixed(2)}.`,
    ],
    user_notes: params.sourceCard?.user_notes || "",
    user_intent: params.intent,
    pinned: Boolean(params.sourceCard?.pinned),
    processing_status: "complete",
    category_pipeline: {
      deterministic,
      llm,
      embedding,
      final: finalCategory,
    },
    relevance_history: history,
    change_log: Array.isArray(params.sourceCard?.change_log) ? params.sourceCard.change_log.slice(-80) : [],
  });

  return { card: next, metadata };
}

function scoreDelta(card: LinkCard) {
  const history = card.relevance_history || [];
  if (history.length < 2) return 0;
  const prev = history[history.length - 2]?.score || card.relevance.score;
  const next = history[history.length - 1]?.score || card.relevance.score;
  return next - prev;
}

export function computeCategoryAggregates(cards: LinkCard[]) {
  const groups = new Map<string, LinkCard[]>();
  for (const card of cards) {
    const key = card.categories?.primary || "General Intelligence";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)?.push(card);
  }

  const results = Array.from(groups.entries()).map(([primary, list]) => {
    const count = list.length;
    const avgRelevance = Math.round(list.reduce((sum, item) => sum + (item.relevance?.score || 0), 0) / Math.max(1, count));
    const staleCount = list.filter(item => (item.relevance?.staleness_flags || []).length > 0 || (item.relevance?.score || 0) < 50).length;
    const trendDelta =
      Math.round((list.reduce((sum, item) => sum + scoreDelta(item), 0) / Math.max(1, count)) * 10) / 10;
    const risingCount = list.filter(item => scoreDelta(item) >= 4).length;
    const needsReview = list.filter(item => (item.confidence_notes || []).some(note => /fallback|sparse|lower-confidence/i.test(note))).length;

    const topCards = [...list]
      .sort((a, b) => (b.relevance?.score || 0) - (a.relevance?.score || 0))
      .slice(0, 3)
      .map(item => ({ id: item.id, title: item.title, score: item.relevance?.score || 0 }));

    const tagFreq = new Map<string, number>();
    for (const card of list) {
      for (const tag of card.tags || []) {
        const keyTag = String(tag).toLowerCase();
        tagFreq.set(keyTag, (tagFreq.get(keyTag) || 0) + 1);
      }
    }
    const topTags = Array.from(tagFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag]) => tag);

    return {
      primary,
      count,
      avgRelevance,
      staleCount,
      trendDelta,
      risingCount,
      needsReview,
      topCards,
      topTags,
    };
  });

  results.sort((a, b) => b.count - a.count || b.avgRelevance - a.avgRelevance);
  return results;
}

export function computeCoverageGaps(cards: LinkCard[]) {
  const requiredByCategory: Record<string, string[]> = {
    "Developer Tools": ["pricing", "integration", "security", "alternatives"],
    "AI/ML Frameworks": ["performance", "docs", "maintenance", "ecosystem"],
    "AI/ML Strategy": ["counterpoints", "evidence", "timeline", "market impact"],
    "AI/ML Tutorials": ["difficulty", "code", "cost", "production readiness"],
    "Research & Analysis": ["methodology", "sample size", "limitations", "recency"],
  };

  const groups = new Map<string, LinkCard[]>();
  for (const card of cards) {
    const key = card.categories?.primary || "General Intelligence";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)?.push(card);
  }

  const gaps: Array<{ category: string; missing: string[]; recommendation: string }> = [];

  for (const [category, list] of groups.entries()) {
    const required = requiredByCategory[category] || ["context", "comparables", "freshness", "decision criteria"];
    const bag = `${list.map(item => `${item.title} ${item.summary_short} ${(item.tags || []).join(" ")}`).join(" ")}`.toLowerCase();

    const missing = required.filter(facet => !bag.includes(facet.toLowerCase()));
    if (missing.length) {
      gaps.push({
        category,
        missing,
        recommendation: `Ingest ${Math.max(1, Math.ceil(missing.length / 2))} more sources focused on: ${missing
          .slice(0, 3)
          .join(", ")}.`,
      });
    }
  }

  const typeCounts = cards.reduce<Record<string, number>>((acc, card) => {
    acc[card.type] = (acc[card.type] || 0) + 1;
    return acc;
  }, {});

  if ((typeCounts.SOCIAL_POST || 0) === 0) {
    gaps.push({
      category: "Cross-library",
      missing: ["social consensus signals"],
      recommendation: "Add at least 2 social posts for sentiment and dissent coverage.",
    });
  }
  if ((typeCounts.GITHUB || 0) === 0) {
    gaps.push({
      category: "Cross-library",
      missing: ["repository maintenance signals"],
      recommendation: "Add at least 2 GitHub repos to improve technical due diligence.",
    });
  }

  return gaps;
}

export function buildRadar(cards: LinkCard[]) {
  const fromLogs = cards.flatMap(card =>
    (card.change_log || []).map(event => ({ ...event, card_id: card.id, category: card.categories?.primary }))
  );

  if (fromLogs.length) {
    return [...fromLogs]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 28);
  }

  const synthetic: RadarEvent[] = [];
  for (const card of cards) {
    const delta = scoreDelta(card);
    if (delta >= 8) {
      synthetic.push({
        id: `${card.id}-rise-${card.last_checked_at}`,
        timestamp: card.last_checked_at,
        severity: "MEDIUM",
        title: "Relevance uptrend",
        detail: `${card.title} increased by ${delta} points after latest analysis.`,
        card_id: card.id,
        category: card.categories?.primary,
      });
    }
    if (delta <= -8) {
      synthetic.push({
        id: `${card.id}-drop-${card.last_checked_at}`,
        timestamp: card.last_checked_at,
        severity: "HIGH",
        title: "Relevance downgrade",
        detail: `${card.title} dropped by ${Math.abs(delta)} points and needs re-validation.`,
        card_id: card.id,
        category: card.categories?.primary,
      });
    }
    if ((card.relevance?.staleness_flags || []).length > 0) {
      synthetic.push({
        id: `${card.id}-stale-${card.last_checked_at}`,
        timestamp: card.last_checked_at,
        severity: "LOW",
        title: "Staleness flagged",
        detail: `${card.title} has ${card.relevance.staleness_flags.length} staleness indicators.`,
        card_id: card.id,
        category: card.categories?.primary,
      });
    }
  }

  return synthetic
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 28);
}

export function runDecisionEngine(
  cards: LinkCard[],
  decision: {
    goal: string;
    budget: "low" | "medium" | "high";
    stack: string;
    priority: "speed" | "depth" | "stability";
  }
) {
  const goalTokens = tokenize(decision.goal);
  const stackTokens = tokenize(decision.stack);

  const scored = cards.map(card => {
    let score = Number(card.relevance?.score || 50);
    const reasons: string[] = [`Base relevance ${score}.`];
    const haystack = `${card.title} ${card.summary_short} ${(card.tags || []).join(" ")} ${(card.categories?.primary || "")}`.toLowerCase();

    if (goalTokens.length) {
      const goalHits = goalTokens.filter(token => haystack.includes(token)).length;
      const goalBoost = goalHits * 5;
      score += goalBoost;
      if (goalBoost > 0) reasons.push(`Goal alignment +${goalBoost} from ${goalHits} keyword matches.`);
    }

    if (stackTokens.length) {
      const stackHits = stackTokens.filter(token => haystack.includes(token)).length;
      const stackBoost = stackHits * 4;
      score += stackBoost;
      if (stackBoost > 0) reasons.push(`Stack alignment +${stackBoost} from ${stackHits} token matches.`);
    }

    if (decision.priority === "speed") {
      const speedBoost = (card.usefulness?.pros || []).some(item => /fast|quick|rapid/i.test(item)) ? 8 : 0;
      score += speedBoost;
      if (speedBoost) reasons.push("Speed priority matched to fast/rapid signal.");
    }
    if (decision.priority === "stability") {
      const stableBoost = (card.relevance?.staleness_flags || []).length === 0 ? 7 : -6;
      score += stableBoost;
      reasons.push(stableBoost > 0 ? "Stability priority: no active staleness flags." : "Stability penalty from staleness flags.");
    }
    if (decision.priority === "depth") {
      const depthBoost = (card.summary_full || []).length >= 4 ? 7 : 2;
      score += depthBoost;
      reasons.push(`Depth priority scored from analysis richness (+${depthBoost}).`);
    }

    if (decision.budget === "low") {
      const budgetPenalty = (card.usefulness?.cons || []).some(item => /expensive|cost|price|subscription/i.test(item)) ? -8 : 3;
      score += budgetPenalty;
      reasons.push(
        budgetPenalty > 0
          ? "Low-budget mode: no major cost risk surfaced."
          : "Low-budget mode: potential cost risk detected in cons."
      );
    }

    return {
      card_id: card.id,
      title: card.title,
      category: card.categories?.primary || "General",
      score: Math.round(score),
      reasons: reasons.slice(0, 4),
    };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 5);

  return {
    input: decision,
    recommendation: top[0] || null,
    ranking: top,
    summary:
      top.length > 0
        ? `Top recommendation is ${top[0].title} with score ${top[0].score}.`
        : "No candidates available for decision engine.",
  };
}

function buildChangeEvents(prev: LinkCard, next: LinkCard) {
  const events: RadarEvent[] = [];
  const ts = nowIso();

  if (prev.categories?.primary !== next.categories?.primary) {
    events.push({
      id: crypto.randomUUID(),
      timestamp: ts,
      severity: "MEDIUM",
      title: "Category changed",
      detail: `Moved from ${prev.categories?.primary || "Unknown"} to ${next.categories?.primary}.`,
      card_id: next.id,
      category: next.categories?.primary,
    });
  }

  const scoreDiff = (next.relevance?.score || 0) - (prev.relevance?.score || 0);
  if (Math.abs(scoreDiff) >= 6) {
    events.push({
      id: crypto.randomUUID(),
      timestamp: ts,
      severity: Math.abs(scoreDiff) >= 12 ? "HIGH" : "MEDIUM",
      title: scoreDiff > 0 ? "Relevance increased" : "Relevance decreased",
      detail: `${next.title} ${scoreDiff > 0 ? "rose" : "fell"} by ${Math.abs(scoreDiff)} points.`,
      card_id: next.id,
      category: next.categories?.primary,
    });
  }

  const prevStale = prev.relevance?.staleness_flags?.length || 0;
  const nextStale = next.relevance?.staleness_flags?.length || 0;
  if (prevStale !== nextStale) {
    events.push({
      id: crypto.randomUUID(),
      timestamp: ts,
      severity: nextStale > prevStale ? "MEDIUM" : "LOW",
      title: "Staleness signal changed",
      detail: `${next.title} staleness flags changed from ${prevStale} to ${nextStale}.`,
      card_id: next.id,
      category: next.categories?.primary,
    });
  }

  return events;
}

export async function refreshCards(input: {
  cards: unknown[];
  mode: "daily" | "weekly";
}) {
  const hydrated = input.cards.map(item => normalizedCard(item as Partial<LinkCard>));
  const refreshed: LinkCard[] = [];
  const allEvents: RadarEvent[] = [];

  for (const card of hydrated) {
    const intent = card.user_intent || "";

    if (input.mode === "daily") {
      const pseudoMetadata = {
        ok: true,
        title: card.title,
        description: card.summary_short,
        siteName: card.source_domain,
        canonicalUrl: card.canonical_url,
        contentType: "text/html",
        lastModified: card.last_checked_at,
        finalUrl: card.canonical_url,
        confidenceNotes: ["Daily refresh used existing source snapshot and relevance drift checks."],
      };

      const deterministic = deterministicCategory({
        type: card.type,
        title: card.title,
        description: card.summary_short,
        url: card.canonical_url,
      });
      const embedding = embeddingFallbackCategory({
        type: card.type,
        title: card.title,
        description: card.summary_short,
        intent,
        tags: card.tags,
      });
      const llm = null;
      const finalCategory = pickFinalCategory({ deterministic, llm, embedding });
      const relevance = relevanceFromSignals({
        type: card.type,
        metadata: pseudoMetadata,
        previousScore: card.relevance.score,
        refreshMode: "daily",
      });

      const next = normalizedCard({
        ...card,
        last_checked_at: nowIso(),
        categories: {
          primary: finalCategory.primary,
          secondary: finalCategory.secondary,
        },
        category_pipeline: {
          deterministic,
          llm,
          embedding,
          final: finalCategory,
        },
        relevance,
        relevance_history: [...(card.relevance_history || []), { at: nowIso(), score: relevance.score }].slice(-30),
      });

      const events = buildChangeEvents(card, next);
      next.change_log = [...(card.change_log || []), ...events].slice(-90);
      refreshed.push(next);
      allEvents.push(...events);
      continue;
    }

    const analyzed = await analyzeUrl({
      url: card.url,
      intent,
      sourceCard: card,
      refreshMode: "weekly",
    });
    const next = analyzed.card;
    const events = buildChangeEvents(card, next);
    next.change_log = [...(card.change_log || []), ...events].slice(-90);
    refreshed.push(next);
    allEvents.push(...events);
  }

  return {
    cards: refreshed,
    events: allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
  };
}

export function parseIngestRequest(body: unknown) {
  return requestSchema.safeParse(body);
}

export function parseRefreshRequest(body: unknown) {
  return refreshSchema.safeParse(body);
}

export function parseInsightsRequest(body: unknown) {
  return insightsSchema.safeParse(body);
}

export function sanitizeCards(cards: unknown[]) {
  return cards.map(item => normalizedCard(item as Partial<LinkCard>));
}
