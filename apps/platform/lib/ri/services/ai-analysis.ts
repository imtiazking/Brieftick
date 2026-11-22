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
import {
  getAiProvider,
  resolveAiProviderMode,
  resolveLiveProviderFallbackError,
  resolveModelForProviderMode,
  FIXTURE_PROVIDER_ID,
} from '@/lib/ri/ai/provider-registry';
import { assertExperimentalAiTenant } from '@/lib/ri/ai/experimental-ai-tenant-guard';
import {
  assessApplicabilityGate,
  assessObligationExtractionTarget,
} from '@/lib/ri/ai/obligation-chain-gates.mjs';
import { isRiAiExecutionEnabled } from '@/lib/ri/ai/ri-ai-execution';
import { AI_PROVIDER_MODE } from '@/lib/ri/ai/enums';
import { getUseCaseById } from '@/lib/ri/ai/use-case-catalog';
import { assertCanRi } from '@/lib/ri/permissions';
import { RiConflictError } from '@/lib/ri/errors';
import { assertAiReviewerSoD } from '@/lib/ri/separation-of-duties';
import { materialiseReviewedClaims } from '@/lib/ri/services/ai-materialisation';
import { recordAiNotificationEvent } from '@/lib/ri/services/ai-notifications';
import { AiRunFinalisationError, createAiRunFinaliser } from '@/lib/ri/services/ai-run-finaliser';
import { getApplicabilityForPublication } from '@/lib/ri/services/applicability';
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
  idempotency_key?: string | null;
  created_at: string;
  completed_at: string | null;
};

type AnalysisSourceContext = {
  sourceSections: Array<{ sourceSectionId: string; citation: string; text: string }>;
  allowedSectionIds: string[];
  contextKind: 'publication_summary' | 'pdf_primary_v1';
  grounding?: Record<string, unknown>;
};

async function buildSummaryPublicationContext(
  supabase: SupabaseClient,
  publicationVersionId: string,
): Promise<AnalysisSourceContext> {
  const { data: version, error: versionError } = await supabase
    .from('regulatory_publication_versions')
    .select('id, version_number, publication_id')
    .eq('id', publicationVersionId)
    .single();
  if (versionError || !version) throw new Error('publication_version_not_found');

  const { data: publication } = await supabase
    .from('regulatory_publications')
    .select('title, summary')
    .eq('id', version.publication_id)
    .maybeSingle();

  const sectionId = `SRCSEC-${String(version.id).replace(/-/g, '').slice(0, 12)}`;
  const text =
    publication?.summary?.trim() ||
    publication?.title?.trim() ||
    'Publication source text unavailable.';
  return {
    sourceSections: [
      {
        sourceSectionId: sectionId,
        citation: `v${version.version_number}`,
        text: String(text).slice(0, 8000),
      },
    ],
    allowedSectionIds: [sectionId],
    contextKind: 'publication_summary',
  };
}

