import { beginCorrelation } from '../platform/platform-correlation.js';
import { assertPermission } from '../platform/platform-permissions.js';
import {
  getUseCase,
  getModel,
  getPromptConfig,
  getAiPolicy,
  getConfidenceBand,
  getAIQualityGate,
  getAIReviewRequirement,
} from '../ai-governance-helpers.js';
import { buildAiContext, retrieveContextForEntity } from './context-builder.js';
import { scanSourceForInjection, buildDelimitedContext } from './safety-layer.js';
import { validateStructuredOutput } from './output-schemas.js';
import { validateCitations } from './citation-validator.js';
import { buildIdempotencyKey, findReusableExecutionByKey } from './idempotency.js';
import { getAiProvider, resolveAiExecutionMode, externalAiAllowed } from './provider-registry.js';
import { FIXTURE_PROVIDER_ID } from './fixture-provider.js';
import { EXTERNAL_PROVIDER_ID } from './external-provider.js';
import { AI_ERRORS, aiError } from './ai-errors.js';
import { personName } from '../workflow-helpers.js';

export async function executeAiRequest(state, rawRequest, addAudit) {
  const perm = assertPermission(state, 'ai.execution.create', rawRequest);
  if (!perm.ok) return aiError(AI_ERRORS.AI_PERMISSION_DENIED, perm.message);

  const mode = rawRequest.executionMode || resolveAiExecutionMode(state.platformConfig);
  const tenantId = state.tenantContext?.tenantId || 'TEN-DEMO-001';
  const correlationId = rawRequest.correlationId || beginCorrelation('AI');

  const request = normalizeRequest(state, rawRequest);
  const policyBlock = resolvePolicy(state, request);
  if (!policyBlock.ok) return policyBlock;

  const idempotencyKey = buildIdempotencyKey(state, request);
  const reusable = findReusableExecutionByKey(state, idempotencyKey, request.forceReanalysis);
  if (reusable?.analysisId) {
    return { ok: true, reused: true, executionId: reusable.id, analysisId: reusable.analysisId };
  }

  const execution = createExecutionRecord(state, request, { tenantId, mode, correlationId, idempotencyKey });
  state.aiExecutions.unshift(execution);
  addAudit?.({
    user: personName(state, request.requestedBy),
    action: 'AI execution started',
    recordType: 'AI Execution',
    recordId: execution.id,
    correlationId,
    relatedIds: [request.targetEntityId],
  });

  const ctx = buildAiContext(state, request);
  const injectionScan = scanSourceForInjection(ctx.sourceSections.map((s) => s.text).join('\n'));
  execution.safetyStatus = injectionScan.safetyStatus;
  execution.promptInjectionWarnings = injectionScan.promptInjectionWarnings;

  const providerId = pickProvider(state, mode);
  execution.providerId = providerId;
  const provider = getAiProvider(providerId, mode);

  const providerReq = {
    ...request,
    context: ctx,
    delimited: buildDelimitedContext({
      systemInstructions: 'FORGENIQ regulatory analysis task (fixture)',
      organisationContext: ctx.organisationFactors,
      sourceBlocks: ctx.sourceSections,
    }),
    fixtureScenario: request.fixtureScenario,
  };

  execution.status = 'Running';
  const started = Date.now();
  let providerResult;
  try {
    providerResult = await provider.execute(providerReq);
  } catch {
    providerResult = aiError(AI_ERRORS.AI_PROVIDER_UNAVAILABLE, 'Provider error');
  }
  execution.latencyMs = Date.now() - started;

  if (!providerResult.ok) {
    execution.status = 'Failed';
    execution.errorCode = providerResult.code;
    execution.completedAt = new Date().toISOString();
    recordUsage(state, execution, request);
    addAudit?.({
      user: 'FORGENIQ AI Runtime',
      action: 'AI execution failed',
      recordType: 'AI Execution',
      recordId: execution.id,
      newValue: providerResult.code,
      correlationId,
    });
    return { ok: false, executionId: execution.id, code: providerResult.code, message: providerResult.message };
  }

  execution.inputTokenEstimate = providerResult.inputTokenEstimate;
  execution.outputTokenEstimate = providerResult.outputTokenEstimate;
  execution.estimatedCost = providerResult.estimatedCostMock;
  execution.providerRequestIdMock = providerResult.providerRequestIdMock;

  const schemaCheck = validateStructuredOutput(providerResult.schemaName, providerResult.structured);
  execution.responseValidationStatus = schemaCheck.ok ? 'Valid' : 'Invalid';
  if (!schemaCheck.ok) {
    execution.status = 'Failed';
    execution.errorCode = schemaCheck.code;
    execution.completedAt = new Date().toISOString();
    recordUsage(state, execution, request);
    return { ok: false, executionId: execution.id, code: schemaCheck.code, message: schemaCheck.message };
  }

  const claims = (providerResult.structured.claims || []).map((c, i) => ({
    ...c,
    id: `AIC-${execution.id}-${i + 1}`,
    analysisId: null,
    groundingStatus: c.groundingStatus || 'Not Assessed',
    reviewerStatus: 'Not Reviewed',
  }));
  const cite = validateCitations(claims, ctx.allowedSectionIds);
  execution.citationValidationStatus = cite.ok ? 'Valid' : 'Invalid';

  const analysis = persistAnalysisFromExecution(state, request, execution, providerResult, claims, ctx, injectionScan);
  execution.analysisId = analysis.id;
  analysis.executionId = execution.id;
  analysis.correlationId = correlationId;

  const qg = getAIQualityGate(state, analysis);
  analysis.qualityGate = qg;
  execution.qualityGateResult = qg.result;

  const reviewReq = getAIReviewRequirement(state, analysis);
  analysis.humanReviewRequired = reviewReq.required || qg.result === 'Fail';
  if (qg.result === 'Fail') {
    analysis.status = 'Complete';
    analysis.validRecommendation = false;
    execution.status = 'Completed with Warnings';
    execution.errorCode = AI_ERRORS.AI_QUALITY_GATE_FAILED;
  } else {
    analysis.validRecommendation = qg.result !== 'Fail';
    execution.status = injectionScan.safetyStatus === 'Warning' ? 'Completed with Warnings' : 'Completed';
  }

  execution.completedAt = new Date().toISOString();
  recordUsage(state, execution, request);

  addAudit?.({
    user: 'FORGENIQ AI Runtime',
    action: 'AI execution completed',
    recordType: 'AI Execution',
    recordId: execution.id,
    newValue: analysis.id,
    correlationId,
    relatedIds: [analysis.id, request.targetEntityId],
  });

  linkEntityCurrentAnalysis(state, request, analysis.id);
  return { ok: true, executionId: execution.id, analysisId: analysis.id, analysis, qualityGate: qg.result };
}

