import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { AI_EXECUTION_STATUS } from '@/lib/ri/ai/enums';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { recordWorkflowEvent, type WorkflowEventType } from '@/lib/ri/workflow-events';

const FINAL_RUN_FIELDS = [
  'execution_status',
  'review_status',
  'structured_output',
  'latency_ms',
  'completed_at',
  'error_code',
  'error_message',
] as const;

export class AiRunFinalisationError extends Error {
  readonly step: string;
  constructor(step: string, message: string) {
    super(`ai_run_finalisation_failed:${step}:${message}`);
    this.step = step;
  }
}

/**
 * Writes the outcome of one already-authorised run (status, output, citations, events).
 * A live provider call can outlast the requester's session JWT, so these writes use the
 * service-role client, pinned to this organisation and run, and only while the run is RUNNING.
 */
export function createAiRunFinaliser(
  userClient: SupabaseClient,
  params: { organisationId: string; runId: string; actorUserId: string },
) {
  const admin = createSupabaseAdminClient();
  const client: SupabaseClient = admin ?? userClient;

  return {
    client,
    usesServiceRole: admin != null,

    async finishRun(patch: Partial<Record<(typeof FINAL_RUN_FIELDS)[number], unknown>>) {
      const row: Record<string, unknown> = {};
      for (const k of FINAL_RUN_FIELDS) if (k in patch) row[k] = patch[k];
      const { data, error } = await client
        .from('ai_analysis_runs')
        .update(row)
        .eq('id', params.runId)
        .eq('organisation_id', params.organisationId)
        .eq('execution_status', AI_EXECUTION_STATUS.RUNNING)
        .select('id');
      if (error) throw new AiRunFinalisationError('run_update', error.message);
      if (!data?.length) throw new AiRunFinalisationError('run_update', 'run_not_running');
    },

    async insertCitations(
      rows: Array<{
        claim_index: number;
        claim_text: string;
        source_section_ids: string[];
        citation_status: string;
        grounding_status: string | null;
      }>,
    ) {
      if (!rows.length) return;
      const { error } = await client.from('ai_analysis_citations').insert(
        rows.map((r) => ({
          ...r,
          organisation_id: params.organisationId,
          analysis_run_id: params.runId,
        })),
      );
      if (error) throw new AiRunFinalisationError('citations_insert', error.message);
    },

    async recordEvent(event: {
      eventType: WorkflowEventType;
      toStatus: string;
      metadata?: Record<string, unknown>;
    }) {
      try {
        await recordWorkflowEvent(client, {
          organisationId: params.organisationId,
          entityType: 'ai_analysis_run',
          entityId: params.runId,
          eventType: event.eventType,
          actorUserId: params.actorUserId,
          toStatus: event.toStatus,
          metadata: event.metadata,
        });
      } catch (err) {
        throw new AiRunFinalisationError('workflow_event', err instanceof Error ? err.message : String(err));
      }
    },
  };
}
