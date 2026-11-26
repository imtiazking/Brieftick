import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildRegulatoryEvidencePack } from '@/lib/ri/ai/lifecycle-evidence.mjs';

export type RegulatoryEvidencePack = ReturnType<typeof buildRegulatoryEvidencePack>;

/**
 * Evidence pack for a downstream stage: the pack carried on the parent record when present, otherwise rebuilt from the
 * originating obligation (tenant-scoped). Returns null when the lineage has no obligation, never a guessed pack.
 */
export async function resolveRegulatoryEvidencePack(
  supabase: SupabaseClient,
  organisationId: string,
  parentMetadata: Record<string, unknown> | null | undefined,
): Promise<RegulatoryEvidencePack | null> {
  const carried = (parentMetadata?.regulatoryEvidence as { pack?: RegulatoryEvidencePack } | undefined)?.pack;
  if (carried && typeof carried === 'object') return carried;
  const obligationId = parentMetadata?.sourceRegulatoryObligationId;
  if (typeof obligationId !== 'string' || !obligationId) return null;
  const { data, error } = await supabase
    .from('regulatory_obligations')
    .select('id, obligation_statement, citation, effective_date, publication_id, metadata')
    .eq('id', obligationId)
    .eq('organisation_id', organisationId)
    .maybeSingle();
  if (error || !data) return null;
  return buildRegulatoryEvidencePack(data);
}
