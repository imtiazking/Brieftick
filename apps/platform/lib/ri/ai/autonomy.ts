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
