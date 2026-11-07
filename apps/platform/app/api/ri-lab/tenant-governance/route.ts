import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { canRi } from '@/lib/ri/permissions';
import {
  emptyLabScopeMeta,
  filterRowsByLabDataScope,
  filterWorkflowEventsForScope,
  mergeExcluded,
  parseLabDataScope,
} from '@/lib/ri/lab-api/lab-data-scope';
import {
  aiRunLabProvenanceInputFromRow,
  isSyntheticAiAnalysisFixture,
  partitionAiAnalysisRunsForLabScope,
} from '@/lib/ri/lab-api/ai-run-lab-provenance';
import { isSyntheticUatRecord } from '@/lib/ri/uat-record-provenance';
import {
  partitionControlsForLabScope,
  partitionEvidenceForLabScope,
  partitionRisksForLabScope,
  controlLabProvenanceInputFromRow,
  riskLabProvenanceInputFromRow,
} from '@/lib/ri/lab-api/risk-control-lab-provenance';
import { listAnalysisRuns } from '@/lib/ri/services/ai-analysis';
import { listAssuranceReviews } from '@/lib/ri/services/assurance';
import { listControls } from '@/lib/ri/services/controls';
import { getDashboardSummary } from '@/lib/ri/services/dashboard';
import { listEvidence } from '@/lib/ri/services/evidence';
import { listFindings } from '@/lib/ri/services/findings';
import { listWorkflowEvents } from '@/lib/ri/services/governance';
import { listImpactAssessments } from '@/lib/ri/services/impact';
import { listPolicies } from '@/lib/ri/services/policies';
import { listRiActions } from '@/lib/ri/services/ri-actions';
import { listRisks } from '@/lib/ri/services/risks';
import {
  buildLabGovernanceMetrics,
  mapActionRowToLabView,
  mapAiRunToLabView,
  mapAssuranceRowToLabView,
  mapControlRowToLabView,
  mapEvidenceRowToLabView,
  mapFindingRowToLabView,
  mapPolicyRowToLabView,
  mapRiskRowToLabView,
  mapWorkflowEventToLabView,
} from '@/lib/ri/lab-api/lab-governance-view';

