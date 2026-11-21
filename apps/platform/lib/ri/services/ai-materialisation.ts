import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlatformRole } from '@/lib/roles';
import { assertNotAutonomousAiAction } from '@/lib/ri/ai/autonomy';
import { assertExperimentalAiTenant } from '@/lib/ri/ai/experimental-ai-tenant-guard';
import { AI_REVIEW_STATUS } from '@/lib/ri/ai/enums';
import { recordAiNotificationEvent } from '@/lib/ri/services/ai-notifications';
import { resolveAcceptedClaimIndexes as resolveAcceptedClaimIndexesCore } from '@/lib/ri/ai/materialisation-logic.mjs';
import { obligationCandidateSkipReason } from '@/lib/ri/ai/obligation-chain-gates.mjs';
import { RiConflictError } from '@/lib/ri/errors';
import { recordWorkflowEvent } from '@/lib/ri/workflow-events';

const CHANGE_USE_CASE = 'UC-RI-002';
const OBLIGATION_USE_CASE = 'UC-RI-005';

type CandidateChange = { title?: string; changeType?: string; materiality?: string; description?: string };
type CandidateObligation = {
  statement?: string;
  citation?: string;
  sourceSection?: string;
  effectiveDate?: string;
  bindingNature?: string;
  sourceQuotation?: string;
};

export function resolveAcceptedClaimIndexes(
  decision: string,
  acceptedClaimIndexes: number[],
  totalClaims: number,
): number[] {
  return resolveAcceptedClaimIndexesCore(decision, acceptedClaimIndexes, totalClaims);
}

