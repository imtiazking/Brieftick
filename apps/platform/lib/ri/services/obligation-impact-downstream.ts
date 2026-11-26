import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { PlatformRole } from '@/lib/roles';
import { mapImpactSuggestionToDraftFields } from '@/lib/ri/ai/impact-suggestion-mapper.mjs';
import { lifecycleAiAudit, runLifecycleStageAnalysis } from '@/lib/ri/ai/lifecycle-stage-ai';
import {
  buildRegulatoryEvidencePack,
  evidencePackAdvisory,
  evidencePackSourceSections,
  regulatoryEvidenceMetadata,
} from '@/lib/ri/ai/lifecycle-evidence.mjs';
import { FIXTURE_PROVIDER_ID } from '@/lib/ri/ai/fixture-provider';
import { assertRowInOrganisation } from '@/lib/ri/db-guard';
import { RiConflictError } from '@/lib/ri/errors';
import {
  buildLockedChildMetadataFromParentChange,
  workflowMetadataForChildRecordCreate,
} from '@/lib/ri/lab-api/child-record-provenance';
import { fanOutTenantNotification } from '@/lib/ri/services/tenant-notification-fanout';
import { recordWorkflowEvent } from '@/lib/ri/workflow-events';

export type Stage2DownstreamResult =
  | { ok: true; skipped: true; reason: string }
  | { ok: true; skipped: false; impactAssessmentId: string; reused: boolean; aiProvider: string };

/**
 * Outcome of preparing Stage 2 for an obligation that is about to become OPEN. Preparing performs NO writes.
 *  - reuse: an impact already exists for this obligation (idempotent repeat or reopen).
 *  - create: a DRAFT impact payload is ready to be committed atomically with the approval.
 *  - skip: Stage 2 genuinely does not apply (no regulatory change); recorded durably, never silent.
 *  - unavailable: Stage 2 applies but cannot be drafted now (AI disabled/denied/failed): approval must be refused.
 */
export type Stage2Draft =
  | { kind: 'reuse'; impactAssessmentId: string }
  | {
      kind: 'create';
      impact: Record<string, unknown>;
      eventMetadata: Record<string, unknown>;
      aiProvider: string;
      ownerUserId: string;
      changeId: string;
    }
  | { kind: 'skip'; reason: string }
  | { kind: 'unavailable'; reason: string };

function privilegeDenied(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = `${error.code ?? ''} ${error.message ?? ''}`;
  return error.code === '42501' || /row-level security|permission denied/i.test(msg);
}

