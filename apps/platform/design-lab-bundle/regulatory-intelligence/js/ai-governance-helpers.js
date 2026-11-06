/**
 * AI governance — provenance, grounding, quality, metrics (deterministic mock).
 */
import { DEMO_TODAY, getPerson, personName } from './workflow-helpers.js';

export const CONFIDENCE_BANDS = { High: [85, 100], Medium: [70, 84], Low: [0, 69] };

export function getConfidenceBand(confidence) {
  const c = confidence ?? 0;
  if (c >= 85) return 'High';
  if (c >= 70) return 'Medium';
  return 'Low';
}

export function getEngine(state, id) {
  return (state.aiEngines || []).find((e) => e.id === id);
}

export function getModel(state, id) {
  return (state.aiModels || []).find((m) => m.id === id);
}

export function getPromptConfig(state, id) {
  return (state.aiPromptConfigs || []).find((c) => c.id === id);
}

export function getAiPolicy(state, id) {
  return (state.aiGovernancePolicies || []).find((p) => p.id === id);
}

export function getUseCase(state, id) {
  return (state.aiUseCases || []).find((u) => u.id === id);
}

export function getAnalysis(state, id) {
  return (state.aiAnalyses || []).find((a) => a.id === id);
}

export function getClaimsForAnalysis(state, analysisId) {
  return (state.aiClaims || []).filter((c) => c.analysisId === analysisId);
}

export function getReviewForAnalysis(state, analysisId) {
  return (state.aiReviews || []).find((r) => r.analysisId === analysisId);
}

export function getCurrentAnalysis(state, entityType, entityId) {
  const ent =
    entityType === 'Regulatory Change'
      ? state.changes.find((c) => c.id === entityId)
      : entityType === 'Publication'
        ? state.publications.find((p) => p.id === entityId)
        : entityType === 'Change Candidate'
          ? state.changeCandidates?.find((c) => c.id === entityId)
          : null;
  const aid = ent?.currentAnalysisId;
  if (aid) return getAnalysis(state, aid);
  return (state.aiAnalyses || []).find(
    (a) => a.entityType === entityType && a.entityId === entityId && !a.supersededByAnalysisId
  );
}

export function getAnalysesForEntity(state, entityType, entityId) {
  return (state.aiAnalyses || [])
    .filter((a) => a.entityType === entityType && a.entityId === entityId)
    .sort((a, b) => (b.generatedAt || '').localeCompare(a.generatedAt || ''));
}

export function getOrgFactor(state, id) {
  return (state.organisationProfileFactors || []).find((f) => f.id === id);
}

export function getAnalysisGroundingStatus(analysis, claims) {
  if (analysis?.groundingStatus) return analysis.groundingStatus;
  const list = claims || [];
  if (list.some((c) => c.groundingStatus === 'Source Conflict')) return 'Source Conflict';
  if (list.some((c) => c.groundingStatus === 'Insufficient Source Evidence' || c.groundingStatus === 'Unsupported Claim Detected')) {
    return 'Insufficient Source Evidence';
  }
  if (list.some((c) => c.groundingStatus === 'Partially Supported')) return 'Partially Supported';
  if (list.length && list.every((c) => c.groundingStatus === 'Fully Supported' || c.groundingStatus === 'Supported')) return 'Fully Supported';
  return analysis?.groundingStatus || 'Not Assessed';
}

export function getClaimCitationCoverage(claims) {
  const material = (claims || []).filter((c) => c.materiality !== 'Low');
  if (!material.length) return 100;
  const cited = material.filter((c) => (c.sourceSectionIds || []).length > 0).length;
  return Math.round((cited / material.length) * 100);
}

