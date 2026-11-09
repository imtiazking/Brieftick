import 'server-only';

import type { PlatformRole } from '@/lib/roles';
import {
  LAB_CREATION_MODE_KEY,
  LAB_PROVENANCE_LOCKED_KEY,
  LAB_PROVENANCE_RECORDED_AT_KEY,
  LAB_PROVENANCE_RECORDED_BY_KEY,
} from '@/lib/ri/lab-api/change-create-provenance';
import {
  assertChangeCreateModeAllowed,
  parseChangeCreateMode,
  recordProvenanceKindForCreateMode,
  type ChangeCreateMode,
} from '@/lib/ri/lab-api/change-create-provenance';
import {
  labChangeClassificationLabel,
  recordKindForChangeLabClass,
  type ChangeLabClass,
} from '@/lib/ri/lab-api/change-lab-provenance';
import {
  classifyObligationForLab,
  obligationLabProvenanceInputFromRow,
} from '@/lib/ri/lab-api/obligation-lab-provenance';
import { RECORD_PROVENANCE_METADATA_KEY, type RecordProvenanceKind } from '@/lib/ri/record-provenance';
import type { LabDataScope } from '@/lib/ri/uat-record-provenance';

/** Lineage — parent obligation when risk created from obligation context. */
export const LAB_PARENT_REGULATORY_OBLIGATION_ID_KEY = 'parentRegulatoryObligationId';
/** Lineage — optional parent regulatory change (operational / journey). */
export const LAB_PARENT_REGULATORY_CHANGE_ID_KEY = 'parentRegulatoryChangeId';
/** Lineage — parent risk(s); primary for control created from risk workflow. */
export const LAB_PARENT_RISK_IDS_KEY = 'parentRiskIds';

export type RiskControlLabProvenanceInput = {
  metadata?: Record<string, unknown> | null;
  parentObligation?: {
    metadata?: Record<string, unknown> | null;
    change?: Parameters<typeof obligationLabProvenanceInputFromRow>[0]['change'];
  } | null;
  parentRisk?: { metadata?: Record<string, unknown> | null } | null;
};

