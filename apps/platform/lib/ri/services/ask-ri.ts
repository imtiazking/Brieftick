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
  retrieval?: Record<string, unknown>;
  publicationPdf?: Record<string, unknown>;
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
  const { attachPublicationPdfEvidenceToAskRiState } = await import(
    '@/lib/ri/ask-ri/load-publication-pdf-evidence.mjs'
  );
  const { createSupabaseAdminClient } = await import('@/lib/supabase/admin');

  const state = (await buildAskRiStateFromSupabase(supabase, params.organisationId)) as Record<
    string,
    unknown
  >;
  state.asOfDate = new Date().toISOString().slice(0, 10);

  const admin = createSupabaseAdminClient();
  if (admin) {
    await attachPublicationPdfEvidenceToAskRiState(state, admin, params.question);
  } else {
    state.publicationPdfEvidence = [];
    state.publicationPdfEvidenceErrors = [{ code: 'admin_client_unavailable' }];
  }

  const result = runAskRiDeterministic(state, params.question) as AskRiResponse;

  if (process.env.ASK_RI_DIAGNOSTICS === '1') {
    const pdfMeta = state.publicationPdfEvidenceLoadMeta as Record<string, unknown> | undefined;
    console.info('[ask-ri] planner_result', {
      questionLength: params.question.length,
      pdfLoaded: (state.publicationPdfEvidence as unknown[] | undefined)?.length ?? 0,
      pdfLoadErrors: (state.publicationPdfEvidenceErrors as { code?: string; postgrestCode?: string }[] | undefined)?.map(
        (e) => ({ code: e.code, postgrestCode: e.postgrestCode }),
      ),
      scopedPublicationIds: (state.publicationPdfEvidenceLoadMeta as { scopedPublicationIds?: string[] })?.scopedPublicationIds,
      queryPlanMode: (result.queryPlan as Record<string, unknown> | undefined)?.mode,
      status: result.status,
      evidenceSource: result.execution?.evidenceSource,
      citationCount: result.citations?.length ?? 0,
      recordCount: result.recordCount,
    });
  }

  const { data: logRow, error: logError } = await supabase
    .from('ask_ri_query_log')
    .insert({
      organisation_id: params.organisationId,
      user_id: params.userId,
      question: params.question,
      interpreted_as: result.interpretedAs,
      status: result.status,
      record_count: result.recordCount,
      result_state: result.execution.resultState,
      plan_json: result.queryPlan ?? {},
    })
    .select('id')
    .single();

  if (logError || !logRow?.id) {
    throw new Error(logError?.message || 'ask_ri_query_log_insert_failed');
  }

  await recordWorkflowEvent(supabase, {
    organisationId: params.organisationId,
    entityType: 'ask_ri',
    entityId: logRow.id,
    eventType: 'ASK_RI_QUERY_COMPLETED',
    actorUserId: params.userId,
    metadata: {
      status: result.status,
      record_count: result.recordCount,
      ask_ri_query_log_id: logRow.id,
    },
  });

  return result;
}
