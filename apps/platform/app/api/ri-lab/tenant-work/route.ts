import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { canRi } from '@/lib/ri/permissions';
import {
  changeLabProvenanceInputFromRow,
  partitionChangesForLabScope,
} from '@/lib/ri/lab-api/change-lab-provenance';
import {
  obligationLabProvenanceInputFromRow,
  partitionObligationsForLabScope,
} from '@/lib/ri/lab-api/obligation-lab-provenance';
import {
  impactLabProvenanceInputFromRow,
  partitionImpactsForLabScope,
} from '@/lib/ri/lab-api/impact-lab-provenance';
import {
  emptyLabScopeMeta,
  mergeExcluded,
  parseLabDataScope,
} from '@/lib/ri/lab-api/lab-data-scope';
import {
  controlLabProvenanceInputFromRow,
  partitionControlsForLabScope,
  partitionRisksForLabScope,
  riskLabProvenanceInputFromRow,
} from '@/lib/ri/lab-api/risk-control-lab-provenance';
import { listChanges } from '@/lib/ri/services/changes';
import { listControls } from '@/lib/ri/services/controls';
import { listImpactAssessments } from '@/lib/ri/services/impact';
import { listObligations } from '@/lib/ri/services/obligations';
import { listRisks } from '@/lib/ri/services/risks';
import {
  mapChangeRowToLabWorkView,
  mapImpactRowToLabView,
  mapObligationRowToLabView,
} from '@/lib/ri/lab-api/lab-work-view';
import { mapControlRowToLabView, mapRiskRowToLabView } from '@/lib/ri/lab-api/lab-governance-view';

async function applicabilityByPublication(
  supabase: Awaited<ReturnType<typeof requireRiContext>>['supabase'],
  organisationId: string,
  publicationIds: string[],
) {
  if (!publicationIds.length) return new Map<string, { recommendation?: string; status?: string }>();
  const { data } = await supabase
    .from('applicability_assessments')
    .select('publication_id, recommendation, status')
    .eq('organisation_id', organisationId)
    .in('publication_id', publicationIds)
    .order('updated_at', { ascending: false });
  const map = new Map<string, { recommendation?: string; status?: string }>();
  for (const row of data ?? []) {
    if (!map.has(row.publication_id)) {
      map.set(row.publication_id, {
        recommendation: row.recommendation,
        status: row.status,
      });
    }
  }
  return map;
}

function publicationIdFromRow(row: {
  publication_id?: string;
  publication?: { id?: string } | { id?: string }[] | null;
}) {
  const pub = Array.isArray(row.publication) ? row.publication[0] : row.publication;
  return (pub as { id?: string } | null)?.id || row.publication_id || '';
}

function mapChangeRows(
  rows: Awaited<ReturnType<typeof listChanges>>,
  appMap: Map<string, { recommendation?: string; status?: string }>,
) {
  return rows.map((row) => {
    const pub = Array.isArray(row.publication) ? row.publication[0] : row.publication;
    const publicationId = publicationIdFromRow(row);
    return mapChangeRowToLabWorkView({
      ...row,
      publication: pub,
      applicability: publicationId ? appMap.get(publicationId) ?? null : null,
    });
  });
}

