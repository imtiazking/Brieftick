import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { assertLabEvidenceWritesEnabled } from '@/lib/ri/lab-api/lab-connected-writes';
import { uploadTenantEvidenceVersion } from '@/lib/ri/evidence-storage';

type Params = { params: Promise<{ id: string }> };

function resolveEvidenceContentType(file: File): string {
  if (file.type && file.type !== 'application/octet-stream') return file.type;
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.txt')) return 'text/plain';
  return file.type || 'application/octet-stream';
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await requireRiContext('evidence:write');
    assertLabEvidenceWritesEnabled(ctx.role);

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'missing_file' }, { status: 400 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const version = await uploadTenantEvidenceVersion(ctx.supabase, {
      organisationId: ctx.organisationId,
      evidenceId: id,
      userId: ctx.userId,
      filename: file.name,
      contentType: resolveEvidenceContentType(file),
      bytes,
    });

    return NextResponse.json({ ok: true, version }, { status: 201 });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
