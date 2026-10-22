import type { SupabaseClient } from '@supabase/supabase-js';
import { RiNotFoundError } from '@/lib/ri/errors';

export async function assertRowInOrganisation(
  supabase: SupabaseClient,
  table:
    | 'organisation_publications'
    | 'applicability_assessments'
    | 'regulatory_changes'
    | 'impact_assessments'
    | 'regulatory_obligations'
    | 'policies'
    | 'risks'
    | 'controls'
    | 'actions'
    | 'evidence_items'
    | 'findings'
    | 'assurance_reviews',
  id: string,
  organisationId: string,
) {
  const { data, error } = await supabase
    .from(table)
    .select('id')
    .eq('id', id)
    .eq('organisation_id', organisationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new RiNotFoundError();
}

export function rejectClientOrganisationId(
  payloadOrgId: string | undefined | null,
  organisationId: string,
) {
  if (payloadOrgId && payloadOrgId !== organisationId) {
    throw new Error('organisation_spoof_rejected');
  }
}

export function checkOptimisticUpdatedAt(
  rowUpdatedAt: string | null | undefined,
  clientUpdatedAt: string | null | undefined,
) {
  if (!clientUpdatedAt || !rowUpdatedAt) return;
  if (new Date(clientUpdatedAt).getTime() !== new Date(rowUpdatedAt).getTime()) {
    throw new Error('stale_record');
  }
}
