/**
 * Sanitised Anthropic failure diagnostics (no secrets, no payloads).
 */

export function buildSanitisedProviderDiagnostics(reasonerResult, extra = {}) {
  if (!reasonerResult || reasonerResult.ok) {
    return {
      ok: true,
      errorClass: null,
      ...extra,
    };
  }

  return {
    ok: false,
    errorClass: reasonerResult.code || 'UNKNOWN',
    httpStatus: reasonerResult.httpStatus ?? null,
    providerErrorType: reasonerResult.providerErrorType ?? null,
    safeMessage: reasonerResult.message || 'Provider request failed.',
    requestId: reasonerResult.requestId ?? null,
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
    ...extra,
  };
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
