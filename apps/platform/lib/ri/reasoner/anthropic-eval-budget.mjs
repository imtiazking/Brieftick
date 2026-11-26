/**
 * Hard spending ceiling for Phase 2C.2 evaluation (USD).
 */

export const V2_EVAL_BUDGET_USD = 10;

/**
 * Published Anthropic list prices ($ per million tokens). Source:
 * https://platform.claude.com/docs/en/about-claude/pricing (checked 2026-11-26).
 * Each ledger row stores the model id and ANTHROPIC_PRICING_VERSION it was priced under,
 * so a later price change never reprices earlier usage.
 */
import { resolveV2EvalModelId } from './v2-eval-models.mjs';

export const ANTHROPIC_PRICING_VERSION = 'anthropic-list-2026-11-26';

function rates(input, output, cacheWrite5m, cacheWrite1h, cacheRead) {
  return {
    inputPerMtok: input,
    outputPerMtok: output,
    cacheWrite5mPerMtok: cacheWrite5m,
    cacheWrite1hPerMtok: cacheWrite1h,
    cacheReadPerMtok: cacheRead,
  };
}

export const MODEL_PRICING_ESTIMATE = {
  /** Haiku 5.5 is priced from $0.10 / $0.50 and has higher tiers above 100k tokens; not used for the pilot. */
  'claude-haiku-5-5': rates(0.1, 0.5, 0.125, 0.2, 0.01),
  'claude-sonnet-5-5': rates(2.0, 10.0, 2.5, 4.0, 0.1),
  'claude-haiku-4-5': rates(1.0, 5.0, 1.25, 2.0, 0.1),
  'claude-sonnet-4-5': rates(3.0, 15.0, 3.75, 6.0, 0.3),
  'claude-sonnet-4-5-20250929': rates(3.0, 15.0, 3.75, 6.0, 0.3),
};

export function hasPublishedPricing(model) {
  return Object.prototype.hasOwnProperty.call(MODEL_PRICING_ESTIMATE, model);
}

/** Highest input-side rate. A reservation uses it so unexpected cache writes cannot exceed the hold. */
export function maxInputSideRatePerMtok(model) {
  const r = MODEL_PRICING_ESTIMATE[model];
  if (!r) return null;
  return Math.max(r.inputPerMtok, r.cacheWrite5mPerMtok, r.cacheWrite1hPerMtok);
}

const toCount = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Math.floor(Number(n)) : 0);

/**
 * Normalise provider usage into the four billed categories.
 * Anthropic reports input_tokens as uncached input only; cache writes and reads are separate fields.
 * When a cache write is reported without its tier it is priced at the 1h rate (the higher one).
 */
export function normaliseAnthropicUsage(usage) {
  const u = usage && typeof usage === 'object' ? usage : {};
  const breakdown = u.cache_creation && typeof u.cache_creation === 'object' ? u.cache_creation : null;
  const write5m = toCount(breakdown?.ephemeral_5m_input_tokens);
  const write1h = toCount(breakdown?.ephemeral_1h_input_tokens);
  const writeTotal = toCount(u.cache_creation_input_tokens);
  const unclassified = Math.max(0, writeTotal - write5m - write1h);
  return {
    standardInputTokens: toCount(u.input_tokens),
    outputTokens: toCount(u.output_tokens),
    cacheWrite5mTokens: write5m,
    cacheWrite1hTokens: write1h + unclassified,
    cacheReadTokens: toCount(u.cache_read_input_tokens),
    cacheWriteTierAssumed: unclassified > 0 ? '1h' : null,
  };
}

/** Cost of one call from the four usage categories. Cached tokens are never priced as standard input. */
export function estimateUsageCostUsd(model, usage) {
  const r = MODEL_PRICING_ESTIMATE[model];
  if (!r) return null;
  const n =
    usage && 'standardInputTokens' in usage ? usage : normaliseAnthropicUsage(usage);
  const parts = {
    standardInputUsd: (n.standardInputTokens / 1e6) * r.inputPerMtok,
    outputUsd: (n.outputTokens / 1e6) * r.outputPerMtok,
    cacheWrite5mUsd: (n.cacheWrite5mTokens / 1e6) * r.cacheWrite5mPerMtok,
    cacheWrite1hUsd: (n.cacheWrite1hTokens / 1e6) * r.cacheWrite1hPerMtok,
    cacheReadUsd: (n.cacheReadTokens / 1e6) * r.cacheReadPerMtok,
  };
  const totalUsd = Number(Object.values(parts).reduce((a, b) => a + b, 0).toFixed(6));
  return {
    model,
    pricingVersion: ANTHROPIC_PRICING_VERSION,
    ...n,
    ...Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, Number(v.toFixed(6))])),
    totalUsd,
  };
}

