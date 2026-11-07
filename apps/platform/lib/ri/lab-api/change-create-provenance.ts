import 'server-only';

import type { PlatformRole } from '@/lib/roles';
import { roleAtLeast } from '@/lib/roles';
import { assertCanRi } from '@/lib/ri/permissions';
import { RiValidationError } from '@/lib/ri/errors';
import {
  RECORD_PROVENANCE_METADATA_KEY,
  type RecordProvenanceKind,
} from '@/lib/ri/record-provenance';
import { isLabConnectedWritesEnabled } from '@/lib/ri/lab-api/lab-connected-writes';

export const CHANGE_CREATE_MODES = ['operational', 'uat_authorised'] as const;
export type ChangeCreateMode = (typeof CHANGE_CREATE_MODES)[number];

export const LAB_CREATION_MODE_KEY = 'labCreationMode';
export const LAB_PROVENANCE_LOCKED_KEY = 'labProvenanceLocked';
export const LAB_PROVENANCE_RECORDED_AT_KEY = 'labProvenanceRecordedAt';
export const LAB_PROVENANCE_RECORDED_BY_KEY = 'labProvenanceRecordedByUserId';

/** Staging / controlled UAT windows only — never infer from title. */
export function isLabAuthorisedUatChangeCreationEnabled(): boolean {
  if (!isLabConnectedWritesEnabled()) return false;
  return process.env.RI_LAB_AUTHORISED_UAT_CHANGE_CREATION === 'true';
}

export function parseChangeCreateMode(raw: unknown, opts?: { defaultMode?: ChangeCreateMode }): ChangeCreateMode {
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (!v && opts?.defaultMode) return opts.defaultMode;
  if (v === 'operational' || v === 'uat_authorised') return v;
  throw new RiValidationError('invalid_creation_mode');
}

export function assertChangeCreateModeAllowed(role: PlatformRole, mode: ChangeCreateMode): void {
  assertCanRi(role, 'change:write');
  if (mode === 'operational') {
    return;
  }
  if (!roleAtLeast(role, 'COMPLIANCE_MANAGER')) {
    throw new Error('insufficient_role');
  }
  if (!isLabAuthorisedUatChangeCreationEnabled()) {
    throw new Error('authorised_uat_change_creation_disabled');
  }
}

export function recordProvenanceKindForCreateMode(mode: ChangeCreateMode): RecordProvenanceKind {
  return mode === 'operational' ? 'tenant_operational' : 'uat_authorised';
}

export function buildRegulatoryChangeMetadataForCreate(params: {
  mode: ChangeCreateMode;
  actorUserId: string;
  recordedAt?: string;
}): Record<string, unknown> {
  const recordedAt = params.recordedAt ?? new Date().toISOString();
  const recordProvenance = recordProvenanceKindForCreateMode(params.mode);
  return {
    [RECORD_PROVENANCE_METADATA_KEY]: recordProvenance,
    [LAB_CREATION_MODE_KEY]: params.mode,
    [LAB_PROVENANCE_LOCKED_KEY]: true,
    [LAB_PROVENANCE_RECORDED_AT_KEY]: recordedAt,
    [LAB_PROVENANCE_RECORDED_BY_KEY]: params.actorUserId,
  };
}

export function workflowMetadataForChangeCreate(params: {
  mode: ChangeCreateMode;
  actorUserId: string;
  recordProvenance: RecordProvenanceKind;
}): Record<string, unknown> {
  return {
    [RECORD_PROVENANCE_METADATA_KEY]: params.recordProvenance,
    [LAB_CREATION_MODE_KEY]: params.mode,
    [LAB_PROVENANCE_RECORDED_BY_KEY]: params.actorUserId,
  };
}
