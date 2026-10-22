import type { SupabaseClient } from '@supabase/supabase-js';
import { assertRowInOrganisation } from '@/lib/ri/db-guard';
import { recordWorkflowEvent } from '@/lib/ri/workflow-events';
import {
  parseAssuranceResult,
  parseOptionalDate,
  parseOptionalText,
  parseRequiredText,
} from '@/lib/ri/validation';

export async function listAssuranceReviews(supabase: SupabaseClient, organisationId: string) {
  const { data, error } = await supabase
    .from('assurance_reviews')
    .select('id, review_type, result, review_date, reviewer_user_id')
    .eq('organisation_id', organisationId)
    .order('review_date', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createAssuranceReview(
  supabase: SupabaseClient,
  organisationId: string,
  userId: string,
  fields: Record<string, unknown>,
) {
  const result = parseAssuranceResult(fields.result);
  const { data, error } = await supabase
    .from('assurance_reviews')
    .insert({
      organisation_id: organisationId,
      review_type: parseRequiredText(fields.review_type, 'review_type', 200),
      result,
      reviewer_user_id: userId,
      review_date: parseOptionalDate(fields.review_date) ?? new Date().toISOString().slice(0, 10),
      next_review_date: parseOptionalDate(fields.next_review_date),
      notes: parseOptionalText(fields.notes, 8000),
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  await recordWorkflowEvent(supabase, {
    organisationId,
    entityType: 'assurance_review',
    entityId: data.id,
    eventType: 'ASSURANCE_COMPLETED',
    actorUserId: userId,
    toStatus: result,
  });
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
  };
}
