import { AI_REVIEW_STATUS, AI_ANALYSIS_STATUS, AI_ANALYSIS_ERROR_CODES } from './enums.js';

export const RETENTION_LIMITS = {
  maxAnalyses: 50,
  maxSerializedBytesPerAnalysis: 40 * 1024,
  maxTotalBytes: Math.floor(2.5 * 1024 * 1024),
};

const PROTECTED_REVIEW = new Set([
  AI_REVIEW_STATUS.ACCEPTED,
  AI_REVIEW_STATUS.PARTIALLY_ACCEPTED,
]);

function serializedSize(analysis) {
  return new TextEncoder().encode(JSON.stringify(analysis)).length;
}

export function pruneAiAnalyses(state, limits = RETENTION_LIMITS) {
  const list = [...(state.riAiAnalysisResults || [])];
  let total = list.reduce((n, a) => n + serializedSize(a), 0);
  const pruned = [];

  const candidates = list
    .map((a, idx) => ({ a, idx }))
    .filter(({ a }) => !PROTECTED_REVIEW.has(a.reviewStatus))
    .sort((x, y) => (x.a.createdAt || '').localeCompare(y.a.createdAt || ''));

  for (const { a, idx } of candidates) {
    if (list.length <= limits.maxAnalyses && total <= limits.maxTotalBytes) break;
    if (PROTECTED_REVIEW.has(a.reviewStatus)) continue;
    const size = serializedSize(a);
    const failedOrFixture =
      a.status === AI_ANALYSIS_STATUS.FAILED ||
      a.status === AI_ANALYSIS_STATUS.VALIDATION_FAILED ||
      a.providerMode === 'FIXTURE';
    if (!failedOrFixture && a.reviewStatus !== AI_REVIEW_STATUS.AI_DRAFT) continue;
    list.splice(
      list.findIndex((x) => x.analysisId === a.analysisId),
      1
    );
    total -= size;
    pruned.push(a.analysisId);
  }

  state.riAiAnalysisResults = list;
  if (list.length > limits.maxAnalyses || total > limits.maxTotalBytes) {
    return { ok: false, code: AI_ANALYSIS_ERROR_CODES.STORAGE_QUOTA_EXCEEDED, pruned };
  }
  return { ok: true, pruned, totalBytes: total, count: list.length };
}

export function assertAnalysisSizeAllowed(analysis, limits = RETENTION_LIMITS) {
  if (serializedSize(analysis) > limits.maxSerializedBytesPerAnalysis) {
    return { ok: false, code: AI_ANALYSIS_ERROR_CODES.STORAGE_QUOTA_EXCEEDED };
  }
  return { ok: true };
}
