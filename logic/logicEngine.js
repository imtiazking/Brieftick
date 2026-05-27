/**
 * Brieftick Logic — structured intelligence pipeline orchestrator.
 *
 * Prompt → entityResolver → userContext → route → intent + mode → fetch → Logic module
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
import { inferWatchlistExposure } from "./watchlistStore.js";
import { buildResponsePlan, entityForPlan } from "./engines/responsePlan.js";
import { applyResponseContract } from "./engines/applyResponseContract.js";
import { resolveUserContext } from "./engines/userContext.js";
import { applyLogicRoute, planLogicRoute } from "./engines/planLogicRoute.js";
import { buildPortfolioMemoryFromContext } from "./portfolioMemory.js";

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
import { runWatchlistPerformanceLogic } from "./watchlistPerformanceLogic.js";

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

  const plan = ctx.responsePlan;
  const hasAnswer =
    (out.directAnswer && out.directAnswer.length > 48) ||
    (out.summary && out.summary.length > 48);

  if (!out?.cards?.snapshot?.trim()) {
    if (plan?.skipFallbackOnAnswer && hasAnswer) {
      out.cards = { ...(out.cards || {}), snapshot: out.directAnswer || out.summary };
    } else if (!plan?.conceptualOk) {
      logicDebug("fallback triggered", "missing snapshot card");
      out = buildFallbackResponse(ctx);
    } else if (hasAnswer) {
      out.cards = { ...(out.cards || {}), snapshot: out.directAnswer || out.summary };
    } else {
      logicDebug("fallback triggered", "missing snapshot card");
      out = buildFallbackResponse(ctx);
    }
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

  if (plan) {
    out = applyResponseContract(out, plan);
  }

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

  // 2. user context → context-first route → intent + response plan
  const userContext = resolveUserContext();
  const classified = classifyQuestion(prompt, primaryEntity, { userContext });
  const logicRoute = planLogicRoute(prompt, userContext, classified);
  const routedClassification = applyLogicRoute(classified, logicRoute);
  const responsePlan = buildResponsePlan(prompt, routedClassification, primaryEntity, {
    userContext,
    logicRoute,
  });
  const routedEntity = entityForPlan(primaryEntity, responsePlan);
  const mode = modeOverride || responsePlan.mode || routedClassification.mode;
  const intentResult = detectIntent(prompt, routedEntity);
  logicDebug("Logic module selected", {
    mode,
    intent: intentResult.intent,
    questionKind: classified.kind,
    responseIntent: responsePlan.intentId,
  });

  // 3. sourceRouter → 4–5. fetch + fusion (context for modules and scenario impact)
  const sourceRoute = routeSources({ prompt, mode, primaryEntity: routedEntity });
  const fusion = await fetchAndFuse(sourceRoute, {
    prompt,
    mode,
    primaryEntity: routedEntity,
    entities,
  });

  const portfolioMemory = buildPortfolioMemoryFromContext(userContext.portfolioContext);

  let ctx = {
    prompt,
    primaryEntity: routedEntity,
    entities,
    mode,
    intent: intentResult.intent,
    intentLabel: responsePlan.label || intentResult.label,
    questionKind: routedClassification.kind,
    responsePlan,
    userContext,
    logicRoute,
    skipTape: responsePlan.abstractEntity,
    sourceRoute,
    fusion,
    memory: buildMemoryContext(routedEntity, mode),
    portfolioMemory,
    portfolioProfile: portfolioMemory.profile,
    portfolioContext: userContext.portfolioContext,
    watchlistExposure: inferWatchlistExposure(),
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
  recordRelationshipMemory(prompt, routedClassification.kind);
  logicDebug("render completed", {
    mode,
    intent: intentResult.intent,
    confidence: response.confidenceLabel,
  });

  return response;
}

/**
 * Proactive live intelligence session — no user prompt required.
 * Powers Logic hub stream and future push alerts.
 * @param {{ prompt?: string }} [options]
 */
export async function executeLiveIntelligenceSession(options = {}) {
  const prompt = options.prompt || "";
  const primaryEntity = resolvePrimaryEntity(prompt || "market pulse");
  const classified = classifyQuestion(prompt || "what matters most to markets right now", primaryEntity);
  const sourceRoute = routeSources({
    prompt: prompt || "market pulse",
    mode: "market-pulse",
    primaryEntity,
  });
  const fusion = await fetchAndFuse(sourceRoute, {
    prompt,
    mode: "market-pulse",
    primaryEntity,
    entities: resolveEntities(prompt),
  });

  const portfolioMemory = buildPortfolioMemory();
  const ctx = buildIntelligenceContext({
    prompt,
    mode: "market-pulse",
    questionKind: classified.kind,
    primaryEntity,
    fusion,
    memory: buildMemoryContext(primaryEntity, "market-pulse"),
    portfolioMemory,
    portfolioProfile: portfolioMemory.profile,
    watchlistExposure: inferWatchlistExposure(),
  });

  logicDebug("liveIntelligenceSession", {
    feed: ctx.intelligenceStream?.feed?.length,
    lead: ctx.intelligenceStream?.leadNote?.slice(0, 80),
  });

  return {
    feed: ctx.intelligenceStream?.feed || [],
    chips: ctx.intelligenceStream?.chips || [],
    leadNote: ctx.intelligenceStream?.leadNote || "",
    priority: ctx.marketPriority,
    liveNarrative: ctx.liveNarrative,
    portfolio: ctx.portfolioIntelligence,
    watchlist: ctx.watchlistExposure,
    portfolioProfile: portfolioMemory.profile,
    regime: ctx.regime,
    disclaimer: "Market intelligence, not financial advice.",
  };
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
    case "watchlist":
      return runWatchlistPerformanceLogic(ctx);
    case "market-pulse":
    default:
      return runMarketPulseLogic(ctx);
  }
}
