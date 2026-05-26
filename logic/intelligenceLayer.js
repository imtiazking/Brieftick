/**
 * Intelligence layer — interconnects graph, regime, narrative, positioning, memory, quality.
 * @module logic/intelligenceLayer
 */

import { resolveMarketGraph, applyGraphToResponse } from "./engines/marketGraph.js";
import { detectMarketRegime } from "./engines/regimeEngine.js";
import { updateNarrativeState, applyNarrativeToResponse } from "./engines/narrativeEngine.js";
import { analyzePositioning, applyPositioningToResponse } from "./engines/positioningEngine.js";
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
import { logicDebug } from "./shared.js";

/**
 * Build shared intelligence context after data fusion.
 * @param {object} ctx
 */
export function buildIntelligenceContext(ctx) {
  const regime = detectMarketRegime(ctx);
  const graph = resolveMarketGraph(ctx.prompt, ctx.questionKind);
  const narrative = updateNarrativeState(ctx.prompt, ctx.questionKind);
  const positioning = analyzePositioning(ctx.prompt, regime);

  return {
    ...ctx,
    regime,
    graph,
    narrative,
    positioning,
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
  out = applyNarrativeToResponse(out, ctx.narrative);
  out = applyPositioningToResponse(out, ctx.positioning);
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
  });

  return out;
}

export { recordRelationshipMemory };
