import {
  isOperationalDashboardProvenance,
  isSyntheticUatProvenance,
  resolveRecordProvenance,
  type RecordProvenanceKind,
} from '@/lib/ri/record-provenance';
import {
  LAB_CREATION_MODE_KEY,
  LAB_PROVENANCE_LOCKED_KEY,
} from '@/lib/ri/lab-api/change-create-provenance';
import type { LabDataScope } from '@/lib/ri/uat-record-provenance';

export type ChangeLabClass = 'operational' | 'uat_authorised' | 'synthetic_uat' | 'unverified';

export type ChangeLabProvenanceInput = {
  id?: string;
  title?: string | null;
  description?: string | null;
  externalKey?: string | null;
  origin?: string | null;
  publicationId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export function changeLabProvenanceInputFromRow(row: {
  id: string;
  title: string;
  description?: string | null;
  external_key?: string | null;
  origin?: string | null;
  publication_id?: string;
  metadata?: Record<string, unknown> | null;
}): ChangeLabProvenanceInput {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    externalKey: row.external_key,
    origin: row.origin,
    publicationId: row.publication_id,
    metadata: row.metadata ?? null,
  };
}

/** Phase 8D.3 scripted Consumer Duty acceptance changes (title prefix from hosted e2e). */
export function isAuthorisedUatRegulatoryChange(input: ChangeLabProvenanceInput): boolean {
  const title = (input.title || '').trim();
  if (!/^P8D3-CD-/i.test(title)) return false;
  if (!input.publicationId?.trim()) return false;
  const origin = (input.origin || 'MANUAL').toUpperCase();
  if (origin !== 'MANUAL') return false;
  const meta = input.metadata;
  const rp = meta?.recordProvenance ?? meta?.record_provenance;
  if (rp === 'synthetic_uat' || rp === 'synthetic_fixture') return false;
  return true;
}

/** Immutable lab creation provenance stored on regulatory_changes.metadata (BUS-UAT-005). */
export function labClassFromPersistedChangeMetadata(
  metadata: Record<string, unknown> | null | undefined,
): ChangeLabClass | null {
  if (!metadata || typeof metadata !== 'object') return null;
  if (metadata[LAB_PROVENANCE_LOCKED_KEY] !== true) return null;
  const mode = metadata[LAB_CREATION_MODE_KEY];
  if (mode === 'operational') return 'operational';
  if (mode === 'uat_authorised') return 'uat_authorised';
  return null;
}

export function classifyChangeForLab(input: ChangeLabProvenanceInput): ChangeLabClass {
  const persisted = labClassFromPersistedChangeMetadata(input.metadata);
  const kind = resolveRecordProvenance({
    id: input.id,
    title: input.title,
    description: input.description,
    externalKey: input.externalKey,
    origin: input.origin,
    metadata: input.metadata,
  });
  if (kind === 'synthetic_fixture' || isSyntheticUatProvenance(kind)) return 'synthetic_uat';
  if (persisted) return persisted;
  if (isOperationalDashboardProvenance(kind)) return 'operational';
  if (kind === 'uat_authorised') return 'uat_authorised';
  if (isAuthorisedUatRegulatoryChange(input)) return 'uat_authorised';
  return 'unverified';
}

export function labChangeClassificationLabel(cls: ChangeLabClass): string {
  switch (cls) {
    case 'operational':
      return 'Operational tenant record';
    case 'uat_authorised':
      return 'Authorised UAT / acceptance';
    case 'synthetic_uat':
      return 'Synthetic UAT / fixture';
    default:
      return 'Provenance not verified';
  }
}

export function recordKindForChangeLabClass(cls: ChangeLabClass): RecordProvenanceKind {
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

export type ChangeLabPartition<T> = {
  operational: T[];
  authorisedUat: T[];
  unverified: T[];
  syntheticUat: T[];
  excludedFromOperationalCount: number;
};

export function partitionChangesForLabScope<T>(
  rows: T[],
  scope: LabDataScope,
  toInput: (row: T) => ChangeLabProvenanceInput,
): ChangeLabPartition<T> {
  const operational: T[] = [];
  const authorisedUat: T[] = [];
  const unverified: T[] = [];
  const syntheticUat: T[] = [];

  for (const row of rows) {
    const cls = classifyChangeForLab(toInput(row));
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
