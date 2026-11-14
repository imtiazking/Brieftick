/**
 * Sanitised Anthropic failure diagnostics (no secrets, no payloads).
 */

const FORBIDDEN_DIAGNOSTIC_KEYS = new Set([
  'apiKey',
  'x-api-key',
  'authorization',
  'rawText',
  'rawTextSanitized',
  'text',
  'system',
  'user',
  'messages',
  'content',
  'body',
  'prompt',
  'evidenceChunks',
]);

const API_KEY_PATTERN = /\bsk-ant-[A-Za-z0-9_-]{8,}\b/gi;

export function sanitizeProviderSafeMessage(message) {
  if (!message || typeof message !== 'string') return 'Provider request failed.';
  let safe = message.slice(0, 500);
  safe = safe.replace(API_KEY_PATTERN, '[REDACTED_API_KEY]');
  if (/x-api-key|authorization:\s*\S+/i.test(safe)) {
    return 'Provider request failed (details redacted).';
  }
  return safe;
}

export function buildSanitisedProviderAttemptSummaries(attempts) {
  if (!Array.isArray(attempts)) return [];
  return attempts.map((a) => ({
    attempt: a.attempt ?? null,
    maxTokens: a.maxTokens ?? null,
    ok: a.ok ?? null,
    code: a.code ?? null,
    stopReason: a.stopReason ?? null,
    inputTokens: a.inputTokens ?? null,
    outputTokens: a.outputTokens ?? null,
    contentBlockTypes: Array.isArray(a.contentBlockTypes) ? [...a.contentBlockTypes] : null,
  }));
}

function stripForbiddenExtra(extra) {
  if (!extra || typeof extra !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(extra)) {
    if (!FORBIDDEN_DIAGNOSTIC_KEYS.has(k)) out[k] = v;
  }
  return out;
}

export function buildSanitisedProviderDiagnostics(reasonerResult, extra = {}) {
  if (!reasonerResult || reasonerResult.ok) {
    return {
      ok: true,
      errorClass: null,
      ...stripForbiddenExtra(extra),
    };
  }

  const requestId =
    typeof reasonerResult.requestId === 'string' && reasonerResult.requestId.trim()
      ? reasonerResult.requestId
      : null;

  return {
    ok: false,
    errorClass: reasonerResult.code || 'UNKNOWN',
    httpStatus: reasonerResult.httpStatus ?? null,
    providerErrorType: reasonerResult.providerErrorType ?? null,
    safeMessage: sanitizeProviderSafeMessage(reasonerResult.message),
    requestId,
    requestReachedProvider:
      reasonerResult.requestReachedProvider ?? (reasonerResult.httpStatus != null ? true : false),
    responseReceived: reasonerResult.responseReceived ?? (reasonerResult.httpStatus != null ? true : false),
    model: reasonerResult.model ?? extra.model ?? null,
    latencyMs: reasonerResult.latencyMs ?? null,
    stopReason: reasonerResult.stopReason ?? null,
    contentBlockTypes: reasonerResult.contentBlockTypes ?? null,
    inputTokens: reasonerResult.inputTokens ?? reasonerResult.usage?.inputTokens ?? null,
    outputTokens: reasonerResult.outputTokens ?? reasonerResult.usage?.outputTokens ?? null,
    truncationKind: reasonerResult.truncationKind ?? null,
    providerAttempts: reasonerResult.providerAttempts ?? null,
    providerAttemptSummaries: buildSanitisedProviderAttemptSummaries(
      reasonerResult.providerAttemptSummaries ?? reasonerResult.attempts,
    ),
    ...stripForbiddenExtra(extra),
  };
}

/**
 * Assert persisted diagnostics contain no sensitive payloads (for tests and report scrubbing).
 */
export function assertSanitisedDiagnosticsPayload(obj, path = '') {
  const violations = [];
  if (!obj || typeof obj !== 'object') return violations;
  for (const [k, v] of Object.entries(obj)) {
    const p = path ? `${path}.${k}` : k;
    if (FORBIDDEN_DIAGNOSTIC_KEYS.has(k)) violations.push(p);
    if (k === 'safeMessage' && typeof v === 'string' && API_KEY_PATTERN.test(v)) violations.push(`${p}:api_key_pattern`);
    if (v && typeof v === 'object') violations.push(...assertSanitisedDiagnosticsPayload(v, p));
  }
  return violations;
}

export function classifyV2HarnessOutcome(engineResult) {
  const st = engineResult?.v2ExecutionStatus;
  if (st === 'BLOCKED_EXPECTED') return 'SECURITY_BLOCK_EXPECTED';
  if (st === 'BLOCKED_UNEXPECTED') return 'SECURITY_BLOCK_UNEXPECTED';
  if (engineResult?.preReasonerBlock === 'reference_validation') return 'REFERENCE_REJECTED';
  if (engineResult?.preReasonerBlock === 'authority_gate') return 'AUTHORITY_GATE_REJECTED';
  if (st === 'OUTPUT_TRUNCATED') return 'OUTPUT_TRUNCATED';
  if (st === 'PROVIDER_ERROR') return 'PROVIDER_FAILURE';
  if (st === 'VERIFICATION_FAILED') return 'VERIFICATION_FAILURE';
  if (st === 'NOT_RUN' || engineResult?.status === 'NOT_RUN') return 'NOT_RUN_DRY_OR_SKIPPED';
  if (st === 'PUBLIC_ELIGIBLE_EXECUTED' && engineResult?.providerInvoked && engineResult?.status !== 'FAILED') {
    return 'REGULATORY_MEASURED';
  }
  if (st === 'PUBLIC_ELIGIBLE_EXECUTED' && !engineResult?.providerInvoked) {
    return 'PIPELINE_COMPLETED_NO_PROVIDER';
  }
  return 'REGULATORY_MEASURED';
}
