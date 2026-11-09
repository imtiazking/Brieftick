import type { SupabaseClient } from '@supabase/supabase-js';
import { assertRowInOrganisation } from '@/lib/ri/db-guard';
import { recordWorkflowEvent, type WorkflowEventType } from '@/lib/ri/workflow-events';
import { parseUuid } from '@/lib/ri/validation';
import { workflowMetadataForProvenance, type RecordProvenanceKind } from '@/lib/ri/record-provenance';
import type { ChangeLabClass } from '@/lib/ri/lab-api/change-lab-provenance';
import { classifyObligationForLab, obligationLabProvenanceInputFromRow } from '@/lib/ri/lab-api/obligation-lab-provenance';
import {
  assuranceLabProvenanceInputFromRow,
  classifyAssuranceForLab,
  classifyControlForLab,
  classifyRiskForLab,
  controlLabProvenanceInputFromRow,
  riskLabProvenanceInputFromRow,
} from '@/lib/ri/lab-api/risk-control-lab-provenance';

export function assertLabClassesCompatibleForLink(a: ChangeLabClass, b: ChangeLabClass): void {
  if (a === 'operational' && b === 'operational') return;
  if (a === 'uat_authorised' && b === 'uat_authorised') return;
  if (a === 'synthetic_uat' && b === 'synthetic_uat') return;
  if (a === 'unverified' && b === 'unverified') return;
  throw new Error('provenance_link_mismatch');
}

function recordKindFromLabClass(cls: ChangeLabClass): RecordProvenanceKind {
  switch (cls) {
    case 'operational':
      return 'tenant_operational';
    case 'uat_authorised':
      return 'uat_authorised';
    case 'synthetic_uat':
      return 'synthetic_uat';
    default:
      return 'unverified';
  }
}

function linkEventMetadata(params: {
  leftKind: RecordProvenanceKind;
  rightKind: RecordProvenanceKind;
  leftLabClass: ChangeLabClass;
  rightLabClass: ChangeLabClass;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    ...workflowMetadataForProvenance(params.leftKind),
    linkProvenance: {
      left: params.leftKind,
      right: params.rightKind,
      leftLabClass: params.leftLabClass,
      rightLabClass: params.rightLabClass,
    },
    ...(params.extra ?? {}),
  };
}

async function recordDualEntityLinkEvents(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    userId: string;
    eventType: WorkflowEventType;
    left: { entityType: string; entityId: string; labClass: ChangeLabClass };
    right: { entityType: string; entityId: string; labClass: ChangeLabClass };
    baseExtra: Record<string, unknown>;
  },
) {
  const leftKind = recordKindFromLabClass(params.left.labClass);
  const rightKind = recordKindFromLabClass(params.right.labClass);
  await recordWorkflowEvent(supabase, {
    organisationId: params.organisationId,
    entityType: params.left.entityType,
    entityId: params.left.entityId,
    eventType: params.eventType,
    actorUserId: params.userId,
    metadata: linkEventMetadata({
      leftKind,
      rightKind,
      leftLabClass: params.left.labClass,
      rightLabClass: params.right.labClass,
      extra: { ...params.baseExtra, linkedEntityType: params.right.entityType, linkedEntityId: params.right.entityId },
    }),
  });
  await recordWorkflowEvent(supabase, {
    organisationId: params.organisationId,
    entityType: params.right.entityType,
    entityId: params.right.entityId,
    eventType: params.eventType,
    actorUserId: params.userId,
    metadata: linkEventMetadata({
      leftKind,
      rightKind,
      leftLabClass: params.left.labClass,
      rightLabClass: params.right.labClass,
      extra: { ...params.baseExtra, linkedEntityType: params.left.entityType, linkedEntityId: params.left.entityId },
    }),
  });
}

type TenantEntityTable =
  | 'regulatory_obligations'
  | 'regulatory_changes'
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

