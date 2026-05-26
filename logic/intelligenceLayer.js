/**
 * Intelligence layer — graph, regime, market structure, live stream, memory, quality.
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
import { runMarketIntelligenceStack, applyMarketIntelligenceToResponse } from "./engines/marketIntelligenceOrchestrator.js";
import {
  runIntelligenceStreamOrchestrator,
  applyIntelligenceStreamToResponse,
} from "./engines/intelligenceStreamOrchestrator.js";
import { inferWatchlistExposure } from "./watchlistStore.js";
import { logicDebug } from "./shared.js";

/**
 * Build shared intelligence context after data fusion.
 * @param {object} ctx
 */
export function buildIntelligenceContext(ctx) {
  const regime = detectMarketRegime(ctx);
  const graph = resolveMarketGraph(ctx.prompt, ctx.questionKind);
  updateNarrativeState(ctx.prompt, ctx.questionKind);

  const watchlistExposure = inferWatchlistExposure();
  const enriched = { ...ctx, regime, graph, watchlistExposure };
  const marketIntelligence = runMarketIntelligenceStack(enriched);
  const intelligenceStream = runIntelligenceStreamOrchestrator(
    { ...enriched, marketIntelligence },
    { proactive: true, publishHooks: false }
  );

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
    marketPriority: intelligenceStream.priority,
    liveNarrative: intelligenceStream.liveNarrative,
    portfolioIntelligence: intelligenceStream.portfolio,
  };
}

/**
 * @param {import('./types.js').LogicResponse} res
 * @param {object} ctx
 */
export function enrichIntelligenceLayer(res, ctx) {
  let out = { ...res, questionKind: ctx.questionKind, regimeLabel: ctx.regime?.label };

  if (ctx.mode !== "macro-interpretation") {
    out = applyGraphToResponse(out, ctx.graph);
  }

  out = applyMarketIntelligenceToResponse(out, ctx);
  out = applyIntelligenceStreamToResponse(out, ctx);

  out = applyRelationshipMemoryToResponse(out, ctx.prompt);

  if (ctx.mode === "causal" && !ctx.causalModel) {
    ctx.causalModel = runCausalReasoningEngine(ctx.prompt);
  }
  if (ctx.mode === "macro-interpretation" && !ctx.macroInterpretationModel) {
    ctx.macroInterpretationModel = runMacroInterpretationEngine(ctx.prompt);
  }

  out = logicQualityValidator(ctx.prompt, out, ctx);
  out = synthesizeIntelligence(out, ctx);
  out = logicFinalPolish(out, ctx);
  hookIntelligenceStream(ctx, out);

  logicDebug("intelligenceLayer enriched", {
    graph: !!ctx.graph?.chain,
    regime: ctx.regime?.primary,
    feed: ctx.intelligenceStream?.feed?.length,
  });

  return out;
}

export { recordRelationshipMemory };
