import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlatformRole } from '@/lib/roles';
import { mapCitationStatusToDb, validateCitations, type AiClaim } from '@/lib/ri/ai/citation-validator';
import { AI_ERRORS } from '@/lib/ri/ai/errors';
import {
  AI_EXECUTION_STATUS,
  AI_FRESHNESS,
  AI_REVIEW_STATUS,
  PROCESSING_ELIGIBILITY,
} from '@/lib/ri/ai/enums';
import { validateStructuredOutput, mapSchemaForAnalysisType } from '@/lib/ri/ai/output-schemas';
import { getAiProvider, resolveAiProviderMode, FIXTURE_PROVIDER_ID } from '@/lib/ri/ai/provider-registry';
import { getUseCaseById } from '@/lib/ri/ai/use-case-catalog';
import { assertCanRi } from '@/lib/ri/permissions';
import { materialiseReviewedClaims } from '@/lib/ri/services/ai-materialisation';
import { recordAiNotificationEvent } from '@/lib/ri/services/ai-notifications';
import { getLatestPublicationVersion } from '@/lib/ri/services/publication-versions';
import { recordWorkflowEvent } from '@/lib/ri/workflow-events';

export type AnalysisRunRow = {
  id: string;
  organisation_id: string;
  use_case_id: string;
  publication_id: string;
  publication_version_id: string;
  execution_status: string;
  review_status: string;
  freshness: string;
  provider: string;
  model: string | null;
  prompt_version: string;
  structured_output: Record<string, unknown> | null;
  error_code: string | null;
  latency_ms: number | null;
  created_at: string;
  completed_at: string | null;
};

async function buildPublicationContext(
  supabase: SupabaseClient,
  publicationVersionId: string,
) {
  const { data: version } = await supabase
    .from('regulatory_publication_versions')
    .select('id, version_number, full_text, summary')
    .eq('id', publicationVersionId)
    .single();
  if (!version) throw new Error('publication_version_not_found');
  const sectionId = `SRCSEC-${String(version.id).replace(/-/g, '').slice(0, 12)}`;
  const text = version.full_text || version.summary || 'Publication source text unavailable.';
  return {
    sourceSections: [
      {
        sourceSectionId: sectionId,
        citation: `v${version.version_number}`,
        text: String(text).slice(0, 8000),
      },
    ],
    allowedSectionIds: [sectionId],
  };
}

export async function listAnalysisRunsForPublication(
  supabase: SupabaseClient,
  organisationId: string,
  publicationId: string,
  currentVersionId: string | null,
  limit = 50,
): Promise<AnalysisRunRow[]> {
  const runs = await listAnalysisRuns(supabase, organisationId, limit);
  const filtered = runs.filter((r) => r.publication_id === publicationId);
  return filtered.sort((a, b) => {
    const aCurrent = currentVersionId && a.publication_version_id === currentVersionId ? 1 : 0;
    const bCurrent = currentVersionId && b.publication_version_id === currentVersionId ? 1 : 0;
    if (aCurrent !== bCurrent) return bCurrent - aCurrent;
    return b.created_at.localeCompare(a.created_at);
  });
}

