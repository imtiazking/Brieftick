/**
 * Obligation portfolio taxonomy (Design Lab / Ask RI).
 *
 * Ask RI "How many open obligations are there?" → ACTIVE primary bucket only
 * (confirmed implementation work: Open, In Progress, Overdue). Draft proposals
 * and governance-review obligations are counted separately.
 *
 * Graph / compound linked-work counts → ACTIVE + REVIEW (label: "Active + in-review obligations").
 */

/** User-facing labels (must match population — see docs/AI-REGULATORY-INTELLIGENCE.md). */
export const UI_LABEL_OPEN_OBLIGATIONS = 'Open obligations';
export const UI_LABEL_ACTIVE_IN_REVIEW_OBLIGATIONS = 'Active + in-review obligations';

/** @typedef {'DRAFT'|'ACTIVE'|'REVIEW'|'CLOSED'|'UNCLASSIFIED'} ObligationPrimaryBucket */

const ACTIVE_STATUS_KEYS = new Set(['open', 'in progress', 'overdue']);
const DRAFT_STATUS_KEYS = new Set(['draft']);
const REVIEW_STATUS_KEYS = new Set(['in review']);
const CLOSED_STATUS_KEYS = new Set(['complete', 'historic', 'closed']);

export function normalizeObligationStatus(status) {
  return String(status || '').trim().toLowerCase();
}

/**
 * Non-overlapping primary bucket (one per obligation).
 * @returns {ObligationPrimaryBucket}
 */
export function classifyObligationPrimaryStatus(status) {
  const key = normalizeObligationStatus(status);
  if (!key) return 'UNCLASSIFIED';
  if (DRAFT_STATUS_KEYS.has(key)) return 'DRAFT';
  if (CLOSED_STATUS_KEYS.has(key)) return 'CLOSED';
  if (REVIEW_STATUS_KEYS.has(key)) return 'REVIEW';
  if (ACTIVE_STATUS_KEYS.has(key)) return 'ACTIVE';
  return 'UNCLASSIFIED';
}

/** Secondary attention flag — subset of ACTIVE; not a separate primary bucket. */
export function obligationHasOverdueFlag(status) {
  return normalizeObligationStatus(status) === 'overdue';
}

/** Ask RI open-obligation count and retrieval evidence for "open obligations". */
export function obligationStatusIsOpen(status) {
  return classifyObligationPrimaryStatus(status) === 'ACTIVE';
}

/** Linked-work filters (graph, compound secondary intents). */
export function obligationStatusIsOpenForLinkedWork(status) {
  const bucket = classifyObligationPrimaryStatus(status);
  return bucket === 'ACTIVE' || bucket === 'REVIEW';
}

export function obligationStatusIsDraft(status) {
  return classifyObligationPrimaryStatus(status) === 'DRAFT';
}

/**
 * @param {Array<{ status?: string }>} obligations
 */
export function summarizeObligationPortfolio(obligations = []) {
  const counts = { ACTIVE: 0, DRAFT: 0, REVIEW: 0, CLOSED: 0, UNCLASSIFIED: 0, TOTAL: 0 };
  const flags = { overdueActive: 0 };
  const unclassifiedByStatus = new Map();
  for (const o of obligations) {
    counts.TOTAL += 1;
    const bucket = classifyObligationPrimaryStatus(o.status);
    counts[bucket] += 1;
    if (bucket === 'ACTIVE' && obligationHasOverdueFlag(o.status)) flags.overdueActive += 1;
    if (bucket === 'UNCLASSIFIED') {
      const label = String(o.status ?? '').trim() || '(empty)';
      unclassifiedByStatus.set(label, (unclassifiedByStatus.get(label) || 0) + 1);
    }
  }
  const unclassifiedStatuses = [...unclassifiedByStatus.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => a.status.localeCompare(b.status));
  return {
    counts,
    flags,
    unclassifiedStatuses,
    reconciles:
      counts.ACTIVE + counts.DRAFT + counts.REVIEW + counts.CLOSED + counts.UNCLASSIFIED === counts.TOTAL,
  };
}

export function countOpenObligationsInList(obligations) {
  return summarizeObligationPortfolio(obligations).counts.ACTIVE;
}

export function countDraftObligationsInList(obligations) {
  return summarizeObligationPortfolio(obligations).counts.DRAFT;
}

export function countReviewObligationsInList(obligations) {
  return summarizeObligationPortfolio(obligations).counts.REVIEW;
}

export function filterObligationsByPrimaryBucket(obligations, bucket) {
  return (obligations || []).filter((o) => classifyObligationPrimaryStatus(o.status) === bucket);
}

export function filterActiveObligations(obligations) {
  return filterObligationsByPrimaryBucket(obligations, 'ACTIVE');
}

/** Obligations still requiring implementation attention (active + in review). */
export function filterOpenWorkObligations(obligations) {
  return (obligations || []).filter((o) => obligationStatusIsOpenForLinkedWork(o.status));
}

/** @deprecated Use classifyObligationPrimaryStatus */
export function classifyObligationPortfolioStatus(status) {
  const p = classifyObligationPrimaryStatus(status);
  if (p === 'ACTIVE') return 'OPEN';
  return p;
}

/** @deprecated */
export const OPEN_OBLIGATION_STATUSES = new Set(['Open', 'In progress', 'In Progress', 'Overdue']);
