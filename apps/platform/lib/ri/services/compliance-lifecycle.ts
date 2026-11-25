import type { SupabaseClient } from '@supabase/supabase-js';
import { assertRowInOrganisation } from '@/lib/ri/db-guard';
import { findPrimaryDraftRiskForImpact } from '@/lib/ri/services/impact-risk-downstream';
import { findPrimaryDraftControlForRisk } from '@/lib/ri/services/risk-control-downstream';
import { findPrimaryAssurancePlanForControl } from '@/lib/ri/services/control-assurance-downstream';

export type ComplianceLifecycleStage =
  | 'obligation'
  | 'impact'
  | 'risk'
  | 'control'
  | 'assurance'
  | 'closed';

export async function getComplianceLifecycleForObligation(
  supabase: SupabaseClient,
  organisationId: string,
  obligationId: string,
) {
  await assertRowInOrganisation(supabase, 'regulatory_obligations', obligationId, organisationId);

  const { data: obligation } = await supabase
    .from('regulatory_obligations')
    .select('id, status, obligation_statement, owner_user_id')
    .eq('id', obligationId)
    .eq('organisation_id', organisationId)
    .single();

  const { data: impacts } = await supabase
    .from('impact_assessments')
    .select('id, status, owner_user_id')
    .eq('organisation_id', organisationId)
    .eq('metadata->>sourceRegulatoryObligationId', obligationId)
    .limit(1);

  const impact = impacts?.[0] ?? null;
  let risk: { id: string; status: string; owner_user_id?: string | null } | null = null;
  let control: { id: string; status: string; owner_user_id?: string | null } | null = null;
  let assurance: { id: string; result: string; metadata?: Record<string, unknown> } | null = null;

  if (impact?.id) {
    const draftRisk = await findPrimaryDraftRiskForImpact(supabase, organisationId, impact.id);
    if (draftRisk?.id) {
      const { data: riskRow } = await supabase
        .from('risks')
        .select('id, status, owner_user_id')
        .eq('id', draftRisk.id)
        .maybeSingle();
      risk = riskRow ?? null;
    }
    if (risk?.id && risk.status === 'APPROVED') {
      const draftControl = await findPrimaryDraftControlForRisk(supabase, organisationId, risk.id);
      if (draftControl?.id) {
        const { data: ctrlRow } = await supabase
          .from('controls')
          .select('id, status, owner_user_id')
          .eq('id', draftControl.id)
          .maybeSingle();
        control = ctrlRow ?? null;
      }
    }
    if (control?.id && control.status === 'ACTIVE') {
      const plan = await findPrimaryAssurancePlanForControl(supabase, organisationId, control.id);
      if (plan?.id) {
        const { data: ar } = await supabase
          .from('assurance_reviews')
          .select('id, result, metadata')
          .eq('id', plan.id)
          .maybeSingle();
        assurance = ar ?? null;
      }
    }
  }

  const closedEv = await supabase
    .from('workflow_events')
    .select('id')
    .eq('organisation_id', organisationId)
    .eq('entity_type', 'regulatory_obligation')
    .eq('entity_id', obligationId)
    .eq('event_type', 'COMPLIANCE_LIFECYCLE_CLOSED')
    .limit(1);

  let currentStage: ComplianceLifecycleStage = 'obligation';
  if (closedEv.data?.length) currentStage = 'closed';
  else if (assurance) currentStage = 'assurance';
  else if (control) currentStage = 'control';
  else if (risk) currentStage = 'risk';
  else if (impact) currentStage = 'impact';

  return {
    obligationId,
    obligationStatus: obligation?.status ?? null,
    currentStage,
    impact,
    risk,
    control,
    assurance,
    links: {
      impactId: impact?.id ?? null,
      riskId: risk?.id ?? null,
      controlId: control?.id ?? null,
      assuranceReviewId: assurance?.id ?? null,
    },
  };
}