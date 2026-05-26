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
  let direct = res.directAnswer || res.summary || "";

  if (regime?.adaptationNote && direct.length < 280) {
    direct = concise(`${direct} Regime: ${regime.label} — ${regime.adaptationNote}`, 360);
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
