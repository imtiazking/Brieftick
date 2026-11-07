import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReportingPeriod } from '@/lib/ri/reporting-period';
import { periodEndExclusiveIso } from '@/lib/ri/reporting-period';

export type ReportActivityInPeriod = {
  changesRegistered: number;
  impactsSubmitted: number;
  findingsOpened: number;
  workflowEvents: number;
  assuranceReviewsCompleted: number;
};

export async function getReportActivityInPeriod(
  supabase: SupabaseClient,
  organisationId: string,
  period: ReportingPeriod,
): Promise<ReportActivityInPeriod> {
  const startIso = `${period.startDate}T00:00:00.000Z`;
  const endIso = periodEndExclusiveIso(period.endDate);

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
