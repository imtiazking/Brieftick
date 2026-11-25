import 'server-only';

import {
  LAB_CREATION_MODE_KEY,
  LAB_PROVENANCE_LOCKED_KEY,
  LAB_PROVENANCE_RECORDED_AT_KEY,
  LAB_PROVENANCE_RECORDED_BY_KEY,
} from '@/lib/ri/lab-api/change-create-provenance';
import {
  changeLabProvenanceInputFromRow,
  classifyChangeForLab,
  recordKindForChangeLabClass,
  type ChangeLabClass,
} from '@/lib/ri/lab-api/change-lab-provenance';
import {
  RECORD_PROVENANCE_METADATA_KEY,
  type RecordProvenanceKind,
  workflowMetadataForProvenance,
} from '@/lib/ri/record-provenance';

/** Lineage key — parent regulatory change at obligation create time. */
export const LAB_PARENT_REGULATORY_CHANGE_ID_KEY = 'parentRegulatoryChangeId';

export type ParentRegulatoryChangeRow = {
  id: string;
  title: string;
  description?: string | null;
  external_key?: string | null;
  origin?: string | null;
  publication_id?: string;
  metadata?: Record<string, unknown> | null;
};

export function buildLockedChildMetadataFromParentChange(params: {
  parentChange: ParentRegulatoryChangeRow;
  actorUserId: string;
  recordedAt?: string;
}): {
  metadata: Record<string, unknown>;
  recordProvenance: RecordProvenanceKind;
  labClass: ChangeLabClass;
} {
  const input = changeLabProvenanceInputFromRow(params.parentChange);
  const labClass = classifyChangeForLab(input);
  const recordProvenance = recordKindForChangeLabClass(labClass);
  const recordedAt = params.recordedAt ?? new Date().toISOString();
  const metadata: Record<string, unknown> = {
    [RECORD_PROVENANCE_METADATA_KEY]: recordProvenance,
    [LAB_PROVENANCE_LOCKED_KEY]: true,
    [LAB_PROVENANCE_RECORDED_AT_KEY]: recordedAt,
    [LAB_PROVENANCE_RECORDED_BY_KEY]: params.actorUserId,
    [LAB_PARENT_REGULATORY_CHANGE_ID_KEY]: params.parentChange.id,
  };
  if (labClass === 'operational') {
    metadata[LAB_CREATION_MODE_KEY] = 'operational';
  } else if (labClass === 'uat_authorised') {
    metadata[LAB_CREATION_MODE_KEY] = 'uat_authorised';
  }
  return { metadata, recordProvenance, labClass };
}

const LINEAGE_PROVENANCE_KEYS = [
  RECORD_PROVENANCE_METADATA_KEY,
  'record_provenance',
  LAB_PROVENANCE_LOCKED_KEY,
  LAB_CREATION_MODE_KEY,
  LAB_PROVENANCE_RECORDED_AT_KEY,
  LAB_PROVENANCE_RECORDED_BY_KEY,
  LAB_PARENT_REGULATORY_CHANGE_ID_KEY,
] as const;

/** Copy locked lab provenance from an approved parent record (impact → risk → control → assurance). */
export function buildLockedChildMetadataFromParentRecord(params: {
  parentMetadata: Record<string, unknown> | null | undefined;
  actorUserId: string;
  extras: Record<string, unknown>;
}): Record<string, unknown> {
  const parent = params.parentMetadata && typeof params.parentMetadata === 'object' ? params.parentMetadata : {};
  const metadata: Record<string, unknown> = { ...params.extras };
  for (const key of LINEAGE_PROVENANCE_KEYS) {
    if (parent[key] !== undefined && parent[key] !== null) {
      metadata[key] = parent[key];
    }
  }
  metadata[LAB_PROVENANCE_LOCKED_KEY] = true;
  if (
    metadata[RECORD_PROVENANCE_METADATA_KEY] === undefined &&
    metadata.record_provenance === undefined
  ) {
    metadata[RECORD_PROVENANCE_METADATA_KEY] = 'tenant_operational';
  }
  metadata[LAB_PROVENANCE_RECORDED_AT_KEY] =
    metadata[LAB_PROVENANCE_RECORDED_AT_KEY] ?? new Date().toISOString();
  metadata[LAB_PROVENANCE_RECORDED_BY_KEY] = params.actorUserId;
  return metadata;
}

export function workflowMetadataForChildRecordCreate(params: {
  recordProvenance: RecordProvenanceKind;
  parentChangeId: string;
  actorUserId: string;
  labClass: ChangeLabClass;
}): Record<string, unknown> {
  return {
    ...workflowMetadataForProvenance(params.recordProvenance),
    [LAB_PARENT_REGULATORY_CHANGE_ID_KEY]: params.parentChangeId,
    [LAB_PROVENANCE_RECORDED_BY_KEY]: params.actorUserId,
    ...(params.labClass === 'operational' || params.labClass === 'uat_authorised'
      ? {
          [LAB_CREATION_MODE_KEY]:
            params.labClass === 'operational' ? 'operational' : 'uat_authorised',
        }
      : {}),
  };
}
