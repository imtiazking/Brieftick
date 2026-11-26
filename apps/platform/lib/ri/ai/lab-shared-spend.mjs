/**
 * Durable Anthropic pilot ledger. Callers pass a query function so two
 * processes can share one Postgres database without sharing memory.
 */
import { estimateRequestCostUsd } from '../reasoner/anthropic-eval-budget.mjs';

export function sharedSpendScopeKey() {
  return process.env.RI_LAB_SPEND_SCOPE?.trim() || 'forgeniq-lab-anthropic';
}

export async function reserveSharedLabSpend(query, params) {
  const result = await query(
    `select public.reserve_lab_ai_spend($1, $2, $3, $4, $5, $6, $7) as result`,
    [
      params.scopeKey,
      params.budgetUsd,
      params.maxRequests,
      params.reserveUsd,
      params.useCaseId,
      params.idempotencyKey,
      params.organisationId || null,
    ],
  );
  return result?.result || result;
}

export async function settleSharedLabSpend(query, params) {
  const result = await query(
    `select public.settle_lab_ai_spend($1, $2, $3, $4, $5) as result`,
    [
      params.reservationId,
      params.actualUsd,
      params.inputTokens || 0,
      params.outputTokens || 0,
      params.providerOk === true,
    ],
  );
  return result?.result || result;
}

export function estimateReservationUsd(model, inputTokens, maxOutputTokens) {
  return estimateRequestCostUsd(model, inputTokens, maxOutputTokens);
}
