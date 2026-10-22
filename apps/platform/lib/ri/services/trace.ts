import type { SupabaseClient } from '@supabase/supabase-js';
import { assertRowInOrganisation } from '@/lib/ri/db-guard';
import { getObligationDetail } from '@/lib/ri/services/obligations';

export async function getObligationDownstreamTrace(
  supabase: SupabaseClient,
  organisationId: string,
  obligationId: string,
) {
  await assertRowInOrganisation(supabase, 'regulatory_obligations', obligationId, organisationId);
  const upstream = await getObligationDetail(supabase, organisationId, obligationId);

  const [policies, risks, controls, actions, directEvidence, assurance] = await Promise.all([
    supabase
      .from('obligation_policy_links')
      .select('policy:policies(id, name)')
      .eq('organisation_id', organisationId)
      .eq('obligation_id', obligationId),
    supabase
      .from('obligation_risk_links')
      .select('risk:risks(id, title)')
      .eq('organisation_id', organisationId)
      .eq('obligation_id', obligationId),
    supabase
      .from('obligation_control_links')
      .select('control:controls(id, name)')
      .eq('organisation_id', organisationId)
      .eq('obligation_id', obligationId),
    supabase
      .from('action_obligation_links')
      .select('action:actions(id, title, status)')
      .eq('organisation_id', organisationId)
      .eq('obligation_id', obligationId),
    supabase
      .from('evidence_obligation_links')
      .select('evidence:evidence_items(id, title)')
      .eq('organisation_id', organisationId)
      .eq('obligation_id', obligationId),
    supabase
      .from('assurance_review_obligation_links')
      .select('assurance:assurance_reviews(id, result)')
      .eq('organisation_id', organisationId)
      .eq('obligation_id', obligationId),
  ]);

  const pick = (rows: { [k: string]: unknown }[] | null, key: string) =>
    (rows ?? []).map((r) => (Array.isArray(r[key]) ? r[key][0] : r[key])).filter(Boolean);

  const controlIds = (controls.data ?? []).map((r) => {
    const c = Array.isArray(r.control) ? r.control[0] : r.control;
    return c?.id as string;
  }).filter(Boolean);

  let findings: { id: string; title: string }[] = [];
  let supportingEvidence: { id: string; title: string; control_id: string }[] = [];
  if (controlIds.length) {
    const { data: fnd } = await supabase
      .from('finding_control_links')
      .select('finding:findings(id, title)')
      .eq('organisation_id', organisationId)
      .in('control_id', controlIds);
    findings = pick(fnd as { finding: unknown }[], 'finding') as { id: string; title: string }[];
    const { data: evCtrl } = await supabase
      .from('evidence_control_links')
      .select('control_id, evidence:evidence_items(id, title)')
      .eq('organisation_id', organisationId)
      .in('control_id', controlIds);
    const directIds = new Set(
      (directEvidence.data ?? []).map((r) => {
        const e = Array.isArray(r.evidence) ? r.evidence[0] : r.evidence;
        return e?.id as string;
      }),
    );
    supportingEvidence = (evCtrl ?? [])
      .map((row) => {
        const e = Array.isArray(row.evidence) ? row.evidence[0] : row.evidence;
        if (!e?.id || directIds.has(e.id)) return null;
        return { id: e.id, title: e.title, control_id: row.control_id };
      })
      .filter(Boolean) as { id: string; title: string; control_id: string }[];
  }

  return {
    upstream,
    policies: pick(policies.data as { policy: unknown }[], 'policy'),
    risks: pick(risks.data as { risk: unknown }[], 'risk'),
    controls: pick(controls.data as { control: unknown }[], 'control'),
    actions: pick(actions.data as { action: unknown }[], 'action'),
    directEvidence: pick(directEvidence.data as { evidence: unknown }[], 'evidence'),
    supportingEvidence,
    findings,
    assurance: pick(assurance.data as { assurance: unknown }[], 'assurance'),
  };
}