async function insertLinkRow(supabase: SupabaseClient, table: string, row: Record<string, string>) {
  const { error } = await supabase.from(table).insert(row);
  if (error) {
    if (/duplicate|unique/i.test(error.message)) return false;
    throw new Error(error.message);
  }
  return true;
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
  } | null,
) {
  const inserted = await insertLinkRow(supabase, table, row);
  if (!inserted) return;
  if (event) {
    await recordWorkflowEvent(supabase, {
      organisationId: event.organisationId,
      entityType: event.entityType,
      entityId: event.entityId,
      eventType: event.eventType,
      actorUserId: event.userId,
      metadata: event.metadata,
    });
  }
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
  const [{ data: oblRow }, { data: riskRow }] = await Promise.all([
    supabase
      .from('regulatory_obligations')
      .select('id, metadata, regulatory_change_id, change:regulatory_changes(id, title, description, external_key, origin, publication_id, metadata)')
      .eq('id', a)
      .eq('organisation_id', organisationId)
      .single(),
    supabase.from('risks').select('id, metadata').eq('id', b).eq('organisation_id', organisationId).single(),
  ]);
  if (!oblRow || !riskRow) throw new Error('not_found');
  const ch = Array.isArray(oblRow.change) ? oblRow.change[0] : oblRow.change;
  const oblClass = classifyObligationForLab(
    obligationLabProvenanceInputFromRow({ ...oblRow, change: ch ?? null } as never),
  );
  const riskClass = classifyRiskForLab(riskLabProvenanceInputFromRow(riskRow));
  assertLabClassesCompatibleForLink(oblClass, riskClass);

  const inserted = await insertLinkRow(supabase, 'obligation_risk_links', {
    organisation_id: organisationId,
    obligation_id: a,
    risk_id: b,
  });
  if (!inserted) return;
  await recordDualEntityLinkEvents(supabase, {
    organisationId,
    userId,
    eventType: 'RISK_LINKED',
    left: { entityType: 'regulatory_obligation', entityId: a, labClass: oblClass },
    right: { entityType: 'risk', entityId: b, labClass: riskClass },
    baseExtra: { obligation_id: a, risk_id: b },
  });
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
  const [{ data: riskRow }, { data: ctrlRow }] = await Promise.all([
    supabase.from('risks').select('id, metadata').eq('id', a).eq('organisation_id', organisationId).single(),
    supabase.from('controls').select('id, metadata').eq('id', b).eq('organisation_id', organisationId).single(),
  ]);
  if (!riskRow || !ctrlRow) throw new Error('not_found');
  const riskClass = classifyRiskForLab(riskLabProvenanceInputFromRow(riskRow));
  const ctrlClass = classifyControlForLab(controlLabProvenanceInputFromRow(ctrlRow));
  assertLabClassesCompatibleForLink(riskClass, ctrlClass);

  const inserted = await insertLinkRow(supabase, 'risk_control_links', {
    organisation_id: organisationId,
    risk_id: a,
    control_id: b,
  });
  if (!inserted) return;
  await recordDualEntityLinkEvents(supabase, {
    organisationId,
    userId,
    eventType: 'CONTROL_LINKED',
    left: { entityType: 'risk', entityId: a, labClass: riskClass },
    right: { entityType: 'control', entityId: b, labClass: ctrlClass },
    baseExtra: { risk_id: a, control_id: b },
  });
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
  const [{ data: oblRow }, { data: ctrlRow }] = await Promise.all([
    supabase
      .from('regulatory_obligations')
      .select('id, metadata, regulatory_change_id, change:regulatory_changes(id, title, description, external_key, origin, publication_id, metadata)')
      .eq('id', a)
      .eq('organisation_id', organisationId)
      .single(),
    supabase.from('controls').select('id, metadata').eq('id', b).eq('organisation_id', organisationId).single(),
  ]);
  if (!oblRow || !ctrlRow) throw new Error('not_found');
  const ch = Array.isArray(oblRow.change) ? oblRow.change[0] : oblRow.change;
  const oblClass = classifyObligationForLab(
    obligationLabProvenanceInputFromRow({ ...oblRow, change: ch ?? null } as never),
  );
  const ctrlClass = classifyControlForLab(controlLabProvenanceInputFromRow(ctrlRow));
  assertLabClassesCompatibleForLink(oblClass, ctrlClass);

  const inserted = await insertLinkRow(supabase, 'obligation_control_links', {
    organisation_id: organisationId,
    obligation_id: a,
    control_id: b,
  });
  if (!inserted) return;
  await recordDualEntityLinkEvents(supabase, {
    organisationId,
    userId,
    eventType: 'CONTROL_LINKED',
    left: { entityType: 'regulatory_obligation', entityId: a, labClass: oblClass },
    right: { entityType: 'control', entityId: b, labClass: ctrlClass },
    baseExtra: { obligation_id: a, control_id: b },
  });
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
  const [{ data: evRow }, { data: oblRow }] = await Promise.all([
    supabase.from('evidence_items').select('id, metadata').eq('id', a).eq('organisation_id', organisationId).single(),
    supabase
      .from('regulatory_obligations')
      .select('id, metadata, regulatory_change_id, change:regulatory_changes(id, title, description, external_key, origin, publication_id, metadata)')
      .eq('id', b)
      .eq('organisation_id', organisationId)
      .single(),
  ]);
  if (!evRow || !oblRow) throw new Error('not_found');
  const ch = Array.isArray(oblRow.change) ? oblRow.change[0] : oblRow.change;
  const evClass = classifyRiskForLab(riskLabProvenanceInputFromRow(evRow));
  const oblClass = classifyObligationForLab(
    obligationLabProvenanceInputFromRow({ ...oblRow, change: ch ?? null } as never),
  );
  assertLabClassesCompatibleForLink(evClass, oblClass);

  const inserted = await insertLinkRow(supabase, 'evidence_obligation_links', {
    organisation_id: organisationId,
    evidence_id: a,
    obligation_id: b,
  });
  if (!inserted) return;
  await recordDualEntityLinkEvents(supabase, {
    organisationId,
    userId,
    eventType: 'EVIDENCE_LINKED',
    left: { entityType: 'evidence_item', entityId: a, labClass: evClass },
    right: { entityType: 'regulatory_obligation', entityId: b, labClass: oblClass },
    baseExtra: { evidence_id: a, obligation_id: b, attribution: 'direct' },
  });
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
  const [{ data: evRow }, { data: ctrlRow }] = await Promise.all([
    supabase.from('evidence_items').select('id, metadata').eq('id', a).eq('organisation_id', organisationId).single(),
    supabase.from('controls').select('id, metadata').eq('id', b).eq('organisation_id', organisationId).single(),
  ]);
  if (!evRow || !ctrlRow) throw new Error('not_found');
  const evClass = classifyRiskForLab(riskLabProvenanceInputFromRow(evRow));
  const ctrlClass = classifyControlForLab(controlLabProvenanceInputFromRow(ctrlRow));
  assertLabClassesCompatibleForLink(evClass, ctrlClass);

  const inserted = await insertLinkRow(supabase, 'evidence_control_links', {
    organisation_id: organisationId,
    evidence_id: a,
    control_id: b,
  });
  if (!inserted) return;
  await recordDualEntityLinkEvents(supabase, {
    organisationId,
    userId,
    eventType: 'EVIDENCE_LINKED',
    left: { entityType: 'evidence_item', entityId: a, labClass: evClass },
    right: { entityType: 'control', entityId: b, labClass: ctrlClass },
    baseExtra: { evidence_id: a, control_id: b, attribution: 'control' },
  });
}

