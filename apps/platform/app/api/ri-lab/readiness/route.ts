import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { extractProjectRefFromSupabaseUrl } from '@/lib/ri/ingestion/snapshot/supabase-config.mjs';
import { FORGENIQ_RI_STAGING_PROJECT_REF } from '@/lib/ri/ingestion/snapshot/staging-constants.mjs';
import { buildLabWriteCapabilities, resolveLabAnyConnectedWritesEnabled } from '@/lib/ri/lab-api/lab-connected-writes';
import { buildStagingOperationalReadiness } from '@/lib/ri/lab-api/staging-operational-readiness';

export async function GET() {
  try {
    const ctx = await requireRiContext('ri:read');
    const { count, error } = await ctx.supabase
      .from('regulatory_publications')
      .select('id', { count: 'exact', head: true });

    if (error) {
      return NextResponse.json({ error: 'catalogue_unavailable', detail: error.message }, { status: 503 });
    }

    const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
    const projectRef = apiUrl ? extractProjectRefFromSupabaseUrl(apiUrl) : null;

    const operationalReadiness = await buildStagingOperationalReadiness({
      cataloguePublicationCount: count ?? 0,
      organisationId: ctx.organisationId,
      role: ctx.role,
    });

    return NextResponse.json({
      ok: true,
      backendReady: true,
      cataloguePublicationCount: count ?? 0,
      organisationId: ctx.organisationId,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
      stagingProjectMatch: projectRef === FORGENIQ_RI_STAGING_PROJECT_REF,
      writesEnabled: resolveLabAnyConnectedWritesEnabled(ctx.role),
      changeWritesEnabled: buildLabWriteCapabilities(ctx.role).changeManagement,
      writeCapabilities: buildLabWriteCapabilities(ctx.role),
      operationalReadiness,
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
