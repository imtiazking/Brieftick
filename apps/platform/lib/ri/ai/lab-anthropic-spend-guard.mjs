/**
 * Fail-closed spend guard for UC-RI-005 live lab analysis (Anthropic).
 * Not a billing-system hard cap — see limitationsInDocstring().
 */
import {
  estimatePromptCostUsd,
  estimateRequestCostUsd,
  MODEL_PRICING_ESTIMATE,
} from '../reasoner/anthropic-eval-budget.mjs';
function resolveLabAnthropicModel() {
  const explicit =
    process.env.RI_ANTHROPIC_MODEL?.trim() ||
    process.env.ANTHROPIC_MODEL?.trim() ||
    process.env.RI_AI_MODEL?.trim();
  if (explicit && !explicit.startsWith('gpt-')) return explicit;
  return 'claude-sonnet-4-5';
}

export const LAB_BUDGET_ERROR_CODES = {
  LAB_ANTHROPIC_BUDGET_NOT_CONFIGURED: 'LAB_ANTHROPIC_BUDGET_NOT_CONFIGURED',
  LAB_ANTHROPIC_BUDGET_EXCEEDED: 'LAB_ANTHROPIC_BUDGET_EXCEEDED',
  LAB_ANTHROPIC_BUDGET_ENFORCEMENT_FAILED: 'LAB_ANTHROPIC_BUDGET_ENFORCEMENT_FAILED',
  LAB_TRIAL_OVERLAP: 'LAB_TRIAL_OVERLAP',
  LAB_PROMPT_TOO_LARGE: 'LAB_PROMPT_TOO_LARGE',
};

const UC_RI_005 = 'UC-RI-005';

/** @type {Map<string, { slotKey: string, reservedUsd: number, startedAt: string }>} */
const globalInFlightByScope = new Map();

