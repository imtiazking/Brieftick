import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { createTenantEvidenceVersionPreviewUrl } from '@/lib/ri/evidence-storage';

type Params = { params: Promise<{ id: string; versionNumber: string }> };

function parseVersionNumber(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new Error('evidence_version_not_found');
  return n;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { id, versionNumber: versionRaw } = await params;
    const url = new URL(request.url);
    const intent = url.searchParams.get('intent')?.trim() || 'preview';
    if (intent !== 'preview') {
      return NextResponse.json({ ok: false, error: 'validation_error', detail: 'intent must be preview' }, { status: 400 });
    }
    const ctx = await requireRiContext('evidence:read');
    const versionNumber = parseVersionNumber(versionRaw);
    const access = await createTenantEvidenceVersionPreviewUrl(ctx.supabase, {
      organisationId: ctx.organisationId,
      evidenceId: id,
      versionNumber,
      userId: ctx.userId,
    });
    return NextResponse.json({ ok: true, intent: 'preview', ...access });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
