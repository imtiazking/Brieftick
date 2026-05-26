/**
 * Narrative tracking — focus shifts, acceleration, fatigue, regime transitions.
 * @module logic/engines/narrativeEngine
 */

import { logicDebug } from "../shared.js";
import { concise } from "./topicContext.js";

const NARRATIVE_KEY = "brieftick_logic_narratives_v1";

const NARRATIVE_DEFS = [
  { id: "inflation_focus", label: "Inflation focus", re: /inflation|cpi|pce|prices|disinflation/i },
  { id: "growth_deterioration", label: "Growth deterioration", re: /recession|slowdown|earnings|gdp|payrolls|hard landing/i },
  { id: "geopolitical_focus", label: "Geopolitical focus", re: /iran|war|conflict|geopolit/i },
  { id: "ai_focus", label: "AI leadership", re: /\bai\b|semiconductor|nvidia|hyperscaler|capex/i },
  { id: "rates_focus", label: "Rates dominance", re: /fed|rates|yields|fomc|real yield/i },
  { id: "vol_compression", label: "Volatility compression", re: /vol compress|low vix|volatility fall|muted vol/i },
  { id: "oil_sensitivity", label: "Oil sensitivity rising", re: /oil|crude|energy|brent|wti/i },
  { id: "soft_landing", label: "Soft landing", re: /soft landing|immaculate|disinflation without/i },
  { id: "recession_risk", label: "Recession risk", re: /recession|hard landing|growth scare/i },
  { id: "cut_optimism", label: "Rate-cut optimism", re: /rate cut|fed cut|easing|dovish pivot/i },
  { id: "earnings_concern", label: "Earnings concern", re: /earnings|guidance|margin|capex slowdown/i },
  { id: "breadth_fatigue", label: "Breadth fatigue", re: /breadth|narrow|participation|concentration/i },
];

/** Narrative shift patterns (from → to). */
const SHIFT_LIBRARY = [
  {
    from: "inflation_focus",
    to: "growth_deterioration",
    note: "Markets are shifting from inflation relief toward growth sensitivity and earnings risk.",
    re: /inflation.*(growth|earnings|recession)|lower inflation.*bearish|disinflation.*demand/i,
  },
  {
    from: "geopolitical_focus",
    to: "oil_sensitivity",
    note: "Geopolitical risk is translating into oil sensitivity across transport, defense and inflation channels.",
    re: /geopolit.*oil|iran.*oil|war.*energy/i,
  },
  {
    from: "ai_focus",
    to: "breadth_fatigue",
    note: "AI leadership remains dominant, but breadth is weakening beneath the index.",
    re: /ai.*breadth|mega.?cap.*narrow|leadership.*breadth/i,
  },
  {
    from: "soft_landing",
    to: "recession_risk",
    note: "Soft-landing pricing is giving way to recession-risk narratives as labor and consumption data soften.",
    re: /soft landing.*recession|hard landing|growth scare/i,
  },
  {
    from: "cut_optimism",
    to: "earnings_concern",
    note: "Rate-cut optimism is fading into earnings concern if cuts are priced as recession response.",
    re: /cut.*earnings|easing.*recession|cuts bad for/i,
  },
];

function load() {
  try {
    return JSON.parse(localStorage.getItem(NARRATIVE_KEY) || "{}");
  } catch (_) {
    return {};
  }
}

function save(data) {
  try {
    localStorage.setItem(NARRATIVE_KEY, JSON.stringify(data));
  } catch (_) {}
}

/**
 * @param {string} prompt
 * @param {string} [questionKind]
 */
export function updateNarrativeState(prompt, questionKind) {
  const data = load();
  const now = Date.now();
  for (const def of NARRATIVE_DEFS) {
    if (!def.re.test(prompt || "")) continue;
    if (!data[def.id]) data[def.id] = { count: 0, firstAt: now, lastAt: now };
    data[def.id].count += 1;
    data[def.id].lastAt = now;
  }
  save(data);
  return analyzeNarratives(data, questionKind, prompt);
}

