import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

export type WorkflowEventRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_user_id: string | null;
  occurred_at: string;
  metadata: Record<string, unknown> | null;
};

export async function listWorkflowEvents(
  supabase: SupabaseClient,
  organisationId: string,
  limit = 50,
): Promise<WorkflowEventRow[]> {
  const { data, error } = await supabase
    .from('workflow_events')
    .select(
      'id, entity_type, entity_id, event_type, from_status, to_status, actor_user_id, occurred_at, metadata',
    )
    .eq('organisation_id', organisationId)
    .order('occurred_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as WorkflowEventRow[];
}