function normalizeRequest(state, raw) {
  const ctx = retrieveContextForEntity(state, raw.targetEntityType, raw.targetEntityId);
  const useCase = getUseCase(state, raw.useCaseId) || getUseCase(state, mapUseCase(raw.analysisType));
  return {
    ...raw,
    useCaseId: useCase?.id || raw.useCaseId,
    sourceSectionIds: raw.sourceSectionIds || ctx.sourceSectionIds,
    organisationProfileVersion: raw.organisationProfileVersion || state.orgProfile?.version,
    modelId: raw.modelId || state.aiEngines?.[0]?.currentModelId || 'MODEL-RI-2.2',
    configId: raw.configId || state.aiEngines?.[0]?.currentPromptSetId || 'PROMPT-REG-CHANGE-04',
    policyId: raw.policyId || useCase?.policyId || 'AIGOV-POL-001',
    requestedBy: raw.requestedBy || state.currentDemoUserId,
    requestedAt: raw.requestedAt || new Date().toISOString(),
  };
}

function mapUseCase(analysisType) {
  const m = {
    'Publication Classification': 'UC-RI-001',
    'Regulatory Change Extraction': 'UC-RI-002',
    'Applicability Recommendation': 'UC-RI-003',
    'Impact Suggestion': 'UC-RI-004',
  };
  return m[analysisType];
}

