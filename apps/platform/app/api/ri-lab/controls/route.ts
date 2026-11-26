import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { parseLabControlCreateBody } from '@/lib/ri/lab-api/lab-link-write';
import { assertLabControlWritesEnabled } from '@/lib/ri/lab-api/lab-connected-writes';
import { createControl, listControls } from '@/lib/ri/services/controls';
import { mapControlRowToLabView } from '@/lib/ri/lab-api/lab-governance-view';
import {
  emptyLabScopeMeta,
  mergeExcluded,
  parseLabDataScope,
  scopeRegister,
} from '@/lib/ri/lab-api/lab-data-scope';
import {
  controlLabProvenanceInputFromRow,
  partitionControlsForLabScope,
} from '@/lib/ri/lab-api/risk-control-lab-provenance';

export async function GET(request: Request) {
  try {
    const ctx = await requireRiContext('control:read');
    const scope = parseLabDataScope(new URL(request.url));
    const scopeMeta = emptyLabScopeMeta(scope);
    const rowsRaw = await listControls(ctx.supabase, ctx.organisationId);
    const partition = partitionControlsForLabScope(rowsRaw, scope, (c) => controlLabProvenanceInputFromRow(c));
    const scoped = scopeRegister(scope, rowsRaw, partition);
    mergeExcluded(scopeMeta, 'controls', partition.excludedFromOperationalCount);
    if (scope === 'operational' && scoped.authorisedUat.length > 0) {
      mergeExcluded(scopeMeta, 'controlUatAuthorised', scoped.authorisedUat.length);
    }
    const toView = (r: (typeof rowsRaw)[number]) => mapControlRowToLabView(r as Record<string, unknown>);
    return NextResponse.json({
      ok: true,
      total: scoped.primary.length,
      tenantScope: true,
      ...scopeMeta,
      controlProvenance: scoped.provenance,
      controls: scoped.primary.map(toView),
      authorisedUatControls: scoped.authorisedUat.map(toView),
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRiContext('control:write');
    assertLabControlWritesEnabled(ctx.role);
    const fields = parseLabControlCreateBody(await request.json());
    const row = await createControl(ctx.supabase, {
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      role: ctx.role,
      fields,
    });
    return NextResponse.json(
      { ok: true, control: mapControlRowToLabView(row as Record<string, unknown>) },
      { status: 201 },
    );
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
