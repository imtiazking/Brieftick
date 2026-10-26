'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { rejectClientOrganisationId } from '@/lib/ri/db-guard';
import { requireRiContext } from '@/lib/ri/context';
import { saveApplicabilityAssessment } from '@/lib/ri/services/applicability';
import { createRegulatoryChange, updateChangeStatus } from '@/lib/ri/services/changes';
import { createImpactAssessment, updateImpactAssessment } from '@/lib/ri/services/impact';
import { createObligation, updateObligation } from '@/lib/ri/services/obligations';
import { upsertOrganisationTriage } from '@/lib/ri/services/triage';

function revalidateRi() {
  revalidatePath('/ri', 'layout');
}

export async function updateTriageAction(formData: FormData) {
  const ctx = await requireRiContext('triage:write');
  rejectClientOrganisationId(formData.get('organisation_id') as string, ctx.organisationId);
  const publicationId = String(formData.get('publication_id') ?? '');
  await upsertOrganisationTriage(ctx.supabase, {
    organisationId: ctx.organisationId,
    publicationId,
    userId: ctx.userId,
    triageStatus: String(formData.get('triage_status') ?? 'NEW'),
    relevanceStatus: (formData.get('relevance_status') as string) || null,
    materiality: (formData.get('materiality') as string) || null,
    assignedTo: (formData.get('assigned_to') as string) || null,
    expectedUpdatedAt: (formData.get('updated_at') as string) || null,
  });
  revalidateRi();
}

export async function saveApplicabilityAction(formData: FormData) {
  const ctx = await requireRiContext('applicability:write');
  rejectClientOrganisationId(formData.get('organisation_id') as string, ctx.organisationId);
  await saveApplicabilityAssessment(ctx.supabase, {
    organisationId: ctx.organisationId,
    publicationId: String(formData.get('publication_id') ?? ''),
    userId: ctx.userId,
    assessmentId: (formData.get('assessment_id') as string) || null,
    recommendation: String(formData.get('recommendation') ?? 'UNASSESSED'),
    rationale: (formData.get('rationale') as string) || null,
    affectedBusinessAreas: formData.get('affected_business_areas'),
    affectedProducts: formData.get('affected_products'),
    affectedJurisdictions: formData.get('affected_jurisdictions'),
    affectedRegulatedActivities: formData.get('affected_regulated_activities'),
    overrideReason: (formData.get('override_reason') as string) || null,
    status: (formData.get('status') as string) || 'DRAFT',
    expectedUpdatedAt: (formData.get('updated_at') as string) || null,
  });
  revalidateRi();
}

export async function createChangeAction(formData: FormData) {
  const ctx = await requireRiContext('change:write');
  rejectClientOrganisationId(formData.get('organisation_id') as string, ctx.organisationId);
  const row = await createRegulatoryChange(ctx.supabase, {
    organisationId: ctx.organisationId,
    publicationId: String(formData.get('publication_id') ?? ''),
    userId: ctx.userId,
    title: String(formData.get('title') ?? ''),
    description: (formData.get('description') as string) || null,
    changeType: String(formData.get('change_type') ?? 'REGULATORY'),
    materiality: (formData.get('materiality') as string) || null,
    effectiveDate: (formData.get('effective_date') as string) || null,
    implementationDeadline: (formData.get('implementation_deadline') as string) || null,
  });
  revalidateRi();
  redirect(`/ri/changes/${row.id}`);
}

export async function updateChangeStatusAction(formData: FormData) {
  const ctx = await requireRiContext('change:write');
  rejectClientOrganisationId(formData.get('organisation_id') as string, ctx.organisationId);
  await updateChangeStatus(ctx.supabase, {
    organisationId: ctx.organisationId,
    changeId: String(formData.get('change_id') ?? ''),
    userId: ctx.userId,
    status: String(formData.get('status') ?? ''),
    expectedUpdatedAt: (formData.get('updated_at') as string) || null,
  });
  revalidateRi();
}