function parsePositiveFloat(raw, label) {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${label}_invalid`);
  }
  return n;
}

/**
 * When RI_AI_EXECUTION_ENABLED=true and use case is UC-RI-005, budget env is mandatory.
 */
export function resolveLabAnthropicBudgetConfig(useCaseId, { executionEnabled } = {}) {
  if (useCaseId !== UC_RI_005) {
    return { enforced: false, reason: 'not_uc_ri_005' };
  }
  if (executionEnabled !== true) {
    return { enforced: false, reason: 'execution_disabled' };
  }

  let budgetUsd;
  try {
    budgetUsd = parsePositiveFloat(process.env.RI_LAB_ANTHROPIC_MAX_USD?.trim(), 'RI_LAB_ANTHROPIC_MAX_USD');
  } catch (err) {
    const raw = process.env.RI_LAB_ANTHROPIC_MAX_USD?.trim() || '';
    if (!raw) {
      return {
        enforced: true,
        failClosed: true,
        code: LAB_BUDGET_ERROR_CODES.LAB_ANTHROPIC_BUDGET_NOT_CONFIGURED,
        message:
          'UC-RI-005 live execution requires RI_LAB_ANTHROPIC_MAX_USD (positive USD number, e.g. 1.00).',
      };
    }
    return {
      enforced: true,
      failClosed: true,
      code: LAB_BUDGET_ERROR_CODES.LAB_ANTHROPIC_BUDGET_ENFORCEMENT_FAILED,
      message: `RI_LAB_ANTHROPIC_MAX_USD is not a valid positive number: ${raw}`,
    };
  }
  if (budgetUsd == null) {
    return {
      enforced: true,
      failClosed: true,
      code: LAB_BUDGET_ERROR_CODES.LAB_ANTHROPIC_BUDGET_NOT_CONFIGURED,
      message:
        'UC-RI-005 live execution requires RI_LAB_ANTHROPIC_MAX_USD (positive USD number, e.g. 1.00).',
    };
  }

  const model = resolveLabAnthropicModel();
  const maxOutputTokens = parsePositiveFloat(
    process.env.RI_LAB_ANTHROPIC_MAX_OUTPUT_TOKENS?.trim(),
    'RI_LAB_ANTHROPIC_MAX_OUTPUT_TOKENS',
  );
  const maxInputTokens = parsePositiveFloat(
    process.env.RI_LAB_ANTHROPIC_MAX_INPUT_TOKENS?.trim(),
    'RI_LAB_ANTHROPIC_MAX_INPUT_TOKENS',
  );

  const outputCap =
    maxOutputTokens != null
      ? Math.floor(maxOutputTokens)
      : Math.min(8192, Math.max(1024, Math.floor((budgetUsd / 0.015) * 1000)));

  const inputCap =
    maxInputTokens != null
      ? Math.floor(maxInputTokens)
      : Math.min(200_000, Math.max(8_000, Math.floor((budgetUsd / 0.003) * 1_000_000)));

  const retryReserveFactor = Number(process.env.RI_LAB_ANTHROPIC_RETRY_RESERVE_FACTOR?.trim() || '1');
  const retryFactor = Number.isFinite(retryReserveFactor) && retryReserveFactor >= 1 ? retryReserveFactor : 1;

  return {
    enforced: true,
    failClosed: false,
    budgetUsd,
    model,
    maxOutputTokens: outputCap,
    maxInputTokens: inputCap,
    retryReserveFactor: retryFactor,
    pricingEstimate: MODEL_PRICING_ESTIMATE[model] ? model : 'claude-sonnet-4-5',
  };
}

export function buildLabTrialSlotKey({ organisationId, idempotencyKey, useCaseId }) {
  return `${useCaseId || UC_RI_005}:${organisationId || 'unknown'}:${idempotencyKey || 'default'}`;
}

export function buildLabSpendScopeKey(config) {
  return `lab:${config.budgetUsd}:${config.model}`;
}

/**
 * One in-flight UC-RI-005 trial per process; second concurrent request fails closed.
 * Multi-instance deployments need DB-level RUNNING lock (ai-analysis.ts).
 */
export function acquireLabTrialSlot(slotKey, reservedUsd) {
  const scope = 'uc-ri-005-live';
  if (globalInFlightByScope.has(scope)) {
    const existing = globalInFlightByScope.get(scope);
    if (existing.slotKey === slotKey) {
      return { ok: true, reused: true, ...existing };
    }
    return {
      ok: false,
      code: LAB_BUDGET_ERROR_CODES.LAB_TRIAL_OVERLAP,
      message: 'Another UC-RI-005 live trial is in flight in this runtime.',
      existingSlotKey: existing.slotKey,
    };
  }
  const entry = { slotKey, reservedUsd, startedAt: new Date().toISOString() };
  globalInFlightByScope.set(scope, entry);
  return { ok: true, reused: false, ...entry };
}

export function releaseLabTrialSlot(slotKey) {
  const scope = 'uc-ri-005-live';
  const existing = globalInFlightByScope.get(scope);
  if (existing?.slotKey === slotKey) {
    globalInFlightByScope.delete(scope);
  }
}

export function resetLabTrialSlotsForTests() {
  globalInFlightByScope.clear();
}

export class LabAnthropicSpendTracker {
  constructor(config) {
    this.config = config;
    this.budgetUsd = config.budgetUsd;
    this.model = config.model;
    this.maxOutputTokens = config.maxOutputTokens;
    this.reservedUsd = 0;
    this.calculatedUsd = 0;
    this.inputTokens = 0;
    this.outputTokens = 0;
    this.attemptCount = 0;
    this.records = [];
  }

  estimateInputTokensFromPrompt(system, user) {
    const chars = String(system || '').length + String(user || '').length;
    return Math.ceil(chars / 3.5);
  }

  assertPromptWithinInputCap(system, user) {
    const inputTokens = this.estimateInputTokensFromPrompt(system, user);
    if (inputTokens > this.config.maxInputTokens) {
      return {
        ok: false,
        code: LAB_BUDGET_ERROR_CODES.LAB_PROMPT_TOO_LARGE,
        message: `Prompt estimate ${inputTokens} tokens exceeds RI_LAB max input cap ${this.config.maxInputTokens}.`,
        inputTokensEstimate: inputTokens,
        maxInputTokens: this.config.maxInputTokens,
      };
    }
    return { ok: true, inputTokensEstimate: inputTokens };
  }

  /**
   * Pre-flight reserve includes optional retry factor (single provider call today; factor defaults 1).
   */
  reserveForAttempt(system, user) {
    const capCheck = this.assertPromptWithinInputCap(system, user);
    if (!capCheck.ok) return capCheck;

    const outputTokens = this.maxOutputTokens;
    const singleAttemptUsd = estimateRequestCostUsd(this.model, capCheck.inputTokensEstimate, outputTokens);
    const reserveUsd = Number((singleAttemptUsd * this.config.retryReserveFactor).toFixed(6));

    if (this.calculatedUsd + this.reservedUsd + reserveUsd > this.budgetUsd + 1e-9) {
      return {
        ok: false,
        code: LAB_BUDGET_ERROR_CODES.LAB_ANTHROPIC_BUDGET_EXCEEDED,
        message: 'Insufficient RI_LAB_ANTHROPIC_MAX_USD for this request (including retry reserve).',
        budgetUsd: this.budgetUsd,
        wouldReserveUsd: reserveUsd,
        spentUsd: this.calculatedUsd,
        alreadyReservedUsd: this.reservedUsd,
      };
    }

    this.reservedUsd += reserveUsd;
    this.records.push({
      kind: 'reserve',
      reserveUsd,
      inputTokensEstimate: capCheck.inputTokensEstimate,
      maxOutputTokens: outputTokens,
      at: new Date().toISOString(),
    });
    return {
      ok: true,
      reserveUsd,
      maxOutputTokens: outputTokens,
      inputTokensEstimate: capCheck.inputTokensEstimate,
    };
  }

  settleAttempt({ inputTokens = 0, outputTokens = 0, reserveUsd = 0 } = {}) {
    this.attemptCount += 1;
    this.inputTokens += inputTokens || 0;
    this.outputTokens += outputTokens || 0;
    const actualUsd = estimateRequestCostUsd(this.model, inputTokens || 0, outputTokens || 0);
    this.reservedUsd = Math.max(0, this.reservedUsd - reserveUsd);
    this.calculatedUsd += actualUsd;
    this.records.push({
      kind: 'settle',
      inputTokens,
      outputTokens,
      actualUsd,
      at: new Date().toISOString(),
    });
    if (this.calculatedUsd > this.budgetUsd + 1e-6) {
      return {
        ok: false,
        code: LAB_BUDGET_ERROR_CODES.LAB_ANTHROPIC_BUDGET_EXCEEDED,
        message: 'Actual token usage exceeded RI_LAB_ANTHROPIC_MAX_USD.',
        calculatedUsd: this.calculatedUsd,
        budgetUsd: this.budgetUsd,
      };
    }
    return { ok: true, actualUsd, calculatedUsd: this.calculatedUsd };
  }

  toAuditRecord() {
    return {
      budgetUsd: this.budgetUsd,
      model: this.model,
      maxOutputTokens: this.maxOutputTokens,
      maxInputTokens: this.config.maxInputTokens,
      retryReserveFactor: this.config.retryReserveFactor,
      reservedUsd: Number(this.reservedUsd.toFixed(6)),
      calculatedUsd: Number(this.calculatedUsd.toFixed(6)),
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      attemptCount: this.attemptCount,
      records: this.records,
      limitations: labBudgetEnforcementLimitations(),
    };
  }
}

export function labBudgetEnforcementLimitations() {
  return [
    'HARD_INVOICE_CAP_NOT_GUARANTEED: enforcement is pre-flight reserve + post-hoc token accounting — not Anthropic billing API.',
    'Pricing uses static MODEL_PRICING_ESTIMATE — actual Anthropic invoice may differ.',
    'Per-process overlap lock does not synchronise across Vercel serverless instances; the database allows one RUNNING UC-RI-005 run per organisation.',
    'Duplicate idempotency keys always reuse the existing run; a new paid attempt requires a new operator-authorised RI_LAB_TRIAL_IDEMPOTENCY_SUFFIX.',
    'A request that passes pre-flight may still consume thinking tokens inside max_tokens before text appears; partial responses may still incur billed input tokens.',
    'No org-wide Anthropic workspace spend cap — only per-request guard when env is set.',
    'Retries inside callAnthropicMessages are not implemented; retryReserveFactor reserves headroom only.',
    'Provider errors after HTTP 200 may still bill input/output tokens reported by Anthropic.',
  ];
}

export const UC_RI_005_RUN_REFERENCE_ERRORS = Object.freeze({
  NOT_CONFIGURED: 'uc_ri_005_run_reference_not_configured',
  NOT_AUTHORISED: 'uc_ri_005_run_reference_not_authorised',
});

/**
 * Live UC-RI-005 runs only with the operator-authorised run reference (RI_LAB_TRIAL_IDEMPOTENCY_SUFFIX).
 * Fail-closed when unset: each new paid attempt needs a new reference set explicitly by an operator.
 */
function authorisedTrialSuffixes() {
  const plural = process.env.RI_LAB_TRIAL_IDEMPOTENCY_SUFFIXES?.trim();
  if (plural) {
    return [...new Set(plural.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean))];
  }
  const single = process.env.RI_LAB_TRIAL_IDEMPOTENCY_SUFFIX?.trim() || '';
  return single ? [single] : [];
}

export function assertUcRi005LiveTrialIdempotency(idempotencyKey, { executionEnabled } = {}) {
  if (executionEnabled !== true) return { ok: true, skipped: true };
  const allowed = authorisedTrialSuffixes();
  if (!allowed.length) {
    return {
      ok: false,
      code: UC_RI_005_RUN_REFERENCE_ERRORS.NOT_CONFIGURED,
      message:
        'UC-RI-005 live execution requires an authorised run reference (RI_LAB_TRIAL_IDEMPOTENCY_SUFFIX or RI_LAB_TRIAL_IDEMPOTENCY_SUFFIXES).',
    };
  }
  const key = String(idempotencyKey || '');
  const match = allowed.find((suffix) => key.endsWith(`:${suffix}`));
  if (!match) {
    return {
      ok: false,
      code: UC_RI_005_RUN_REFERENCE_ERRORS.NOT_AUTHORISED,
      message: 'This run reference is not an authorised UC-RI-005 run reference.',
      requiredSuffix: allowed.join(','),
    };
  }
  return { ok: true, requiredSuffix: match, allowedSuffixes: allowed };
}

export function guardLabAnthropicSpendBeforeCall({
  useCaseId,
  system,
  user,
  idempotencyKey,
  organisationId,
  maxOutputTokensOverride,
}) {
  const exec = process.env.RI_AI_EXECUTION_ENABLED === 'true';
  const config = resolveLabAnthropicBudgetConfig(useCaseId, { executionEnabled: exec });
  if (!config.enforced) {
    return { ok: true, skipped: true, reason: config.reason };
  }
  if (config.failClosed) {
    return { ok: false, code: config.code, message: config.message, failClosed: true };
  }

  const slotKey = buildLabTrialSlotKey({ organisationId, idempotencyKey, useCaseId });
  const trackerConfig =
    Number.isFinite(maxOutputTokensOverride) && maxOutputTokensOverride > 0
      ? { ...config, maxOutputTokens: Math.min(config.maxOutputTokens, Math.floor(maxOutputTokensOverride)) }
      : config;
  const tracker = new LabAnthropicSpendTracker(trackerConfig);
  const reserve = tracker.reserveForAttempt(system, user);
  if (!reserve.ok) {
    return { ok: false, ...reserve, failClosed: true, spendAudit: tracker.toAuditRecord() };
  }

  const slot = acquireLabTrialSlot(slotKey, reserve.reserveUsd);
  if (!slot.ok) {
    return { ok: false, code: slot.code, message: slot.message, failClosed: true };
  }

  return {
    ok: true,
    config,
    tracker,
    slotKey,
    maxOutputTokens: reserve.maxOutputTokens,
    reserveUsd: reserve.reserveUsd,
    spendAudit: tracker.toAuditRecord(),
  };
}

export function finalizeLabSpendAfterCall(tracker, slotKey, apiResult, reserveUsd) {
  try {
    const inputTokens = apiResult?.inputTokens ?? 0;
    const outputTokens = apiResult?.outputTokens ?? 0;
    const settle = tracker.settleAttempt({
      inputTokens,
      outputTokens,
      reserveUsd,
    });
    if (apiResult && apiResult.ok === false) {
      tracker.records.push({
        kind: 'provider_outcome',
        outcome: 'provider_error',
        code: apiResult.code,
        inputTokens,
        outputTokens,
        at: new Date().toISOString(),
      });
    } else if (apiResult?.ok && !apiResult?.text && outputTokens === 0) {
      tracker.records.push({
        kind: 'provider_outcome',
        outcome: 'partial_or_empty',
        at: new Date().toISOString(),
      });
    }
    const audit = tracker.toAuditRecord();
    releaseLabTrialSlot(slotKey);
    return { ...settle, spendAudit: audit, providerOk: apiResult?.ok === true };
  } catch (err) {
    releaseLabTrialSlot(slotKey);
    return {
      ok: false,
      code: LAB_BUDGET_ERROR_CODES.LAB_ANTHROPIC_BUDGET_ENFORCEMENT_FAILED,
      message: err?.message || 'lab_spend_finalize_failed',
      failClosed: true,
    };
  }
}