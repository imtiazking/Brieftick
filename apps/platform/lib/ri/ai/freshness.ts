import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { AI_FRESHNESS, AI_REVIEW_STATUS } from '@/lib/ri/ai/enums';
import { recordAiNotificationEvent } from '@/lib/ri/services/ai-notifications';
import { recordWorkflowEvent } from '@/lib/ri/workflow-events';

/** Mark all org analyses on prior publication versions OUTDATED when a new version becomes current. */
export async function markAnalysesOutdatedForPublicationVersion(
  supabase: SupabaseClient,
  publicationId: string,
  currentVersionId: string,
): Promise<number> {
  const { data: outdated, error: selectErr } = await supabase
    .from('ai_analysis_runs')
    .select('id, organisation_id, review_status')
    .eq('publication_id', publicationId)
    .neq('publication_version_id', currentVersionId)
    .eq('freshness', AI_FRESHNESS.CURRENT);
  if (selectErr) throw new Error(selectErr.message);
  if (!outdated?.length) return 0;

  for (const row of outdated) {
    const nextReview =
      row.review_status === AI_REVIEW_STATUS.HUMAN_REVIEW_REQUIRED ||
      row.review_status === AI_REVIEW_STATUS.AI_DRAFT
        ? AI_REVIEW_STATUS.SUPERSEDED
        : row.review_status;
    const { error } = await supabase
      .from('ai_analysis_runs')
      .update({ freshness: AI_FRESHNESS.OUTDATED, review_status: nextReview })
      .eq('id', row.id)
      .eq('organisation_id', row.organisation_id);
    if (error) throw new Error(error.message);

    await recordWorkflowEvent(supabase, {
      organisationId: row.organisation_id,
      entityType: 'ai_analysis_run',
      entityId: row.id,
      eventType: 'AI_ANALYSIS_SUPERSEDED',
      actorUserId: null,
      toStatus: AI_FRESHNESS.OUTDATED,
      metadata: { publication_id: publicationId, current_version_id: currentVersionId },
    });
    await recordAiNotificationEvent(supabase, {
      eventType: 'AI_ANALYSIS_OUTDATED',
      publicationId,
      organisationId: row.organisation_id,
      payload: { analysis_run_id: row.id, publication_version_id: currentVersionId },
    });
  }
  return outdated.length;
}
