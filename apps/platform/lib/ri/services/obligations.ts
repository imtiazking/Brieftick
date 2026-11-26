import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlatformRole } from '@/lib/roles';
import {
  assessAiObligationTransition,
  isAiObligationReviewDecision,
} from '@/lib/ri/ai/ai-obligation-workflow.mjs';
import { assessApplicabilityGate } from '@/lib/ri/ai/obligation-chain-gates.mjs';
import { validateManualObligationClassification } from '@/lib/ri/classification/regulatory-classification-policy.mjs';
import { assertRowInOrganisation } from '@/lib/ri/db-guard';
import { RiConflictError, RiValidationError } from '@/lib/ri/errors';
import { getApplicabilityForPublication } from '@/lib/ri/services/applicability';
import {
  loadActiveClassificationPolicy,
  loadPublicationClassificationContext,
} from '@/lib/ri/services/classification-policy';
import { canRi } from '@/lib/ri/permissions';
import {
  buildLockedChildMetadataFromParentChange,
  workflowMetadataForChildRecordCreate,
} from '@/lib/ri/lab-api/child-record-provenance';
import { recordWorkflowEvent } from '@/lib/ri/workflow-events';
import {
  parseOptionalDate,
  parseOptionalText,
  parseObligationStatus,
  parseRequiredText,
  parseUuid,
} from '@/lib/ri/validation';
import { summarizeProductionObligationRows } from '@/lib/ri/lab-compat/dashboard-parity.mjs';
import { assertActiveOrganisationAssignee } from '@/lib/ri/organisation-assignee';
import { getComplianceLifecycleForObligation } from '@/lib/ri/services/compliance-lifecycle';
import {
  commitObligationApprovalWithStage2,
  ensureImpactAssessmentFromApprovedObligation,
  prepareStage2ImpactDraft,
} from '@/lib/ri/services/obligation-impact-downstream';
import { buildStage2ApprovalPinFromDraft } from '@/lib/ri/services/stage2-approval-pin.mjs';

export function summarizeObligationListRows(rows: { status: string }[]) {
  return summarizeProductionObligationRows(rows);
}

