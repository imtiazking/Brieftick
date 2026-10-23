import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { AI_FRESHNESS } from '@/lib/ri/ai/enums';

/** Mark analyses outdated when a newer publication version exists than the analysed version. */
export async function markAnalysesOutdatedForPublicationVersion(
  supabase: SupabaseClient,
  organisationId: string,
  publicationId: string,
  currentVersionId: string,
): Promise<number> {
  const { data: outdated } = await supabase
    .from('ai_analysis_runs')
    .select('id')
    .eq('organisation_id', organisationId)
    .eq('publication_id', publicationId)
    .neq('publication_version_id', currentVersionId)
    .eq('freshness', AI_FRESHNESS.CURRENT);

  if (!outdated?.length) return 0;

  const ids = outdated.map((r) => r.id);
  const { error } = await supabase
    .from('ai_analysis_runs')
    .update({ freshness: AI_FRESHNESS.OUTDATED, review_status: 'SUPERSEDED' })
    .in('id', ids)
    .eq('organisation_id', organisationId);
  if (error) throw new Error(error.message);
  return ids.length;
}
