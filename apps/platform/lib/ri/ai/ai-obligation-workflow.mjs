/**
 * Status workflow for AI-assisted obligations (origin = AI_ASSISTED). Manual obligations are not affected.
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