/** Maximum cost a request can incur: prompt at the highest input-side rate plus the full output cap. */
export function estimateMaxRequestCostUsd(model, inputTokens, maxOutputTokens) {
  const r = MODEL_PRICING_ESTIMATE[model];
  if (!r) return null;
  const inCost = (inputTokens / 1_000_000) * maxInputSideRatePerMtok(model);
  const outCost = (maxOutputTokens / 1_000_000) * r.outputPerMtok;
  return Number((inCost + outCost).toFixed(6));
}

export function resolveV2EvalModel(cliModel) {
  return resolveV2EvalModelId(cliModel);
}

/**
 * Standard-rate estimate used by the V2 eval harness (no cache categories). Unknown models fall back to
 * Haiku 5.5 here; the lab spend guard does NOT use this fallback and fails closed on unpriced models.
 */
export function estimateRequestCostUsd(model, inputTokens, outputTokens) {
  const rates = MODEL_PRICING_ESTIMATE[model] || MODEL_PRICING_ESTIMATE['claude-haiku-5-5'];
  const inCost = (inputTokens / 1_000_000) * rates.inputPerMtok;
  const outCost = (outputTokens / 1_000_000) * rates.outputPerMtok;
  return Number((inCost + outCost).toFixed(6));
}

export function estimatePromptCostUsd(model, promptCharLength, expectedOutputTokens = 1200) {
  const inputTokens = Math.ceil(promptCharLength / 3.5);
  return estimateRequestCostUsd(model, inputTokens, expectedOutputTokens);
}

/**
 * Pre-flight reserve for one V2 eval reasoner case (initial + optional truncation retry).
 */
export function estimateEvalCaseReserveUsd(
  model,
  promptCharLength,
  { maxOutputTokens = 8192, maxRetryOutputTokens = 16384 } = {},
) {
  const inputTokens = Math.ceil(promptCharLength / 3.5);
  const outputCeiling = maxOutputTokens + maxRetryOutputTokens;
  return estimateRequestCostUsd(model, inputTokens, outputCeiling);
}

export class EvalSpendTracker {
  constructor({ budgetUsd = V2_EVAL_BUDGET_USD, model } = {}) {
    this.budgetUsd = budgetUsd;
    this.model = model;
    this.estimatedUsd = 0;
    this.calculatedUsd = 0;
    this.inputTokens = 0;
    this.outputTokens = 0;
    this.requestCount = 0;
    this.stopped = false;
    this.stopReason = null;
    /** Per-case reservation ledger — settled when provider attempts complete. */
    this.pendingReserveUsd = 0;
    this.reservedUsd = 0;
  }

  canAfford(estimatedIncrementalUsd) {
    if (this.stopped) return false;
    return this.calculatedUsd + this.estimatedUsd + estimatedIncrementalUsd <= this.budgetUsd;
  }

  reserveEstimate(estimatedUsd) {
    if (!this.canAfford(estimatedUsd)) {
      this.stopped = true;
      this.stopReason = 'budget_ceiling';
      return false;
    }
    this.estimatedUsd += estimatedUsd;
    this.pendingReserveUsd += estimatedUsd;
    this.reservedUsd += estimatedUsd;
    return true;
  }

  /** Move pending reservation into calculated spend after a case finishes (no provider or after attempts). */
  settlePendingReservation() {
    if (this.pendingReserveUsd > 0) {
      this.estimatedUsd = Math.max(0, this.estimatedUsd - this.pendingReserveUsd);
      this.pendingReserveUsd = 0;
    }
  }

  recordAttempt({ success = false, inputTokens = 0, outputTokens = 0 } = {}) {
    this.requestCount += 1;
    if (success || inputTokens || outputTokens) {
      this.inputTokens += inputTokens || 0;
      this.outputTokens += outputTokens || 0;
    }
  }

  recordUsage({ inputTokens = 0, outputTokens = 0 }) {
    this.recordAttempt({ success: true, inputTokens, outputTokens });
  }

  finalizeCalculated() {
    this.settlePendingReservation();
    this.calculatedUsd = estimateRequestCostUsd(this.model, this.inputTokens, this.outputTokens);
    this.estimatedUsd = Number(this.calculatedUsd.toFixed(4));
    return this.calculatedUsd;
  }

  toJSON() {
    return {
      budgetUsd: this.budgetUsd,
      model: this.model,
      estimatedUsd: Number(this.estimatedUsd.toFixed(4)),
      calculatedUsd: Number(this.calculatedUsd.toFixed(4)),
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      requestCount: this.requestCount,
      reservedUsd: Number(this.reservedUsd.toFixed(4)),
      stopped: this.stopped,
      stopReason: this.stopReason,
    };
  }
}
