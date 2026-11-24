import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { AI_EXECUTION_STATUS } from '@/lib/ri/ai/enums';
import { buildFindingsView } from '@/lib/ri/ai/finding-review-core.mjs';
import { TRIAGE_QUEUES } from '@/lib/ri/classification/regulatory-classification-policy.mjs';
import {
  loadActiveClassificationPolicy,
  loadPublicationClassificationContext,
  type ClassificationPolicy,
} from '@/lib/ri/services/classification-policy';

const USE_CASE = 'UC-RI-005';
const MAX_RUNS = 20;
const MAX_ITEMS = 150;

const QUEUES = [
  TRIAGE_QUEUES.OBLIGATION,
  TRIAGE_QUEUES.NON_OBLIGATION,
  TRIAGE_QUEUES.EXCEPTION,
] as const;

export type TriageQueueName = (typeof QUEUES)[number];

export function isTriageQueue(value: string | null | undefined): value is TriageQueueName {
  return QUEUES.includes(value as TriageQueueName);
}

type DecisionRow = {
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
  obligation_id: string | null;
};

function clip(value: unknown, max = 500) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export async function listTriageQueues(
  supabase: SupabaseClient,
  organisationId: string,
  queue: TriageQueueName | null,
) {
  const { count, error: countError } = await supabase
    .from('ai_analysis_runs')
    .select('id', { count: 'exact', head: true })
    .eq('organisation_id', organisationId)
    .eq('use_case_id', USE_CASE)
    .eq('execution_status', AI_EXECUTION_STATUS.COMPLETED);
  if (countError) throw new Error(countError.message);

  const { data: runs, error: runError } = await supabase
    .from('ai_analysis_runs')
    .select('id, publication_id, review_status, structured_output, created_at')
    .eq('organisation_id', organisationId)
    .eq('use_case_id', USE_CASE)
    .eq('execution_status', AI_EXECUTION_STATUS.COMPLETED)
    .order('created_at', { ascending: false })
    .limit(MAX_RUNS);
  if (runError) throw new Error(runError.message);

  const runRows = runs ?? [];
  const runIds = runRows.map((r) => r.id as string);
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
              'analysis_run_id, finding_id, decision, triage_queue, disposition, regulatory_classification_code, legal_status, legal_basis, verified_quotation, provision_reference, obligation_id',
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

  const counts: Record<TriageQueueName, number> = {
    OBLIGATION_TRIAGE: 0,
    NON_OBLIGATION_TRIAGE: 0,
    EXCEPTION_TRIAGE: 0,
  };
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
      const recorded = decisionsByFinding.get(`${run.id}:${finding.findingId}`);
      const queueName = (recorded?.triage_queue && isTriageQueue(recorded.triage_queue)
        ? recorded.triage_queue
        : finding.triage?.queue) as TriageQueueName;
      if (!isTriageQueue(queueName)) continue;
      counts[queueName] += 1;
      if (queue && queueName !== queue) continue;
      if (items.length >= MAX_ITEMS) continue;
      const suggestion = finding.suggestion;
      const quotation = recorded?.verified_quotation || suggestion?.sourceQuotation || finding.statement;
      const draftEligible =
        queueName === TRIAGE_QUEUES.OBLIGATION &&
        finding.triage?.conversionEligible === true &&
        !recorded?.obligation_id;
      items.push({
        runId: run.id,
        findingId: finding.findingId,
        reviewHref: `#/ai-analysis/${run.id}`,
        regulator: regulator?.name || regulator?.external_key || context.regulatorKey || null,
        publicationId: run.publication_id,
        publicationTitle: publication?.title || null,
        publicationType: publication?.publication_type || context.publicationType,
        provisionReference: recorded?.provision_reference || suggestion?.citation || null,
        quotation: clip(quotation),
        classificationCode: recorded?.regulatory_classification_code || finding.triage?.code || null,
        legalStatus: recorded?.legal_status || finding.triage?.legalStatus || null,
        modelLabels: (finding as { modelLabels?: string[] }).modelLabels || [],
        legalBasis: clip(recorded?.legal_basis, 300),
        applicability: clip(suggestion?.applicabilityConditions, 300),
        reviewStatus: recorded ? recorded.decision : run.review_status || 'HUMAN_REVIEW_REQUIRED',
        disposition: recorded?.disposition || null,
        triageQueue: queueName,
        provisional: recorded ? false : finding.triage?.provisional === true,
        exceptionReasons: finding.triage?.exceptionReasons || [],
        draftEligible,
        obligationId: recorded?.obligation_id || null,
        legallyVerified: false,
      });
    }
  }

  return {
    ok: true,
    tenantScope: true,
    useCaseId: USE_CASE,
    counts,
    queue,
    total: queue ? counts[queue] : Object.values(counts).reduce((sum, n) => sum + n, 0),
    items: queue ? items : [],
    scannedRuns: runRows.length,
    completedRuns: count ?? runRows.length,
    truncated: (count ?? 0) > runRows.length || (queue ? counts[queue] > items.length : false),
    citationsCapped: (citations ?? []).length >= 1000,
    draftCreation: 'Only an accepted Obligation Triage finding can become a DRAFT obligation, and only through finding review. Nothing on this read is approved.',
  };
}