async function buildPublicationContext(
  supabase: SupabaseClient,
  publicationVersionId: string,
  publicationId: string,
  useCaseId: string,
  groundingOptions?: {
    extractionBatchIndex?: number;
    maxSectionsPerBatch?: number;
    cumulativeSuppliedProvisionCores?: string[];
    targetProvisionCores?: string[];
  },
): Promise<AnalysisSourceContext> {
  const pdfGrounded = useCaseId === 'UC-RI-005' || useCaseId === 'UC-RI-002';
  if (pdfGrounded) {
    const { buildPdfGroundedAnalysisContext } = await import(
      '@/lib/ri/ai/build-pdf-grounded-analysis-context.mjs'
    );
    const pdf = await buildPdfGroundedAnalysisContext({
      publicationId,
      publicationVersionId,
      useCaseId,
      ...groundingOptions,
    });
    if (!pdf.ok || !pdf.sourceSections?.length || !pdf.allowedSectionIds?.length) {
      throw new Error(pdf.code || 'pdf_grounding_unavailable');
    }
    return {
      sourceSections: pdf.sourceSections.map((s: { sourceSectionId: string; citation: string; text: string }) => ({
        sourceSectionId: s.sourceSectionId,
        citation: s.citation,
        text: s.text,
      })),
      allowedSectionIds: [...pdf.allowedSectionIds],
      contextKind: 'pdf_primary_v1',
      grounding: pdf.grounding as Record<string, unknown>,
    };
  }
  return buildSummaryPublicationContext(supabase, publicationVersionId);
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
      'id, organisation_id, use_case_id, publication_id, publication_version_id, execution_status, review_status, freshness, provider, model, prompt_version, structured_output, error_code, latency_ms, created_at, completed_at, idempotency_key',
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

/** UC-RI-005 output can only materialise against an applicable publication's change in this organisation. */
export async function assertObligationExtractionPrerequisites(
  supabase: SupabaseClient,
  params: { organisationId: string; publicationId: string; targetChangeId: string | null },
) {
  const { data: change } = params.targetChangeId
    ? await supabase
        .from('regulatory_changes')
        .select('id, publication_id')
        .eq('id', params.targetChangeId)
        .eq('organisation_id', params.organisationId)
        .maybeSingle()
    : { data: null };
  const target = assessObligationExtractionTarget({
    targetChangeId: params.targetChangeId,
    change,
    publicationId: params.publicationId,
  });
  if (!target.ok) throw new Error(target.code);

  const assessment = await getApplicabilityForPublication(
    supabase,
    params.organisationId,
    params.publicationId,
  );
  const applicability = assessApplicabilityGate(assessment);
  if (!applicability.ok) throw new Error(applicability.code);
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
    idempotencyKeySuffix?: string;
    extractionBatchIndex?: number;
    maxSectionsPerBatch?: number;
    cumulativeSuppliedProvisionCores?: string[];
    targetProvisionCores?: string[];
  },
) {
  assertCanRi(params.role, 'ai:request');
  assertExperimentalAiTenant({
    organisationId: params.organisationId,
    useCaseId: params.useCaseId,
    operation: 'request',
  });
  const useCase = getUseCaseById(params.useCaseId);
  if (!useCase || useCase.status !== 'Active') throw new Error('invalid_use_case');

  if (params.useCaseId === 'UC-RI-005') {
    await assertObligationExtractionPrerequisites(supabase, {
      organisationId: params.organisationId,
      publicationId: params.publicationId,
      targetChangeId: params.targetEntityId ?? null,
    });
  }

  const latest = await getLatestPublicationVersion(supabase, params.publicationId);
  if (!latest || latest.id !== params.publicationVersionId) {
    throw new Error('publication_version_not_current');
  }

  const idempotencySuffix = params.idempotencyKeySuffix?.trim() || '';
  const idempotencyKey = idempotencySuffix
    ? `${params.useCaseId}:${params.publicationVersionId}:${params.organisationId}:${idempotencySuffix}`
    : `${params.useCaseId}:${params.publicationVersionId}:${params.organisationId}`;

  const { data: priorRun } = await supabase
    .from('ai_analysis_runs')
    .select('id, execution_status')
    .eq('organisation_id', params.organisationId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (priorRun) {
    return { ok: true, reused: true, runId: priorRun.id, executionStatus: priorRun.execution_status };
  }

  if (params.useCaseId === 'UC-RI-005' && isRiAiExecutionEnabled()) {
    const { assertUcRi005LiveTrialIdempotency } = await import(
      '@/lib/ri/ai/lab-anthropic-spend-guard.mjs'
    );
    const idemCheck = assertUcRi005LiveTrialIdempotency(idempotencyKey, { executionEnabled: true });
    if (!idemCheck.ok) throw new RiConflictError(idemCheck.code || 'uc_ri_005_run_reference_not_authorised');
  }

  const analysisType = useCase.analysisTypes[0];
  const ctx = await buildPublicationContext(
    supabase,
    params.publicationVersionId,
    params.publicationId,
    params.useCaseId,
    {
      extractionBatchIndex: params.extractionBatchIndex,
      maxSectionsPerBatch: params.maxSectionsPerBatch,
      cumulativeSuppliedProvisionCores: params.cumulativeSuppliedProvisionCores,
      targetProvisionCores: params.targetProvisionCores,
    },
  );
  const fallbackCode = resolveLiveProviderFallbackError();
  if (fallbackCode) {
    throw new Error(fallbackCode);
  }
  const providerMode = resolveAiProviderMode();
  const provider = getAiProvider(providerMode);
  const promptVersion = useCase.promptVersion;

  const { data: insertedRun, error: insertErr } = await supabase
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
      model: resolveModelForProviderMode(providerMode),
      prompt_version: promptVersion,
      processing_eligibility: PROCESSING_ELIGIBILITY.REVIEW_REQUIRED,
      requested_by: params.userId,
      idempotency_key: idempotencyKey,
    })
    .select()
    .single();

  if (insertErr) {
    if (insertErr.code !== '23505') throw new Error(insertErr.message);
    const { data: existing } = await supabase
      .from('ai_analysis_runs')
      .select('id, execution_status')
      .eq('organisation_id', params.organisationId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (existing) {
      return { ok: true, reused: true, runId: existing.id, executionStatus: existing.execution_status };
    }
    // Unique violation without a matching key is the one-RUNNING-UC-RI-005-per-organisation index.
    throw new RiConflictError('uc_ri_005_run_in_progress');
  }

  const runRow = insertedRun as AnalysisRunRow | null;
  if (!runRow) throw new Error('ai_analysis_run_insert_failed');

  await recordWorkflowEvent(supabase, {
    organisationId: params.organisationId,
    entityType: 'ai_analysis_run',
    entityId: runRow.id,
    eventType: 'AI_ANALYSIS_REQUESTED',
    actorUserId: params.userId,
    toStatus: AI_EXECUTION_STATUS.RUNNING,
  });

  const finaliser = createAiRunFinaliser(supabase, {
    organisationId: params.organisationId,
    runId: runRow.id,
    actorUserId: params.userId,
  });

  if (params.useCaseId === 'UC-RI-005' && isRiAiExecutionEnabled()) {
    const { data: overlapping, error: overlapErr } = await supabase
      .from('ai_analysis_runs')
      .select('id, idempotency_key')
      .eq('organisation_id', params.organisationId)
      .eq('use_case_id', 'UC-RI-005')
      .eq('execution_status', AI_EXECUTION_STATUS.RUNNING)
      .neq('id', runRow.id)
      .limit(1);
    if (overlapErr || overlapping?.length) {
      const code = overlapErr ? AI_ERRORS.AI_RUN_PRECHECK_FAILED : AI_ERRORS.LAB_TRIAL_OVERLAP;
      await finaliser.finishRun({
        execution_status: AI_EXECUTION_STATUS.FAILED,
        error_code: code,
        error_message: overlapErr
          ? `Overlap check failed before the provider call: ${overlapErr.message}`
          : 'Another UC-RI-005 analysis is already RUNNING for this organisation.',
        completed_at: new Date().toISOString(),
      });
      await finaliser.recordEvent({
        eventType: 'AI_ANALYSIS_FAILED',
        toStatus: AI_EXECUTION_STATUS.FAILED,
        metadata: { code, providerCalled: false },
      });
      return { ok: false, runId: runRow.id, code };
    }
  }

  const started = Date.now();
  let providerResult: Awaited<ReturnType<typeof provider.execute>>;
  try {
    providerResult = await provider.execute({
      useCaseId: params.useCaseId,
      analysisType,
      fixtureScenario: params.fixtureScenario,
      budgetContext: {
        organisationId: params.organisationId,
        idempotencyKey,
      },
      context: {
        sourceSections: ctx.sourceSections,
        regulatoryAnalysis: ctx.grounding?.regulatoryAnalysis ?? null,
        provisionScopedExtraction:
          (ctx.grounding as { provisionOutcomesSummary?: { provisionScopedExtraction?: unknown } } | undefined)
            ?.provisionOutcomesSummary?.provisionScopedExtraction ?? null,
        contextKind: ctx.contextKind,
        allowedSectionIds: ctx.allowedSectionIds,
        grounding: ctx.grounding,
      } as {
        sourceSections: typeof ctx.sourceSections;
        allowedSectionIds?: string[];
        regulatoryAnalysis?: unknown;
        provisionScopedExtraction?: unknown;
        contextKind?: string;
        grounding?: Record<string, unknown>;
      },
    });
  } catch (err) {
    providerResult = {
      ok: false,
      code: AI_ERRORS.AI_PROVIDER_UNAVAILABLE,
      message: err instanceof Error ? err.message : 'provider_threw',
    } as Awaited<ReturnType<typeof provider.execute>>;
  }
  const latencyMs = Date.now() - started;

  const providerExtras = providerResult as {
    spendAudit?: Record<string, unknown> | null;
    providerMeta?: Record<string, unknown> | null;
  };
  const spendAudit = providerExtras.spendAudit ?? null;
  const providerMeta = providerExtras.providerMeta ?? null;
  const providerOutcome = {
    runId: runRow.id,
    organisationId: params.organisationId,
    useCaseId: params.useCaseId,
    ok: providerResult.ok === true,
    code: 'code' in providerResult ? providerResult.code : null,
    latencyMs,
    providerMeta,
    spend: summariseSpendAudit(spendAudit),
  };
  console.info('[ri-ai] provider_returned', JSON.stringify(providerOutcome));

  const auditOutput: Record<string, unknown> = {};
  if (spendAudit) auditOutput._forgeniqLabSpendAudit = spendAudit;
  if (providerMeta) auditOutput._forgeniqProviderMeta = providerMeta;

  try {
    if (!providerResult.ok || !('structured' in providerResult)) {
      const code = 'code' in providerResult ? providerResult.code : AI_ERRORS.AI_PROVIDER_UNAVAILABLE;
      await finaliser.finishRun({
        execution_status: AI_EXECUTION_STATUS.FAILED,
        error_code: code,
        error_message: 'message' in providerResult ? providerResult.message : 'provider_failed',
        latency_ms: latencyMs,
        completed_at: new Date().toISOString(),
        ...(Object.keys(auditOutput).length ? { structured_output: auditOutput } : {}),
      });
      await finaliser.recordEvent({
        eventType: 'AI_ANALYSIS_FAILED',
        toStatus: AI_EXECUTION_STATUS.FAILED,
        metadata: { code },
      });
      return { ok: false, runId: runRow.id, code };
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
      await finaliser.finishRun({
        execution_status: AI_EXECUTION_STATUS.VALIDATION_FAILED,
        error_code: schemaCheck.code,
        error_message: schemaCheck.message,
        latency_ms: latencyMs,
        completed_at: new Date().toISOString(),
        structured_output: { ...auditOutput, _forgeniqRejectedOutput: successResult.structured },
      });
      await finaliser.recordEvent({
        eventType: 'AI_ANALYSIS_FAILED',
        toStatus: AI_EXECUTION_STATUS.VALIDATION_FAILED,
        metadata: { code: schemaCheck.code },
      });
      return { ok: false, runId: runRow.id, code: schemaCheck.code };
    }

    const schemaName = successResult.schemaName || mapSchemaForAnalysisType(analysisType);
    const { normalizeAnalysisStructuredOutput } = await import(
      '@/lib/ri/ai/normalize-structured-ai-output.mjs'
    );
    const normalized = normalizeAnalysisStructuredOutput(
      successResult.structured,
      schemaName,
      ctx.allowedSectionIds,
    );
    const structuredOutput: Record<string, unknown> = { ...normalized.structured, ...auditOutput };
    if (ctx.grounding) {
      structuredOutput._forgeniqGrounding = ctx.grounding;
    }

    const claims = (normalized.claims as AiClaim[]).map((c, i) => ({
      ...c,
      id: `claim-${i}`,
    }));
    const cite = validateCitations(claims, ctx.allowedSectionIds);
    const reviewStatus =
      cite.ok && useCase.humanOversightRequired
        ? AI_REVIEW_STATUS.HUMAN_REVIEW_REQUIRED
        : AI_REVIEW_STATUS.AI_DRAFT;

    await finaliser.finishRun({
      execution_status: AI_EXECUTION_STATUS.COMPLETED,
      review_status: reviewStatus,
      structured_output: structuredOutput,
      latency_ms: latencyMs,
      completed_at: new Date().toISOString(),
      error_code: cite.ok ? null : AI_ERRORS.AI_CITATION_INVALID,
    });

    await finaliser.insertCitations(
      claims.map((c, i) => ({
        claim_index: i,
        claim_text: c.text || '',
        source_section_ids: c.sourceSectionIds || [],
        citation_status: mapCitationStatusToDb(c),
        grounding_status: c.groundingStatus || null,
      })),
    );

    await finaliser.recordEvent({
      eventType: 'AI_ANALYSIS_COMPLETED',
      toStatus: AI_EXECUTION_STATUS.COMPLETED,
    });

    if (reviewStatus === AI_REVIEW_STATUS.HUMAN_REVIEW_REQUIRED) {
      await recordAiNotificationEvent(finaliser.client, {
        eventType: 'AI_REVIEW_REQUIRED',
        publicationId: params.publicationId,
        organisationId: params.organisationId,
        payload: { analysis_run_id: runRow.id, use_case_id: params.useCaseId },
      });
    }

    return { ok: true, runId: runRow.id, citationValid: cite.ok };
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 240);
    console.error(
      '[ri-ai] run_finalisation_failed',
      JSON.stringify({ ...providerOutcome, usesServiceRole: finaliser.usesServiceRole, error: message }),
    );
    if (!(err instanceof AiRunFinalisationError)) {
      try {
        await finaliser.finishRun({
          execution_status: AI_EXECUTION_STATUS.FAILED,
          error_code: AI_ERRORS.AI_RUN_FINALISATION_FAILED,
          error_message: message,
          latency_ms: latencyMs,
          completed_at: new Date().toISOString(),
          ...(Object.keys(auditOutput).length ? { structured_output: auditOutput } : {}),
        });
        await finaliser.recordEvent({
          eventType: 'AI_ANALYSIS_FAILED',
          toStatus: AI_EXECUTION_STATUS.FAILED,
          metadata: { code: AI_ERRORS.AI_RUN_FINALISATION_FAILED },
        });
      } catch {
        // Already logged above with the provider outcome and spend.
      }
    }
    throw err;
  }
}

