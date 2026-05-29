"use client";

import Link from "next/link";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import styles from "./SignalTheater.module.css";

type Severity = "low" | "medium" | "high";
type Track = "probe" | "hedge" | "commit";
type HorizonId = "6h" | "24h" | "7d";

type Metric = {
  label: string;
  value: string;
  note: string;
};

type FeedItem = {
  title: string;
  detail: string;
  severity: Severity;
};

type GraphNode = {
  id: string;
  label: string;
  caption: string;
  stat: string;
  x: number;
  y: number;
};

type TrackConfig = {
  label: string;
  summary: string;
  steps: string[];
};

type Mission = {
  id: string;
  label: string;
  eyebrow: string;
  headline: string;
  summary: string;
  route: string;
  routeLabel: string;
  accent: string;
  accentSoft: string;
  spark: string;
  defaultGoal: string;
  metrics: Metric[];
  prompts: string[];
  feed: FeedItem[];
  graph: {
    coreLabel: string;
    coreDetail: string;
    nodes: GraphNode[];
  };
  outputs: string[];
  blindspots: string[];
  systems: Record<Track, string[]>;
  horizonNotes: Record<HorizonId, string>;
  tracks: Record<Track, TrackConfig>;
};

type LaunchPad = {
  label: string;
  eyebrow: string;
  href: string;
  note: string;
  meta: string;
};

const HORIZONS: Array<{ id: HorizonId; label: string; detail: string }> = [
  { id: "6h", label: "6 Hours", detail: "Shock-response window" },
  { id: "24h", label: "24 Hours", detail: "Operational day loop" },
  { id: "7d", label: "7 Days", detail: "Compounding thesis" },
];

const TRACK_META: Record<Track, { label: string; color: string }> = {
  probe: { label: "Probe", color: "#8ee3ff" },
  hedge: { label: "Hedge", color: "#ffd37a" },
  commit: { label: "Commit", color: "#7bffb5" },
};

const LAUNCH_PADS: LaunchPad[] = [
  {
    label: "INGEST.IO",
    eyebrow: "Decision Surface",
    href: "/ingest",
    note: "Drop links, compare view modes, and watch structured intelligence form in real time.",
    meta: "Web, lanes, matrix, list, timeline",
  },
  {
    label: "Gem Finder",
    eyebrow: "A&R Engine",
    href: "/ar",
    note: "Run scouting, AI drafting, stage management, Gmail sync, and reply handling from one board.",
    meta: "8 stages, 3 sequences, 2 AI providers",
  },
  {
    label: "Admin Grid",
    eyebrow: "Operator Control",
    href: "/ar/admin",
    note: "Manage roles, activation state, and recovery paths without losing the final admin anchor.",
    meta: "Admin, editor, viewer with safety rails",
  },
];

