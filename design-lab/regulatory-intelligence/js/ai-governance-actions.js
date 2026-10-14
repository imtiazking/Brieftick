/**
 * AI governance workflow actions (mock).
 */
import { getAnalysis, getClaimsForAnalysis, getAIQualityGate } from './ai-governance-helpers.js';
import { personName, DEMO_TODAY } from './workflow-helpers.js';

export function recordAiHumanReview(state, analysisId, payload, userId, addAudit) {
  const analysis = getAnalysis(state, analysisId);
  if (!analysis) return { ok: false, error: 'Analysis not found' };
  const rec = analysis.recommendations?.[0];
  let review = state.aiReviews.find((r) => r.analysisId === analysisId);
  if (!review) {
    review = { id: `AIR-${analysisId}-${Date.now()}`, analysisId };
    state.aiReviews.push(review);
  }
  review.reviewerId = userId;
  review.startedAt = review.startedAt || new Date().toISOString();
  review.completedAt = new Date().toISOString();
  review.decision = payload.decision;
  review.justification = payload.justification;
  review.reasonCategory = payload.reasonCategory || 'Other';
  review.originalRecommendation = rec?.value || analysis.recommendations?.[0]?.value;
  review.originalConfidence = analysis.confidence;
  review.modifiedRecommendation = payload.modifiedRecommendation || rec?.value;
  analysis.humanReviewStatus = payload.decision === 'Accepted' ? 'Accepted' : payload.decision;

  if (analysis.entityType === 'Regulatory Change') {
    const ch = state.changes.find((c) => c.id === analysis.entityId);
    if (ch && payload.decision === 'Modified') {
      ch.aiGovernance = {
        ...(ch.aiGovernance || {}),
        humanReviewStatus: 'Human modified',
        humanDecision: payload.modifiedRecommendation,
        justification: payload.justification,
      };
    }
  }

  addAudit({
    user: personName(state, userId),
    action: payload.decision === 'Accepted' ? 'AI recommendation accepted' : payload.decision === 'Rejected' ? 'AI recommendation rejected' : 'AI recommendation modified',
    recordType: 'AI Analysis',
    recordId: analysisId,
    previousValue: review.originalRecommendation,
    newValue: review.modifiedRecommendation,
    comments: payload.justification,
    relatedIds: [analysisId, analysis.entityId],
  });
  return { ok: true, review };
}

export function runMockReanalysis(state, analysisId, userId, addAudit) {
  const prior = getAnalysis(state, analysisId);
  if (!prior) return { ok: false, error: 'Analysis not found' };
  const newId = prior.id.replace(/-V\d+$/, '') + '-V' + ((prior.outputVersion || 1) + 1);
  if (state.aiAnalyses.some((a) => a.id === newId)) return { ok: false, error: 'Re-analysis already exists' };

  const clone = JSON.parse(JSON.stringify(prior));
  clone.id = newId;
  clone.supersedesAnalysisId = prior.id;
  clone.supersededByAnalysisId = null;
  clone.outputVersion = (prior.outputVersion || 1) + 1;
  clone.modelId = 'MODEL-RI-2.2';
  clone.promptConfigId = 'PROMPT-REG-CHANGE-04';
  clone.generatedAt = new Date().toISOString();
  clone.confidence = Math.min(100, (prior.confidence || 80) + 5);
  clone.reanalysisStatus = null;
  prior.supersededByAnalysisId = newId;
  prior.reanalysisStatus = 'Superseded';

  const claims = getClaimsForAnalysis(state, prior.id).map((c, i) => ({
    ...c,
    id: `${c.id}-R${clone.outputVersion}`,
    analysisId: newId,
    confidence: Math.min(100, (c.confidence || 80) + 2),
  }));
  state.aiClaims.push(...claims);
  clone.claimIds = claims.map((c) => c.id);
  state.aiAnalyses.push(clone);

  const ent =
    prior.entityType === 'Regulatory Change'
      ? state.changes.find((c) => c.id === prior.entityId)
      : prior.entityType === 'Publication'
        ? state.publications.find((p) => p.id === prior.entityId)
        : null;
  if (ent) ent.currentAnalysisId = newId;

  addAudit({
    user: personName(state, userId),
    action: 'Re-analysis completed',
    recordType: 'AI Analysis',
    recordId: newId,
    previousValue: prior.id,
    newValue: newId,
    relatedIds: [prior.id, newId, prior.entityId],
  });
  return { ok: true, analysisId: newId };
}

export function recordSourceConflictResolution(state, analysisId, resolution, userId, addAudit) {
  const analysis = getAnalysis(state, analysisId);
  if (!analysis) return { ok: false };
  analysis.conflictResolution = { resolution, reviewerId: userId, date: DEMO_TODAY };
  analysis.groundingStatus = 'Partially Supported';
  analysis.humanReviewRequired = false;
  addAudit({
    user: personName(state, userId),
    action: 'Source conflict resolved',
    recordType: 'AI Analysis',
    recordId: analysisId,
    comments: resolution,
    relatedIds: [analysisId],
  });
  return { ok: true };
}

export function syncAnalysisQualityGate(state, analysisId) {
  const a = getAnalysis(state, analysisId);
  if (a) a.qualityGate = getAIQualityGate(state, a);
}
