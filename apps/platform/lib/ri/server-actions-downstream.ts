'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { rejectClientOrganisationId } from '@/lib/ri/db-guard';
import { requireRiContext } from '@/lib/ri/context';
import {
  linkAssuranceControl,
  linkAssuranceObligation,
  linkEvidenceControl,
  linkEvidenceObligation,
  linkFindingAction,
  linkFindingControl,
  linkObligationControl,
  linkObligationPolicy,
  linkObligationRisk,
  linkRiskControl,
  unlinkObligationPolicy,
} from '@/lib/ri/links';
import { createAssuranceReview } from '@/lib/ri/services/assurance';
import { createControl, updateControl } from '@/lib/ri/services/controls';
import { createEvidence } from '@/lib/ri/services/evidence';
import { createFinding, updateFinding } from '@/lib/ri/services/findings';
import { createPolicy, updatePolicy } from '@/lib/ri/services/policies';
import { createRiAction, updateRiAction } from '@/lib/ri/services/ri-actions';
import { createRisk, updateRisk } from '@/lib/ri/services/risks';

function revalidateRi() {
  revalidatePath('/ri', 'layout');
}

export async function createPolicyAction(formData: FormData) {
  const ctx = await requireRiContext('policy:write');
  rejectClientOrganisationId(formData.get('organisation_id') as string, ctx.organisationId);
  const row = await createPolicy(ctx.supabase, ctx.organisationId, ctx.userId, {
    name: formData.get('name'),
    description: formData.get('description'),
    version: formData.get('version'),
    status: formData.get('status'),
    next_review_date: formData.get('next_review_date'),
  });
  revalidateRi();
  redirect(`/ri/policies/${row.id}`);
}

export async function updatePolicyAction(formData: FormData) {
  const ctx = await requireRiContext('policy:write');
  await updatePolicy(
    ctx.supabase,
    ctx.organisationId,
    String(formData.get('policy_id')),
    {
      name: formData.get('name'),
      description: formData.get('description'),
      version: formData.get('version'),
      status: formData.get('status'),
      next_review_date: formData.get('next_review_date'),
    },
    (formData.get('updated_at') as string) || null,
  );
  revalidateRi();
}

export async function linkObligationPolicyAction(formData: FormData) {
  const ctx = await requireRiContext('policy:write');
  const unlink = formData.get('unlink') === '1';
  if (unlink) {
    await unlinkObligationPolicy(
      ctx.supabase,
      ctx.organisationId,
      String(formData.get('obligation_id')),
      String(formData.get('policy_id')),
    );
  } else {
    await linkObligationPolicy(
      ctx.supabase,
      ctx.organisationId,
      String(formData.get('obligation_id')),
      String(formData.get('policy_id')),
      ctx.userId,
    );
  }
  revalidateRi();
}

export async function createRiskAction(formData: FormData) {
  const ctx = await requireRiContext('risk:write');
  const row = await createRisk(ctx.supabase, ctx.organisationId, ctx.userId, {
    title: formData.get('title'),
    description: formData.get('description'),
    category: formData.get('category'),
    inherent_risk: formData.get('inherent_risk'),
    residual_risk: formData.get('residual_risk'),
  });
  revalidateRi();
  redirect(`/ri/risks/${row.id}`);
}

export async function updateRiskAction(formData: FormData) {
  const ctx = await requireRiContext('risk:write');
  await updateRisk(
    ctx.supabase,
    ctx.organisationId,
    String(formData.get('risk_id')),
    {
      title: formData.get('title'),
      description: formData.get('description'),
      category: formData.get('category'),
      inherent_risk: formData.get('inherent_risk'),
      residual_risk: formData.get('residual_risk'),
      status: formData.get('status'),
    },
    (formData.get('updated_at') as string) || null,
  );
  revalidateRi();
}

export async function linkObligationRiskAction(formData: FormData) {
  const ctx = await requireRiContext('risk:write');
  await linkObligationRisk(
    ctx.supabase,
    ctx.organisationId,
    String(formData.get('obligation_id')),
    String(formData.get('risk_id')),
    ctx.userId,
  );
  revalidateRi();
}

export async function createControlAction(formData: FormData) {
  const ctx = await requireRiContext('control:write');
  const row = await createControl(ctx.supabase, ctx.organisationId, ctx.userId, {
    name: formData.get('name'),
    description: formData.get('description'),
    control_type: formData.get('control_type'),
    effectiveness: formData.get('effectiveness'),
  });
  revalidateRi();
  redirect(`/ri/controls/${row.id}`);
}

export async function updateControlAction(formData: FormData) {
  const ctx = await requireRiContext('control:write');
  await updateControl(
    ctx.supabase,
    ctx.organisationId,
    String(formData.get('control_id')),
    {
      name: formData.get('name'),
      description: formData.get('description'),
      effectiveness: formData.get('effectiveness'),
      testing_status: formData.get('testing_status'),
      status: formData.get('status'),
    },
    (formData.get('updated_at') as string) || null,
  );
  revalidateRi();
}

export async function linkRiskControlAction(formData: FormData) {
  const ctx = await requireRiContext('control:write');
  await linkRiskControl(
    ctx.supabase,
    ctx.organisationId,
    String(formData.get('risk_id')),
    String(formData.get('control_id')),
    ctx.userId,
  );
  revalidateRi();
}

