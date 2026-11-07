import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { listPublicationsForOrganisation } from '@/lib/ri/services/publications';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { sanitizePublicationListRow } from '@/lib/ri/lab-api/sanitize';

export async function GET() {
  try {
    const ctx = await requireRiContext('ri:read');
    const rows = await listPublicationsForOrganisation(ctx.supabase, ctx.organisationId);
    const sample = rows.slice(0, 5).map(sanitizePublicationListRow);
    return NextResponse.json({
      ok: true,
      total: rows.length,
      sample,
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
