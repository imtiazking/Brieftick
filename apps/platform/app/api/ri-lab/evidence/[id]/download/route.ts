import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { createTenantEvidenceDownloadUrl } from '@/lib/ri/evidence-storage';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await requireRiContext('evidence:read');
    const download = await createTenantEvidenceDownloadUrl(ctx.supabase, {
      organisationId: ctx.organisationId,
      evidenceId: id,
    });
    return NextResponse.json({ ok: true, ...download });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