export async function GET(request: Request) {
  try {
    const ctx = await requireRiContext('ri:read');
    const { supabase, organisationId, role } = ctx;
    const scope = parseLabDataScope(new URL(request.url));
    const scopeMeta = emptyLabScopeMeta(scope);
    const excludeSynthetic = scope === 'operational';

    const [
      summary,
      workflowEventsRaw,
      impactRowsRaw,
      riskRowsRaw,
      controlRowsRaw,
      policyRowsRaw,
      evidenceRowsRaw,
      findingRowsRaw,
      assuranceRowsRaw,
      actionRowsRaw,
      aiRunsRaw,
    ] = await Promise.all([
      getDashboardSummary(supabase, organisationId, undefined, { excludeSyntheticUat: excludeSynthetic }),
      listWorkflowEvents(supabase, organisationId, 100),
      canRi(role, 'impact:read')
        ? listImpactAssessments(supabase, organisationId)
        : Promise.resolve([]),
      canRi(role, 'risk:read') ? listRisks(supabase, organisationId) : Promise.resolve([]),
      canRi(role, 'control:read') ? listControls(supabase, organisationId) : Promise.resolve([]),
      canRi(role, 'policy:read') ? listPolicies(supabase, organisationId) : Promise.resolve([]),
      canRi(role, 'evidence:read') ? listEvidence(supabase, organisationId) : Promise.resolve([]),
      canRi(role, 'finding:read') ? listFindings(supabase, organisationId) : Promise.resolve([]),
      canRi(role, 'assurance:read')
        ? listAssuranceReviews(supabase, organisationId)
        : Promise.resolve([]),
      canRi(role, 'action:read') ? listRiActions(supabase, organisationId) : Promise.resolve([]),
      canRi(role, 'ai:read') ? listAnalysisRuns(supabase, organisationId, 30) : Promise.resolve([]),
    ]);

    const syntheticEntityIds = new Set<string>();
    if (excludeSynthetic) {
      for (const r of impactRowsRaw) {
        const ch = Array.isArray(r.change) ? r.change[0] : r.change;
        if (isSyntheticUatRecord({ title: ch?.title })) syntheticEntityIds.add(r.id);
      }
      for (const r of policyRowsRaw) {
        if (isSyntheticUatRecord({ name: r.name, title: r.name })) syntheticEntityIds.add(r.id);
      }
      for (const r of findingRowsRaw) {
        if (isSyntheticUatRecord({ title: r.title })) syntheticEntityIds.add(r.id);
      }
      for (const r of assuranceRowsRaw) {
        if (isSyntheticUatRecord({ title: r.review_type })) syntheticEntityIds.add(r.id);
      }
      for (const r of actionRowsRaw) {
        if (isSyntheticUatRecord({ title: r.title })) syntheticEntityIds.add(r.id);
      }
      for (const r of aiRunsRaw) {
        if (isSyntheticAiAnalysisFixture(aiRunLabProvenanceInputFromRow(r))) {
          syntheticEntityIds.add(r.id);
        }
      }
    }

    const aiPartition = partitionAiAnalysisRunsForLabScope(aiRunsRaw, scope, (r) =>
      aiRunLabProvenanceInputFromRow(r),
    );
    const aiRuns = scope === 'operational' ? aiPartition.operational : aiRunsRaw;
    const exAi = aiPartition.excludedFromOperationalCount;

    const { rows: impactRows, excludedSyntheticCount: exImpacts } = filterRowsByLabDataScope(
      impactRowsRaw,
      scope,
      (r) => {
        const ch = Array.isArray(r.change) ? r.change[0] : r.change;
        return { title: ch?.title };
      },
    );
    const riskPartition = partitionRisksForLabScope(riskRowsRaw, scope, (r) => riskLabProvenanceInputFromRow(r));
    const riskRows = scope === 'operational' ? riskPartition.operational : riskRowsRaw;
    const exRisks = riskPartition.excludedFromOperationalCount;

    const controlPartition = partitionControlsForLabScope(controlRowsRaw, scope, (r) =>
      controlLabProvenanceInputFromRow(r),
    );
    const controlRows = scope === 'operational' ? controlPartition.operational : controlRowsRaw;
    const exControls = controlPartition.excludedFromOperationalCount;

    const evidencePartition = partitionEvidenceForLabScope(evidenceRowsRaw, scope, (r) =>
      riskLabProvenanceInputFromRow(r),
    );
    const { rows: policyRows, excludedSyntheticCount: exPolicies } = filterRowsByLabDataScope(
      policyRowsRaw,
      scope,
      (r) => ({ name: r.name, title: r.name }),
    );
    const evidenceRows = scope === 'operational' ? evidencePartition.operational : evidenceRowsRaw;
    const exEvidence = evidencePartition.excludedFromOperationalCount;
    const { rows: findingRows, excludedSyntheticCount: exFindings } = filterRowsByLabDataScope(
      findingRowsRaw,
      scope,
      (r) => ({ title: r.title }),
    );
    const { rows: assuranceRows, excludedSyntheticCount: exAssurance } = filterRowsByLabDataScope(
      assuranceRowsRaw,
      scope,
      (r) => ({ title: r.review_type }),
    );
    const { rows: actionRows, excludedSyntheticCount: exActions } = filterRowsByLabDataScope(
      actionRowsRaw,
      scope,
      (r) => ({ title: r.title }),
    );
    mergeExcluded(scopeMeta, 'impactAssessments', exImpacts);
    mergeExcluded(scopeMeta, 'risks', exRisks);
    mergeExcluded(scopeMeta, 'controls', exControls);
    mergeExcluded(scopeMeta, 'policies', exPolicies);
    mergeExcluded(scopeMeta, 'evidence', exEvidence);
    mergeExcluded(scopeMeta, 'findings', exFindings);
    mergeExcluded(scopeMeta, 'assuranceReviews', exAssurance);
    mergeExcluded(scopeMeta, 'actions', exActions);
    mergeExcluded(scopeMeta, 'aiAnalysisRuns', exAi);
    if (aiPartition.syntheticFixtures.length > 0) {
      mergeExcluded(scopeMeta, 'aiAnalysisSyntheticFixtures', aiPartition.syntheticFixtures.length);
    }
    if (scope === 'operational' && aiPartition.authorisedUat.length > 0) {
      mergeExcluded(scopeMeta, 'aiAnalysisUatAuthorised', aiPartition.authorisedUat.length);
    }

    const { rows: workflowEvents, excludedSyntheticCount: exEvents } = filterWorkflowEventsForScope(
      workflowEventsRaw,
      scope,
      syntheticEntityIds,
    );
    mergeExcluded(scopeMeta, 'workflowEvents', exEvents);

    const impactsAwaitingReview = impactRows.filter((r) =>
      ['IN_REVIEW', 'DRAFT'].includes(String(r.status).toUpperCase()),
    ).length;
    const controlsRequiringTest = controlRows.filter((c) => {
      const ts = String(c.testing_status ?? '').toUpperCase();
      return !ts || ts === 'NOT_TESTED' || ts === 'OVERDUE' || ts === 'DUE';
    }).length;
    const risksOpen = riskRows.filter((r) => String(r.status).toUpperCase() !== 'CLOSED').length;

    const metrics = buildLabGovernanceMetrics({
      summary,
      impactsAwaitingReview,
      controlsRequiringTest,
      risksOpen,
      workflowEventCount: workflowEvents.length,
    });

    return NextResponse.json({
      ok: true,
      tenantScope: true,
      ...scopeMeta,
      governanceMetrics: metrics,
      riskCount: riskRows.length,
      controlCount: controlRows.length,
      policyCount: policyRows.length,
      evidenceCount: evidenceRows.length,
      findingCount: findingRows.length,
      assuranceReviewCount: assuranceRows.length,
      actionCount: actionRows.length,
      aiAnalysisRunCount: aiRuns.length,
      aiAnalysisProvenance: {
        operational: aiPartition.operational.length,
        uatAuthorised: aiPartition.authorisedUat.length,
        syntheticFixtures: aiPartition.syntheticFixtures.length,
        unclassified: aiPartition.unclassified.length,
      },
      workflowEventCount: workflowEvents.length,
      risks: riskRows.map((r) => mapRiskRowToLabView(r as Record<string, unknown>)),
      controls: controlRows.map((r) => mapControlRowToLabView(r as Record<string, unknown>)),
      policies: policyRows.map((r) => mapPolicyRowToLabView(r as Record<string, unknown>)),
      evidence: evidenceRows.map((r) => mapEvidenceRowToLabView(r as Record<string, unknown>)),
      findings: findingRows.map((r) => mapFindingRowToLabView(r as Record<string, unknown>)),
      assuranceReviews: assuranceRows.map((r) =>
        mapAssuranceRowToLabView(r as Record<string, unknown>),
      ),
      actions: actionRows.map((r) => mapActionRowToLabView(r as Record<string, unknown>)),
      workflowEvents: workflowEvents.map(mapWorkflowEventToLabView),
      aiAnalysisRuns: aiRuns.map((r) => mapAiRunToLabView(r)),
      authorisedUatAiAnalysisRuns: aiPartition.authorisedUat.map((r) => mapAiRunToLabView(r)),
      riskProvenance: {
        operational: riskPartition.operational.length,
        uatAuthorised: riskPartition.authorisedUat.length,
        unverified: riskPartition.unverified.length,
        syntheticUat: riskPartition.syntheticUat.length,
      },
      controlProvenance: {
        operational: controlPartition.operational.length,
        uatAuthorised: controlPartition.authorisedUat.length,
        unverified: controlPartition.unverified.length,
        syntheticUat: controlPartition.syntheticUat.length,
      },
      evidenceProvenance: {
        operational: evidencePartition.operational.length,
        uatAuthorised: evidencePartition.authorisedUat.length,
        unverified: evidencePartition.unverified.length,
        syntheticUat: evidencePartition.syntheticUat.length,
      },
      authorisedUatRisks: riskPartition.authorisedUat.map((r) => mapRiskRowToLabView(r as Record<string, unknown>)),
      authorisedUatControls: controlPartition.authorisedUat.map((r) =>
        mapControlRowToLabView(r as Record<string, unknown>),
      ),
      authorisedUatEvidence: evidencePartition.authorisedUat.map((r) =>
        mapEvidenceRowToLabView(r as Record<string, unknown>),
      ),
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
