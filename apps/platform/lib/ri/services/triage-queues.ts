import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { AI_EXECUTION_STATUS } from '@/lib/ri/ai/enums';
import { buildFindingsView } from '@/lib/ri/ai/finding-review-core.mjs';
import { TRIAGE_QUEUES } from '@/lib/ri/classification/regulatory-classification-policy.mjs';
import {
  classifyFindingDecisionProvenance,
  countVerificationWithProvenance,
} from '@/lib/ri/triage/finding-decision-provenance.mjs';
import {
  countApprovalStatus,
  deriveApprovalStatus,
  deriveHumanVerification,
} from '@/lib/ri/triage/triage-verification-status.mjs';
import { countVerificationPresentation } from '@/lib/ri/triage/verification-presentation.mjs';
import {
  WORKFLOW_QUEUES,
  countWorkflowQueues,
  deriveWorkflowQueue,
  isWorkflowQueue,
  resolveWorkflowQueueParam,
} from '@/lib/ri/triage/regulatory-workflow-queues.mjs';
import { paginateTriageItems } from '@/lib/ri/triage/triage-list-pagination.mjs';

/** Authorised staging UAT org — decisions here are never production legal verification. */
const AUTHORISED_STAGING_ORG_ID = 'b8f5e3a1-00ad-4000-8000-000000000001';

export { isWorkflowQueue, resolveWorkflowQueueParam };
import {
  loadActiveClassificationPolicy,
  loadPublicationClassificationContext,
  type ClassificationPolicy,
} from '@/lib/ri/services/classification-policy';

const USE_CASE = 'UC-RI-005';
const MAX_RUNS = 20;

export type TriageListQuery = {
  page?: number;
  pageSize?: number;
  verificationFilter?: string;
  approvalFilter?: string;
  search?: string;
};

const CLASSIFICATION_QUEUES = [
  TRIAGE_QUEUES.OBLIGATION,
  TRIAGE_QUEUES.NON_OBLIGATION,
  TRIAGE_QUEUES.EXCEPTION,
] as const;

export type TriageQueueName = (typeof CLASSIFICATION_QUEUES)[number];

export function isTriageQueue(value: string | null | undefined): value is TriageQueueName {
  return CLASSIFICATION_QUEUES.includes(value as TriageQueueName);
}

type DecisionRow = {
  id?: string;
  analysis_run_id: string;
  finding_id: string;
  decision: string;
  triage_queue: string | null;
  disposition: string | null;
  regulatory_classification_code: string | null;
  legal_status: string | null;
  legal_basis: string | null;
  verified_quotation: string | null;
  provision_reference: string | null;
  provision_function: string | null;
  quotation_page: number | null;
  reviewer_comment: string | null;
  evidence_pathway: string | null;
  reviewer_user_id: string | null;
  analysis_review_id: string | null;
  created_at: string | null;
  quotation_verification_id: string | null;
  obligation_id: string | null;
};

type RunRow = {
  id: string;
  publication_id: string | null;
  publication_version_id: string | null;
  review_status: string | null;
  structured_output: unknown;
  created_at: string;
};

type ReassessmentRow = {
  analysis_run_id: string;
  finding_id: string;
  decision: string;
  disposition: string | null;
  regulatory_classification_code: string | null;
  legal_status: string | null;
  legal_basis: string | null;
  verified_quotation: string | null;
  provision_reference: string | null;
  provision_function: string | null;
  quotation_page: number | null;
  reviewer_comment: string | null;
  evidence_pathway: string | null;
  reviewer_user_id: string | null;
  created_at: string | null;
  quotation_verification_id: string | null;
  reassessment_justification: string | null;
  sequence_number: number;
};

const OBLIGATION_APPROVAL_LOCKED = new Set(['OPEN', 'IN_PROGRESS', 'OVERDUE', 'COMPLETE', 'HISTORIC']);