export async function listObligations(supabase: SupabaseClient, organisationId: string) {
  const { data, error } = await supabase
    .from('regulatory_obligations')
    .select(
      `
      id, external_key, obligation_statement, status, priority, due_date, effective_date, owner_user_id,
      regulatory_change_id, publication_id, citation, metadata, origin, updated_at,
      change:regulatory_changes(id, title, external_key, origin, description, publication_id, metadata),
      publication:regulatory_publications(id, title)
    `,
    )
    .eq('organisation_id', organisationId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createObligation(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    regulatoryChangeId: string;
    userId: string;
    obligationStatement: string;
    citation?: string | null;
    sourceSection?: string | null;
    priority?: string | null;
    effectiveDate?: string | null;
    dueDate?: string | null;
    status?: string;
    regulatoryClassificationCode?: string | null;
    legalBasis?: string | null;
    authoritativeProvision?: { reference?: string | null; sourceUrl?: string | null; quotation?: string | null } | null;
    supportsObligationId?: string | null;
  },
) {
  const changeId = parseUuid(params.regulatoryChangeId, 'regulatory_change_id');
  await assertRowInOrganisation(supabase, 'regulatory_changes', changeId, params.organisationId);
  const { data: change } = await supabase
    .from('regulatory_changes')
    .select('id, title, description, external_key, origin, publication_id, metadata')
    .eq('id', changeId)
    .single();
  if (!change) throw new Error('not_found');

  const status = params.status ? parseObligationStatus(params.status) : 'DRAFT';
  if (status !== 'DRAFT') throw new RiValidationError('classified_obligation_must_start_draft');

  const classificationContext = await loadPublicationClassificationContext(supabase, change.publication_id ?? null);
  const policy = await loadActiveClassificationPolicy(supabase, classificationContext.regulatorKey);
  const provision = params.authoritativeProvision
    ? {
        reference: parseOptionalText(params.authoritativeProvision.reference, 500),
        sourceUrl: parseOptionalText(params.authoritativeProvision.sourceUrl, 2000),
        quotation: parseOptionalText(params.authoritativeProvision.quotation, 4000),
      }
    : null;
  const classification = validateManualObligationClassification({
    policy,
    input: {
      code: params.regulatoryClassificationCode ?? null,
      legalBasis: params.legalBasis ?? null,
      authoritativeProvision: provision,
      supportsObligationId: params.supportsObligationId ?? null,
    },
  });
  if (!classification.ok) {
    if (classification.error === 'classification_policy_unavailable' || classification.error.startsWith('obligation_conversion_not_permitted')) {
      throw new RiConflictError(classification.error);
    }
    throw new RiValidationError(classification.error);
  }

  if (change.publication_id) {
    const applicability = assessApplicabilityGate(
      await getApplicabilityForPublication(supabase, params.organisationId, change.publication_id),
    );
    if (!applicability.ok) throw new RiConflictError(applicability.code);
  }

  const { metadata: lockedMetadata, recordProvenance, labClass } = buildLockedChildMetadataFromParentChange({
    parentChange: change,
    actorUserId: params.userId,
  });
  const code = String(params.regulatoryClassificationCode).trim();
  const rowMetadata = {
    ...lockedMetadata,
    regulatoryClassificationCode: code,
    legalBasis: parseOptionalText(params.legalBasis, 2000),
    authoritativeProvision: provision,
    ...(params.supportsObligationId ? { supportsObligationId: parseUuid(params.supportsObligationId, 'supports_obligation_id') } : {}),
  };

  const { data, error } = await supabase
    .from('regulatory_obligations')
    .insert({
      organisation_id: params.organisationId,
      regulatory_change_id: changeId,
      publication_id: change.publication_id,
      obligation_statement: parseRequiredText(params.obligationStatement, 'obligation_statement', 12000),
      citation: parseOptionalText(params.citation, 2000),
      source_section: parseOptionalText(params.sourceSection, 500),
      priority: parseOptionalText(params.priority, 100),
      effective_date: parseOptionalDate(params.effectiveDate),
      due_date: parseOptionalDate(params.dueDate),
      owner_user_id: params.userId,
      created_by_user_id: params.userId,
      status,
      metadata: rowMetadata,
    })
    .select()
    .single();
  if (error) {
    const dbCode = error.message.split(' ')[0];
    if (/^(obligation_|classification_policy_unavailable|classified_obligation_)/.test(dbCode)) throw new RiConflictError(dbCode);
    throw new Error(error.message);
  }

  await recordWorkflowEvent(supabase, {
    organisationId: params.organisationId,
    entityType: 'regulatory_obligation',
    entityId: data.id,
    eventType: 'OBLIGATION_CREATED',
    actorUserId: params.userId,
    toStatus: status,
    metadata: {
      ...workflowMetadataForChildRecordCreate({
        recordProvenance,
        parentChangeId: changeId,
        actorUserId: params.userId,
        labClass,
      }),
      regulatoryClassificationCode: code,
      legalStatus: classification.entry.legalStatus,
      classificationPolicyVersion: policy?.policyVersion ?? null,
      authoritativeReference: provision?.reference ?? null,
    },
  });

  return data;
}

export async function getObligationDetail(
  supabase: SupabaseClient,
  organisationId: string,
  obligationId: string,
) {
  await assertRowInOrganisation(
    supabase,
    'regulatory_obligations',
    obligationId,
    organisationId,
  );
  const { data, error } = await supabase
    .from('regulatory_obligations')
    .select(
      `
      *,
      change:regulatory_changes(
        id, title, status,
        publication:regulatory_publications(id, title, canonical_url, data_origin)
      )
    `,
    )
    .eq('id', obligationId)
    .eq('organisation_id', organisationId)
    .single();
  if (error) throw new Error(error.message);

  const change = Array.isArray(data.change) ? data.change[0] : data.change;
  const [{ data: impacts }, { data: riskLinks }, { data: controlLinks }] = await Promise.all([
    supabase
      .from('impact_assessments')
      .select('id, status, materiality')
      .eq('organisation_id', organisationId)
      .eq('regulatory_change_id', data.regulatory_change_id),
    supabase
      .from('obligation_risk_links')
      .select('risk:risks(id, title)')
      .eq('organisation_id', organisationId)
      .eq('obligation_id', obligationId),
    supabase
      .from('obligation_control_links')
      .select('control:controls(id, name)')
      .eq('organisation_id', organisationId)
      .eq('obligation_id', obligationId),
  ]);

  const risks = (riskLinks ?? []).map((r) => (Array.isArray(r.risk) ? r.risk[0] : r.risk)).filter(Boolean);
  const controls = (controlLinks ?? [])
    .map((r) => (Array.isArray(r.control) ? r.control[0] : r.control))
    .filter(Boolean);

  const { data: stage2Impact } = await supabase
    .from('impact_assessments')
    .select('id, status, materiality, metadata')
    .eq('organisation_id', organisationId)
    .eq('metadata->>sourceRegulatoryObligationId', obligationId)
    .limit(1)
    .maybeSingle();

  const complianceLifecycle = await getComplianceLifecycleForObligation(
    supabase,
    organisationId,
    obligationId,
  );

  return {
    obligation: { ...data, change },
    impacts: impacts ?? [],
    stage2ImpactAssessment: stage2Impact ?? null,
    complianceLifecycle,
    risks,
    controls,
  };
}

async function assertAiObligationTransition(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    obligationId: string;
    existing: { status: string; created_by_user_id?: string | null; ai_analysis_run_id?: string | null };
    next: string;
    userId: string;
    role: PlatformRole | null;
  },
) {
  let requestedBy: string | null = null;
  let submittedBy: string | null = null;
  if (params.next === 'OPEN') {
    if (params.existing.ai_analysis_run_id) {
      const { data: run } = await supabase
        .from('ai_analysis_runs')
        .select('requested_by')
        .eq('id', params.existing.ai_analysis_run_id)
        .eq('organisation_id', params.organisationId)
        .maybeSingle();
      requestedBy = run?.requested_by ?? null;
    }
    const { data: submission } = await supabase
      .from('workflow_events')
      .select('actor_user_id')
      .eq('organisation_id', params.organisationId)
      .eq('entity_type', 'regulatory_obligation')
      .eq('entity_id', params.obligationId)
      .eq('event_type', 'OBLIGATION_STATUS_CHANGED')
      .eq('to_status', 'IN_REVIEW')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    submittedBy = submission?.actor_user_id ?? null;
  }
  const verdict = assessAiObligationTransition({
    from: params.existing.status,
    to: params.next,
    actorUserId: params.userId,
    actorCanReview: canRi(params.role, 'obligation:review'),
    requestedByUserId: requestedBy,
    acceptedByUserId: params.existing.created_by_user_id ?? null,
    submittedByUserId: submittedBy,
  });
  if (!verdict.ok) {
    if (verdict.code === 'segregation_of_duties') throw new Error('segregation_of_duties');
    throw new RiConflictError(verdict.code);
  }
}

