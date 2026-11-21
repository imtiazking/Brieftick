import 'server-only';

import { AI_ERRORS } from '@/lib/ri/ai/errors';

const BLOCKED_AUTONOMOUS = new Set([
  'approve_applicability',
  'approve_change',
  'approve_obligation',
  'approve_assurance',
  'close_action',
  'close_finding',
  'alter_source_identity',
  'alter_org_membership',
  'create_canonical_relationship',
]);

export function assertNotAutonomousAiAction(action: string): void {
  if (BLOCKED_AUTONOMOUS.has(action)) {
    throw new Error(AI_ERRORS.AI_AUTONOMOUS_ACTION_BLOCKED);
  }
}

export const HUMAN_REVIEWED_DRAFT_MATERIALISATION = 'materialise_draft_obligation_after_human_review';

/**
 * Creating a DRAFT obligation from a finding a human reviewer explicitly accepted is not an approval:
 * the obligation still needs submission and independent approval. Anything else stays blocked.
 */
export function assertHumanReviewedDraftMaterialisation(params: {
  action: string;
  reviewerUserId: string | null | undefined;
  requestedByUserId: string | null | undefined;
  targetStatus: string;
}): void {
  if (
    params.action !== HUMAN_REVIEWED_DRAFT_MATERIALISATION ||
    !params.reviewerUserId ||
    params.targetStatus !== 'DRAFT'
  ) {
    throw new Error(AI_ERRORS.AI_AUTONOMOUS_ACTION_BLOCKED);
  }
  if (params.requestedByUserId && params.reviewerUserId === params.requestedByUserId) {
    throw new Error('segregation_of_duties');
  }
}
