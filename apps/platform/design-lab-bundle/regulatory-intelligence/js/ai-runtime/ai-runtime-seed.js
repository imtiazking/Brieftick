import { FIXTURE_PROVIDER_ID } from './fixture-provider.js';
import { EXTERNAL_PROVIDER_ID } from './external-provider.js';

export function applyAiRuntimeSeed(state) {
  state.aiProviders = buildProviders();
  state.aiExecutions = buildSampleExecutions(state);
  state.automationPolicies = buildAutomationPolicies();
  state.aiUsageEvents = buildUsageEvents(state);
  state.aiEvaluationRuns = buildEvaluationRuns();
  state.tenantAiPolicy = {
    tenantId: state.tenantContext?.tenantId || 'TEN-DEMO-001',
    allowExternalAI: false,
    allowOrganisationContextExternal: false,
    allowedUseCaseIds: ['UC-RI-001', 'UC-RI-002', 'UC-RI-003', 'UC-RI-004'],
    allowedProviderIds: [FIXTURE_PROVIDER_ID],
    maxDailyCostMock: 50,
  };
  if (!state.platformConfig) state.platformConfig = {};
  state.platformConfig.aiExecutionMode = state.platformConfig.aiExecutionMode || 'fixture';
  state.platformConfig.allowLiveAiVerification = state.platformConfig.allowLiveAiVerification ?? false;
  linkExecutionsToAnalyses(state);
  return state;
}

function buildProviders() {
  return [
    {
      id: FIXTURE_PROVIDER_ID,
      name: 'FORGENIQ Fixture AI Provider',
      mode: 'fixture',
      status: 'Healthy',
      liveConfigured: false,
      credentialStatus: 'Not configured',
      capabilities: ['structured-output', 'regulatory-analysis'],
      dataHandlingClassification: 'Design Lab — no external data transfer',
    },
    {
      id: EXTERNAL_PROVIDER_ID,
      name: 'External AI Provider',
      mode: 'production',
      status: 'Not Configured',
      liveConfigured: false,
      credentialStatus: 'Not configured',
      capabilities: [],
      dataHandlingClassification: 'Requires server-side secret and tenant policy',
    },
  ];
}

function buildSampleExecutions(state) {
  const a = state.aiAnalyses?.find((x) => x.id === 'AIA-CHG-001-V2') || state.aiAnalyses?.[0];
  if (!a) return [];
  return [
    {
      id: 'AIEX-SEED-001',
      tenantId: 'TEN-DEMO-001',
      useCaseId: a.useCaseId,
      analysisType: a.analysisType,
      targetEntityType: a.entityType,
      targetEntityId: a.entityId,
      modelId: a.modelId,
      configId: a.promptConfigId,
      policyId: a.aiGovernancePolicyId,
      providerId: FIXTURE_PROVIDER_ID,
      executionMode: 'fixture',
      status: 'Completed',
      analysisId: a.id,
      correlationId: 'COR-AI-SEED-001',
      idempotencyKey: 'IDEM-SEED-DEMO',
      latencyMs: 48,
      inputTokenEstimate: 1500,
      outputTokenEstimate: 240,
      estimatedCost: 0.0025,
      responseValidationStatus: 'Valid',
      citationValidationStatus: 'Valid',
      qualityGateResult: a.qualityGate?.result || 'Pass',
      safetyStatus: 'Pass',
      startedAt: a.generatedAt,
      completedAt: a.generatedAt,
    },
  ];
}

function buildAutomationPolicies() {
  return [
    {
      id: 'AUTO-RI-001',
      useCaseId: 'UC-RI-003',
      automationLevel: 1,
      actionsAllowed: ['create_draft_analysis'],
      humanReviewRequired: true,
      materialityLimit: 'High',
      active: true,
    },
    {
      id: 'AUTO-RI-002',
      useCaseId: 'UC-RI-002',
      automationLevel: 2,
      actionsAllowed: ['create_review_task', 'create_draft_candidate'],
      humanReviewRequired: true,
      active: true,
    },
  ];
}

function buildUsageEvents(state) {
  return (state.aiExecutions || []).map((e) => ({
    id: `AIUSE-${e.id}`,
    tenantId: e.tenantId,
    executionId: e.id,
    providerId: e.providerId,
    modelId: e.modelId,
    useCaseId: e.useCaseId,
    day: (e.completedAt || e.startedAt || '').slice(0, 10),
    inputTokenEstimate: e.inputTokenEstimate,
    outputTokenEstimate: e.outputTokenEstimate,
    estimatedCost: e.estimatedCost,
    timestamp: e.completedAt || e.startedAt,
  }));
}

function buildEvaluationRuns() {
  return [
    {
      id: 'AIEVAL-001',
      modelId: 'MODEL-RI-2.1',
      configId: 'PROMPT-REG-CHANGE-03',
      datasetVersion: 'golden-v1',
      runAt: '2026-09-15T10:00:00Z',
      metrics: { schemaSuccessRate: 100, citationValidityRate: 98, unsupportedClaimRate: 2 },
      reviewer: 'u-smith',
      notes: 'Fixture evaluation — demo metrics only',
    },
    {
      id: 'AIEVAL-002',
      modelId: 'MODEL-RI-2.2',
      configId: 'PROMPT-REG-CHANGE-04',
      datasetVersion: 'golden-v1',
      runAt: '2026-10-05T11:00:00Z',
      metrics: { schemaSuccessRate: 100, citationValidityRate: 99, unsupportedClaimRate: 1 },
      reviewer: 'u-smith',
      notes: 'Fixture comparison vs 2.1 — not production accuracy',
    },
  ];
}

function linkExecutionsToAnalyses(state) {
  state.aiExecutions?.forEach((e) => {
    const a = state.aiAnalyses?.find((x) => x.id === e.analysisId);
    if (a && !a.executionId) a.executionId = e.id;
  });
}
