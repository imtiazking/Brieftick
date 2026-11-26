/**
 * Durable Anthropic execution ledger. Callers pass a query function so two
 * processes can share one Postgres database without sharing memory.
 *
 * Two modes:
 *   run     (default) every request belongs to an authorised execution RUN: its own tenant, budget, request cap,
 *           validity window and counters. A new run never inherits consumption from another run.
 *   legacy  the original single shared account per scope key. Kept only for historical records and explicit tests.
 */
import { estimateMaxRequestCostUsd } from '../reasoner/anthropic-eval-budget.mjs';

export function sharedSpendScopeKey() {
  return process.env.RI_LAB_SPEND_SCOPE?.trim() || 'forgeniq-lab-anthropic';
}

/** 'run' unless explicitly switched to the historical shared-account mode. */
export function resolveLedgerMode(env = process.env) {
  return String(env.RI_LAB_SPEND_LEDGER_MODE || 'run').trim().toLowerCase() === 'legacy' ? 'legacy' : 'run';
}

/**
 * The single authorised run reference for this deployment window.
 * RI_AI_EXECUTION_RUN_REFERENCE wins; otherwise the one non-closed entry of RI_LAB_TRIAL_IDEMPOTENCY_SUFFIXES.
 * Returns null when none or more than one candidate exists (fail closed: ambiguity never selects a run).
 */
export function resolveAiExecutionRunReference(env = process.env) {
  const explicit = String(env.RI_AI_EXECUTION_RUN_REFERENCE || '').trim();
  if (explicit) return explicit;
  const raw = String(env.RI_LAB_TRIAL_IDEMPOTENCY_SUFFIXES || env.RI_LAB_TRIAL_IDEMPOTENCY_SUFFIX || '').trim();
  const open = [...new Set(raw.split(/[,;\s]+/).filter(Boolean))].filter((v) => !v.startsWith('closed-'));
  return open.length === 1 ? open[0] : null;
}

/** Seconds after which a RESERVED row's provider call can no longer be running (timeout + grace). */
export function providerWindowSeconds(timeoutMs) {
  const t = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0 ? Number(timeoutMs) : 60_000;
  // Serverless functions are killed by the platform limit; the provider may still finish after a client abort.
  return Math.max(Math.ceil(t / 1000), 300) + 120;
}

export const RESERVE_SQL =
  'select public.reserve_lab_ai_spend($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11) as result';
export const SETTLE_SQL =
  'select public.settle_lab_ai_spend($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb) as result';
export const RUN_RESERVE_SQL =
  'select public.reserve_ai_execution_run($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10) as result';
export const RUN_SETTLE_SQL =
  'select public.settle_ai_execution_run($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb) as result';

export async function reserveSharedLabSpend(query, params) {
  const result = await query(RESERVE_SQL, [
    params.scopeKey,
    params.budgetUsd,
    params.maxRequests,
    params.reserveUsd,
    params.useCaseId,
    params.idempotencyKey,
    params.organisationId || null,
    params.model || null,
    params.pricingVersion || null,
    params.reserveBasis ? JSON.stringify(params.reserveBasis) : null,
    params.providerWindowSeconds ?? 420,
  ]);
  return result?.result || result;
}

export async function settleSharedLabSpend(query, params) {
  const result = await query(SETTLE_SQL, settleParams(params));
  return result?.result || result;
}

function settleParams(params) {
  return [
    params.reservationId,
    params.actualUsd,
    params.inputTokens || 0,
    params.outputTokens || 0,
    params.providerOk === true,
    params.cacheWrite5mTokens || 0,
    params.cacheWrite1hTokens || 0,
    params.cacheReadTokens || 0,
    params.providerRequestId || null,
    params.usageKnown !== false,
    params.costBreakdown ? JSON.stringify(params.costBreakdown) : null,
  ];
}

/** Reserve against an authorised run. Budget, request cap and window come from the run row, never from the caller. */
export async function reserveAiExecutionRun(query, params) {
  const result = await query(RUN_RESERVE_SQL, [
    params.runReference,
    params.organisationId || null,
    params.reserveUsd,
    params.useCaseId,
    params.idempotencyKey,
    params.model || null,
    params.pricingVersion || null,
    params.reserveBasis ? JSON.stringify(params.reserveBasis) : null,
    params.providerWindowSeconds ?? 420,
    params.retryOf || null,
  ]);
  return result?.result || result;
}

export async function settleAiExecutionRun(query, params) {
  const result = await query(RUN_SETTLE_SQL, settleParams(params));
  return result?.result || result;
}

/** Worst-case reserve: prompt at the highest input-side rate plus the full output cap. Null when unpriced. */
export function estimateReservationUsd(model, inputTokens, maxOutputTokens) {
  return estimateMaxRequestCostUsd(model, inputTokens, maxOutputTokens);
}
