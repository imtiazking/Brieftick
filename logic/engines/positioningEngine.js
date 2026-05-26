/**
 * Positioning-aware reasoning — crowding, unwind, rotation pressure.
 * @module logic/engines/positioningEngine
 */

import { logicDebug } from "../shared.js";

/**
 * @typedef {Object} PositioningInsight
 * @property {string[]} themes
 * @property {string} amplificationNote
 * @property {string} stressNote
 */

/**
 * @param {string} prompt
 * @param {import('./regimeEngine.js').RegimeSnapshot} [regime]
 * @returns {PositioningInsight}
 */
export function analyzePositioning(prompt, regime) {
  const t = (prompt || "").toLowerCase();
  /** @type {string[]} */
  const themes = [];
  let amplificationNote = "";
  let stressNote = "";

  if (/\bai\b|nvidia|semiconductor|mega.?cap|magnificent/i.test(t)) {
    themes.push("crowded AI / mega-cap growth");
    amplificationNote =
      "Moves may amplify via index concentration and momentum funds.";
    stressNote = "Any capex or earnings disappointment risks fast de-grossing.";
  }
  if (/defensive|staples|utilities|low vol/i.test(t)) {
    themes.push("defensive overcrowding");
    stressNote = "Defensive crowding can unwind sharply on risk-on rebounds.";
  }
  if (/momentum|factor|quant/i.test(t)) {
    themes.push("momentum concentration");
    amplificationNote = "Systematic deleveraging can widen intraday swings.";
  }
  if (/unwind|de.?gross|selloff|flush/i.test(t)) {
    themes.push("risk unwind");
    amplificationNote = "Positioning stress may dominate fundamentals short-term.";
  }
  if (regime?.primary === "ai_momentum") {
    themes.push("AI leadership regime");
    stressNote = stressNote || "Rotation pressure builds when breadth narrows.";
  }
  if (regime?.primary === "risk_off") {
    themes.push("risk-off positioning");
    amplificationNote = "Correlations rise; hedges may lag in gap moves.";
  }

  logicDebug("positioningEngine", { themes });

  return {
    themes,
    amplificationNote,
    stressNote,
  };
}

/**
 * @param {import('../types.js').LogicResponse} res
 * @param {PositioningInsight} positioning
 */
export function applyPositioningToResponse(res, positioning) {
  if (!positioning.themes.length) return res;
  const note = [positioning.amplificationNote, positioning.stressNote]
    .filter(Boolean)
    .join(" ");
  return {
    ...res,
    optionalCards: {
      ...(res.optionalCards || {}),
      riskSignal: res.optionalCards?.riskSignal || note.slice(0, 200),
    },
    signals: [
      ...positioning.themes.map((th) => `Positioning: ${th}`),
      ...(res.signals || []),
    ].slice(0, 6),
  };
}