function effectiveDecisionRecord(original: DecisionRow | undefined, latest: ReassessmentRow | undefined) {
  if (!original) return undefined;
  if (!latest) return original;
  return {
    ...original,
    decision: latest.decision,
    disposition: latest.disposition,
    regulatory_classification_code: latest.regulatory_classification_code ?? original.regulatory_classification_code,
    legal_status: latest.legal_status ?? original.legal_status,
    legal_basis: latest.legal_basis ?? original.legal_basis,
    verified_quotation: latest.verified_quotation ?? original.verified_quotation,
    provision_reference: latest.provision_reference ?? original.provision_reference,
    provision_function: latest.provision_function ?? original.provision_function,
    quotation_page: latest.quotation_page ?? original.quotation_page,
    reviewer_comment: latest.reviewer_comment ?? original.reviewer_comment,
    evidence_pathway: latest.evidence_pathway ?? original.evidence_pathway,
    reviewer_user_id: latest.reviewer_user_id ?? original.reviewer_user_id,
    created_at: latest.created_at ?? original.created_at,
    quotation_verification_id: latest.quotation_verification_id ?? original.quotation_verification_id,
  };
}

function clip(value: unknown, max = 500) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export async function listTriageQueues(
  supabase: SupabaseClient,
  organisationId: string,
  queue: string | null,
  query: TriageListQuery = {},
) {
  const workflowFilter =
    queue && queue !== WORKFLOW_QUEUES.ALL_FINDINGS ? resolveWorkflowQueueParam(queue) : queue;
  const { count, error: countError } = await supabase
    .from('ai_analysis_runs')
    .select('id', { count: 'exact', head: true })
    .eq('organisation_id', organisationId)
    .eq('use_case_id', USE_CASE)
    .eq('execution_status', AI_EXECUTION_STATUS.COMPLETED);
  if (countError) throw new Error(countError.message);

  const { data: runs, error: runError } = await supabase
    .from('ai_analysis_runs')
    .select('id, publication_id, publication_version_id, review_status, structured_output, created_at')
    .eq('organisation_id', organisationId)
    .eq('use_case_id', USE_CASE)
    .eq('execution_status', AI_EXECUTION_STATUS.COMPLETED)
    .order('created_at', { ascending: false })
    .limit(MAX_RUNS);
  if (runError) throw new Error(runError.message);

  const runRows = (runs ?? []) as RunRow[];
  const runIds = runRows.map((r) => r.id);
  const publicationIds = [...new Set(runRows.map((r) => r.publication_id).filter(Boolean))] as string[];
  const [{ data: citations, error: citationError }, { data: decisions, error: decisionError }, { data: publications, error: publicationError }] =
    await Promise.all([
      runIds.length
        ? supabase
            .from('ai_analysis_citations')
            .select('id, analysis_run_id, claim_index, claim_text, citation_status, source_section_ids')
            .eq('organisation_id', organisationId)
            .in('analysis_run_id', runIds)
            .order('claim_index', { ascending: true })
            .limit(1000)
        : Promise.resolve({ data: [], error: null }),
      runIds.length
        ? supabase
            .from('ai_analysis_finding_decisions')
            .select(
              'id, analysis_run_id, finding_id, decision, triage_queue, disposition, regulatory_classification_code, legal_status, legal_basis, verified_quotation, provision_reference, provision_function, quotation_page, reviewer_comment, evidence_pathway, reviewer_user_id, analysis_review_id, created_at, quotation_verification_id, obligation_id',
            )
            .eq('organisation_id', organisationId)
            .in('analysis_run_id', runIds)
        : Promise.resolve({ data: [], error: null }),
      publicationIds.length
        ? supabase
            .from('regulatory_publications')
            .select('id, title, publication_type, regulator_id')
            .in('id', publicationIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (citationError) throw new Error(citationError.message);
  if (decisionError) throw new Error(decisionError.message);
  if (publicationError) throw new Error(publicationError.message);

  const obligationIds = [
    ...new Set(
      ((decisions ?? []) as DecisionRow[]).map((d) => d.obligation_id).filter(Boolean),
    ),
  ] as string[];
  const [
    { data: obligationRows, error: obligationError },
    { data: versionRows, error: versionError },
    { data: reassessmentRows, error: reassessmentError },
    { data: runReviewRows, error: runReviewError },
  ] = await Promise.all([
    obligationIds.length
      ? supabase
          .from('regulatory_obligations')
          .select('id, status, owner_user_id, origin, metadata, ai_analysis_review_id, created_by_user_id')
          .eq('organisation_id', organisationId)
          .in('id', obligationIds)
      : Promise.resolve({ data: [], error: null }),
    publicationIds.length
      ? supabase
          .from('regulatory_publication_versions')
          .select('publication_id, id, created_at')
          .in('publication_id', publicationIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    runIds.length
      ? supabase
          .from('ai_analysis_finding_reassessments')
          .select(
            'analysis_run_id, finding_id, decision, disposition, regulatory_classification_code, legal_status, legal_basis, verified_quotation, provision_reference, provision_function, quotation_page, reviewer_comment, evidence_pathway, reviewer_user_id, created_at, quotation_verification_id, reassessment_justification, sequence_number',
          )
          .eq('organisation_id', organisationId)
          .in('analysis_run_id', runIds)
          .order('sequence_number', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    runIds.length
      ? supabase.from('ai_analysis_reviews').select('analysis_run_id').eq('organisation_id', organisationId).in('analysis_run_id', runIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (obligationError) throw new Error(obligationError.message);
  if (versionError) throw new Error(versionError.message);
  if (reassessmentError && !/does not exist|schema cache/i.test(reassessmentError.message)) {
    throw new Error(reassessmentError.message);
  }
  if (runReviewError) throw new Error(runReviewError.message);

  const obligationStatusById = new Map(
    (obligationRows ?? []).map((o) => [o.id as string, o.status as string]),
  );
  const obligationDetailById = new Map((obligationRows ?? []).map((o) => [o.id as string, o]));
  const reviewerIds = [
    ...new Set(((decisions ?? []) as DecisionRow[]).map((d) => d.reviewer_user_id).filter(Boolean)),
  ] as string[];
  const { data: memberRows, error: memberError } = reviewerIds.length
    ? await supabase
        .from('organisation_memberships')
        .select('clerk_user_id, role')
        .eq('organisation_id', organisationId)
        .in('clerk_user_id', reviewerIds)
        .eq('status', 'active')
    : { data: [], error: null };
  if (memberError) throw new Error(memberError.message);
  const roleByReviewerId = new Map((memberRows ?? []).map((m) => [m.clerk_user_id as string, m.role as string]));
  const stagingTenant = organisationId === AUTHORISED_STAGING_ORG_ID;
  const runsWithCompletedReview = new Set((runReviewRows ?? []).map((r) => r.analysis_run_id as string));
  const latestReassessmentByFinding = new Map<string, ReassessmentRow>();
  const reassessmentCountByFinding = new Map<string, number>();
  for (const row of (reassessmentRows ?? []) as ReassessmentRow[]) {
    const key = `${row.analysis_run_id}:${row.finding_id}`;
    reassessmentCountByFinding.set(key, (reassessmentCountByFinding.get(key) ?? 0) + 1);
    if (!latestReassessmentByFinding.has(key)) latestReassessmentByFinding.set(key, row);
  }
  const currentPublicationVersionById = new Map<string, string>();
  for (const row of versionRows ?? []) {
    const pubId = row.publication_id as string;
    if (!currentPublicationVersionById.has(pubId)) {
      currentPublicationVersionById.set(pubId, row.id as string);
    }
  }

  const publicationById = new Map((publications ?? []).map((p) => [p.id as string, p]));
  const regulatorIds = [...new Set((publications ?? []).map((p) => p.regulator_id).filter(Boolean))] as string[];
  const { data: regulators, error: regulatorError } = regulatorIds.length
    ? await supabase.from('regulators').select('id, external_key, name').in('id', regulatorIds)
    : { data: [], error: null };
  if (regulatorError) throw new Error(regulatorError.message);
  const regulatorById = new Map((regulators ?? []).map((r) => [r.id as string, r]));

  const contextCache = new Map<string, { regulatorKey: string | null; publicationType: string | null }>();
  const policyCache = new Map<string, ClassificationPolicy | null>();
  async function policyFor(publicationId: string | null) {
    const key = publicationId || '';
    if (!contextCache.has(key)) {
      contextCache.set(key, await loadPublicationClassificationContext(supabase, publicationId));
    }
    const context = contextCache.get(key)!;
    const policyKey = context.regulatorKey || '';
    if (!policyCache.has(policyKey)) {
      policyCache.set(policyKey, policyKey ? await loadActiveClassificationPolicy(supabase, policyKey) : null);
    }
    return { context, policy: policyCache.get(policyKey) ?? null };
  }

  const decisionsByFinding = new Map<string, DecisionRow>();
  for (const row of (decisions ?? []) as DecisionRow[]) {
    decisionsByFinding.set(`${row.analysis_run_id}:${row.finding_id}`, row);
  }
  const citationsByRun = new Map<string, Array<Record<string, unknown>>>();
  for (const citation of citations ?? []) {
    const runId = citation.analysis_run_id as string;
    const list = citationsByRun.get(runId) ?? [];
    list.push(citation);
    citationsByRun.set(runId, list);
  }

  const classificationCounts: Record<TriageQueueName, number> = {
    OBLIGATION_TRIAGE: 0,
    NON_OBLIGATION_TRIAGE: 0,
    EXCEPTION_TRIAGE: 0,
  };
  const workflowRowsForCount: Array<{ workflowQueue: string }> = [];
  const queueMetricRows: Array<{
    humanVerification: string;
    approvalStatus: string;
    hasPersistedDecision?: boolean;
    reVerificationRequired?: boolean;
    decisionProvenance?: ReturnType<typeof classifyFindingDecisionProvenance>;
  }> = [];
  const items: Array<Record<string, unknown>> = [];

  for (const run of runRows) {
    const publication = publicationById.get(run.publication_id as string);
    const regulator = publication?.regulator_id ? regulatorById.get(publication.regulator_id as string) : null;
    const { context, policy } = await policyFor((run.publication_id as string) || null);
    const view = buildFindingsView(
      { structured_output: run.structured_output },
      (citationsByRun.get(run.id as string) ?? []) as never,
      { policy, publicationType: context.publicationType },
    );
    for (const finding of view.findings) {
      const originalDecision = decisionsByFinding.get(`${run.id}:${finding.findingId}`);
      const latestReassessment = latestReassessmentByFinding.get(`${run.id}:${finding.findingId}`);
      const recorded = effectiveDecisionRecord(originalDecision, latestReassessment);
      const hasPersistedDecision = Boolean(originalDecision);
      const queueName = (recorded?.triage_queue && isTriageQueue(recorded.triage_queue)
        ? recorded.triage_queue
        : finding.triage?.queue) as TriageQueueName;
      if (!isTriageQueue(queueName)) continue;
      classificationCounts[queueName] += 1;
      const suggestion = finding.suggestion;
      const quotation = recorded?.verified_quotation || suggestion?.sourceQuotation || finding.statement;
      const draftEligible =
        queueName === TRIAGE_QUEUES.OBLIGATION &&
        finding.triage?.conversionEligible === true &&
        !recorded?.obligation_id;
      const pubId = run.publication_id as string | null;
      const runVersionId = run.publication_version_id;
      const currentVersionId = pubId ? currentPublicationVersionById.get(pubId) : null;
      const reVerificationRequired = Boolean(
        recorded && currentVersionId && runVersionId && runVersionId !== currentVersionId,
      );
      const humanVerification = deriveHumanVerification({
        recorded,
        provisional: recorded ? false : finding.triage?.provisional === true,
        queueName,
        exceptionReasons: finding.triage?.exceptionReasons || [],
        reVerificationRequired,
      });
      const obligationId = originalDecision?.obligation_id || recorded?.obligation_id || null;
      const obligationStatus = obligationId ? obligationStatusById.get(obligationId) : null;
      const approvalStatus = deriveApprovalStatus(obligationStatus);
      const obligationApprovalLocked = Boolean(obligationStatus && OBLIGATION_APPROVAL_LOCKED.has(obligationStatus));
      const runHasCompletedReview = runsWithCompletedReview.has(run.id);
      const runOpenForFirstReview =
        !runHasCompletedReview &&
        ['HUMAN_REVIEW_REQUIRED', 'AI_DRAFT'].includes(String(run.review_status || '').toUpperCase());
      const canReassess = runHasCompletedReview && hasPersistedDecision && !obligationApprovalLocked;
      const canFirstReview = !hasPersistedDecision && !obligationApprovalLocked && runOpenForFirstReview;
      const workflowQueue = deriveWorkflowQueue({
        hasPersistedDecision,
        humanVerification,
        decision: recorded?.decision ?? null,
        disposition: recorded?.disposition ?? null,
        classificationQueue: queueName,
      });
      const reviewerRole = recorded?.reviewer_user_id ? roleByReviewerId.get(recorded.reviewer_user_id) ?? null : null;
      const decisionProvenance = classifyFindingDecisionProvenance(recorded ?? {}, {
        stagingTenant,
        reviewerRole,
      });
      const obligationRow = obligationId ? obligationDetailById.get(obligationId) : null;
      const row = {
        runId: run.id,
        findingId: finding.findingId,
        claimIndex: (finding as { number?: number }).number != null ? (finding as { number: number }).number - 1 : null,
        runCreatedAt: run.created_at,
        reviewHref: `#/ai-analysis/${run.id}`,
        regulator: regulator?.name || regulator?.external_key || context.regulatorKey || null,
        publicationId: run.publication_id,
        publicationTitle: publication?.title || null,
        publicationType: publication?.publication_type || context.publicationType,
        provisionReference: recorded?.provision_reference || suggestion?.citation || null,
        quotation: clip(quotation),
        regulatoryFinding: clip(quotation, 280),
        classificationCode: recorded?.regulatory_classification_code || finding.triage?.code || null,
        aiClassification:
          (finding as { modelLabels?: string[] }).modelLabels?.join(', ') ||
          recorded?.regulatory_classification_code ||
          finding.triage?.code ||
          null,
        legalStatus: recorded?.legal_status || finding.triage?.legalStatus || null,
        modelLabels: (finding as { modelLabels?: string[] }).modelLabels || [],
        legalBasis: clip(recorded?.legal_basis, 300),
        applicability: clip(suggestion?.applicabilityConditions, 300),
        reviewStatus: recorded ? recorded.decision : run.review_status || 'HUMAN_REVIEW_REQUIRED',
        disposition: recorded?.disposition || null,
        triageQueue: queueName,
        workflowQueue,
        aiAssessmentRationale: clip((finding as { statement?: string }).statement, 400),
        aiConfidence: (finding as { modelConfidence?: number | null }).modelConfidence ?? null,
        sourcePdfPage: (finding as { pages?: number[] }).pages?.length
          ? (finding as { pages: number[] }).pages[0]
          : (suggestion as { quotationPage?: number } | undefined)?.quotationPage ?? null,
        provisional: recorded ? false : finding.triage?.provisional === true,
        exceptionReasons: finding.triage?.exceptionReasons || [],
        draftEligible,
        obligationId,
        hasPersistedDecision,
        runOpenForFirstReview,
        runHasCompletedReview,
        canFirstReview,
        canReassess,
        obligationApprovalLocked,
        reassessmentCount: reassessmentCountByFinding.get(`${run.id}:${finding.findingId}`) ?? 0,
        humanVerification,
        approvalStatus,
        reVerificationRequired,
        legallyVerified: false,
        decisionProvenance,
        countsAsGenuineHumanVerification: decisionProvenance.countsAsGenuineHumanVerification,
        countsAsUatOrTest: decisionProvenance.countsAsUatOrTest,
        reviewerRole,
        verificationRecord: recorded
          ? {
              originalDecisionId: originalDecision ? (originalDecision as { id?: string }).id : undefined,
              analysisReviewId: originalDecision?.analysis_review_id ?? recorded.analysis_review_id,
              reviewerUserId: recorded.reviewer_user_id,
              reviewerRole,
              decision: recorded.decision,
              verifiedAt: recorded.created_at,
              legalBasis: recorded.legal_basis,
              verifiedQuotation: recorded.verified_quotation,
              provisionReference: recorded.provision_reference,
              provisionFunction: recorded.provision_function,
              quotationPage: recorded.quotation_page,
              evidencePathway: recorded.evidence_pathway,
              quotationVerificationId: recorded.quotation_verification_id,
              reviewerJustification: recorded.reviewer_comment,
              disposition: recorded.disposition,
              regulatoryClassificationCode: recorded.regulatory_classification_code,
              legalStatus: recorded.legal_status,
              provenanceClass: decisionProvenance.provenanceClass,
              provenanceLabel: decisionProvenance.label,
            }
          : null,
        approvalRecord: obligationId
          ? {
              obligationId,
              status: obligationStatus ?? null,
              origin: (obligationRow as { origin?: string } | undefined)?.origin ?? null,
              obligationHref: `#/obligation/${obligationId}`,
              makerCheckerNote:
                obligationStatus === 'OPEN' || obligationStatus === 'IN_PROGRESS'
                  ? stagingTenant
                    ? 'Staging maker-checker approval — not production legal sign-off.'
                    : 'Maker-checker approved into register.'
                  : null,
            }
          : null,
        publicationVersionAtExtraction: runVersionId ?? null,
        currentPublicationVersionId: currentVersionId ?? null,
      };
      workflowRowsForCount.push({ workflowQueue });
      if (
        workflowFilter &&
        workflowFilter !== WORKFLOW_QUEUES.ALL_FINDINGS &&
        workflowQueue !== workflowFilter
      ) {
        continue;
      }
      if (!workflowFilter || workflowFilter === WORKFLOW_QUEUES.ALL_FINDINGS || workflowQueue === workflowFilter) {
        queueMetricRows.push({
          humanVerification,
          approvalStatus,
          hasPersistedDecision,
          reVerificationRequired,
          decisionProvenance,
        });
      }
      if (!workflowFilter) continue;
      items.push(row);
    }
  }

  let pageResult: ReturnType<typeof paginateTriageItems> | null = null;
  if (workflowFilter) {
    pageResult = paginateTriageItems(items, query);
    items.length = 0;
    items.push(...(pageResult.items as Array<Record<string, unknown>>));
  }

  const workflowCounts = countWorkflowQueues(workflowRowsForCount);
  const verificationCounts = workflowFilter ? countVerificationWithProvenance(queueMetricRows) : { ALL: 0 };
  const presentationCounts = workflowFilter ? countVerificationPresentation(queueMetricRows) : { ALL: 0 };
  const approvalCounts = workflowFilter ? countApprovalStatus(queueMetricRows) : { ALL: 0 };

  return {
    ok: true,
    tenantScope: true,
    useCaseId: USE_CASE,
    counts: workflowCounts,
    workflowCounts,
    classificationCounts,
    verificationCounts,
    presentationCounts,
    approvalCounts,
    triageReconcile: workflowFilter
      ? {
          obligationQueueCount: workflowCounts[WORKFLOW_QUEUES.VERIFIED_OBLIGATIONS],
          aiFindingsCount: workflowCounts[WORKFLOW_QUEUES.AI_FINDINGS],
          metricRowCount: queueMetricRows.length,
          scannedRuns: runRows.length,
          completedRunsInTenant: count ?? null,
          note: 'Workflow queue counts derive from persisted human decisions — no duplicate finding rows. AI Findings hold unreviewed items; after a valid review the effective queue updates automatically.',
        }
      : null,
    queue: workflowFilter,
    total: workflowFilter
      ? workflowFilter === WORKFLOW_QUEUES.ALL_FINDINGS
        ? workflowCounts[WORKFLOW_QUEUES.ALL_FINDINGS]
        : workflowCounts[workflowFilter] ?? 0
      : workflowCounts[WORKFLOW_QUEUES.ALL_FINDINGS],
    items: workflowFilter ? items : [],
    filteredTotal: pageResult?.pagination.totalItems ?? null,
    pagination: pageResult?.pagination ?? null,
    activeFilters: pageResult
      ? {
          verificationFilter: pageResult.verificationFilter,
          approvalFilter: pageResult.approvalFilter,
          search: pageResult.search,
        }
      : null,
    scannedRuns: runRows.length,
    completedRuns: count ?? runRows.length,
    truncated: (count ?? 0) > runRows.length || (citations ?? []).length >= 1000,
    citationsCapped: (citations ?? []).length >= 1000,
    draftCreation: 'Only an accepted Obligation Triage finding can become a DRAFT obligation, and only through finding review. Nothing on this read is approved.',
    humanVerificationNote:
      'Human verification reflects persisted finding-review decisions. Formal obligation approval is a separate maker-checker decision.',
  };
}
