import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { assessSourceIngestionEligibility } from '@/lib/ri/ingestion/eligibility.mjs';

export async function listSourcesForIngestionAdmin(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('regulatory_sources')
    .select(
      `id, external_key, name, verification_status, coverage_verification_status,
       production_status, ingestion_mode, content_classes, ri_uses,
       regulator:regulators(name, acronym, external_key),
       operations:regulatory_source_operations(
         enabled, health_status, last_success_at, last_failure_at, next_run_at,
         consecutive_failures, schedule_type, interval_minutes
       )`,
    )
    .order('external_key');
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const eligibility = assessSourceIngestionEligibility(row.external_key, {
      ingestionMode: row.ingestion_mode,
      productionStatus: row.production_status,
    });
    const ops = Array.isArray(row.operations) ? row.operations[0] : row.operations;
    return {
      ...row,
      regulator: Array.isArray(row.regulator) ? row.regulator[0] : row.regulator,
      operations: ops ?? null,
      ingestionEligible: eligibility.eligible,
      eligibilityReason: eligibility.reason,
      obligationGrade: eligibility.obligationGrade,
    };
  });
}

export async function listIngestionRuns(supabase: SupabaseClient, limit = 50) {
  const { data, error } = await supabase
    .from('ingestion_runs')
    .select(
      `id, run_type, status, trigger_type, attempt_number, queued_at, started_at, completed_at,
       records_discovered, records_new, records_updated, records_unchanged, records_failed,
       error_summary, environment, failure_class, next_retry_at,
       source:regulatory_sources(external_key, name)`,
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    ...r,
    source: Array.isArray(r.source) ? r.source[0] : r.source,
  }));
}

export async function getIngestionRunDetail(supabase: SupabaseClient, runId: string) {
  const { data: run, error } = await supabase
    .from('ingestion_runs')
    .select(
      `*, source:regulatory_sources(external_key, name)`,
    )
    .eq('id', runId)
    .single();
  if (error) throw new Error(error.message);
  const { data: items } = await supabase
    .from('ingestion_items')
    .select('id, title, canonical_url, normalisation_status, retrieval_status, publication_id, error_detail')
    .eq('ingestion_run_id', runId)
    .order('created_at');
  return {
    run: { ...run, source: Array.isArray(run.source) ? run.source[0] : run.source },
    items: items ?? [],
  };
}

export async function listOperationalAlerts(supabase: SupabaseClient, limit = 100) {
  const { data, error } = await supabase
    .from('operational_alerts')
    .select(
      `id, category, severity, status, title, message, first_seen_at, last_seen_at,
       acknowledged_at, resolved_at, dedupe_key,
       source:regulatory_sources(external_key, name)`,
    )
    .order('last_seen_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((a) => ({
    ...a,
    source: Array.isArray(a.source) ? a.source[0] : a.source,
  }));
}
