/**
 * Cross-asset engine — dominant sensitivities across macro risk factors.
 * @module logic/engines/crossAssetEngine
 */

import { logicDebug } from "../shared.js";
import { concise } from "./topicContext.js";
import { readFusionMarketState } from "./fusionSignals.js";

/**
 * @typedef {Object} CrossAssetInsight
 * @property {string} headline
 * @property {string[]} dominantFactors
 * @property {Record<string, string>} factorNotes
 * @property {number} relevance
 */

const FACTOR_WEIGHTS = [
  { id: "rates", re: /rates?|yields?|fed|fomc|treasury|real yield/i, label: "Rates" },
  { id: "oil", re: /oil|crude|energy|brent|wti|opec/i, label: "Oil" },
  { id: "inflation", re: /inflation|cpi|pce|disinflation|sticky/i, label: "Inflation" },
  { id: "volatility", re: /volatility|vix|vol compress|gap risk/i, label: "Volatility" },
  { id: "liquidity", re: /liquidity|qe|qt|financial conditions|credit/i, label: "Liquidity" },
  { id: "ai", re: /\bai\b|semiconductor|nvidia|hyperscaler|capex/i, label: "AI" },
  { id: "commodities", re: /copper|gold|commodit|lng|natural gas/i, label: "Commodities" },
  { id: "fx", re: /dollar|dxy|currency|fx|yen|euro/i, label: "Currencies" },
  { id: "geopolitical", re: /iran|war|conflict|geopolit|sanctions|middle east/i, label: "Geopolitical risk" },
];

/**
 * @param {object} ctx
 * @returns {CrossAssetInsight}
 */
export function analyzeCrossAssetSensitivity(ctx) {
  const prompt = ctx.prompt || "";
  const t = prompt.toLowerCase();
  const fusion = ctx.fusion;
  const m = readFusionMarketState(fusion);
  const regime = ctx.regime?.primary;

  /** @type {{ id: string, label: string, score: number }}[]} */
  const scored = [];

  for (const f of FACTOR_WEIGHTS) {
    let score = f.re.test(t) ? 3 : 0;
    if (f.id === "rates" && /rates|yields|fed|bond/i.test(t)) score += 2;
    if (f.id === "oil" && (regime === "inflation" || regime === "geopolitical_stress")) score += 1.5;
    if (f.id === "geopolitical" && regime === "geopolitical_stress") score += 2;
    if (f.id === "ai" && regime === "ai_momentum") score += 2;
    if (f.id === "volatility" && !m.volCompressed) score += 1;
    if (f.id === "rates" && m.bondsOutperformingEquities) score += 1.5;
    if (f.id === "oil" && m.xlePct != null && m.xlePct > 0.3) score += 1;
    if (score > 0) scored.push({ id: f.id, label: f.label, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 3);
  const dominantFactors = top.map((x) => x.label);

  /** @type {Record<string, string>} */
  const factorNotes = {};

  if (top[0]?.id === "rates" || regime === "inflation" || /yields|rates/i.test(t)) {
    factorNotes.rates =
      "Rates sensitivity appears elevated — duration, growth multiples and financial conditions are the primary transmission channel.";
  }
  if (top[0]?.id === "geopolitical" && top[1]?.id === "rates") {
    factorNotes.dominance =
      "Markets currently appear more sensitive to rates than geopolitical risk, unless energy supply is directly disrupted.";
  } else if (top[0]?.id === "rates" && top[1]?.id === "geopolitical") {
    factorNotes.dominance =
      "Rates dominate cross-asset pricing; geopolitical risk is a secondary gap-risk unless oil breaks higher.";
  }
  if (top.some((x) => x.id === "oil") || /oil|energy|transport|industrial/i.test(t)) {
    factorNotes.oil =
      "Oil sensitivity is rising across transport, industrials and inflation expectations.";
  }
  if (top.some((x) => x.id === "ai")) {
    factorNotes.ai =
      "AI and semiconductor leadership remain the equity beta anchor; macro shocks pass through capex and multiples first.";
  }
  if (top.some((x) => x.id === "liquidity")) {
    factorNotes.liquidity =
      "Liquidity regime shifts would matter more than single data prints for risk assets.";
  }

  const relationshipQ =
    /relationship|across|matter most|sensitivity|oil.*yields|yields.*volatility/i.test(t);
  let relevance = top.length ? 0.45 + top[0].score * 0.05 : 0.3;
  if (relationshipQ) relevance = Math.min(1, relevance + 0.25);

  const headline = concise(
    factorNotes.dominance ||
      (dominantFactors.length >= 2
        ? `Cross-asset pricing is currently led by ${dominantFactors[0]} and ${dominantFactors[1]}; ${dominantFactors[2] || "liquidity"} is secondary.`
        : dominantFactors.length === 1
          ? `${dominantFactors[0]} sensitivity dominates the current macro channel.`
          : "No single factor clearly dominates; cross-asset signals are mixed on available inputs."),
    240
  );

  logicDebug("crossAssetEngine", { dominantFactors, relevance });

  return {
    headline,
    dominantFactors,
    factorNotes,
    relevance: Math.min(1, relevance),
  };
}