export function getAIReviewRequirement(state, analysis) {
  if (!analysis) return { required: false, reasons: [] };
  const policy = getAiPolicy(state, analysis.aiGovernancePolicyId || 'AIGOV-POL-001');
  const reasons = [];
  const conf = analysis.confidence ?? 0;
  if (policy?.humanReviewRequired) reasons.push('AI governance policy requires human review');
  if (policy?.mandatoryReviewBelowConfidence != null && conf < policy.mandatoryReviewBelowConfidence) {
    reasons.push(`Confidence below ${policy.mandatoryReviewBelowConfidence}%`);
  }
  if (policy?.highMaterialityAlwaysHumanReview && analysis.materiality === 'High') {
    reasons.push('High materiality change');
  }
  const claims = getClaimsForAnalysis(state, analysis.id);
  if (claims.some((c) => ['Unsupported Claim Detected', 'Insufficient Source Evidence'].includes(c.groundingStatus))) {
    reasons.push('Unsupported or insufficiently grounded claim');
  }
  if (claims.some((c) => c.groundingStatus === 'Source Conflict')) reasons.push('Source conflict detected');
  if (analysis.groundingStatus === 'Source Conflict') reasons.push('Analysis grounding: source conflict');
  if (analysis.qualityGate?.result === 'Fail') reasons.push('AI quality gate failed');
  if (analysis.humanReviewRequired) reasons.push('Flagged for mandatory review');
  const required = reasons.length > 0 || analysis.humanReviewRequired;
  return { required, reasons, policy };
}

export function getAIQualityGate(state, analysis) {
  if (analysis?.qualityGate) return analysis.qualityGate;
  const claims = getClaimsForAnalysis(state, analysis?.id);
  const checks = [];
  const missingCite = claims.filter((c) => c.materiality !== 'Low' && !(c.sourceSectionIds || []).length).length;
  checks.push({ code: 'CITATION_COVERAGE', label: 'Material claims have citations', pass: missingCite === 0, detail: missingCite ? `${missingCite} missing` : 'OK' });
  const unsupported = claims.filter((c) => c.groundingStatus === 'Unsupported Claim Detected').length;
  checks.push({ code: 'UNSUPPORTED', label: 'No unsupported claims', pass: unsupported === 0, detail: unsupported ? `${unsupported} unsupported` : 'OK' });
  checks.push({ code: 'ORG_PROFILE', label: 'Organisation profile available', pass: Boolean(analysis?.organisationProfileVersion), detail: analysis?.organisationProfileVersion || 'Missing' });
  const fails = checks.filter((c) => !c.pass).length;
  const result = fails === 0 ? 'Pass' : fails === 1 && unsupported ? 'Pass with Warnings' : fails > 0 ? (unsupported ? 'Fail' : 'Pass with Warnings') : 'Pass';
  return { result, checks };
}

export function getHumanReviewStatus(state, analysis) {
  const review = getReviewForAnalysis(state, analysis?.id);
  if (review?.decision === 'Accepted') return 'Accepted';
  if (review?.decision === 'Modified') return 'Modified';
  if (review?.decision === 'Rejected') return 'Rejected';
  if (review?.decision === 'Escalated') return 'Escalated';
  if (review && !review.completedAt) return 'Under Review';
  const req = getAIReviewRequirement(state, analysis);
  if (req.required) return 'Review Required';
  return 'Not Reviewed';
}

export function getAIOverrideStatus(state, entityType, entityId) {
  const ch = entityType === 'Regulatory Change' ? state.changes.find((c) => c.id === entityId) : null;
  if (!ch) return null;
  const review = getReviewForAnalysis(state, ch.currentAnalysisId);
  if (review?.decision === 'Modified') {
    return {
      original: review.originalRecommendation,
      originalConfidence: review.originalConfidence,
      human: review.modifiedRecommendation || ch.applicabilityDecision,
      justification: review.justification,
      reasonCategory: review.reasonCategory,
    };
  }
  if (ch.aiGovernance?.humanReviewStatus === 'Human modified') {
    return {
      original: ch.applicabilityRecommendation,
      originalConfidence: ch.applicabilityConfidence,
      human: ch.applicabilityDecision,
      justification: ch.decisionMeta?.justification,
    };
  }
  return null;
}

