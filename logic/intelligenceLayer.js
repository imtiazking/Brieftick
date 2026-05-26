/**
 * Intelligence layer — intent plan, gated enrichment, response contract.
 * @module logic/intelligenceLayer
 */

import { resolveMarketGraph, applyGraphToResponse } from "./engines/marketGraph.js";
import { detectMarketRegime } from "./engines/regimeEngine.js";
import { updateNarrativeState } from "./engines/narrativeEngine.js";
import {
  applyRelationshipMemoryToResponse,
  recordRelationshipMemory,
} from "./relationshipMemory.js";
import { logicQualityValidator } from "./engines/logicQualityValidator.js";
import { synthesizeIntelligence } from "./engines/intelligenceSynthesis.js";
import { logicFinalPolish } from "./engines/logicFinalPolish.js";
import { hookIntelligenceStream } from "./engines/intelligenceStream.js";
import { runCausalReasoningEngine } from "./engines/causalReasoningEngine.js";
import { runMacroInterpretationEngine } from "./engines/macroInterpretationEngine.js";
import { runMarketIntelligenceStack } from "./engines/marketIntelligenceOrchestrator.js";
import { runIntelligenceStreamOrchestrator } from "./engines/intelligenceStreamOrchestrator.js";
import { applyGatedEnrichment, shouldBuildFullMarketStack } from "./engines/enrichmentGate.js";
import { applyResponseContract } from "./engines/applyResponseContract.js";
import { inferWatchlistExposure } from "./watchlistStore.js";
import { logicDebug } from "./shared.js";

/**
 * @param {object} ctx
 */
export function buildIntelligenceContext(ctx) {
  const regime = detectMarketRegime(ctx);
  const plan = ctx.responsePlan;
  const graph = plan?.enrichment?.graph !== false ? resolveMarketGraph(ctx.prompt, ctx.questionKind) : null;
  updateNarrativeState(ctx.prompt, ctx.questionKind);

  const watchlistExposure = inferWatchlistExposure();
  let enriched = { ...ctx, regime, graph, watchlistExposure };

  let marketIntelligence = null;
  let intelligenceStream = null;

  if (shouldBuildFullMarketStack(ctx)) {
    marketIntelligence = runMarketIntelligenceStack(enriched);
    intelligenceStream = runIntelligenceStreamOrchestrator(
      { ...enriched, marketIntelligence },
      { proactive: true, publishHooks: false }
    );
  } else {
    marketIntelligence = {
      structure: { headline: "", relevance: 0 },
      crossAsset: { headline: "", relevance: 0 },
      positioning: { headline: "", relevance: 0 },
      narrative: { shiftNote: "", relevance: 0 },
      divergence: { headline: "", divergences: [], relevance: 0 },
      stress: { headline: "", relevance: 0, primary: "balanced" },
      feedNotes: [],
      isComplexQuery: false,
    };
    intelligenceStream = { feed: [], priority: null, portfolio: ctx.portfolioIntelligence };
  }

  return {
    ...enriched,
    narrative: marketIntelligence.narrative,
    positioning: marketIntelligence.positioning,
    marketIntelligence,
    intelligenceStream,
    marketStructure: marketIntelligence.structure,
    crossAsset: marketIntelligence.crossAsset,
    marketDivergence: marketIntelligence.divergence,
    marketStress: marketIntelligence.stress,
    marketPriority: intelligenceStream?.priority,
    liveNarrative: intelligenceStream?.liveNarrative,
    portfolioIntelligence: intelligenceStream?.portfolio,
  };
}

/**
 * @param {import('./types.js').LogicResponse} res
 * @param {object} ctx
 */
export function enrichIntelligenceLayer(res, ctx) {
  const plan = ctx.responsePlan;
  let out = {
    ...res,
    questionKind: ctx.questionKind,
    regimeLabel: ctx.regime?.label,
    mode: res.mode || ctx.mode,
  };

  if (plan?.enrichment?.graph !== false && ctx.mode !== "macro-interpretation") {
    out = applyGraphToResponse(out, ctx.graph);
  }

  out = applyGatedEnrichment(out, ctx);

  if (plan?.enrichment?.relationshipMemory) {
    out = applyRelationshipMemoryToResponse(out, ctx.prompt);
  }

  if (ctx.mode === "causal" && !ctx.causalModel) {
    ctx.causalModel = runCausalReasoningEngine(ctx.prompt);
  }
  if (ctx.mode === "macro-interpretation" && !ctx.macroInterpretationModel) {
    ctx.macroInterpretationModel = runMacroInterpretationEngine(ctx.prompt);
  }

  out = logicQualityValidator(ctx.prompt, out, ctx);

  if (plan?.enrichment?.synthesis !== false) {
    out = synthesizeIntelligence(out, ctx);
  }

  out = logicFinalPolish(out, ctx);

  if (plan?.enrichment?.feedHook) {
    hookIntelligenceStream(ctx, out);
  }

  out = applyResponseContract(out, plan);

  logicDebug("intelligenceLayer enriched", {
    intent: plan?.intentId,
    regime: ctx.regime?.primary,
  });

  return out;
}

export { recordRelationshipMemory };