export async function materialiseReviewedClaims(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    userId: string;
    role: PlatformRole;
    runId: string;
    reviewId: string;
    decision: string;
    acceptedClaimIndexes: number[];
  },
): Promise<{
  materialised: { entityType: string; entityId: string; claimIndex: number }[];
  skipped: { claimIndex: number; reason: string }[];
}> {
  assertNotAutonomousAiAction('approve_change');
  assertNotAutonomousAiAction('approve_obligation');

  const { data: runRow } = await supabase
    .from('ai_analysis_runs')
    .select('use_case_id')
    .eq('id', params.runId)
    .eq('organisation_id', params.organisationId)
    .maybeSingle();
  if (runRow?.use_case_id) {
    assertExperimentalAiTenant({
      organisationId: params.organisationId,
      useCaseId: runRow.use_case_id,
      operation: 'materialise',
    });
  }

  if (
    params.decision !== AI_REVIEW_STATUS.ACCEPTED &&
    params.decision !== AI_REVIEW_STATUS.PARTIALLY_ACCEPTED
  ) {
    return { materialised: [], skipped: [] };
  }

  const { data: run, error: runErr } = await supabase
    .from('ai_analysis_runs')
    .select('*')
    .eq('id', params.runId)
    .eq('organisation_id', params.organisationId)
    .single();
  if (runErr || !run) throw new Error('not_found');

  const { data: citations } = await supabase
    .from('ai_analysis_citations')
    .select('claim_index, citation_status')
    .eq('analysis_run_id', params.runId)
    .eq('organisation_id', params.organisationId);

  const output = (run.structured_output || {}) as Record<string, unknown>;
  const claims = (output.claims as unknown[]) || [];
  const indexes = resolveAcceptedClaimIndexes(
    params.decision,
    params.acceptedClaimIndexes,
    claims.length || ((output.candidates as unknown[]) || []).length,
  );

  const materialised: { entityType: string; entityId: string; claimIndex: number }[] = [];
  const skipped: { claimIndex: number; reason: string }[] = [];

  if (run.use_case_id === CHANGE_USE_CASE) {
    const candidates = (output.candidates as CandidateChange[]) || [];
    for (const claimIndex of indexes) {
      const existing = await supabase
        .from('ai_claim_materialisations')
        .select('entity_id')
        .eq('analysis_review_id', params.reviewId)
        .eq('claim_index', claimIndex)
        .eq('entity_type', 'regulatory_change')
        .maybeSingle();
      if (existing.data?.entity_id) {
        materialised.push({
          entityType: 'regulatory_change',
          entityId: existing.data.entity_id,
          claimIndex,
        });
        continue;
      }

      const candidate = candidates[claimIndex];
      if (!candidate?.title) {
        skipped.push({ claimIndex, reason: 'candidate_missing_title' });
        continue;
      }

      const { data: change, error: chgErr } = await supabase
        .from('regulatory_changes')
        .insert({
          organisation_id: params.organisationId,
          publication_id: run.publication_id,
          publication_version_id: run.publication_version_id,
          title: String(candidate.title).slice(0, 500),
          description: candidate.description ?? null,
          change_type: candidate.changeType || 'REGULATORY_CHANGE',
          materiality: candidate.materiality ?? null,
          status: 'DRAFT',
          owner_user_id: params.userId,
          origin: 'AI_ASSISTED',
          ai_analysis_run_id: params.runId,
          ai_analysis_review_id: params.reviewId,
          created_by_user_id: params.userId,
        })
        .select('id')
        .single();
      if (chgErr) throw new Error(chgErr.message);

      await supabase.from('ai_claim_materialisations').insert({
        organisation_id: params.organisationId,
        analysis_run_id: params.runId,
        analysis_review_id: params.reviewId,
        claim_index: claimIndex,
        entity_type: 'regulatory_change',
        entity_id: change.id,
      });

      await recordWorkflowEvent(supabase, {
        organisationId: params.organisationId,
        entityType: 'regulatory_change',
        entityId: change.id,
        eventType: 'AI_CHANGE_MATERIALISED',
        actorUserId: params.userId,
        toStatus: 'DRAFT',
        metadata: {
          analysis_run_id: params.runId,
          review_id: params.reviewId,
          claim_index: claimIndex,
          origin: 'AI_ASSISTED',
        },
      });

      materialised.push({ entityType: 'regulatory_change', entityId: change.id, claimIndex });
    }
  }

  if (run.use_case_id === OBLIGATION_USE_CASE) {
    // Claim-index materialisation carries no regulatory classification; ri_guard_obligation_classification
    // refuses it. Obligations come only from the per-finding review under the classification policy.
    throw new RiConflictError('obligation_conversion_requires_finding_review');
  }

  if (run.use_case_id === OBLIGATION_USE_CASE) {
    const candidates = (output.candidates as CandidateObligation[]) || [];
    const changeId: string | null = run.target_entity_id || null;
    const { data: change } = changeId
      ? await supabase
          .from('regulatory_changes')
          .select('id, publication_id')
          .eq('id', changeId)
          .eq('organisation_id', params.organisationId)
          .maybeSingle()
      : { data: null };

    for (const claimIndex of indexes) {
      const citeRow = (citations ?? []).find((c) => c.claim_index === claimIndex);
      const candidate = candidates[claimIndex];
      const skipReason = obligationCandidateSkipReason({
        citation: citeRow ?? null,
        statement: candidate?.statement ?? null,
        changeId,
        changeInOrg: Boolean(change),
      });
      if (skipReason) {
        skipped.push({ claimIndex, reason: skipReason });
        continue;
      }

      const existing = await supabase
        .from('ai_claim_materialisations')
        .select('entity_id')
        .eq('analysis_review_id', params.reviewId)
        .eq('claim_index', claimIndex)
        .eq('entity_type', 'regulatory_obligation')
        .maybeSingle();
      if (existing.data?.entity_id) {
        materialised.push({
          entityType: 'regulatory_obligation',
          entityId: existing.data.entity_id,
          claimIndex,
        });
        continue;
      }

      const claimsArr = (output.claims as Array<Record<string, unknown>>) || [];
      const claimMeta = claimsArr[claimIndex];
      if (!change || !candidate?.statement) continue;

      const { data: obl, error: oblErr } = await supabase
        .from('regulatory_obligations')
        .insert({
          organisation_id: params.organisationId,
          regulatory_change_id: change.id,
          publication_id: change.publication_id,
          publication_version_id: run.publication_version_id,
          obligation_statement: String(candidate.statement).slice(0, 12000),
          citation: candidate.citation ?? null,
          source_section: candidate.sourceSection ?? null,
          effective_date: candidate.effectiveDate ?? null,
          status: 'DRAFT',
          owner_user_id: params.userId,
          origin: 'AI_ASSISTED',
          ai_analysis_run_id: params.runId,
          ai_analysis_review_id: params.reviewId,
          created_by_user_id: params.userId,
          metadata: {
            recordProvenance: 'uat_authorised',
            bindingNature:
              (typeof claimMeta?.bindingNature === 'string' && claimMeta.bindingNature) ||
              (typeof candidate.bindingNature === 'string' && candidate.bindingNature) ||
              'unknown',
            sourceQuotation:
              (typeof claimMeta?.sourceQuotation === 'string' && claimMeta.sourceQuotation) ||
              null,
            pdfGrounded: Boolean((output._forgeniqGrounding as { kind?: string })?.kind === 'pdf_primary_v1'),
          },
        })
        .select('id')
        .single();
      if (oblErr) throw new Error(oblErr.message);

      await supabase.from('ai_claim_materialisations').insert({
        organisation_id: params.organisationId,
        analysis_run_id: params.runId,
        analysis_review_id: params.reviewId,
        claim_index: claimIndex,
        entity_type: 'regulatory_obligation',
        entity_id: obl.id,
      });

      await recordWorkflowEvent(supabase, {
        organisationId: params.organisationId,
        entityType: 'regulatory_obligation',
        entityId: obl.id,
        eventType: 'AI_OBLIGATION_MATERIALISED',
        actorUserId: params.userId,
        toStatus: 'DRAFT',
        metadata: {
          analysis_run_id: params.runId,
          review_id: params.reviewId,
          claim_index: claimIndex,
          origin: 'AI_ASSISTED',
        },
      });

      materialised.push({ entityType: 'regulatory_obligation', entityId: obl.id, claimIndex });
    }
  }

  if (skipped.length > 0) {
    await recordWorkflowEvent(supabase, {
      organisationId: params.organisationId,
      entityType: 'ai_analysis_run',
      entityId: params.runId,
      eventType: 'AI_MATERIALISATION_SKIPPED',
      actorUserId: params.userId,
      metadata: { review_id: params.reviewId, skipped, origin: 'AI_ASSISTED' },
    });
  }

  if (materialised.length > 0) {
    await recordAiNotificationEvent(supabase, {
      eventType: 'AI_MATERIALISATION_COMPLETED',
      publicationId: run.publication_id,
      organisationId: params.organisationId,
      payload: {
        analysis_run_id: params.runId,
        review_id: params.reviewId,
        records: materialised,
      },
    });
  }

  return { materialised, skipped };
}
