import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { mapRiskMappingToDraftFields } from '@/lib/ri/ai/risk-mapping-mapper.mjs';
import { mapSchemaForAnalysisType, validateStructuredOutput } from '@/lib/ri/ai/output-schemas';
import { createFixtureProvider, FIXTURE_PROVIDER_ID } from '@/lib/ri/ai/fixture-provider';
import { assertRowInOrganisation } from '@/lib/ri/db-guard';
import { linkImpactAssessmentRisk, linkObligationRisk } from '@/lib/ri/links';
import { recordWorkflowEvent } from '@/lib/ri/workflow-events';

export type Stage3DownstreamResult =
  | { ok: true; skipped: true; reason: string }
  | { ok: true; skipped: false; riskId: string; reused: boolean; linkedExisting: string[] };

function stage3FixtureEnabled(): boolean {
  const raw = (process.env.FORGENIQ_STAGE3_AI || process.env.RI_AI_PROVIDER_MODE || 'FIXTURE').toUpperCase();
  return raw === 'FIXTURE' || raw === '1' || raw === 'TRUE';
}

export async function findPrimaryDraftRiskForImpact(
  supabase: SupabaseClient,
  organisationId: string,
  impactAssessmentId: string,
) {
  const { data, error } = await supabase
    .from('risks')
    .select('id, status')
    .eq('organisation_id', organisationId)
    .eq('metadata->>sourceImpactAssessmentId', impactAssessmentId)
    .eq('metadata->>stage3PrimaryDraft', 'true')
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function ensureRiskMappingFromApprovedImpact(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    impactAssessmentId: string;
    actorUserId: string;
  },
): Promise<Stage3DownstreamResult> {
  await assertRowInOrganisation(supabase, 'impact_assessments', params.impactAssessmentId, params.organisationId);

  const { data: impact, error: impErr } = await supabase
    .from('impact_assessments')
    .select(
      'id, status, owner_user_id, metadata, regulatory_change_id, compliance_impact, business_impact, operational_impact',
    )
    .eq('id', params.impactAssessmentId)
    .eq('organisation_id', params.organisationId)
    .single();
  if (impErr || !impact) throw new Error('not_found');
  if (impact.status !== 'APPROVED') {
    return { ok: true, skipped: true, reason: 'impact_not_approved' };
  }

  const existing = await findPrimaryDraftRiskForImpact(supabase, params.organisationId, params.impactAssessmentId);
  if (existing?.id) {
    return { ok: true, skipped: false, riskId: existing.id, reused: true, linkedExisting: [] };
  }

  const meta = (impact.metadata || {}) as Record<string, unknown>;
  const obligationId = meta.sourceRegulatoryObligationId ? String(meta.sourceRegulatoryObligationId) : null;
  const ownerUserId = impact.owner_user_id || params.actorUserId;

  let aiStructured: Record<string, unknown> | null = null;
  if (stage3FixtureEnabled()) {
    const provider = createFixtureProvider();
    const providerResult = await provider.execute({
      useCaseId: 'UC-RI-006',
      analysisType: 'Risk Mapping',
      fixtureScenario: 'stage3-impact-risk',
      budgetContext: {
        organisationId: params.organisationId,
        idempotencyKey: `stage3:${params.impactAssessmentId}`,
      },
      context: {
        sourceSections: [
          {
            sourceSectionId: 'IMP-1',
            citation: 'impact_assessment',
            text: [
              impact.compliance_impact,
              impact.business_impact,
              impact.operational_impact,
            ]
              .filter(Boolean)
              .join('\n')
              .slice(0, 8000),
          },
        ],
      },
    });
    if (providerResult.ok && providerResult.structured) {
      const valid = validateStructuredOutput(
        mapSchemaForAnalysisType('Risk Mapping'),
        providerResult.structured,
      );
      if (valid.ok) aiStructured = providerResult.structured;
    }
  }

  const mapped = mapRiskMappingToDraftFields({ structured: aiStructured });
  const impactMeta = (impact.metadata || {}) as Record<string, unknown>;
  const recordProvenance =
    (impactMeta.recordProvenance as string | undefined) ||
    (impactMeta.record_provenance as string | undefined) ||
    'tenant_operational';
  const metadata = {
    sourceImpactAssessmentId: params.impactAssessmentId,
    sourceRegulatoryObligationId: obligationId,
    stage3PrimaryDraft: true,
    stage3Workflow: 'impact_approved_to_risk_draft',
    stage3Ai: mapped.stage3Metadata,
    labProvenanceLocked: true,
    recordProvenance,
  };

  const { data: risk, error: insertErr } = await supabase
    .from('risks')
    .insert({
      organisation_id: params.organisationId,
      title: mapped.title,
      description: mapped.description,
      category: mapped.category,
      inherent_risk: mapped.inherent_risk,
      residual_risk: mapped.residual_risk,
      owner_user_id: ownerUserId,
      created_by_user_id: params.actorUserId,
      status: 'DRAFT',
      metadata,
    })
    .select('id')
    .single();

  if (insertErr) {
    if (insertErr.code === '23505') {
      const again = await findPrimaryDraftRiskForImpact(
        supabase,
        params.organisationId,
        params.impactAssessmentId,
      );
      if (again?.id) {
        return { ok: true, skipped: false, riskId: again.id, reused: true, linkedExisting: [] };
      }
    }
    throw new Error(insertErr.message);
  }

  await linkImpactAssessmentRisk(
    supabase,
    params.organisationId,
    params.impactAssessmentId,
    risk.id,
    params.actorUserId,
    'AI_PROPOSED',
  );

  const linkedExisting: string[] = [];
  if (obligationId) {
    try {
      await linkObligationRisk(supabase, params.organisationId, obligationId, risk.id, params.actorUserId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg !== 'provenance_link_mismatch') throw e;
    }
  }

  for (const m of mapped.existingRiskMappings) {
    const existingId = m?.riskId || m?.existingRiskId;
    if (typeof existingId === 'string') {
      await linkImpactAssessmentRisk(
        supabase,
        params.organisationId,
        params.impactAssessmentId,
        existingId,
        params.actorUserId,
        'AI_MAPPED',
      );
      linkedExisting.push(existingId);
    }
  }

  await recordWorkflowEvent(supabase, {
    organisationId: params.organisationId,
    entityType: 'impact_assessment',
    entityId: params.impactAssessmentId,
    eventType: 'RISK_MAPPING_INITIATED_FROM_IMPACT',
    actorUserId: params.actorUserId,
    toStatus: 'APPROVED',
    metadata: { riskId: risk.id, aiProvider: FIXTURE_PROVIDER_ID },
  });

  return { ok: true, skipped: false, riskId: risk.id, reused: false, linkedExisting };
}