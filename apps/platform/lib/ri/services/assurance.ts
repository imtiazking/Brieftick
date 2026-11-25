import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlatformRole } from '@/lib/roles';
import { assertRowInOrganisation } from '@/lib/ri/db-guard';
import { LAB_PROVENANCE_LOCKED_KEY } from '@/lib/ri/lab-api/change-create-provenance';
import { parseChangeCreateMode } from '@/lib/ri/lab-api/change-create-provenance';
import {
  assuranceLabProvenanceInputFromRow,
  classifyAssuranceForLab,
  resolveAssuranceCreateMetadata,
} from '@/lib/ri/lab-api/risk-control-lab-provenance';
import { RiConflictError } from '@/lib/ri/errors';
import {
  assertGovernanceActionAllowed,
  requiredStatusForGovernanceAction,
} from '@/lib/ri/governance-draft-workflow-guards.mjs';
import {
  ASSURANCE_WF,
  assertCanCloseComplianceLifecycle,
  assuranceWorkflowStatus as assuranceWfFromMeta,
  evaluateAssuranceLifecycleClosure,
} from '@/lib/ri/assurance-closure-guards.mjs';
import { linkFindingAssuranceReview } from '@/lib/ri/links';
import { canRi } from '@/lib/ri/permissions';
import { assertImpactApproverSoD } from '@/lib/ri/separation-of-duties';
import {
  bindEvidenceForAssuranceTest,
  mergeEvidenceBindings,
  validateAssuranceEvidenceIntegrity,
} from '@/lib/ri/services/assurance-evidence-binding';
import { createFinding } from '@/lib/ri/services/findings';
import { createRiAction, updateRiAction } from '@/lib/ri/services/ri-actions';
import { recordWorkflowEvent } from '@/lib/ri/workflow-events';
import {
  parseAssuranceResult,
  parseOptionalDate,
  parseOptionalText,
  parseRequiredText,
  parseUuid,
} from '@/lib/ri/validation';

const LOCKED_METADATA_KEYS = new Set([
  'recordProvenance',
  'record_provenance',
  LAB_PROVENANCE_LOCKED_KEY,
  'labCreationMode',
  'labProvenanceRecordedAt',
  'labProvenanceRecordedByUserId',
  'parentControlId',
  'metadata',
]);

