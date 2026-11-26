import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { parseLabRiskCreateBody } from '@/lib/ri/lab-api/lab-link-write';
import { assertLabRiskWritesEnabled } from '@/lib/ri/lab-api/lab-connected-writes';
import { createRisk, listRisks } from '@/lib/ri/services/risks';
import { mapRiskRowToLabView } from '@/lib/ri/lab-api/lab-governance-view';
import {
  emptyLabScopeMeta,
  mergeExcluded,
  parseLabDataScope,
  scopeRegister,
} from '@/lib/ri/lab-api/lab-data-scope';
import {
  partitionRisksForLabScope,
  riskLabProvenanceInputFromRow,
} from '@/lib/ri/lab-api/risk-control-lab-provenance';

export async function GET(request: Request) {
  try {
    const ctx = await requireRiContext('risk:read');
    const scope = parseLabDataScope(new URL(request.url));
    const scopeMeta = emptyLabScopeMeta(scope);
    const rowsRaw = await listRisks(ctx.supabase, ctx.organisationId);
    const partition = partitionRisksForLabScope(rowsRaw, scope, (r) => riskLabProvenanceInputFromRow(r));
    const scoped = scopeRegister(scope, rowsRaw, partition);
    mergeExcluded(scopeMeta, 'risks', partition.excludedFromOperationalCount);
    if (scope === 'operational' && scoped.authorisedUat.length > 0) {
      mergeExcluded(scopeMeta, 'riskUatAuthorised', scoped.authorisedUat.length);
    }
    const toView = (r: (typeof rowsRaw)[number]) => mapRiskRowToLabView(r as Record<string, unknown>);
    return NextResponse.json({
      ok: true,
      total: scoped.primary.length,
      tenantScope: true,
      ...scopeMeta,
      riskProvenance: scoped.provenance,
      risks: scoped.primary.map(toView),
      authorisedUatRisks: scoped.authorisedUat.map(toView),
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRiContext('risk:write');
    assertLabRiskWritesEnabled(ctx.role);
    const fields = parseLabRiskCreateBody(await request.json());
    const row = await createRisk(ctx.supabase, {
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      role: ctx.role,
      fields,
    });
    return NextResponse.json(
      { ok: true, risk: mapRiskRowToLabView(row as Record<string, unknown>) },
      { status: 201 },
    );
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
