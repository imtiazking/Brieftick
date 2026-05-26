/**
 * Market intelligence orchestrator — runs structure, cross-asset, positioning,
 * narrative, divergence, stress after fusion/graph/regime/narrative context.
 *
 * @module logic/engines/marketIntelligenceOrchestrator
 */

import { logicDebug } from "../shared.js";
import { analyzeMarketStructure } from "./marketStructureEngine.js";
import { analyzeCrossAssetSensitivity } from "./crossAssetEngine.js";
import { analyzePositioning } from "./positioningEngine.js";
import { analyzeNarrativeShifts } from "./narrativeEngine.js";
import { detectMarketDivergence } from "./marketDivergenceEngine.js";
import { analyzeMarketStress } from "./marketStressEngine.js";
import { hookIntelligenceFeed } from "./intelligenceFeedEngine.js";
import { concise } from "./topicContext.js";

/**
 * @typedef {Object} MarketIntelligenceSnapshot
 * @property {import('./marketStructureEngine.js').MarketStructureInsight} structure
 * @property {import('./crossAssetEngine.js').CrossAssetInsight} crossAsset
 * @property {import('./positioningEngine.js').PositioningInsight} positioning
 * @property {import('./narrativeEngine.js').NarrativeInsight} narrative
 * @property {import('./marketDivergenceEngine.js').DivergenceInsight} divergence
 * @property {import('./marketStressEngine.js').MarketStressInsight} stress
 * @property {import('./intelligenceFeedEngine.js').IntelligenceNote[]} feedNotes
 * @property {boolean} isComplexQuery
 */

/**
 * @param {string} prompt
 * @param {object} ctx
 */
export function isComplexMarketQuery(prompt, ctx) {
  const t = (prompt || "").toLowerCase();
  if (t.length >= 55) return true;
  if (
    /why can|why would|how can|what happens if|what relationships|hidden fragil|market structure|diverg|conflict|underpric|breadth|positioning|soft landing|recession|macro condition/i.test(
      t
    )
  ) {
    return true;
  }
  const modes = new Set([
    "macro-interpretation",
    "causal",
    "scenario",
    "risk-regime",
    "briefing",
    "market-pulse",
    "ticker",
    "portfolio",
  ]);
  if (modes.has(ctx.mode) && t.length >= 35) return true;
  return false;
}

/**
 * Run all market intelligence engines (after fusion + regime + graph context).
 * @param {object} ctx
 * @returns {MarketIntelligenceSnapshot}
 */
export function runMarketIntelligenceStack(ctx) {
  const narrative = analyzeNarrativeShifts(ctx.prompt, ctx.questionKind, ctx);
  const snapshot = {
    structure: analyzeMarketStructure(ctx),
    crossAsset: analyzeCrossAssetSensitivity(ctx),
    positioning: analyzePositioning(ctx.prompt, ctx.regime, ctx),
    narrative,
    divergence: detectMarketDivergence(ctx),
    stress: analyzeMarketStress(ctx),
    feedNotes: [],
    isComplexQuery: isComplexMarketQuery(ctx.prompt, ctx),
  };
  snapshot.feedNotes = hookIntelligenceFeed(snapshot, ctx);
  logicDebug("marketIntelligenceOrchestrator", {
    complex: snapshot.isComplexQuery,
    feed: snapshot.feedNotes.length,
  });
  return snapshot;
}

const FILLER_RE =
  /indices tracked|volatility monitored|policy and inflation path dominate|mega-cap tech vs cyclicals|tape:\s*spy/i;

/**
 * @param {string} text
 */
function isWeakCard(text) {
  const t = String(text || "").trim();
  return !t || t.length < 28 || FILLER_RE.test(t);
}

/**
 * Apply market intelligence to response when relevant (no overload).
 * @param {import('../types.js').LogicResponse} res
 * @param {object} ctx
 */
export function applyMarketIntelligenceToResponse(res, ctx) {
  const snap = ctx.marketIntelligence;
  if (!snap) return res;

  const complex = snap.isComplexQuery;
  let out = { ...res, cards: { ...(res.cards || {}) }, optionalCards: { ...(res.optionalCards || {}) } };
  /** @type {string[]} */
  const signals = [...(res.signals || [])];

  const addSignal = (prefix, text) => {
    const line = concise(text, 140);
    if (!line || line.length < 18) return;
    const chip = `${prefix}: ${line}`;
    if (!signals.some((s) => s.toLowerCase().includes(line.slice(0, 40).toLowerCase()))) {
      signals.push(chip);
    }
  };

  const maybeOptional = (key, text, minRelevance) => {
    const val = concise(text, 200);
    if (!val || val.length < 20) return;
    if (!complex && minRelevance > 0.55) return;
    if (out.optionalCards[key] && !isWeakCard(out.optionalCards[key])) return;
    out.optionalCards[key] = val;
  };

  if (snap.structure.relevance >= 0.45) {
    addSignal("Structure", snap.structure.headline);
    maybeOptional("marketStructure", snap.structure.headline, snap.structure.relevance);
    if (complex && isWeakCard(out.cards.macroContext)) {
      out.cards.macroContext = snap.structure.breadthNote || snap.structure.headline;
    }
  }

  if (snap.crossAsset.relevance >= 0.45) {
    addSignal("Cross-asset", snap.crossAsset.headline);
    maybeOptional("crossAssetSignal", snap.crossAsset.headline, snap.crossAsset.relevance);
    if (complex && isWeakCard(out.cards.catalyst)) {
      out.cards.catalyst = snap.crossAsset.factorNotes.rates || snap.crossAsset.headline;
    }
  }

  if (snap.positioning.relevance >= 0.4) {
    addSignal("Positioning", snap.positioning.headline);
    const posNote = snap.positioning.headline || snap.positioning.stressNote;
    if (!out.optionalCards.riskSignal || isWeakCard(out.optionalCards.riskSignal)) {
      out.optionalCards.riskSignal = concise(posNote, 200);
    }
    if (complex && isWeakCard(out.cards.sectorImpact)) {
      out.cards.sectorImpact = snap.positioning.amplificationNote || posNote;
    }
  }

  if (snap.divergence.relevance >= 0.45 && snap.divergence.divergences.length) {
    addSignal("Divergence", snap.divergence.headline);
    maybeOptional("marketDivergence", snap.divergence.headline, snap.divergence.relevance);
    if (complex && isWeakCard(out.cards.volatility)) {
      out.cards.volatility = snap.divergence.divergences[0];
    }
  }

  if (snap.stress.relevance >= 0.45) {
    addSignal("Stress", snap.stress.headline);
    maybeOptional("stressSignal", snap.stress.headline, snap.stress.relevance);
  }

  if (snap.narrative.shiftNote && snap.narrative.relevance >= 0.4) {
    addSignal("Narrative", snap.narrative.shiftNote);
    out.narrativeNote = snap.narrative.shiftNote;
    if (!out.optionalCards.narrativeLink) {
      out.optionalCards.narrativeLink = concise(snap.narrative.shiftNote, 200);
    }
  }

  out.signals = signals.slice(0, 6);
  out.marketIntelligenceApplied = true;
  return out;
}
