'use server';

import { requireRiContext } from '@/lib/ri/context';

export async function submitAskRiQuestionAction(formData: FormData) {
  const ctx = await requireRiContext('ask-ri:read');
  const question = String(formData.get('question') || '').trim();
  if (!question) return { ok: false, error: 'empty_question' };

  const { buildAskRiStateFromSupabase } = await import('@/lib/ri/ask-ri/production-state.mjs');
  const { runAskRiProduction } = await import('@/lib/ri/ask-ri/run-ask-ri-production.mjs');
  const { attachPublicationPdfEvidenceToAskRiState } = await import(
    '@/lib/ri/ask-ri/load-publication-pdf-evidence.mjs'
  );
  const { createSupabaseAdminClient } = await import('@/lib/supabase/admin');

  const state = (await buildAskRiStateFromSupabase(ctx.supabase, ctx.organisationId)) as Record<
    string,
    unknown
  >;
  state.asOfDate = new Date().toISOString().slice(0, 10);

  const admin = createSupabaseAdminClient();
  if (admin) {
    await attachPublicationPdfEvidenceToAskRiState(state, admin);
  } else {
    state.publicationPdfEvidence = [];
    state.publicationPdfEvidenceErrors = [{ code: 'admin_client_unavailable' }];
  }

  const result = (await runAskRiProduction(state, question)) as Awaited<
    ReturnType<typeof runAskRiProduction>
  >;

  await ctx.supabase.from('ask_ri_query_log').insert({
    organisation_id: ctx.organisationId,
    user_id: ctx.userId,
    question,
    interpreted_as: result.interpretedAs,
    status: result.status,
    record_count: result.recordCount,
    result_state: result.execution.resultState,
    plan_json: result.queryPlan ?? {},
  });

  return { ok: true, result };
}
