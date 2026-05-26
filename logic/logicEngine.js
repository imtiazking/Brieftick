/**
 * Brieftick Logic — structured intelligence pipeline orchestrator.
 *
 * Prompt → entityResolver → intent + modeDetect → [scenario: scenarioEngine → impactAnalysis]
 *       → sourceRouter → multiSourceFetch → dataFusion → Logic module → fallbackIntelligence
 *       → watchlist + portfolioMemory → confidenceEngine → Intelligence Cards UI
 *
 * @module logic/logicEngine
 */

import { resolveEntities, resolvePrimaryEntity } from "./entityResolver.js";
import { detectIntent } from "./intentDetect.js";
import { routeSources } from "./sourceRouter.js";
import { fetchAndFuse } from "./dataFusion.js";
import { buildFallbackResponse } from "./fallbackIntelligence.js";
import { applyMemoryToResponse, buildMemoryContext, recordLogicInteraction } from "./watchlistMemory.js";
import { applyPortfolioMemoryToResponse, buildPortfolioMemory } from "./portfolioMemory.js";
import { applyConfidenceEngine } from "./confidenceEngine.js";
import { composeLogicResponse } from "./engines/responseComposer.js";
import {
  buildIntelligenceContext,
  enrichIntelligenceLayer,
  recordRelationshipMemory,
} from "./intelligenceLayer.js";
import { logicDebug } from "./shared.js";
import { classifyQuestion } from "./questionIntent.js";

import { runMarketPulseLogic } from "./marketPulseLogic.js";
import { runTickerIntelligenceLogic } from "./tickerIntelligenceLogic.js";
import { runPortfolioLogic } from "./portfolioLogic.js";
import { runSectorRotationLogic } from "./sectorRotationLogic.js";
import { runRiskRegimeLogic } from "./riskRegimeLogic.js";
import { runDailyBriefLogic } from "./dailyBriefLogic.js";
import { runScenarioAnalysisLogic } from "./scenarioAnalysisLogic.js";
import { runBriefingLogic } from "./briefingLogic.js";
import { runCausalLogic } from "./causalLogic.js";
import { runMacroInterpretationLogic } from "./macroInterpretationLogic.js";

/**
 * Post-module pipeline: fallback guard → memory → confidence.
 * @param {import('./types.js').LogicResponse} res
 * @param {object} ctx
 */
export function finalizeLogicResponse(res, ctx) {
  let out = { ...res };

  if (/unable to provide|cannot provide analysis|unable to analyze/i.test(out.summary || "")) {
    logicDebug("fallback triggered", "blocked empty copy");
    out = buildFallbackResponse(ctx);
  }

  if (!out?.cards?.snapshot?.trim()) {
    logicDebug("fallback triggered", "missing snapshot card");
    out = buildFallbackResponse(ctx);
  }

  const watchlistMemory = ctx.memory || buildMemoryContext(ctx.primaryEntity, ctx.mode);
  out = applyMemoryToResponse(out, watchlistMemory);

  const portfolioMemory = ctx.portfolioMemory || buildPortfolioMemory();
  out = applyPortfolioMemoryToResponse(out, portfolioMemory, ctx.mode);

  out = applyConfidenceEngine(out, ctx.fusion, ctx.primaryEntity, ctx);

  if (!out.sources?.length) {
    out.sources = ["Brieftick Logic"];
  }

  out = composeLogicResponse(out, ctx);

  return out;
}

/**
 * @param {string} prompt
 * @param {import('./types.js').LogicMode} [modeOverride]
 */
export async function executeLogicPipeline(prompt, modeOverride) {
  logicDebug("prompt received", prompt.slice(0, 160));

  // 1. entityResolver
  const entities = resolveEntities(prompt);
  const primaryEntity = resolvePrimaryEntity(prompt);
  logicDebug("entity resolved", { primary: primaryEntity, entities });

  // 2. intent + modeDetect
  const intentResult = detectIntent(prompt, primaryEntity);
  const classified = classifyQuestion(prompt, primaryEntity);
  const mode = modeOverride || intentResult.mode;
  logicDebug("Logic module selected", {
    mode,
    intent: intentResult.intent,
    questionKind: classified.kind,
  });

  const memory = buildMemoryContext(primaryEntity, mode);
  const portfolioMemory = buildPortfolioMemory();

  // 3. sourceRouter → 4–5. fetch + fusion (context for modules and scenario impact)
  const sourceRoute = routeSources({ prompt, mode, primaryEntity });
  const fusion = await fetchAndFuse(sourceRoute, {
    prompt,
    mode,
    primaryEntity,
    entities,
  });

  let ctx = {
    prompt,
    primaryEntity,
    entities,
    mode,
    intent: intentResult.intent,
    intentLabel: intentResult.label,
    questionKind: classified.kind,
    sourceRoute,
    fusion,
    memory,
    portfolioMemory,
  };

  ctx = buildIntelligenceContext(ctx);

  // 6. Logic module (scenario uses scenarioEngine → impactAnalysis before finalize)
  let response;
  try {
    response = await runLogicModule(ctx);
    if (!response?.title) {
      logicDebug("fallback triggered", "no title");
      response = buildFallbackResponse(ctx);
    }
  } catch (e) {
    logicDebug("fallback triggered", e.message || e);
    response = buildFallbackResponse(ctx);
  }

  response = enrichIntelligenceLayer(
    { ...response, mode: response.mode || mode, intent: intentResult.intent },
    ctx
  );

  // 7–9. fallback guard + watchlist/portfolio memory + confidenceEngine
  response = finalizeLogicResponse(response, ctx);

  recordLogicInteraction(prompt, mode, primaryEntity);
  recordRelationshipMemory(prompt, classified.kind);
  logicDebug("render completed", {
    mode,
    intent: intentResult.intent,
    confidence: response.confidenceLabel,
  });

  return response;
}

/** @param {object} ctx */
async function runLogicModule(ctx) {
  switch (ctx.mode) {
    case "ticker":
      return runTickerIntelligenceLogic(ctx);
    case "portfolio":
      return runPortfolioLogic(ctx);
    case "sector-rotation":
      return runSectorRotationLogic(ctx);
    case "risk-regime":
      return runRiskRegimeLogic(ctx);
    case "daily-brief":
      return runDailyBriefLogic(ctx);
    case "scenario":
      return runScenarioAnalysisLogic(ctx);
    case "briefing":
      return runBriefingLogic(ctx);
    case "causal":
      return runCausalLogic(ctx);
    case "macro-interpretation":
      return runMacroInterpretationLogic(ctx);
    case "market-pulse":
    default:
      return runMarketPulseLogic(ctx);
  }
}
