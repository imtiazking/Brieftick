import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlatformRole } from '@/lib/roles';
import {
  assertChangeCreateModeAllowed,
  recordProvenanceKindForCreateMode,
  type ChangeCreateMode,
} from '@/lib/ri/lab-api/change-create-provenance';
import {
  labChangeClassificationLabel,
  type ChangeLabClass,
} from '@/lib/ri/lab-api/change-lab-provenance';
import {
  classifyObligationForLab,
  obligationLabProvenanceInputFromRow,
} from '@/lib/ri/lab-api/obligation-lab-provenance';
import {
  classifyControlForLab,
  classifyRiskForLab,
  controlLabProvenanceInputFromRow,
  LAB_PARENT_REGULATORY_OBLIGATION_ID_KEY,
  LAB_PARENT_RISK_IDS_KEY,
  parseCreationModeField,
  recordKindForRiskControlLabClass,
  riskLabProvenanceInputFromRow,
  type RiskControlLabPartition,
} from '@/lib/ri/lab-api/risk-control-lab-provenance';
import {
  LAB_CREATION_MODE_KEY,
  LAB_PROVENANCE_LOCKED_KEY,
  LAB_PROVENANCE_RECORDED_AT_KEY,
  LAB_PROVENANCE_RECORDED_BY_KEY,
} from '@/lib/ri/lab-api/change-create-provenance';
import { RECORD_PROVENANCE_METADATA_KEY, type RecordProvenanceKind } from '@/lib/ri/record-provenance';
import type { LabDataScope } from '@/lib/ri/uat-record-provenance';
import { parseUuid } from '@/lib/ri/validation';

export function actionLabProvenanceInputFromRow(row: {
  metadata?: Record<string, unknown> | null;
}): { metadata?: Record<string, unknown> | null } {
  return { metadata: row.metadata ?? null };
}

function labClassFromMetadata(metadata: Record<string, unknown> | null | undefined): ChangeLabClass | null {
  if (!metadata || typeof metadata !== 'object') return null;
  if (metadata[LAB_PROVENANCE_LOCKED_KEY] !== true) return null;
  const mode = metadata[LAB_CREATION_MODE_KEY];
  if (mode === 'operational') return 'operational';
  if (mode === 'uat_authorised') return 'uat_authorised';
  const rp = metadata[RECORD_PROVENANCE_METADATA_KEY] ?? metadata.record_provenance;
  if (typeof rp === 'string') {
    if (rp === 'uat_authorised') return 'uat_authorised';
    if (rp === 'tenant_operational') return 'operational';
    if (rp === 'synthetic_uat') return 'synthetic_uat';
  }
  return null;
}

export function classifyActionForLab(row: { metadata?: Record<string, unknown> | null }): ChangeLabClass {
  const persisted = labClassFromMetadata(row.metadata);
  if (persisted) return persisted;
  return 'unverified';
}

export function partitionActionsForLabScope<T>(
  rows: T[],
  scope: LabDataScope,
  toInput: (row: T) => { metadata?: Record<string, unknown> | null },
): RiskControlLabPartition<T> {
  const operational: T[] = [];
  const authorisedUat: T[] = [];
  const unverified: T[] = [];
  const syntheticUat: T[] = [];
  for (const row of rows) {
    const cls = classifyActionForLab(toInput(row));
    if (cls === 'operational') operational.push(row);
    else if (cls === 'uat_authorised') authorisedUat.push(row);
    else if (cls === 'synthetic_uat') syntheticUat.push(row);
    else unverified.push(row);
  }
  const excludedFromOperationalCount =
    scope === 'operational' ? authorisedUat.length + unverified.length + syntheticUat.length : 0;
  return { operational, authorisedUat, unverified, syntheticUat, excludedFromOperationalCount };
}

export function recordKindForActionLabClass(cls: ChangeLabClass): RecordProvenanceKind {
  return recordKindForRiskControlLabClass(cls);
}

export { labChangeClassificationLabel };

