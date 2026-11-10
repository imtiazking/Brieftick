/**
 * Hard spending ceiling for Phase 2C.2 evaluation (USD).
 */

export const V2_EVAL_BUDGET_USD = 10;

/** Conservative $/MTok estimates — actual usage recorded from provider. */
export const MODEL_PRICING_ESTIMATE = {
  'claude-haiku-4-5': { inputPerMtok: 1.0, outputPerMtok: 5.0 },
  'claude-sonnet-4-5': { inputPerMtok: 3.0, outputPerMtok: 15.0 },
  'claude-3-5-haiku-20241022': { inputPerMtok: 0.8, outputPerMtok: 4.0 },
  'claude-3-5-sonnet-20241022': { inputPerMtok: 3.0, outputPerMtok: 15.0 },
};

export function resolveV2EvalModel() {
  return (
    process.env.ASK_RI_V2_EVAL_MODEL?.trim() ||
    process.env.RI_ANTHROPIC_MODEL?.trim() ||
    'claude-haiku-4-5'
  );
}

export function estimateRequestCostUsd(model, inputTokens, outputTokens) {
  const rates = MODEL_PRICING_ESTIMATE[model] || MODEL_PRICING_ESTIMATE['claude-haiku-4-5'];
  const inCost = (inputTokens / 1_000_000) * rates.inputPerMtok;
  const outCost = (outputTokens / 1_000_000) * rates.outputPerMtok;
  return Number((inCost + outCost).toFixed(6));
}

export function estimatePromptCostUsd(model, promptCharLength, expectedOutputTokens = 1200) {
  const inputTokens = Math.ceil(promptCharLength / 3.5);
  return estimateRequestCostUsd(model, inputTokens, expectedOutputTokens);
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
    return true;
  }

  recordUsage({ inputTokens = 0, outputTokens = 0 }) {
    this.requestCount += 1;
    this.inputTokens += inputTokens || 0;
    this.outputTokens += outputTokens || 0;
  }

  finalizeCalculated() {
    this.calculatedUsd = estimateRequestCostUsd(this.model, this.inputTokens, this.outputTokens);
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
      stopped: this.stopped,
      stopReason: this.stopReason,
    };
  }
}