function resolvePolicy(state, request) {
  const tenant = state.tenantAiPolicy || {};
  if (tenant.allowExternalAI === false && request.executionMode === 'live-verification') {
    return aiError(AI_ERRORS.AI_TENANT_POLICY_BLOCKED, 'Tenant policy blocks external AI');
  }
  if (tenant.maxDailyCostMock != null && (state.aiUsageEvents || []).filter((e) => e.day === today()).reduce((s, e) => s + (e.estimatedCost || 0), 0) > tenant.maxDailyCostMock) {
    return aiError(AI_ERRORS.AI_COST_LIMIT_EXCEEDED, 'Mock daily AI cost budget exceeded');
  }
  const uc = getUseCase(state, request.useCaseId);
  if (!uc || uc.status !== 'Active') return aiError(AI_ERRORS.AI_USE_CASE_NOT_APPROVED, 'AI use case not approved');
  const model = getModel(state, request.modelId);
  if (!model || model.status !== 'Active') return aiError(AI_ERRORS.AI_MODEL_NOT_APPROVED, 'AI model not approved');
  if (!(uc.approvedModelIds || []).includes(model.id)) return aiError(AI_ERRORS.AI_MODEL_NOT_APPROVED, 'Model not approved for use case');
  const cfg = getPromptConfig(state, request.configId);
  if (!cfg || cfg.status !== 'Active') return aiError(AI_ERRORS.AI_CONFIG_NOT_APPROVED, 'Prompt configuration not active');
  const policy = getAiPolicy(state, request.policyId);
  if (!policy?.active) return aiError(AI_ERRORS.AI_POLICY_BLOCKED, 'AI governance policy blocked');
  return { ok: true, useCase: uc, model, config: cfg, policy };
}

function pickProvider(state, mode) {
  if (mode === 'fixture') return FIXTURE_PROVIDER_ID;
  if (externalAiAllowed(state)) return EXTERNAL_PROVIDER_ID;
  return FIXTURE_PROVIDER_ID;
}

