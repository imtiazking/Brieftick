/**
 * Confidence engine — source agreement, staleness, API availability, entity certainty.
 * @module logic/confidenceEngine
 */

import { logicDebug } from "./shared.js";

/** @typedef {'high'|'moderate'|'limited'|'partial'} ConfidenceLevel */

export const CONFIDENCE_LABELS = {
  high: "High confidence",
  moderate: "Moderate confidence",
  limited: "Limited live confirmation",
  partial: "Partial market data",
};

/**
 * @param {Object} input
 * @param {number} [input.entityConfidence]
 * @param {number} [input.sourceAgreement]
 * @param {number} [input.liveSourceCount]
 * @param {number} [input.failedSourceCount]
 * @param {boolean} [input.usedAI]
 * @param {boolean} [input.dataLimited]
 * @param {boolean} [input.hasQuote]
 * @param {boolean} [input.hasNews]
 * @param {boolean} [input.hasStaleQuote]
 * @param {boolean} [input.apiAvailable]
 */
export function scoreConfidence(input) {
  const entity = input.entityConfidence ?? 50;
  const agreement = input.sourceAgreement ?? 0;
  const live = input.liveSourceCount ?? 0;
  const failed = input.failedSourceCount ?? 0;
  const stalePenalty = input.hasStaleQuote ? -10 : 0;
  const apiPenalty = input.apiAvailable === false ? -15 : 0;

  let score =
    entity * 0.32 +
    agreement * 100 * 0.28 +
    live * 9 +
    (input.usedAI ? 8 : 0) +
    (input.hasQuote ? 12 : 0) +
    (input.hasNews ? 8 : 0) +
    (input.dataLimited ? -18 : 0) -
    Math.min(failed * 5, 22) +
    stalePenalty +
    apiPenalty;

  score = Math.max(10, Math.min(96, Math.round(score)));

  /** @type {ConfidenceLevel} */
  let level = "partial";
  if (score >= 78 && !input.dataLimited && agreement >= 0.6 && !input.hasStaleQuote) {
    level = "high";
  } else if (score >= 62 && (live >= 1 || input.usedAI)) {
    level = "moderate";
  } else if (score >= 42 || input.hasQuote || input.hasNews) {
    level = "limited";
  }

  return { level, label: CONFIDENCE_LABELS[level], score };
}

/**
 * @param {import('./types.js').LogicResponse} res
 * @param {import('./dataFusion.js').FusionBundle} [fusion]
 * @param {import('./entityResolver.js').ResolvedEntity} [entity]
 */
export function applyConfidenceEngine(res, fusion, entity) {
  const api = typeof window !== "undefined" ? window.BriefTickAPI : null;
  const apiAvailable = !!(api?.keys?.finnhub || api?.keys?.twelvedata || api?.keys?.polygon);

  const conf = scoreConfidence({
    entityConfidence: entity?.confidence,
    sourceAgreement: fusion?.sourceAgreement,
    liveSourceCount: fusion?.liveSourceCount,
    failedSourceCount: (res.failedSources || fusion?.failedSources || []).length,
    usedAI: res.usedAI,
    dataLimited: res.dataLimited,
    hasQuote: fusion?.hasQuote,
    hasNews: fusion?.hasNews,
    hasStaleQuote: fusion?.hasStaleQuote,
    apiAvailable,
  });

  logicDebug("confidenceEngine", conf);

  return {
    ...res,
    confidence: conf.score,
    confidenceLevel: conf.level,
    confidenceLabel: conf.label,
  };
}
