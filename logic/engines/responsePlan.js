/**
 * Response plan — intent-first routing, enrichment allowlist, response shape contract.
 * @module logic/engines/responsePlan
 */

import { logicDebug } from "../shared.js";
import { isNewsStyleQuery } from "../questionIntent.js";
import { isMacroInterpretationQuery } from "./macroInterpretationEngine.js";
import { isCausalReasoningQuery } from "./causalReasoningEngine.js";

/**
 * @typedef {'fragility'|'portfolio_risk'|'regime_fit'|'macro_interpretation'|'causal'|'scenario'|'portfolio'|'risk_regime'|'market_pulse'|'ticker'|'briefing'|'sector'|'daily_brief'} ResponseIntentId
 */

/**
 * @typedef {Object} ResponsePlan
 * @property {ResponseIntentId} intentId
 * @property {import('../types.js').LogicMode} mode
 * @property {string} label
 * @property {string} primaryQuestion
 * @property {boolean} abstractEntity
 * @property {boolean} conceptualOk
 * @property {boolean} skipFallbackOnAnswer
 * @property {string[]} allowedCards
 * @property {string[]} allowedOptional
 * @property {Object} enrichment
 * @property {RegExp[]} suppressPatterns
 */

const ALL_CARDS = ["snapshot", "catalyst", "macroContext", "sectorImpact", "volatility", "aiSummary"];

const SUPPRESS_DEFAULT = [
  /stress signals are balanced/i,
  /no major divergence/i,
  /not showing a major divergence/i,
  /indices tracked/i,
  /indices contextual/i,
  /contextual snapshot/i,
  /volatility monitored/i,
  /monitor macro/i,
  /macro monitored/i,
  /mixed regime.*no single/i,
  /policy and inflation path dominate/i,
  /mega-cap tech vs cyclicals/i,
];

/**
 * @param {string} prompt
 */
export function isAbstractStrategistQuery(prompt) {
  const t = (prompt || "").toLowerCase();
  if (isNewsStyleQuery(prompt)) return false;
  return (
    /what breaks first|breaks first|hidden fragil|underpric|what matters most|what risks dominate|regime benefit|benefit.*portfolio|what regime|fragilit|complacent|cross.?asset diverg|breadth deterior|volatility compression|concentration risk|what would hurt|why can equities|why have equities/i.test(
      t
    ) ||
    isMacroInterpretationQuery(prompt) ||
    (/portfolio|holdings|my book/i.test(t) &&
      /risk|regime|exposed|concentrat|dominate/i.test(t))
  );
}

/**
 * @param {string} prompt
 * @param {import('../questionIntent.js').QuestionClassification} classified
 * @param {import('../entityResolver.js').ResolvedEntity} [entity]
 * @returns {ResponsePlan}
 */
