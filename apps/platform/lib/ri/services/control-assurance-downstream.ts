import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { mapAssurancePlanToDraftFields } from '@/lib/ri/ai/assurance-plan-mapper.mjs';
import { mapSchemaForAnalysisType, validateStructuredOutput } from '@/lib/ri/ai/output-schemas';
import { createFixtureProvider, FIXTURE_PROVIDER_ID } from '@/lib/ri/ai/fixture-provider';
import { assertRowInOrganisation } from '@/lib/ri/db-guard';
import { linkAssuranceControl } from '@/lib/ri/links';
import { recordWorkflowEvent } from '@/lib/ri/workflow-events';

export type Stage5DownstreamResult =
  | { ok: true; skipped: true; reason: string }
  | { ok: true; skipped: false; assuranceReviewId: string; reused: boolean };

function stage5FixtureEnabled(): boolean {
  const raw = (process.env.FORGENIQ_STAGE5_AI || process.env.RI_AI_PROVIDER_MODE || 'FIXTURE').toUpperCase();
  return raw === 'FIXTURE' || raw === '1' || raw === 'TRUE';
}

export async function findPrimaryAssurancePlanForControl(
  supabase: SupabaseClient,
  organisationId: string,
  controlId: string,
) {
  const { data, error } = await supabase
    .from('assurance_reviews')
    .select('id, result')
    .eq('organisation_id', organisationId)
    .eq('metadata->>sourceApprovedControlId', controlId)
    .eq('metadata->>stage5PrimaryPlan', 'true')
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function ensureAssurancePlanFromApprovedControl(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    controlId: string;
    actorUserId: string;
  },
): Promise<Stage5DownstreamResult> {
  await assertRowInOrganisation(supabase, 'controls', params.controlId, params.organisationId);

  const { data: control, error: ctrlErr } = await supabase
    .from('controls')
    .select('id, status, owner_user_id, name, description, metadata')
    .eq('id', params.controlId)
    .eq('organisation_id', params.organisationId)
    .single();
  if (ctrlErr || !control) throw new Error('not_found');
  if (control.status !== 'ACTIVE') {
    return { ok: true, skipped: true, reason: 'control_not_approved' };
  }

  const existing = await findPrimaryAssurancePlanForControl(supabase, params.organisationId, params.controlId);
  if (existing?.id) {
    return { ok: true, skipped: false, assuranceReviewId: existing.id, reused: true };
  }

  let aiStructured: Record<string, unknown> | null = null;
  if (stage5FixtureEnabled()) {
    const provider = createFixtureProvider();
    const providerResult = await provider.execute({
      useCaseId: 'UC-RI-008',
      analysisType: 'Control Assurance Plan',
      fixtureScenario: 'stage5-control-assurance',
      budgetContext: {
        organisationId: params.organisationId,
        idempotencyKey: `stage5:${params.controlId}`,
      },
      context: {
        sourceSections: [
          {
            sourceSectionId: 'CTRL-1',
            citation: 'control',
            text: `${control.name}\n${control.description || ''}`.slice(0, 8000),
          },
        ],
      },
    });
    if (providerResult.ok && providerResult.structured) {
      const valid = validateStructuredOutput(
        mapSchemaForAnalysisType('Control Assurance Plan'),
        providerResult.structured,
      );
      if (valid.ok) aiStructured = providerResult.structured;
    }
  }

  const mapped = mapAssurancePlanToDraftFields({ structured: aiStructured });
  const ctrlMeta = (control.metadata || {}) as Record<string, unknown>;
  const recordProvenance =
    (ctrlMeta.recordProvenance as string | undefined) ||
    (ctrlMeta.record_provenance as string | undefined) ||
    'tenant_operational';
  const metadata = {
    sourceApprovedControlId: params.controlId,
    sourceApprovedRiskId: ctrlMeta.sourceApprovedRiskId ?? null,
    sourceImpactAssessmentId: ctrlMeta.sourceImpactAssessmentId ?? null,
    sourceRegulatoryObligationId: ctrlMeta.sourceRegulatoryObligationId ?? null,
    stage5PrimaryPlan: true,
    stage5Workflow: 'control_approved_to_assurance_plan',
    stage5Ai: mapped.stage5Metadata,
    assuranceStatus: 'DRAFT',
    assuranceWorkflow: true,
    labProvenanceLocked: true,
    recordProvenance,
  };

  const { data: review, error: insertErr } = await supabase
    .from('assurance_reviews')
    .insert({
      organisation_id: params.organisationId,
      review_type: mapped.review_type,
      result: 'NOT_TESTED',
      reviewer_user_id: control.owner_user_id || params.actorUserId,
      review_date: new Date().toISOString().slice(0, 10),
      notes: mapped.notes,
      metadata,
    })
    .select('id')
    .single();

  if (insertErr) {
    if (insertErr.code === '23505') {
      const again = await findPrimaryAssurancePlanForControl(supabase, params.organisationId, params.controlId);
      if (again?.id) {
        return { ok: true, skipped: false, assuranceReviewId: again.id, reused: true };
      }
    }
    throw new Error(insertErr.message);
  }

  try {
    await linkAssuranceControl(supabase, params.organisationId, review.id, params.controlId, params.actorUserId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg !== 'provenance_link_mismatch') throw e;
  }

  await recordWorkflowEvent(supabase, {
    organisationId: params.organisationId,
    entityType: 'control',
    entityId: params.controlId,
    eventType: 'ASSURANCE_PLAN_INITIATED_FROM_CONTROL',
    actorUserId: params.actorUserId,
    toStatus: 'ACTIVE',
    metadata: { assuranceReviewId: review.id, aiProvider: FIXTURE_PROVIDER_ID },
  });

  return { ok: true, skipped: false, assuranceReviewId: review.id, reused: false };
}