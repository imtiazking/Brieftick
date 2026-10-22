/**
 * Classify ingestion failures for bounded retry behaviour.
 */

export function classifyFailure(errorMessage) {
  const msg = String(errorMessage || '').toLowerCase();
  if (msg.includes('source_ineligible') || msg.includes('unknown_source')) {
    return { class: 'PERMANENT', retryable: false };
  }
  if (msg.includes('403') || msg.includes('access_restricted') || msg.includes('auth')) {
    return { class: 'ACCESS', retryable: false };
  }
  if (msg.includes('401')) return { class: 'AUTH', retryable: false };
  if (msg.includes('429') || msg.includes('rate_limit')) {
    return { class: 'RATE_LIMIT', retryable: true };
  }
  if (msg.includes('timeout') || msg.includes('etimedout') || msg.includes('econnreset')) {
    return { class: 'TRANSIENT', retryable: true };
  }
  if (/\b5\d{2}\b/.test(msg)) return { class: 'SERVER_ERROR', retryable: true };
  if (msg.includes('malformed') || msg.includes('normalisation')) {
    return { class: 'NORMALISATION', retryable: false };
  }
  return { class: 'UNKNOWN', retryable: false };
}

export function computeNextRetryAt(attemptNumber, baseBackoffSeconds) {
  const delaySec = baseBackoffSeconds * Math.pow(2, Math.max(0, attemptNumber - 1));
  const capped = Math.min(delaySec, baseBackoffSeconds * 8);
  return new Date(Date.now() + capped * 1000).toISOString();
}