/**
 * Narrative shift detection with prompt + session context.
 * @param {string} prompt
 * @param {string} [questionKind]
 * @param {object} [ctx]
 */
export function analyzeNarrativeShifts(prompt, questionKind, ctx) {
  const data = load();
  const base = analyzeNarratives(data, questionKind, prompt);
  let shiftNote = base.shiftNote;
  let relevance = base.relevance;

  for (const shift of SHIFT_LIBRARY) {
    if (shift.re.test(prompt || "")) {
      shiftNote = shift.note;
      relevance = Math.min(1, relevance + 0.25);
      break;
    }
  }

  if (ctx?.regime?.primary === "recession_risk" && /inflation|cpi|disinflation/i.test(prompt || "")) {
    shiftNote =
      shiftNote ||
      "Disinflation may be read as demand weakness — narrative focus can move from inflation to growth deterioration.";
    relevance += 0.15;
  }

  if (ctx?.regime?.primary === "ai_momentum" && /breadth|narrow|cyclical/i.test(prompt || "")) {
    shiftNote =
      shiftNote || "AI leadership remains dominant, but breadth fatigue is the emerging risk beneath indices.";
    relevance += 0.1;
  }

  shiftNote = concise(shiftNote, 220);
  logicDebug("narrativeEngine shifts", { shiftNote, relevance });

  return {
    ...base,
    shiftNote,
    relevance: Math.min(1, relevance),
  };
}

/**
 * @param {object} data
 * @param {string} [questionKind]
 * @param {string} [prompt]
 */
function analyzeNarratives(data, questionKind, prompt) {
  const entries = Object.entries(data).map(([id, v]) => ({
    id,
    def: NARRATIVE_DEFS.find((d) => d.id === id),
    ...v,
  }));
  entries.sort((a, b) => b.lastAt - a.lastAt);

  const dominant = entries[0];
  let shift = "";
  let acceleration = "";
  let fatigue = "";
  let relevance = 0.35;

  if (entries.length >= 2) {
    const recent = entries.filter((e) => Date.now() - e.lastAt < 3600 * 1000);
    if (recent.length >= 2) {
      shift = `Focus may be shifting between ${recent[0].def?.label} and ${recent[1].def?.label}.`;
      relevance += 0.1;
    }
  }
  if (dominant?.count >= 3 && Date.now() - dominant.firstAt < 3600 * 1000 * 4) {
    acceleration = `${dominant.def?.label} narrative accelerating.`;
    relevance += 0.1;
  }
  if (dominant?.count >= 6) {
    fatigue = `${dominant.def?.label} theme may face narrative fatigue.`;
    relevance += 0.05;
  }

  for (const s of SHIFT_LIBRARY) {
    if (s.re.test(prompt || "")) {
      shift = s.note;
      relevance += 0.2;
      break;
    }
  }

  const shiftNote = concise([shift, acceleration, fatigue].filter(Boolean).join(" "), 220);

  return {
    dominantId: dominant?.id,
    dominantLabel: dominant?.def?.label,
    shiftNote,
    questionKind,
    relevance: Math.min(1, relevance),
  };
}

/**
 * @typedef {Object} NarrativeInsight
 * @property {string} [dominantId]
 * @property {string} [dominantLabel]
 * @property {string} shiftNote
 * @property {string} [questionKind]
 * @property {number} relevance
 */

/**
 * @param {import('../types.js').LogicResponse} res
 * @param {NarrativeInsight} narrative
 */
export function applyNarrativeToResponse(res, narrative) {
  if (!narrative?.shiftNote) return res;
  return {
    ...res,
    narrativeNote: narrative.shiftNote,
    signals: [...(res.signals || []), `Narrative: ${narrative.shiftNote}`].slice(0, 6),
  };
}
