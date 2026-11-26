/**
 * Fail-closed spend guard for UC-RI-005 live lab analysis (Anthropic).
 * Not a billing-system hard cap — see limitationsInDocstring().
 */
import {
  estimatePromptCostUsd,
  estimateRequestCostUsd,
  MODEL_PRICING_ESTIMATE,
} from '../reasoner/anthropic-eval-budget.mjs';
import { reserveSharedLabSpend, settleSharedLabSpend, sharedSpendScopeKey } from './lab-shared-spend.mjs';
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
/** Aggregate lab budget covers obligation extraction and lifecycle stages 2–5. */
const BUDGETED_USE_CASES = new Set([
  'UC-RI-005',
  'UC-RI-004',
  'UC-RI-006',
  'UC-RI-007',
  'UC-RI-008',
]);

/** Process-local cumulative spend so later lifecycle calls honour the same ceiling. */
const pilotCalculatedUsdByScope = new Map();
const pilotRequestCountByScope = new Map();

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
 * When RI_AI_EXECUTION_ENABLED=true and the use case is budgeted
 * (UC-RI-005 and lifecycle UC-RI-004/006/007/008), RI_LAB_ANTHROPIC_MAX_USD is mandatory.
 */
export function resolveLabAnthropicBudgetConfig(useCaseId, { executionEnabled } = {}) {
  if (!BUDGETED_USE_CASES.has(useCaseId)) {
    return { enforced: false, reason: 'use_case_not_budgeted' };
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
          'Live Anthropic execution requires RI_LAB_ANTHROPIC_MAX_USD (positive USD number, e.g. 0.75).',
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
        'Live Anthropic execution requires RI_LAB_ANTHROPIC_MAX_USD (positive USD number, e.g. 0.75).',
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
 * One in-flight budgeted Anthropic lab call per process; a second concurrent request fails closed.
 * Multi-instance deployments need DB-level RUNNING lock (ai-analysis.ts).
 */
export function acquireLabTrialSlot(slotKey, reservedUsd) {
  const scope = 'lab-anthropic-live';
  if (globalInFlightByScope.has(scope)) {
    const existing = globalInFlightByScope.get(scope);
    if (existing.slotKey === slotKey) {
      return { ok: true, reused: true, ...existing };
    }
    return {
      ok: false,
      code: LAB_BUDGET_ERROR_CODES.LAB_TRIAL_OVERLAP,
      message: 'Another live Anthropic lab call is in flight in this runtime.',
      existingSlotKey: existing.slotKey,
    };
  }
  const entry = { slotKey, reservedUsd, startedAt: new Date().toISOString() };
  globalInFlightByScope.set(scope, entry);
  return { ok: true, reused: false, ...entry };
}

export function releaseLabTrialSlot(slotKey) {
  const scope = 'lab-anthropic-live';
  const existing = globalInFlightByScope.get(scope);
  if (existing?.slotKey === slotKey) {
    globalInFlightByScope.delete(scope);
  }
}

export function resetLabTrialSlotsForTests() {
  globalInFlightByScope.clear();
  pilotCalculatedUsdByScope.clear();
  pilotRequestCountByScope.clear();
}

export function readPilotCalculatedUsd(scopeKey) {
  return pilotCalculatedUsdByScope.get(scopeKey) || 0;
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
    'HARD_INVOICE_CAP_NOT_GUARANTEED: the shared ledger reserves the maximum estimated cost and later reconciles reported tokens. It is not an Anthropic invoice or workspace cap.',
    'Pricing uses static MODEL_PRICING_ESTIMATE — actual Anthropic invoice may differ by model snapshot, cache tokens, or taxes.',
    'A crashed instance can leave a RESERVED row. Release it only with release_abandoned_lab_ai_reservation, an actor, and a written reason, after the row is at least 180 seconds old. Nothing releases it automatically, and there is no automatic retry.',
    'Failed provider calls still consume one request. Reported tokens are settled; a call that reports no tokens settles at zero and releases the unused reserve.',
    'RI_LAB_SPEND_GUARD_MODE=memory is for offline tests only. Live execution without a shared database fails closed.',
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

function memoryGuardEnabled() {
  return process.env.RI_LAB_SPEND_GUARD_MODE === 'memory';
}

async function resolveSharedSpendQuery() {
  if (typeof globalThis.__forgeniqLabSpendQuery === 'function') {
    return globalThis.__forgeniqLabSpendQuery;
  }
  const pgUrl =
    process.env.RI_LAB_SPEND_DATABASE_URL?.trim() ||
    process.env.SUPABASE_DB_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.DATABASE_URL?.trim();
  if (pgUrl) {
    return async (sql, params) => {
      const { default: pg } = await import('pg');
      const client = new pg.Client({ connectionString: pgUrl });
      await client.connect();
      try {
        const { rows } = await client.query(sql, params);
        return rows[0];
      } finally {
        await client.end().catch(() => {});
      }
    };
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return async (sql, params) => {
    const isReserve = sql.includes('reserve_lab_ai_spend');
    const { data, error } = await sb.rpc(isReserve ? 'reserve_lab_ai_spend' : 'settle_lab_ai_spend', isReserve
      ? {
          p_scope_key: params[0],
          p_budget_usd: params[1],
          p_max_requests: params[2],
          p_reserve_usd: params[3],
          p_use_case_id: params[4],
          p_idempotency_key: params[5],
          p_organisation_id: params[6],
        }
      : {
          p_reservation_id: params[0],
          p_actual_usd: params[1],
          p_input_tokens: params[2],
          p_output_tokens: params[3],
          p_provider_ok: params[4],
        });
    if (error) {
      const err = new Error(error.message || 'shared_spend_rpc_failed');
      err.code = 'LAB_ANTHROPIC_BUDGET_ENFORCEMENT_FAILED';
      throw err;
    }
    return { result: data };
  };
}

async function guardWithSharedLedger({
  useCaseId,
  config,
  reserveUsd,
  idempotencyKey,
  organisationId,
  maxOutputTokens,
}) {
  let query;
  try {
    query = await resolveSharedSpendQuery();
  } catch (err) {
    return {
      ok: false,
      code: LAB_BUDGET_ERROR_CODES.LAB_ANTHROPIC_BUDGET_ENFORCEMENT_FAILED,
      message: 'Shared spend ledger could not be opened.',
      failClosed: true,
      detail: err?.message || 'connect_failed',
    };
  }
  if (!query) {
    return {
      ok: false,
      code: LAB_BUDGET_ERROR_CODES.LAB_ANTHROPIC_BUDGET_ENFORCEMENT_FAILED,
      message: 'Shared spend ledger is not configured. Live execution is refused.',
      failClosed: true,
    };
  }
  const maxRequests = Number(process.env.RI_LAB_ANTHROPIC_MAX_REQUESTS || 8);
  try {
    const reserved = await reserveSharedLabSpend(query, {
      scopeKey: sharedSpendScopeKey(),
      budgetUsd: config.budgetUsd,
      maxRequests,
      reserveUsd,
      useCaseId,
      idempotencyKey: idempotencyKey || `${useCaseId}:missing-key`,
      organisationId,
    });
    if (!reserved?.ok) {
      return { ok: false, ...reserved, failClosed: true, query };
    }
    return {
      ok: true,
      config,
      durable: true,
      query,
      reservationId: reserved.reservationId,
      slotKey: reserved.reservationId,
      maxOutputTokens,
      reserveUsd: Number(reserved.reserveUsd),
      spendAudit: {
        budgetUsd: config.budgetUsd,
        model: config.model,
        shared: true,
        scopeKey: sharedSpendScopeKey(),
        settledUsd: reserved.settledUsd ?? null,
        reservedUsd: reserved.reservedUsd ?? null,
        requestCount: reserved.requestCount ?? null,
        limitations: labBudgetEnforcementLimitations(),
      },
    };
  } catch (err) {
    return {
      ok: false,
      code: LAB_BUDGET_ERROR_CODES.LAB_ANTHROPIC_BUDGET_ENFORCEMENT_FAILED,
      message: 'Shared spend reservation could not be verified.',
      failClosed: true,
      detail: err?.message || 'reserve_failed',
    };
  }
}

export async function guardLabAnthropicSpendBeforeCall({
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

  const trackerConfig =
    Number.isFinite(maxOutputTokensOverride) && maxOutputTokensOverride > 0
      ? { ...config, maxOutputTokens: Math.min(config.maxOutputTokens, Math.floor(maxOutputTokensOverride)) }
      : config;
  const estimate = new LabAnthropicSpendTracker(trackerConfig);
  const reserve = estimate.reserveForAttempt(system, user);
  if (!reserve.ok) {
    return { ok: false, ...reserve, failClosed: true, spendAudit: estimate.toAuditRecord() };
  }

  if (!memoryGuardEnabled()) {
    return guardWithSharedLedger({
      useCaseId,
      config,
      reserveUsd: reserve.reserveUsd,
      idempotencyKey,
      organisationId,
      maxOutputTokens: reserve.maxOutputTokens,
    });
  }

  const slotKey = buildLabTrialSlotKey({ organisationId, idempotencyKey, useCaseId });
  const scopeKey = buildLabSpendScopeKey(config);
  const maxRequests = Number(process.env.RI_LAB_ANTHROPIC_MAX_REQUESTS || 8);
  const usedRequests = pilotRequestCountByScope.get(scopeKey) || 0;
  if (Number.isFinite(maxRequests) && maxRequests > 0 && usedRequests >= maxRequests) {
    return {
      ok: false,
      code: LAB_BUDGET_ERROR_CODES.LAB_ANTHROPIC_BUDGET_EXCEEDED,
      message: `RI_LAB_ANTHROPIC_MAX_REQUESTS (${maxRequests}) already consumed in this runtime.`,
      failClosed: true,
    };
  }
  const tracker = new LabAnthropicSpendTracker(trackerConfig);
  tracker.calculatedUsd = pilotCalculatedUsdByScope.get(scopeKey) || 0;
  const memoryReserve = tracker.reserveForAttempt(system, user);
  if (!memoryReserve.ok) {
    return { ok: false, ...memoryReserve, failClosed: true, spendAudit: tracker.toAuditRecord() };
  }

  const slot = acquireLabTrialSlot(slotKey, memoryReserve.reserveUsd);
  if (!slot.ok) {
    return { ok: false, code: slot.code, message: slot.message, failClosed: true };
  }

  return {
    ok: true,
    config,
    tracker,
    slotKey,
    maxOutputTokens: memoryReserve.maxOutputTokens,
    reserveUsd: memoryReserve.reserveUsd,
    spendAudit: tracker.toAuditRecord(),
    scopeKey,
  };
}

export async function finalizeLabSpendAfterCall(tracker, slotKey, apiResult, reserveUsd) {
  if (tracker?.durable && tracker.query && tracker.reservationId) {
    const inputTokens = apiResult?.inputTokens ?? 0;
    const outputTokens = apiResult?.outputTokens ?? 0;
    const actualUsd = estimateRequestCostUsd(tracker.config.model, inputTokens, outputTokens);
    try {
      const settled = await settleSharedLabSpend(tracker.query, {
        reservationId: tracker.reservationId,
        actualUsd,
        inputTokens,
        outputTokens,
        providerOk: apiResult?.ok === true,
      });
      return {
        ok: settled?.ok !== false,
        code: settled?.code,
        message: settled?.message,
        spendAudit: { ...(tracker.spendAudit || {}), reconciliation: settled, calculatedUsd: settled?.settledUsd ?? actualUsd },
        providerOk: apiResult?.ok === true,
      };
    } catch (err) {
      return {
        ok: false,
        code: LAB_BUDGET_ERROR_CODES.LAB_ANTHROPIC_BUDGET_ENFORCEMENT_FAILED,
        message: 'Shared spend reservation could not be reconciled.',
        failClosed: true,
        detail: err?.message || 'settle_failed',
      };
    }
  }
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
    const scopeKey = buildLabSpendScopeKey(tracker.config);
    pilotCalculatedUsdByScope.set(scopeKey, tracker.calculatedUsd);
    pilotRequestCountByScope.set(scopeKey, (pilotRequestCountByScope.get(scopeKey) || 0) + 1);
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