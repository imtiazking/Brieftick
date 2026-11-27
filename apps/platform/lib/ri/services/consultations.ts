import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

export type ConsultationTrackingRow = {
  id: string;
  organisation_id: string;
  publication_id: string;
  status: string;
  owner_user_id: string | null;
  internal_response_deadline: string | null;
  internal_decision: string | null;
  response_preparation_status: string | null;
  submission_status: string | null;
  organisational_relevance: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const CONSULTATION_TYPES = /consultation/i;

export function isConsultationPublication(publicationType: string | null | undefined): boolean {
  return CONSULTATION_TYPES.test(String(publicationType || ''));
}

export async function listConsultationTracking(
  supabase: SupabaseClient,
  organisationId: string,
): Promise<ConsultationTrackingRow[]> {
  const { data, error } = await supabase
    .from('organisation_consultation_tracking')
    .select('*')
    .eq('organisation_id', organisationId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as ConsultationTrackingRow[];
}

export async function upsertConsultationTracking(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    userId: string;
    publicationId: string;
    status?: string;
    ownerUserId?: string | null;
    internalResponseDeadline?: string | null;
    internalDecision?: string | null;
    responsePreparationStatus?: string | null;
    submissionStatus?: string | null;
    organisationalRelevance?: string | null;
    notes?: string | null;
  },
): Promise<ConsultationTrackingRow> {
  const payload = {
    organisation_id: params.organisationId,
    publication_id: params.publicationId,
    status: params.status || 'OPEN',
    owner_user_id: params.ownerUserId ?? null,
    internal_response_deadline: params.internalResponseDeadline ?? null,
    internal_decision: params.internalDecision ?? null,
    response_preparation_status: params.responsePreparationStatus ?? null,
    submission_status: params.submissionStatus ?? null,
    organisational_relevance: params.organisationalRelevance ?? null,
    notes: params.notes ?? null,
    updated_by_user_id: params.userId,
    created_by_user_id: params.userId,
  };
  const { data, error } = await supabase
    .from('organisation_consultation_tracking')
    .upsert(payload, { onConflict: 'organisation_id,publication_id' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ConsultationTrackingRow;
}

export type ConsultationLabView = {
  publicationId: string;
  title: string;
  regulator: string | null;
  consultationOpeningDate: string | null;
  consultationClosingDate: string | null;
  responseDeadline: string | null;
  publicationType: string;
  tracking: ConsultationTrackingRow | null;
  relatedChangeIds: string[];
};

export async function buildConsultationLabViews(
  supabase: SupabaseClient,
  organisationId: string,
  publications: Array<{
    id: string;
    title: string;
    publication_type: string;
    publication_date?: string | null;
    consultation_deadline?: string | null;
    regulator?: { name?: string; external_key?: string } | null;
  }>,
  trackingRows: ConsultationTrackingRow[],
  changePublicationIds: Map<string, string[]>,
): Promise<ConsultationLabView[]> {
  const byPub = new Map(trackingRows.map((t) => [t.publication_id, t]));
  return publications
    .filter((p) => isConsultationPublication(p.publication_type))
    .map((p) => ({
      publicationId: p.id,
      title: p.title,
      regulator: p.regulator?.name || p.regulator?.external_key || null,
      consultationOpeningDate: p.publication_date ?? null,
      consultationClosingDate: p.consultation_deadline ?? null,
      responseDeadline: p.consultation_deadline ?? null,
      publicationType: p.publication_type,
      tracking: byPub.get(p.id) ?? null,
      relatedChangeIds: changePublicationIds.get(p.id) ?? [],
    }));
}