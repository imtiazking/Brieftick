import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { isOperationalDashboardProvenance, resolveRecordProvenance } from '@/lib/ri/record-provenance';
import {
  controlLabProvenanceInputFromRow,
  partitionControlsForLabScope,
  partitionRisksForLabScope,
  riskLabProvenanceInputFromRow,
} from '@/lib/ri/lab-api/risk-control-lab-provenance';

export type RiskControlsOperationalReport = {
  generatedAt: string;
  dataPopulation: 'operational';
  risks: {
    total: number;
    byStatus: Record<string, number>;
    withOwner: number;
    overdueReview: number;
    inherentHigh: number;
    residualHigh: number;
  };
  controls: {
    total: number;
    byStatus: Record<string, number>;
    withOwner: number;
    effectiveCount: number;
    ineffectiveCount: number;
  };
  assurance: {
    total: number;
    notTested: number;
    pass: number;
    fail: number;
    inReview: number;
  };
  remediation: {
    openActions: number;
    overdueActions: number;
    openFindings: number;
  };
  evidence: {
    items: number;
    linkedToControl: number;
  };
  ownershipGaps: {
    risksWithoutOwner: number;
    controlsWithoutOwner: number;
  };
};

function countByStatus(rows: { status?: string | null }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = r.status || 'UNKNOWN';
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

export async function getRiskControlsOperationalReport(
  supabase: SupabaseClient,
  organisationId: string,
): Promise<RiskControlsOperationalReport> {
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: riskRows }, { data: controlRows }, assuranceRes, actionsRes, findingsRes, evidenceRes, linksRes] =
    await Promise.all([
      supabase
        .from('risks')
        .select('id, status, owner_user_id, inherent_risk, residual_risk, review_date, title, metadata')
        .eq('organisation_id', organisationId),
      supabase
        .from('controls')
        .select('id, status, owner_user_id, effectiveness, testing_status, name, metadata')
        .eq('organisation_id', organisationId),
      supabase
        .from('assurance_reviews')
        .select('id, status, result, metadata')
        .eq('organisation_id', organisationId),
      supabase.from('actions').select('id, status, due_date, metadata').eq('organisation_id', organisationId),
      supabase.from('findings').select('id, status, title, metadata').eq('organisation_id', organisationId),
      supabase.from('evidence_items').select('id, title, metadata').eq('organisation_id', organisationId),
      supabase.from('evidence_control_links').select('evidence_id, control_id').eq('organisation_id', organisationId),
    ]);

  const risks = partitionRisksForLabScope(riskRows ?? [], 'operational', (r) =>
    riskLabProvenanceInputFromRow(r),
  ).operational;
  const controls = partitionControlsForLabScope(controlRows ?? [], 'operational', (r) =>
    controlLabProvenanceInputFromRow(r),
  ).operational;

  let assurance = assuranceRes.data ?? [];
  let actions = actionsRes.data ?? [];
  let findings = findingsRes.data ?? [];
  let evidence = evidenceRes.data ?? [];

  const filterOperational = (row: { title?: string | null; metadata?: Record<string, unknown> | null }) =>
    isOperationalDashboardProvenance(resolveRecordProvenance({ title: row.title ?? undefined, metadata: row.metadata }));

  assurance = assurance.filter(filterOperational);
  actions = actions.filter(filterOperational);
  findings = findings.filter(filterOperational);
  evidence = evidence.filter(filterOperational);

  const overdueReview = risks.filter(
    (r) => r.review_date && String(r.review_date).slice(0, 10) < today,
  ).length;
  const inherentHigh = risks.filter((r) => /high|critical/i.test(String(r.inherent_risk || ''))).length;
  const residualHigh = risks.filter((r) => /high|critical/i.test(String(r.residual_risk || ''))).length;

  const effectiveCount = controls.filter((c) => /effective/i.test(String(c.effectiveness || ''))).length;
  const ineffectiveCount = controls.filter((c) => /ineffective|weak/i.test(String(c.effectiveness || ''))).length;

  const openActions = actions.filter((a) => a.status === 'OPEN' || a.status === 'IN_PROGRESS').length;
  const overdueActions = actions.filter(
    (a) =>
      (a.status === 'OPEN' || a.status === 'IN_PROGRESS') &&
      a.due_date &&
      String(a.due_date).slice(0, 10) < today,
  ).length;
  const openFindings = findings.filter((f) => f.status === 'OPEN' || f.status === 'IN_PROGRESS').length;

  const linkedEvidenceIds = new Set((linksRes.data ?? []).map((l) => l.evidence_id));

  return {
    generatedAt: new Date().toISOString(),
    dataPopulation: 'operational',
    risks: {
      total: risks.length,
      byStatus: countByStatus(risks),
      withOwner: risks.filter((r) => r.owner_user_id).length,
      overdueReview,
      inherentHigh,
      residualHigh,
    },
    controls: {
      total: controls.length,
      byStatus: countByStatus(controls),
      withOwner: controls.filter((c) => c.owner_user_id).length,
      effectiveCount,
      ineffectiveCount,
    },
    assurance: {
      total: assurance.length,
      notTested: assurance.filter((a) => a.result === 'NOT_TESTED').length,
      pass: assurance.filter((a) => a.result === 'PASS').length,
      fail: assurance.filter((a) => a.result === 'FAIL').length,
      inReview: assurance.filter((a) => a.status === 'IN_REVIEW').length,
    },
    remediation: {
      openActions,
      overdueActions,
      openFindings,
    },
    evidence: {
      items: evidence.length,
      linkedToControl: evidence.filter((e) => linkedEvidenceIds.has(e.id)).length,
    },
    ownershipGaps: {
      risksWithoutOwner: risks.filter((r) => !r.owner_user_id).length,
      controlsWithoutOwner: controls.filter((c) => !c.owner_user_id).length,
    },
  };
}