export function getAnalysesRequiringReanalysis(state) {
  return (state.aiAnalyses || []).filter((a) => a.reanalysisStatus === 'Re-analysis Required' || a.reanalysisStatus === 'Re-analysis Recommended');
}

export function getHumanReviewCoverage(state) {
  const applicability = (state.aiAnalyses || []).filter((a) => a.analysisType === 'Applicability Recommendation' && a.materiality === 'High');
  const reviewed = applicability.filter((a) => {
    const st = getHumanReviewStatus(state, a);
    return ['Accepted', 'Modified', 'Rejected'].includes(st);
  });
  return {
    total: applicability.length,
    reviewed: reviewed.length,
    pct: applicability.length ? Math.round((reviewed.length / applicability.length) * 100) : 100,
  };
}

export function getAIOversightMetrics(state) {
  const analyses = state.aiAnalyses || [];
  const reviews = state.aiReviews || [];
  const accepted = reviews.filter((r) => r.decision === 'Accepted').length;
  const modified = reviews.filter((r) => r.decision === 'Modified').length;
  const rejected = reviews.filter((r) => r.decision === 'Rejected').length;
  const completed = reviews.filter((r) => r.completedAt).length;
  const lowConf = analyses.filter((a) => (a.confidence ?? 100) < 70).length;
  const claims = state.aiClaims || [];
  const unsupported = claims.filter((c) => ['Unsupported Claim Detected', 'Insufficient Source Evidence'].includes(c.groundingStatus)).length;
  const conflicts = claims.filter((c) => c.groundingStatus === 'Source Conflict').length;
  const grounding = {};
  analyses.forEach((a) => {
    const g = a.groundingStatus || 'Not Assessed';
    grounding[g] = (grounding[g] || 0) + 1;
  });
  const byType = {};
  reviews.forEach((r) => {
    const a = getAnalysis(state, r.analysisId);
    const t = a?.analysisType || 'Other';
    if (!byType[t]) byType[t] = { accepted: 0, modified: 0, rejected: 0 };
    if (r.decision === 'Accepted') byType[t].accepted += 1;
    if (r.decision === 'Modified') byType[t].modified += 1;
    if (r.decision === 'Rejected') byType[t].rejected += 1;
  });
  const citationCoverage =
    claims.length ? Math.round((claims.filter((c) => (c.sourceSectionIds || []).length).length / claims.length) * 100) : 100;
  return {
    analysesGenerated: analyses.length,
    humanReviewRate: analyses.length ? Math.round((completed / analyses.length) * 100) : 0,
    acceptanceRate: completed ? Math.round((accepted / completed) * 100) : 0,
    modificationRate: completed ? Math.round((modified / completed) * 100) : 0,
    rejectionRate: completed ? Math.round((rejected / completed) * 100) : 0,
    lowConfidenceRate: analyses.length ? Math.round((lowConf / analyses.length) * 100) : 0,
    unsupportedClaimCount: unsupported,
    sourceConflictCount: conflicts,
    reanalysisCount: getAnalysesRequiringReanalysis(state).length,
    groundingBreakdown: grounding,
    overrideByType: byType,
    citationCoverage,
    humanReviewCoverage: getHumanReviewCoverage(state),
  };
}

export function sectionCitationLink(state, sectionId) {
  const sec = (state.sourceSections || []).find((s) => s.id === sectionId);
  if (!sec) return null;
  const slug = sec.citationSlug || sec.sectionNumber;
  const pubId = sec.publicationId;
  return { sectionId, pubId, slug, label: sec.citation || sec.heading };
}

export function renderClaimSupportBadge(status) {
  const map = {
    Supported: 'Fully Supported',
    Partial: 'Partially Supported',
    Missing: 'Insufficient Source Evidence',
    Conflicting: 'Source Conflict',
  };
  return map[status] || status;
}
