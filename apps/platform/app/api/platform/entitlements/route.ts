import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { loadOrganisationProductEntitlements, FORGENIQ_PRODUCTS } from '@/lib/platform/product-entitlements';

export async function GET() {
  try {
    const ctx = await requireRiContext('ri:read');
    const entitled = await loadOrganisationProductEntitlements(ctx.supabase, ctx.organisationId);
    return NextResponse.json({
      ok: true,
      organisationId: ctx.organisationId,
      entitled,
      catalogue: FORGENIQ_PRODUCTS,
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}