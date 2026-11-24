import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlatformRole } from '@/lib/roles';
import { AI_EXECUTION_STATUS, AI_FRESHNESS, AI_REVIEW_STATUS } from '@/lib/ri/ai/enums';
import {
  HUMAN_REVIEWED_DRAFT_MATERIALISATION,
  assertHumanReviewedDraftMaterialisation,
} from '@/lib/ri/ai/autonomy';
import { assertExperimentalAiTenant } from '@/lib/ri/ai/experimental-ai-tenant-guard';
import {
  FINDING_CLASSIFICATIONS,
  buildFindingsView,
  normaliseQuotation,
  quotationOccursOnPage,
  quotationVerifiableOnPages,
  sha256Hex,
  validateFindingDecisions,
} from '@/lib/ri/ai/finding-review-core.mjs';
import { loadPublicationPdfEvidenceForAskRi } from '@/lib/ri/ask-ri/load-publication-pdf-evidence.mjs';
import { RiConflictError, RiNotFoundError, RiValidationError } from '@/lib/ri/errors';
import { assertCanRi } from '@/lib/ri/permissions';
import { TRIAGE_QUEUES } from '@/lib/ri/classification/regulatory-classification-policy.mjs';
import { getAnalysisRun } from '@/lib/ri/services/ai-analysis';
import { recordAiNotificationEvent } from '@/lib/ri/services/ai-notifications';
import {
  loadActiveClassificationPolicy,
  loadPublicationClassificationContext,
} from '@/lib/ri/services/classification-policy';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const FINDING_REVIEW_USE_CASE = 'UC-RI-005';

export function isFindingReviewEnabled(): boolean {
  return process.env.RI_UC_RI_005_FINDING_REVIEW_ENABLED?.trim() === 'true';
}

export type FindingDecisionInput = {
  findingId: string;
  claimTextSha256: string;
  decision: 'ACCEPTED' | 'REJECTED';
  regulatoryClassificationCode?: string | null;
  disposition?: string | null;
  legalBasis?: string | null;
  quotation?: string | null;
  quotationPage?: number | null;
  linkedObligationId?: string | null;
  supportingObligationId?: string | null;
  supportingFindingId?: string | null;
  reclassificationEvidence?: string | null;
  provisionReference?: string | null;
  provisionFunction?: string | null;
  obligationStatement?: string | null;
  supplementaryQuotations?: Array<{ quotation: string; quotationPage: number }> | null;
  comment: string;
};

async function loadClassificationForRun(supabase: SupabaseClient, publicationId: string | null) {
  const context = await loadPublicationClassificationContext(supabase, publicationId);
  const policy = await loadActiveClassificationPolicy(supabase, context.regulatorKey);
  return { ...context, policy };
}

function summariseQueues(findings: Array<{ triage: { queue: string } }>) {
  const counts: Record<string, number> = {
    [TRIAGE_QUEUES.OBLIGATION]: 0,
    [TRIAGE_QUEUES.NON_OBLIGATION]: 0,
    [TRIAGE_QUEUES.EXCEPTION]: 0,
  };
  for (const f of findings) counts[f.triage.queue] = (counts[f.triage.queue] ?? 0) + 1;
  return counts;
}

export async function getFindingReview(supabase: SupabaseClient, organisationId: string, runId: string) {
  const { run, citations } = await getAnalysisRun(supabase, organisationId, runId);
  if (run.use_case_id !== FINDING_REVIEW_USE_CASE) throw new RiConflictError('finding_review_use_case_unsupported');
  const classification = await loadClassificationForRun(supabase, run.publication_id);
  const view = buildFindingsView(run, citations ?? [], classification);
  const [{ data: decisions, error }, { data: reassessments, error: reassessmentError }] = await Promise.all([
    supabase
      .from('ai_analysis_finding_decisions')
      .select(
        'id, finding_id, claim_index, decision, classification, regulatory_classification_code, legal_status, triage_queue, exception_reasons, disposition, linked_obligation_id, provision_reference, provision_function, legal_basis, verified_quotation, quotation_page, reviewer_comment, evidence_pathway, obligation_id, skip_reason, reviewer_user_id, analysis_review_id, created_at, quotation_verification_id',
      )
      .eq('analysis_run_id', runId)
      .eq('organisation_id', organisationId)
      .order('claim_index', { ascending: true }),
    supabase
      .from('ai_analysis_finding_reassessments')
      .select(
        'id, finding_id, prior_decision_id, sequence_number, decision, disposition, regulatory_classification_code, legal_status, legal_basis, verified_quotation, quotation_page, quotation_verification_id, provision_reference, provision_function, triage_queue, reviewer_comment, reassessment_justification, evidence_pathway, stale_prior_verification, reviewer_user_id, created_at',
      )
      .eq('analysis_run_id', runId)
      .eq('organisation_id', organisationId)
      .order('sequence_number', { ascending: true }),
  ]);
  if (error) throw new Error(error.message);
  if (reassessmentError) throw new Error(reassessmentError.message);
  return {
    runId,
    enabled: isFindingReviewEnabled(),
    reviewStatus: run.review_status,
    executionStatus: run.execution_status,
    requestedBy: run.requested_by,
    classifications: FINDING_CLASSIFICATIONS,
    classificationPolicy: classification.policy,
    publicationType: classification.publicationType,
    queueCounts: summariseQueues(view.findings),
    ...view,
    decisions: decisions ?? [],
    reassessments: reassessments ?? [],
    runReviewCompleted: !['HUMAN_REVIEW_REQUIRED', 'AI_DRAFT'].includes(String(run.review_status || '')),
  };
}

