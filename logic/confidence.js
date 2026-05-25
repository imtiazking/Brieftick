/**
 * Structured confidence scoring for Brieftick Logic.
 * @module logic/confidence
 */

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
 * @param {number} [input.sourceAgreement] 0–1
 * @param {number} [input.liveSourceCount]
 * @param {number} [input.failedSourceCount]
 * @param {boolean} [input.usedAI]
 * @param {boolean} [input.dataLimited]
 * @param {boolean} [input.hasQuote]
 * @param {boolean} [input.hasNews]
 */
export function computeConfidence(input) {
  const entity = input.entityConfidence ?? 50;
  const agreement = input.sourceAgreement ?? 0;
  const live = input.liveSourceCount ?? 0;
  const failed = input.failedSourceCount ?? 0;
  const ai = input.usedAI ? 8 : 0;
  const quote = input.hasQuote ? 12 : 0;
  const news = input.hasNews ? 8 : 0;
  const limitedPenalty = input.dataLimited ? -18 : 0;
  const failPenalty = Math.min(failed * 6, 24);

  let score =
    entity * 0.35 +
    agreement * 100 * 0.25 +
    live * 10 +
    ai +
    quote +
    news +
    limitedPenalty -
    failPenalty;

  score = Math.max(12, Math.min(96, Math.round(score)));

  /** @type {ConfidenceLevel} */
  let level = "partial";
  if (score >= 78 && !input.dataLimited && agreement >= 0.6) level = "high";
  else if (score >= 62 && (live >= 1 || input.usedAI)) level = "moderate";
  else if (score >= 45 || input.hasQuote || input.hasNews) level = "limited";

  return {
    level,
    label: CONFIDENCE_LABELS[level],
    score,
  };
}

/**
 * @param {import('./types.js').LogicResponse} res
 * @param {Object} fusionMeta
 */
export function applyConfidenceToResponse(res, fusionMeta = {}) {
  const conf = computeConfidence({
    entityConfidence: fusionMeta.entityConfidence,
    sourceAgreement: fusionMeta.sourceAgreement,
    liveSourceCount: fusionMeta.liveSourceCount,
    failedSourceCount: (res.failedSources || []).length,
    usedAI: res.usedAI,
    dataLimited: res.dataLimited,
    hasQuote: fusionMeta.hasQuote,
    hasNews: fusionMeta.hasNews,
  });
  return {
    ...res,
    confidence: conf.score,
    confidenceLevel: conf.level,
    confidenceLabel: conf.label,
  };
}
