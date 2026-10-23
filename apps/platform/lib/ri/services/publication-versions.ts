import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { markAnalysesOutdatedForPublicationVersion } from '@/lib/ri/ai/freshness';

export async function getLatestPublicationVersion(
  supabase: SupabaseClient,
  publicationId: string,
): Promise<{ id: string; version_number: number } | null> {
  const { data, error } = await supabase
    .from('regulatory_publication_versions')
    .select('id, version_number')
    .eq('publication_id', publicationId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Call after inserting a new regulatory_publication_versions row (ingestion or admin). */
export async function onPublicationVersionAdvanced(
  supabase: SupabaseClient,
  publicationId: string,
  newVersionId: string,
): Promise<number> {
  return markAnalysesOutdatedForPublicationVersion(supabase, publicationId, newVersionId);
}
