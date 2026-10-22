import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { filterHorizonPublications } from '@/lib/ri/lab-compat/horizon-parity.mjs';
import { listPublicationsForOrganisation, type PublicationListRow } from '@/lib/ri/services/publications';

export type HorizonFilters = {
  regulatorKey?: string;
  sourceKey?: string;
  contentClass?: string;
  publicationType?: string;
  fromDate?: string;
  toDate?: string;
  relevance?: string;
  windowDays?: number;
};

export async function listHorizonPublications(
  supabase: SupabaseClient,
  organisationId: string,
  filters: HorizonFilters = {},
): Promise<PublicationListRow[]> {
  const rows = await listPublicationsForOrganisation(supabase, organisationId);
  const referenceDate = new Date().toISOString().slice(0, 10);
  const filtered = filterHorizonPublications(rows, filters, {
    windowDays: filters.windowDays ?? 90,
    referenceDate,
  });
  return filtered as PublicationListRow[];
}
