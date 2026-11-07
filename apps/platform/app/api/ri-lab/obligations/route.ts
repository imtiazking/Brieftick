import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import {
  emptyLabScopeMeta,
  mergeExcluded,
  parseLabDataScope,
} from '@/lib/ri/lab-api/lab-data-scope';
import {
  obligationLabProvenanceInputFromRow,
  partitionObligationsForLabScope,
} from '@/lib/ri/lab-api/obligation-lab-provenance';
import { parseLabObligationCreateBody } from '@/lib/ri/lab-api/lab-work-write';
import { assertLabObligationWritesEnabled } from '@/lib/ri/lab-api/lab-connected-writes';
import { createObligation, listObligations } from '@/lib/ri/services/obligations';
import { mapObligationRowToLabView } from '@/lib/ri/lab-api/lab-work-view';
import { RiValidationError } from '@/lib/ri/errors';

function mapObligationListRow(row: Awaited<ReturnType<typeof listObligations>>[number]) {
  const change = Array.isArray(row.change) ? row.change[0] : row.change;
  const publication = Array.isArray(row.publication) ? row.publication[0] : row.publication;
  return mapObligationRowToLabView({ ...row, change, publication });
}

export async function GET(request: Request) {
  try {
    const ctx = await requireRiContext('obligation:read');
    const scope = parseLabDataScope(new URL(request.url));
    const scopeMeta = emptyLabScopeMeta(scope);
    const rows = await listObligations(ctx.supabase, ctx.organisationId);
    const partition = partitionObligationsForLabScope(rows, scope, (r) =>
      obligationLabProvenanceInputFromRow(r),
    );
    mergeExcluded(scopeMeta, 'obligations', partition.excludedFromOperationalCount);
    if (scope === 'operational' && partition.authorisedUat.length > 0) {
      mergeExcluded(scopeMeta, 'obligationUatAuthorised', partition.authorisedUat.length);
    }
    const listRows = scope === 'operational' ? partition.operational : rows;
    const obligations = listRows.map(mapObligationListRow);
    const authorisedUatObligations =
      scope === 'operational'
        ? partition.authorisedUat.map(mapObligationListRow)
        : partition.authorisedUat.map(mapObligationListRow);

    return NextResponse.json({
      ok: true,
      total: obligations.length,
      tenantScope: true,
      ...scopeMeta,
      obligationProvenance: {
        operational: partition.operational.length,
        uatAuthorised: partition.authorisedUat.length,
        unverified: partition.unverified.length,
        syntheticUat: partition.syntheticUat.length,
      },
      obligations,
      authorisedUatObligations,
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRiContext('obligation:write');
    assertLabObligationWritesEnabled(ctx.role);
    const raw = await request.json();
    if (raw && typeof raw === 'object') {
      const body = raw as Record<string, unknown>;
      if ('metadata' in body || 'recordProvenance' in body || 'dataProvenance' in body) {
        throw new RiValidationError('client_provenance_not_allowed');
      }
    }
    const input = parseLabObligationCreateBody(raw);
    const row = await createObligation(ctx.supabase, {
      organisationId: ctx.organisationId,
      regulatoryChangeId: input.regulatoryChangeId,
      userId: ctx.userId,
      obligationStatement: input.obligationStatement,
      citation: input.citation,
      priority: input.priority,
      dueDate: input.dueDate,
      status: input.status,
    });
    const { data: withJoin } = await ctx.supabase
      .from('regulatory_obligations')
      .select(
        `
        id, external_key, obligation_statement, status, priority, due_date, effective_date, owner_user_id,
        regulatory_change_id, publication_id, citation, metadata,
        change:regulatory_changes(id, title, external_key, origin, description, publication_id, metadata)
      `,
      )
      .eq('id', row.id)
      .single();
    const lab = mapObligationListRow(withJoin ?? row);
    return NextResponse.json({ ok: true, obligation: lab }, { status: 201 });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
