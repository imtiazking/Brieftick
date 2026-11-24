/** Shared triage list pagination: stable sort, filters, page slicing (mirrors Design Lab UI). */

export const TRIAGE_PAGE_SIZES = [25, 50, 100];
export const TRIAGE_DEFAULT_PAGE_SIZE = 50;

export function normaliseTriagePageSize(value) {
  const n = Number(value);
  return TRIAGE_PAGE_SIZES.includes(n) ? n : TRIAGE_DEFAULT_PAGE_SIZE;
}

export function normaliseTriagePage(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/**
 * Stable ordering: newest run first, then claim order within run, then finding id.
 * @param {{ runCreatedAt?: string | null, claimIndex?: number | null, findingId?: string }} a
 */
export function compareTriageRows(a, b) {
  const ta = Date.parse(a.runCreatedAt || '') || 0;
  const tb = Date.parse(b.runCreatedAt || '') || 0;
  if (tb !== ta) return tb - ta;
  const ca = Number.isInteger(a.claimIndex) ? a.claimIndex : 0;
  const cb = Number.isInteger(b.claimIndex) ? b.claimIndex : 0;
  if (ca !== cb) return ca - cb;
  return String(a.findingId || '').localeCompare(String(b.findingId || ''));
}

export function itemMatchesVerificationFilter(item, filter) {
  const key = String(filter || 'ALL').toUpperCase();
  if (!key || key === 'ALL') return true;
  const hv = String(item.humanVerification || 'UNVERIFIED');
  if (key === 'NEEDS_REVIEW') return hv === 'NEEDS_REVIEW' || hv === 'RE_VERIFICATION_REQUIRED';
  if (key === 'UAT_TEST') return item.countsAsUatOrTest === true;
  if (key === 'VERIFIED') return hv === 'VERIFIED' && item.countsAsGenuineHumanVerification === true;
  if (key === 'VERIFIED_UAT') return hv === 'VERIFIED' && item.countsAsGenuineHumanVerification !== true;
  if (key === 'AWAITING_FIRST_REVIEW') return item.hasPersistedDecision !== true;
  return hv === key;
}

export function itemMatchesApprovalFilter(item, filter) {
  const key = String(filter || 'ALL').toUpperCase();
  if (!key || key === 'ALL') return true;
  return String(item.approvalStatus || 'NONE') === key;
}

export function itemMatchesSearch(item, search) {
  const q = String(search || '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  const hay = [
    item.regulator,
    item.publicationTitle,
    item.provisionReference,
    item.quotation,
    item.regulatoryFinding,
    item.classificationCode,
    item.aiClassification,
    item.legalBasis,
    item.workflowQueue,
    item.disposition,
    item.findingId,
    item.runId,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

/**
 * @param {unknown[]} items
 * @param {{ page?: number, pageSize?: number, verificationFilter?: string, approvalFilter?: string, search?: string }} query
 */
export function paginateTriageItems(items, query = {}) {
  const pageSize = normaliseTriagePageSize(query.pageSize);
  const page = normaliseTriagePage(query.page);
  const verificationFilter = query.verificationFilter || 'ALL';
  const approvalFilter = query.approvalFilter || 'ALL';
  const search = query.search || '';

  const filtered = items.filter(
    (item) =>
      itemMatchesVerificationFilter(item, verificationFilter) &&
      itemMatchesApprovalFilter(item, approvalFilter) &&
      itemMatchesSearch(item, search),
  );
  const sorted = [...filtered].sort(compareTriageRows);
  const totalItems = sorted.length;
  const totalPages = totalItems ? Math.ceil(totalItems / pageSize) : 0;
  const safePage = totalPages ? Math.min(page, totalPages) : 1;
  const start = (safePage - 1) * pageSize;
  const pageItems = sorted.slice(start, start + pageSize);

  return {
    items: pageItems,
    pagination: {
      page: safePage,
      pageSize,
      totalItems,
      totalPages,
      hasNextPage: safePage < totalPages,
      hasPreviousPage: safePage > 1,
    },
    verificationFilter,
    approvalFilter,
    search: search || null,
  };
}