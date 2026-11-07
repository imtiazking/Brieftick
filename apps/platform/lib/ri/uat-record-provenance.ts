import 'server-only';

import {
  isOperationalDashboardProvenance,
  isSyntheticUatProvenance,
  resolveRecordProvenance,
  type RecordProvenanceKind,
} from '@/lib/ri/record-provenance';

export type DataProvenance = 'operational' | 'synthetic_uat' | 'unknown';

/** @deprecated use RecordProvenanceKind from record-provenance.ts */
export type LegacyDataProvenance = DataProvenance;

export type UatProvenanceInput = {
  id?: string | null;
  title?: string | null;
  name?: string | null;
  description?: string | null;
  statement?: string | null;
  externalKey?: string | null;
  dataOrigin?: string | null;
  metadata?: Record<string, unknown> | null;
  origin?: string | null;
  idempotencyKey?: string | null;
  businessImpact?: string | null;
};

const SYNTHETIC_TEXT_PATTERNS: RegExp[] = [
  /\bUAT-83H\b/i,
  /\bUAT-83F\b/i,
  /\bUAT-83H-CLOSE\b/i,
  /\b83F2 synthetic\b/i,
  /\bsynthetic UAT\b/i,
  /\bsynthetic fixture\b/i,
  /\bnot regulatory advice\b/i,
  /\bprovenance test only\b/i,
];

function textMatchesSynthetic(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  return SYNTHETIC_TEXT_PATTERNS.some((re) => re.test(text));
}

function metadataMarksSynthetic(metadata: Record<string, unknown> | null | undefined): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  if (metadata._uat_label != null) return true;
  const label = metadata.label;
  if (typeof label === 'string' && textMatchesSynthetic(label)) return true;
  return false;
}

/** Known synthetic publication fixture origin (global catalogue). */
export function isSyntheticPublicationOrigin(dataOrigin: string | null | undefined): boolean {
  return dataOrigin === 'e2e_fixture';
}

export function classifyUatProvenance(input: UatProvenanceInput): DataProvenance {
  const kind = resolveRecordProvenance(input);
  if (isSyntheticUatProvenance(kind)) return 'synthetic_uat';
  if (isOperationalDashboardProvenance(kind)) return 'operational';
  return 'unknown';
}

export function isSyntheticUatRecord(input: UatProvenanceInput): boolean {
  return isSyntheticUatProvenance(resolveRecordProvenance(input));
}

export function isOperationalLabRecord(input: UatProvenanceInput): boolean {
  return isOperationalDashboardProvenance(resolveRecordProvenance(input));
}

export type LabDataScope = 'operational' | 'all';

/** Default for Original Design Lab connected mode — hide labelled UAT rows from operational dashboards. */
export const DEFAULT_LAB_DATA_SCOPE: LabDataScope = 'operational';

export function parseLabDataScope(url: URL): LabDataScope {
  const raw = (url.searchParams.get('dataScope') || url.searchParams.get('scope') || '').trim().toLowerCase();
  if (raw === 'all' || raw === 'include_uat' || raw === 'uat') return 'all';
  return DEFAULT_LAB_DATA_SCOPE;
}

/** Pending governance queue rows (impact / applicability IN_REVIEW). */
export type PendingGovernanceProvenanceFields = {
  id?: string | null;
  title?: string | null;
  businessImpact?: string | null;
  externalKey?: string | null;
  dataOrigin?: string | null;
  metadata?: Record<string, unknown> | null;
};

export function provenanceInputForPendingGovernance(
  item: PendingGovernanceProvenanceFields,
): UatProvenanceInput {
  return {
    id: item.id,
    title: item.title,
    businessImpact: item.businessImpact,
    externalKey: item.externalKey,
    dataOrigin: item.dataOrigin,
    metadata: item.metadata,
  };
}

/** Align pending list + summary counts with operational dataScope (not only synthetic_uat). */
export function filterPendingGovernanceForLabScope<T extends PendingGovernanceProvenanceFields>(
  items: T[],
  scope: LabDataScope,
): { items: T[]; excludedNonOperationalCount: number } {
  if (scope === 'all') {
    return { items, excludedNonOperationalCount: 0 };
  }
  const kept: T[] = [];
  let excludedNonOperationalCount = 0;
  for (const item of items) {
    if (isOperationalLabRecord(provenanceInputForPendingGovernance(item))) {
      kept.push(item);
    } else {
      excludedNonOperationalCount += 1;
    }
  }
  return { items: kept, excludedNonOperationalCount };
}

export function filterRowsByLabDataScope<T>(
  rows: T[],
  scope: LabDataScope,
  classify: (row: T) => UatProvenanceInput,
): { rows: T[]; excludedSyntheticCount: number } {
  if (scope === 'all') {
    return { rows, excludedSyntheticCount: 0 };
  }
  const kept: T[] = [];
  let excludedSyntheticCount = 0;
  for (const row of rows) {
    const kind = resolveRecordProvenance(classify(row));
    if (!isOperationalDashboardProvenance(kind)) {
      excludedSyntheticCount += 1;
    } else {
      kept.push(row);
    }
  }
  return { rows: kept, excludedSyntheticCount };
}

export function provenanceLabel(kind: DataProvenance): string {
  switch (kind) {
    case 'synthetic_uat':
      return 'Synthetic UAT / fixture';
    case 'operational':
      return 'Organisational record';
    default:
      return 'Provenance not established';
  }
}
