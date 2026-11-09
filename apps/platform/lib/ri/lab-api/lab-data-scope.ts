import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isOperationalDashboardProvenance,
  isSyntheticUatProvenance,
  resolveRecordProvenance,
  type RecordProvenanceKind,
} from '@/lib/ri/record-provenance';
import { isSyntheticUatRecord, type LabDataScope } from '@/lib/ri/uat-record-provenance';
import {
  aiRunLabProvenanceInputFromRow,
  isSyntheticAiAnalysisFixture,
} from '@/lib/ri/lab-api/ai-run-lab-provenance';
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

/** Entity ids whose workflow events must not count toward operational board metrics. */
export async function collectSyntheticWorkflowEntityIds(
  supabase: SupabaseClient,
  organisationId: string,
): Promise<Set<string>> {
  const ids = new Set<string>();

  const [
    { data: impactRows },
    { data: policyRows },
    { data: findingRows },
    { data: assuranceRows },
    { data: actionRows },
    { data: aiRuns },
    { data: changeRows },
  ] = await Promise.all([
    supabase
      .from('impact_assessments')
      .select('id, change:regulatory_changes(title)')
      .eq('organisation_id', organisationId),
    supabase.from('policies').select('id, name').eq('organisation_id', organisationId),
    supabase.from('findings').select('id, title').eq('organisation_id', organisationId),
    supabase.from('assurance_reviews').select('id, review_type').eq('organisation_id', organisationId),
    supabase.from('actions').select('id, title').eq('organisation_id', organisationId),
    supabase
      .from('ai_analysis_runs')
      .select('id, metadata, publication_id, regulatory_change_id, status, model, provider')
      .eq('organisation_id', organisationId)
      .limit(500),
    supabase
      .from('regulatory_changes')
      .select('id, title, description, external_key, origin, metadata')
      .eq('organisation_id', organisationId),
  ]);

  for (const r of impactRows ?? []) {
    const ch = Array.isArray(r.change) ? r.change[0] : r.change;
    if (isSyntheticUatRecord({ title: ch?.title })) ids.add(r.id);
  }
  for (const r of policyRows ?? []) {
    if (isSyntheticUatRecord({ name: r.name, title: r.name })) ids.add(r.id);
  }
  for (const r of findingRows ?? []) {
    if (isSyntheticUatRecord({ title: r.title })) ids.add(r.id);
  }
  for (const r of assuranceRows ?? []) {
    if (isSyntheticUatRecord({ title: r.review_type })) ids.add(r.id);
  }
  for (const r of actionRows ?? []) {
    if (isSyntheticUatRecord({ title: r.title })) ids.add(r.id);
  }
  for (const r of aiRuns ?? []) {
    if (
      isSyntheticAiAnalysisFixture(
        aiRunLabProvenanceInputFromRow(r as unknown as Parameters<typeof aiRunLabProvenanceInputFromRow>[0]),
      )
    ) {
      ids.add(r.id);
    }
  }
  for (const c of changeRows ?? []) {
    const kind = resolveRecordProvenance({
      title: c.title,
      description: c.description,
      externalKey: c.external_key,
      origin: (c as { origin?: string }).origin,
      metadata: (c as { metadata?: Record<string, unknown> }).metadata ?? null,
    });
    if (!isOperationalDashboardProvenance(kind)) ids.add(c.id);
  }

  return ids;
}
