import type { SupabaseClient } from '@supabase/supabase-js';
import { assertRowInOrganisation } from '@/lib/ri/db-guard';
import { recordWorkflowEvent, type WorkflowEventType } from '@/lib/ri/workflow-events';
import { parseUuid } from '@/lib/ri/validation';

type TenantEntityTable =
  | 'regulatory_obligations'
  | 'policies'
  | 'risks'
  | 'controls'
  | 'actions'
  | 'evidence_items'
  | 'findings'
  | 'assurance_reviews';

async function assertPair(
  supabase: SupabaseClient,
  organisationId: string,
  left: { table: TenantEntityTable; id: string },
  right: { table: TenantEntityTable; id: string },
) {
  const a = parseUuid(left.id, 'left_id');
  const b = parseUuid(right.id, 'right_id');
  await assertRowInOrganisation(supabase, left.table, a, organisationId);
  await assertRowInOrganisation(supabase, right.table, b, organisationId);
  return { a, b };
}

async function insertLink(
  supabase: SupabaseClient,
  table: string,
  row: Record<string, string>,
  event: {
    organisationId: string;
    entityType: string;
    entityId: string;
    eventType: WorkflowEventType;
    userId: string;
    metadata?: Record<string, unknown>;
  },
) {
  const { error } = await supabase.from(table).insert(row);
  if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);
  await recordWorkflowEvent(supabase, {
    organisationId: event.organisationId,
    entityType: event.entityType,
    entityId: event.entityId,
    eventType: event.eventType,
    actorUserId: event.userId,
    metadata: event.metadata,
  });
}

export async function linkObligationPolicy(
  supabase: SupabaseClient,
  organisationId: string,
  obligationId: string,
  policyId: string,
  userId: string,
) {
  const { a, b } = await assertPair(
    supabase,
    organisationId,
    { table: 'regulatory_obligations', id: obligationId },
    { table: 'policies', id: policyId },
  );
  await insertLink(
    supabase,
    'obligation_policy_links',
    { organisation_id: organisationId, obligation_id: a, policy_id: b },
    {
      organisationId,
      entityType: 'obligation_policy_link',
      entityId: a,
      eventType: 'POLICY_LINKED',
      userId,
      metadata: { policy_id: b },
    },
  );
}

export async function unlinkObligationPolicy(
  supabase: SupabaseClient,
  organisationId: string,
  obligationId: string,
  policyId: string,
) {
  const { error } = await supabase
    .from('obligation_policy_links')
    .delete()
    .eq('organisation_id', organisationId)
    .eq('obligation_id', obligationId)
    .eq('policy_id', policyId);
  if (error) throw new Error(error.message);
}

export async function linkObligationRisk(
  supabase: SupabaseClient,
  organisationId: string,
  obligationId: string,
  riskId: string,
  userId: string,
) {
  const { a, b } = await assertPair(
    supabase,
    organisationId,
    { table: 'regulatory_obligations', id: obligationId },
    { table: 'risks', id: riskId },
  );
  await insertLink(
    supabase,
    'obligation_risk_links',
    { organisation_id: organisationId, obligation_id: a, risk_id: b },
    {
      organisationId,
      entityType: 'obligation_risk_link',
      entityId: a,
      eventType: 'RISK_LINKED',
      userId,
      metadata: { risk_id: b },
    },
  );
}

export async function unlinkObligationRisk(
  supabase: SupabaseClient,
  organisationId: string,
  obligationId: string,
  riskId: string,
) {
  const { error } = await supabase
    .from('obligation_risk_links')
    .delete()
    .eq('organisation_id', organisationId)
    .eq('obligation_id', obligationId)
    .eq('risk_id', riskId);
  if (error) throw new Error(error.message);
}

export async function linkRiskControl(
  supabase: SupabaseClient,
  organisationId: string,
  riskId: string,
  controlId: string,
  userId: string,
) {
  const { a, b } = await assertPair(
    supabase,
    organisationId,
    { table: 'risks', id: riskId },
    { table: 'controls', id: controlId },
  );
  await insertLink(
    supabase,
    'risk_control_links',
    { organisation_id: organisationId, risk_id: a, control_id: b },
    {
      organisationId,
      entityType: 'risk_control_link',
      entityId: b,
      eventType: 'CONTROL_LINKED',
      userId,
      metadata: { risk_id: a },
    },
  );
}

export async function linkObligationControl(
  supabase: SupabaseClient,
  organisationId: string,
  obligationId: string,
  controlId: string,
  userId: string,
) {
  const { a, b } = await assertPair(
    supabase,
    organisationId,
    { table: 'regulatory_obligations', id: obligationId },
    { table: 'controls', id: controlId },
  );
  await insertLink(
    supabase,
    'obligation_control_links',
    { organisation_id: organisationId, obligation_id: a, control_id: b },
    {
      organisationId,
      entityType: 'obligation_control_link',
      entityId: b,
      eventType: 'CONTROL_LINKED',
      userId,
      metadata: { obligation_id: a },
    },
  );
}

