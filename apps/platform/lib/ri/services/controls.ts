import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlatformRole } from '@/lib/roles';
import { assertRowInOrganisation } from '@/lib/ri/db-guard';
import { parseOptionalText, parseRequiredText } from '@/lib/ri/validation';
import { parseUuid } from '@/lib/ri/validation';
import { LAB_PROVENANCE_LOCKED_KEY } from '@/lib/ri/lab-api/change-create-provenance';
import { parseCreationModeField, resolveControlCreateMetadata } from '@/lib/ri/lab-api/risk-control-lab-provenance';
import { workflowMetadataForProvenance } from '@/lib/ri/record-provenance';
import { recordWorkflowEvent } from '@/lib/ri/workflow-events';

const LOCKED_METADATA_KEYS = new Set([
  'recordProvenance',
  'record_provenance',
  LAB_PROVENANCE_LOCKED_KEY,
  'labCreationMode',
  'labProvenanceRecordedAt',
  'labProvenanceRecordedByUserId',
  'parentRiskIds',
  'parentControlId',
]);

export async function listControls(supabase: SupabaseClient, organisationId: string) {
  const { data, error } = await supabase
    .from('controls')
    .select('id, name, control_type, effectiveness, testing_status, status, updated_at, metadata')
    .eq('organisation_id', organisationId)
    .order('name');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createControl(
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
  const riskIdRaw = raw.riskId ?? raw.risk_id;
  const riskId =
    riskIdRaw === null || riskIdRaw === undefined || riskIdRaw === ''
      ? null
      : parseUuid(riskIdRaw, 'risk_id');

  const creationMode = parseCreationModeField(raw.creationMode);
  const { metadata, recordProvenance, labClass } = await resolveControlCreateMetadata({
    supabase,
    organisationId: params.organisationId,
    actorUserId: params.userId,
    role: params.role,
    creationMode,
    riskId,
  });

  const { data, error } = await supabase
    .from('controls')
    .insert({
      organisation_id: params.organisationId,
      name: parseRequiredText(raw.name, 'name', 500),
      description: parseOptionalText(raw.description, 8000),
      owner_user_id: params.userId,
      control_type: parseOptionalText(raw.control_type, 200),
      frequency: parseOptionalText(raw.frequency, 200),
      nature: parseOptionalText(raw.nature, 200),
      execution_type: parseOptionalText(raw.execution_type, 200),
      effectiveness: parseOptionalText(raw.effectiveness, 200),
      testing_status: parseOptionalText(raw.testing_status, 200),
      status: parseOptionalText(raw.status, 50) ?? 'ACTIVE',
      metadata,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  const { count: existingCreatedEvents } = await supabase
    .from('workflow_events')
    .select('id', { count: 'exact', head: true })
    .eq('organisation_id', params.organisationId)
    .eq('entity_type', 'control')
    .eq('entity_id', data.id)
    .eq('event_type', 'CONTROL_CREATED');
  if (!existingCreatedEvents) {
    await recordWorkflowEvent(supabase, {
      organisationId: params.organisationId,
      entityType: 'control',
      entityId: data.id,
      eventType: 'CONTROL_CREATED',
      actorUserId: params.userId,
      toStatus: data.status as string,
      metadata: {
        ...workflowMetadataForProvenance(recordProvenance),
        organisationId: params.organisationId,
        controlId: data.id,
        labClass,
      },
    });
  }

  return data;
}

export async function getControlDetail(
  supabase: SupabaseClient,
  organisationId: string,
  controlId: string,
) {
  await assertRowInOrganisation(supabase, 'controls', controlId, organisationId);
  const { data, error } = await supabase
    .from('controls')
    .select('*')
    .eq('id', controlId)
    .eq('organisation_id', organisationId)
    .single();
  if (error) throw new Error(error.message);

  const [risks, obligations, evidence, findings, actions, assurance] = await Promise.all([
    supabase
      .from('risk_control_links')
      .select('risk:risks(id, title)')
      .eq('organisation_id', organisationId)
      .eq('control_id', controlId),
    supabase
      .from('obligation_control_links')
      .select('obligation:regulatory_obligations(id, obligation_statement)')
      .eq('organisation_id', organisationId)
      .eq('control_id', controlId),
    supabase
      .from('evidence_control_links')
      .select('evidence:evidence_items(id, title, evidence_type)')
      .eq('organisation_id', organisationId)
      .eq('control_id', controlId),
    supabase
      .from('finding_control_links')
      .select('finding:findings(id, title, severity, status)')
      .eq('organisation_id', organisationId)
      .eq('control_id', controlId),
    supabase
      .from('action_control_gap_links')
      .select('action:actions(id, title, status, due_date)')
      .eq('organisation_id', organisationId)
      .eq('control_id', controlId),
    supabase
      .from('assurance_review_control_links')
      .select('assurance:assurance_reviews(id, review_type, result, review_date)')
      .eq('organisation_id', organisationId)
      .eq('control_id', controlId),
  ]);

  const mapJoin = (rows: { [k: string]: unknown }[] | null, key: string) =>
    (rows ?? []).map((r) => (Array.isArray(r[key]) ? r[key][0] : r[key]));

  return {
    control: data,
    risks: mapJoin(risks.data as { risk: unknown }[], 'risk'),
    obligations: mapJoin(obligations.data as { obligation: unknown }[], 'obligation'),
    evidence: mapJoin(evidence.data as { evidence: unknown }[], 'evidence'),
    findings: mapJoin(findings.data as { finding: unknown }[], 'finding'),
    actions: mapJoin(actions.data as { action: unknown }[], 'action'),
    assurance: mapJoin(assurance.data as { assurance: unknown }[], 'assurance'),
  };
}

export async function updateControl(
  supabase: SupabaseClient,
  organisationId: string,
  controlId: string,
  fields: Record<string, unknown>,
  expectedUpdatedAt?: string | null,
) {
  await assertRowInOrganisation(supabase, 'controls', controlId, organisationId);
  for (const k of Object.keys(fields)) {
    if (LOCKED_METADATA_KEYS.has(k)) {
      throw new Error('provenance_locked');
    }
  }
  const { data: existing } = await supabase
    .from('controls')
    .select('updated_at, metadata')
    .eq('id', controlId)
    .single();
  if (expectedUpdatedAt && existing && new Date(existing.updated_at).getTime() !== new Date(expectedUpdatedAt).getTime()) {
    throw new Error('stale_record');
  }
  const update: Record<string, unknown> = {};
  for (const key of [
    'name',
    'description',
    'control_type',
    'frequency',
    'nature',
    'execution_type',
    'effectiveness',
    'testing_status',
    'status',
  ]) {
    if (key in fields) {
      update[key] =
        key === 'name'
          ? parseRequiredText(fields[key], 'name', 500)
          : parseOptionalText(fields[key], key === 'description' ? 8000 : 200);
    }
  }
  const { data, error } = await supabase
    .from('controls')
    .update(update)
    .eq('id', controlId)
    .eq('organisation_id', organisationId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}
