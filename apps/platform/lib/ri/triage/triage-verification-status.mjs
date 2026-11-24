/**
 * Derived human-verification and maker-checker approval indicators for Obligation Triage.
 * Status comes from persisted finding decisions and obligation register state — never AI confidence.
 */

export const HUMAN_VERIFICATION = Object.freeze({
  UNVERIFIED: 'UNVERIFIED',
  VERIFIED: 'VERIFIED',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  REJECTED: 'REJECTED',
  RE_VERIFICATION_REQUIRED: 'RE_VERIFICATION_REQUIRED',
});

export const APPROVAL_STATUS = Object.freeze({
  NONE: 'NONE',
  DRAFT: 'DRAFT',
  AWAITING_APPROVAL: 'AWAITING_APPROVAL',
  APPROVED: 'APPROVED',
  APPROVAL_REJECTED: 'APPROVAL_REJECTED',
});

const NEEDS_REVIEW_DISPOSITIONS = new Set(['RECLASSIFICATION_REQUESTED']);

/**
 * @param {{
 *   recorded?: {
 *     decision?: string | null;
 *     disposition?: string | null;
 *     reviewer_user_id?: string | null;
 *     analysis_review_id?: string | null;
 *   } | null;
 *   provisional?: boolean;
 *   queueName?: string | null;
 *   exceptionReasons?: string[] | null;
 *   reVerificationRequired?: boolean;
 * }} input
 */
export function deriveHumanVerification(input) {
  const recorded = input.recorded;
  if (input.reVerificationRequired && recorded) {
    return HUMAN_VERIFICATION.RE_VERIFICATION_REQUIRED;
  }
  if (!recorded) {
    if (input.queueName === 'EXCEPTION_TRIAGE') return HUMAN_VERIFICATION.NEEDS_REVIEW;
    if (Array.isArray(input.exceptionReasons) && input.exceptionReasons.length) {
      return HUMAN_VERIFICATION.NEEDS_REVIEW;
    }
    if (input.provisional) return HUMAN_VERIFICATION.NEEDS_REVIEW;
    return HUMAN_VERIFICATION.UNVERIFIED;
  }
  if (recorded.decision === 'REJECTED') return HUMAN_VERIFICATION.REJECTED;
  if (recorded.disposition && NEEDS_REVIEW_DISPOSITIONS.has(recorded.disposition)) {
    return HUMAN_VERIFICATION.NEEDS_REVIEW;
  }
  if (recorded.decision === 'ACCEPTED' && recorded.reviewer_user_id && recorded.analysis_review_id) {
    return HUMAN_VERIFICATION.VERIFIED;
  }
  return HUMAN_VERIFICATION.UNVERIFIED;
}

/** @param {string | null | undefined} obligationStatus */
export function deriveApprovalStatus(obligationStatus) {
  if (!obligationStatus) return APPROVAL_STATUS.NONE;
  switch (obligationStatus) {
    case 'DRAFT':
      return APPROVAL_STATUS.DRAFT;
    case 'IN_REVIEW':
      return APPROVAL_STATUS.AWAITING_APPROVAL;
    case 'OPEN':
    case 'IN_PROGRESS':
    case 'OVERDUE':
    case 'COMPLETE':
    case 'HISTORIC':
      return APPROVAL_STATUS.APPROVED;
    case 'CLOSED':
      return APPROVAL_STATUS.APPROVAL_REJECTED;
    default:
      return APPROVAL_STATUS.NONE;
  }
}

/** @param {Array<{ humanVerification?: string }>} items */
export function countHumanVerification(items) {
  const counts = {
    ALL: items.length,
    UNVERIFIED: 0,
    VERIFIED: 0,
    NEEDS_REVIEW: 0,
    REJECTED: 0,
    RE_VERIFICATION_REQUIRED: 0,
  };
  for (const item of items) {
    const key = item.humanVerification || HUMAN_VERIFICATION.UNVERIFIED;
    if (key === HUMAN_VERIFICATION.RE_VERIFICATION_REQUIRED) {
      counts.RE_VERIFICATION_REQUIRED += 1;
      counts.NEEDS_REVIEW += 1;
    } else if (counts[key] != null) counts[key] += 1;
  }
  return counts;
}

/** @param {Array<{ approvalStatus?: string }>} items */
export function countApprovalStatus(items) {
  const counts = {
    ALL: items.length,
    NONE: 0,
    DRAFT: 0,
    AWAITING_APPROVAL: 0,
    APPROVED: 0,
    APPROVAL_REJECTED: 0,
  };
  for (const item of items) {
    const key = item.approvalStatus || APPROVAL_STATUS.NONE;
    if (counts[key] != null) counts[key] += 1;
  }
  return counts;
}

export const HUMAN_VERIFICATION_LABELS = Object.freeze({
  UNVERIFIED: { icon: '⚪', label: 'UNVERIFIED' },
  VERIFIED: { icon: '✅', label: 'VERIFIED' },
  NEEDS_REVIEW: { icon: '🟠', label: 'NEEDS REVIEW' },
  REJECTED: { icon: '❌', label: 'REJECTED' },
  RE_VERIFICATION_REQUIRED: { icon: '🟠', label: 'RE-VERIFICATION REQUIRED' },
});

export const APPROVAL_STATUS_LABELS = Object.freeze({
  NONE: { icon: '—', label: 'No draft obligation' },
  DRAFT: { icon: '⚪', label: 'DRAFT' },
  AWAITING_APPROVAL: { icon: '🟠', label: 'AWAITING APPROVAL' },
  APPROVED: { icon: '🟢', label: 'APPROVED' },
  APPROVAL_REJECTED: { icon: '🔴', label: 'APPROVAL REJECTED' },
});

/**
 * @param {string} humanVerification
 * @param {{ obligationId?: string | null; approvalStatus?: string }} item
 */
export function triageRowActionKind(humanVerification, item) {
  if (humanVerification === HUMAN_VERIFICATION.VERIFIED) return 'VIEW_VERIFICATION';
  if (humanVerification === HUMAN_VERIFICATION.REJECTED) return 'VIEW_DECISION';
  if (
    humanVerification === HUMAN_VERIFICATION.NEEDS_REVIEW ||
    humanVerification === HUMAN_VERIFICATION.RE_VERIFICATION_REQUIRED
  ) {
    return 'REVIEW';
  }
  if (item.approvalStatus === APPROVAL_STATUS.APPROVED && item.obligationId) return 'VIEW_APPROVAL';
  return 'VERIFY';
}