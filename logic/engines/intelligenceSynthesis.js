/**
 * Intelligence synthesis — dense strategist-grade copy.
 * @module logic/engines/intelligenceSynthesis
 */

import { concise } from "./topicContext.js";

/**
 * @param {import('../types.js').LogicResponse} res
 * @param {object} ctx
 */
export function synthesizeIntelligence(res, ctx) {
  const regime = ctx.regime;
  const graph = ctx.graph;
  const mi = ctx.marketIntelligence;
  let direct = res.directAnswer || res.summary || "";

  const complex = mi?.isComplexQuery;
  const structureLine = mi?.structure?.headline;
  const crossLine = mi?.crossAsset?.headline;

  if (complex && structureLine && direct.length < 300 && !direct.includes(structureLine.slice(0, 40))) {
    direct = concise(`${direct} ${structureLine}`, 380);
  } else if (regime?.adaptationNote && direct.length < 280 && !complex) {
    direct = concise(`${direct} Regime: ${regime.label} — ${regime.adaptationNote}`, 360);
  }

  if (complex && crossLine && /relationship|across|matter most|structure|fragil|diverg/i.test(ctx.prompt || "")) {
    if (!direct.includes(crossLine.slice(0, 35))) {
      direct = concise(`${direct} ${crossLine}`, 400);
    }
  }

  if (graph?.narrative && ctx.mode === "causal" && !direct.includes("→")) {
    direct = concise(graph.narrative, 360);
  }

  const cards = { ...(res.cards || {}) };
  for (const k of Object.keys(cards)) {
    cards[k] = denseTrim(cards[k]);
  }

  return {
    ...res,
    directAnswer: denseTrim(direct),
    summary: denseTrim(res.summary || direct),
    cards,
    synthesisApplied: true,
  };
}

/**
 * @param {string} text
 */
function denseTrim(text) {
  return concise(
    String(text || "")
      .replace(/\b(in order to|it is important to note that|overall,)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim(),
    200
  );
}