const RPC_CONFLICTS = new Set([
  'already_reviewed',
  'analysis_not_completed',
  'analysis_outdated',
  'finding_review_use_case_unsupported',
  'obligation_extraction_parent_change_missing',
  'classification_policy_unavailable',
]);

function mapRpcError(message: string): Error {
  const code = message.trim();
  if (code === 'segregation_of_duties' || code === 'insufficient_role') return new Error(code);
  if (code === 'not_found') return new RiNotFoundError('not_found');
  if (RPC_CONFLICTS.has(code)) return new RiConflictError(code);
  if (code.startsWith('experimental_ai_wrong_organisation')) return new Error(code);
  if (
    code.startsWith('finding_') ||
    code.startsWith('obligation_conversion_not_permitted') ||
    code.startsWith('obligation_classification_') ||
    code.startsWith('obligation_binding_link_') ||
    code === 'obligation_source_not_binding' ||
    code === 'obligation_grade_evidence_required' ||
    code === 'ai_finding_review_requires_user'
  ) {
    return new RiValidationError(code);
  }
  return new Error(`ai_finding_review_failed:${code.slice(0, 160)}`);
}

type PdfEvidenceEntry = {
  extractionRevisionId?: string;
  structured?: { pages?: Array<{ pageNumber?: number; text?: string }> };
};

async function loadPdfPageTexts(publicationId: string, expectedRevisionId: string | null) {
  const admin = createSupabaseAdminClient();
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!admin || !projectUrl || !serviceRoleKey) throw new Error('storage_credentials_unavailable');
  const loaded = await loadPublicationPdfEvidenceForAskRi(admin, {
    projectUrl,
    serviceRoleKey,
    publicationIds: [publicationId],
  });
  const evidence = (loaded.evidence ?? []) as PdfEvidenceEntry[];
  const entry = evidence.find((e) => e.extractionRevisionId === expectedRevisionId);
  if (!expectedRevisionId || !entry) throw new RiConflictError('finding_review_pdf_revision_unavailable');
  const pages = new Map<number, string>();
  for (const page of entry.structured?.pages ?? []) {
    if (typeof page.pageNumber === 'number' && Number.isInteger(page.pageNumber)) {
      pages.set(page.pageNumber, String(page.text ?? ''));
    }
  }
  return { admin, pages };
}

