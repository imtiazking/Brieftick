import type { SupabaseClient } from '@supabase/supabase-js';

export const WORKFLOW_EVENT_TYPES = [
  'TRIAGE_STATUS_CHANGED',
  'APPLICABILITY_DECIDED',
  'APPLICABILITY_SUBMITTED',
  'APPLICABILITY_APPROVED',
  'APPLICABILITY_REJECTED',
  'CHANGE_CREATED',
  'CHANGE_STATUS_CHANGED',
  'CHANGE_OWNER_ASSIGNED',
  'CHANGE_FIELDS_UPDATED',
  'IMPACT_CREATED',
  'IMPACT_SUBMITTED',
  'IMPACT_APPROVED',
  'IMPACT_REJECTED',
  'IMPACT_OWNER_ASSIGNED',
  'ADMINISTRATIVE_CORRECTION',
  'OBLIGATION_CREATED',
  'OBLIGATION_STATUS_CHANGED',
  'OBLIGATION_OWNER_ASSIGNED',
  'POLICY_LINKED',
  'POLICY_CREATED',
  'POLICY_STATUS_CHANGED',
  'POLICY_VERSION_UPDATED',
  'RISK_CREATED',
  'CONTROL_CREATED',
  'RISK_LINKED',
  'CONTROL_LINKED',
  'ACTION_CREATED',
  'ACTION_ASSIGNED',
  'ACTION_STATUS_CHANGED',
  'EVIDENCE_LINKED',
  'EVIDENCE_VERSION_UPLOADED',
  'EVIDENCE_PREVIEWED',
  'EVIDENCE_DOWNLOADED',
  'FINDING_CREATED',
  'FINDING_STATUS_CHANGED',
  'ASSURANCE_REVIEW_CREATED',
  'ASSURANCE_RESULT_CHANGED',
  'ASSURANCE_CONTROL_LINKED',
  'ASSURANCE_OBLIGATION_LINKED',
  'ASSURANCE_COMPLETED',
  'AI_ANALYSIS_REQUESTED',
  'AI_ANALYSIS_COMPLETED',
  'AI_ANALYSIS_FAILED',
  'AI_REVIEW_ACCEPTED',
  'AI_REVIEW_PARTIALLY_ACCEPTED',
  'AI_REVIEW_REJECTED',
  'AI_ANALYSIS_SUPERSEDED',
  'AI_CHANGE_MATERIALISED',
  'AI_OBLIGATION_MATERIALISED',
  'ASK_RI_QUERY_COMPLETED',
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
