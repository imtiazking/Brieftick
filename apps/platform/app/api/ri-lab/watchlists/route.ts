import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { assertCanRi } from '@/lib/ri/permissions';
import { listWatchlists, upsertWatchlist, type WatchlistFilters } from '@/lib/ri/services/watchlists';

export async function GET() {
  try {
    const ctx = await requireRiContext('ri:read');
    const rows = await listWatchlists(ctx.supabase, ctx.organisationId, ctx.userId);
    return NextResponse.json({ ok: true, watchlists: rows });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRiContext('triage:write');
    assertCanRi(ctx.role, 'triage:write');
    const body = await request.json().catch(() => ({}));
    const name = String(body.name || '').trim();
    if (!name) return NextResponse.json({ ok: false, error: 'name_required' }, { status: 400 });
    const scope = body.scope === 'organisation' ? 'organisation' : 'personal';
    const row = await upsertWatchlist(ctx.supabase, {
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      id: body.id ? String(body.id) : undefined,
      scope,
      name,
      description: body.description ? String(body.description) : null,
      enabled: body.enabled !== false,
      filters: (body.filters || {}) as WatchlistFilters,
    });
    return NextResponse.json({ ok: true, watchlist: row });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}