export function buildIdempotencyKey(state, request) {
  const tenant = state.tenantContext?.tenantId || 'TEN-DEMO-001';
  const parts = [
    tenant,
    request.useCaseId,
    request.targetEntityType,
    request.targetEntityId,
    (request.sourceDocumentIds || []).join(','),
    request.organisationProfileVersion,
    request.modelId,
    request.configId,
    request.sourceDocumentVersion || '',
  ];
  return `IDEM-${parts.join('|')}`;
}

export function findReusableExecutionByKey(state, key, forceReanalysis = false) {
  if (forceReanalysis) return null;
  return (state.aiExecutions || []).find((e) => e.idempotencyKey === key && ['Completed', 'Completed with Warnings'].includes(e.status));
}
