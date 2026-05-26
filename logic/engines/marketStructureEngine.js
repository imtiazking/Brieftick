/**
 * Market structure engine — breadth, concentration, leadership, fragile rallies.
 * @module logic/engines/marketStructureEngine
 */

import { logicDebug } from "../shared.js";
import { concise } from "./topicContext.js";
import { readFusionMarketState } from "./fusionSignals.js";

/**
 * @typedef {Object} MarketStructureInsight
 * @property {string} headline
 * @property {string} breadthNote
 * @property {string} leadershipNote
 * @property {string} fragilityNote
 * @property {string[]} flags
 * @property {number} relevance
 */

/**
 * @param {object} ctx
 * @returns {MarketStructureInsight}
 */
export function analyzeMarketStructure(ctx) {
  const prompt = (ctx.prompt || "").toLowerCase();
  const fusion = ctx.fusion;
  const m = readFusionMarketState(fusion);
  /** @type {string[]} */
  const flags = [];
  let breadthNote = "";
  let leadershipNote = "";
  let fragilityNote = "";
  let relevance = 0.35;

  const aiTopic =
    /\bai\b|artificial intelligence|nvidia|semiconductor|mega.?cap|magnificent|hyperscaler|capex/i.test(
      prompt
    );
  const structureTopic =
    /market structure|breadth|concentration|leadership|narrow|participation|fragil|mega.?cap|rotation/i.test(
      prompt
    );

  if (aiTopic || structureTopic || ctx.regime?.primary === "ai_momentum") relevance += 0.25;

  if (m.techOutperforming && (m.smallCapLagging || m.cyclicalsLagging)) {
    flags.push("narrow_breadth");
    breadthNote =
      "Breadth appears narrow — mega-cap and duration leaders are carrying indices while cyclicals and small caps lag.";
    relevance += 0.2;
  } else if (m.techOutperforming) {
    flags.push("tech_leadership");
    leadershipNote =
      "AI leadership remains strong, but participation may be concentrated in a small group of duration-sensitive leaders.";
    relevance += 0.15;
  }

  if (m.equitiesFirm && m.cyclicalsLagging && m.techOutperforming) {
    flags.push("fragile_rally");
    fragilityNote =
      "Equities are firm on the surface, but cyclical underperformance suggests a fragile rally with narrowing participation.";
    relevance += 0.2;
  }

  if (/\bmomentum\b|exhaust|narrowing participation|rotation stress/i.test(prompt)) {
    flags.push("momentum_stress");
    leadershipNote =
      leadershipNote ||
      "Momentum concentration raises unwind risk if earnings revisions or liquidity conditions shift.";
    relevance += 0.15;
  }

  if (ctx.regime?.primary === "ai_momentum" && !leadershipNote) {
    leadershipNote =
      "Markets appear increasingly dependent on AI-linked mega-cap leadership; breadth fatigue would matter more than index levels.";
    flags.push("ai_dependency");
    relevance += 0.1;
  }

  if (m.volCompressed && m.equitiesFirm) {
    fragilityNote =
      fragilityNote ||
      "Low volatility alongside narrow leadership can mask underlying rotation stress.";
    flags.push("complacent_structure");
  }

  const headline = concise(
    [leadershipNote, breadthNote, fragilityNote].filter(Boolean).join(" ") ||
      "Market structure reads balanced; leadership is not obviously one-sided on available tape.",
    220
  );

  logicDebug("marketStructureEngine", { flags, relevance });

  return {
    headline,
    breadthNote: concise(breadthNote, 200),
    leadershipNote: concise(leadershipNote, 200),
    fragilityNote: concise(fragilityNote, 200),
    flags,
    relevance: Math.min(1, relevance),
  };
}
