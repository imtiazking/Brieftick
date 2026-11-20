import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlatformRole } from '@/lib/roles';
import {
  assessAiObligationTransition,
  isAiObligationReviewDecision,
} from '@/lib/ri/ai/ai-obligation-workflow.mjs';
import { assertRowInOrganisation } from '@/lib/ri/db-guard';
import { RiConflictError } from '@/lib/ri/errors';
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
  const { metadata: rowMetadata, recordProvenance, labClass } = buildLockedChildMetadataFromParentChange({
    parentChange: change,
    actorUserId: params.userId,
  });

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
      status,
      metadata: rowMetadata,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  await recordWorkflowEvent(supabase, {
    organisationId: params.organisationId,
    entityType: 'regulatory_obligation',
    entityId: data.id,
    eventType: 'OBLIGATION_CREATED',
    actorUserId: params.userId,
    toStatus: status,
    metadata: workflowMetadataForChildRecordCreate({
      recordProvenance,
      parentChangeId: changeId,
      actorUserId: params.userId,
      labClass,
    }),
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

  return { obligation: { ...data, change }, impacts: impacts ?? [], risks, controls };
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
    .select('status, updated_at, owner_user_id, origin, created_by_user_id, ai_analysis_run_id')
    .eq('id', params.obligationId)
    .eq('organisation_id', params.organisationId)
    .single();
  if (!existing) throw new Error('not_found');
  if (
    params.reviewDecisionOnly &&
    !isAiObligationReviewDecision({
      fieldKeys: Object.keys(params.fields),
      origin: existing.origin,
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
    if (existing.origin === 'AI_ASSISTED' && next !== existing.status) {
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

  let updateQuery = supabase
    .from('regulatory_obligations')
    .update(update)
    .eq('id', params.obligationId)
    .eq('organisation_id', params.organisationId);
  if (params.reviewDecisionOnly) updateQuery = updateQuery.eq('status', existing.status);
  const { data, error } = await updateQuery.select().single();
  if (error) {
    if (params.reviewDecisionOnly && error.code === 'PGRST116') throw new Error('stale_record');
    throw new Error(error.message);
  }
  if ('status' in update) {
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