export async function submitFindingReview(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    userId: string;
    role: PlatformRole;
    runId: string;
    decisions: FindingDecisionInput[];
    notes?: string;
  },
) {
  assertCanRi(params.role, 'ai:review');
  if (!isFindingReviewEnabled()) throw new RiConflictError('uc_ri_005_finding_review_disabled');

  const { run, citations } = await getAnalysisRun(supabase, params.organisationId, params.runId);
  assertExperimentalAiTenant({ organisationId: params.organisationId, useCaseId: run.use_case_id, operation: 'review' });
  if (run.use_case_id !== FINDING_REVIEW_USE_CASE) throw new RiConflictError('finding_review_use_case_unsupported');
  if (run.execution_status !== AI_EXECUTION_STATUS.COMPLETED) throw new RiConflictError('analysis_not_completed');
  if (run.review_status !== AI_REVIEW_STATUS.HUMAN_REVIEW_REQUIRED && run.review_status !== AI_REVIEW_STATUS.AI_DRAFT) {
    throw new RiConflictError('already_reviewed');
  }
  if (run.freshness === AI_FRESHNESS.OUTDATED) throw new RiConflictError('analysis_outdated');

  const classification = await loadClassificationForRun(supabase, run.publication_id);
  const view = buildFindingsView(run, citations ?? [], classification);
  const validated = validateFindingDecisions(view.findings, params.decisions, {
    pathway: view.evidence.pathway,
    policy: classification.policy,
    publicationType: classification.publicationType,
  });
  if (!validated.ok) {
    if (validated.error === 'classification_policy_unavailable') throw new RiConflictError(validated.error);
    throw new RiValidationError(validated.error);
  }

  const toMaterialise = validated.decisions.filter((d: { createsObligation?: boolean }) => d.createsObligation);
  const insertedVerificationIds: string[] = [];
  if (toMaterialise.length > 0) {
    assertHumanReviewedDraftMaterialisation({
      action: HUMAN_REVIEWED_DRAFT_MATERIALISATION,
      reviewerUserId: params.userId,
      requestedByUserId: run.requested_by,
      targetStatus: 'DRAFT',
    });
    const { admin, pages } = await loadPdfPageTexts(run.publication_id, view.evidence.extractionRevisionId);
    const numberById = new Map<string, number>(
      view.findings.map((f: { findingId: string; number: number }) => [f.findingId, f.number]),
    );
    const findingById = new Map(view.findings.map((f: { findingId: string; pages: number[] }) => [f.findingId, f.pages]));
    const rows: Array<Record<string, unknown>> = [];
    for (const d of toMaterialise) {
      const citedPages = findingById.get(d.findingId) ?? [];
      const verified = quotationVerifiableOnPages(d.quotation, pages, citedPages);
      if (!verified.ok) {
        throw new RiValidationError(`finding_quotation_not_found_on_page:${numberById.get(d.findingId)}`);
      }
      const quotationPage = d.quotationPage ?? verified.quotationPage;
      const pageText = pages.get(quotationPage);
      if (!pageText) throw new RiValidationError(`finding_quotation_not_found_on_page:${numberById.get(d.findingId)}`);
      if (!quotationOccursOnPage(d.quotation, pageText) && !verified.spansPages) {
        throw new RiValidationError(`finding_quotation_not_found_on_page:${numberById.get(d.findingId)}`);
      }
      rows.push({
        organisation_id: params.organisationId,
        analysis_run_id: params.runId,
        finding_id: d.findingId,
        extraction_revision_id: view.evidence.extractionRevisionId,
        page_number: quotationPage,
        quotation_sha256: sha256Hex(normaliseQuotation(d.quotation)),
        page_text_sha256: sha256Hex(pageText),
        verified_for_user_id: params.userId,
      });
      for (const sq of (d as { supplementaryQuotations?: Array<{ quotation: string; quotationPage: number }> }).supplementaryQuotations ?? []) {
        const sqText = pages.get(sq.quotationPage);
        if (!sqText || !quotationOccursOnPage(sq.quotation, sqText)) {
          throw new RiValidationError(`finding_quotation_not_found_on_page:${numberById.get(d.findingId)}`);
        }
        rows.push({
          organisation_id: params.organisationId,
          analysis_run_id: params.runId,
          finding_id: d.findingId,
          extraction_revision_id: view.evidence.extractionRevisionId,
          page_number: sq.quotationPage,
          quotation_sha256: sha256Hex(normaliseQuotation(sq.quotation)),
          page_text_sha256: sha256Hex(sqText),
          verified_for_user_id: params.userId,
        });
      }
    }
    const { data: inserted, error: verifyErr } = await admin.from('ai_finding_quotation_verifications').insert(rows).select('id');
    if (verifyErr) throw new Error(`finding_quotation_verification_failed:${verifyErr.message}`);
    insertedVerificationIds.push(...(inserted ?? []).map((r: { id: string }) => r.id));
  }

  const { data, error } = await supabase.rpc('ri_submit_ai_finding_review', {
    p_organisation_id: params.organisationId,
    p_run_id: params.runId,
    p_decisions: validated.decisions.map((d: Record<string, unknown>) => ({
      findingId: d.findingId,
      claimTextSha256: d.claimTextSha256,
      decision: d.decision,
      regulatoryClassificationCode: d.regulatoryClassificationCode ?? null,
      disposition: d.disposition ?? null,
      legalBasis: d.legalBasis ?? null,
      quotation: d.quotation ?? null,
      quotationPage: d.quotationPage ?? null,
      linkedObligationId: d.linkedObligationId ?? null,
      supportingObligationId: d.supportingObligationId ?? null,
      supportingFindingId: d.supportingFindingId ?? null,
      reclassificationEvidence: d.reclassificationEvidence ?? null,
      provisionReference: d.provisionReference ?? null,
      provisionFunction: d.provisionFunction ?? null,
      obligationStatement: (d as { obligationStatement?: string }).obligationStatement ?? null,
      comment: d.comment,
    })),
    p_notes: params.notes ?? null,
  });
  if (error) {
    if (insertedVerificationIds.length > 0) {
      const admin = createSupabaseAdminClient();
      const table = admin?.from?.('ai_finding_quotation_verifications');
      if (table?.delete) await table.delete().in('id', insertedVerificationIds);
    }
    throw mapRpcError(error.message || 'unknown');
  }

  const result = data as {
    reviewId: string;
    decision: string;
    evidencePathway: string;
    classificationPolicyVersion: number | null;
    materialised: Array<{ findingId: string; claimIndex: number; obligationId: string; classificationCode: string; legalStatus: string }>;
    skipped: Array<{ findingId: string; claimIndex: number; decision: string; reason: string; triageQueue: string }>;
  };

  try {
    await recordAiNotificationEvent(supabase, {
      eventType: 'AI_REVIEW_COMPLETED',
      publicationId: run.publication_id,
      organisationId: params.organisationId,
      payload: { analysis_run_id: params.runId, review_id: result.reviewId, decision: result.decision },
    });
  } catch (e) {
    console.error('[ri-ai] finding_review_notification_failed', e instanceof Error ? e.message.slice(0, 160) : 'unknown');
  }

  return { ok: true as const, ...result };
}