export function buildResponsePlan(prompt, classified, entity) {
  const t = (prompt || "").toLowerCase().trim();
  const newsStyle = isNewsStyleQuery(prompt);
  const abstract = isAbstractStrategistQuery(prompt);

  /** @type {ResponsePlan} */
  let plan = {
    intentId: "market_pulse",
    mode: classified.mode,
    label: classified.label,
    primaryQuestion: prompt,
    abstractEntity: abstract,
    conceptualOk: false,
    skipFallbackOnAnswer: false,
    allowedCards: [...ALL_CARDS],
    allowedOptional: ["portfolioImpact", "riskSignal", "marketStructure", "crossAssetSignal", "stressSignal"],
    enrichment: {
      graph: true,
      marketIntelApply: true,
      streamApply: true,
      relationshipMemory: true,
      synthesis: true,
      feedHook: true,
    },
    suppressPatterns: [...SUPPRESS_DEFAULT],
  };

  if (
    /what risks dominate|risks dominate.*portfolio|dominant risk.*portfolio|what would hurt my portfolio/i.test(
      t
    ) &&
    /portfolio|holdings|book/i.test(t)
  ) {
    plan = {
      ...plan,
      intentId: "portfolio_risk",
      mode: "portfolio",
      label: "Portfolio Risk",
      primaryQuestion: "What risks dominate this portfolio?",
      abstractEntity: true,
      conceptualOk: true,
      skipFallbackOnAnswer: true,
      allowedCards: ["snapshot", "sectorImpact", "volatility", "macroContext", "aiSummary"],
      allowedOptional: ["portfolioImpact", "riskSignal"],
      enrichment: {
        graph: false,
        marketIntelApply: true,
        streamApply: true,
        relationshipMemory: false,
        synthesis: false,
        feedHook: false,
        marketIntelKeys: ["positioning", "stress"],
      },
    };
  } else if (
    /regime benefit|benefit.*portfolio|what regime|which regime.*portfolio|portfolio.*regime/i.test(t) &&
    /portfolio|holdings|book/i.test(t)
  ) {
    plan = {
      ...plan,
      intentId: "regime_fit",
      mode: "portfolio",
      label: "Portfolio Regime Fit",
      primaryQuestion: "What market regime benefits or hurts this portfolio?",
      abstractEntity: true,
      conceptualOk: true,
      skipFallbackOnAnswer: true,
      allowedCards: ["snapshot", "macroContext", "sectorImpact", "volatility", "aiSummary"],
      allowedOptional: ["portfolioImpact"],
      enrichment: {
        graph: false,
        marketIntelApply: true,
        streamApply: true,
        relationshipMemory: false,
        synthesis: false,
        feedHook: false,
        marketIntelKeys: ["crossAsset", "positioning"],
      },
    };
  } else if (
    /portfolio|holdings|analyze my portfolio|my book/i.test(t) &&
    !newsStyle &&
    classified.mode === "portfolio"
  ) {
    plan = {
      ...plan,
      intentId: "portfolio",
      mode: "portfolio",
      label: "Portfolio Logic",
      abstractEntity: true,
      conceptualOk: true,
      skipFallbackOnAnswer: true,
      allowedCards: ["snapshot", "sectorImpact", "volatility", "macroContext", "catalyst", "aiSummary"],
      allowedOptional: ["portfolioImpact", "riskSignal"],
      enrichment: {
        graph: false,
        marketIntelApply: true,
        streamApply: true,
        relationshipMemory: false,
        synthesis: false,
        feedHook: false,
        marketIntelKeys: ["positioning", "stress"],
      },
    };
  } else if (
    /what breaks first|breaks first|first to break|what would break first/i.test(t) &&
    !newsStyle
  ) {
    plan = {
      ...plan,
      intentId: "fragility",
      mode: isCausalReasoningQuery(prompt) ? "causal" : "macro-interpretation",
      label: "Fragility & causality",
      primaryQuestion: "What breaks first if conditions shift?",
      abstractEntity: true,
      conceptualOk: true,
      skipFallbackOnAnswer: true,
      allowedCards: ["snapshot", "catalyst", "macroContext", "sectorImpact", "volatility", "aiSummary"],
      allowedOptional: [],
      enrichment: {
        graph: true,
        marketIntelApply: false,
        streamApply: false,
        relationshipMemory: false,
        synthesis: false,
        feedHook: false,
      },
    };
  } else if (/hidden fragil|underpric|what.*markets.*missing|complacent/i.test(t) && !newsStyle) {
    plan = {
      ...plan,
      intentId: "fragility",
      mode: "macro-interpretation",
      label: "Hidden fragilities",
      primaryQuestion: "What fragilities are markets underpricing?",
      abstractEntity: true,
      conceptualOk: true,
      skipFallbackOnAnswer: true,
      allowedCards: ["snapshot", "catalyst", "macroContext", "sectorImpact", "volatility", "aiSummary"],
      allowedOptional: [],
      enrichment: {
        graph: false,
        marketIntelApply: false,
        streamApply: false,
        relationshipMemory: false,
        synthesis: false,
        feedHook: false,
      },
    };
  } else if (isMacroInterpretationQuery(prompt)) {
    plan = {
      ...plan,
      intentId: "macro_interpretation",
      mode: "macro-interpretation",
      label: classified.label,
      abstractEntity: true,
      conceptualOk: true,
      skipFallbackOnAnswer: true,
      allowedCards: [...ALL_CARDS],
      allowedOptional: [],
      enrichment: {
        graph: false,
        marketIntelApply: false,
        streamApply: false,
        relationshipMemory: false,
        synthesis: false,
        feedHook: false,
      },
    };
  } else if (isCausalReasoningQuery(prompt)) {
    plan = {
      ...plan,
      intentId: "causal",
      mode: "causal",
      label: "Causal Market Logic",
      abstractEntity: !entity?.symbol || abstract,
      conceptualOk: true,
      skipFallbackOnAnswer: true,
      allowedCards: [...ALL_CARDS],
      allowedOptional: ["portfolioImpact"],
      enrichment: {
        graph: true,
        marketIntelApply: false,
        streamApply: false,
        relationshipMemory: false,
        synthesis: false,
        feedHook: false,
      },
    };
  } else if (classified.wantsBriefing || newsStyle) {
    plan = {
      ...plan,
      intentId: "briefing",
      mode: classified.mode === "ticker" ? "ticker" : "briefing",
      label: classified.label,
      abstractEntity: false,
      allowedOptional: [
        "relatedMovers",
        "narrativeLink",
        "portfolioImpact",
        "marketStructure",
        "crossAssetSignal",
      ],
      enrichment: {
        graph: false,
        marketIntelApply: true,
        streamApply: true,
        relationshipMemory: true,
        synthesis: true,
        feedHook: true,
      },
    };
  } else if (classified.mode === "risk-regime") {
    plan.intentId = "risk_regime";
    plan.enrichment = { ...plan.enrichment, synthesis: false, streamApply: false };
  } else if (classified.mode === "market-pulse") {
    plan.intentId = "market_pulse";
    plan.enrichment.marketIntelKeys = ["structure", "crossAsset", "stress"];
  } else if (classified.mode === "ticker" && !abstract) {
    plan.intentId = "ticker";
    plan.abstractEntity = false;
    plan.enrichment.streamApply = false;
  }

  logicDebug("responsePlan", {
    intentId: plan.intentId,
    mode: plan.mode,
    abstract: plan.abstractEntity,
  });

  return plan;
}

/**
 * @param {import('../entityResolver.js').ResolvedEntity} entity
 * @param {ResponsePlan} plan
 */
export function entityForPlan(entity, plan) {
  if (!plan.abstractEntity) return entity;
  return {
    entityType: "market",
    symbol: null,
    companyName: null,
    confidence: entity?.confidence ?? 40,
  };
}