export async function resolveActionCreateMetadata(params: {
  supabase: SupabaseClient;
  organisationId: string;
  actorUserId: string;
  role: PlatformRole;
  creationMode: ChangeCreateMode;
  obligationId: string | null;
  controlId: string | null;
  riskId: string | null;
}): Promise<{ metadata: Record<string, unknown>; labClass: ChangeLabClass; recordProvenance: RecordProvenanceKind }> {
  const recordedAt = new Date().toISOString();
  let anchorClass: ChangeLabClass | null = null;

  if (params.obligationId) {
    const { data: obl, error } = await params.supabase
      .from('regulatory_obligations')
      .select(
        `id, metadata, regulatory_change_id,
        change:regulatory_changes(id, metadata)`,
      )
      .eq('id', params.obligationId)
      .eq('organisation_id', params.organisationId)
      .single();
    if (error || !obl) throw new Error('not_found');
    const oblClass = classifyObligationForLab(obligationLabProvenanceInputFromRow(obl as never));
    if (oblClass !== 'operational' && oblClass !== 'uat_authorised') throw new Error('obligation_provenance_unverified');
    anchorClass = oblClass;
  }
  if (params.riskId) {
    const { data: risk, error } = await params.supabase
      .from('risks')
      .select('id, metadata')
      .eq('id', params.riskId)
      .eq('organisation_id', params.organisationId)
      .single();
    if (error || !risk) throw new Error('not_found');
    const riskClass = classifyRiskForLab(riskLabProvenanceInputFromRow(risk));
    if (riskClass !== 'operational' && riskClass !== 'uat_authorised') throw new Error('risk_provenance_unverified');
    if (anchorClass && anchorClass !== riskClass) throw new Error('provenance_link_mismatch');
    anchorClass = anchorClass ?? riskClass;
  }
  if (params.controlId) {
    const { data: control, error } = await params.supabase
      .from('controls')
      .select('id, metadata')
      .eq('id', params.controlId)
      .eq('organisation_id', params.organisationId)
      .single();
    if (error || !control) throw new Error('not_found');
    const controlClass = classifyControlForLab(controlLabProvenanceInputFromRow(control));
    if (controlClass !== 'operational' && controlClass !== 'uat_authorised') {
      throw new Error('control_provenance_unverified');
    }
    if (anchorClass && anchorClass !== controlClass) throw new Error('provenance_link_mismatch');
    anchorClass = anchorClass ?? controlClass;
  }

  assertChangeCreateModeAllowed(params.role, params.creationMode);
  const modeProv = recordProvenanceKindForCreateMode(params.creationMode);
  if (anchorClass) {
    const anchorProv = recordKindForActionLabClass(anchorClass);
    if (modeProv !== anchorProv) throw new Error('creation_mode_parent_mismatch');
  }

  const labClass: ChangeLabClass =
    anchorClass ?? (params.creationMode === 'operational' ? 'operational' : 'uat_authorised');
  const recordProvenance = recordKindForActionLabClass(labClass);
  const metadata: Record<string, unknown> = {
    [RECORD_PROVENANCE_METADATA_KEY]: recordProvenance,
    [LAB_PROVENANCE_LOCKED_KEY]: true,
    [LAB_PROVENANCE_RECORDED_AT_KEY]: recordedAt,
    [LAB_PROVENANCE_RECORDED_BY_KEY]: params.actorUserId,
    [LAB_CREATION_MODE_KEY]: params.creationMode,
  };
  if (params.obligationId) metadata[LAB_PARENT_REGULATORY_OBLIGATION_ID_KEY] = params.obligationId;
  if (params.riskId) metadata[LAB_PARENT_RISK_IDS_KEY] = [params.riskId];
  return { metadata, labClass, recordProvenance };
}

export function parseLabActionParentIds(raw: Record<string, unknown>) {
  const creationMode = parseCreationModeField(raw.creationMode);
  const obligationId =
    raw.obligationId === null || raw.obligationId === undefined || raw.obligationId === ''
      ? null
      : parseUuid(raw.obligationId, 'obligation_id');
  const controlId =
    raw.controlId === null || raw.controlId === undefined || raw.controlId === ''
      ? null
      : parseUuid(raw.controlId, 'control_id');
  const riskId =
    raw.riskId === null || raw.riskId === undefined || raw.riskId === ''
      ? null
      : parseUuid(raw.riskId, 'risk_id');
  return { creationMode, obligationId, controlId, riskId };
}
