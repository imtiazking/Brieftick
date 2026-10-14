import { AI_TASK_TYPE, AI_PROVIDER_MODE, AI_REVIEW_STATUS, AI_AUDIT_EVENT_TYPE } from './enums.js';
import { AiContextBuilder } from './context-builder.js';
import { CONTEXT_RECORD_CATEGORY } from './enums.js';
import { runFixtureAiAnalysis, persistAiAnalysis, updateReviewStatus } from './analysis-service.js';
import { AiOutputValidator } from './output-validator.js';
import { LocalAiBridgeClient } from './local-ai-bridge-client.js';
import { appendAiDomainAuditEvent } from './audit.js';
import { RI_SUMMARY_PROMPT_V1 } from './prompt-metadata.js';
import { canGenerateAiSummary, canMutateAiReviewState } from './persona-ai.js';

export function analysesForPublication(state, publicationId) {
  return (state.riAiAnalysisResults || []).filter((a) =>
    a.entityId === publicationId || a.contextRecordIds?.includes(publicationId)
  );
}

export function selectionForPublication(publicationId) {
  return [{ category: CONTEXT_RECORD_CATEGORY.RI_RECORD, recordType: 'Publication', recordId: publicationId }];
}

export async function generateAiSummary(state, publicationId, { mode = 'fixture', fixtureScenario = 'ai-001-summary' } = {}) {
  if (!canGenerateAiSummary(state)) {
    return { ok: false, code: 'FORBIDDEN' };
  }
  const selection = selectionForPublication(publicationId);
  const builder = new AiContextBuilder(state);
  const ctx = await builder.build({ taskType: AI_TASK_TYPE.AI_SUMMARY, selection });
  if (!ctx.ok) return { ok: false, message: ctx.message };

  if (mode === 'live') {
    const client = new LocalAiBridgeClient();
    const health = await client.health().catch(() => null);
    if (!health?.modelConfigured) {
      return { ok: false, code: 'NOT_CONFIGURED' };
    }
    const res = await client.analyze({
      taskType: AI_TASK_TYPE.AI_SUMMARY,
      analysisId: `AIA-LIVE-${Date.now()}`,
      context: { records: ctx.records },
      contextHash: ctx.contextHash,
      promptId: RI_SUMMARY_PROMPT_V1.promptId,
      promptVersion: RI_SUMMARY_PROMPT_V1.version,
      outputSchemaVersion: RI_SUMMARY_PROMPT_V1.outputSchemaVersion,
    });
    if (res.status !== 200 || !res.json?.analysis) {
      return { ok: false, code: 'BRIDGE_ERROR', detail: res.json };
    }
    const analysis = { ...res.json.analysis, entityType: 'Publication', entityId: publicationId };
    const v = new AiOutputValidator({ state, contextBundle: ctx });
    const validated = v.validateProviderOutput(AI_TASK_TYPE.AI_SUMMARY, {
      summary: analysis.summary,
      citations: analysis.citations,
      keyDates: analysis.sections?.keyDates || [],
      findings: analysis.findings,
    });
    if (!validated.ok) {
      return { ok: false, analysis: { ...analysis, status: validated.status, errorCode: validated.errorCode } };
    }
    persistAiAnalysis(state, analysis);
    return { ok: true, analysis, modeLabel: 'AI LIVE' };
  }

  const result = await runFixtureAiAnalysis(state, {
    taskType: AI_TASK_TYPE.AI_SUMMARY,
    selection,
    fixtureScenario,
  });
  if (!result.persistable) return result;
  const analysis = { ...result.analysis, entityType: 'Publication', entityId: publicationId, providerMode: AI_PROVIDER_MODE.FIXTURE };
  persistAiAnalysis(state, analysis);
  return { ok: true, analysis, modeLabel: 'AI FIXTURE' };
}

export function acceptAiSummary(state, analysisId, notes = '') {
  if (!canMutateAiReviewState(state)) return { ok: false, code: 'FORBIDDEN' };
  const res = updateReviewStatus(state, analysisId, AI_REVIEW_STATUS.ACCEPTED, state.currentDemoUserId);
  if (!res.ok) return res;
  res.analysis.reviewNotes = notes;
  appendAiDomainAuditEvent(state, {
    type: AI_AUDIT_EVENT_TYPE.AI_SUMMARY_ACCEPTED,
    analysisId,
    taskType: AI_TASK_TYPE.AI_SUMMARY,
    actor: state.currentDemoUserId,
    contextHash: res.analysis.contextHash,
    providerMode: res.analysis.providerMode,
    provider: res.analysis.provider,
    model: res.analysis.model,
    promptVersion: res.analysis.promptVersion,
  });
  return res;
}

export function rejectAiSummary(state, analysisId, notes = '') {
  if (!canMutateAiReviewState(state)) return { ok: false, code: 'FORBIDDEN' };
  const res = updateReviewStatus(state, analysisId, AI_REVIEW_STATUS.REJECTED, state.currentDemoUserId);
  if (!res.ok) return res;
  res.analysis.reviewNotes = notes;
  appendAiDomainAuditEvent(state, {
    type: AI_AUDIT_EVENT_TYPE.AI_SUMMARY_REJECTED,
    analysisId,
    taskType: AI_TASK_TYPE.AI_SUMMARY,
    actor: state.currentDemoUserId,
    contextHash: res.analysis.contextHash,
    providerMode: res.analysis.providerMode,
    provider: res.analysis.provider,
    model: res.analysis.model,
    promptVersion: res.analysis.promptVersion,
  });
  return res;
}