export async function linkEvidenceRegulatoryChange(
  supabase: SupabaseClient,
  organisationId: string,
  evidenceId: string,
  regulatoryChangeId: string,
  userId: string,
) {
  const { a, b } = await assertPair(
    supabase,
    organisationId,
    { table: 'evidence_items', id: evidenceId },
    { table: 'regulatory_changes', id: regulatoryChangeId },
  );
  await insertLink(
    supabase,
    'evidence_regulatory_change_links',
    { organisation_id: organisationId, evidence_id: a, regulatory_change_id: b },
    {
      organisationId,
      entityType: 'evidence_regulatory_change_link',
      entityId: a,
      eventType: 'EVIDENCE_LINKED',
      userId,
      metadata: { regulatory_change_id: b },
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
  const [{ data: arRow }, { data: ctrlRow }] = await Promise.all([
    supabase.from('assurance_reviews').select('id, metadata').eq('id', a).eq('organisation_id', organisationId).single(),
    supabase.from('controls').select('id, metadata').eq('id', b).eq('organisation_id', organisationId).single(),
  ]);
  if (!arRow || !ctrlRow) throw new Error('not_found');
  const arClass = classifyAssuranceForLab(assuranceLabProvenanceInputFromRow(arRow));
  const ctrlClass = classifyControlForLab(controlLabProvenanceInputFromRow(ctrlRow));
  assertLabClassesCompatibleForLink(arClass, ctrlClass);

  const inserted = await insertLinkRow(supabase, 'assurance_review_control_links', {
    organisation_id: organisationId,
    assurance_review_id: a,
    control_id: b,
  });
  if (!inserted) return;
  await recordDualEntityLinkEvents(supabase, {
    organisationId,
    userId,
    eventType: 'ASSURANCE_COMPLETED',
    left: { entityType: 'assurance_review', entityId: a, labClass: arClass },
    right: { entityType: 'control', entityId: b, labClass: ctrlClass },
    baseExtra: { assurance_review_id: a, control_id: b },
  });
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
