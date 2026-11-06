import { AI_AUDIT_EVENT_TYPE } from './enums.js';

export function appendAiDomainAuditEvent(state, event) {
  if (!state.aiDomainAuditEvents) state.aiDomainAuditEvents = [];
  const row = {
    id: event.id || `AIAUD-${Date.now()}-${state.aiDomainAuditEvents.length}`,
    type: event.type,
    analysisId: event.analysisId,
    taskType: event.taskType,
    providerMode: event.providerMode,
    provider: event.provider,
    model: event.model || null,
    promptVersion: event.promptVersion,
    contextHash: event.contextHash,
    actor: event.actor,
    persona: event.persona || null,
    timestamp: event.timestamp || new Date().toISOString(),
  };
  state.aiDomainAuditEvents.unshift(row);
  return row;
}

export function auditAnalysisRequested(state, meta) {
  return appendAiDomainAuditEvent(state, { ...meta, type: AI_AUDIT_EVENT_TYPE.AI_ANALYSIS_REQUESTED });
}

export function auditAnalysisCompleted(state, meta) {
  return appendAiDomainAuditEvent(state, { ...meta, type: AI_AUDIT_EVENT_TYPE.AI_ANALYSIS_COMPLETED });
}

export function auditValidationFailed(state, meta) {
  return appendAiDomainAuditEvent(state, { ...meta, type: AI_AUDIT_EVENT_TYPE.AI_VALIDATION_FAILED });
}

export function auditMarkedOutdated(state, meta) {
  return appendAiDomainAuditEvent(state, { ...meta, type: AI_AUDIT_EVENT_TYPE.AI_ANALYSIS_MARKED_OUTDATED });
}