export async function listAssuranceReviews(supabase: SupabaseClient, organisationId: string) {
  const { data, error } = await supabase
    .from('assurance_reviews')
    .select('id, review_type, result, review_date, reviewer_user_id, notes, metadata, updated_at')
    .eq('organisation_id', organisationId)
    .order('review_date', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createAssuranceReview(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    userId: string;
    role: PlatformRole;
    fields: Record<string, unknown>;
    defaultCreationMode?: 'operational' | 'uat_authorised';
  },
) {
  const raw = { ...params.fields };
  if ('metadata' in raw || 'recordProvenance' in raw) {
    throw new Error('client_provenance_rejected');
  }
  const controlIdRaw = raw.controlId ?? raw.control_id;
  const controlId =
    controlIdRaw === null || controlIdRaw === undefined || controlIdRaw === ''
      ? null
      : parseUuid(controlIdRaw, 'control_id');
  const creationMode = parseChangeCreateMode(raw.creationMode, {
    defaultMode: params.defaultCreationMode ?? 'operational',
  });
  const { metadata } = await resolveAssuranceCreateMetadata({
    supabase,
    organisationId: params.organisationId,
    actorUserId: params.userId,
    role: params.role,
    creationMode,
    controlId,
  });
  for (const k of Object.keys(raw)) {
    if (LOCKED_METADATA_KEYS.has(k)) throw new Error('provenance_locked');
  }
  const result = parseAssuranceResult(raw.result);
  const { data, error } = await supabase
    .from('assurance_reviews')
    .insert({
      organisation_id: params.organisationId,
      review_type: parseRequiredText(raw.review_type, 'review_type', 200),
      result,
      reviewer_user_id: params.userId,
      review_date: parseOptionalDate(raw.review_date) ?? new Date().toISOString().slice(0, 10),
      next_review_date: parseOptionalDate(raw.next_review_date),
      notes: parseOptionalText(raw.notes, 8000),
      metadata,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  await recordWorkflowEvent(supabase, {
    organisationId: params.organisationId,
    entityType: 'assurance_review',
    entityId: data.id,
    eventType: 'ASSURANCE_REVIEW_CREATED',
    actorUserId: params.userId,
    toStatus: result,
    metadata: controlId ? { control_id: controlId } : {},
  });
  if (controlId) {
    await linkAssuranceControl(supabase, params.organisationId, data.id, controlId, params.userId);
  }
  return data;
}

export async function updateAssuranceReview(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    assuranceId: string;
    userId: string;
    fields: Record<string, unknown>;
    expectedUpdatedAt?: string | null;
  },
) {
  await assertRowInOrganisation(supabase, 'assurance_reviews', params.assuranceId, params.organisationId);
  const { data: existing, error: loadErr } = await supabase
    .from('assurance_reviews')
    .select('result, notes, updated_at')
    .eq('id', params.assuranceId)
    .eq('organisation_id', params.organisationId)
    .single();
  if (loadErr || !existing) throw new Error('not_found');
  if (
    params.expectedUpdatedAt &&
    new Date(existing.updated_at).getTime() !== new Date(params.expectedUpdatedAt).getTime()
  ) {
    throw new Error('stale_record');
  }
  const update: Record<string, unknown> = {};
  if ('result' in params.fields) {
    update.result = parseAssuranceResult(params.fields.result);
  }
  if ('notes' in params.fields) {
    update.notes = parseOptionalText(params.fields.notes, 8000);
  }
  if (!Object.keys(update).length) throw new Error('missing_patch_fields');
  const { data, error } = await supabase
    .from('assurance_reviews')
    .update(update)
    .eq('id', params.assuranceId)
    .eq('organisation_id', params.organisationId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  if ('result' in update && String(update.result) !== String(existing.result)) {
    await recordWorkflowEvent(supabase, {
      organisationId: params.organisationId,
      entityType: 'assurance_review',
      entityId: params.assuranceId,
      eventType: 'ASSURANCE_RESULT_CHANGED',
      actorUserId: params.userId,
      fromStatus: String(existing.result),
      toStatus: String(update.result),
    });
  }
  return data;
}

export async function getAssuranceDetail(
  supabase: SupabaseClient,
  organisationId: string,
  assuranceId: string,
) {
  await assertRowInOrganisation(supabase, 'assurance_reviews', assuranceId, organisationId);
  const { data, error } = await supabase
    .from('assurance_reviews')
    .select('*')
    .eq('id', assuranceId)
    .eq('organisation_id', organisationId)
    .single();
  if (error) throw new Error(error.message);
  const [controls, obligations, findings] = await Promise.all([
    supabase
      .from('assurance_review_control_links')
      .select('control:controls(id, name, effectiveness)')
      .eq('organisation_id', organisationId)
      .eq('assurance_review_id', assuranceId),
    supabase
      .from('assurance_review_obligation_links')
      .select('obligation:regulatory_obligations(id, obligation_statement)')
      .eq('organisation_id', organisationId)
      .eq('assurance_review_id', assuranceId),
    supabase
      .from('finding_assurance_review_links')
      .select('finding:findings(id, title, severity)')
      .eq('organisation_id', organisationId)
      .eq('assurance_review_id', assuranceId),
  ]);
  return {
    review: data,
    controls: (controls.data ?? []).map((r) => (Array.isArray(r.control) ? r.control[0] : r.control)),
    obligations: (obligations.data ?? []).map((r) =>
      Array.isArray(r.obligation) ? r.obligation[0] : r.obligation,
    ),
    findings: (findings.data ?? []).map((r) => (Array.isArray(r.finding) ? r.finding[0] : r.finding)),
    labClass: classifyAssuranceForLab(assuranceLabProvenanceInputFromRow(data)),
  };
}

function assuranceWorkflowStatus(metadata: Record<string, unknown> | null | undefined): string {
  return assuranceWfFromMeta(metadata);
}

function parseEvidenceIdList(fields: Record<string, unknown>): string[] {
  const raw = fields.evidenceIds;
  if (!Array.isArray(raw) || raw.length < 1) return [];
  return raw.map((id) => String(id));
}

async function linkedControlIdForAssurance(
  supabase: SupabaseClient,
  organisationId: string,
  assuranceId: string,
  meta: Record<string, unknown>,
): Promise<string | null> {
  const fromMeta = meta.sourceApprovedControlId;
  if (typeof fromMeta === 'string' && fromMeta) return fromMeta;
  const { data } = await supabase
    .from('assurance_review_control_links')
    .select('control_id')
    .eq('organisation_id', organisationId)
    .eq('assurance_review_id', assuranceId)
    .limit(1)
    .maybeSingle();
  return typeof data?.control_id === 'string' ? data.control_id : null;
}

async function countOpenFindingsForAssurance(
  supabase: SupabaseClient,
  organisationId: string,
  assuranceId: string,
  meta: Record<string, unknown>,
): Promise<number> {
  const acceptedDetail = Array.isArray(meta.acceptedFindingExceptionsDetail)
    ? meta.acceptedFindingExceptionsDetail
    : [];
  const accepted = new Set(
    acceptedDetail
      .filter((d) => d && d.authority === 'assurance:approve')
      .map((d) => String(d.findingId)),
  );
  for (const id of Array.isArray(meta.acceptedFindingExceptions) ? meta.acceptedFindingExceptions : []) {
    if (acceptedDetail.some((d) => String(d?.findingId) === String(id) && d?.authority === 'assurance:approve')) {
      accepted.add(String(id));
    }
  }
  const { data: links } = await supabase
    .from('finding_assurance_review_links')
    .select('finding_id')
    .eq('organisation_id', organisationId)
    .eq('assurance_review_id', assuranceId);
  const ids = (links ?? []).map((r) => r.finding_id).filter(Boolean);
  if (!ids.length) return 0;
  let open = 0;
  for (const findingId of ids) {
    if (accepted.has(String(findingId))) continue;
    const { data: finding } = await supabase
      .from('findings')
      .select('id, status')
      .eq('organisation_id', organisationId)
      .eq('id', findingId)
      .maybeSingle();
    if (!finding) continue;
    const st = String(finding.status || '');
    if (st !== 'CLOSED' && st !== 'Closed') open += 1;
  }
  return open;
}

async function countIncompleteRemediation(
  supabase: SupabaseClient,
  organisationId: string,
  meta: Record<string, unknown>,
): Promise<number> {
  const actionId = meta.remediationActionId;
  if (typeof actionId !== 'string' || !actionId) return 0;
  const { data: action } = await supabase
    .from('actions')
    .select('status')
    .eq('organisation_id', organisationId)
    .eq('id', actionId)
    .maybeSingle();
  if (!action) return 1;
  const st = String(action.status || '');
  if (st === 'COMPLETE' || st === 'CLOSED') return 0;
  return 1;
}

export async function updateAssuranceWithGovernance(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    assuranceId: string;
    userId: string;
    role: PlatformRole;
    fields: Record<string, unknown>;
    expectedUpdatedAt?: string | null;
  },
) {
  await assertRowInOrganisation(supabase, 'assurance_reviews', params.assuranceId, params.organisationId);
  const { data: existing, error: loadErr } = await supabase
    .from('assurance_reviews')
    .select('result, notes, updated_at, reviewer_user_id, metadata')
    .eq('id', params.assuranceId)
    .eq('organisation_id', params.organisationId)
    .single();
  if (loadErr || !existing) throw new Error('not_found');

  const wfStatus = assuranceWorkflowStatus(existing.metadata as Record<string, unknown>);
  if (
    params.expectedUpdatedAt &&
    new Date(existing.updated_at).getTime() !== new Date(params.expectedUpdatedAt).getTime()
  ) {
    throw new Error('stale_record');
  }

  if (!params.fields.action) {
    return updateAssuranceReview(supabase, {
      organisationId: params.organisationId,
      assuranceId: params.assuranceId,
      userId: params.userId,
      fields: params.fields,
      expectedUpdatedAt: params.expectedUpdatedAt,
    });
  }

  const meta = { ...(existing.metadata as Record<string, unknown>) };
  const update: Record<string, unknown> = { metadata: meta };
  const action = String(params.fields.action);
  let pendingEvents: Array<{
    eventType: import('@/lib/ri/workflow-events').WorkflowEventType;
    fromStatus: string;
    toStatus: string;
    extra?: Record<string, unknown>;
  }> = [];
  let closeLifecycle = false;
  let requiredMetaStatus: string | null = null;

  if (action === 'submit') {
    if (!canRi(params.role, 'assurance:submit')) throw new Error('insufficient_role');
    try {
      assertGovernanceActionAllowed('submit', wfStatus);
    } catch {
      throw new RiConflictError('assurance_invalid_transition');
    }
    requiredMetaStatus = requiredStatusForGovernanceAction('submit', wfStatus);
    meta.assuranceStatus = ASSURANCE_WF.IN_REVIEW;
    pendingEvents.push({
      eventType: 'ASSURANCE_PLAN_SUBMITTED',
      fromStatus: wfStatus,
      toStatus: ASSURANCE_WF.IN_REVIEW,
    });
  } else if (action === 'approve') {
    if (!canRi(params.role, 'assurance:approve')) throw new Error('insufficient_role');
    try {
      assertGovernanceActionAllowed('approve', wfStatus);
    } catch {
      throw new RiConflictError('assurance_invalid_transition');
    }
    assertImpactApproverSoD({
      ownerUserId: existing.reviewer_user_id,
      approverUserId: params.userId,
    });
    requiredMetaStatus = requiredStatusForGovernanceAction('approve', wfStatus);
    if ('result' in params.fields && params.fields.result && params.fields.result !== 'NOT_TESTED') {
      assertCanCloseComplianceLifecycle(wfStatus);
    }
    meta.assuranceStatus = ASSURANCE_WF.TESTING_READY;
    meta.assurancePlanApprovedAt = new Date().toISOString();
    meta.assurancePlanApprovedByUserId = params.userId;
    pendingEvents.push({
      eventType: 'ASSURANCE_PLAN_APPROVED',
      fromStatus: wfStatus,
      toStatus: ASSURANCE_WF.TESTING_READY,
    });
  } else if (action === 'record_test') {
    if (!canRi(params.role, 'assurance:submit')) throw new Error('insufficient_role');
    const retest = params.fields.retest === true;
    const allowedFrom = retest ? ASSURANCE_WF.RETEST_REQUIRED : ASSURANCE_WF.TESTING_READY;
    if (wfStatus !== allowedFrom) throw new RiConflictError('assurance_invalid_transition');
    const testResult = params.fields.result ? parseAssuranceResult(params.fields.result) : null;
    if (!testResult || testResult === 'NOT_TESTED') {
      throw new RiConflictError('assurance_test_requires_result');
    }
    const evidenceIds = parseEvidenceIdList(params.fields);
    if (!evidenceIds.length) throw new RiConflictError('assurance_test_requires_evidence');
    const controlId = await linkedControlIdForAssurance(
      supabase,
      params.organisationId,
      params.assuranceId,
      meta,
    );
    if (!controlId) throw new RiConflictError('assurance_control_link_required');
    let bindingsList = Array.isArray(meta.assuranceEvidenceBindings)
      ? (meta.assuranceEvidenceBindings as import('@/lib/ri/services/assurance-evidence-binding').AssuranceEvidenceBinding[])
      : [];
    for (const evidenceId of evidenceIds) {
      const binding = await bindEvidenceForAssuranceTest(supabase, {
        organisationId: params.organisationId,
        userId: params.userId,
        assuranceId: params.assuranceId,
        controlId,
        evidenceId,
        retest,
      });
      bindingsList = mergeEvidenceBindings({ assuranceEvidenceBindings: bindingsList }, binding);
    }
    meta.assuranceEvidenceBindings = bindingsList;
    const priorEvidence = Array.isArray(meta.assuranceEvidenceIds) ? meta.assuranceEvidenceIds : [];
    meta.assuranceEvidenceIds = [...new Set([...priorEvidence.map(String), ...evidenceIds])];
    const evidenceGaps = await validateAssuranceEvidenceIntegrity(supabase, {
      organisationId: params.organisationId,
      assuranceId: params.assuranceId,
      controlId,
      metadata: meta,
    });
    if (evidenceGaps.length) {
      throw new RiConflictError(`assurance_evidence_binding_incomplete:${evidenceGaps.join(',')}`);
    }
    meta.controlTestCompleted = true;
    meta.evidenceReviewed = true;
    meta.lastTestControlId = controlId;
    if (params.fields.effectiveness) {
      meta.effectivenessAssessment = String(params.fields.effectiveness);
    }
    update.result = testResult;
    if (testResult === 'FAIL') {
      const finding = await createFinding(supabase, {
        organisationId: params.organisationId,
        userId: params.userId,
        role: params.role,
        fields: {
          title: 'Control test failure — lifecycle assurance',
          description: parseOptionalText(params.fields.notes, 8000) ?? 'Recorded failed control test.',
          severity: 'HIGH',
        },
      });
      await linkFindingAssuranceReview(
        supabase,
        params.organisationId,
        finding.id,
        params.assuranceId,
        params.userId,
      );
      const remediation = await createRiAction(supabase, {
        organisationId: params.organisationId,
        userId: params.userId,
        title: 'Remediate failed control test',
        sourceType: 'assurance_remediation',
        description: `Remediation for assurance review ${params.assuranceId}`,
        priority: 'HIGH',
        dueDate: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
        metadata: {
          assuranceReviewId: params.assuranceId,
          recordProvenance: meta.recordProvenance ?? meta.record_provenance ?? 'unverified',
          labProvenanceLocked: true,
          labCreationMode: meta.labCreationMode,
          sourceRegulatoryObligationId: meta.sourceRegulatoryObligationId ?? null,
        },
      });
      meta.remediationActionId = remediation.id;
      meta.requiresRetest = true;
      meta.assuranceStatus = ASSURANCE_WF.REMEDIATION_REQUIRED;
      pendingEvents.push({
        eventType: 'ASSURANCE_TEST_RECORDED',
        fromStatus: wfStatus,
        toStatus: ASSURANCE_WF.REMEDIATION_REQUIRED,
        extra: { result: testResult, findingId: finding.id, remediationActionId: remediation.id },
      });
      pendingEvents.push({
        eventType: 'ASSURANCE_REMEDIATION_REQUIRED',
        fromStatus: ASSURANCE_WF.REMEDIATION_REQUIRED,
        toStatus: ASSURANCE_WF.REMEDIATION_REQUIRED,
      });
    } else {
      if (retest) meta.retestCompleted = true;
      meta.assuranceStatus = ASSURANCE_WF.READY_FOR_CLOSURE;
      pendingEvents.push({
        eventType: retest ? 'ASSURANCE_RETEST_RECORDED' : 'ASSURANCE_TEST_RECORDED',
        fromStatus: wfStatus,
        toStatus: ASSURANCE_WF.READY_FOR_CLOSURE,
        extra: { result: testResult, retest },
      });
    }
  } else if (action === 'complete_remediation') {
    if (!canRi(params.role, 'assurance:submit')) throw new Error('insufficient_role');
    if (wfStatus !== ASSURANCE_WF.REMEDIATION_REQUIRED) throw new RiConflictError('assurance_invalid_transition');
    const actionId =
      (typeof params.fields.remediationActionId === 'string' && params.fields.remediationActionId) ||
      (typeof meta.remediationActionId === 'string' ? meta.remediationActionId : null);
    if (!actionId) throw new RiConflictError('remediation_action_missing');
    await updateRiAction(supabase, {
      organisationId: params.organisationId,
      actionId,
      userId: params.userId,
      fields: { status: 'COMPLETE' },
    });
    meta.remediationCompletedAt = new Date().toISOString();
    meta.assuranceStatus = ASSURANCE_WF.RETEST_REQUIRED;
    pendingEvents.push({
      eventType: 'ASSURANCE_REMEDIATION_COMPLETED',
      fromStatus: wfStatus,
      toStatus: ASSURANCE_WF.RETEST_REQUIRED,
      extra: { remediationActionId: actionId },
    });
  } else if (action === 'accept_exception') {
    if (!canRi(params.role, 'assurance:approve')) throw new Error('insufficient_role');
    const findingId = params.fields.findingId;
    if (typeof findingId !== 'string') throw new RiConflictError('finding_id_required');
    const { data: fLink } = await supabase
      .from('finding_assurance_review_links')
      .select('finding_id')
      .eq('organisation_id', params.organisationId)
      .eq('assurance_review_id', params.assuranceId)
      .eq('finding_id', findingId)
      .maybeSingle();
    if (!fLink?.finding_id) throw new RiConflictError('finding_not_linked_to_assurance');
    const accepted = Array.isArray(meta.acceptedFindingExceptions) ? [...meta.acceptedFindingExceptions] : [];
    if (!accepted.includes(findingId)) accepted.push(findingId);
    meta.acceptedFindingExceptions = accepted;
    const detail = Array.isArray(meta.acceptedFindingExceptionsDetail)
      ? [...meta.acceptedFindingExceptionsDetail]
      : [];
    detail.push({
      findingId,
      acceptedByUserId: params.userId,
      acceptedAt: new Date().toISOString(),
      authority: 'assurance:approve',
    });
    meta.acceptedFindingExceptionsDetail = detail;
    pendingEvents.push({
      eventType: 'ASSURANCE_EXCEPTION_ACCEPTED',
      fromStatus: wfStatus,
      toStatus: wfStatus,
      extra: { findingId },
    });
  } else if (action === 'close_lifecycle') {
    if (!canRi(params.role, 'assurance:approve')) throw new Error('insufficient_role');
    assertImpactApproverSoD({
      ownerUserId: existing.reviewer_user_id,
      approverUserId: params.userId,
    });
    if (wfStatus === ASSURANCE_WF.CLOSED) {
      return existing;
    }
    if (wfStatus !== ASSURANCE_WF.READY_FOR_CLOSURE) {
      throw new RiConflictError('premature_compliance_lifecycle_closure');
    }
    const nextResult = params.fields.result ? parseAssuranceResult(params.fields.result) : 'PASS';
    if (nextResult !== 'PASS') throw new RiConflictError('assurance_close_requires_pass');
    const controlId = await linkedControlIdForAssurance(
      supabase,
      params.organisationId,
      params.assuranceId,
      meta,
    );
    const evidenceIntegrityGaps = await validateAssuranceEvidenceIntegrity(supabase, {
      organisationId: params.organisationId,
      assuranceId: params.assuranceId,
      controlId,
      metadata: meta,
    });
    const openFindings = await countOpenFindingsForAssurance(
      supabase,
      params.organisationId,
      params.assuranceId,
      meta,
    );
    const incompleteRemediation = await countIncompleteRemediation(supabase, params.organisationId, meta);
    const closure = evaluateAssuranceLifecycleClosure({
      result: nextResult,
      metadata: { ...meta, independentAssuranceDecisionAt: new Date().toISOString() },
      openFindingsCount: openFindings,
      incompleteRemediationCount: incompleteRemediation,
      evidenceIntegrityGaps,
    });
    if (!closure.ok) {
      throw new RiConflictError(`assurance_closure_blocked:${closure.gaps.join(',')}`);
    }
    update.result = nextResult;
    meta.independentAssuranceDecisionAt = new Date().toISOString();
    meta.independentAssuranceDecisionByUserId = params.userId;
    meta.assuranceStatus = ASSURANCE_WF.CLOSED;
    pendingEvents.push({
      eventType: 'ASSURANCE_CLOSED',
      fromStatus: wfStatus,
      toStatus: ASSURANCE_WF.CLOSED,
    });
    closeLifecycle = true;
  } else if (action === 'reopen_lifecycle') {
    if (!canRi(params.role, 'assurance:approve')) throw new Error('insufficient_role');
    if (wfStatus !== ASSURANCE_WF.CLOSED && wfStatus !== ASSURANCE_WF.READY_FOR_CLOSURE) {
      throw new RiConflictError('assurance_invalid_transition');
    }
    meta.assuranceStatus = ASSURANCE_WF.TESTING_READY;
    meta.lifecycleReopenedAt = new Date().toISOString();
    meta.independentAssuranceDecisionAt = null;
    pendingEvents.push({
      eventType: 'COMPLIANCE_LIFECYCLE_REOPENED',
      fromStatus: wfStatus,
      toStatus: ASSURANCE_WF.TESTING_READY,
    });
  } else {
    throw new Error('invalid_action');
  }

  if (requiredMetaStatus && wfStatus !== requiredMetaStatus) {
    throw new RiConflictError('assurance_invalid_transition');
  }

  const { data, error } = await supabase
    .from('assurance_reviews')
    .update(update)
    .eq('id', params.assuranceId)
    .eq('organisation_id', params.organisationId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new RiConflictError('assurance_invalid_transition');

  for (const pendingEvent of pendingEvents) {
    await recordWorkflowEvent(supabase, {
      organisationId: params.organisationId,
      entityType: 'assurance_review',
      entityId: params.assuranceId,
      eventType: pendingEvent.eventType,
      actorUserId: params.userId,
      fromStatus: pendingEvent.fromStatus,
      toStatus: pendingEvent.toStatus,
      metadata: pendingEvent.extra,
    });
  }

  if (closeLifecycle) {
    const obligationId = meta.sourceRegulatoryObligationId;
    if (typeof obligationId === 'string') {
      const { data: priorClose } = await supabase
        .from('workflow_events')
        .select('id')
        .eq('organisation_id', params.organisationId)
        .eq('entity_type', 'regulatory_obligation')
        .eq('entity_id', obligationId)
        .eq('event_type', 'COMPLIANCE_LIFECYCLE_CLOSED')
        .limit(1);
      if (!priorClose?.length) {
        await recordWorkflowEvent(supabase, {
          organisationId: params.organisationId,
          entityType: 'regulatory_obligation',
          entityId: obligationId,
          eventType: 'COMPLIANCE_LIFECYCLE_CLOSED',
          actorUserId: params.userId,
          toStatus: 'CLOSED',
          metadata: {
            assuranceReviewId: params.assuranceId,
            assuranceResult: update.result,
            contractVersion: '2026-11-26',
            idempotencyKey: `lifecycle_close:${params.assuranceId}`,
          },
        });
      }
    }
  }
  return data;
}