/** Server workflow writer used only after the caller has already passed obligation approval checks. */
function stage2WorkflowWriter(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function findImpactForSourceObligation(
  supabase: SupabaseClient,
  organisationId: string,
  obligationId: string,
) {
  const { data, error } = await supabase
    .from('impact_assessments')
    .select('id, status')
    .eq('organisation_id', organisationId)
    .eq('metadata->>sourceRegulatoryObligationId', obligationId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Compute the Stage 2 outcome for an obligation WITHOUT writing anything. `expectedStatus` is the status the
 * obligation must currently have; `overrides` are field edits that will be applied in the same approval so the
 * draft reflects what will actually be committed.
 */
export async function prepareStage2ImpactDraft(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    obligationId: string;
    actorUserId: string;
    expectedStatus: string;
    overrides?: Record<string, unknown>;
  },
): Promise<Stage2Draft> {
  await assertRowInOrganisation(supabase, 'regulatory_obligations', params.obligationId, params.organisationId);

  const { data: current, error: oblErr } = await supabase
    .from('regulatory_obligations')
    .select(
      'id, status, obligation_statement, citation, owner_user_id, regulatory_change_id, publication_id, effective_date, metadata',
    )
    .eq('id', params.obligationId)
    .eq('organisation_id', params.organisationId)
    .single();
  if (oblErr || !current) throw new Error('not_found');
  if (current.status !== params.expectedStatus) {
    return { kind: 'skip', reason: 'obligation_not_approved' };
  }
  const obligation = { ...current, ...(params.overrides ?? {}) } as typeof current;
  if (!obligation.regulatory_change_id) {
    return { kind: 'skip', reason: 'missing_regulatory_change' };
  }

  const existing = await findImpactForSourceObligation(supabase, params.organisationId, params.obligationId);
  if (existing?.id) return { kind: 'reuse', impactAssessmentId: existing.id };

  const { data: change, error: changeErr } = await supabase
    .from('regulatory_changes')
    .select('id, title, description, external_key, origin, publication_id, metadata')
    .eq('id', obligation.regulatory_change_id)
    .eq('organisation_id', params.organisationId)
    .single();
  if (changeErr || !change) return { kind: 'skip', reason: 'change_not_found' };

  const ownerUserId = obligation.owner_user_id || params.actorUserId;
  const { metadata: rowMetadata, recordProvenance, labClass } = buildLockedChildMetadataFromParentChange({
    parentChange: change,
    actorUserId: params.actorUserId,
  });

  const evidencePack = buildRegulatoryEvidencePack(obligation);
  const analysis = await runLifecycleStageAnalysis({
    stage: 2,
    organisationId: params.organisationId,
    idempotencyKey: `stage2:${params.obligationId}`,
    sourceSections: [
      {
        sourceSectionId: 'OBL-1',
        citation: obligation.citation || 'obligation',
        text: String(obligation.obligation_statement || '').slice(0, 8000),
      },
      ...evidencePackSourceSections(evidencePack),
    ],
    evidencePack,
    advisoryContext: {
      regulatoryEvidence: evidencePackAdvisory(evidencePack),
      instruction:
        'Organisational systems and financials are not supplied. State assumptions. Do not invent firm facts.',
      changeTitle: change.title || null,
    },
  });
  if (!analysis.ok) return { kind: 'unavailable', reason: String(analysis.code ?? 'stage2_analysis_unavailable') };

  const mapped = mapImpactSuggestionToDraftFields({
    structured: analysis.structured,
    obligationStatement: obligation.obligation_statement,
    obligationCitation: obligation.citation,
    evidencePack,
    changeTitle: change.title,
  });
  const stage2AiMeta = {
    ...mapped.stage2Metadata,
    ...lifecycleAiAudit(analysis),
    aiProvider: analysis.providerId || FIXTURE_PROVIDER_ID,
  };

  const metadata = {
    ...rowMetadata,
    sourceRegulatoryObligationId: params.obligationId,
    stage2Workflow: 'obligation_approved_to_impact_draft',
    stage2Ai: stage2AiMeta,
    regulatoryEvidence: regulatoryEvidenceMetadata(evidencePack, analysis.evidence),
    recordProvenance,
    labProvenanceLocked: true,
    parentRegulatoryChangeId: obligation.regulatory_change_id,
  };

  const impact = {
    organisation_id: params.organisationId,
    regulatory_change_id: obligation.regulatory_change_id,
    status: 'DRAFT',
    owner_user_id: ownerUserId,
    business_impact: mapped.business_impact,
    operational_impact: mapped.operational_impact,
    technology_impact: mapped.technology_impact,
    compliance_impact: mapped.compliance_impact,
    financial_impact: mapped.financial_impact,
    implementation_complexity: mapped.implementation_complexity,
    materiality: mapped.materiality,
    metadata,
    business_areas: mapped.business_areas,
  };

  return {
    kind: 'create',
    impact,
    eventMetadata: workflowMetadataForChildRecordCreate({
      recordProvenance,
      parentChangeId: obligation.regulatory_change_id,
      actorUserId: params.actorUserId,
      labClass,
    }),
    aiProvider: analysis.providerId || FIXTURE_PROVIDER_ID,
    ownerUserId,
    changeId: obligation.regulatory_change_id,
  };
}

export type AtomicApprovalResult = {
  statusChanged: boolean;
  impactAssessmentId: string | null;
  reused: boolean;
  skipped: boolean;
  skipReason: string | null;
};

/**
 * Commit an approval into OPEN, its Stage 2 impact and every audit event in ONE database transaction
 * (public.approve_obligation_with_stage2). Any failure rolls back everything; nothing is partially applied.
 */
export async function commitObligationApprovalWithStage2(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    obligationId: string;
    expectedStatus: string;
    actorUserId: string;
    draft: Extract<Stage2Draft, { kind: 'reuse' | 'create' | 'skip' }>;
    fields?: Record<string, unknown>;
    expectedUpdatedAt?: string | null;
  },
): Promise<AtomicApprovalResult> {
  const { draft } = params;
  const impact =
    draft.kind === 'create' ? draft.impact : draft.kind === 'reuse' ? { reuseOnly: true } : null;
  const { data, error } = await supabase.rpc('approve_obligation_with_stage2', {
    p_organisation_id: params.organisationId,
    p_obligation_id: params.obligationId,
    p_expected_status: params.expectedStatus,
    p_actor_user_id: params.actorUserId,
    p_impact: impact,
    p_skip_reason: draft.kind === 'skip' ? draft.reason : null,
    p_impact_event_metadata: draft.kind === 'create' ? draft.eventMetadata : {},
    p_ai_provider: draft.kind === 'create' ? draft.aiProvider : null,
    p_fields: params.fields ?? {},
    p_expected_updated_at: params.expectedUpdatedAt ?? null,
  });
  if (error) {
    const message = String(error.message ?? 'approval_failed');
    if (/stale_record/.test(message)) throw new Error('stale_record');
    if (/not_found/.test(message)) throw new Error('not_found');
    // Specific database refusals keep their own identity so callers and audits can tell them apart.
    if (/segregation_of_duties/.test(message)) throw new Error('segregation_of_duties');
    const classified = /(classified_obligation_[a-z_]+|obligation_classification_immutable)/.exec(message);
    if (classified) throw new RiConflictError(classified[1]);
    if (error.code === '42501' || /insufficient_role|actor_mismatch|unauthenticated/.test(message)) {
      throw new Error('insufficient_role');
    }
    throw new Error(message);
  }
  const result = (data ?? {}) as Record<string, unknown>;
  const outcome: AtomicApprovalResult = {
    statusChanged: result.statusChanged === true,
    impactAssessmentId: typeof result.impactAssessmentId === 'string' ? result.impactAssessmentId : null,
    reused: result.reused === true,
    skipped: result.skipped === true,
    skipReason: typeof result.skipReason === 'string' ? result.skipReason : null,
  };

  // The approval is committed. Notifying the impact owner is best effort and is not part of the invariant.
  if (draft.kind === 'create' && outcome.impactAssessmentId && !outcome.reused) {
    if (draft.ownerUserId && draft.ownerUserId !== params.actorUserId) {
      try {
        await fanOutTenantNotification(stage2WorkflowWriter() ?? supabase, {
          organisationId: params.organisationId,
          createdByUserId: params.actorUserId,
          recipientUserId: draft.ownerUserId,
          notificationType: 'ASSIGNMENT',
          severity: 'MEDIUM',
          title: 'Impact assessment draft assigned',
          message:
            'A new AI-assisted impact assessment draft was created from an approved obligation. Review and complete before submit.',
          entityType: 'impact_assessment',
          entityId: outcome.impactAssessmentId,
          linkPath: `#/assessment/${outcome.impactAssessmentId}`,
          workflowEntityType: 'impact_assessment',
          workflowEntityId: outcome.impactAssessmentId,
          payload: { sourceRegulatoryObligationId: params.obligationId, stage: 2 },
        });
      } catch {
        /* notification is advisory; the approval and its impact are already durable */
      }
    }
  }
  return outcome;
}

/**
 * Idempotent Stage 2 for an obligation that is ALREADY open: OPEN → DRAFT impact assessment with fixture UC-RI-004
 * draft when enabled. Used for recovery/backfill and by direct callers; new approvals go through
 * commitObligationApprovalWithStage2 so they cannot be left half-applied.
 */
export async function ensureImpactAssessmentFromApprovedObligation(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    obligationId: string;
    actorUserId: string;
    role?: PlatformRole | null;
  },
): Promise<Stage2DownstreamResult> {
  const draft = await prepareStage2ImpactDraft(supabase, {
    organisationId: params.organisationId,
    obligationId: params.obligationId,
    actorUserId: params.actorUserId,
    expectedStatus: 'OPEN',
  });
  if (draft.kind === 'skip' || draft.kind === 'unavailable') {
    return { ok: true, skipped: true, reason: draft.reason };
  }
  if (draft.kind === 'reuse') {
    return {
      ok: true,
      skipped: false,
      impactAssessmentId: draft.impactAssessmentId,
      reused: true,
      aiProvider: FIXTURE_PROVIDER_ID,
    };
  }

  const { business_areas: businessAreas, ...impactRow } = draft.impact as Record<string, unknown> & {
    business_areas: string[];
  };
  const ownerUserId = draft.ownerUserId;

  let writer = supabase;
  let inserted = await writer.from('impact_assessments').insert(impactRow).select('id').single();
  if (inserted.error && privilegeDenied(inserted.error)) {
    const workflowWriter = stage2WorkflowWriter();
    if (!workflowWriter) throw new Error(inserted.error.message);
    writer = workflowWriter;
    inserted = await writer.from('impact_assessments').insert(impactRow).select('id').single();
  }
  const impact = inserted.data;
  const insertErr = inserted.error;

  if (insertErr) {
    if (insertErr.code === '23505') {
      const again = await findImpactForSourceObligation(supabase, params.organisationId, params.obligationId);
      if (again?.id) {
        return {
          ok: true,
          skipped: false,
          impactAssessmentId: again.id,
          reused: true,
          aiProvider: draft.aiProvider,
        };
      }
    }
    throw new Error(insertErr.message);
  }
  if (!impact?.id) throw new Error('impact_insert_failed');

  await recordWorkflowEvent(writer, {
    organisationId: params.organisationId,
    entityType: 'impact_assessment',
    entityId: impact.id,
    eventType: 'IMPACT_CREATED',
    actorUserId: params.actorUserId,
    toStatus: 'DRAFT',
    metadata: {
      ...draft.eventMetadata,
      sourceRegulatoryObligationId: params.obligationId,
      stage2: true,
    },
  });

  await recordWorkflowEvent(writer, {
    organisationId: params.organisationId,
    entityType: 'regulatory_obligation',
    entityId: params.obligationId,
    eventType: 'IMPACT_INITIATED_FROM_OBLIGATION',
    actorUserId: params.actorUserId,
    toStatus: 'OPEN',
    metadata: {
      impactAssessmentId: impact.id,
      regulatoryChangeId: draft.changeId,
      aiProvider: draft.aiProvider,
      aiUseCaseId: 'UC-RI-004',
    },
  });

  if (Array.isArray(businessAreas) && businessAreas.length) {
    await supabase.from('impact_assessment_business_areas').insert(
      businessAreas.map((business_area) => ({
        organisation_id: params.organisationId,
        impact_assessment_id: impact.id,
        business_area,
      })),
    );
  }

  if (ownerUserId && ownerUserId !== params.actorUserId) {
    await fanOutTenantNotification(writer, {
      organisationId: params.organisationId,
      createdByUserId: params.actorUserId,
      recipientUserId: ownerUserId,
      notificationType: 'ASSIGNMENT',
      severity: 'MEDIUM',
      title: 'Impact assessment draft assigned',
      message:
        'A new AI-assisted impact assessment draft was created from an approved obligation. Review and complete before submit.',
      entityType: 'impact_assessment',
      entityId: impact.id,
      linkPath: `#/assessment/${impact.id}`,
      workflowEntityType: 'impact_assessment',
      workflowEntityId: impact.id,
      payload: { sourceRegulatoryObligationId: params.obligationId, stage: 2 },
    });
  }

  return {
    ok: true,
    skipped: false,
    impactAssessmentId: impact.id,
    reused: false,
    aiProvider: draft.aiProvider,
  };
}
