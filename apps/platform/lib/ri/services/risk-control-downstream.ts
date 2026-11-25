import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { mapControlMappingToDraftFields } from '@/lib/ri/ai/control-mapping-mapper.mjs';
import { mapSchemaForAnalysisType, validateStructuredOutput } from '@/lib/ri/ai/output-schemas';
import { createFixtureProvider, FIXTURE_PROVIDER_ID } from '@/lib/ri/ai/fixture-provider';
import { assertRowInOrganisation } from '@/lib/ri/db-guard';
import { linkRiskControl } from '@/lib/ri/links';
import { recordWorkflowEvent } from '@/lib/ri/workflow-events';

export type Stage4DownstreamResult =
  | { ok: true; skipped: true; reason: string }
  | { ok: true; skipped: false; controlId: string; reused: boolean };

function stage4FixtureEnabled(): boolean {
  const raw = (process.env.FORGENIQ_STAGE4_AI || process.env.RI_AI_PROVIDER_MODE || 'FIXTURE').toUpperCase();
  return raw === 'FIXTURE' || raw === '1' || raw === 'TRUE';
}

export async function findPrimaryDraftControlForRisk(
  supabase: SupabaseClient,
  organisationId: string,
  riskId: string,
) {
  const { data, error } = await supabase
    .from('controls')
    .select('id, status')
    .eq('organisation_id', organisationId)
    .eq('metadata->>sourceApprovedRiskId', riskId)
    .eq('metadata->>stage4PrimaryDraft', 'true')
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function ensureControlMappingFromApprovedRisk(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    riskId: string;
    actorUserId: string;
  },
): Promise<Stage4DownstreamResult> {
  await assertRowInOrganisation(supabase, 'risks', params.riskId, params.organisationId);

  const { data: risk, error: riskErr } = await supabase
    .from('risks')
    .select('id, status, owner_user_id, title, description, metadata')
    .eq('id', params.riskId)
    .eq('organisation_id', params.organisationId)
    .single();
  if (riskErr || !risk) throw new Error('not_found');
  if (risk.status !== 'APPROVED') {
    return { ok: true, skipped: true, reason: 'risk_not_validated' };
  }

  const existing = await findPrimaryDraftControlForRisk(supabase, params.organisationId, params.riskId);
  if (existing?.id) {
    return { ok: true, skipped: false, controlId: existing.id, reused: true };
  }

  let aiStructured: Record<string, unknown> | null = null;
  if (stage4FixtureEnabled()) {
    const provider = createFixtureProvider();
    const providerResult = await provider.execute({
      useCaseId: 'UC-RI-007',
      analysisType: 'Control Mapping',
      fixtureScenario: 'stage4-risk-control',
      budgetContext: {
        organisationId: params.organisationId,
        idempotencyKey: `stage4:${params.riskId}`,
      },
      context: {
        sourceSections: [
          {
            sourceSectionId: 'RISK-1',
            citation: 'risk',
            text: `${risk.title}\n${risk.description || ''}`.slice(0, 8000),
          },
        ],
      },
    });
    if (providerResult.ok && providerResult.structured) {
      const valid = validateStructuredOutput(
        mapSchemaForAnalysisType('Control Mapping'),
        providerResult.structured,
      );
      if (valid.ok) aiStructured = providerResult.structured;
    }
  }

  const mapped = mapControlMappingToDraftFields({ structured: aiStructured });
  const riskMeta = (risk.metadata || {}) as Record<string, unknown>;
  const recordProvenance =
    (riskMeta.recordProvenance as string | undefined) ||
    (riskMeta.record_provenance as string | undefined) ||
    'tenant_operational';
  const metadata = {
    sourceApprovedRiskId: params.riskId,
    sourceImpactAssessmentId: riskMeta.sourceImpactAssessmentId ?? null,
    sourceRegulatoryObligationId: riskMeta.sourceRegulatoryObligationId ?? null,
    stage4PrimaryDraft: true,
    stage4Workflow: 'risk_validated_to_control_draft',
    stage4Ai: mapped.stage4Metadata,
    labProvenanceLocked: true,
    recordProvenance,
  };

  const { data: control, error: insertErr } = await supabase
    .from('controls')
    .insert({
      organisation_id: params.organisationId,
      name: mapped.name,
      description: mapped.description,
      control_type: mapped.control_type,
      effectiveness: mapped.effectiveness,
      testing_status: 'NOT_TESTED',
      owner_user_id: risk.owner_user_id || params.actorUserId,
      created_by_user_id: params.actorUserId,
      status: 'DRAFT',
      metadata,
    })
    .select('id')
    .single();

  if (insertErr) {
    if (insertErr.code === '23505') {
      const again = await findPrimaryDraftControlForRisk(supabase, params.organisationId, params.riskId);
      if (again?.id) {
        return { ok: true, skipped: false, controlId: again.id, reused: true };
      }
    }
    throw new Error(insertErr.message);
  }

  try {
    await linkRiskControl(supabase, params.organisationId, params.riskId, control.id, params.actorUserId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg !== 'provenance_link_mismatch') throw e;
  }

  for (const m of mapped.existingControlMappings) {
    const existingControlId = m?.controlId || m?.existingControlId;
    if (typeof existingControlId === 'string') {
      try {
        await linkRiskControl(supabase, params.organisationId, params.riskId, existingControlId, params.actorUserId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg !== 'provenance_link_mismatch') throw e;
      }
    }
  }

  await recordWorkflowEvent(supabase, {
    organisationId: params.organisationId,
    entityType: 'risk',
    entityId: params.riskId,
    eventType: 'CONTROL_MAPPING_INITIATED_FROM_RISK',
    actorUserId: params.actorUserId,
    toStatus: 'APPROVED',
    metadata: { controlId: control.id, aiProvider: FIXTURE_PROVIDER_ID },
  });

  return { ok: true, skipped: false, controlId: control.id, reused: false };
}