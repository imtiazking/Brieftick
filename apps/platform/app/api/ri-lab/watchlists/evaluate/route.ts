import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import {
  FORGENIQ_RI_STAGING_SUPABASE_PROJECT_REF,
  getAppEnvironment,
  getSupabaseProjectRef,
} from '@/lib/env';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { assertCanRi } from '@/lib/ri/permissions';
import {
  evaluateObligationAgainstWatchlists,
  evaluatePublicationAgainstWatchlists,
  evaluateRegulatoryChangeAgainstWatchlists,
} from '@/lib/ri/services/watchlists';

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
    const obligationId = String(body.obligationId || '').trim();
    const regulatoryChangeId = String(body.regulatoryChangeId || '').trim();

    if (obligationId) {
      const { data: ob, error } = await ctx.supabase
        .from('regulatory_obligations')
        .select('id, external_key, obligation_statement')
        .eq('organisation_id', ctx.organisationId)
        .eq('id', obligationId)
        .maybeSingle();
      if (error || !ob) {
        return NextResponse.json({ ok: false, error: 'obligation_not_found' }, { status: 404 });
      }
      const result = await evaluateObligationAgainstWatchlists(ctx.supabase, ctx.organisationId, {
        id: ob.id,
        title: ob.external_key,
        statement: ob.obligation_statement,
      });
      return NextResponse.json({ ok: true, obligationId, ...result });
    }

    if (regulatoryChangeId) {
      const { data: ch, error } = await ctx.supabase
        .from('regulatory_changes')
        .select('id, title, description, publication_id')
        .eq('organisation_id', ctx.organisationId)
        .eq('id', regulatoryChangeId)
        .maybeSingle();
      if (error || !ch) {
        return NextResponse.json({ ok: false, error: 'regulatory_change_not_found' }, { status: 404 });
      }
      const result = await evaluateRegulatoryChangeAgainstWatchlists(ctx.supabase, ctx.organisationId, {
        id: ch.id,
        title: ch.title,
        summary: ch.description,
        publicationId: ch.publication_id,
      });
      return NextResponse.json({ ok: true, regulatoryChangeId, ...result });
    }

    if (!publicationId) {
      return NextResponse.json({ ok: false, error: 'entity_id_required' }, { status: 400 });
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