/**
 * Positioning-aware reasoning — crowding, unwind, rotation pressure.
 * @module logic/engines/positioningEngine
 */

import { logicDebug } from "../shared.js";
import { concise } from "./topicContext.js";
import { readFusionMarketState } from "./fusionSignals.js";

/**
 * @typedef {Object} PositioningInsight
 * @property {string[]} themes
 * @property {string} headline
 * @property {string} amplificationNote
 * @property {string} stressNote
 * @property {string} rotationNote
 * @property {number} relevance
 */

/**
 * @param {string} prompt
 * @param {import('./regimeEngine.js').RegimeSnapshot} [regime]
 * @param {object} [ctx]
 * @returns {PositioningInsight}
 */
export function analyzePositioning(prompt, regime, ctx) {
  const t = (prompt || "").toLowerCase();
  const m = readFusionMarketState(ctx?.fusion);
  /** @type {string[]} */
  const themes = [];
  let amplificationNote = "";
  let stressNote = "";
  let rotationNote = "";
  let relevance = 0.35;

  if (/\bai\b|nvidia|semiconductor|mega.?cap|magnificent|hyperscaler/i.test(t)) {
    themes.push("crowded AI / mega-cap growth");
    amplificationNote =
      "Crowded AI positioning could amplify downside if earnings or capex expectations soften.";
    relevance += 0.2;
  }
  if (/defensive|staples|utilities|low vol/i.test(t)) {
    themes.push("defensive overcrowding");
    stressNote =
      "Defensive positioning may be overextended if volatility continues compressing and risk assets rebound.";
    relevance += 0.15;
  }
  if (/momentum|factor|quant/i.test(t)) {
    themes.push("momentum concentration");
    amplificationNote =
      amplificationNote ||
      "Momentum concentration raises factor unwind risk if macro surprises hit crowded beta.";
    relevance += 0.15;
  }
  if (/unwind|de.?gross|selloff|flush|delever/i.test(t)) {
    themes.push("de-grossing pressure");
    amplificationNote = "De-grossing pressure may dominate fundamentals until positioning clears.";
    relevance += 0.2;
  }
  if (/rotation|breadth|cyclical|value vs growth/i.test(t)) {
    themes.push("rotation pressure");
    rotationNote =
      "Rotation pressure builds when leadership narrows — cyclicals vs mega-cap growth is the key spread.";
    relevance += 0.15;
  }

  if (regime?.primary === "ai_momentum") {
    themes.push("AI leadership regime");
    stressNote =
      stressNote ||
      "Index-level calm can hide crowded mega-cap growth; any capex guide-down risks fast de-grossing.";
    relevance += 0.1;
  }
  if (regime?.primary === "risk_off") {
    themes.push("risk-off positioning");
    amplificationNote = "Correlations rise in risk-off; hedges may lag in gap moves.";
    relevance += 0.1;
  }

  if (m.techOutperforming && m.cyclicalsLagging) {
    themes.push("narrow leadership concentration");
    rotationNote =
      rotationNote ||
      "Cyclicals lagging while tech leads suggests rotation stress beneath the index.";
    relevance += 0.1;
  }

  const headline = concise(
    [amplificationNote, stressNote, rotationNote].filter(Boolean).join(" ") ||
      (themes.length
        ? `Positioning themes: ${themes.slice(0, 2).join("; ")}.`
        : ""),
    220
  );

  logicDebug("positioningEngine", { themes, relevance });

  return {
    themes,
    headline,
    amplificationNote: concise(amplificationNote, 200),
    stressNote: concise(stressNote, 200),
    rotationNote: concise(rotationNote, 200),
    relevance: Math.min(1, relevance),
  };
}

/**
 * @param {import('../types.js').LogicResponse} res
 * @param {PositioningInsight} positioning
 */
export function applyPositioningToResponse(res, positioning) {
  if (!positioning.themes.length && !positioning.headline) return res;
  const note = positioning.headline || [positioning.amplificationNote, positioning.stressNote]
    .filter(Boolean)
    .join(" ");
  if (!note) return res;
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
