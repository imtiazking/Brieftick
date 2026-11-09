import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { mapAssuranceRowToLabView, parseLabRowMetadata } from '@/lib/ri/lab-api/lab-governance-view';
import { assertLabAssuranceWritesEnabled } from '@/lib/ri/lab-api/lab-connected-writes';
import { parseLabAssurancePatchBody } from '@/lib/ri/lab-api/lab-link-write';
import { getAssuranceDetail, updateAssuranceReview } from '@/lib/ri/services/assurance';
import { parseUuid } from '@/lib/ri/validation';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await requireRiContext('assurance:read');
    const detail = await getAssuranceDetail(ctx.supabase, ctx.organisationId, id);
    const assurance = mapAssuranceRowToLabView(detail.review as Record<string, unknown>);
    const meta =
      parseLabRowMetadata((detail.review as { metadata?: unknown })?.metadata) ?? null;
    const parentControlId =
      typeof meta?.parentControlId === 'string' ? meta.parentControlId : assurance.parentControlId;
    const linkedControls: Array<{ id: string; name: string }> = [];
    for (const c of detail.controls ?? []) {
      if (c?.id) linkedControls.push({ id: String(c.id), name: String((c as { name?: string }).name ?? '') });
    }
    if (!linkedControls.length && parentControlId) {
      const { data: ctrl } = await ctx.supabase
        .from('controls')
        .select('id, name')
        .eq('organisation_id', ctx.organisationId)
        .eq('id', parentControlId)
        .maybeSingle();
      if (ctrl?.id) {
        linkedControls.push({ id: String(ctrl.id), name: String(ctrl.name ?? '') });
      } else {
        linkedControls.push({ id: parentControlId, name: '' });
      }
    }
    return NextResponse.json({
      ok: true,
      assuranceReview: {
        ...assurance,
        parentControlId,
        controlIds: linkedControls.map((c) => c.id),
        linkedControls,
      },
      linkedControls,
      detail: detail.review,
      controls: detail.controls ?? [],
      obligations: detail.obligations ?? [],
      findings: detail.findings ?? [],
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawId } = await params;
    const assuranceId = parseUuid(rawId, 'assurance_review_id');
    const ctx = await requireRiContext('assurance:write');
    assertLabAssuranceWritesEnabled(ctx.role);
    const patch = parseLabAssurancePatchBody(await request.json());
    const row = await updateAssuranceReview(ctx.supabase, {
      organisationId: ctx.organisationId,
      assuranceId,
      userId: ctx.userId,
      fields: patch.fields,
      expectedUpdatedAt: patch.expectedUpdatedAt,
    });
    return NextResponse.json(
      {
        ok: true,
        assuranceReview: mapAssuranceRowToLabView(row as Record<string, unknown>),
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
