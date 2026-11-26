/**
 * Stage 4 (UC-RI-007) control-mapping retry rules. Pure functions: no I/O.
 *
 * - Every paid attempt needs a unique idempotency key. The server numbers attempts so an operator never has to invent
 *   one, and a second recovery after a failed recovery is possible.
 * - A retry references the failed request it repeats only when that request actually reserved ledger spend and the
 *   provider call failed. A request denied before any reservation (budget, run authorisation) has nothing to retry.
 */
export const RETRY_KEY_PATTERN = /^[A-Za-z0-9:_.-]{8,160}$/;

export function stage4BaseKey(riskId) {
  return `stage4:${riskId}`;
}

/** Deterministic key for the next recovery attempt given the number of skipped attempts already recorded. */
export function nextStage4RetryKey(riskId, skippedAttempts) {
  const n = Number.isInteger(skippedAttempts) && skippedAttempts > 0 ? skippedAttempts : 0;
  return `${stage4BaseKey(riskId)}:retry-${n + 1}`;
}

/** Validates an operator-supplied key. Returns the trimmed key or null. */
export function acceptOperatorKey(raw, riskId) {
  if (typeof raw !== 'string') return null;
  const key = raw.trim();
  if (!RETRY_KEY_PATTERN.test(key)) return null;
  // Keys are scoped to the risk so one risk's recovery can never consume another risk's idempotency slot.
  return key.startsWith(`${stage4BaseKey(riskId)}:`) || key === stage4BaseKey(riskId) ? key : null;
}

/**
 * The idempotency key of the latest CONTROL_MAPPING_SKIPPED attempt, when that attempt reserved spend and the provider
 * call failed. Otherwise null.
 * @param {Record<string, unknown> | null | undefined} lastSkipMetadata
 */
export function deriveRetryOrigin(lastSkipMetadata) {
  const meta = lastSkipMetadata && typeof lastSkipMetadata === 'object' ? lastSkipMetadata : null;
  if (!meta) return null;
  const key = typeof meta.idempotencyKey === 'string' ? meta.idempotencyKey : null;
  const spend = meta.spendAudit && typeof meta.spendAudit === 'object' ? meta.spendAudit : null;
  if (!key || !spend || spend.runScoped !== true) return null;
  const recon = spend.reconciliation && typeof spend.reconciliation === 'object' ? spend.reconciliation : null;
  if (!recon || recon.providerOk !== false || !recon.reservationId) return null;
  return key;
}
