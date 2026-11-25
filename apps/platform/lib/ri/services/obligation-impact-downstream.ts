import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlatformRole } from '@/lib/roles';
import { mapImpactSuggestionToDraftFields } from '@/lib/ri/ai/impact-suggestion-mapper.mjs';
import { mapSchemaForAnalysisType, validateStructuredOutput } from '@/lib/ri/ai/output-schemas';
import { createFixtureProvider, FIXTURE_PROVIDER_ID } from '@/lib/ri/ai/fixture-provider';
import { assertRowInOrganisation } from '@/lib/ri/db-guard';
import {
  buildLockedChildMetadataFromParentChange,
  workflowMetadataForChildRecordCreate,
} from '@/lib/ri/lab-api/child-record-provenance';
import { fanOutTenantNotification } from '@/lib/ri/services/tenant-notification-fanout';
import { recordWorkflowEvent } from '@/lib/ri/workflow-events';

export type Stage2DownstreamResult =
  | { ok: true; skipped: true; reason: string }
  | { ok: true; skipped: false; impactAssessmentId: string; reused: boolean; aiProvider: string };

function stage2FixtureEnabled(): boolean {
  const raw = (process.env.FORGENIQ_STAGE2_AI || process.env.RI_AI_PROVIDER_MODE || 'FIXTURE').toUpperCase();
  return raw === 'FIXTURE' || raw === '1' || raw === 'TRUE';
}

