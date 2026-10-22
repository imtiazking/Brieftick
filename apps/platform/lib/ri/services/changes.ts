import type { SupabaseClient } from '@supabase/supabase-js';
import { assertRowInOrganisation } from '@/lib/ri/db-guard';
import { RiNotFoundError } from '@/lib/ri/errors';
import { recordWorkflowEvent } from '@/lib/ri/workflow-events';
import {
  CHANGE_STATUSES,
  parseEnum,
  parseOptionalDate,
  parseOptionalText,
  parseRequiredText,
  parseUuid,
} from '@/lib/ri/validation';

export async function listChanges(supabase: SupabaseClient, organisationId: string) {
  const { data, error } = await supabase
    .from('regulatory_changes')
    .select(
      `
      id, external_key, title, status, change_type, materiality, effective_date, implementation_deadline, owner_user_id,
      publication:regulatory_publications(id, title)
    `,
    )
    .eq('organisation_id', organisationId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createRegulatoryChange(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    publicationId: string;
    userId: string;
    title: string;
    description?: string | null;
    changeType: string;
    materiality?: string | null;
    effectiveDate?: string | null;
    implementationDeadline?: string | null;
    ownerUserId?: string | null;
    status?: string;
  },
) {
  const publicationId = parseUuid(params.publicationId, 'publication_id');
  const { data: pub } = await supabase
    .from('regulatory_publications')
    .select('id')
    .eq('id', publicationId)
    .maybeSingle();
  if (!pub) throw new RiNotFoundError('publication_not_found');

  const status = params.status
    ? parseEnum(params.status, CHANGE_STATUSES, 'change_status')
    : 'DRAFT';

  const { data, error } = await supabase
    .from('regulatory_changes')
    .insert({
      organisation_id: params.organisationId,
      publication_id: publicationId,
      title: parseRequiredText(params.title, 'title', 500),
      description: parseOptionalText(params.description, 12000),
      change_type: parseRequiredText(params.changeType, 'change_type', 200),
      materiality: parseOptionalText(params.materiality, 100),
      effective_date: parseOptionalDate(params.effectiveDate),
      implementation_deadline: parseOptionalDate(params.implementationDeadline),
      owner_user_id: params.userId,
      status,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  await recordWorkflowEvent(supabase, {
    organisationId: params.organisationId,
    entityType: 'regulatory_change',
    entityId: data.id,
    eventType: 'CHANGE_CREATED',
    actorUserId: params.userId,
    toStatus: status,
  });

  return data;
}

export async function getChangeDetail(
  supabase: SupabaseClient,
  organisationId: string,
  changeId: string,
) {
  await assertRowInOrganisation(supabase, 'regulatory_changes', changeId, organisationId);
  const { data: change, error } = await supabase
    .from('regulatory_changes')
    .select(
      `
      *,
      publication:regulatory_publications(
        id, title, canonical_url, publication_date, effective_date, data_origin, source_hash
      )
    `,
    )
    .eq('id', changeId)
    .eq('organisation_id', organisationId)
    .single();
  if (error) throw new Error(error.message);

  const publication = Array.isArray(change.publication) ? change.publication[0] : change.publication;
  const publicationId = publication?.id ?? change.publication_id;

  const applicability = publicationId
    ? await supabase
        .from('applicability_assessments')
        .select('*')
        .eq('organisation_id', organisationId)
        .eq('publication_id', publicationId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const { data: impacts } = await supabase
    .from('impact_assessments')
    .select('id, status, materiality, due_date, owner_user_id')
    .eq('organisation_id', organisationId)
    .eq('regulatory_change_id', changeId);

  const { data: obligations } = await supabase
    .from('regulatory_obligations')
    .select('id, external_key, obligation_statement, status, priority, due_date')
    .eq('organisation_id', organisationId)
    .eq('regulatory_change_id', changeId);

  return {
    change: { ...change, publication },
    applicability: applicability.data,
    impacts: impacts ?? [],
    obligations: obligations ?? [],
  };
}

export async function updateChangeStatus(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    changeId: string;
    userId: string;
    status: string;
    expectedUpdatedAt?: string | null;
  },
) {
  await assertRowInOrganisation(
    supabase,
    'regulatory_changes',
    params.changeId,
    params.organisationId,
  );
  const status = parseEnum(params.status, CHANGE_STATUSES, 'change_status');
  const { data: existing } = await supabase
    .from('regulatory_changes')
    .select('status, updated_at')
    .eq('id', params.changeId)
    .single();
  if (!existing) throw new RiNotFoundError();
  if (
    params.expectedUpdatedAt &&
    new Date(existing.updated_at).getTime() !== new Date(params.expectedUpdatedAt).getTime()
  ) {
    throw new Error('stale_record');
  }
  const { data, error } = await supabase
    .from('regulatory_changes')
    .update({ status })
    .eq('id', params.changeId)
    .eq('organisation_id', params.organisationId)
    .select()
    .single();
  if (error) throw new Error(error.message);

  await recordWorkflowEvent(supabase, {
    organisationId: params.organisationId,
    entityType: 'regulatory_change',
    entityId: params.changeId,
    eventType: 'CHANGE_STATUS_CHANGED',
    actorUserId: params.userId,
    fromStatus: existing.status,
    toStatus: status,
  });
  return data;
}
