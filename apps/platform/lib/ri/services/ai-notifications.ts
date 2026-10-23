import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

export type AiNotificationType =
  | 'AI_REVIEW_REQUIRED'
  | 'AI_ANALYSIS_OUTDATED'
  | 'AI_REVIEW_COMPLETED'
  | 'AI_MATERIALISATION_COMPLETED';

const recentKeys = new Map<string, number>();
const DEDUPE_MS = 60_000;

function shouldEmit(dedupeKey: string): boolean {
  const now = Date.now();
  const last = recentKeys.get(dedupeKey);
  if (last && now - last < DEDUPE_MS) return false;
  recentKeys.set(dedupeKey, now);
  return true;
}

/** In-app notification_events row (no external email/SMS). */
export async function recordAiNotificationEvent(
  supabase: SupabaseClient,
  params: {
    eventType: AiNotificationType;
    publicationId?: string | null;
    organisationId: string;
    payload: Record<string, unknown>;
  },
) {
  const dedupeKey = `${params.eventType}:${params.organisationId}:${params.payload.analysis_run_id ?? ''}:${params.payload.review_id ?? ''}`;
  if (!shouldEmit(dedupeKey)) return;

  const { error } = await supabase.from('notification_events').insert({
    event_type: params.eventType,
    publication_id: params.publicationId ?? null,
    payload: {
      organisation_id: params.organisationId,
      ...params.payload,
    },
  });
  if (error) throw new Error(error.message);
}
