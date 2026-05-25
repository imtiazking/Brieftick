/**
 * Logic intelligence engine — orchestrates entity, sources, fusion, confidence, memory.
 * @module logic/logicEngine
 */

import { resolveEntities, resolvePrimaryEntity } from "./entityResolver.js";
import { detectLogicMode } from "./modeDetect.js";
import { routeSources } from "./sourceRouter.js";
import { fetchFusedData } from "./dataFusion.js";
import { applyConfidenceToResponse } from "./confidence.js";
import { buildFallbackResponse } from "./fallbackIntelligence.js";
import { applyMemoryToResponse, buildMemoryContext, recordLogicInteraction } from "./watchlistMemory.js";
import { logicDebug } from "./shared.js";
import { LIMITED_DATA_MSG } from "./types.js";

import { runMarketPulseLogic } from "./marketPulseLogic.js";
import { runTickerIntelligenceLogic } from "./tickerIntelligenceLogic.js";
import { runPortfolioLogic } from "./portfolioLogic.js";
import { runSectorRotationLogic } from "./sectorRotationLogic.js";
import { runRiskRegimeLogic } from "./riskRegimeLogic.js";
import { runDailyBriefLogic } from "./dailyBriefLogic.js";
import { runScenarioAnalysisLogic } from "./scenarioAnalysisLogic.js";

/**
 * @param {import('./types.js').LogicResponse} res
 * @param {object} ctx
 */
export function finalizeLogicResponse(res, ctx) {
  let out = { ...res };

  if (/unable to provide|cannot provide analysis/i.test(out.summary || "")) {
    out.summary = `${LIMITED_DATA_MSG} ${buildFallbackResponse(ctx).summary}`;
    out.dataLimited = true;
  }

  const memory = ctx.memory || buildMemoryContext(ctx.primaryEntity, ctx.mode);
  out = applyMemoryToResponse(out, memory);

  out = applyConfidenceToResponse(out, {
    entityConfidence: ctx.primaryEntity?.confidence,
    sourceAgreement: ctx.fusion?.sourceAgreement,
    liveSourceCount: ctx.fusion?.liveSourceCount,
    hasQuote: ctx.fusion?.hasQuote,
    hasNews: ctx.fusion?.hasNews,
  });

  if (!out.sources?.length) {
    out.sources = ["Brieftick Logic"];
  }

  logicDebug("confidence level", {
    label: out.confidenceLabel,
    score: out.confidence,
    level: out.confidenceLevel,
  });

  return out;
}

/**
 * @param {string} prompt
 * @param {import('./types.js').LogicMode} [modeOverride]
 */
export async function executeLogicPipeline(prompt, modeOverride) {
  logicDebug("prompt received", prompt.slice(0, 160));

  const entities = resolveEntities(prompt);
  const primaryEntity = resolvePrimaryEntity(prompt);
  const mode = modeOverride || detectLogicMode(prompt, primaryEntity);

  logicDebug("entity resolved", { primary: primaryEntity, count: entities.length });
  logicDebug("Logic module selected", mode);

  const sourceRoute = routeSources({ prompt, mode, primaryEntity });
  const fusion = await fetchFusedData(sourceRoute, {
    prompt,
    mode,
    primaryEntity,
    entities,
  });

  const memory = buildMemoryContext(primaryEntity, mode);
  const ctx = { prompt, primaryEntity, entities, mode, sourceRoute, fusion, memory };

  let response;
  try {
    response = await runLogicModule(ctx);
    if (!response?.title || !response?.cards?.snapshot) {
      logicDebug("fallback triggered", "empty module response");
      response = buildFallbackResponse(ctx);
    }
  } catch (e) {
    logicDebug("fallback triggered", e.message || e);
    response = buildFallbackResponse(ctx);
  }

  response = finalizeLogicResponse(
    { ...response, mode: response.mode || mode },
    ctx
  );

  recordLogicInteraction(prompt, mode, primaryEntity);
  logicDebug("render completed", {
    mode,
    title: response.title,
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
    case "market-pulse":
    default:
      return runMarketPulseLogic(ctx);
  }
}
