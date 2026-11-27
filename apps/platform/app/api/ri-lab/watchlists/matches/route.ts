import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { listWatchlistMatches } from '@/lib/ri/services/watchlists';

export async function GET(request: Request) {
  try {
    const ctx = await requireRiContext('ri:read');
    const url = new URL(request.url);
    const watchlistId = url.searchParams.get('watchlistId') || undefined;
    const matches = await listWatchlistMatches(ctx.supabase, ctx.organisationId, { watchlistId });
    return NextResponse.json({ ok: true, matches });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}