export async function linkEvidenceObligation(
  supabase: SupabaseClient,
  organisationId: string,
  evidenceId: string,
  obligationId: string,
  userId: string,
) {
  const { a, b } = await assertPair(
    supabase,
    organisationId,
    { table: 'evidence_items', id: evidenceId },
    { table: 'regulatory_obligations', id: obligationId },
  );
  await insertLink(
    supabase,
    'evidence_obligation_links',
    { organisation_id: organisationId, evidence_id: a, obligation_id: b },
    {
      organisationId,
      entityType: 'evidence_obligation_link',
      entityId: a,
      eventType: 'EVIDENCE_LINKED',
      userId,
      metadata: { obligation_id: b, attribution: 'direct' },
    },
  );
}

export async function linkEvidenceControl(
  supabase: SupabaseClient,
  organisationId: string,
  evidenceId: string,
  controlId: string,
  userId: string,
) {
  const { a, b } = await assertPair(
    supabase,
    organisationId,
    { table: 'evidence_items', id: evidenceId },
    { table: 'controls', id: controlId },
  );
  await insertLink(
    supabase,
    'evidence_control_links',
    { organisation_id: organisationId, evidence_id: a, control_id: b },
    {
      organisationId,
      entityType: 'evidence_control_link',
      entityId: a,
      eventType: 'EVIDENCE_LINKED',
      userId,
      metadata: { control_id: b, attribution: 'control' },
    },
  );
}

export async function linkEvidenceAction(
  supabase: SupabaseClient,
  organisationId: string,
  evidenceId: string,
  actionId: string,
  userId: string,
) {
  const { a, b } = await assertPair(
    supabase,
    organisationId,
    { table: 'evidence_items', id: evidenceId },
    { table: 'actions', id: actionId },
  );
  await insertLink(
    supabase,
    'evidence_action_links',
    { organisation_id: organisationId, evidence_id: a, action_id: b },
    {
      organisationId,
      entityType: 'evidence_action_link',
      entityId: a,
      eventType: 'EVIDENCE_LINKED',
      userId,
      metadata: { action_id: b },
    },
  );
}

export async function linkFindingControl(
  supabase: SupabaseClient,
  organisationId: string,
  findingId: string,
  controlId: string,
  userId: string,
) {
  const { a, b } = await assertPair(
    supabase,
    organisationId,
    { table: 'findings', id: findingId },
    { table: 'controls', id: controlId },
  );
  await insertLink(
    supabase,
    'finding_control_links',
    { organisation_id: organisationId, finding_id: a, control_id: b },
    {
      organisationId,
      entityType: 'finding_control_link',
      entityId: a,
      eventType: 'FINDING_CREATED',
      userId,
      metadata: { control_id: b },
    },
  );
}

export async function linkFindingAction(
  supabase: SupabaseClient,
  organisationId: string,
  findingId: string,
  actionId: string,
  userId: string,
) {
  const { a, b } = await assertPair(
    supabase,
    organisationId,
    { table: 'findings', id: findingId },
    { table: 'actions', id: actionId },
  );
  await insertLink(
    supabase,
    'finding_action_links',
    { organisation_id: organisationId, finding_id: a, action_id: b },
    {
      organisationId,
      entityType: 'finding_action_link',
      entityId: a,
      eventType: 'FINDING_CREATED',
      userId,
      metadata: { action_id: b },
    },
  );
}

export async function linkAssuranceControl(
  supabase: SupabaseClient,
  organisationId: string,
  assuranceId: string,
  controlId: string,
  userId: string,
) {
  const { a, b } = await assertPair(
    supabase,
    organisationId,
    { table: 'assurance_reviews', id: assuranceId },
    { table: 'controls', id: controlId },
  );
  await insertLink(
    supabase,
    'assurance_review_control_links',
    { organisation_id: organisationId, assurance_review_id: a, control_id: b },
    {
      organisationId,
      entityType: 'assurance_review_control_link',
      entityId: a,
      eventType: 'ASSURANCE_COMPLETED',
      userId,
      metadata: { control_id: b },
    },
  );
}

export async function linkAssuranceObligation(
  supabase: SupabaseClient,
  organisationId: string,
  assuranceId: string,
  obligationId: string,
  userId: string,
) {
  const { a, b } = await assertPair(
    supabase,
    organisationId,
    { table: 'assurance_reviews', id: assuranceId },
    { table: 'regulatory_obligations', id: obligationId },
  );
  await insertLink(
    supabase,
    'assurance_review_obligation_links',
    { organisation_id: organisationId, assurance_review_id: a, obligation_id: b },
    {
      organisationId,
      entityType: 'assurance_review_obligation_link',
      entityId: a,
      eventType: 'ASSURANCE_COMPLETED',
      userId,
      metadata: { obligation_id: b },
    },
  );
}

export async function linkActionObligation(
  supabase: SupabaseClient,
  organisationId: string,
  actionId: string,
  obligationId: string,
  userId: string,
) {
  const { a, b } = await assertPair(
    supabase,
    organisationId,
    { table: 'actions', id: actionId },
    { table: 'regulatory_obligations', id: obligationId },
  );
  await insertLink(
    supabase,
    'action_obligation_links',
    { organisation_id: organisationId, action_id: a, obligation_id: b },
    {
      organisationId,
      entityType: 'action_obligation_link',
      entityId: a,
      eventType: 'ACTION_CREATED',
      userId,
      metadata: { obligation_id: b },
    },
  );
}
