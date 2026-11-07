import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import {
  emptyLabScopeMeta,
  mergeExcluded,
  parseLabDataScope,
} from '@/lib/ri/lab-api/lab-data-scope';
import {
  impactLabProvenanceInputFromRow,
  partitionImpactsForLabScope,
} from '@/lib/ri/lab-api/impact-lab-provenance';
import { parseLabImpactCreateBody } from '@/lib/ri/lab-api/lab-work-write';
import { assertLabImpactWritesEnabled } from '@/lib/ri/lab-api/lab-connected-writes';
import { createImpactAssessment, listImpactAssessments } from '@/lib/ri/services/impact';
import { mapImpactRowToLabView } from '@/lib/ri/lab-api/lab-work-view';
import { RiValidationError } from '@/lib/ri/errors';

function mapImpactListRow(row: Awaited<ReturnType<typeof listImpactAssessments>>[number]) {
  const change = Array.isArray(row.change) ? row.change[0] : row.change;
  return mapImpactRowToLabView({ ...row, change });
}

export async function GET(request: Request) {
  try {
    const ctx = await requireRiContext('impact:read');
    const scope = parseLabDataScope(new URL(request.url));
    const scopeMeta = emptyLabScopeMeta(scope);
    const rows = await listImpactAssessments(ctx.supabase, ctx.organisationId);
    const partition = partitionImpactsForLabScope(rows, scope, (r) =>
      impactLabProvenanceInputFromRow(r),
    );
    mergeExcluded(scopeMeta, 'impactAssessments', partition.excludedFromOperationalCount);
    if (scope === 'operational' && partition.authorisedUat.length > 0) {
      mergeExcluded(scopeMeta, 'impactUatAuthorised', partition.authorisedUat.length);
    }
    const listRows = scope === 'operational' ? partition.operational : rows;
    const impactAssessments = listRows.map(mapImpactListRow);
    const authorisedUatImpacts = partition.authorisedUat.map(mapImpactListRow);

    return NextResponse.json({
      ok: true,
      total: impactAssessments.length,
      tenantScope: true,
      ...scopeMeta,
      impactProvenance: {
        operational: partition.operational.length,
        uatAuthorised: partition.authorisedUat.length,
        unverified: partition.unverified.length,
        syntheticUat: partition.syntheticUat.length,
      },
      impactAssessments,
      authorisedUatImpacts,
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRiContext('impact:write');
    assertLabImpactWritesEnabled(ctx.role);
    const raw = await request.json();
    if (raw && typeof raw === 'object') {
      const body = raw as Record<string, unknown>;
      if ('metadata' in body || 'recordProvenance' in body || 'dataProvenance' in body) {
        throw new RiValidationError('client_provenance_not_allowed');
      }
    }
    const input = parseLabImpactCreateBody(raw);
    const row = await createImpactAssessment(ctx.supabase, {
      organisationId: ctx.organisationId,
      regulatoryChangeId: input.regulatoryChangeId,
      userId: ctx.userId,
      role: ctx.role,
    });
    const { data: withJoin } = await ctx.supabase
      .from('impact_assessments')
      .select(
        `
        id, status, materiality, due_date, owner_user_id, reviewer_user_id, approver_user_id,
        regulatory_change_id, metadata,
        change:regulatory_changes(id, title, description, external_key, origin, publication_id, metadata)
      `,
      )
      .eq('id', row.id)
      .single();
    const lab = mapImpactListRow(withJoin ?? row);
    return NextResponse.json({ ok: true, assessment: lab }, { status: 201 });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
