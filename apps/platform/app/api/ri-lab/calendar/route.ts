import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { buildLabCalendar, parseCalendarWindow } from '@/lib/ri/lab-api/lab-calendar';
import { emptyLabScopeMeta, mergeExcluded, parseLabDataScope } from '@/lib/ri/lab-api/lab-data-scope';
import { listImpactAssessments } from '@/lib/ri/services/impact';
import { listObligations } from '@/lib/ri/services/obligations';
import { listRiActions } from '@/lib/ri/services/ri-actions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ri-lab/calendar?window=30|90|180|365&dataScope=operational|all
 * Tenant regulatory calendar: obligation effective/due dates, impact assessment due dates, action due dates, plus
 * catalogue publication dates (effective, consultation deadline, published). Tenant rows are RLS-scoped; the data
 * scope only partitions them by provenance, exactly as every other Design Lab register.
 */
export async function GET(request: Request) {
  try {
    const ctx = await requireRiContext('ri:read');
    const url = new URL(request.url);
    const scope = parseLabDataScope(url);
    const window = parseCalendarWindow(url.searchParams.get('window'));
    const from = new Date().toISOString().slice(0, 10);

    const [pubsRes, obligations, impacts, actions] = await Promise.all([
      ctx.supabase
        .from('regulatory_publications')
        .select('id, title, publication_date, effective_date, consultation_deadline')
        .limit(400),
      listObligations(ctx.supabase, ctx.organisationId),
      listImpactAssessments(ctx.supabase, ctx.organisationId),
      listRiActions(ctx.supabase, ctx.organisationId),
    ]);
    if (pubsRes.error) throw new Error(pubsRes.error.message);

    const calendar = buildLabCalendar(
      {
        publications: (pubsRes.data ?? []) as Array<Record<string, unknown> & { id: string }>,
        obligations: obligations as unknown as Array<Record<string, unknown> & { id: string }>,
        impacts: impacts as unknown as Array<Record<string, unknown> & { id: string }>,
        actions: actions as unknown as Array<Record<string, unknown> & { id: string }>,
      },
      { organisationId: ctx.organisationId, scope, from, window },
    );

    const scopeMeta = emptyLabScopeMeta(scope);
    if (scope === 'operational') {
      mergeExcluded(scopeMeta, 'calendarUatAuthorised', calendar.provenance.uatAuthorised);
    }
    return NextResponse.json({
      ok: true,
      tenantScope: true,
      ...scopeMeta,
      window: calendar.window,
      from: calendar.from,
      to: calendar.to,
      total: calendar.events.length,
      events: calendar.events,
      calendarProvenance: calendar.provenance,
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
