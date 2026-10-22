import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { getDashboardSummary } from '@/lib/ri/services/dashboard';

export type ManagementReport = Awaited<ReturnType<typeof getDashboardSummary>> & {
  materialChanges: { id: string; title: string; materiality: string | null }[];
  controlGaps: number;
};

export async function getManagementReport(
  supabase: SupabaseClient,
  organisationId: string,
): Promise<ManagementReport> {
  const summary = await getDashboardSummary(supabase, organisationId);

  const { data: changes } = await supabase
    .from('regulatory_changes')
    .select('id, title, materiality, status')
    .eq('organisation_id', organisationId)
    .in('status', ['DRAFT', 'OPEN', 'IN_PROGRESS'])
    .order('updated_at', { ascending: false })
    .limit(15);

  const materialChanges = (changes ?? [])
    .filter((c) => c.materiality === 'HIGH' || c.materiality === 'MEDIUM')
    .map((c) => ({ id: c.id, title: c.title, materiality: c.materiality }));

  const { count: controlGaps } = await supabase
    .from('findings')
    .select('id', { count: 'exact', head: true })
    .eq('organisation_id', organisationId)
    .in('status', ['OPEN', 'IN_PROGRESS']);

  return {
    ...summary,
    materialChanges,
    controlGaps: controlGaps ?? 0,
  };
}