const MISSIONS: Mission[] = [
  {
    id: "signal-atlas",
    label: "Signal Atlas",
    eyebrow: "Weak Signal Intelligence",
    headline: "Map the web like it is a living market.",
    summary:
      "This is a command surface for hunting durable patterns inside messy sources. It turns links, repos, papers, and threads into a ranked field of conviction instead of a folder full of tabs.",
    route: "/ingest",
    routeLabel: "Enter INGEST.IO",
    accent: "#8ee3ff",
    accentSoft: "rgba(142, 227, 255, 0.18)",
    spark: "#ffd37a",
    defaultGoal: "Find the next durable AI workflow before the discourse peaks",
    metrics: [
      { label: "View Modes", value: "5", note: "Web, lanes, matrix, list, timeline" },
      { label: "Insight Tabs", value: "5", note: "Overview through radar comparison" },
      { label: "Decision Shape", value: "Freshness", note: "Relevance with recency pressure" },
    ],
    prompts: [
      "Separate durable AI coding products from narrative spikes.",
      "Map every repo, paper, and founder thread around local-first agents.",
      "Trace which interfaces are gaining real operating leverage.",
      "Stress-test whether a research claim is trend or noise.",
    ],
    feed: [
      {
        title: "Cross-source agreement just increased.",
        detail: "A repo, a paper, and two founder notes are now pointing at the same workflow pattern.",
        severity: "high",
      },
      {
        title: "Freshness is diverging from importance.",
        detail: "The newest posts are loud, but the oldest operating docs still hold the actionable edge.",
        severity: "medium",
      },
      {
        title: "One category is collapsing into clones.",
        detail: "Surface-level differentiation is rising while true workflow innovation is flattening.",
        severity: "medium",
      },
      {
        title: "An ignored adjacent signal is strengthening.",
        detail: "A low-hype toolchain change is showing up in multiple high-conviction operator stacks.",
        severity: "low",
      },
    ],
    graph: {
      coreLabel: "Ranked Signal Mesh",
      coreDetail: "Capture, structure, compare, and score weak signals before they look obvious.",
      nodes: [
        { id: "capture", label: "Capture", caption: "Drop any link or fragment", stat: "Mixed-source intake", x: 18, y: 22 },
        { id: "entities", label: "Entities", caption: "Products, firms, people, concepts", stat: "Structured extraction", x: 82, y: 21 },
        { id: "relevance", label: "Relevance", caption: "Weight staying power, not just noise", stat: "Longevity scoring", x: 84, y: 74 },
        { id: "counterfactual", label: "Counterfactual", caption: "What holds if the hype drops?", stat: "Decision pressure", x: 18, y: 76 },
      ],
    },
    outputs: ["Entity graph", "Freshness flags", "Conviction history", "Structured cards"],
    blindspots: [
      "Fresh social agreement can mimic product-market pull when everyone is copying the same source.",
      "A hot repository can hide painful operational friction that will show up only after adoption.",
      "Old documents are not dead context if they still anchor how serious teams actually ship.",
    ],
    systems: {
      probe: ["Wide capture", "Category compare", "Freshness watch"],
      hedge: ["Conviction board", "Gap analysis", "Priority monitor"],
      commit: ["Pinned brief", "Ownership queue", "Thesis lock"],
    },
    horizonNotes: {
      "6h": "Best when a conversation is moving fast and you need signal compression, not a literature review.",
      "24h": "Best for a full operating loop: ingest, compare, score, and hand a point of view to execution.",
      "7d": "Best when you want the thesis to compound through refresh cycles instead of freezing a one-day snapshot.",
    },
    tracks: {
      probe: {
        label: "Probe",
        summary: "The shape is interesting, but you still need independent confirmation before collapsing the search space.",
        steps: [
          "Drop 12 to 20 mixed-fidelity sources around {goal}.",
          "Force at least one disagreement source into the board before ranking winners.",
          "Watch for repeated entities and recurring claims, not repeated wording.",
        ],
      },
      hedge: {
        label: "Hedge",
        summary: "The pattern is real enough to compare pathways, but not yet clean enough to overfit to one narrative.",
        steps: [
          "Pin the three strongest sources that sharpen {goal}.",
          "Separate what is merely recent from what still matters next week.",
          "Turn the board into an action brief with one bullish and one skeptical path.",
        ],
      },
      commit: {
        label: "Commit",
        summary: "The market shape is credible. Tighten the board, assign ownership, and move from research to execution.",
        steps: [
          "Promote the highest-conviction cluster tied to {goal}.",
          "Archive weak lookalikes so the winning signal is visible at a glance.",
          "Refresh on schedule and treat any contradiction as a trigger, not a surprise.",
        ],
      },
    },
  },
  {
    id: "artist-engine",
    label: "Artist Engine",
    eyebrow: "A&R Orchestration",
    headline: "Run outreach like a trading desk, not a spreadsheet.",
    summary:
      "Gem Finder turns scouting, sequencing, drafting, and reply handling into one operating loop. The idea is simple: route the right artist, with the right touch, while the window is still open.",
    route: "/ar",
    routeLabel: "Open Gem Finder",
    accent: "#7bffb5",
    accentSoft: "rgba(123, 255, 181, 0.18)",
    spark: "#8ee3ff",
    defaultGoal: "Prioritize artists most likely to reply within the next week",
    metrics: [
      { label: "Pipeline Stages", value: "8", note: "Prospect through live or dead" },
      { label: "Sequences", value: "3", note: "DM, email, or hybrid plans" },
      { label: "AI Routing", value: "2", note: "Anthropic and OpenAI providers" },
    ],
    prompts: [
      "Prioritize artists most likely to reply within the next week.",
      "Identify warm leads that deserve a hybrid sequence instead of DM-only.",
      "Find where reply latency is breaking otherwise strong conversations.",
      "Detect which stage transitions are bottlenecking the board.",
    ],
    feed: [
      {
        title: "Reply velocity just moved.",
        detail: "A warm cluster is responding faster than the board currently reflects, which means sequence timing is stale.",
        severity: "high",
      },
      {
        title: "Draft quality is uneven.",
        detail: "High-fit artists are being touched with generic openers, which is compressing expected conversion.",
        severity: "medium",
      },
      {
        title: "One owner is overloaded.",
        detail: "Assignment drift is starting to hide the real funnel shape behind human bottlenecks.",
        severity: "medium",
      },
      {
        title: "The inbox is now a source of truth.",
        detail: "Synced Gmail threads are surfacing context that should alter the next-touch recommendation.",
        severity: "low",
      },
    ],
    graph: {
      coreLabel: "Artist Timing Engine",
      coreDetail: "Discovery, sequences, drafts, and inbox state all feed the same moment-of-truth decision.",
      nodes: [
        { id: "discover", label: "Discover", caption: "Signal-rich prospects first", stat: "Quality over volume", x: 18, y: 22 },
        { id: "draft", label: "Draft", caption: "Model-routed outreach", stat: "Guardrails on message quality", x: 81, y: 22 },
        { id: "sync", label: "Sync", caption: "Thread history closes the loop", stat: "Inbox-aware context", x: 84, y: 74 },
        { id: "stage", label: "Stage", caption: "Move only when evidence changes", stat: "Pipeline honesty", x: 18, y: 76 },
      ],
    },
    outputs: ["Stage pressure", "Reply context", "Sequence fit", "Owner clarity"],
    blindspots: [
      "A full queue can look healthy while owner imbalance silently kills response speed.",
      "A strong opener is wasted if the channel choice is wrong for the artist’s actual behavior.",
      "Reply threads can flip the recommendation faster than weekly board reviews will catch.",
    ],
    systems: {
      probe: ["Lead scoring", "Fit review", "Inbox check"],
      hedge: ["Sequence choice", "Draft pressure", "Owner rebalance"],
      commit: ["Send now", "Thread sync", "Stage move"],
    },
    horizonNotes: {
      "6h": "Best when today’s send queue matters more than historical elegance and you need the next touch to be right.",
      "24h": "Best when you want a full cycle of scouting, drafting, sending, and inbox validation inside one workday.",
      "7d": "Best when you are optimizing portfolio health, not just today’s outreach list.",
    },
    tracks: {
      probe: {
        label: "Probe",
        summary: "You have enough surface signal to narrow the field, but not enough to trust the current funnel shape.",
        steps: [
          "Scan the board for artists connected to {goal}.",
          "Validate fit with at least one inbox or social signal before drafting.",
          "Treat silent sequences as data, not as neutral noise.",
        ],
      },
      hedge: {
        label: "Hedge",
        summary: "The opportunity is real, but execution quality now matters as much as selection quality.",
        steps: [
          "Move the strongest prospects linked to {goal} into a deliberate sequence.",
          "Use the model stack to improve specificity before the next send.",
          "Reassign any queue segment where owner load is distorting speed.",
        ],
      },
      commit: {
        label: "Commit",
        summary: "The path is credible and timing matters. Tight execution will outperform more analysis.",
        steps: [
          "Push the highest-confidence artist set tied to {goal}.",
          "Sync inbox context immediately after send to detect real traction.",
          "Advance stages only when the thread proves momentum, not because time passed.",
        ],
      },
    },
  },
  {
    id: "control-grid",
    label: "Control Grid",
    eyebrow: "Operator Surface",
    headline: "See where process friction will cost you before it does.",
    summary:
      "This is the control room view. Permissions, user safety, ownership, and recovery paths are not admin chores here; they are structural levers that decide whether the rest of the machine holds under pressure.",
    route: "/ar/admin",
    routeLabel: "Open Admin Grid",
    accent: "#ffd37a",
    accentSoft: "rgba(255, 211, 122, 0.18)",
    spark: "#ff8d7c",
    defaultGoal: "Prevent one overloaded owner from delaying the highest-confidence opportunities",
    metrics: [
      { label: "Roles", value: "3", note: "Admin, editor, viewer" },
      { label: "Safety Rail", value: "Last-admin guard", note: "Prevents deleting the final active admin" },
      { label: "Recovery", value: "Reset flow", note: "Token-based password recovery path" },
    ],
    prompts: [
      "Prevent one overloaded owner from delaying the highest-confidence opportunities.",
      "Audit role drift before the next team handoff.",
      "Find where access policy is lagging the actual operating model.",
      "Stress-test recovery and ownership before scale adds more entropy.",
    ],
    feed: [
      {
        title: "Permission shape no longer matches workflow shape.",
        detail: "Who can act and who should act are drifting apart, which creates invisible latency.",
        severity: "high",
      },
      {
        title: "Recovery is available but unpracticed.",
        detail: "The path exists, but teams usually discover reset flow quality only when something is already broken.",
        severity: "medium",
      },
      {
        title: "Role inflation is beginning.",
        detail: "Granting broader access is solving speed in the short term while eroding operational clarity.",
        severity: "medium",
      },
      {
        title: "The admin floor is protected.",
        detail: "The system keeps one active admin anchor, which prevents the easiest catastrophic lockout.",
        severity: "low",
      },
    ],
    graph: {
      coreLabel: "Operational Control Core",
      coreDetail: "Roles, ownership, safety rails, and recovery paths are the hidden geometry of execution.",
      nodes: [
        { id: "access", label: "Access", caption: "Who can act, exactly?", stat: "Role precision", x: 18, y: 22 },
        { id: "ownership", label: "Ownership", caption: "Who actually carries load?", stat: "Queue realism", x: 82, y: 22 },
        { id: "recovery", label: "Recovery", caption: "How do you fail safely?", stat: "Reset path", x: 83, y: 75 },
        { id: "safety", label: "Safety", caption: "Guard the floor under pressure", stat: "Admin anchor", x: 17, y: 77 },
      ],
    },
    outputs: ["Role map", "Owner balance", "Failure rails", "Access clarity"],
    blindspots: [
      "Teams often patch workflow pain with broader permissions and accidentally erase accountability.",
      "A recovery path that nobody has exercised is still a latent risk, not a solved problem.",
      "Safety rails protect catastrophe, but they do not replace clear ownership on the day-to-day queue.",
    ],
    systems: {
      probe: ["Role audit", "Owner map", "Risk trace"],
      hedge: ["Access tighten", "Queue balance", "Reset rehearsal"],
      commit: ["Policy lock", "Owner shift", "Safety review"],
    },
    horizonNotes: {
      "6h": "Best when process drift is already touching throughput and you need a hard operational correction today.",
      "24h": "Best when you need to rebalance ownership, verify access, and test failure rails inside one cycle.",
      "7d": "Best when you are tuning the operating system itself, not just reacting to a single incident.",
    },
    tracks: {
      probe: {
        label: "Probe",
        summary: "The issue is visible, but the real failure mode is still hidden inside access and load distribution.",
        steps: [
          "Map the queue segments affected by {goal}.",
          "Compare role scope against the work each person is actually carrying.",
          "List the one failure you are assuming cannot happen and verify the guardrail exists.",
        ],
      },
      hedge: {
        label: "Hedge",
        summary: "You know where the friction is; now remove just enough ambiguity to stop it compounding.",
        steps: [
          "Tighten ownership around the work tied to {goal}.",
          "Reduce permission sprawl before it becomes the new default operating model.",
          "Exercise the reset and recovery path while the room is calm.",
        ],
      },
      commit: {
        label: "Commit",
        summary: "The system shape is clear. Make the policy move, protect the floor, and let the team run faster.",
        steps: [
          "Lock the access and ownership changes required for {goal}.",
          "Use the admin guardrails as a boundary, not a substitute for discipline.",
          "Turn the new operating rule into the default before drift reappears.",
        ],
      },
    },
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function describeBand(value: number, low: string, medium: string, high: string) {
  if (value < 35) return low;
  if (value < 70) return medium;
  return high;
}

function chooseTrack(conviction: number, volatility: number): Track {
  if (conviction >= 79 && volatility <= 57) return "commit";
  if (volatility >= 70 || conviction <= 54) return "probe";
  return "hedge";
}

function withGoal(template: string, goal: string) {
  return template.replace("{goal}", goal);
}

function formatClock(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function nodeStyle(node: GraphNode): CSSProperties {
  return {
    ["--node-x" as never]: `${node.x}%`,
    ["--node-y" as never]: `${node.y}%`,
  };
}

export default function SignalTheater() {
  const [missionId, setMissionId] = useState<string>(MISSIONS[0].id);
  const [goal, setGoal] = useState<string>(MISSIONS[0].defaultGoal);
  const [urgency, setUrgency] = useState<number>(72);
  const [evidence, setEvidence] = useState<number>(68);
  const [noise, setNoise] = useState<number>(36);
  const [horizonId, setHorizonId] = useState<HorizonId>("24h");
  const [clock, setClock] = useState<Date>(() => new Date());
  const [feedIndex, setFeedIndex] = useState<number>(0);
  const deferredGoal = useDeferredValue(goal);

  const mission = useMemo(() => {
    return MISSIONS.find((entry) => entry.id === missionId) ?? MISSIONS[0];
  }, [missionId]);

  useEffect(() => {
    setFeedIndex(0);
  }, [mission.id]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setClock(new Date());
      setFeedIndex((current) => (current + 1) % mission.feed.length);
    }, 4200);
    return () => {
      window.clearInterval(interval);
    };
  }, [mission.feed.length]);

  const derived = useMemo(() => {
    const effectiveGoal = deferredGoal.trim() || mission.defaultGoal;
    const stability = 100 - noise;
    const conviction = clamp(Math.round(evidence * 0.54 + urgency * 0.26 + stability * 0.2), 14, 99);
    const volatility = clamp(Math.round(noise * 0.58 + urgency * 0.18 + (100 - evidence) * 0.24), 6, 98);
    const readiness = clamp(Math.round(conviction * 0.62 + (100 - volatility) * 0.38), 10, 99);
    const track = chooseTrack(conviction, volatility);
    const currentFeed = mission.feed[feedIndex % mission.feed.length];
    const trackConfig = mission.tracks[track];
    const sequence = trackConfig.steps.map((step) => withGoal(step, effectiveGoal));
    const blindspot =
      noise >= 67
        ? mission.blindspots[0]
        : evidence < 56
          ? mission.blindspots[1]
          : mission.blindspots[2];
    const thesis = `${effectiveGoal} reads as a ${describeBand(
      urgency,
      "slow-burn",
      "near-term",
      "right-now"
    )} opportunity with ${describeBand(
      evidence,
      "thin",
      "credible",
      "hardening"
    )} evidence and ${describeBand(
      noise,
      "contained",
      "active",
      "chaotic"
    )} noise. ${trackConfig.summary}`;

    const timeline = [
      {
        slot: "T+00",
        title: `${trackConfig.label} the field`,
        detail: sequence[0],
      },
      {
        slot: horizonId === "6h" ? "T+03h" : horizonId === "24h" ? "T+08h" : "T+2d",
        title: "Tighten confidence",
        detail: sequence[1],
      },
      {
        slot: horizonId === "6h" ? "T+06h" : horizonId === "24h" ? "T+24h" : "T+7d",
        title: "Lock the move",
        detail: sequence[2],
      },
    ];

    return {
      effectiveGoal,
      conviction,
      volatility,
      readiness,
      track,
      currentFeed,
      trackConfig,
      sequence,
      blindspot,
      thesis,
      timeline,
    };
  }, [deferredGoal, evidence, feedIndex, horizonId, mission, noise, urgency]);

  const rootStyle = useMemo<CSSProperties>(() => {
    return {
      ["--atlas-accent" as never]: mission.accent,
      ["--atlas-accent-soft" as never]: mission.accentSoft,
      ["--atlas-spark" as never]: mission.spark,
      ["--atlas-track" as never]: TRACK_META[derived.track].color,
    };
  }, [derived.track, mission.accent, mission.accentSoft, mission.spark]);

  return (
    <main className={styles.atlas} style={rootStyle}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <div className={styles.brandMark} />
            <div>
              <p className={styles.brandEyebrow}>Pressure Test</p>
              <strong className={styles.brandTitle}>Decision Theater</strong>
            </div>
          </div>
          <nav className={styles.nav}>
            <Link className={styles.navLink} href="/ingest">
              `/ingest`
            </Link>
            <Link className={styles.navLink} href="/ar">
              `/ar`
            </Link>
            <Link className={styles.navLink} href="/ar/admin">
              `/ar/admin`
            </Link>
          </nav>
        </header>

        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>{mission.eyebrow}</p>
            <h1 className={styles.headline}>{mission.headline}</h1>
            <p className={styles.summary}>{mission.summary}</p>

            <div className={styles.ctaRow}>
              <Link className={styles.primaryCta} href={mission.route}>
                {mission.routeLabel}
              </Link>
              <a className={styles.secondaryCta} href="#simulator">
                Tune the simulator
              </a>
              <span className={styles.statusPill}>
                {TRACK_META[derived.track].label} mode · {HORIZONS.find((item) => item.id === horizonId)?.label}
              </span>
            </div>

            <div className={styles.missionTabs} aria-label="Mission chooser">
              {MISSIONS.map((entry) => {
                const active = entry.id === mission.id;
                return (
                  <button
                    key={entry.id}
                    className={styles.missionButton}
                    data-active={active ? "true" : "false"}
                    type="button"
                    onClick={() => {
                      startTransition(() => {
                        setMissionId(entry.id);
                      });
                    }}
                  >
                    <span>{entry.label}</span>
                    <small>{entry.eyebrow}</small>
                  </button>
                );
              })}
            </div>
          </div>

          <aside className={styles.heroPanel}>
            <div className={styles.clockLine}>
              <span className={styles.clockDot} />
              <span>Chicago time · {formatClock(clock)} CT</span>
            </div>

            <div className={styles.thesisPanel}>
              <div className={styles.thesisHeader}>
                <span className={styles.panelLabel}>Generated Read</span>
                <span className={styles.trackBadge} data-track={derived.track}>
                  {TRACK_META[derived.track].label}
                </span>
              </div>
              <p className={styles.thesisCopy}>{derived.thesis}</p>
              <div className={styles.thesisFoot}>
                <span>Goal: {derived.effectiveGoal}</span>
                <span>{mission.horizonNotes[horizonId]}</span>
              </div>
            </div>

            <div className={styles.metricGrid}>
              {mission.metrics.map((metric) => (
                <article className={styles.metricCard} key={metric.label}>
                  <span className={styles.metricLabel}>{metric.label}</span>
                  <strong className={styles.metricValue}>{metric.value}</strong>
                  <p className={styles.metricNote}>{metric.note}</p>
                </article>
              ))}
            </div>
          </aside>
        </section>

        <section className={styles.centerGrid}>
          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.panelLabel}>System Geometry</p>
                <h2 className={styles.panelTitle}>{mission.graph.coreLabel}</h2>
              </div>
              <p className={styles.panelText}>{mission.graph.coreDetail}</p>
            </div>

            <div className={styles.constellation}>
              <svg className={styles.lines} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                {mission.graph.nodes.map((node) => (
                  <line key={node.id} x1="50" y1="50" x2={node.x} y2={node.y} />
                ))}
              </svg>

              <div className={styles.coreNode}>
                <span className={styles.coreLabel}>Execution readiness</span>
                <strong className={styles.coreValue}>{derived.readiness}</strong>
                <p className={styles.coreText}>
                  {TRACK_META[derived.track].label} posture driven by conviction {derived.conviction} and volatility {derived.volatility}.
                </p>
              </div>

              {mission.graph.nodes.map((node) => (
                <div className={styles.orbitNode} key={node.id} style={nodeStyle(node)}>
                  <span className={styles.orbitLabel}>{node.label}</span>
                  <strong className={styles.orbitStat}>{node.stat}</strong>
                  <p className={styles.orbitCaption}>{node.caption}</p>
                </div>
              ))}
            </div>

            <div className={styles.outputRow}>
              {mission.outputs.map((output) => (
                <span className={styles.outputChip} key={output}>
                  {output}
                </span>
              ))}
            </div>
          </article>

          <article className={styles.panel} id="simulator">
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.panelLabel}>Decision Simulator</p>
                <h2 className={styles.panelTitle}>Push the system until it changes shape.</h2>
              </div>
              <p className={styles.panelText}>
                Change the goal, then tune urgency, evidence, and noise. The room responds with a different posture and playbook.
              </p>
            </div>

            <label className={styles.promptBox}>
              <span className={styles.promptLabel}>What are you trying to win?</span>
              <textarea
                className={styles.promptField}
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
                placeholder={mission.defaultGoal}
                rows={3}
              />
            </label>

            <div className={styles.promptChips}>
              {mission.prompts.map((prompt) => (
                <button
                  key={prompt}
                  className={styles.promptChip}
                  type="button"
                  onClick={() => {
                    startTransition(() => {
                      setGoal(prompt);
                    });
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div className={styles.sliderGrid}>
              {[
                {
                  label: "Urgency",
                  value: urgency,
                  setValue: setUrgency,
                  hint: describeBand(urgency, "Room to watch", "Move this cycle", "Do not lose the window"),
                },
                {
                  label: "Evidence",
                  value: evidence,
                  setValue: setEvidence,
                  hint: describeBand(evidence, "Mostly intuition", "Enough to compare", "Pattern is hardening"),
                },
                {
                  label: "Noise",
                  value: noise,
                  setValue: setNoise,
                  hint: describeBand(noise, "Clean signal field", "Competing narratives", "High distortion"),
                },
              ].map((item) => (
                <label className={styles.sliderCard} key={item.label}>
                  <div className={styles.sliderTop}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={item.value}
                    onChange={(event) => item.setValue(Number(event.target.value))}
                  />
                  <small className={styles.sliderHint}>{item.hint}</small>
                </label>
              ))}
            </div>

            <div className={styles.horizonRow}>
              {HORIZONS.map((horizon) => {
                const active = horizon.id === horizonId;
                return (
                  <button
                    key={horizon.id}
                    className={styles.horizonButton}
                    data-active={active ? "true" : "false"}
                    type="button"
                    onClick={() => {
                      startTransition(() => {
                        setHorizonId(horizon.id);
                      });
                    }}
                  >
                    <span>{horizon.label}</span>
                    <small>{horizon.detail}</small>
                  </button>
                );
              })}
            </div>

            <div className={styles.diagnostics}>
              {[
                {
                  label: "Conviction",
                  value: derived.conviction,
                  meta: "How real the pattern looks",
                },
                {
                  label: "Volatility",
                  value: derived.volatility,
                  meta: "How fast noise can break the read",
                },
                {
                  label: "Readiness",
                  value: derived.readiness,
                  meta: "How aggressively to move right now",
                },
              ].map((item) => (
                <div className={styles.diagCard} key={item.label}>
                  <div className={styles.diagTop}>
                    <span className={styles.diagLabel}>{item.label}</span>
                    <strong className={styles.diagValue}>{item.value}</strong>
                  </div>
                  <div className={styles.meter} aria-hidden="true">
                    <span className={styles.meterFill} style={{ width: `${item.value}%` }} />
                  </div>
                  <small className={styles.diagMeta}>{item.meta}</small>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className={styles.lowerGrid}>
          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.panelLabel}>Live Pulse</p>
                <h2 className={styles.panelTitle}>{derived.currentFeed.title}</h2>
              </div>
              <p className={styles.panelText}>{derived.currentFeed.detail}</p>
            </div>

            <div className={styles.feedList}>
              {mission.feed.map((item, index) => (
                <div
                  className={styles.feedItem}
                  data-active={index === feedIndex ? "true" : "false"}
                  data-severity={item.severity}
                  key={item.title}
                >
                  <span className={styles.feedDot} />
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.panelLabel}>Autogenerated Playbook</p>
                <h2 className={styles.panelTitle}>{derived.trackConfig.label} the next move.</h2>
              </div>
              <p className={styles.panelText}>{derived.trackConfig.summary}</p>
            </div>

            <div className={styles.playbookList}>
              {derived.timeline.map((item) => (
                <div className={styles.stepCard} key={item.slot}>
                  <span className={styles.stepIndex}>{item.slot}</span>
                  <div>
                    <strong className={styles.stepTitle}>{item.title}</strong>
                    <p className={styles.stepText}>{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.panelLabel}>Watchouts</p>
                <h2 className={styles.panelTitle}>What breaks this read?</h2>
              </div>
              <p className={styles.panelText}>{mission.horizonNotes[horizonId]}</p>
            </div>

            <div className={styles.watchBlock}>
              <strong className={styles.watchTitle}>Blind spot</strong>
              <p className={styles.watchText}>{derived.blindspot}</p>
            </div>

            <div className={styles.watchBlock}>
              <strong className={styles.watchTitle}>System stack</strong>
              <div className={styles.stackRow}>
                {mission.systems[derived.track].map((item) => (
                  <span className={styles.stackChip} key={item}>
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </article>
        </section>

        <section className={styles.launchSection}>
          <div className={styles.sectionIntro}>
            <p className={styles.panelLabel}>Real Surfaces</p>
            <h2 className={styles.sectionTitle}>Launch the actual tools behind the theater.</h2>
            <p className={styles.sectionText}>
              This page is not a detached concept. It is a front door into the repo’s live product surfaces.
            </p>
          </div>

          <div className={styles.launchGrid}>
            {LAUNCH_PADS.map((pad) => (
              <article className={styles.launchCard} key={pad.label}>
                <span className={styles.launchEyebrow}>{pad.eyebrow}</span>
                <h3 className={styles.launchTitle}>{pad.label}</h3>
                <p className={styles.launchText}>{pad.note}</p>
                <p className={styles.launchMeta}>{pad.meta}</p>
                <Link className={styles.launchLink} href={pad.href}>
                  Open surface
                </Link>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
