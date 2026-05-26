/**
 * Market priority engine — what markets care about most right now.
 * @module logic/engines/marketPriorityEngine
 */

import { logicDebug } from "../shared.js";
import { concise } from "./topicContext.js";
import { readFusionMarketState } from "./fusionSignals.js";

/**
 * @typedef {Object} MarketPriorityInsight
 * @property {string} primary
 * @property {string} secondary
 * @property {string} headline
 * @property {string[]} ranked
 * @property {number} relevance
 */

const PRIORITIES = [
  { id: "rates", label: "Rates", weight: 0 },
  { id: "liquidity", label: "Liquidity", weight: 0 },
  { id: "oil", label: "Oil", weight: 0 },
  { id: "geopolitics", label: "Geopolitics", weight: 0 },
  { id: "ai_earnings", label: "AI earnings", weight: 0 },
  { id: "volatility", label: "Volatility", weight: 0 },
  { id: "inflation", label: "Inflation", weight: 0 },
  { id: "growth", label: "Growth", weight: 0 },
];

/**
 * @param {object} ctx
 * @param {object} [marketIntelligence]
 * @returns {MarketPriorityInsight}
 */
export function analyzeMarketPriority(ctx, marketIntelligence) {
  const prompt = (ctx.prompt || "").toLowerCase();
  const regime = ctx.regime?.primary;
  const m = readFusionMarketState(ctx.fusion);
  const mi = marketIntelligence || ctx.marketIntelligence;
  const scores = PRIORITIES.map((p) => ({ ...p, weight: 0 }));

  const bump = (id, w) => {
    const row = scores.find((s) => s.id === id);
    if (row) row.weight += w;
  };

  if (/rates?|yields?|fed|fomc|what matters most|dominat/i.test(prompt)) bump("rates", 3);
  if (/liquidity|qe|qt|financial conditions/i.test(prompt)) bump("liquidity", 3);
  if (/oil|crude|energy/i.test(prompt)) bump("oil", 3);
  if (/iran|war|geopolit|conflict/i.test(prompt)) bump("geopolitics", 3);
  if (/\bai\b|nvidia|earnings|capex/i.test(prompt)) bump("ai_earnings", 3);
  if (/vol|vix|compress/i.test(prompt)) bump("volatility", 2.5);
  if (/inflation|cpi|pce/i.test(prompt)) bump("inflation", 2.5);
  if (/recession|growth|gdp|payrolls/i.test(prompt)) bump("growth", 2.5);

  if (regime === "inflation") bump("inflation", 2);
  if (regime === "ai_momentum") bump("ai_earnings", 2.5);
  if (regime === "geopolitical_stress") bump("geopolitics", 2);
  if (regime === "liquidity_expansion") bump("liquidity", 2);
  if (regime === "recession_risk") bump("growth", 2);

  if (m.bondsOutperformingEquities) bump("rates", 1.5);
  if (m.techOutperforming) bump("ai_earnings", 1.5);
  if (m.volCompressed) bump("volatility", 1);
  if (m.xlePct != null && m.xlePct > 0.2) bump("oil", 1.5);

  const crossFactors = mi?.crossAsset?.dominantFactors || [];
  for (const f of crossFactors) {
    if (/rate/i.test(f)) bump("rates", 1.5);
    if (/oil/i.test(f)) bump("oil", 1.5);
    if (/ai/i.test(f)) bump("ai_earnings", 1.5);
    if (/vol/i.test(f)) bump("volatility", 1);
    if (/inflation/i.test(f)) bump("inflation", 1);
    if (/geopolit/i.test(f)) bump("geopolitics", 1);
    if (/liquidity/i.test(f)) bump("liquidity", 1);
  }

  scores.sort((a, b) => b.weight - a.weight);
  const ranked = scores.filter((s) => s.weight > 0).map((s) => s.label);
  const primary = ranked[0] || "Cross-asset mix";
  const secondary = ranked[1] || "Macro data";

  let headline = "";
  if (primary === "Rates" && secondary === "Geopolitics") {
    headline =
      "Markets currently appear more sensitive to rates than geopolitical risk unless energy supply breaks.";
  } else if (primary === "Rates" && secondary === "Inflation") {
    headline = "Markets currently appear more sensitive to rates than inflation prints alone.";
  } else if (primary === "Liquidity") {
    headline = "Liquidity expectations continue to outweigh near-term geopolitical concerns for risk assets.";
  } else if (primary === "AI earnings") {
    headline = "AI earnings and capex narratives dominate index-level pricing beneath macro headlines.";
  } else if (ranked.length >= 2) {
    headline = `${primary} dominates cross-asset pricing; ${secondary} is the secondary channel.`;
  } else {
    headline = `${primary} is the primary market sensitivity on current inputs.`;
  }

  let relevance = 0.5;
  if (/what matters most|care about most|right now|dominant/i.test(prompt)) relevance = 0.9;
  if (ranked.length >= 2) relevance += 0.1;

  logicDebug("marketPriorityEngine", { primary, secondary, relevance });

  return {
    primary,
    secondary,
    headline: concise(headline, 220),
    ranked: ranked.slice(0, 4),
    relevance: Math.min(1, relevance),
  };
}
