/**
 * Preflight UC-RI-005 structured JSON output size before paid provider calls.
 */

const CHARS_PER_OUTPUT_TOKEN = 4;

export function estimateStructuredOutputTokens({ provisionCount = 0, sectionCount = 0, candidateFloor = 0 } = {}) {
  const provisions = Math.max(0, Number(provisionCount) || 0);
  const sections = Math.max(0, Number(sectionCount) || 0);
  const floor = Math.max(0, Number(candidateFloor) || 0);
  const estimatedClaims = Math.max(provisions, floor);
  // Lab UC-RI-005 runs observe higher per-claim verbosity than the offline floor; bias upward for fail-closed preflight.
  return Math.ceil(220 + sections * 42 + estimatedClaims * 108);
}

/**
 * @param {{ estimateTokens: number, maxOutputTokens: number, safetyRatio?: number }} params
 */
export function assertExtractionOutputBudget({ estimateTokens, maxOutputTokens, safetyRatio = 0.82 }) {
  const cap = Number(maxOutputTokens) || 0;
  const est = Number(estimateTokens) || 0;
  if (!cap) return { ok: false, code: 'output_token_cap_missing', estimateTokens: est, maxOutputTokens: cap };
  if (est > cap * safetyRatio) {
    return {
      ok: false,
      code: 'extraction_output_preflight_exceeded',
      estimateTokens: est,
      maxOutputTokens: cap,
      safetyRatio,
      suggestedMaxSectionsReduction: true,
    };
  }
  return { ok: true, estimateTokens: est, maxOutputTokens: cap };
}

export function scaleMaxOutputTokensForBatch(baseMaxOutput, { provisionCount = 0, sectionCount = 0 } = {}) {
  const base = Math.max(1024, Number(baseMaxOutput) || 8192);
  const scaled = Math.ceil(420 + Math.max(provisionCount, 0) * 96 + Math.max(sectionCount, 0) * 24);
  return Math.min(base, Math.max(2048, scaled));
}

export function charsBudgetFromOutputTokens(tokens) {
  return Math.floor(Math.max(0, tokens) * CHARS_PER_OUTPUT_TOKEN);
}

/** Largest provision count that passes assertExtractionOutputBudget for a batch shape. */
export function maxProvisionsWithinOutputPreflight({
  sectionCount = 0,
  maxOutputTokens = 8192,
  safetyRatio = 0.82,
} = {}) {
  let hi = 512;
  let best = 0;
  for (let n = 1; n <= hi; n += 1) {
    const est = estimateStructuredOutputTokens({ provisionCount: n, sectionCount });
    if (assertExtractionOutputBudget({ estimateTokens: est, maxOutputTokens, safetyRatio }).ok) best = n;
    else break;
  }
  return best;
}