export async function createImpactAction(formData: FormData) {
  const ctx = await requireRiContext('impact:write');
  rejectClientOrganisationId(formData.get('organisation_id') as string, ctx.organisationId);
  const row = await createImpactAssessment(ctx.supabase, {
    organisationId: ctx.organisationId,
    regulatoryChangeId: String(formData.get('regulatory_change_id') ?? ''),
    userId: ctx.userId,
    role: ctx.role,
  });
  revalidateRi();
  redirect(`/ri/impact-assessments/${row.id}`);
}

export async function updateImpactAction(formData: FormData) {
  const ctx = await requireRiContext('impact:write');
  rejectClientOrganisationId(formData.get('organisation_id') as string, ctx.organisationId);
  const impactId = String(formData.get('impact_id') ?? '');
  if (!impactId) throw new Error('missing_impact_id');
  const fields: Record<string, unknown> = {};
  for (const key of [
    'business_impact',
    'operational_impact',
    'technology_impact',
    'compliance_impact',
    'financial_impact',
    'implementation_complexity',
    'materiality',
    'due_date',
    'business_areas',
    'action',
  ]) {
    const v = formData.get(key);
    if (v !== null && v !== undefined && v !== '') fields[key] = v;
  }
  const workflowAction = typeof fields.action === 'string' ? fields.action : null;
  await updateImpactAssessment(ctx.supabase, {
    organisationId: ctx.organisationId,
    impactId,
    userId: ctx.userId,
    role: ctx.role,
    fields,
    expectedUpdatedAt: (formData.get('updated_at') as string) || null,
  });
  revalidatePath(`/ri/impact-assessments/${impactId}`);
  revalidateRi();
  if (workflowAction === 'submit') {
    redirect(`/ri/impact-assessments/${impactId}?notice=submitted`);
  }
  if (workflowAction === 'approve') {
    redirect(`/ri/impact-assessments/${impactId}?notice=approved`);
  }
  if (workflowAction === 'reject') {
    redirect(`/ri/impact-assessments/${impactId}?notice=rejected`);
  }
  redirect(`/ri/impact-assessments/${impactId}?saved=1`);
}

export async function createObligationAction(formData: FormData) {
  const ctx = await requireRiContext('obligation:write');
  rejectClientOrganisationId(formData.get('organisation_id') as string, ctx.organisationId);
  const row = await createObligation(ctx.supabase, {
    organisationId: ctx.organisationId,
    regulatoryChangeId: String(formData.get('regulatory_change_id') ?? ''),
    userId: ctx.userId,
    obligationStatement: String(formData.get('obligation_statement') ?? ''),
    citation: (formData.get('citation') as string) || null,
    sourceSection: (formData.get('source_section') as string) || null,
    priority: (formData.get('priority') as string) || null,
    effectiveDate: (formData.get('effective_date') as string) || null,
    dueDate: (formData.get('due_date') as string) || null,
    status: (formData.get('status') as string) || 'DRAFT',
  });
  revalidateRi();
  redirect(`/ri/obligations/${row.id}`);
}

export async function updateObligationAction(formData: FormData) {
  const ctx = await requireRiContext('obligation:write');
  rejectClientOrganisationId(formData.get('organisation_id') as string, ctx.organisationId);
  const fields: Record<string, unknown> = {};
  for (const key of [
    'obligation_statement',
    'citation',
    'source_section',
    'priority',
    'effective_date',
    'due_date',
    'status',
  ]) {
    const v = formData.get(key);
    if (v !== null && v !== undefined && v !== '') fields[key] = v;
  }
  await updateObligation(ctx.supabase, {
    organisationId: ctx.organisationId,
    obligationId: String(formData.get('obligation_id') ?? ''),
    userId: ctx.userId,
    fields,
    expectedUpdatedAt: (formData.get('updated_at') as string) || null,
  });
  revalidateRi();
}
