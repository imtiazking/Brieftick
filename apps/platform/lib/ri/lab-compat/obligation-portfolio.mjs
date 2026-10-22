/**
 * Ported from Design Lab `obligation-portfolio.js` (golden master taxonomy).
 * Production services must use the same bucket rules for parity with Ask RI / Dashboard.
 */

export const UI_LABEL_OPEN_OBLIGATIONS = 'Open obligations';
export const UI_LABEL_ACTIVE_IN_REVIEW_OBLIGATIONS = 'Active + in-review obligations';

const ACTIVE_STATUS_KEYS = new Set(['open', 'in progress', 'overdue', 'in_progress']);
const DRAFT_STATUS_KEYS = new Set(['draft']);
const REVIEW_STATUS_KEYS = new Set(['in review', 'in_review']);
const CLOSED_STATUS_KEYS = new Set(['complete', 'historic', 'closed']);

export function normalizeObligationStatus(status) {
  return String(status || '')
    .trim()
    .toLowerCase()
    .replaceAll('_', ' ');
}

export function classifyObligationPrimaryStatus(status) {
  const key = normalizeObligationStatus(status);
  if (!key) return 'UNCLASSIFIED';
  if (DRAFT_STATUS_KEYS.has(key)) return 'DRAFT';
  if (CLOSED_STATUS_KEYS.has(key)) return 'CLOSED';
  if (REVIEW_STATUS_KEYS.has(key)) return 'REVIEW';
  if (ACTIVE_STATUS_KEYS.has(key)) return 'ACTIVE';
  return 'UNCLASSIFIED';
}

export function obligationHasOverdueFlag(status) {
  const key = normalizeObligationStatus(status);
  return key === 'overdue';
}

export function summarizeObligationPortfolio(obligations = []) {
  const counts = { ACTIVE: 0, DRAFT: 0, REVIEW: 0, CLOSED: 0, UNCLASSIFIED: 0, TOTAL: 0 };
  const flags = { overdueActive: 0 };
  for (const o of obligations) {
    counts.TOTAL += 1;
    const bucket = classifyObligationPrimaryStatus(o.status);
    counts[bucket] += 1;
    if (bucket === 'ACTIVE' && obligationHasOverdueFlag(o.status)) flags.overdueActive += 1;
  }
  return { counts, flags };
}
