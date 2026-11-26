import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { mapAssuranceRowToLabView, withAssuranceControlLinks } from '@/lib/ri/lab-api/lab-governance-view';
import {
  emptyLabScopeMeta,
  mergeExcluded,
  parseLabDataScope,
  scopeRegister,
} from '@/lib/ri/lab-api/lab-data-scope';
import {
  assuranceLabProvenanceInputFromRow,
  partitionAssuranceReviewsForLabScope,
} from '@/lib/ri/lab-api/risk-control-lab-provenance';
import { assertLabAssuranceWritesEnabled } from '@/lib/ri/lab-api/lab-connected-writes';

export const dynamic = 'force-dynamic';
import { parseLabAssuranceCreateBody } from '@/lib/ri/lab-api/lab-link-write';
import {
  createAssuranceReview,
  getAssuranceDetail,
  listAssuranceControlLinks,
  listAssuranceReviews,
} from '@/lib/ri/services/assurance';

export async function GET(request: Request) {
  try {
    const ctx = await requireRiContext('assurance:read');
    const scope = parseLabDataScope(new URL(request.url));
    const scopeMeta = emptyLabScopeMeta(scope);
    const rowsRaw = await listAssuranceReviews(ctx.supabase, ctx.organisationId);
    const partition = partitionAssuranceReviewsForLabScope(rowsRaw, scope, (r) => assuranceLabProvenanceInputFromRow(r));
    const scoped = scopeRegister(scope, rowsRaw, partition);
    mergeExcluded(scopeMeta, 'assuranceReviews', partition.excludedFromOperationalCount);
    if (scope === 'operational' && scoped.authorisedUat.length > 0) {
      mergeExcluded(scopeMeta, 'assuranceUatAuthorised', scoped.authorisedUat.length);
    }
    const links = await listAssuranceControlLinks(
      ctx.supabase,
      ctx.organisationId,
      rowsRaw.map((r) => String(r.id)),
    );
    const toView = (r: (typeof rowsRaw)[number]) =>
      withAssuranceControlLinks(mapAssuranceRowToLabView(r as Record<string, unknown>), links.get(String(r.id)));
    return NextResponse.json({
      ok: true,
      total: scoped.primary.length,
      tenantScope: true,
      ...scopeMeta,
      assuranceProvenance: scoped.provenance,
      assuranceReviews: scoped.primary.map(toView),
      authorisedUatAssuranceReviews: scoped.authorisedUat.map(toView),
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRiContext('assurance:write');
    assertLabAssuranceWritesEnabled(ctx.role);
    const fields = parseLabAssuranceCreateBody(await request.json());
    const row = await createAssuranceReview(ctx.supabase, {
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      role: ctx.role,
      fields,
      defaultCreationMode: 'uat_authorised',
    });
    const detail = await getAssuranceDetail(ctx.supabase, ctx.organisationId, String(row.id));
    const assurance = mapAssuranceRowToLabView(detail.review as Record<string, unknown>);
    const linkedControls = (detail.controls ?? []).map((c) => ({
      id: String(c.id),
      name: String(c.name ?? ''),
    }));
    return NextResponse.json(
      {
        ok: true,
        assuranceReview: {
          ...assurance,
          controlIds: linkedControls.map((c) => c.id),
          linkedControls,
        },
        linkedControls,
      },
      { status: 201 },
    );
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
