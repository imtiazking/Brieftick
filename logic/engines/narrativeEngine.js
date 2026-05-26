/**
 * Narrative tracking — focus shifts, acceleration, fatigue.
 * @module logic/engines/narrativeEngine
 */

import { logicDebug } from "../shared.js";

const NARRATIVE_KEY = "brieftick_logic_narratives_v1";

const NARRATIVE_DEFS = [
  { id: "inflation_focus", label: "Inflation focus", re: /inflation|cpi|pce|prices/i },
  { id: "geopolitical_focus", label: "Geopolitical focus", re: /iran|war|conflict|geopolit/i },
  { id: "ai_focus", label: "AI leadership", re: /\bai\b|semiconductor|nvidia/i },
  { id: "rates_focus", label: "Rates dominance", re: /fed|rates|yields/i },
  { id: "vol_compression", label: "Volatility compression", re: /vol compress|low vix|volatility fall/i },
  { id: "oil_sensitivity", label: "Oil sensitivity rising", re: /oil|crude|energy/i },
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
  return analyzeNarratives(data, questionKind);
}

/**
 * @param {object} data
 * @param {string} [questionKind]
 */
function analyzeNarratives(data, questionKind) {
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

  if (entries.length >= 2) {
    const recent = entries.filter((e) => Date.now() - e.lastAt < 3600 * 1000);
    if (recent.length >= 2) {
      shift = `Focus may be shifting between ${recent[0].def?.label} and ${recent[1].def?.label}.`;
    }
  }
  if (dominant?.count >= 3 && Date.now() - dominant.firstAt < 3600 * 1000 * 4) {
    acceleration = `${dominant.def?.label} narrative accelerating.`;
  }
  if (dominant?.count >= 6) {
    fatigue = `${dominant.def?.label} theme may face narrative fatigue.`;
  }

  const note = [shift, acceleration, fatigue].filter(Boolean).join(" ") || "";

  logicDebug("narrativeEngine", { dominant: dominant?.id, note });

  return {
    dominantId: dominant?.id,
    dominantLabel: dominant?.def?.label,
    shiftNote: note,
    questionKind,
  };
}

/**
 * @param {import('../types.js').LogicResponse} res
 * @param {{ shiftNote?: string }} narrative
 */
export function applyNarrativeToResponse(res, narrative) {
  if (!narrative?.shiftNote) return res;
  return {
    ...res,
    narrativeNote: narrative.shiftNote,
    signals: [...(res.signals || []), narrative.shiftNote].slice(0, 5),
  };
}
