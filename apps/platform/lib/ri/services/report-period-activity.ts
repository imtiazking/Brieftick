import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReportingPeriod } from '@/lib/ri/reporting-period';
import { periodEndExclusiveIso } from '@/lib/ri/reporting-period';
import { filterWorkflowEventsForScope, collectSyntheticWorkflowEntityIds } from '@/lib/ri/lab-api/lab-data-scope';
import {
  classifyImpactForLab,
  impactLabProvenanceInputFromRow,
  recordKindForImpactLabClass,
} from '@/lib/ri/lab-api/impact-lab-provenance';
import {
  assuranceLabProvenanceInputFromRow,
  partitionAssuranceReviewsForLabScope,
} from '@/lib/ri/lab-api/risk-control-lab-provenance';
import {
  isOperationalDashboardProvenance,
  resolveRecordProvenance,
} from '@/lib/ri/record-provenance';

export type ReportActivityInPeriod = {
  changesRegistered: number;
  impactsSubmitted: number;
  findingsOpened: number;
  workflowEvents: number;
  assuranceReviewsCompleted: number;
};

function isOperationalChangeRow(c: {
  title?: string | null;
  description?: string | null;
  external_key?: string | null;
  origin?: string | null;
  metadata?: Record<string, unknown> | null;
}): boolean {
  return isOperationalDashboardProvenance(
    resolveRecordProvenance({
      title: c.title,
      description: c.description,
      externalKey: c.external_key,
      origin: c.origin,
      metadata: c.metadata ?? null,
    }),
  );
}

function isOperationalImpactRow(i: {
  metadata?: Record<string, unknown> | null;
  change?: { title?: string | null; description?: string | null; external_key?: string | null; origin?: string | null; metadata?: Record<string, unknown> | null } | { title?: string | null; description?: string | null; external_key?: string | null; origin?: string | null; metadata?: Record<string, unknown> | null }[] | null;
}): boolean {
  const ch = Array.isArray(i.change) ? i.change[0] : i.change;
  const kind = recordKindForImpactLabClass(
    classifyImpactForLab(
      impactLabProvenanceInputFromRow({
        metadata: i.metadata ?? null,
        change: ch ?? null,
      }),
    ),
  );
  return isOperationalDashboardProvenance(kind);
}

export async function getReportActivityInPeriod(
  supabase: SupabaseClient,
  organisationId: string,
  period: ReportingPeriod,
  options?: { excludeSyntheticUat?: boolean },
): Promise<ReportActivityInPeriod> {
  const startIso = `${period.startDate}T00:00:00.000Z`;
  const endIso = periodEndExclusiveIso(period.endDate);
  const excludeSynthetic = options?.excludeSyntheticUat === true;

  if (!excludeSynthetic) {
    const [changes, impacts, findings, events, assurance] = await Promise.all([
      supabase
        .from('regulatory_changes')
        .select('id', { count: 'exact', head: true })
        .eq('organisation_id', organisationId)
        .gte('created_at', startIso)
        .lte('created_at', endIso),
      supabase
        .from('impact_assessments')
        .select('id', { count: 'exact', head: true })
        .eq('organisation_id', organisationId)
        .gte('submitted_at', startIso)
        .lte('submitted_at', endIso),
      supabase
        .from('findings')
        .select('id', { count: 'exact', head: true })
        .eq('organisation_id', organisationId)
        .gte('created_at', startIso)
        .lte('created_at', endIso),
      supabase
        .from('workflow_events')
        .select('id', { count: 'exact', head: true })
        .eq('organisation_id', organisationId)
        .gte('occurred_at', startIso)
        .lte('occurred_at', endIso),
      supabase
        .from('assurance_reviews')
        .select('id', { count: 'exact', head: true })
        .eq('organisation_id', organisationId)
        .gte('created_at', startIso)
        .lte('created_at', endIso),
    ]);

    return {
      changesRegistered: changes.count ?? 0,
      impactsSubmitted: impacts.count ?? 0,
      findingsOpened: findings.count ?? 0,
      workflowEvents: events.count ?? 0,
      assuranceReviewsCompleted: assurance.count ?? 0,
    };
  }

  const [changeRows, impactRows, findingRows, assuranceRows, eventRows, syntheticEntityIds] =
    await Promise.all([
      supabase
        .from('regulatory_changes')
        .select('id, title, description, external_key, origin, metadata, created_at')
        .eq('organisation_id', organisationId)
        .gte('created_at', startIso)
        .lte('created_at', endIso),
      supabase
        .from('impact_assessments')
        .select(
          'id, metadata, submitted_at, change:regulatory_changes(title, description, external_key, origin, metadata)',
        )
        .eq('organisation_id', organisationId)
        .not('submitted_at', 'is', null)
        .gte('submitted_at', startIso)
        .lte('submitted_at', endIso),
      supabase
        .from('findings')
        .select('id, title, metadata, created_at')
        .eq('organisation_id', organisationId)
        .gte('created_at', startIso)
        .lte('created_at', endIso),
      supabase
        .from('assurance_reviews')
        .select('id, result, next_review_date, review_type, metadata, created_at')
        .eq('organisation_id', organisationId)
        .gte('created_at', startIso)
        .lte('created_at', endIso),
      supabase
        .from('workflow_events')
        .select('id, entity_type, entity_id, metadata, occurred_at')
        .eq('organisation_id', organisationId)
        .gte('occurred_at', startIso)
        .lte('occurred_at', endIso)
        .limit(15000),
      collectSyntheticWorkflowEntityIds(supabase, organisationId),
    ]);

  const operationalChanges = (changeRows.data ?? []).filter(isOperationalChangeRow);
  const operationalImpacts = (impactRows.data ?? []).filter(isOperationalImpactRow);
  const operationalFindings = (findingRows.data ?? []).filter((f) =>
    isOperationalDashboardProvenance(resolveRecordProvenance({ title: f.title, metadata: f.metadata })),
  );
  const operationalAssurance = partitionAssuranceReviewsForLabScope(
    assuranceRows.data ?? [],
    'operational',
    (a) => assuranceLabProvenanceInputFromRow(a),
  ).operational;
  const { rows: operationalEvents } = filterWorkflowEventsForScope(
    eventRows.data ?? [],
    'operational',
    syntheticEntityIds,
  );

  return {
    changesRegistered: operationalChanges.length,
    impactsSubmitted: operationalImpacts.length,
    findingsOpened: operationalFindings.length,
    workflowEvents: operationalEvents.length,
    assuranceReviewsCompleted: operationalAssurance.length,
  };
}
