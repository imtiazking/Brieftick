import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlatformRole } from '@/lib/roles';
import { assertCanRi } from '@/lib/ri/permissions';
import { recordWorkflowEvent } from '@/lib/ri/workflow-events';

export type AskRiResponse = {
  question: string;
  interpretedAs: string;
  status: string;
  answer: string;
  records: { id: string; type: string; reason: string | null }[];
  recordCount: number;
  citations: unknown[];
  evidence: unknown[];
  queryPlan: unknown;
  execution: Record<string, unknown>;
};

/** Server-side Ask RI (read-only). Uses ported deterministic planner/executor + production state. */
export async function askRiProduction(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    userId: string;
    role: PlatformRole;
    question: string;
  },
): Promise<AskRiResponse> {
  assertCanRi(params.role, 'ask-ri:read');

  const { buildAskRiStateFromSupabase } = await import('@/lib/ri/ask-ri/production-state.mjs');
  const { runAskRiDeterministic } = await import('@/lib/ri/ask-ri/run-ask-ri.mjs');

  const state = await buildAskRiStateFromSupabase(supabase, params.organisationId);
  state.asOfDate = new Date().toISOString().slice(0, 10);
  const result = runAskRiDeterministic(state, params.question);

  await supabase.from('ask_ri_query_log').insert({
    organisation_id: params.organisationId,
    user_id: params.userId,
    question: params.question,
    interpreted_as: result.interpretedAs,
    status: result.status,
    record_count: result.recordCount,
    result_state: result.execution.resultState,
    plan_json: result.queryPlan ?? {},
  });

  await recordWorkflowEvent(supabase, {
    organisationId: params.organisationId,
    entityType: 'ask_ri',
    entityId: params.userId,
    eventType: 'ASK_RI_QUERY_COMPLETED',
    actorUserId: params.userId,
    metadata: {
      status: result.status,
      record_count: result.recordCount,
    },
  });

  return result;
}
