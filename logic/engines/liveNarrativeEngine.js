/**
 * Live narrative engine — evolving narratives, acceleration, fatigue, sensitivity shifts.
 * @module logic/engines/liveNarrativeEngine
 */

import { logicDebug } from "../shared.js";
import { concise } from "./topicContext.js";
import { readFusionMarketState } from "./fusionSignals.js";

const LIVE_NARRATIVE_KEY = "brieftick_logic_live_narrative_v1";

/**
 * @typedef {Object} LiveNarrativeInsight
 * @property {string} headline
 * @property {string[]} observations
 * @property {string|null} activeShift
 * @property {string|null} acceleration
 * @property {string|null} fatigue
 * @property {string|null} sensitivityShift
 * @property {number} relevance
 */

const SHIFT_PATTERNS = [
  {
    id: "inflation_to_growth",
    re: /inflation|disinflation|cpi/i,
    note: "Markets shifting from inflation sensitivity toward growth sensitivity.",
  },
  {
    id: "growth_to_recession",
    re: /recession|hard landing|payrolls|slowdown/i,
    note: "Growth focus may be giving way to recession-risk pricing.",
  },
  {
    id: "ai_to_breadth",
    re: /\bai\b|mega.?cap|breadth|concentration/i,
    note: "AI leadership remains dominant, but breadth continues narrowing.",
  },
  {
    id: "geo_to_oil",
    re: /geopolit|iran|war|oil/i,
    note: "Geopolitical risk is transmitting through oil and transport channels.",
  },
  {
    id: "rates_to_liquidity",
    re: /rates|yields|liquidity|fed/i,
    note: "Rates narrative may be handing off to liquidity and financial conditions.",
  },
];

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(LIVE_NARRATIVE_KEY) || "{}");
  } catch (_) {
    return { history: [], lastAt: 0 };
  }
}

function saveState(state) {
  try {
    localStorage.setItem(LIVE_NARRATIVE_KEY, JSON.stringify(state));
  } catch (_) {}
}

/**
 * @param {object} ctx
 * @param {object} [marketIntelligence]
 * @returns {LiveNarrativeInsight}
 */
export function runLiveNarrativeEngine(ctx, marketIntelligence) {
  const prompt = ctx.prompt || "";
  const t = prompt.toLowerCase();
  const m = readFusionMarketState(ctx.fusion);
  const mi = marketIntelligence || ctx.marketIntelligence;
  const regime = ctx.regime?.primary;
  /** @type {string[]} */
  const observations = [];
  let activeShift = mi?.narrative?.shiftNote || null;
  let acceleration = null;
  let fatigue = null;
  let sensitivityShift = null;
  let relevance = 0.45;

  for (const s of SHIFT_PATTERNS) {
    if (s.re.test(t) || (mi?.narrative?.dominantId && s.id.includes(mi.narrative.dominantId))) {
      activeShift = activeShift || s.note;
      relevance += 0.15;
    }
  }

  if (m.techOutperforming && m.smallCapLagging) {
    observations.push("AI leadership remains dominant, but breadth continues narrowing.");
    relevance += 0.15;
  }

  if (m.volCompressed && (regime === "geopolitical_stress" || /geopolit|iran/i.test(t))) {
    observations.push(
      "Volatility markets remain subdued despite elevated geopolitical risk."
    );
    relevance += 0.15;
  }

  if (mi?.crossAsset?.factorNotes?.dominance) {
    sensitivityShift = mi.crossAsset.factorNotes.dominance;
    observations.push(sensitivityShift);
    relevance += 0.1;
  } else if (/rates|yields/i.test(t) || regime === "inflation") {
    sensitivityShift =
      "Markets appear increasingly sensitive to yields over geopolitics on available tape.";
    observations.push(sensitivityShift);
  }

  if (mi?.divergence?.headline) observations.push(mi.divergence.headline);
  if (mi?.structure?.fragilityNote) observations.push(mi.structure.fragilityNote);

  const state = loadState();
  const snapshot = {
    at: Date.now(),
    regime,
    shift: activeShift,
    obs: observations[0] || "",
  };
  state.history = [snapshot, ...(state.history || [])].slice(0, 12);
  state.lastAt = snapshot.at;
  saveState(state);

  if (state.history.length >= 3) {
    const recent = state.history.slice(0, 3);
    const regimes = new Set(recent.map((r) => r.regime));
    if (regimes.size >= 2) {
      acceleration = "Macro regime signals are rotating faster than a single narrative can anchor.";
      relevance += 0.1;
    }
  }

  if (mi?.narrative?.fatigue) fatigue = mi.narrative.fatigue;

  const headline = concise(
    activeShift ||
      observations[0] ||
      sensitivityShift ||
      "Narrative state is mixed — no single theme is accelerating on current inputs.",
    240
  );

  logicDebug("liveNarrativeEngine", { observations: observations.length, relevance });

  return {
    headline,
    observations: observations.map((o) => concise(o, 180)).slice(0, 4),
    activeShift: activeShift ? concise(activeShift, 180) : null,
    acceleration: acceleration ? concise(acceleration, 160) : null,
    fatigue: fatigue ? concise(fatigue, 160) : null,
    sensitivityShift: sensitivityShift ? concise(sensitivityShift, 180) : null,
    relevance: Math.min(1, relevance),
  };
}
