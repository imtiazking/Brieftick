import 'server-only';

import {
  changeLabProvenanceInputFromRow,
  classifyChangeForLab,
  type ChangeLabClass,
  type ChangeLabProvenanceInput,
} from '@/lib/ri/lab-api/change-lab-provenance';
import {
  LAB_CREATION_MODE_KEY,
  LAB_PROVENANCE_LOCKED_KEY,
} from '@/lib/ri/lab-api/change-create-provenance';
import type { LabDataScope } from '@/lib/ri/uat-record-provenance';
import {
  isOperationalDashboardProvenance,
  isSyntheticUatProvenance,
  resolveRecordProvenance,
  type RecordProvenanceKind,
} from '@/lib/ri/record-provenance';

export type ImpactLabProvenanceInput = {
  metadata?: Record<string, unknown> | null;
  parentChange?: ChangeLabProvenanceInput | null;
};

function labClassFromPersistedImpactMetadata(
  metadata: Record<string, unknown> | null | undefined,
): ChangeLabClass | null {
  if (!metadata || typeof metadata !== 'object') return null;
  if (metadata[LAB_PROVENANCE_LOCKED_KEY] !== true) return null;
  const mode = metadata[LAB_CREATION_MODE_KEY];
  if (mode === 'operational') return 'operational';
  if (mode === 'uat_authorised') return 'uat_authorised';
  const rp = metadata.recordProvenance ?? metadata.record_provenance;
  if (typeof rp === 'string') {
    const kind = resolveRecordProvenance({ metadata: { recordProvenance: rp } });
    if (isSyntheticUatProvenance(kind)) return 'synthetic_uat';
    if (kind === 'uat_authorised') return 'uat_authorised';
    if (isOperationalDashboardProvenance(kind)) return 'operational';
    if (kind === 'unverified') return 'unverified';
  }
  return null;
}

/** Authoritative impact classification — persisted metadata, then parent change; never title text. */
export function classifyImpactForLab(input: ImpactLabProvenanceInput): ChangeLabClass {
  const persisted = labClassFromPersistedImpactMetadata(input.metadata);
  if (persisted) return persisted;
  if (input.parentChange) {
    return classifyChangeForLab(input.parentChange);
  }
  return 'unverified';
}

export function recordKindForImpactLabClass(cls: ChangeLabClass): RecordProvenanceKind {
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

export type ImpactLabPartition<T> = {
  operational: T[];
  authorisedUat: T[];
  unverified: T[];
  syntheticUat: T[];
  excludedFromOperationalCount: number;
};

export function impactLabProvenanceInputFromRow(row: {
  metadata?: Record<string, unknown> | null;
  change?:
    | {
        id?: string;
        title?: string | null;
        description?: string | null;
        external_key?: string | null;
        origin?: string | null;
        publication_id?: string;
        metadata?: Record<string, unknown> | null;
      }
    | {
        id?: string;
        title?: string | null;
        description?: string | null;
        external_key?: string | null;
        origin?: string | null;
        publication_id?: string;
        metadata?: Record<string, unknown> | null;
      }[]
    | null;
}): ImpactLabProvenanceInput {
  const ch = Array.isArray(row.change) ? row.change[0] : row.change;
  return {
    metadata: row.metadata ?? null,
    parentChange: ch?.id
      ? changeLabProvenanceInputFromRow({
          id: ch.id,
          title: ch.title ?? '',
          description: ch.description,
          external_key: ch.external_key,
          origin: ch.origin,
          publication_id: ch.publication_id,
          metadata: ch.metadata ?? null,
        })
      : null,
  };
}

export function partitionImpactsForLabScope<T>(
  rows: T[],
  scope: LabDataScope,
  toInput: (row: T) => ImpactLabProvenanceInput,
): ImpactLabPartition<T> {
  const operational: T[] = [];
  const authorisedUat: T[] = [];
  const unverified: T[] = [];
  const syntheticUat: T[] = [];

  for (const row of rows) {
    const cls = classifyImpactForLab(toInput(row));
    switch (cls) {
      case 'operational':
        operational.push(row);
        break;
      case 'uat_authorised':
        authorisedUat.push(row);
        break;
      case 'synthetic_uat':
        syntheticUat.push(row);
        break;
      default:
        unverified.push(row);
    }
  }

  const excludedFromOperationalCount =
    scope === 'operational'
      ? authorisedUat.length + unverified.length + syntheticUat.length
      : 0;

  return {
    operational,
    authorisedUat,
    unverified,
    syntheticUat,
    excludedFromOperationalCount,
  };
}
