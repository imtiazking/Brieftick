/**
 * Regime engine — active market regime detection for adaptive responses.
 * @module logic/engines/regimeEngine
 */

import { getFusedQuote } from "../dataFusion.js";
import { logicDebug } from "../shared.js";

/** @typedef {'risk_on'|'risk_off'|'inflation'|'recession_risk'|'liquidity_expansion'|'ai_momentum'|'geopolitical_stress'|'mixed'} MarketRegime */

/**
 * @typedef {Object} RegimeSnapshot
 * @property {MarketRegime} primary
 * @property {MarketRegime[]} secondary
 * @property {string} label
 * @property {string} adaptationNote
 */

/**
 * @param {object} ctx
 * @returns {RegimeSnapshot}
 */
export function detectMarketRegime(ctx) {
  const fusion = ctx.fusion;
  const prompt = (ctx.prompt || "").toLowerCase();
  const spy = fusion ? getFusedQuote(fusion, "SPY") : null;
  const qqq = fusion ? getFusedQuote(fusion, "QQQ") : null;
  const vixLabel = fusion?.volatility?.vixLabel || "";
  const regimeLabel = fusion?.volatility?.regime || "";

  /** @type {MarketRegime[]} */
  const scores = [];

  const avg =
    spy?.pctChange != null && qqq?.pctChange != null
      ? (spy.pctChange + qqq.pctChange) / 2
      : spy?.pctChange ?? 0;

  if (avg > 0.25) scores.push("risk_on");
  if (avg < -0.25) scores.push("risk_off");
  if (/vix|elevated|high vol/i.test(vixLabel + regimeLabel)) scores.push("risk_off");
  if (/iran|war|conflict|geopolit|sanctions/i.test(prompt)) scores.push("geopolitical_stress");
  if (/inflation|cpi|pce|sticky prices/i.test(prompt)) scores.push("inflation");
  if (/recession|hard landing|slowdown/i.test(prompt)) scores.push("recession_risk");
  if (/\bai\b|nvidia|semiconductor|hyperscaler/i.test(prompt)) scores.push("ai_momentum");
  if (/fed cut|liquidity|qe|easing/i.test(prompt)) scores.push("liquidity_expansion");
  if (/oil|crude|energy shock/i.test(prompt)) scores.push("inflation");

  const primary = scores[0] || "mixed";
  const secondary = [...new Set(scores.slice(1))];

  const labels = {
    risk_on: "Risk-on",
    risk_off: "Risk-off",
    inflation: "Inflation-focused",
    recession_risk: "Recession-risk",
    liquidity_expansion: "Liquidity expansion",
    ai_momentum: "AI momentum",
    geopolitical_stress: "Geopolitical stress",
    mixed: "Mixed regime",
  };

  const adaptations = {
    risk_on: "Emphasize beta and leadership; vol compression narratives may apply.",
    risk_off: "Lead with defensives, vol, and correlation; growth sensitivity elevated.",
    inflation: "Anchor on rates, oil, and pricing power; duration risk matters.",
    recession_risk: "Stress cyclical downside and policy lag; quality bias.",
    liquidity_expansion: "Duration and growth may benefit; watch inflation re-acceleration.",
    ai_momentum: "Concentration and positioning risk in mega-cap tech/semis.",
    geopolitical_stress: "Oil, defense, safe havens; headline gap risk.",
    mixed: "Cross-asset signals mixed; avoid single-factor certainty.",
  };

  const snapshot = {
    primary,
    secondary,
    label: labels[primary],
    adaptationNote: adaptations[primary],
  };

  logicDebug("regimeEngine", snapshot);
  return snapshot;
}
