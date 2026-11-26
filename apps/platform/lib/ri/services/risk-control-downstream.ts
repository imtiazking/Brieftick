import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { mapControlMappingToDraftFields } from '@/lib/ri/ai/control-mapping-mapper.mjs';
import { lifecycleAiAudit, runLifecycleStageAnalysis } from '@/lib/ri/ai/lifecycle-stage-ai';
import { assertRowInOrganisation } from '@/lib/ri/db-guard';
import { buildLockedChildMetadataFromParentRecord } from '@/lib/ri/lab-api/child-record-provenance';
import { linkRiskControl } from '@/lib/ri/links';
import { attemptMandatoryLifecycleLink } from '@/lib/ri/services/lifecycle-link-recovery';
import { recordWorkflowEvent } from '@/lib/ri/workflow-events';
import { evidencePackAdvisory, evidencePackSourceSections, regulatoryEvidenceMetadata } from '@/lib/ri/ai/lifecycle-evidence.mjs';
import { deriveControlRequirements } from '@/lib/ri/ai/control-coverage.mjs';
import { resolveRegulatoryEvidencePack } from '@/lib/ri/services/lifecycle-evidence-loader';

export type Stage4DownstreamResult =
  | { ok: true; skipped: true; reason: string }
  | { ok: true; skipped: false; controlId: string; reused: boolean };

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

  const { data: catalogueControls, error: catalogueErr } = await supabase
    .from('controls')
    .select('id, name, control_type, status')
    .eq('organisation_id', params.organisationId)
    .limit(20);
  if (catalogueErr) throw new Error(catalogueErr.message);

  const evidencePack = await resolveRegulatoryEvidencePack(
    supabase,
    params.organisationId,
    (risk.metadata || {}) as Record<string, unknown>,
  );
  const analysis = await runLifecycleStageAnalysis({
    stage: 4,
    organisationId: params.organisationId,
    idempotencyKey: `stage4:${params.riskId}`,
    sourceSections: [
      {
        sourceSectionId: 'RISK-1',
        citation: 'risk',
        text: `${risk.title}\n${risk.description || ''}`.slice(0, 8000),
      },
      ...(evidencePack ? evidencePackSourceSections(evidencePack) : []),
    ],
    evidencePack,
    advisoryContext: {
      regulatoryEvidence: evidencePackAdvisory(evidencePack),
      controlRequirements: deriveControlRequirements(evidencePack),
      instruction:
        'existingControls are tenant records. Prefer a match over a new control. Do not claim effectiveness without a recorded test. effectiveness must stay NOT_TESTED when evidence is absent.',
      existingControls: (catalogueControls || []).map((row) => ({
        id: row.id,
        name: row.name,
        controlType: row.control_type,
        status: row.status,
      })),
    },
  });
  if (!analysis.ok) {
    return { ok: true, skipped: true, reason: analysis.code };
  }

  const mapped = mapControlMappingToDraftFields({
    structured: analysis.structured,
    claims: analysis.evidence?.accepted,
    pack: evidencePack,
  });
  const riskMeta = (risk.metadata || {}) as Record<string, unknown>;
  const metadata = buildLockedChildMetadataFromParentRecord({
    parentMetadata: riskMeta,
    actorUserId: params.actorUserId,
    extras: {
      sourceApprovedRiskId: params.riskId,
      sourceImpactAssessmentId: riskMeta.sourceImpactAssessmentId ?? null,
      sourceRegulatoryObligationId: riskMeta.sourceRegulatoryObligationId ?? null,
      stage4PrimaryDraft: true,
      stage4Workflow: 'risk_validated_to_control_draft',
      stage4Ai: { ...mapped.stage4Metadata, ...lifecycleAiAudit(analysis) },
      regulatoryEvidence: regulatoryEvidenceMetadata(evidencePack, analysis.evidence),
    },
  });

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

  await attemptMandatoryLifecycleLink(supabase, {
    organisationId: params.organisationId,
    actorUserId: params.actorUserId,
    linkType: 'risk_control',
    sourceEntityType: 'risk',
    sourceEntityId: params.riskId,
    targetEntityType: 'control',
    targetEntityId: control.id,
    link: () => linkRiskControl(supabase, params.organisationId, params.riskId, control.id, params.actorUserId),
  });

  for (const m of mapped.existingControlMappings) {
    const existingControlId = m?.controlId || m?.existingControlId;
    if (typeof existingControlId === 'string') {
      await attemptMandatoryLifecycleLink(supabase, {
        organisationId: params.organisationId,
        actorUserId: params.actorUserId,
        linkType: 'risk_control',
        sourceEntityType: 'risk',
        sourceEntityId: params.riskId,
        targetEntityType: 'control',
        targetEntityId: existingControlId,
        link: () =>
          linkRiskControl(supabase, params.organisationId, params.riskId, existingControlId, params.actorUserId),
      });
    }
  }

  await recordWorkflowEvent(supabase, {
    organisationId: params.organisationId,
    entityType: 'risk',
    entityId: params.riskId,
    eventType: 'CONTROL_MAPPING_INITIATED_FROM_RISK',
    actorUserId: params.actorUserId,
    toStatus: 'APPROVED',
    metadata: { controlId: control.id, aiProvider: analysis.providerId, executionMode: analysis.executionMode },
  });

  return { ok: true, skipped: false, controlId: control.id, reused: false };
}