export async function linkObligationControlAction(formData: FormData) {
  const ctx = await requireRiContext('control:write');
  await linkObligationControl(
    ctx.supabase,
    ctx.organisationId,
    String(formData.get('obligation_id')),
    String(formData.get('control_id')),
    ctx.userId,
  );
  revalidateRi();
}

export async function createActionDownstreamAction(formData: FormData) {
  const ctx = await requireRiContext('action:write');
  const row = await createRiAction(ctx.supabase, {
    organisationId: ctx.organisationId,
    userId: ctx.userId,
    title: String(formData.get('title') ?? ''),
    sourceType: String(formData.get('source_type') ?? 'manual'),
    description: (formData.get('description') as string) || null,
    priority: (formData.get('priority') as string) || null,
    dueDate: (formData.get('due_date') as string) || null,
    obligationId: (formData.get('obligation_id') as string) || null,
    controlId: (formData.get('control_id') as string) || null,
  });
  revalidateRi();
  redirect(`/ri/actions/${row.id}`);
}

export async function updateActionDownstreamAction(formData: FormData) {
  const ctx = await requireRiContext('action:write');
  const fields: Record<string, unknown> = {};
  for (const k of ['title', 'description', 'priority', 'due_date', 'status', 'escalation_status']) {
    const v = formData.get(k);
    if (v) fields[k] = v;
  }
  if (formData.get('assign_self') === '1') fields.assign_owner = 'self';
  await updateRiAction(ctx.supabase, {
    organisationId: ctx.organisationId,
    actionId: String(formData.get('action_id')),
    userId: ctx.userId,
    fields,
    expectedUpdatedAt: (formData.get('updated_at') as string) || null,
  });
  revalidateRi();
}

export async function createEvidenceAction(formData: FormData) {
  const ctx = await requireRiContext('evidence:write');
  const row = await createEvidence(ctx.supabase, ctx.organisationId, ctx.userId, {
    title: formData.get('title'),
    evidence_type: formData.get('evidence_type'),
    description: formData.get('description'),
    source_url: formData.get('source_url'),
    source_hash: formData.get('source_hash'),
  });
  const obligationId = formData.get('obligation_id') as string;
  const controlId = formData.get('control_id') as string;
  if (obligationId) {
    await linkEvidenceObligation(ctx.supabase, ctx.organisationId, row.id, obligationId, ctx.userId);
  }
  if (controlId) {
    await linkEvidenceControl(ctx.supabase, ctx.organisationId, row.id, controlId, ctx.userId);
  }
  revalidateRi();
  redirect(`/ri/evidence/${row.id}`);
}

export async function linkEvidenceAction(formData: FormData) {
  const ctx = await requireRiContext('evidence:write');
  const type = String(formData.get('link_type'));
  if (type === 'obligation') {
    await linkEvidenceObligation(
      ctx.supabase,
      ctx.organisationId,
      String(formData.get('evidence_id')),
      String(formData.get('target_id')),
      ctx.userId,
    );
  } else if (type === 'control') {
    await linkEvidenceControl(
      ctx.supabase,
      ctx.organisationId,
      String(formData.get('evidence_id')),
      String(formData.get('target_id')),
      ctx.userId,
    );
  }
  revalidateRi();
}

export async function createFindingAction(formData: FormData) {
  const ctx = await requireRiContext('finding:write');
  const row = await createFinding(ctx.supabase, ctx.organisationId, ctx.userId, {
    title: formData.get('title'),
    description: formData.get('description'),
    severity: formData.get('severity'),
    due_date: formData.get('due_date'),
  });
  const controlId = formData.get('control_id') as string;
  const actionId = formData.get('action_id') as string;
  if (controlId) await linkFindingControl(ctx.supabase, ctx.organisationId, row.id, controlId, ctx.userId);
  if (actionId) await linkFindingAction(ctx.supabase, ctx.organisationId, row.id, actionId, ctx.userId);
  revalidateRi();
  redirect(`/ri/findings/${row.id}`);
}

export async function updateFindingAction(formData: FormData) {
  const ctx = await requireRiContext(
    formData.get('status') === 'CLOSED' ? 'finding:close' : 'finding:write',
  );
  await updateFinding(ctx.supabase, {
    organisationId: ctx.organisationId,
    findingId: String(formData.get('finding_id')),
    userId: ctx.userId,
    fields: {
      title: formData.get('title'),
      description: formData.get('description'),
      severity: formData.get('severity'),
      status: formData.get('status'),
      due_date: formData.get('due_date'),
    },
    expectedUpdatedAt: (formData.get('updated_at') as string) || null,
  });
  revalidateRi();
}

export async function createAssuranceAction(formData: FormData) {
  const ctx = await requireRiContext('assurance:write');
  const row = await createAssuranceReview(ctx.supabase, ctx.organisationId, ctx.userId, {
    review_type: formData.get('review_type'),
    result: formData.get('result'),
    notes: formData.get('notes'),
    next_review_date: formData.get('next_review_date'),
  });
  const controlId = formData.get('control_id') as string;
  const obligationId = formData.get('obligation_id') as string;
  if (controlId) await linkAssuranceControl(ctx.supabase, ctx.organisationId, row.id, controlId, ctx.userId);
  if (obligationId) {
    await linkAssuranceObligation(ctx.supabase, ctx.organisationId, row.id, obligationId, ctx.userId);
  }
  revalidateRi();
  redirect(`/ri/assurance/${row.id}`);
}
