import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReportingPeriod } from '@/lib/ri/reporting-period';
import { periodEndExclusiveIso } from '@/lib/ri/reporting-period';
import { getDashboardSummary } from '@/lib/ri/services/dashboard';
import {
  getReportActivityInPeriod,
  type ReportActivityInPeriod,
} from '@/lib/ri/services/report-period-activity';
import { isOperationalDashboardProvenance, resolveRecordProvenance } from '@/lib/ri/record-provenance';

export type ManagementReportDataPopulation = 'operational' | 'all';

export type ManagementReport = Awaited<ReturnType<typeof getDashboardSummary>> & {
  materialChanges: { id: string; title: string; materiality: string | null }[];
  controlGaps: number;
  reportingPeriod?: ReportingPeriod;
  activityInPeriod?: ReportActivityInPeriod;
  dataPopulation: ManagementReportDataPopulation;
  metricsNote: string;
};

const OPERATIONAL_METRICS_NOTE =
  'Operational population only: authorised UAT, synthetic acceptance fixtures, and unverified lab rows are excluded (same scope as the operational dashboard). Snapshot counts reflect current open/active status as of generation time. Period activity counts filter by created/submitted/occurred timestamps within the selected range — not a historical point-in-time reconstruction.';

const ALL_TENANT_METRICS_NOTE =
  'Full tenant population (includes authorised UAT and synthetic rows). Snapshot counts reflect current state; period activity uses created/submitted timestamps within the range.';

export async function getManagementReport(
  supabase: SupabaseClient,
  organisationId: string,
  options?: { reportingPeriod?: ReportingPeriod; dataPopulation?: ManagementReportDataPopulation },
): Promise<ManagementReport> {
  const dataPopulation = options?.dataPopulation ?? 'operational';
  const excludeSynthetic = dataPopulation === 'operational';

  const summary = await getDashboardSummary(supabase, organisationId, undefined, {
    excludeSyntheticUat: excludeSynthetic,
  });
  const period = options?.reportingPeriod;

  let changesQuery = supabase
    .from('regulatory_changes')
    .select('id, title, materiality, status, created_at, description, external_key, origin, metadata')
    .eq('organisation_id', organisationId)
    .in('status', ['DRAFT', 'OPEN', 'IN_PROGRESS'])
    .order('updated_at', { ascending: false })
    .limit(50);

  if (period) {
    const startIso = `${period.startDate}T00:00:00.000Z`;
    const endIso = periodEndExclusiveIso(period.endDate);
    changesQuery = changesQuery.gte('created_at', startIso).lte('created_at', endIso);
  }

  const { data: changes } = await changesQuery;

  let candidateChanges = changes ?? [];
  if (excludeSynthetic) {
    candidateChanges = candidateChanges.filter((c) =>
      isOperationalDashboardProvenance(
        resolveRecordProvenance({
          title: c.title,
          description: c.description,
          externalKey: c.external_key,
          origin: (c as { origin?: string }).origin,
          metadata: (c as { metadata?: Record<string, unknown> }).metadata ?? null,
        }),
      ),
    );
  }

  const materialChanges = candidateChanges
    .filter((c) => c.materiality === 'HIGH' || c.materiality === 'MEDIUM')
    .slice(0, 15)
    .map((c) => ({ id: c.id, title: c.title, materiality: c.materiality }));

  const { data: findingRows } = await supabase
    .from('findings')
    .select('id, status, title, metadata')
    .eq('organisation_id', organisationId)
    .in('status', ['OPEN', 'IN_PROGRESS']);

  let openFindings = findingRows ?? [];
  if (excludeSynthetic) {
    openFindings = openFindings.filter((f) =>
      isOperationalDashboardProvenance(resolveRecordProvenance({ title: f.title, metadata: f.metadata })),
    );
  }
  const controlGaps = openFindings.length;

  const activityInPeriod = period
    ? await getReportActivityInPeriod(supabase, organisationId, period, { excludeSyntheticUat: excludeSynthetic })
    : undefined;

  return {
    ...summary,
    materialChanges,
    controlGaps,
    reportingPeriod: period,
    activityInPeriod,
    dataPopulation,
    metricsNote: excludeSynthetic ? OPERATIONAL_METRICS_NOTE : ALL_TENANT_METRICS_NOTE,
  };
}
