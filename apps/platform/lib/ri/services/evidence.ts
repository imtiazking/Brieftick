import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlatformRole } from '@/lib/roles';
import { assertRowInOrganisation } from '@/lib/ri/db-guard';
import { parseOptionalText, parseRequiredText, parseUuid } from '@/lib/ri/validation';
import { LAB_PROVENANCE_LOCKED_KEY } from '@/lib/ri/lab-api/change-create-provenance';
import { parseCreationModeField, resolveEvidenceCreateMetadata } from '@/lib/ri/lab-api/risk-control-lab-provenance';

const LOCKED_METADATA_KEYS = new Set([
  'recordProvenance',
  'record_provenance',
  LAB_PROVENANCE_LOCKED_KEY,
  'labCreationMode',
  'labProvenanceRecordedAt',
  'labProvenanceRecordedByUserId',
  'parentControlId',
]);

export async function listEvidence(supabase: SupabaseClient, organisationId: string) {
  const { data, error } = await supabase
    .from('evidence_items')
    .select('id, title, evidence_type, source_hash, created_at, metadata')
    .eq('organisation_id', organisationId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createEvidence(
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
  const controlIdRaw = raw.controlId ?? raw.control_id;
  const controlId =
    controlIdRaw === null || controlIdRaw === undefined || controlIdRaw === ''
      ? null
      : parseUuid(controlIdRaw, 'control_id');

  const creationMode = parseCreationModeField(raw.creationMode);
  const { metadata } = await resolveEvidenceCreateMetadata({
    supabase,
    organisationId: params.organisationId,
    actorUserId: params.userId,
    role: params.role,
    creationMode,
    controlId,
  });

  const { data, error } = await supabase
    .from('evidence_items')
    .insert({
      organisation_id: params.organisationId,
      title: parseRequiredText(raw.title, 'title', 500),
      evidence_type: parseRequiredText(raw.evidence_type, 'evidence_type', 200),
      description: parseOptionalText(raw.description, 8000),
      source_url: parseOptionalText(raw.source_url, 2000),
      source_hash: parseOptionalText(raw.source_hash, 200),
      uploaded_by: params.userId,
      metadata,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getEvidenceDetail(
  supabase: SupabaseClient,
  organisationId: string,
  evidenceId: string,
) {
  await assertRowInOrganisation(supabase, 'evidence_items', evidenceId, organisationId);
  const { data, error } = await supabase
    .from('evidence_items')
    .select('*')
    .eq('id', evidenceId)
    .eq('organisation_id', organisationId)
    .single();
  if (error) throw new Error(error.message);
  const [ob, ctrl, act] = await Promise.all([
    supabase
      .from('evidence_obligation_links')
      .select('obligation:regulatory_obligations(id, obligation_statement)')
      .eq('organisation_id', organisationId)
      .eq('evidence_id', evidenceId),
    supabase
      .from('evidence_control_links')
      .select('control:controls(id, name)')
      .eq('organisation_id', organisationId)
      .eq('evidence_id', evidenceId),
    supabase
      .from('evidence_action_links')
      .select('action:actions(id, title)')
      .eq('organisation_id', organisationId)
      .eq('evidence_id', evidenceId),
  ]);
  const changes = await supabase
    .from('evidence_regulatory_change_links')
    .select('change:regulatory_changes(id, title)')
    .eq('organisation_id', organisationId)
    .eq('evidence_id', evidenceId);

  const versions = await supabase
    .from('evidence_versions')
    .select('id, version_number, content_type, byte_size, source_hash, uploaded_by, created_at')
    .eq('organisation_id', organisationId)
    .eq('evidence_id', evidenceId)
    .order('version_number', { ascending: false });

  return {
    evidence: data,
    obligations: (ob.data ?? []).map((r) => (Array.isArray(r.obligation) ? r.obligation[0] : r.obligation)),
    controls: (ctrl.data ?? []).map((r) => (Array.isArray(r.control) ? r.control[0] : r.control)),
    actions: (act.data ?? []).map((r) => (Array.isArray(r.action) ? r.action[0] : r.action)),
    changes: (changes.data ?? []).map((r) => (Array.isArray(r.change) ? r.change[0] : r.change)),
    versions: versions.data ?? [],
  };
}

export async function updateEvidence(
  supabase: SupabaseClient,
  organisationId: string,
  evidenceId: string,
  fields: Record<string, unknown>,
) {
  await assertRowInOrganisation(supabase, 'evidence_items', evidenceId, organisationId);
  for (const k of Object.keys(fields)) {
    if (LOCKED_METADATA_KEYS.has(k)) {
      throw new Error('provenance_locked');
    }
  }
  const update: Record<string, unknown> = {};
  if ('title' in fields) update.title = parseRequiredText(fields.title, 'title', 500);
  if ('description' in fields) update.description = parseOptionalText(fields.description, 8000);
  if ('evidence_type' in fields) update.evidence_type = parseRequiredText(fields.evidence_type, 'evidence_type', 200);
  if ('source_url' in fields) update.source_url = parseOptionalText(fields.source_url, 2000);
  if ('source_hash' in fields) update.source_hash = parseOptionalText(fields.source_hash, 200);
  const { data, error } = await supabase
    .from('evidence_items')
    .update(update)
    .eq('id', evidenceId)
    .eq('organisation_id', organisationId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}
