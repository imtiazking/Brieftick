import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlatformRole } from '@/lib/roles';
import { assertRowInOrganisation } from '@/lib/ri/db-guard';
import { assertActiveOrganisationAssignee } from '@/lib/ri/organisation-assignee';
import { parseOptionalDate, parseOptionalText, parseRequiredText, parseUuid } from '@/lib/ri/validation';
import { LAB_PROVENANCE_LOCKED_KEY } from '@/lib/ri/lab-api/change-create-provenance';
import { parseCreationModeField, resolveRiskCreateMetadata } from '@/lib/ri/lab-api/risk-control-lab-provenance';
import { workflowMetadataForProvenance } from '@/lib/ri/record-provenance';
import { recordWorkflowEvent } from '@/lib/ri/workflow-events';

const LOCKED_METADATA_KEYS = new Set([
  'recordProvenance',
  'record_provenance',
  LAB_PROVENANCE_LOCKED_KEY,
  'labCreationMode',
  'labProvenanceRecordedAt',
  'labProvenanceRecordedByUserId',
  'parentRegulatoryObligationId',
  'parentRegulatoryChangeId',
  'parentRiskIds',
]);

export async function listRisks(supabase: SupabaseClient, organisationId: string) {
  const { data, error } = await supabase
    .from('risks')
    .select('id, title, category, inherent_risk, residual_risk, status, review_date, updated_at, metadata')
    .eq('organisation_id', organisationId)
    .order('title');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createRisk(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    userId: string;
    role: PlatformRole;
    fields: Record<string, unknown>;
  },
) {
  const raw = { ...params.fields };
  if ('metadata' in raw || 'recordProvenance' in raw) {
    throw new Error('client_provenance_rejected');
  }
  const regulatoryObligationIdRaw = raw.regulatoryObligationId ?? raw.regulatory_obligation_id;
  const regulatoryObligationId =
    regulatoryObligationIdRaw === null || regulatoryObligationIdRaw === undefined || regulatoryObligationIdRaw === ''
      ? null
      : parseUuid(regulatoryObligationIdRaw, 'regulatory_obligation_id');

  const creationMode = parseCreationModeField(raw.creationMode);
  const { metadata, recordProvenance, labClass } = await resolveRiskCreateMetadata({
    supabase,
    organisationId: params.organisationId,
    actorUserId: params.userId,
    role: params.role,
    creationMode,
    regulatoryObligationId,
  });

  const { data, error } = await supabase
    .from('risks')
    .insert({
      organisation_id: params.organisationId,
      title: parseRequiredText(raw.title, 'title', 500),
      description: parseOptionalText(raw.description, 8000),
      category: parseOptionalText(raw.category, 200),
      owner_user_id: params.userId,
      inherent_risk: parseOptionalText(raw.inherent_risk, 100),
      residual_risk: parseOptionalText(raw.residual_risk, 100),
      status: parseOptionalText(raw.status, 50) ?? 'OPEN',
      review_date: parseOptionalDate(raw.review_date),
      metadata,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  const { count: existingCreatedEvents } = await supabase
    .from('workflow_events')
    .select('id', { count: 'exact', head: true })
    .eq('organisation_id', params.organisationId)
    .eq('entity_type', 'risk')
    .eq('entity_id', data.id)
    .eq('event_type', 'RISK_CREATED');
  if (!existingCreatedEvents) {
    await recordWorkflowEvent(supabase, {
      organisationId: params.organisationId,
      entityType: 'risk',
      entityId: data.id,
      eventType: 'RISK_CREATED',
      actorUserId: params.userId,
      toStatus: data.status as string,
      metadata: {
        ...workflowMetadataForProvenance(recordProvenance),
        organisationId: params.organisationId,
        riskId: data.id,
        labClass,
      },
    });
  }

  return data;
}

export async function getRiskDetail(supabase: SupabaseClient, organisationId: string, riskId: string) {
  await assertRowInOrganisation(supabase, 'risks', riskId, organisationId);
  const { data, error } = await supabase
    .from('risks')
    .select('*')
    .eq('id', riskId)
    .eq('organisation_id', organisationId)
    .single();
  if (error) throw new Error(error.message);
  const { data: ob } = await supabase
    .from('obligation_risk_links')
    .select('obligation:regulatory_obligations(id, obligation_statement)')
    .eq('organisation_id', organisationId)
    .eq('risk_id', riskId);
  const { data: ctrl } = await supabase
    .from('risk_control_links')
    .select('control:controls(id, name)')
    .eq('organisation_id', organisationId)
    .eq('risk_id', riskId);
  return {
    risk: data,
    obligations: (ob ?? []).map((r) => (Array.isArray(r.obligation) ? r.obligation[0] : r.obligation)),
    controls: (ctrl ?? []).map((r) => (Array.isArray(r.control) ? r.control[0] : r.control)),
  };
}

export async function updateRisk(
  supabase: SupabaseClient,
  organisationId: string,
  riskId: string,
  fields: Record<string, unknown>,
  expectedUpdatedAt?: string | null,
) {
  await assertRowInOrganisation(supabase, 'risks', riskId, organisationId);
  for (const k of Object.keys(fields)) {
    if (LOCKED_METADATA_KEYS.has(k)) {
      throw new Error('provenance_locked');
    }
  }
  const { data: existing } = await supabase
    .from('risks')
    .select('updated_at, metadata')
    .eq('id', riskId)
    .single();
  if (expectedUpdatedAt && existing && new Date(existing.updated_at).getTime() !== new Date(expectedUpdatedAt).getTime()) {
    throw new Error('stale_record');
  }
  const update: Record<string, unknown> = {};
  if ('title' in fields) update.title = parseRequiredText(fields.title, 'title', 500);
  if ('description' in fields) update.description = parseOptionalText(fields.description, 8000);
  if ('category' in fields) update.category = parseOptionalText(fields.category, 200);
  if ('inherent_risk' in fields) update.inherent_risk = parseOptionalText(fields.inherent_risk, 100);
  if ('residual_risk' in fields) update.residual_risk = parseOptionalText(fields.residual_risk, 100);
  if ('status' in fields) update.status = parseOptionalText(fields.status, 50);
  if ('review_date' in fields) update.review_date = parseOptionalDate(fields.review_date);
  if ('owner_user_id' in fields) {
    const assignee = await assertActiveOrganisationAssignee(
      supabase,
      organisationId,
      String(fields.owner_user_id),
    );
    update.owner_user_id = assignee.clerkUserId;
  }
  const { data, error } = await supabase
    .from('risks')
    .update(update)
    .eq('id', riskId)
    .eq('organisation_id', organisationId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}