export type FindingReassessmentInput = FindingDecisionInput & {
  reassessmentJustification: string;
};

const REASSESSMENT_RPC_CONFLICTS = new Set([
  'finding_reassessment_requires_prior_review',
  'finding_reassessment_no_prior_decision',
  'obligation_approval_locked',
  'analysis_outdated',
  'analysis_not_completed',
]);

function mapReassessmentRpcError(message: string): Error {
  const code = message.trim();
  if (code === 'segregation_of_duties' || code === 'insufficient_role') return new Error(code);
  if (code === 'not_found') return new RiNotFoundError('not_found');
  if (REASSESSMENT_RPC_CONFLICTS.has(code)) return new RiConflictError(code);
  if (code.startsWith('finding_') || code === 'finding_reassessment_justification_required') {
    return new RiValidationError(code);
  }
  return new Error(`finding_reassessment_failed:${code.slice(0, 160)}`);
}

export async function submitFindingReassessment(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    userId: string;
    role: PlatformRole;
    runId: string;
    findingId: string;
    decision: FindingReassessmentInput;
  },
) {
  assertCanRi(params.role, 'ai:review');
  if (!isFindingReviewEnabled()) throw new RiConflictError('uc_ri_005_finding_review_disabled');

  const { run, citations } = await getAnalysisRun(supabase, params.organisationId, params.runId);
  assertExperimentalAiTenant({ organisationId: params.organisationId, useCaseId: run.use_case_id, operation: 'review' });
  if (run.use_case_id !== FINDING_REVIEW_USE_CASE) throw new RiConflictError('finding_review_use_case_unsupported');
  if (run.execution_status !== AI_EXECUTION_STATUS.COMPLETED) throw new RiConflictError('analysis_not_completed');
  if (run.freshness === AI_FRESHNESS.OUTDATED) throw new RiConflictError('analysis_outdated');

  const classification = await loadClassificationForRun(supabase, run.publication_id);
  const view = buildFindingsView(run, citations ?? [], classification);
  const target = view.findings.find((f: { findingId: string }) => f.findingId === params.findingId);
  if (!target) throw new RiNotFoundError('not_found');

  const validated = validateFindingDecisions([target], [params.decision], {
    pathway: view.evidence.pathway,
    policy: classification.policy,
    publicationType: classification.publicationType,
  });
  if (!validated.ok) {
    if (validated.error === 'classification_policy_unavailable') throw new RiConflictError(validated.error);
    throw new RiValidationError(validated.error);
  }
  const [d] = validated.decisions as Array<Record<string, unknown>>;
  if ((params.decision.reassessmentJustification || '').trim().length < 10) {
    throw new RiValidationError('finding_reassessment_justification_required');
  }

  const quotationVerificationId: string | null = null;
  if (d.createsObligation) {
    throw new RiValidationError('finding_reassessment_no_new_obligation_materialisation');
  }

  const payload = {
    decision: d.decision,
    disposition: d.disposition ?? null,
    regulatoryClassificationCode: d.regulatoryClassificationCode ?? null,
    legalStatus: d.legalStatus ?? null,
    legalBasis: d.legalBasis ?? null,
    quotation: d.quotation ?? null,
    quotationPage: d.quotationPage ?? null,
    quotationVerificationId,
    provisionReference: d.provisionReference ?? null,
    provisionFunction: d.provisionFunction ?? null,
    triageQueue: d.triageQueue ?? null,
    comment: d.comment,
    reassessmentJustification: params.decision.reassessmentJustification.trim(),
    evidencePathway: view.evidence.pathway,
  };

  const { data, error } = await supabase.rpc('ri_reassess_ai_finding', {
    p_organisation_id: params.organisationId,
    p_run_id: params.runId,
    p_finding_id: params.findingId,
    p_payload: payload,
  });
  if (error) throw mapReassessmentRpcError(error.message || 'unknown');

  return { ok: true as const, ...(data as Record<string, unknown>) };
}
