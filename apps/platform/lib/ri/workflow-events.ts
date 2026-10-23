import type { SupabaseClient } from '@supabase/supabase-js';

export const WORKFLOW_EVENT_TYPES = [
  'TRIAGE_STATUS_CHANGED',
  'APPLICABILITY_DECIDED',
  'CHANGE_CREATED',
  'CHANGE_STATUS_CHANGED',
  'IMPACT_SUBMITTED',
  'IMPACT_APPROVED',
  'IMPACT_REJECTED',
  'OBLIGATION_CREATED',
  'OBLIGATION_STATUS_CHANGED',
  'POLICY_LINKED',
  'RISK_LINKED',
  'CONTROL_LINKED',
  'ACTION_CREATED',
  'ACTION_ASSIGNED',
  'ACTION_STATUS_CHANGED',
  'EVIDENCE_LINKED',
  'FINDING_CREATED',
  'FINDING_STATUS_CHANGED',
  'ASSURANCE_COMPLETED',
  'AI_ANALYSIS_REQUESTED',
  'AI_ANALYSIS_COMPLETED',
  'AI_ANALYSIS_FAILED',
  'AI_REVIEW_ACCEPTED',
  'AI_REVIEW_PARTIALLY_ACCEPTED',
  'AI_REVIEW_REJECTED',
  'AI_ANALYSIS_SUPERSEDED',
] as const;

export type WorkflowEventType = (typeof WORKFLOW_EVENT_TYPES)[number];

export async function recordWorkflowEvent(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    entityType: string;
    entityId: string;
    eventType: WorkflowEventType;
    actorUserId: string | null;
    fromStatus?: string | null;
    toStatus?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  const { error } = await supabase.from('workflow_events').insert({
    organisation_id: params.organisationId,
    entity_type: params.entityType,
    entity_id: params.entityId,
    event_type: params.eventType,
    from_status: params.fromStatus ?? null,
    to_status: params.toStatus ?? null,
    actor_user_id: params.actorUserId,
    metadata: params.metadata ?? {},
  });
  if (error) throw new Error(error.message);
}
