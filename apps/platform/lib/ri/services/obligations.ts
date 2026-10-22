import type { SupabaseClient } from '@supabase/supabase-js';
import { assertRowInOrganisation } from '@/lib/ri/db-guard';
import { recordWorkflowEvent } from '@/lib/ri/workflow-events';
import {
  parseOptionalDate,
  parseOptionalText,
  parseObligationStatus,
  parseRequiredText,
  parseUuid,
} from '@/lib/ri/validation';

export async function listObligations(supabase: SupabaseClient, organisationId: string) {
  const { data, error } = await supabase
    .from('regulatory_obligations')
    .select(
      `
      id, external_key, obligation_statement, status, priority, due_date, effective_date,
      regulatory_change_id, publication_id,
      change:regulatory_changes(id, title)
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
    .select('publication_id')
    .eq('id', changeId)
    .single();
  if (!change) throw new Error('not_found');

  const status = params.status ? parseObligationStatus(params.status) : 'DRAFT';

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
  const { data: impacts } = await supabase
    .from('impact_assessments')
    .select('id, status, materiality')
    .eq('organisation_id', organisationId)
    .eq('regulatory_change_id', data.regulatory_change_id);

  return { obligation: { ...data, change }, impacts: impacts ?? [] };
}

export async function updateObligation(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    obligationId: string;
    userId: string;
    fields: Record<string, unknown>;
    expectedUpdatedAt?: string | null;
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
    .select('status, updated_at')
    .eq('id', params.obligationId)
    .single();
  if (!existing) throw new Error('not_found');
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
  if ('status' in params.fields) {
    const next = parseObligationStatus(params.fields.status);
    update.status = next;
    await recordWorkflowEvent(supabase, {
      organisationId: params.organisationId,
      entityType: 'regulatory_obligation',
      entityId: params.obligationId,
      eventType: 'OBLIGATION_STATUS_CHANGED',
      actorUserId: params.userId,
      fromStatus: existing.status,
      toStatus: next,
    });
  }

  const { data, error } = await supabase
    .from('regulatory_obligations')
    .update(update)
    .eq('id', params.obligationId)
    .eq('organisation_id', params.organisationId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}
