import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { mapRiskMappingToDraftFields } from '@/lib/ri/ai/risk-mapping-mapper.mjs';
import { lifecycleAiAudit, runLifecycleStageAnalysis } from '@/lib/ri/ai/lifecycle-stage-ai';
import { assertRowInOrganisation } from '@/lib/ri/db-guard';
import { buildLockedChildMetadataFromParentRecord } from '@/lib/ri/lab-api/child-record-provenance';
import { linkImpactAssessmentRisk, linkObligationRisk } from '@/lib/ri/links';
import { attemptMandatoryLifecycleLink } from '@/lib/ri/services/lifecycle-link-recovery';
import { recordWorkflowEvent } from '@/lib/ri/workflow-events';

export type Stage3DownstreamResult =
  | { ok: true; skipped: true; reason: string }
  | { ok: true; skipped: false; riskId: string; reused: boolean; linkedExisting: string[] };

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

  const { data: catalogueRisks, error: catalogueErr } = await supabase
    .from('risks')
    .select('id, title, category, status')
    .eq('organisation_id', params.organisationId)
    .limit(20);
  if (catalogueErr) throw new Error(catalogueErr.message);

  const analysis = await runLifecycleStageAnalysis({
    stage: 3,
    organisationId: params.organisationId,
    idempotencyKey: `stage3:${params.impactAssessmentId}`,
    sourceSections: [
      {
        sourceSectionId: 'IMP-1',
        citation: 'impact_assessment',
        text: [impact.compliance_impact, impact.business_impact, impact.operational_impact]
          .filter(Boolean)
          .join('\n')
          .slice(0, 8000),
      },
    ],
    advisoryContext: {
      instruction:
        'existingRisks are tenant records. Match them by id only when relevant. Do not invent ids. New risks stay proposals.',
      existingRisks: (catalogueRisks || []).map((row) => ({
        id: row.id,
        title: row.title,
        category: row.category,
        status: row.status,
      })),
    },
  });
  if (!analysis.ok) {
    return { ok: true, skipped: true, reason: analysis.code };
  }

  const mapped = mapRiskMappingToDraftFields({ structured: analysis.structured });
  const impactMeta = (impact.metadata || {}) as Record<string, unknown>;
  const metadata = buildLockedChildMetadataFromParentRecord({
    parentMetadata: impactMeta,
    actorUserId: params.actorUserId,
    extras: {
      sourceImpactAssessmentId: params.impactAssessmentId,
      sourceRegulatoryObligationId: obligationId,
      stage3PrimaryDraft: true,
      stage3Workflow: 'impact_approved_to_risk_draft',
      stage3Ai: { ...mapped.stage3Metadata, ...lifecycleAiAudit(analysis) },
    },
  });

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
    await attemptMandatoryLifecycleLink(supabase, {
      organisationId: params.organisationId,
      actorUserId: params.actorUserId,
      linkType: 'obligation_risk',
      sourceEntityType: 'regulatory_obligation',
      sourceEntityId: obligationId,
      targetEntityType: 'risk',
      targetEntityId: risk.id,
      link: () => linkObligationRisk(supabase, params.organisationId, obligationId!, risk.id, params.actorUserId),
    });
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
    metadata: { riskId: risk.id, aiProvider: analysis.providerId, executionMode: analysis.executionMode },
  });

  return { ok: true, skipped: false, riskId: risk.id, reused: false, linkedExisting };
}