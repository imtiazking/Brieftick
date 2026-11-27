import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import {
  FORGENIQ_RI_STAGING_SUPABASE_PROJECT_REF,
  getAppEnvironment,
  getSupabaseProjectRef,
} from '@/lib/env';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { assertCanRi } from '@/lib/ri/permissions';
import { evaluatePublicationAgainstWatchlists } from '@/lib/ri/services/watchlists';

/** Allowed on approved RI staging (hosted staging uses Vercel production target). */
function watchlistEvaluateAllowed(): boolean {
  if (getAppEnvironment() === 'staging') return true;
  if (getSupabaseProjectRef() === FORGENIQ_RI_STAGING_SUPABASE_PROJECT_REF) return true;
  return process.env.VERCEL_ENV !== 'production' && process.env.NODE_ENV !== 'production';
}

/** Staging-only: evaluate an existing catalogue publication against watchlists (no ingest). */
export async function POST(request: Request) {
  try {
    const ctx = await requireRiContext('triage:write');
    assertCanRi(ctx.role, 'triage:write');
    if (!watchlistEvaluateAllowed()) {
      return NextResponse.json({ ok: false, error: 'evaluate_not_allowed' }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const publicationId = String(body.publicationId || '').trim();
    if (!publicationId) {
      return NextResponse.json({ ok: false, error: 'publication_id_required' }, { status: 400 });
    }
    const { data: pub, error } = await ctx.supabase
      .from('regulatory_publications')
      .select('id, title, publication_type, canonical_url, regulator:regulators(external_key)')
      .eq('id', publicationId)
      .maybeSingle();
    if (error || !pub) {
      return NextResponse.json({ ok: false, error: 'publication_not_found' }, { status: 404 });
    }
    const reg = Array.isArray(pub.regulator) ? pub.regulator[0] : pub.regulator;
    const result = await evaluatePublicationAgainstWatchlists(ctx.supabase, ctx.organisationId, {
      id: pub.id,
      title: pub.title,
      publication_type: pub.publication_type,
      canonical_url: pub.canonical_url,
      regulator: reg ? { external_key: (reg as { external_key?: string }).external_key } : null,
    });
    return NextResponse.json({ ok: true, publicationId, ...result });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}