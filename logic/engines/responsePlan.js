/**
 * Response plan — intent-first routing, enrichment allowlist, response shape contract.
 * @module logic/engines/responsePlan
 */

import { logicDebug } from "../shared.js";
import { isNewsStyleQuery } from "../questionIntent.js";
import { isMacroInterpretationQuery } from "./macroInterpretationEngine.js";
import { isCausalReasoningQuery } from "./causalReasoningEngine.js";
import {
  isStrategistInterpretationQuery,
  isExplicitNewsQuery,
} from "./strategistQueryGate.js";

/**
 * @typedef {'fragility'|'strategist_interpretation'|'positioning_crowding'|'portfolio_risk'|'regime_fit'|'portfolio_stress'|'macro_interpretation'|'causal'|'scenario'|'portfolio'|'risk_regime'|'market_pulse'|'ticker'|'briefing'|'sector'|'daily_brief'} ResponseIntentId
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
  if (isExplicitNewsQuery(prompt)) return false;
  return (
    isStrategistInterpretationQuery(prompt) ||
    isMacroInterpretationQuery(prompt) ||
    (/portfolio|holdings|my book/i.test((prompt || "").toLowerCase()) &&
      /risk|regime|exposed|concentrat|dominate/i.test((prompt || "").toLowerCase()))
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

  if (isStrategistInterpretationQuery(prompt) && !isExplicitNewsQuery(prompt)) {
    const crowding = /consensus|overcrowd|crowded trade/i.test(t);
    plan = {
      ...plan,
      intentId: crowding ? "positioning_crowding" : "strategist_interpretation",
      mode: "macro-interpretation",
      label: crowding ? "Positioning & crowding" : "Macro Strategist Interpretation",
      primaryQuestion: prompt,
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
  } else if (
    /what happens if|what if\b|if .+ tighten|liquidity tighten|financial conditions tighten|tightening liquidity|what happens if liquidity/i.test(
      t
    ) &&
    !newsStyle &&
    !/iran|ukraine|war in|shipping route|freight cost/i.test(t)
  ) {
    plan = {
      ...plan,
      intentId: "portfolio_stress",
      mode: "portfolio",
      label: "Portfolio Stress Path",
      primaryQuestion: "What happens to this portfolio if conditions tighten?",
      abstractEntity: true,
      conceptualOk: true,
      skipFallbackOnAnswer: true,
      allowedCards: ["snapshot", "catalyst", "macroContext", "sectorImpact", "volatility", "aiSummary"],
      allowedOptional: ["portfolioImpact", "riskSignal"],
      enrichment: {
        graph: false,
        marketIntelApply: true,
        streamApply: false,
        relationshipMemory: false,
        synthesis: false,
        feedHook: false,
        marketIntelKeys: ["stress", "positioning"],
      },
    };
  } else if (
    /what risks dominate|risks dominate|dominant risk|what would hurt my portfolio|what risks matter most/i.test(
      t
    ) &&
    !newsStyle
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
    /regime benefit|benefit.*portfolio|what regime benefits|which regime benefits|what regime fits|portfolio.*regime/i.test(
      t
    ) &&
    !newsStyle
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
  } else if ((classified.wantsBriefing || newsStyle) && !isStrategistInterpretationQuery(prompt)) {
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
