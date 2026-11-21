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
  sha256Hex,
  validateFindingDecisions,
} from '@/lib/ri/ai/finding-review-core.mjs';
import { loadPublicationPdfEvidenceForAskRi } from '@/lib/ri/ask-ri/load-publication-pdf-evidence.mjs';
import { RiConflictError, RiNotFoundError, RiValidationError } from '@/lib/ri/errors';
import { assertCanRi } from '@/lib/ri/permissions';
import { getAnalysisRun } from '@/lib/ri/services/ai-analysis';
import { recordAiNotificationEvent } from '@/lib/ri/services/ai-notifications';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const FINDING_REVIEW_USE_CASE = 'UC-RI-005';

export function isFindingReviewEnabled(): boolean {
  return process.env.RI_UC_RI_005_FINDING_REVIEW_ENABLED?.trim() === 'true';
}

export type FindingDecisionInput = {
  findingId: string;
  claimTextSha256: string;
  decision: 'ACCEPTED' | 'REJECTED';
  classification?: string | null;
  legalBasis?: string | null;
  quotation?: string | null;
  quotationPage?: number | null;
  comment: string;
};

export async function getFindingReview(supabase: SupabaseClient, organisationId: string, runId: string) {
  const { run, citations } = await getAnalysisRun(supabase, organisationId, runId);
  if (run.use_case_id !== FINDING_REVIEW_USE_CASE) throw new RiConflictError('finding_review_use_case_unsupported');
  const view = buildFindingsView(run, citations ?? []);
  const { data: decisions, error } = await supabase
    .from('ai_analysis_finding_decisions')
    .select(
      'finding_id, claim_index, decision, classification, legal_basis, verified_quotation, quotation_page, reviewer_comment, evidence_pathway, obligation_id, skip_reason, reviewer_user_id, created_at',
    )
    .eq('analysis_run_id', runId)
    .eq('organisation_id', organisationId)
    .order('claim_index', { ascending: true });
  if (error) throw new Error(error.message);
  return {
    runId,
    enabled: isFindingReviewEnabled(),
    reviewStatus: run.review_status,
    executionStatus: run.execution_status,
    requestedBy: run.requested_by,
    classifications: FINDING_CLASSIFICATIONS,
    ...view,
    decisions: decisions ?? [],
  };
}

const RPC_CONFLICTS = new Set([
  'already_reviewed',
  'analysis_not_completed',
  'analysis_outdated',
  'finding_review_use_case_unsupported',
  'obligation_extraction_parent_change_missing',
]);

function mapRpcError(message: string): Error {
  const code = message.trim();
  if (code === 'segregation_of_duties' || code === 'insufficient_role') return new Error(code);
  if (code === 'not_found') return new RiNotFoundError('not_found');
  if (RPC_CONFLICTS.has(code)) return new RiConflictError(code);
  if (code.startsWith('experimental_ai_wrong_organisation')) return new Error(code);
  if (code.startsWith('finding_') || code === 'obligation_grade_evidence_required' || code === 'ai_finding_review_requires_user') {
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

  const view = buildFindingsView(run, citations ?? []);
  const validated = validateFindingDecisions(view.findings, params.decisions, { pathway: view.evidence.pathway });
  if (!validated.ok) throw new RiValidationError(validated.error);

  const toMaterialise = validated.decisions.filter((d: { createsObligation?: boolean }) => d.createsObligation);
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
    const rows = [];
    for (const d of toMaterialise) {
      const pageText = pages.get(d.quotationPage);
      if (!pageText || !quotationOccursOnPage(d.quotation, pageText)) {
        throw new RiValidationError(`finding_quotation_not_found_on_page:${numberById.get(d.findingId)}`);
      }
      rows.push({
        organisation_id: params.organisationId,
        analysis_run_id: params.runId,
        finding_id: d.findingId,
        extraction_revision_id: view.evidence.extractionRevisionId,
        page_number: d.quotationPage,
        quotation_sha256: sha256Hex(normaliseQuotation(d.quotation)),
        page_text_sha256: sha256Hex(pageText),
        verified_for_user_id: params.userId,
      });
    }
    const { error: verifyErr } = await admin.from('ai_finding_quotation_verifications').insert(rows);
    if (verifyErr) throw new Error(`finding_quotation_verification_failed:${verifyErr.message}`);
  }

  const { data, error } = await supabase.rpc('ri_submit_ai_finding_review', {
    p_organisation_id: params.organisationId,
    p_run_id: params.runId,
    p_decisions: validated.decisions.map((d: Record<string, unknown>) => ({
      findingId: d.findingId,
      claimTextSha256: d.claimTextSha256,
      decision: d.decision,
      classification: d.classification ?? null,
      legalBasis: d.legalBasis ?? null,
      quotation: d.quotation ?? null,
      quotationPage: d.quotationPage ?? null,
      comment: d.comment,
    })),
    p_notes: params.notes ?? null,
  });
  if (error) throw mapRpcError(error.message || 'unknown');

  const result = data as {
    reviewId: string;
    decision: string;
    evidencePathway: string;
    materialised: Array<{ findingId: string; claimIndex: number; obligationId: string }>;
    skipped: Array<{ findingId: string; claimIndex: number; reason: string }>;
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
