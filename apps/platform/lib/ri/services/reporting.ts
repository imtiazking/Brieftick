import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReportingPeriod } from '@/lib/ri/reporting-period';
import { periodEndExclusiveIso } from '@/lib/ri/reporting-period';
import { getDashboardSummary } from '@/lib/ri/services/dashboard';
import {
  getReportActivityInPeriod,
  type ReportActivityInPeriod,
} from '@/lib/ri/services/report-period-activity';

export type ManagementReport = Awaited<ReturnType<typeof getDashboardSummary>> & {
  materialChanges: { id: string; title: string; materiality: string | null }[];
  controlGaps: number;
  reportingPeriod?: ReportingPeriod;
  activityInPeriod?: ReportActivityInPeriod;
  metricsNote: string;
};

export async function getManagementReport(
  supabase: SupabaseClient,
  organisationId: string,
  options?: { reportingPeriod?: ReportingPeriod },
): Promise<ManagementReport> {
  const summary = await getDashboardSummary(supabase, organisationId);
  const period = options?.reportingPeriod;

  let changesQuery = supabase
    .from('regulatory_changes')
    .select('id, title, materiality, status, created_at')
    .eq('organisation_id', organisationId)
    .in('status', ['DRAFT', 'OPEN', 'IN_PROGRESS'])
    .order('updated_at', { ascending: false })
    .limit(15);

  if (period) {
    const startIso = `${period.startDate}T00:00:00.000Z`;
    const endIso = periodEndExclusiveIso(period.endDate);
    changesQuery = changesQuery.gte('created_at', startIso).lte('created_at', endIso);
  }

  const { data: changes } = await changesQuery;

  const materialChanges = (changes ?? [])
    .filter((c) => c.materiality === 'HIGH' || c.materiality === 'MEDIUM')
    .map((c) => ({ id: c.id, title: c.title, materiality: c.materiality }));

  const { count: controlGaps } = await supabase
    .from('findings')
    .select('id', { count: 'exact', head: true })
    .eq('organisation_id', organisationId)
    .in('status', ['OPEN', 'IN_PROGRESS']);

  const activityInPeriod = period
    ? await getReportActivityInPeriod(supabase, organisationId, period)
    : undefined;

  return {
    ...summary,
    materialChanges,
    controlGaps: controlGaps ?? 0,
    reportingPeriod: period,
    activityInPeriod,
    metricsNote:
      'Snapshot counts (open changes, open findings, etc.) reflect current tenant state. Period activity counts filter by created/submitted timestamps within the selected range — not a historical point-in-time reconstruction.',
  };
}
