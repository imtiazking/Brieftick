/**
 * Market divergence engine — conflicting cross-asset signals.
 * @module logic/engines/marketDivergenceEngine
 */

import { logicDebug } from "../shared.js";
import { concise } from "./topicContext.js";
import { readFusionMarketState } from "./fusionSignals.js";

/**
 * @typedef {Object} DivergenceInsight
 * @property {string} headline
 * @property {string[]} divergences
 * @property {number} relevance
 */

/**
 * @param {object} ctx
 * @returns {DivergenceInsight}
 */
export function detectMarketDivergence(ctx) {
  const prompt = (ctx.prompt || "").toLowerCase();
  const m = readFusionMarketState(ctx.fusion);
  const regime = ctx.regime?.primary;
  /** @type {string[]} */
  const divergences = [];
  let relevance = 0.3;

  if (m.equitiesFirm && m.bondsOutperformingEquities) {
    divergences.push(
      "Bond markets and equities appear to be sending conflicting growth signals — bonds may be pricing slower growth faster than equities."
    );
    relevance += 0.25;
  }

  if (
    (m.equitiesFirm || (m.spyPct != null && m.spyPct > -0.1)) &&
    m.bondsOutperformingEquities &&
    /equities.*strong|stocks.*up|bond.*growth|slower growth/i.test(prompt)
  ) {
    relevance += 0.2;
  }

  if (m.volCompressed && (regime === "geopolitical_stress" || /geopolit|iran|war|conflict/i.test(prompt))) {
    divergences.push(
      "Volatility remains compressed despite elevated geopolitical risk — a potential gap-risk divergence."
    );
    relevance += 0.2;
  }

  if (m.xlePct != null && m.xlePct > 0.25 && /inflation expectation|cpi|pce/i.test(prompt)) {
    divergences.push(
      "Oil is firm while broader inflation expectations may stay contained if goods demand is soft — watch goods vs energy pass-through."
    );
    relevance += 0.15;
  }

  if (m.techOutperforming && m.cyclicalsLagging) {
    divergences.push(
      "Mega-cap tech strength contrasts with cyclical weakness — leadership divergence, not broad participation."
    );
    relevance += 0.15;
  }

  if (/falling yields|lower yields|yields fall/i.test(prompt) && m.equitiesFirm) {
    divergences.push(
      "Falling yields alongside firm equities can reflect cut pricing or recession hedging — interpretation depends on earnings breadth."
    );
    relevance += 0.15;
  }

  if (/diverg|conflict|disconnect|while.*bond|equities.*bond/i.test(prompt)) {
    relevance += 0.2;
  }

  const headline = concise(
    divergences[0] ||
      (divergences.length > 1
        ? divergences.slice(0, 2).join(" ")
        : "Cross-asset signals are not showing a major divergence on available tape."),
    260
  );

  logicDebug("marketDivergenceEngine", { count: divergences.length, relevance });

  return {
    headline,
    divergences: divergences.map((d) => concise(d, 220)),
    relevance: Math.min(1, relevance),
  };
}