export async function findImpactForSourceObligation(
  supabase: SupabaseClient,
  organisationId: string,
  obligationId: string,
) {
  const { data, error } = await supabase
    .from('impact_assessments')
    .select('id, status')
    .eq('organisation_id', organisationId)
    .eq('metadata->>sourceRegulatoryObligationId', obligationId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Idempotent Stage 2: approved obligation (OPEN) → DRAFT impact assessment with fixture UC-RI-004 draft when enabled.
 */
export async function ensureImpactAssessmentFromApprovedObligation(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    obligationId: string;
    actorUserId: string;
    role?: PlatformRole | null;
  },
): Promise<Stage2DownstreamResult> {
  await assertRowInOrganisation(supabase, 'regulatory_obligations', params.obligationId, params.organisationId);

  const { data: obligation, error: oblErr } = await supabase
    .from('regulatory_obligations')
    .select(
      'id, status, obligation_statement, citation, owner_user_id, regulatory_change_id, publication_id',
    )
    .eq('id', params.obligationId)
    .eq('organisation_id', params.organisationId)
    .single();
  if (oblErr || !obligation) throw new Error('not_found');
  if (obligation.status !== 'OPEN') {
    return { ok: true, skipped: true, reason: 'obligation_not_approved' };
  }
  if (!obligation.regulatory_change_id) {
    return { ok: true, skipped: true, reason: 'missing_regulatory_change' };
  }

  const existing = await findImpactForSourceObligation(supabase, params.organisationId, params.obligationId);
  if (existing?.id) {
    return {
      ok: true,
      skipped: false,
      impactAssessmentId: existing.id,
      reused: true,
      aiProvider: FIXTURE_PROVIDER_ID,
    };
  }

  const { data: change, error: changeErr } = await supabase
    .from('regulatory_changes')
    .select('id, title, description, external_key, origin, publication_id, metadata')
    .eq('id', obligation.regulatory_change_id)
    .eq('organisation_id', params.organisationId)
    .single();
  if (changeErr || !change) return { ok: true, skipped: true, reason: 'change_not_found' };

  const ownerUserId = obligation.owner_user_id || params.actorUserId;
  const { metadata: rowMetadata, recordProvenance, labClass } = buildLockedChildMetadataFromParentChange({
    parentChange: change,
    actorUserId: params.actorUserId,
  });

  let aiStructured: Record<string, unknown> | null = null;
  let aiProvider = FIXTURE_PROVIDER_ID;
  let stage2AiMeta: Record<string, unknown> = { processingStatus: 'SKIPPED_NO_FIXTURE' };

  if (stage2FixtureEnabled()) {
    const provider = createFixtureProvider();
    const providerResult = await provider.execute({
      useCaseId: 'UC-RI-004',
      analysisType: 'Impact Suggestion',
      fixtureScenario: 'stage2-obligation-impact',
      budgetContext: {
        organisationId: params.organisationId,
        idempotencyKey: `stage2:${params.obligationId}`,
      },
      context: {
        sourceSections: [
          {
            sourceSectionId: 'OBL-1',
            citation: obligation.citation || 'obligation',
            text: String(obligation.obligation_statement || '').slice(0, 8000),
          },
        ],
      },
    });
    if (providerResult.ok && providerResult.structured) {
      const schemaName = mapSchemaForAnalysisType('Impact Suggestion');
      const valid = validateStructuredOutput(schemaName, providerResult.structured);
      if (valid.ok) {
        aiStructured = providerResult.structured;
        aiProvider = provider.id;
      }
    }
  }

  const mapped = mapImpactSuggestionToDraftFields({
    structured: aiStructured,
    obligationStatement: obligation.obligation_statement,
    obligationCitation: obligation.citation,
    changeTitle: change.title,
  });
  stage2AiMeta = { ...mapped.stage2Metadata, aiProvider, fixtureMode: stage2FixtureEnabled() };

  const metadata = {
    ...rowMetadata,
    sourceRegulatoryObligationId: params.obligationId,
    stage2Workflow: 'obligation_approved_to_impact_draft',
    stage2Ai: stage2AiMeta,
    recordProvenance,
    labProvenanceLocked: true,
    parentRegulatoryChangeId: obligation.regulatory_change_id,
  };

  const { data: impact, error: insertErr } = await supabase
    .from('impact_assessments')
    .insert({
      organisation_id: params.organisationId,
      regulatory_change_id: obligation.regulatory_change_id,
      status: 'DRAFT',
      owner_user_id: ownerUserId,
      business_impact: mapped.business_impact,
      operational_impact: mapped.operational_impact,
      technology_impact: mapped.technology_impact,
      compliance_impact: mapped.compliance_impact,
      financial_impact: mapped.financial_impact,
      implementation_complexity: mapped.implementation_complexity,
      materiality: mapped.materiality,
      metadata,
    })
    .select('id')
    .single();

  if (insertErr) {
    if (insertErr.code === '23505') {
      const again = await findImpactForSourceObligation(supabase, params.organisationId, params.obligationId);
      if (again?.id) {
        return {
          ok: true,
          skipped: false,
          impactAssessmentId: again.id,
          reused: true,
          aiProvider,
        };
      }
    }
    throw new Error(insertErr.message);
  }

  await recordWorkflowEvent(supabase, {
    organisationId: params.organisationId,
    entityType: 'impact_assessment',
    entityId: impact.id,
    eventType: 'IMPACT_CREATED',
    actorUserId: params.actorUserId,
    toStatus: 'DRAFT',
    metadata: {
      ...workflowMetadataForChildRecordCreate({
        recordProvenance,
        parentChangeId: obligation.regulatory_change_id,
        actorUserId: params.actorUserId,
        labClass,
      }),
      sourceRegulatoryObligationId: params.obligationId,
      stage2: true,
    },
  });

  await recordWorkflowEvent(supabase, {
    organisationId: params.organisationId,
    entityType: 'regulatory_obligation',
    entityId: params.obligationId,
    eventType: 'IMPACT_INITIATED_FROM_OBLIGATION',
    actorUserId: params.actorUserId,
    toStatus: 'OPEN',
    metadata: {
      impactAssessmentId: impact.id,
      regulatoryChangeId: obligation.regulatory_change_id,
      aiProvider,
      aiUseCaseId: 'UC-RI-004',
    },
  });

  if (mapped.business_areas.length) {
    await supabase.from('impact_assessment_business_areas').insert(
      mapped.business_areas.map((business_area) => ({
        organisation_id: params.organisationId,
        impact_assessment_id: impact.id,
        business_area,
      })),
    );
  }

  if (ownerUserId && ownerUserId !== params.actorUserId) {
    await fanOutTenantNotification(supabase, {
      organisationId: params.organisationId,
      createdByUserId: params.actorUserId,
      recipientUserId: ownerUserId,
      notificationType: 'ASSIGNMENT',
      severity: 'MEDIUM',
      title: 'Impact assessment draft assigned',
      message:
        'A new AI-assisted impact assessment draft was created from an approved obligation. Review and complete before submit.',
      entityType: 'impact_assessment',
      entityId: impact.id,
      linkPath: `#/assessment/${impact.id}`,
      workflowEntityType: 'impact_assessment',
      workflowEntityId: impact.id,
      payload: { sourceRegulatoryObligationId: params.obligationId, stage: 2 },
    });
  }

  return {
    ok: true,
    skipped: false,
    impactAssessmentId: impact.id,
    reused: false,
    aiProvider,
  };
}