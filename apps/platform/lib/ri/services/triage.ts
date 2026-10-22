import type { SupabaseClient } from '@supabase/supabase-js';
import { recordWorkflowEvent } from '@/lib/ri/workflow-events';
import {
  parseEnum,
  parseOptionalText,
  RELEVANCE_STATUSES,
  TRIAGE_STATUSES,
} from '@/lib/ri/validation';

export async function upsertOrganisationTriage(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    publicationId: string;
    userId: string;
    triageStatus: string;
    relevanceStatus?: string | null;
    materiality?: string | null;
    assignedTo?: string | null;
    expectedUpdatedAt?: string | null;
  },
) {
  const triageStatus = parseEnum(params.triageStatus, TRIAGE_STATUSES, 'triage_status');
  const relevanceStatus = params.relevanceStatus
    ? parseEnum(params.relevanceStatus, RELEVANCE_STATUSES, 'relevance_status')
    : null;

  const { data: existing } = await supabase
    .from('organisation_publications')
    .select('*')
    .eq('organisation_id', params.organisationId)
    .eq('publication_id', params.publicationId)
    .maybeSingle();

  if (existing && params.expectedUpdatedAt) {
    if (new Date(existing.updated_at).getTime() !== new Date(params.expectedUpdatedAt).getTime()) {
      throw new Error('stale_record');
    }
  }

  const payload = {
    organisation_id: params.organisationId,
    publication_id: params.publicationId,
    triage_status: triageStatus,
    relevance_status: relevanceStatus,
    materiality: parseOptionalText(params.materiality, 200),
    assigned_to: parseOptionalText(params.assignedTo, 200),
    reviewed_at: new Date().toISOString(),
  };

  let row;
  if (existing) {
    const { data, error } = await supabase
      .from('organisation_publications')
      .update(payload)
      .eq('id', existing.id)
      .eq('organisation_id', params.organisationId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    row = data;
  } else {
    const { data, error } = await supabase
      .from('organisation_publications')
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    row = data;
  }

  await recordWorkflowEvent(supabase, {
    organisationId: params.organisationId,
    entityType: 'organisation_publication',
    entityId: row.id,
    eventType: 'TRIAGE_STATUS_CHANGED',
    actorUserId: params.userId,
    fromStatus: existing?.triage_status ?? null,
    toStatus: triageStatus,
  });

  return row;
}