function summariseSpendAudit(audit: Record<string, unknown> | null) {
  if (!audit) return null;
  return {
    model: audit.model ?? null,
    inputTokens: audit.inputTokens ?? null,
    outputTokens: audit.outputTokens ?? null,
    calculatedUsd: audit.calculatedUsd ?? null,
    reservedUsd: audit.reservedUsd ?? null,
    budgetUsd: audit.budgetUsd ?? null,
    attemptCount: audit.attemptCount ?? null,
  };
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
  assertExperimentalAiTenant({
    organisationId: params.organisationId,
    useCaseId: run.use_case_id,
    operation: 'review',
  });
  if (
    run.review_status === AI_REVIEW_STATUS.ACCEPTED ||
    run.review_status === AI_REVIEW_STATUS.REJECTED ||
    run.review_status === AI_REVIEW_STATUS.SUPERSEDED
  ) {
    throw new Error('already_reviewed');
  }
  if (run.execution_status !== AI_EXECUTION_STATUS.COMPLETED) {
    throw new RiConflictError('analysis_not_completed');
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

  // Obligation materialisation reads candidates by finding index and the review form cannot select
  // individual findings, so accepting a UC-RI-005 run would create obligations with the wrong text.
  if (run.use_case_id === 'UC-RI-005' && decision !== AI_REVIEW_STATUS.REJECTED) {
    throw new RiConflictError('uc_ri_005_acceptance_suspended');
  }

  if (decision !== AI_REVIEW_STATUS.REJECTED) {
    assertAiReviewerSoD({ requestedByUserId: run.requested_by, reviewerUserId: params.userId });
    if (run.use_case_id === 'UC-RI-005') {
      await assertObligationExtractionPrerequisites(supabase, {
        organisationId: params.organisationId,
        publicationId: run.publication_id,
        targetChangeId: (run as { target_entity_id?: string | null }).target_entity_id ?? null,
      });
    }
  }

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

  const { materialised, skipped } = await materialiseReviewedClaims(supabase, {
    organisationId: params.organisationId,
    userId: params.userId,
    role: params.role,
    runId: params.runId,
    reviewId: reviewRow.id,
    decision,
    acceptedClaimIndexes: params.acceptedClaimIndexes,
  });

  return { ok: true, reviewId: reviewRow.id, materialised, skipped };
}

export function getProviderStatusForUi() {
  const mode = resolveAiProviderMode();
  const anthropicConfigured = Boolean(
    process.env.ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_KEY?.trim(),
  );
  const openAiConfigured = Boolean(process.env.OPENAI_API_KEY?.trim());
  const executionEnabled = isRiAiExecutionEnabled();
  let label = 'Fixture mode — deterministic acceptance provider.';
  if (mode === AI_PROVIDER_MODE.ANTHROPIC && anthropicConfigured) {
    label = executionEnabled
      ? 'Anthropic Claude active (server-side); human review required before decisions.'
      : 'Anthropic configured — live execution disabled (RI_AI_EXECUTION_ENABLED=false).';
  } else if (mode === AI_PROVIDER_MODE.OPENAI && openAiConfigured) {
    label = 'OpenAI configured (server-side); human review required before decisions.';
  } else if (!anthropicConfigured && !openAiConfigured) {
    label = 'No live provider key — fixture mode for development.';
  }
  return {
    mode,
    fixtureActive: mode === AI_PROVIDER_MODE.FIXTURE,
    anthropicConfigured,
    openAiConfigured,
    executionEnabled,
    label,
  };
}

export { FIXTURE_PROVIDER_ID };