export async function GET(request: Request) {
  try {
    const ctx = await requireRiContext('change:read');
    const scope = parseLabDataScope(new URL(request.url));
    const scopeMeta = emptyLabScopeMeta(scope);

    const [changeRowsRaw, impactRowsRaw, obligationRowsRaw, riskRowsRaw, controlRowsRaw] = await Promise.all([
      listChanges(ctx.supabase, ctx.organisationId),
      listImpactAssessments(ctx.supabase, ctx.organisationId),
      listObligations(ctx.supabase, ctx.organisationId),
      canRi(ctx.role, 'risk:read') ? listRisks(ctx.supabase, ctx.organisationId) : Promise.resolve([]),
      canRi(ctx.role, 'control:read') ? listControls(ctx.supabase, ctx.organisationId) : Promise.resolve([]),
    ]);

    const changePartition = partitionChangesForLabScope(changeRowsRaw, scope, (r) =>
      changeLabProvenanceInputFromRow(r),
    );
    const changeRows = changePartition.operational;
    const exChanges = changePartition.excludedFromOperationalCount;

    const impactPartition = partitionImpactsForLabScope(impactRowsRaw, scope, (r) =>
      impactLabProvenanceInputFromRow(r),
    );
    const impactRows = impactPartition.operational;
    const exImpacts = impactPartition.excludedFromOperationalCount;
    const obligationPartition = partitionObligationsForLabScope(obligationRowsRaw, scope, (r) =>
      obligationLabProvenanceInputFromRow(r),
    );
    const obligationRows = obligationPartition.operational;
    const exObl = obligationPartition.excludedFromOperationalCount;

    const riskPartition = partitionRisksForLabScope(riskRowsRaw, scope, (r) => riskLabProvenanceInputFromRow(r));
    const riskRows = riskPartition.operational;
    const exRisks = riskPartition.excludedFromOperationalCount;

    const controlPartition = partitionControlsForLabScope(controlRowsRaw, scope, (c) =>
      controlLabProvenanceInputFromRow(c),
    );
    const controlRows = controlPartition.operational;
    const exControls = controlPartition.excludedFromOperationalCount;

    mergeExcluded(scopeMeta, 'changes', exChanges);
    if (changePartition.syntheticUat.length > 0) {
      mergeExcluded(scopeMeta, 'changeSyntheticUat', changePartition.syntheticUat.length);
    }
    if (scope === 'operational' && changePartition.authorisedUat.length > 0) {
      mergeExcluded(scopeMeta, 'changeUatAuthorised', changePartition.authorisedUat.length);
    }
    if (scope === 'operational' && changePartition.unverified.length > 0) {
      mergeExcluded(scopeMeta, 'changeUnverified', changePartition.unverified.length);
    }
    mergeExcluded(scopeMeta, 'impactAssessments', exImpacts);
    if (scope === 'operational' && impactPartition.authorisedUat.length > 0) {
      mergeExcluded(scopeMeta, 'impactUatAuthorised', impactPartition.authorisedUat.length);
    }
    if (scope === 'operational' && impactPartition.unverified.length > 0) {
      mergeExcluded(scopeMeta, 'impactUnverified', impactPartition.unverified.length);
    }
    mergeExcluded(scopeMeta, 'obligations', exObl);
    if (scope === 'operational' && obligationPartition.authorisedUat.length > 0) {
      mergeExcluded(scopeMeta, 'obligationUatAuthorised', obligationPartition.authorisedUat.length);
    }
    if (scope === 'operational' && obligationPartition.unverified.length > 0) {
      mergeExcluded(scopeMeta, 'obligationUnverified', obligationPartition.unverified.length);
    }
    mergeExcluded(scopeMeta, 'risks', exRisks);
    if (scope === 'operational' && riskPartition.authorisedUat.length > 0) {
      mergeExcluded(scopeMeta, 'riskUatAuthorised', riskPartition.authorisedUat.length);
    }
    if (scope === 'operational' && riskPartition.unverified.length > 0) {
      mergeExcluded(scopeMeta, 'riskUnverified', riskPartition.unverified.length);
    }
    mergeExcluded(scopeMeta, 'controls', exControls);
    if (scope === 'operational' && controlPartition.authorisedUat.length > 0) {
      mergeExcluded(scopeMeta, 'controlUatAuthorised', controlPartition.authorisedUat.length);
    }
    if (scope === 'operational' && controlPartition.unverified.length > 0) {
      mergeExcluded(scopeMeta, 'controlUnverified', controlPartition.unverified.length);
    }

    const pubIds = [
      ...new Set(
        [...changePartition.operational, ...changePartition.authorisedUat, ...changePartition.unverified].map(
          (r) => publicationIdFromRow(r),
        ).filter(Boolean),
      ),
    ] as string[];

    const appMap = await applicabilityByPublication(ctx.supabase, ctx.organisationId, pubIds);

    const changes = mapChangeRows(changeRows, appMap);
    const authorisedUatChanges = mapChangeRows(changePartition.authorisedUat, appMap);
    const unverifiedAuditChanges = mapChangeRows(changePartition.unverified, appMap);

    const impactAssessments = impactRows.map((row) =>
      mapImpactRowToLabView({
        ...row,
        change: Array.isArray(row.change) ? row.change[0] : row.change,
      }),
    );
    const authorisedUatImpacts = impactPartition.authorisedUat.map((row) =>
      mapImpactRowToLabView({
        ...row,
        change: Array.isArray(row.change) ? row.change[0] : row.change,
      }),
    );

    const obligations = obligationRows.map((row) =>
      mapObligationRowToLabView({
        ...row,
        change: Array.isArray(row.change) ? row.change[0] : row.change,
        publication: Array.isArray(row.publication) ? row.publication[0] : row.publication,
      }),
    );
    const authorisedUatObligations = obligationPartition.authorisedUat.map((row) =>
      mapObligationRowToLabView({
        ...row,
        change: Array.isArray(row.change) ? row.change[0] : row.change,
        publication: Array.isArray(row.publication) ? row.publication[0] : row.publication,
      }),
    );

    const risks = riskRows.map((row) => mapRiskRowToLabView(row as Record<string, unknown>));
    const controls = controlRows.map((row) => mapControlRowToLabView(row as Record<string, unknown>));
    const authorisedUatRisks = riskPartition.authorisedUat.map((row) =>
      mapRiskRowToLabView(row as Record<string, unknown>),
    );
    const authorisedUatControls = controlPartition.authorisedUat.map((row) =>
      mapControlRowToLabView(row as Record<string, unknown>),
    );

    return NextResponse.json({
      ok: true,
      tenantScope: true,
      ...scopeMeta,
      changeCount: changes.length,
      changeProvenance: {
        operational: changePartition.operational.length,
        uatAuthorised: changePartition.authorisedUat.length,
        unverified: changePartition.unverified.length,
        syntheticUat: changePartition.syntheticUat.length,
      },
      impactAssessmentCount: impactAssessments.length,
      impactProvenance: {
        operational: impactPartition.operational.length,
        uatAuthorised: impactPartition.authorisedUat.length,
        unverified: impactPartition.unverified.length,
        syntheticUat: impactPartition.syntheticUat.length,
      },
      obligationCount: obligations.length,
      obligationProvenance: {
        operational: obligationPartition.operational.length,
        uatAuthorised: obligationPartition.authorisedUat.length,
        unverified: obligationPartition.unverified.length,
        syntheticUat: obligationPartition.syntheticUat.length,
      },
      riskCount: risks.length,
      controlCount: controls.length,
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
      changes,
      authorisedUatChanges,
      unverifiedAuditChanges,
      impactAssessments,
      authorisedUatImpacts,
      obligations,
      authorisedUatObligations,
      risks,
      controls,
      authorisedUatRisks,
      authorisedUatControls,
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
