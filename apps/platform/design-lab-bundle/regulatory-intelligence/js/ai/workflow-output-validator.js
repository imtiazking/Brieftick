import { AI_ANALYSIS_ERROR_CODES, AI_ANALYSIS_STATUS } from './enums.js';

function failValidation(code, message) {
  return { ok: false, status: AI_ANALYSIS_STATUS.VALIDATION_FAILED, errorCode: code, errorMessage: message };
}

function sectorExists(state, id) {
  return state.sectors?.some((s) => s.id === id);
}

function frameworkExists(state, id) {
  return state.regulatoryFrameworks?.some((f) => f.id === id);
}

function policyExists(state, id) {
  return state.policies?.some((p) => p.id === id);
}

function riskExists(state, id) {
  return state.risks?.some((r) => r.id === id);
}

function controlExists(state, id) {
  return state.controls?.some((c) => c.id === id);
}

function changeExists(state, id) {
  return state.changes?.some((c) => c.id === id);
}

function assessmentExists(state, id) {
  return state.assessments?.some((a) => a.id === id);
}

function obligationExists(state, id) {
  return state.obligations?.some((o) => o.id === id);
}

export function validateWorkflowCrossReferences(state, taskType, output) {
  const errors = [];
  for (const m of output.sectorMappings || []) {
    if (m.sectorId && !sectorExists(state, m.sectorId)) errors.push(`unknown sector ${m.sectorId}`);
  }
  for (const m of output.frameworkMappings || []) {
    if (m.frameworkId && !frameworkExists(state, m.frameworkId)) errors.push(`unknown framework ${m.frameworkId}`);
  }
  for (const p of output.policyImpacts || []) {
    if (p.policyId && !policyExists(state, p.policyId)) errors.push(`unknown policy ${p.policyId}`);
  }
  for (const r of output.riskImpacts || []) {
    if (r.riskId && !riskExists(state, r.riskId)) errors.push(`unknown risk ${r.riskId}`);
  }
  for (const c of output.controlImpacts || []) {
    if (c.controlId && !controlExists(state, c.controlId)) errors.push(`unknown control ${c.controlId}`);
  }
  if (output.linkedChangeId && !changeExists(state, output.linkedChangeId)) {
    errors.push(`unknown change ${output.linkedChangeId}`);
  }
  if (output.linkedAssessmentId && !assessmentExists(state, output.linkedAssessmentId)) {
    errors.push(`unknown assessment ${output.linkedAssessmentId}`);
  }
  for (const o of output.obligationSuggestions || []) {
    if (o.linkedObligationId && !obligationExists(state, o.linkedObligationId)) {
      errors.push(`unknown obligation ${o.linkedObligationId}`);
    }
  }
  if (errors.length) {
    return failValidation(AI_ANALYSIS_ERROR_CODES.CONTEXT_HASH_MISMATCH, errors.join('; '));
  }
  return { ok: true };
}
