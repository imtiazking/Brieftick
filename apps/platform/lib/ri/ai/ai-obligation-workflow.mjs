/**
 * Status workflow for AI-assisted obligations (origin = AI_ASSISTED) and classified manual obligations
 * (created under a regulatory classification policy). Unclassified legacy manual obligations are not affected.
 *
 * DRAFT → IN_REVIEW      submitted by the accepting Compliance Manager (or another member)
 * IN_REVIEW → DRAFT      returned for rework
 * IN_REVIEW → OPEN       independent checker: obligation:review role, and not the AI run requester,
 *                        the AI output acceptor, or the person who submitted it for approval
 * OPEN onwards           existing register lifecycle
 */

export const AI_OBLIGATION_WORKFLOW_ERRORS = Object.freeze({
  INVALID_TRANSITION: 'ai_obligation_invalid_transition',
  REVIEW_ROLE_REQUIRED: 'ai_obligation_review_role_required',
});

const PRE_APPROVAL_TRANSITIONS = {
  DRAFT: new Set(['DRAFT', 'IN_REVIEW']),
  IN_REVIEW: new Set(['IN_REVIEW', 'DRAFT', 'OPEN']),
};

/**
 * @param {{
 *   from: string,
 *   to: string,
 *   actorUserId: string,
 *   actorCanReview: boolean,
 *   requestedByUserId?: string | null,
 *   acceptedByUserId?: string | null,
 *   submittedByUserId?: string | null,
 * }} p
 * @returns {{ ok: true } | { ok: false, code: string }}
 */
export function assessAiObligationTransition(p) {
  const allowed = PRE_APPROVAL_TRANSITIONS[p.from];
  if (!allowed) return { ok: true };
  if (!allowed.has(p.to)) return { ok: false, code: AI_OBLIGATION_WORKFLOW_ERRORS.INVALID_TRANSITION };
  if (p.to !== 'OPEN') return { ok: true };

  if (!p.actorCanReview) return { ok: false, code: AI_OBLIGATION_WORKFLOW_ERRORS.REVIEW_ROLE_REQUIRED };
  const makers = [p.requestedByUserId, p.acceptedByUserId, p.submittedByUserId].filter(Boolean);
  if (makers.includes(p.actorUserId)) return { ok: false, code: 'segregation_of_duties' };
  return { ok: true };
}

const REVIEW_DECISION_STATUSES = new Set(['OPEN', 'DRAFT']);

/**
 * A review decision is a status-only change on a submitted AI-assisted obligation: approve (IN_REVIEW → OPEN)
 * or return for rework (IN_REVIEW → DRAFT). It is the only obligation change open to obligation:review
 * without obligation:write; the independence rules above still apply to the approval.
 *
 * Classified manual obligations (`governed`) follow the same approval workflow.
 *
 * @param {{ fieldKeys: string[], origin?: string | null, governed?: boolean, from: string, to: unknown }} p
 */
export function isAiObligationReviewDecision(p) {
  return (
    p.fieldKeys.length === 1 &&
    p.fieldKeys[0] === 'status' &&
    (p.origin === 'AI_ASSISTED' || p.governed === true) &&
    p.from === 'IN_REVIEW' &&
    typeof p.to === 'string' &&
    REVIEW_DECISION_STATUSES.has(p.to)
  );
}