async function readObligationRow(supabase: SupabaseClient, organisationId: string, obligationId: string) {
  const { data, error } = await supabase
    .from('regulatory_obligations')
    .select()
    .eq('id', obligationId)
    .eq('organisation_id', organisationId)
    .single();
  if (error || !data) throw new Error(error?.message ?? 'not_found');
  return data;
}

export async function updateObligation(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    obligationId: string;
    userId: string;
    role?: PlatformRole | null;
    fields: Record<string, unknown>;
    expectedUpdatedAt?: string | null;
    /** Caller holds obligation:review but not obligation:write: only an AI review decision is allowed. */
    reviewDecisionOnly?: boolean;
  },
) {
  await assertRowInOrganisation(
    supabase,
    'regulatory_obligations',
    params.obligationId,
    params.organisationId,
  );
  const { data: existing } = await supabase
    .from('regulatory_obligations')
    .select('status, updated_at, owner_user_id, origin, created_by_user_id, ai_analysis_run_id, metadata')
    .eq('id', params.obligationId)
    .eq('organisation_id', params.organisationId)
    .single();
  if (!existing) throw new Error('not_found');
  const governed =
    existing.origin === 'AI_ASSISTED' ||
    Boolean((existing.metadata as Record<string, unknown> | null)?.classificationPolicyId);
  if (
    params.reviewDecisionOnly &&
    !isAiObligationReviewDecision({
      fieldKeys: Object.keys(params.fields),
      origin: existing.origin,
      governed,
      from: existing.status,
      to: params.fields.status,
    })
  ) {
    throw new Error('insufficient_role');
  }
  if (
    params.expectedUpdatedAt &&
    new Date(existing.updated_at).getTime() !== new Date(params.expectedUpdatedAt).getTime()
  ) {
    throw new Error('stale_record');
  }

  const update: Record<string, unknown> = {};
  if ('obligation_statement' in params.fields) {
    update.obligation_statement = parseRequiredText(
      params.fields.obligation_statement,
      'obligation_statement',
      12000,
    );
  }
  if ('citation' in params.fields) update.citation = parseOptionalText(params.fields.citation, 2000);
  if ('source_section' in params.fields) {
    update.source_section = parseOptionalText(params.fields.source_section, 500);
  }
  if ('priority' in params.fields) update.priority = parseOptionalText(params.fields.priority, 100);
  if ('effective_date' in params.fields) {
    update.effective_date = parseOptionalDate(params.fields.effective_date);
  }
  if ('due_date' in params.fields) update.due_date = parseOptionalDate(params.fields.due_date);
  if ('owner_user_id' in params.fields) {
    const assignee = await assertActiveOrganisationAssignee(
      supabase,
      params.organisationId,
      String(params.fields.owner_user_id),
    );
    update.owner_user_id = assignee.clerkUserId;
  }
  if ('status' in params.fields) {
    const next = parseObligationStatus(params.fields.status);
    if (governed && next !== existing.status) {
      await assertAiObligationTransition(supabase, {
        organisationId: params.organisationId,
        obligationId: params.obligationId,
        existing,
        next,
        userId: params.userId,
        role: params.role ?? null,
      });
    }
    update.status = next;
  }

  const becomingOpen = update.status === 'OPEN' && existing.status !== 'OPEN';
  let data: Awaited<ReturnType<typeof readObligationRow>>;

  if (becomingOpen) {
    // Approval into OPEN is atomic: the Stage 2 draft is computed first (no writes), then the status change, the
    // field edits, the impact assessment and every audit event commit in ONE database transaction. A failure at
    // any point leaves the obligation exactly as it was; it can never be OPEN without its Stage 2 linkage.
    const { status: _status, ...fieldEdits } = update;
    void _status;
    let draft = await prepareStage2ImpactDraft(supabase, {
      organisationId: params.organisationId,
      obligationId: params.obligationId,
      actorUserId: params.userId,
      expectedStatus: existing.status,
      overrides: fieldEdits,
    });
    if (draft.kind === 'skip' && draft.reason === 'obligation_not_approved') throw new Error('stale_record');
  if (params.role === 'REVIEWER' && draft.kind === 'create') {
    const stored = (existing.metadata as Record<string, unknown> | null)?.stage2ApprovalPin as
      | { kind?: string; impact?: Record<string, unknown> }
      | undefined;
    if (stored?.kind === 'create' && stored.impact && typeof stored.impact === 'object') {
      draft = { ...draft, impact: stored.impact };
    }
  }
    if (draft.kind === 'unavailable') {
      // Stage 2 applies but cannot be drafted now. Refuse the approval and leave the obligation untouched; the
      // refusal is audited (append-only) and the same request can simply be repeated once Stage 2 is available.
      await recordWorkflowEvent(supabase, {
        organisationId: params.organisationId,
        entityType: 'regulatory_obligation',
        entityId: params.obligationId,
        eventType: 'OBLIGATION_STAGE2_APPROVAL_REFUSED',
        actorUserId: params.userId,
        fromStatus: existing.status,
        toStatus: existing.status,
        metadata: { reason: draft.reason.slice(0, 500), obligationUnchanged: true },
      }).catch(() => undefined);
      throw new RiConflictError('stage2_unavailable');
    }
    try {
      await commitObligationApprovalWithStage2(supabase, {
        organisationId: params.organisationId,
        obligationId: params.obligationId,
        expectedStatus: existing.status,
        actorUserId: params.userId,
        draft,
        fields: fieldEdits,
        expectedUpdatedAt: params.expectedUpdatedAt ?? null,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      // Caller-correctable refusals (stale, forbidden, SoD, classification guards) are returned as-is. Anything else
      // is an unexpected fault: the transaction rolled back, so the obligation is unchanged, and the fault is audited
      // (append-only, best effort) so an operator can see it and the same request can be repeated.
      if (!/^(stale_record|insufficient_role|actor_mismatch|segregation_of_duties|not_found|unauthenticated|classified_obligation_|obligation_classification_immutable)/.test(reason)) {
        await recordWorkflowEvent(supabase, {
          organisationId: params.organisationId,
          entityType: 'regulatory_obligation',
          entityId: params.obligationId,
          eventType: 'OBLIGATION_STAGE2_APPROVAL_REFUSED',
          actorUserId: params.userId,
          fromStatus: existing.status,
          toStatus: existing.status,
          metadata: { reason: reason.slice(0, 500), obligationUnchanged: true, stage: 'atomic_commit' },
        }).catch(() => undefined);
      }
      throw err;
    }
    data = await readObligationRow(supabase, params.organisationId, params.obligationId);
  } else {
    let updateQuery = supabase
      .from('regulatory_obligations')
      .update(update)
      .eq('id', params.obligationId)
      .eq('organisation_id', params.organisationId);
    if ('status' in update) updateQuery = updateQuery.eq('status', existing.status);
    const { data: updated, error } = await updateQuery.select().single();
    if (error) {
      if (error.code === 'PGRST116' && ('status' in update || params.reviewDecisionOnly)) {
        throw new Error('stale_record');
      }
      const dbCode = error.message.split(' ')[0];
      if (/^(classified_obligation_|obligation_classification_immutable)/.test(dbCode)) throw new RiConflictError(dbCode);
      throw new Error(error.message);
    }
    data = updated;
    if (update.status === 'IN_REVIEW' && existing.status !== 'IN_REVIEW') {
      try {
        const draft = await prepareStage2ImpactDraft(supabase, {
          organisationId: params.organisationId,
          obligationId: params.obligationId,
          actorUserId: params.userId,
          expectedStatus: 'IN_REVIEW',
        });
        const pin = buildStage2ApprovalPinFromDraft(draft);
        if (pin) {
          const prior =
            typeof data.metadata === 'object' && data.metadata && !Array.isArray(data.metadata)
              ? (data.metadata as Record<string, unknown>)
              : {};
          const { data: pinned, error: pinError } = await supabase
            .from('regulatory_obligations')
            .update({ metadata: { ...prior, stage2ApprovalPin: pin } })
            .eq('id', params.obligationId)
            .eq('organisation_id', params.organisationId)
            .select()
            .single();
          if (!pinError && pinned) data = pinned;
        }
      } catch {
        /* pin is required for REVIEWER approval; makers may still approve as COMPLIANCE_MANAGER */
      }
    }
    if (update.status === 'OPEN') {
      // Already OPEN: idempotent recovery. Any outcome other than a linked impact is recorded, never silent.
      try {
        const stage2 = await ensureImpactAssessmentFromApprovedObligation(supabase, {
          organisationId: params.organisationId,
          obligationId: params.obligationId,
          actorUserId: params.userId,
          role: params.role ?? null,
        });
        if (stage2.skipped) {
          await recordWorkflowEvent(supabase, {
            organisationId: params.organisationId,
            entityType: 'regulatory_obligation',
            entityId: params.obligationId,
            eventType: 'OBLIGATION_STAGE2_INITIATION_SKIPPED',
            actorUserId: params.userId,
            fromStatus: 'OPEN',
            toStatus: 'OPEN',
            metadata: { reason: stage2.reason.slice(0, 500), alreadyOpen: true },
          }).catch(() => undefined);
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        await recordWorkflowEvent(supabase, {
          organisationId: params.organisationId,
          entityType: 'regulatory_obligation',
          entityId: params.obligationId,
          eventType: 'OBLIGATION_STAGE2_INITIATION_FAILED',
          actorUserId: params.userId,
          fromStatus: 'OPEN',
          toStatus: 'OPEN',
          metadata: { reason: reason.slice(0, 500), alreadyOpen: true },
        }).catch(() => undefined);
        throw err;
      }
    }
    if ('status' in update && update.status !== existing.status) {
      await recordWorkflowEvent(supabase, {
        organisationId: params.organisationId,
        entityType: 'regulatory_obligation',
        entityId: params.obligationId,
        eventType: 'OBLIGATION_STATUS_CHANGED',
        actorUserId: params.userId,
        fromStatus: existing.status,
        toStatus: update.status as string,
      });
    }
  }
  if (
    'owner_user_id' in update &&
    data.owner_user_id &&
    data.owner_user_id !== existing.owner_user_id
  ) {
    await recordWorkflowEvent(supabase, {
      organisationId: params.organisationId,
      entityType: 'regulatory_obligation',
      entityId: params.obligationId,
      eventType: 'OBLIGATION_OWNER_ASSIGNED',
      actorUserId: params.userId,
      metadata: {
        from_owner_user_id: existing.owner_user_id,
        to_owner_user_id: data.owner_user_id,
      },
    });
  }
  return data;
}
