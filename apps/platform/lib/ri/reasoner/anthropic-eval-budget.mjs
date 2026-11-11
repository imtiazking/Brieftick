/**
 * Hard spending ceiling for Phase 2C.2 evaluation (USD).
 */

export const V2_EVAL_BUDGET_USD = 10;

/** Conservative $/MTok estimates — actual usage recorded from provider. */
import { resolveV2EvalModelId } from './v2-eval-models.mjs';

export const MODEL_PRICING_ESTIMATE = {
  'claude-haiku-5-5': { inputPerMtok: 0.1, outputPerMtok: 0.5 },
  'claude-sonnet-5-5': { inputPerMtok: 2.0, outputPerMtok: 10.0 },
  'claude-haiku-4-5': { inputPerMtok: 1.0, outputPerMtok: 5.0 },
  'claude-sonnet-4-5': { inputPerMtok: 3.0, outputPerMtok: 15.0 },
};

export function resolveV2EvalModel(cliModel) {
  return resolveV2EvalModelId(cliModel);
}

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