export async function listAnalysisRuns(
  supabase: SupabaseClient,
  organisationId: string,
  limit = 50,
): Promise<AnalysisRunRow[]> {
  const { data, error } = await supabase
    .from('ai_analysis_runs')
    .select(
      'id, organisation_id, use_case_id, publication_id, publication_version_id, execution_status, review_status, freshness, provider, model, prompt_version, structured_output, error_code, latency_ms, created_at, completed_at',
    )
    .eq('organisation_id', organisationId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as AnalysisRunRow[];
}

export async function getAnalysisRun(
  supabase: SupabaseClient,
  organisationId: string,
  runId: string,
) {
  const { data: run, error } = await supabase
    .from('ai_analysis_runs')
    .select('*')
    .eq('id', runId)
    .eq('organisation_id', organisationId)
    .single();
  if (error || !run) throw new Error('not_found');

  const { data: citations } = await supabase
    .from('ai_analysis_citations')
    .select('*')
    .eq('analysis_run_id', runId)
    .eq('organisation_id', organisationId)
    .order('claim_index', { ascending: true });

  const { data: reviews } = await supabase
    .from('ai_analysis_reviews')
    .select('*')
    .eq('analysis_run_id', runId)
    .eq('organisation_id', organisationId)
    .order('created_at', { ascending: false });

  return { run, citations: citations ?? [], reviews: reviews ?? [] };
}

export async function requestPublicationAnalysis(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    userId: string;
    role: PlatformRole;
    publicationId: string;
    publicationVersionId: string;
    useCaseId: string;
    fixtureScenario?: string;
    targetEntityId?: string;
  },
) {
  assertCanRi(params.role, 'ai:request');
  const useCase = getUseCaseById(params.useCaseId);
  if (!useCase || useCase.status !== 'Active') throw new Error('invalid_use_case');

  const latest = await getLatestPublicationVersion(supabase, params.publicationId);
  if (!latest || latest.id !== params.publicationVersionId) {
    throw new Error('publication_version_not_current');
  }

  const analysisType = useCase.analysisTypes[0];
  const ctx = await buildPublicationContext(supabase, params.publicationVersionId);
  const providerMode = resolveAiProviderMode();
  const provider = getAiProvider(providerMode);
  const promptVersion = useCase.promptVersion;

  const idempotencyKey = `${params.useCaseId}:${params.publicationVersionId}:${params.organisationId}`;

  const { data: runRow, error: insertErr } = await supabase
    .from('ai_analysis_runs')
    .insert({
      organisation_id: params.organisationId,
      use_case_id: params.useCaseId,
      publication_id: params.publicationId,
      publication_version_id: params.publicationVersionId,
      target_entity_id: params.targetEntityId ?? null,
      execution_status: AI_EXECUTION_STATUS.RUNNING,
      review_status: AI_REVIEW_STATUS.AI_DRAFT,
      freshness: AI_FRESHNESS.CURRENT,
      provider: provider.id,
      model: providerMode === 'FIXTURE' ? 'fixture-ri' : 'openai',
      prompt_version: promptVersion,
      processing_eligibility: PROCESSING_ELIGIBILITY.REVIEW_REQUIRED,
      requested_by: params.userId,
      idempotency_key: idempotencyKey,
    })
    .select()
    .single();

  if (insertErr) {
    if (insertErr.code === '23505') {
      const { data: existing } = await supabase
        .from('ai_analysis_runs')
        .select('id')
        .eq('organisation_id', params.organisationId)
        .eq('idempotency_key', idempotencyKey)
        .single();
      if (existing) return { ok: true, reused: true, runId: existing.id };
    }
    throw new Error(insertErr.message);
  }

  await recordWorkflowEvent(supabase, {
    organisationId: params.organisationId,
    entityType: 'ai_analysis_run',
    entityId: runRow.id,
    eventType: 'AI_ANALYSIS_REQUESTED',
    actorUserId: params.userId,
    toStatus: AI_EXECUTION_STATUS.RUNNING,
  });

  const started = Date.now();
  const providerResult = await provider.execute({
    useCaseId: params.useCaseId,
    analysisType,
    fixtureScenario: params.fixtureScenario,
    context: ctx,
  });
  const latencyMs = Date.now() - started;

  if (!providerResult.ok || !('structured' in providerResult)) {
    await supabase
      .from('ai_analysis_runs')
      .update({
        execution_status: AI_EXECUTION_STATUS.FAILED,
        error_code: 'code' in providerResult ? providerResult.code : AI_ERRORS.AI_PROVIDER_UNAVAILABLE,
        error_message: 'message' in providerResult ? providerResult.message : 'provider_failed',
        latency_ms: latencyMs,
        completed_at: new Date().toISOString(),
      })
      .eq('id', runRow.id);
    await recordWorkflowEvent(supabase, {
      organisationId: params.organisationId,
      entityType: 'ai_analysis_run',
      entityId: runRow.id,
      eventType: 'AI_ANALYSIS_FAILED',
      actorUserId: params.userId,
      toStatus: AI_EXECUTION_STATUS.FAILED,
      metadata: { code: providerResult.code },
    });
    return { ok: false, runId: runRow.id, code: providerResult.code };
  }

  const successResult = providerResult as {
    structured: Record<string, unknown>;
    schemaName?: string;
  };
  const schemaCheck = validateStructuredOutput(
    successResult.schemaName || mapSchemaForAnalysisType(analysisType),
    successResult.structured,
  );
  if (!schemaCheck.ok) {
    await supabase
      .from('ai_analysis_runs')
      .update({
        execution_status: AI_EXECUTION_STATUS.VALIDATION_FAILED,
        error_code: schemaCheck.code,
        error_message: schemaCheck.message,
        latency_ms: latencyMs,
        completed_at: new Date().toISOString(),
      })
      .eq('id', runRow.id);
    return { ok: false, runId: runRow.id, code: schemaCheck.code };
  }

  const claims = ((successResult.structured as { claims?: AiClaim[] }).claims || []).map((c, i) => ({
    ...c,
    id: `claim-${i}`,
  }));
  const cite = validateCitations(claims, ctx.allowedSectionIds);
  const reviewStatus =
    cite.ok && useCase.humanOversightRequired
      ? AI_REVIEW_STATUS.HUMAN_REVIEW_REQUIRED
      : AI_REVIEW_STATUS.AI_DRAFT;

  await supabase
    .from('ai_analysis_runs')
    .update({
      execution_status: AI_EXECUTION_STATUS.COMPLETED,
      review_status: reviewStatus,
      structured_output: successResult.structured,
      latency_ms: latencyMs,
      completed_at: new Date().toISOString(),
      error_code: cite.ok ? null : AI_ERRORS.AI_CITATION_INVALID,
    })
    .eq('id', runRow.id);

  for (let i = 0; i < claims.length; i++) {
    const c = claims[i];
    await supabase.from('ai_analysis_citations').insert({
      organisation_id: params.organisationId,
      analysis_run_id: runRow.id,
      claim_index: i,
      claim_text: c.text || '',
      source_section_ids: c.sourceSectionIds || [],
      citation_status: mapCitationStatusToDb(c),
      grounding_status: c.groundingStatus || null,
    });
  }

  await recordWorkflowEvent(supabase, {
    organisationId: params.organisationId,
    entityType: 'ai_analysis_run',
    entityId: runRow.id,
    eventType: 'AI_ANALYSIS_COMPLETED',
    actorUserId: params.userId,
    toStatus: AI_EXECUTION_STATUS.COMPLETED,
  });

  if (reviewStatus === AI_REVIEW_STATUS.HUMAN_REVIEW_REQUIRED) {
    await recordAiNotificationEvent(supabase, {
      eventType: 'AI_REVIEW_REQUIRED',
      publicationId: params.publicationId,
      organisationId: params.organisationId,
      payload: { analysis_run_id: runRow.id, use_case_id: params.useCaseId },
    });
  }

  return { ok: true, runId: runRow.id, citationValid: cite.ok };
}

