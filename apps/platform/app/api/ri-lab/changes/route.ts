import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { parseLabChangeCreateBody } from '@/lib/ri/lab-api/lab-change-write';
import { assertLabChangeWritesEnabled } from '@/lib/ri/lab-api/lab-connected-writes';
import { assertChangeCreateModeAllowed } from '@/lib/ri/lab-api/change-create-provenance';
import {
  emptyLabScopeMeta,
  filterRowsByLabDataScope,
  mergeExcluded,
  parseLabDataScope,
} from '@/lib/ri/lab-api/lab-data-scope';
import { listChanges, createRegulatoryChange } from '@/lib/ri/services/changes';
import { mapChangeRowToLabWorkView } from '@/lib/ri/lab-api/lab-work-view';

export async function GET(request: Request) {
  try {
    const ctx = await requireRiContext('change:read');
    const scope = parseLabDataScope(new URL(request.url));
    const scopeMeta = emptyLabScopeMeta(scope);
    const rowsRaw = await listChanges(ctx.supabase, ctx.organisationId);
    const { rows, excludedSyntheticCount } = filterRowsByLabDataScope(rowsRaw, scope, (r) => ({
      title: r.title,
      description: r.description,
      externalKey: r.external_key,
    }));
    mergeExcluded(scopeMeta, 'changes', excludedSyntheticCount);
    const pubIds = [
      ...new Set(
        rows
          .map((r) => {
            const pub = Array.isArray(r.publication) ? r.publication[0] : r.publication;
            return (pub as { id?: string } | null)?.id || r.publication_id;
          })
          .filter(Boolean),
      ),
    ] as string[];
    const { data: appRows } = pubIds.length
      ? await ctx.supabase
          .from('applicability_assessments')
          .select('publication_id, recommendation, status')
          .eq('organisation_id', ctx.organisationId)
          .in('publication_id', pubIds)
          .order('updated_at', { ascending: false })
      : { data: [] };
    const appMap = new Map<string, { recommendation?: string; status?: string }>();
    for (const row of appRows ?? []) {
      if (!appMap.has(row.publication_id)) appMap.set(row.publication_id, row);
    }
    const changes = rows.map((row) => {
      const pub = Array.isArray(row.publication) ? row.publication[0] : row.publication;
      const publicationId = (pub as { id?: string } | null)?.id || row.publication_id;
      return mapChangeRowToLabWorkView({
        ...row,
        publication: pub,
        applicability: publicationId ? appMap.get(publicationId) ?? null : null,
      });
    });
    return NextResponse.json({
      ok: true,
      total: changes.length,
      tenantScope: true,
      ...scopeMeta,
      changes,
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRiContext('change:write');
    assertLabChangeWritesEnabled(ctx.role);
    const input = parseLabChangeCreateBody(await request.json());
    assertChangeCreateModeAllowed(ctx.role, input.creationMode);
    const row = await createRegulatoryChange(ctx.supabase, {
      organisationId: ctx.organisationId,
      publicationId: input.publicationId,
      userId: ctx.userId,
      title: input.title,
      description: input.description,
      changeType: input.changeType,
      materiality: input.materiality,
      effectiveDate: input.effectiveDate,
      implementationDeadline: input.implementationDeadline,
      status: input.status,
      creationMode: input.creationMode,
    });
    const labChange = mapChangeRowToLabWorkView({
      ...row,
      publication: null,
      applicability: null,
    });
    return NextResponse.json({ ok: true, change: labChange }, { status: 201 });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
