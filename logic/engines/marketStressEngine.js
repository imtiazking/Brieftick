/**
 * Market stress engine — complacency, concentration, liquidity fragility.
 * @module logic/engines/marketStressEngine
 */

import { logicDebug } from "../shared.js";
import { concise } from "./topicContext.js";
import { readFusionMarketState } from "./fusionSignals.js";

/**
 * @typedef {Object} MarketStressInsight
 * @property {string} headline
 * @property {'complacency'|'stress'|'overheating'|'concentration'|'liquidity_fragility'|'vol_compression_risk'|'balanced'} primary
 * @property {string} note
 * @property {number} relevance
 */

/**
 * @param {object} ctx
 * @returns {MarketStressInsight}
 */
export function analyzeMarketStress(ctx) {
  const prompt = (ctx.prompt || "").toLowerCase();
  const m = readFusionMarketState(ctx.fusion);
  const regime = ctx.regime?.primary;

  let primary = /** @type {MarketStressInsight['primary']} */ ("balanced");
  let note = "";
  let relevance = 0.35;

  const fragilityQ =
    /fragil|underpric|complacent|hidden|stress|concentration risk|liquidity/i.test(prompt);

  if (fragilityQ) relevance += 0.25;

  if (m.volCompressed && (regime === "geopolitical_stress" || /energy|oil|iran|war/i.test(prompt))) {
    primary = "complacency";
    note = "Markets appear complacent toward energy and headline gap risk while volatility stays compressed.";
    relevance += 0.2;
  } else if (m.volCompressed && m.equitiesFirm) {
    primary = "vol_compression_risk";
    note =
      "Volatility compression alongside firm equities raises the risk of a volatility reset if macro surprises arrive.";
    relevance += 0.15;
  }

  if (regime === "ai_momentum" || /\bai\b|mega.?cap|concentration/i.test(prompt)) {
    primary = primary === "balanced" ? "concentration" : primary;
    note =
      note ||
      "AI concentration risk remains elevated — index-level calm can hide single-factor dependency.";
    relevance += 0.2;
  }

  if (regime === "risk_off" || (m.spyPct != null && m.spyPct < -0.35)) {
    primary = "stress";
    note = "Risk assets show stress — correlations may rise and liquidity can thin in gap moves.";
    relevance += 0.2;
  }

  if (m.equitiesFirm && m.techOutperforming && m.smallCapLagging) {
    primary = primary === "balanced" ? "overheating" : primary;
    note =
      note ||
      "Leadership concentration with lagging breadth can reflect overheating in a narrow factor pocket.";
    relevance += 0.1;
  }

  if (/liquidity|qt|tightening|credit spread/i.test(prompt)) {
    primary = "liquidity_fragility";
    note =
      "Liquidity fragility matters if financial conditions tighten while positioning remains crowded.";
    relevance += 0.15;
  }

  const headline = concise(note || "Stress signals are balanced — no dominant complacency or fragility flag on current inputs.", 240);

  logicDebug("marketStressEngine", { primary, relevance });

  return { headline, primary, note: concise(note, 220), relevance: Math.min(1, relevance) };
}
