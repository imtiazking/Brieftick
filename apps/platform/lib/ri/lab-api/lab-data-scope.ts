import 'server-only';

import {
  isOperationalDashboardProvenance,
  isSyntheticUatProvenance,
  resolveRecordProvenance,
  type RecordProvenanceKind,
} from '@/lib/ri/record-provenance';
import type { LabDataScope } from '@/lib/ri/uat-record-provenance';
export {
  filterRowsByLabDataScope,
  parseLabDataScope,
  DEFAULT_LAB_DATA_SCOPE,
  isSyntheticUatRecord,
} from '@/lib/ri/uat-record-provenance';

export type LabScopeMeta = {
  dataScope: LabDataScope;
  excludedSyntheticUat: Record<string, number>;
};

export function emptyLabScopeMeta(scope: LabDataScope): LabScopeMeta {
  return { dataScope: scope, excludedSyntheticUat: {} };
}

export function mergeExcluded(meta: LabScopeMeta, key: string, count: number) {
  if (count > 0) meta.excludedSyntheticUat[key] = count;
}

export function attachDataProvenance<T extends Record<string, unknown>>(
  view: T,
  input: Parameters<typeof resolveRecordProvenance>[0],
): T & { dataProvenance: RecordProvenanceKind } {
  return { ...view, dataProvenance: resolveRecordProvenance(input) };
}

export function filterWorkflowEventsForScope<
  T extends { entity_type: string; entity_id: string; metadata?: Record<string, unknown> | null },
>(
  events: T[],
  scope: LabDataScope,
  syntheticEntityIds: Set<string>,
): { rows: T[]; excludedSyntheticCount: number } {
  if (scope === 'all') return { rows: events, excludedSyntheticCount: 0 };
  let excludedSyntheticCount = 0;
  const rows = events.filter((ev) => {
    const kind = resolveRecordProvenance({ metadata: ev.metadata });
    if (isSyntheticUatProvenance(kind)) {
      excludedSyntheticCount += 1;
      return false;
    }
    if (!isOperationalDashboardProvenance(kind) && kind !== 'ai_draft') {
      excludedSyntheticCount += 1;
      return false;
    }
    if (syntheticEntityIds.has(ev.entity_id)) {
      excludedSyntheticCount += 1;
      return false;
    }
    return true;
  });
  return { rows, excludedSyntheticCount };
}
