import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { listPublicationsForOrganisation, type PublicationListRow } from '@/lib/ri/services/publications';

export type HorizonFilters = {
  regulatorKey?: string;
  sourceKey?: string;
  contentClass?: string;
  publicationType?: string;
  fromDate?: string;
  toDate?: string;
  relevance?: string;
};

export async function listHorizonPublications(
  supabase: SupabaseClient,
  organisationId: string,
  filters: HorizonFilters = {},
): Promise<PublicationListRow[]> {
  const rows = await listPublicationsForOrganisation(supabase, organisationId);
  return rows.filter((p) => {
    if (filters.regulatorKey && p.regulator?.external_key !== filters.regulatorKey) return false;
    if (filters.sourceKey && p.source?.external_key !== filters.sourceKey) return false;
    if (filters.publicationType && p.publication_type !== filters.publicationType) return false;
    if (filters.relevance && p.orgState?.relevance_status !== filters.relevance) return false;
    if (filters.fromDate && p.publication_date && p.publication_date < filters.fromDate) return false;
    if (filters.toDate && p.publication_date && p.publication_date > filters.toDate) return false;
    return true;
  });
}
