/**
 * Preflight UC-RI-005 structured JSON output size before paid provider calls.
 */

const CHARS_PER_OUTPUT_TOKEN = 4;

/** Empirical cap from live PS22 pilot — 22-provision batch truncated at 8192 output (run 9fd62178). */
/** @param {number} [override] deterministic plan replay (e.g. legacy 17-batch vs capped 18-batch). */
export function resolveMaxProvisionsPerBatch(override) {
  if (Number.isFinite(override) && override > 0) return Math.floor(override);
  const n = Number(process.env.RI_LAB_MAX_PROVISIONS_PER_BATCH);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 16;
}

export function estimateStructuredOutputTokens({ provisionCount = 0, sectionCount = 0, candidateFloor = 0 } = {}) {
  const provisions = Math.max(0, Number(provisionCount) || 0);
  const sections = Math.max(0, Number(sectionCount) || 0);
  const floor = Math.max(0, Number(candidateFloor) || 0);
  const estimatedClaims = Math.max(provisions, floor);
  const perClaim = provisions >= 14 ? 152 : 108;
  return Math.ceil(220 + sections * 42 + estimatedClaims * perClaim);
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
  const est = estimateStructuredOutputTokens({ provisionCount, sectionCount });
  const headroom = provisionCount >= 4 ? 4.5 : 2.25;
  const floor = provisionCount >= 4 ? 4096 : 2048;
  const scaled = Math.ceil(Math.max(est * headroom, 420 + provisionCount * 96 + sectionCount * 24));
  return Math.min(base, Math.max(floor, scaled));
}

export function charsBudgetFromOutputTokens(tokens) {
  return Math.floor(Math.max(0, tokens) * CHARS_PER_OUTPUT_TOKEN);
}

/** Largest provision count that passes assertExtractionOutputBudget for a batch shape. */
export function maxProvisionsWithinOutputPreflight({
  sectionCount = 0,
  maxOutputTokens = 8192,
  safetyRatio = 0.82,
  maxProvisionsPerBatch,
} = {}) {
  const hardCap = resolveMaxProvisionsPerBatch(maxProvisionsPerBatch);
  let hi = 512;
  let best = 0;
  for (let n = 1; n <= hi; n += 1) {
    const est = estimateStructuredOutputTokens({ provisionCount: n, sectionCount });
    if (assertExtractionOutputBudget({ estimateTokens: est, maxOutputTokens, safetyRatio }).ok) best = n;
    else break;
  }
  return Math.min(hardCap, best);
}

/** Fail-closed gate for a committed batch shape (used in acceptance + live preflight). */
export function assertBatchProvisionOutputBudget(provisionCount, sectionCount = 4, maxOutputTokens = 8192) {
  const cap = resolveMaxProvisionsPerBatch();
  const n = Number(provisionCount) || 0;
  if (n > cap) {
    return {
      ok: false,
      code: 'extraction_batch_provision_cap_exceeded',
      provisionCount: n,
      provisionCap: cap,
      maxOutputTokens,
    };
  }
  const est = estimateStructuredOutputTokens({ provisionCount: n, sectionCount });
  return assertExtractionOutputBudget({ estimateTokens: est, maxOutputTokens, safetyRatio: 0.82 });
}