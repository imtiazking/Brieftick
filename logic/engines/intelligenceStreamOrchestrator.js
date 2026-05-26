/**
 * Intelligence stream orchestrator — coordinates live feed, narrative, priority, stress, divergence.
 * @module logic/engines/intelligenceStreamOrchestrator
 */

import { logicDebug } from "../shared.js";
import { concise } from "./topicContext.js";
import { runMarketIntelligenceStack } from "./marketIntelligenceOrchestrator.js";
import { runLiveNarrativeEngine } from "./liveNarrativeEngine.js";
import { analyzeMarketPriority } from "./marketPriorityEngine.js";
import { analyzePortfolioIntelligence } from "./portfolioIntelligenceEngine.js";
import {
  generateIntelligenceFeed,
  notesToIntelligenceChips,
} from "./intelligenceFeedEngine.js";
import { publishIntelligenceFeedHooks } from "./intelligenceStream.js";

/**
 * @typedef {Object} IntelligenceStreamBundle
 * @property {import('./intelligenceFeedEngine.js').IntelligenceNote[]} feed
 * @property {string[]} chips
 * @property {string} leadNote
 * @property {import('./liveNarrativeEngine.js').LiveNarrativeInsight} liveNarrative
 * @property {import('./marketPriorityEngine.js').MarketPriorityInsight} priority
 * @property {import('./portfolioIntelligenceEngine.js').PortfolioIntelligenceInsight} portfolio
 * @property {import('./marketIntelligenceOrchestrator.js').MarketIntelligenceSnapshot} marketIntelligence
 * @property {boolean} proactive
 */

/**
 * @param {object} ctx
 * @param {{ proactive?: boolean, publishHooks?: boolean }} [opts]
 * @returns {IntelligenceStreamBundle}
 */
export function runIntelligenceStreamOrchestrator(ctx, opts = {}) {
  const proactive = opts.proactive !== false;
  const marketIntelligence =
    ctx.marketIntelligence || runMarketIntelligenceStack({ ...ctx, prompt: ctx.prompt || "" });

  const liveNarrative = runLiveNarrativeEngine(
    { ...ctx, marketIntelligence },
    marketIntelligence
  );
  const priority = analyzeMarketPriority({ ...ctx, marketIntelligence }, marketIntelligence);
  const portfolio = analyzePortfolioIntelligence({ ...ctx, marketIntelligence }, marketIntelligence);

  const feed = generateIntelligenceFeed({
    ctx: { ...ctx, marketIntelligence },
    marketIntelligence,
    liveNarrative,
    priority,
    portfolio,
  });

  const chips = notesToIntelligenceChips(feed);
  const leadNote = feed[0]?.message || liveNarrative.headline || priority.headline || "";

  if (opts.publishHooks !== false) {
    publishIntelligenceFeedHooks(
      feed.map((n) => ({
        id: n.id,
        message: n.message,
        severity: n.category === "narrative" || n.category === "divergence" ? "shift" : "info",
      }))
    );
  }

  logicDebug("intelligenceStreamOrchestrator", {
    feed: feed.length,
    proactive,
    lead: leadNote.slice(0, 60),
  });

  return {
    feed,
    chips,
    leadNote: concise(leadNote, 220),
    liveNarrative,
    priority,
    portfolio,
    marketIntelligence,
    proactive,
  };
}

/**
 * Apply stream bundle to Logic response (proactive + query-enriched).
 * @param {import('../types.js').LogicResponse} res
 * @param {object} ctx
 */
export function applyIntelligenceStreamToResponse(res, ctx) {
  const stream =
    ctx.intelligenceStream || runIntelligenceStreamOrchestrator(ctx, { publishHooks: false });
  if (!stream?.feed?.length) return res;

  const prompt = (ctx.prompt || "").toLowerCase();
  const wantsPriority = /what matters most|care about most|right now/i.test(prompt);
  const wantsPortfolio = /portfolio|holdings|my book/i.test(prompt) || ctx.mode === "portfolio";

  let out = {
    ...res,
    liveIntelligence: stream,
    intelligenceFeed: stream.feed,
    optionalCards: { ...(res.optionalCards || {}) },
  };

  /** @type {string[]} */
  const signals = [...(res.signals || [])];
  const addChip = (text) => {
    const line = concise(text, 130);
    if (!line) return;
    if (!signals.some((s) => s.includes(line.slice(0, 35)))) signals.push(line);
  };

  for (const note of stream.feed.slice(0, 4)) {
    addChip(note.message);
  }

  if (wantsPriority && stream.priority?.headline) {
    out.directAnswer = out.directAnswer || stream.priority.headline;
    out.optionalCards.prioritySignal = stream.priority.headline;
  }

  if ((wantsPortfolio || stream.portfolio?.relevance >= 0.85) && stream.portfolio?.headline) {
    out.directAnswer = out.directAnswer || stream.portfolio.headline;
    out.optionalCards.portfolioImpact =
      out.optionalCards.portfolioImpact || stream.portfolio.headline;
    for (const note of stream.portfolio.personalizedNotes || []) {
      addChip(note);
    }
  }

  if (stream.liveNarrative?.headline && !out.narrativeNote) {
    out.narrativeNote = stream.liveNarrative.headline;
    out.optionalCards.narrativeLink = stream.liveNarrative.headline;
  }

  if (!out.cards?.snapshot?.trim() && stream.leadNote) {
    out.cards = { ...(out.cards || {}), snapshot: stream.leadNote };
  }

  out.signals = signals.slice(0, 8);
  out.streamOrchestratorApplied = true;
  return out;
}