function labClassFromLockedMetadata(metadata: Record<string, unknown> | null | undefined): ChangeLabClass | null {
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

export function classifyRiskForLab(input: RiskControlLabProvenanceInput): ChangeLabClass {
  const persisted = labClassFromLockedMetadata(input.metadata);
  if (persisted) return persisted;
  if (input.parentObligation) {
    return classifyObligationForLab(obligationLabProvenanceInputFromRow(input.parentObligation as never));
  }
  return 'unverified';
}

export function classifyControlForLab(input: RiskControlLabProvenanceInput): ChangeLabClass {
  const persisted = labClassFromLockedMetadata(input.metadata);
  if (persisted) return persisted;
  if (input.parentRisk?.metadata) {
    const rc: RiskControlLabProvenanceInput = { metadata: input.parentRisk.metadata };
    const inner = labClassFromLockedMetadata(rc.metadata);
    if (inner) return inner;
  }
  return 'unverified';
}

export type RiskControlLabPartition<T> = {
  operational: T[];
  authorisedUat: T[];
  unverified: T[];
  syntheticUat: T[];
  excludedFromOperationalCount: number;
};

export function riskLabProvenanceInputFromRow(row: {
  metadata?: Record<string, unknown> | null;
}): RiskControlLabProvenanceInput {
  return { metadata: row.metadata ?? null, parentObligation: null };
}

export function controlLabProvenanceInputFromRow(row: {
  metadata?: Record<string, unknown> | null;
}): RiskControlLabProvenanceInput {
  return { metadata: row.metadata ?? null, parentRisk: null };
}

export function partitionRisksForLabScope<T>(
  rows: T[],
  scope: LabDataScope,
  toInput: (row: T) => RiskControlLabProvenanceInput,
): RiskControlLabPartition<T> {
  const operational: T[] = [];
  const authorisedUat: T[] = [];
  const unverified: T[] = [];
  const syntheticUat: T[] = [];
  for (const row of rows) {
    const cls = classifyRiskForLab(toInput(row));
    if (cls === 'operational') operational.push(row);
    else if (cls === 'uat_authorised') authorisedUat.push(row);
    else if (cls === 'synthetic_uat') syntheticUat.push(row);
    else unverified.push(row);
  }
  const excludedFromOperationalCount =
    scope === 'operational' ? authorisedUat.length + unverified.length + syntheticUat.length : 0;
  return { operational, authorisedUat, unverified, syntheticUat, excludedFromOperationalCount };
}

export function partitionControlsForLabScope<T>(
  rows: T[],
  scope: LabDataScope,
  toInput: (row: T) => RiskControlLabProvenanceInput,
): RiskControlLabPartition<T> {
  const operational: T[] = [];
  const authorisedUat: T[] = [];
  const unverified: T[] = [];
  const syntheticUat: T[] = [];
  for (const row of rows) {
    const cls = classifyControlForLab(toInput(row));
    if (cls === 'operational') operational.push(row);
    else if (cls === 'uat_authorised') authorisedUat.push(row);
    else if (cls === 'synthetic_uat') syntheticUat.push(row);
    else unverified.push(row);
  }
  const excludedFromOperationalCount =
    scope === 'operational' ? authorisedUat.length + unverified.length + syntheticUat.length : 0;
  return { operational, authorisedUat, unverified, syntheticUat, excludedFromOperationalCount };
}

export function partitionEvidenceForLabScope<T>(
  rows: T[],
  scope: LabDataScope,
  toInput: (row: T) => RiskControlLabProvenanceInput,
): RiskControlLabPartition<T> {
  return partitionRisksForLabScope(rows, scope, toInput);
}

export function partitionFindingsForLabScope<T>(
  rows: T[],
  scope: LabDataScope,
  toInput: (row: T) => RiskControlLabProvenanceInput,
): RiskControlLabPartition<T> {
  return partitionRisksForLabScope(rows, scope, toInput);
}

export function recordKindForRiskControlLabClass(cls: ChangeLabClass): RecordProvenanceKind {
  return recordKindForChangeLabClass(cls);
}

export { labChangeClassificationLabel };

export async function resolveRiskCreateMetadata(params: {
  supabase: import('@supabase/supabase-js').SupabaseClient;
  organisationId: string;
  actorUserId: string;
  role: PlatformRole;
  creationMode: ChangeCreateMode;
  regulatoryObligationId: string | null;
}): Promise<{ metadata: Record<string, unknown>; labClass: ChangeLabClass; recordProvenance: RecordProvenanceKind }> {
  const recordedAt = new Date().toISOString();
  if (params.regulatoryObligationId) {
    const { data: obl, error } = await params.supabase
      .from('regulatory_obligations')
      .select(
        `id, metadata, regulatory_change_id,
        change:regulatory_changes(id, title, description, external_key, origin, publication_id, metadata)`,
      )
      .eq('id', params.regulatoryObligationId)
      .eq('organisation_id', params.organisationId)
      .single();
    if (error || !obl) throw new Error('not_found');
    const oblClass = classifyObligationForLab(obligationLabProvenanceInputFromRow(obl as never));
    const oblProv = recordKindForRiskControlLabClass(oblClass);
    const ch = Array.isArray(obl.change) ? obl.change[0] : obl.change;
    const recordProvenance = oblProv;
    const labClass = oblClass;
    if (oblClass !== 'operational' && oblClass !== 'uat_authorised') {
      throw new Error('obligation_provenance_unverified');
    }
    assertChangeCreateModeAllowed(params.role, params.creationMode);
    const modeProv = recordProvenanceKindForCreateMode(params.creationMode);
    if (modeProv !== recordProvenance) {
      throw new Error('creation_mode_parent_mismatch');
    }
    const metadata: Record<string, unknown> = {
      [RECORD_PROVENANCE_METADATA_KEY]: recordProvenance,
      [LAB_PROVENANCE_LOCKED_KEY]: true,
      [LAB_PROVENANCE_RECORDED_AT_KEY]: recordedAt,
      [LAB_PROVENANCE_RECORDED_BY_KEY]: params.actorUserId,
      [LAB_PARENT_REGULATORY_OBLIGATION_ID_KEY]: obl.id,
      ...(ch?.id ? { [LAB_PARENT_REGULATORY_CHANGE_ID_KEY]: ch.id } : {}),
    };
    if (labClass === 'operational') metadata[LAB_CREATION_MODE_KEY] = 'operational';
    if (labClass === 'uat_authorised') metadata[LAB_CREATION_MODE_KEY] = 'uat_authorised';
    return { metadata, labClass, recordProvenance };
  }
  assertChangeCreateModeAllowed(params.role, params.creationMode);
  const recordProvenance = recordProvenanceKindForCreateMode(params.creationMode);
  const labClass: ChangeLabClass = params.creationMode === 'operational' ? 'operational' : 'uat_authorised';
  const metadata: Record<string, unknown> = {
    [RECORD_PROVENANCE_METADATA_KEY]: recordProvenance,
    [LAB_PROVENANCE_LOCKED_KEY]: true,
    [LAB_PROVENANCE_RECORDED_AT_KEY]: recordedAt,
    [LAB_PROVENANCE_RECORDED_BY_KEY]: params.actorUserId,
    [LAB_CREATION_MODE_KEY]: params.creationMode,
  };
  return { metadata, labClass, recordProvenance };
}

export async function resolveControlCreateMetadata(params: {
  supabase: import('@supabase/supabase-js').SupabaseClient;
  organisationId: string;
  actorUserId: string;
  role: PlatformRole;
  creationMode: ChangeCreateMode;
  riskId: string | null;
}): Promise<{ metadata: Record<string, unknown>; labClass: ChangeLabClass; recordProvenance: RecordProvenanceKind }> {
  const recordedAt = new Date().toISOString();
  if (params.riskId) {
    const { data: risk, error } = await params.supabase
      .from('risks')
      .select('id, metadata')
      .eq('id', params.riskId)
      .eq('organisation_id', params.organisationId)
      .single();
    if (error || !risk) throw new Error('not_found');
    const riskClass = classifyRiskForLab(riskLabProvenanceInputFromRow(risk));
    const riskProv = recordKindForRiskControlLabClass(riskClass);
    if (riskClass !== 'operational' && riskClass !== 'uat_authorised') {
      throw new Error('risk_provenance_unverified');
    }
    assertChangeCreateModeAllowed(params.role, params.creationMode);
    const modeProv = recordProvenanceKindForCreateMode(params.creationMode);
    if (modeProv !== riskProv) {
      throw new Error('creation_mode_parent_mismatch');
    }
    const metadata: Record<string, unknown> = {
      [RECORD_PROVENANCE_METADATA_KEY]: riskProv,
      [LAB_PROVENANCE_LOCKED_KEY]: true,
      [LAB_PROVENANCE_RECORDED_AT_KEY]: recordedAt,
      [LAB_PROVENANCE_RECORDED_BY_KEY]: params.actorUserId,
      [LAB_PARENT_RISK_IDS_KEY]: [risk.id],
      ...(riskClass === 'operational' ? { [LAB_CREATION_MODE_KEY]: 'operational' } : {}),
      ...(riskClass === 'uat_authorised' ? { [LAB_CREATION_MODE_KEY]: 'uat_authorised' } : {}),
    };
    return { metadata, labClass: riskClass, recordProvenance: riskProv };
  }
  assertChangeCreateModeAllowed(params.role, params.creationMode);
  const recordProvenance = recordProvenanceKindForCreateMode(params.creationMode);
  const labClass: ChangeLabClass = params.creationMode === 'operational' ? 'operational' : 'uat_authorised';
  const metadata: Record<string, unknown> = {
    [RECORD_PROVENANCE_METADATA_KEY]: recordProvenance,
    [LAB_PROVENANCE_LOCKED_KEY]: true,
    [LAB_PROVENANCE_RECORDED_AT_KEY]: recordedAt,
    [LAB_PROVENANCE_RECORDED_BY_KEY]: params.actorUserId,
    [LAB_CREATION_MODE_KEY]: params.creationMode,
  };
  return { metadata, labClass, recordProvenance };
}

export async function resolveFindingCreateMetadata(params: {
  supabase: import('@supabase/supabase-js').SupabaseClient;
  organisationId: string;
  actorUserId: string;
  role: PlatformRole;
  creationMode: ChangeCreateMode;
  controlId: string | null;
  riskId: string | null;
}): Promise<{ metadata: Record<string, unknown>; labClass: ChangeLabClass; recordProvenance: RecordProvenanceKind }> {
  const recordedAt = new Date().toISOString();
  if (params.controlId) {
    const { data: ctrl, error } = await params.supabase
      .from('controls')
      .select('id, metadata')
      .eq('id', params.controlId)
      .eq('organisation_id', params.organisationId)
      .single();
    if (error || !ctrl) throw new Error('not_found');
    const ctrlClass = classifyControlForLab(controlLabProvenanceInputFromRow(ctrl));
    const ctrlProv = recordKindForRiskControlLabClass(ctrlClass);
    if (ctrlClass !== 'operational' && ctrlClass !== 'uat_authorised') {
      throw new Error('control_provenance_unverified');
    }
    assertChangeCreateModeAllowed(params.role, params.creationMode);
    const modeProv = recordProvenanceKindForCreateMode(params.creationMode);
    if (modeProv !== ctrlProv) {
      throw new Error('creation_mode_parent_mismatch');
    }
    let parentRiskId: string | undefined;
    if (params.riskId) {
      const { data: risk, error: riskErr } = await params.supabase
        .from('risks')
        .select('id, metadata')
        .eq('id', params.riskId)
        .eq('organisation_id', params.organisationId)
        .single();
      if (riskErr || !risk) throw new Error('not_found');
      const riskClass = classifyRiskForLab(riskLabProvenanceInputFromRow(risk));
      const riskProv = recordKindForRiskControlLabClass(riskClass);
      if (riskProv !== ctrlProv) throw new Error('provenance_link_mismatch');
      parentRiskId = String(risk.id);
    }
    const metadata: Record<string, unknown> = {
      [RECORD_PROVENANCE_METADATA_KEY]: ctrlProv,
      [LAB_PROVENANCE_LOCKED_KEY]: true,
      [LAB_PROVENANCE_RECORDED_AT_KEY]: recordedAt,
      [LAB_PROVENANCE_RECORDED_BY_KEY]: params.actorUserId,
      parentControlId: ctrl.id,
      ...(parentRiskId ? { parentRiskId } : {}),
      ...(ctrlClass === 'operational' ? { [LAB_CREATION_MODE_KEY]: 'operational' } : {}),
      ...(ctrlClass === 'uat_authorised' ? { [LAB_CREATION_MODE_KEY]: 'uat_authorised' } : {}),
    };
    return { metadata, labClass: ctrlClass, recordProvenance: ctrlProv };
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
    const riskProv = recordKindForRiskControlLabClass(riskClass);
    if (riskClass !== 'operational' && riskClass !== 'uat_authorised') {
      throw new Error('risk_provenance_unverified');
    }
    assertChangeCreateModeAllowed(params.role, params.creationMode);
    const modeProv = recordProvenanceKindForCreateMode(params.creationMode);
    if (modeProv !== riskProv) {
      throw new Error('creation_mode_parent_mismatch');
    }
    const metadata: Record<string, unknown> = {
      [RECORD_PROVENANCE_METADATA_KEY]: riskProv,
      [LAB_PROVENANCE_LOCKED_KEY]: true,
      [LAB_PROVENANCE_RECORDED_AT_KEY]: recordedAt,
      [LAB_PROVENANCE_RECORDED_BY_KEY]: params.actorUserId,
      parentRiskId: risk.id,
      ...(riskClass === 'operational' ? { [LAB_CREATION_MODE_KEY]: 'operational' } : {}),
      ...(riskClass === 'uat_authorised' ? { [LAB_CREATION_MODE_KEY]: 'uat_authorised' } : {}),
    };
    return { metadata, labClass: riskClass, recordProvenance: riskProv };
  }
  assertChangeCreateModeAllowed(params.role, params.creationMode);
  const recordProvenance = recordProvenanceKindForCreateMode(params.creationMode);
  const labClass: ChangeLabClass = params.creationMode === 'operational' ? 'operational' : 'uat_authorised';
  const metadata: Record<string, unknown> = {
    [RECORD_PROVENANCE_METADATA_KEY]: recordProvenance,
    [LAB_PROVENANCE_LOCKED_KEY]: true,
    [LAB_PROVENANCE_RECORDED_AT_KEY]: recordedAt,
    [LAB_PROVENANCE_RECORDED_BY_KEY]: params.actorUserId,
    [LAB_CREATION_MODE_KEY]: params.creationMode,
  };
  return { metadata, labClass, recordProvenance };
}

export async function resolveEvidenceCreateMetadata(params: {
  supabase: import('@supabase/supabase-js').SupabaseClient;
  organisationId: string;
  actorUserId: string;
  role: PlatformRole;
  creationMode: ChangeCreateMode;
  controlId: string | null;
}): Promise<{ metadata: Record<string, unknown>; labClass: ChangeLabClass; recordProvenance: RecordProvenanceKind }> {
  const recordedAt = new Date().toISOString();
  if (params.controlId) {
    const { data: ctrl, error } = await params.supabase
      .from('controls')
      .select('id, metadata')
      .eq('id', params.controlId)
      .eq('organisation_id', params.organisationId)
      .single();
    if (error || !ctrl) throw new Error('not_found');
    const ctrlClass = classifyControlForLab(controlLabProvenanceInputFromRow(ctrl));
    const ctrlProv = recordKindForRiskControlLabClass(ctrlClass);
    if (ctrlClass !== 'operational' && ctrlClass !== 'uat_authorised') {
      throw new Error('control_provenance_unverified');
    }
    assertChangeCreateModeAllowed(params.role, params.creationMode);
    const modeProv = recordProvenanceKindForCreateMode(params.creationMode);
    if (modeProv !== ctrlProv) {
      throw new Error('creation_mode_parent_mismatch');
    }
    const metadata: Record<string, unknown> = {
      [RECORD_PROVENANCE_METADATA_KEY]: ctrlProv,
      [LAB_PROVENANCE_LOCKED_KEY]: true,
      [LAB_PROVENANCE_RECORDED_AT_KEY]: recordedAt,
      [LAB_PROVENANCE_RECORDED_BY_KEY]: params.actorUserId,
      parentControlId: ctrl.id,
      ...(ctrlClass === 'operational' ? { [LAB_CREATION_MODE_KEY]: 'operational' } : {}),
      ...(ctrlClass === 'uat_authorised' ? { [LAB_CREATION_MODE_KEY]: 'uat_authorised' } : {}),
    };
    return { metadata, labClass: ctrlClass, recordProvenance: ctrlProv };
  }
  assertChangeCreateModeAllowed(params.role, params.creationMode);
  const recordProvenance = recordProvenanceKindForCreateMode(params.creationMode);
  const labClass: ChangeLabClass = params.creationMode === 'operational' ? 'operational' : 'uat_authorised';
  const metadata: Record<string, unknown> = {
    [RECORD_PROVENANCE_METADATA_KEY]: recordProvenance,
    [LAB_PROVENANCE_LOCKED_KEY]: true,
    [LAB_PROVENANCE_RECORDED_AT_KEY]: recordedAt,
    [LAB_PROVENANCE_RECORDED_BY_KEY]: params.actorUserId,
    [LAB_CREATION_MODE_KEY]: params.creationMode,
  };
  return { metadata, labClass, recordProvenance };
}

export function parseCreationModeField(raw: unknown): ChangeCreateMode {
  return parseChangeCreateMode(raw, { defaultMode: 'operational' });
}
