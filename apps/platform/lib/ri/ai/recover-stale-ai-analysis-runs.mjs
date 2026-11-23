/**
 * Hosted UC-RI-005: RUNNING rows older than maxDuration indicate a killed worker (Vercel timeout).
 * Fail closed with a visible error so idempotent resume can proceed without duplicate provider billing.
 */
/** Slightly above ri-lab ai-analysis-runs maxDuration (300s). */
export const STALE_AI_ANALYSIS_RUN_MINUTES = 31;

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 */
export async function recoverStaleAiAnalysisRuns(admin, options = {}) {
  const minutes = options.olderThanMinutes ?? STALE_AI_ANALYSIS_RUN_MINUTES;
  const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString();
  const { data: stale, error: selErr } = await admin
    .from('ai_analysis_runs')
    .select('id, organisation_id, use_case_id, idempotency_key, created_at')
    .eq('execution_status', 'RUNNING')
    .lt('created_at', cutoff);
  if (selErr) throw new Error(selErr.message);
  if (!stale?.length) return { recovered: 0, runIds: [] };

  const runIds = [];
  for (const row of stale) {
    const { error: updErr } = await admin
      .from('ai_analysis_runs')
      .update({
        execution_status: 'FAILED',
        error_code: 'AI_RUN_FINALISATION_FAILED',
        error_message: 'stale_running_recovered_after_hosted_timeout',
        completed_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .eq('execution_status', 'RUNNING');
    if (!updErr) runIds.push(row.id);
  }
  return { recovered: runIds.length, runIds };
}