function createExecutionRecord(state, request, meta) {
  const n = (state._aiExecSeq = (state._aiExecSeq || 0) + 1);
  return {
    id: `AIEX-${String(n).padStart(5, '0')}`,
    tenantId: meta.tenantId,
    useCaseId: request.useCaseId,
    analysisType: request.analysisType,
    targetEntityType: request.targetEntityType,
    targetEntityId: request.targetEntityId,
    sourceDocumentIds: request.sourceDocumentIds || [],
    sourceSectionIds: request.sourceSectionIds || [],
    organisationProfileVersion: request.organisationProfileVersion,
    modelId: request.modelId,
    configId: request.configId,
    policyId: request.policyId,
    requestedBy: request.requestedBy,
    requestedAt: request.requestedAt,
    correlationId: meta.correlationId,
    idempotencyKey: meta.idempotencyKey,
    executionMode: meta.mode,
    reason: request.reason || null,
    reanalysisOfId: request.reanalysisOfId || null,
    status: 'Queued',
    attempt: 1,
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
}

function persistAnalysisFromExecution(state, request, execution, providerResult, claims, ctx, injectionScan) {
  const prior = request.reanalysisOfId ? state.aiAnalyses?.find((a) => a.id === request.reanalysisOfId) : null;
  const version = prior ? (prior.outputVersion || 1) + 1 : 1;
  const analysisId = prior ? `${prior.id.replace(/-V\d+$/, '')}-V${version}` : `AIA-${request.targetEntityId}-EX${execution.id.slice(-4)}`;

  if (prior) {
    prior.supersededByAnalysisId = analysisId;
    prior.reanalysisStatus = 'Superseded';
  }

  const confidence = providerResult.structured.confidence ?? 80;
  const analysis = {
    id: analysisId,
    analysisType: request.analysisType,
    entityType: request.targetEntityType,
    entityId: request.targetEntityId,
    sourceDocumentIds: request.sourceDocumentIds || [],
    sourceSectionIds: ctx.allowedSectionIds,
    organisationProfileVersion: ctx.organisationProfileVersion,
    analysisEngineId: 'AIENG-RI-001',
    modelId: request.modelId,
    promptConfigId: request.configId,
    generatedAt: new Date().toISOString(),
    status: 'Complete',
    confidence,
    confidenceBand: getConfidenceBand(confidence),
    groundingStatus: 'Not Assessed',
    humanReviewRequired: true,
    outputVersion: version,
    supersedesAnalysisId: prior?.id || null,
    aiGovernancePolicyId: request.policyId,
    useCaseId: request.useCaseId,
    recommendations: [{ type: request.analysisType, value: providerResult.structured.recommendation || providerResult.structured.classification, confidence }],
    executionProvenance: {
      executionId: execution.id,
      providerId: execution.providerId,
      executionMode: execution.executionMode,
      fixtureScenario: request.fixtureScenario || 'default',
      contextTruncated: ctx.contextTruncated,
      safetyStatus: injectionScan.safetyStatus,
      untrustedContentTag: 'UNTRUSTED_SOURCE_CONTENT',
    },
    metadata: { aiExecutionMode: execution.executionMode },
  };

  claims.forEach((c) => {
    c.analysisId = analysisId;
    if (!c.groundingStatus || c.groundingStatus === 'Not Assessed') {
      c.groundingStatus = c.citationStatus === 'Supported' ? 'Fully Supported' : 'Unsupported Claim Detected';
    }
    state.aiClaims.push(c);
  });
  analysis.claimIds = claims.map((c) => c.id);
  analysis.groundingStatus = claims.some((c) => c.groundingStatus === 'Unsupported Claim Detected')
    ? 'Insufficient Source Evidence'
    : claims.some((c) => c.groundingStatus === 'Partially Supported')
      ? 'Partially Supported'
      : 'Fully Supported';

  state.aiAnalyses.push(analysis);
  return analysis;
}

function linkEntityCurrentAnalysis(state, request, analysisId) {
  if (request.targetEntityType === 'Regulatory Change') {
    const ch = state.changes?.find((c) => c.id === request.targetEntityId);
    if (ch) ch.currentAnalysisId = analysisId;
  }
  if (request.targetEntityType === 'Publication') {
    const p = state.publications?.find((x) => x.id === request.targetEntityId);
    if (p) p.currentAnalysisId = analysisId;
  }
}

function recordUsage(state, execution, request) {
  if (!state.aiUsageEvents) state.aiUsageEvents = [];
  state.aiUsageEvents.unshift({
    id: `AIUSE-${execution.id}`,
    tenantId: execution.tenantId,
    executionId: execution.id,
    providerId: execution.providerId,
    modelId: request.modelId,
    useCaseId: request.useCaseId,
    day: today(),
    inputTokenEstimate: execution.inputTokenEstimate,
    outputTokenEstimate: execution.outputTokenEstimate,
    estimatedCost: execution.estimatedCost,
    timestamp: new Date().toISOString(),
  });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function getAiExecution(state, id) {
  return (state.aiExecutions || []).find((e) => e.id === id);
}

export function assertTenantExecutionAccess(state, execution) {
  const tid = state.tenantContext?.tenantId || 'TEN-DEMO-001';
  if (execution.tenantId && execution.tenantId !== tid) return false;
  return true;
}