export async function submitAnalysisReview(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    userId: string;
    role: PlatformRole;
    runId: string;
    decision: 'ACCEPTED' | 'PARTIALLY_ACCEPTED' | 'REJECTED';
    acceptedClaimIndexes: number[];
    rejectedClaimIndexes: number[];
    notes?: string;
  },
) {
  assertCanRi(params.role, 'ai:review');
  const { run } = await getAnalysisRun(supabase, params.organisationId, params.runId);
  if (
    run.review_status === AI_REVIEW_STATUS.ACCEPTED ||
    run.review_status === AI_REVIEW_STATUS.REJECTED ||
    run.review_status === AI_REVIEW_STATUS.SUPERSEDED
  ) {
    throw new Error('already_reviewed');
  }
  if (run.freshness === AI_FRESHNESS.OUTDATED) {
    throw new Error('analysis_outdated');
  }

  const decision =
    params.decision === 'ACCEPTED'
      ? AI_REVIEW_STATUS.ACCEPTED
      : params.decision === 'PARTIALLY_ACCEPTED'
        ? AI_REVIEW_STATUS.PARTIALLY_ACCEPTED
        : AI_REVIEW_STATUS.REJECTED;

  const { data: reviewRow, error: reviewErr } = await supabase
    .from('ai_analysis_reviews')
    .insert({
      organisation_id: params.organisationId,
      analysis_run_id: params.runId,
      decision,
      reviewer_user_id: params.userId,
      accepted_claim_indexes: params.acceptedClaimIndexes,
      rejected_claim_indexes: params.rejectedClaimIndexes,
      notes: params.notes ?? null,
    })
    .select('id')
    .single();
  if (reviewErr || !reviewRow) throw new Error(reviewErr?.message || 'review_insert_failed');

  await supabase
    .from('ai_analysis_runs')
    .update({ review_status: decision })
    .eq('id', params.runId)
    .eq('organisation_id', params.organisationId);

  const eventType =
    decision === AI_REVIEW_STATUS.REJECTED
      ? 'AI_REVIEW_REJECTED'
      : decision === AI_REVIEW_STATUS.PARTIALLY_ACCEPTED
        ? 'AI_REVIEW_PARTIALLY_ACCEPTED'
        : 'AI_REVIEW_ACCEPTED';

  await recordWorkflowEvent(supabase, {
    organisationId: params.organisationId,
    entityType: 'ai_analysis_run',
    entityId: params.runId,
    eventType,
    actorUserId: params.userId,
    toStatus: decision,
    metadata: {
      origin: 'AI_ASSISTED',
      analysis_run_id: params.runId,
      review_id: reviewRow.id,
      created_by_user_id: params.userId,
    },
  });

  await recordAiNotificationEvent(supabase, {
    eventType: 'AI_REVIEW_COMPLETED',
    publicationId: run.publication_id,
    organisationId: params.organisationId,
    payload: {
      analysis_run_id: params.runId,
      review_id: reviewRow.id,
      decision,
    },
  });

  const { materialised } = await materialiseReviewedClaims(supabase, {
    organisationId: params.organisationId,
    userId: params.userId,
    role: params.role,
    runId: params.runId,
    reviewId: reviewRow.id,
    decision,
    acceptedClaimIndexes: params.acceptedClaimIndexes,
  });

  return { ok: true, reviewId: reviewRow.id, materialised };
}

export function getProviderStatusForUi() {
  const mode = resolveAiProviderMode();
  return {
    mode,
    fixtureActive: mode === 'FIXTURE' || !process.env.OPENAI_API_KEY,
    openAiConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
    label:
      mode === 'OPENAI' && process.env.OPENAI_API_KEY
        ? 'OpenAI configured (server-side)'
        : 'AI provider not configured — fixture mode for development.',
  };
}

export { FIXTURE_PROVIDER_ID };
