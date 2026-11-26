/**
 * Durable Anthropic pilot ledger. Callers pass a query function so two
 * processes can share one Postgres database without sharing memory.
 */
import { estimateMaxRequestCostUsd } from '../reasoner/anthropic-eval-budget.mjs';

export function sharedSpendScopeKey() {
  return process.env.RI_LAB_SPEND_SCOPE?.trim() || 'forgeniq-lab-anthropic';
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
  const result = await query(SETTLE_SQL, [
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
  ]);
  return result?.result || result;
}

/** Worst-case reserve: prompt at the highest input-side rate plus the full output cap. Null when unpriced. */
export function estimateReservationUsd(model, inputTokens, maxOutputTokens) {
  return estimateMaxRequestCostUsd(model, inputTokens, maxOutputTokens);
}
