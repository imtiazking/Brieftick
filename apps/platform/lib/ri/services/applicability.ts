import type { SupabaseClient } from '@supabase/supabase-js';
import { assertRowInOrganisation } from '@/lib/ri/db-guard';
import { recordWorkflowEvent } from '@/lib/ri/workflow-events';
import {
  parseApplicabilityRecommendation,
  parseOptionalText,
  parseStringList,
  parseEnum,
} from '@/lib/ri/validation';

const APP_STATUSES = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'SUPERSEDED'] as const;

export async function saveApplicabilityAssessment(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    publicationId: string;
    userId: string;
    assessmentId?: string | null;
    recommendation: string;
    rationale?: string | null;
    affectedBusinessAreas?: unknown;
    affectedProducts?: unknown;
    affectedJurisdictions?: unknown;
    affectedRegulatedActivities?: unknown;
    overrideReason?: string | null;
    status?: string;
    expectedUpdatedAt?: string | null;
  },
) {
  const recommendation = parseApplicabilityRecommendation(params.recommendation);
  const status = params.status
    ? parseEnum(params.status, APP_STATUSES, 'applicability_status')
    : 'DRAFT';

  const body = {
    organisation_id: params.organisationId,
    publication_id: params.publicationId,
    recommendation,
    rationale: parseOptionalText(params.rationale, 12000),
    affected_business_areas: parseStringList(params.affectedBusinessAreas),
    affected_products: parseStringList(params.affectedProducts),
    affected_jurisdictions: parseStringList(params.affectedJurisdictions),
    affected_regulated_activities: parseStringList(params.affectedRegulatedActivities),
    override_reason: parseOptionalText(params.overrideReason, 4000),
    status,
    reviewed_by: status === 'APPROVED' ? params.userId : null,
    reviewed_at: status === 'APPROVED' ? new Date().toISOString() : null,
  };

  let row;
  if (params.assessmentId) {
    await assertRowInOrganisation(
      supabase,
      'applicability_assessments',
      params.assessmentId,
      params.organisationId,
    );
    const { data: existing } = await supabase
      .from('applicability_assessments')
      .select('updated_at, recommendation')
      .eq('id', params.assessmentId)
      .single();
    if (
      params.expectedUpdatedAt &&
      existing &&
      new Date(existing.updated_at).getTime() !== new Date(params.expectedUpdatedAt).getTime()
    ) {
      throw new Error('stale_record');
    }
    const { data, error } = await supabase
      .from('applicability_assessments')
      .update(body)
      .eq('id', params.assessmentId)
      .eq('organisation_id', params.organisationId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    row = data;
    if (existing && existing.recommendation !== recommendation) {
      await recordWorkflowEvent(supabase, {
        organisationId: params.organisationId,
        entityType: 'applicability_assessment',
        entityId: row.id,
        eventType: 'APPLICABILITY_DECIDED',
        actorUserId: params.userId,
        fromStatus: existing.recommendation,
        toStatus: recommendation,
      });
    }
  } else {
    const { data, error } = await supabase.from('applicability_assessments').insert(body).select().single();
    if (error) throw new Error(error.message);
    row = data;
    await recordWorkflowEvent(supabase, {
      organisationId: params.organisationId,
      entityType: 'applicability_assessment',
      entityId: row.id,
      eventType: 'APPLICABILITY_DECIDED',
      actorUserId: params.userId,
      fromStatus: 'UNASSESSED',
      toStatus: recommendation,
    });
  }

  return row;
}

export async function getApplicabilityForPublication(
  supabase: SupabaseClient,
  organisationId: string,
  publicationId: string,
) {
  const { data, error } = await supabase
    .from('applicability_assessments')
    .select('*')
    .eq('organisation_id', organisationId)
    .eq('publication_id', publicationId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
