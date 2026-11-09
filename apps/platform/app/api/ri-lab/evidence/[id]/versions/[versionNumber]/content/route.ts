import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { downloadTenantEvidenceVersionContent } from '@/lib/ri/evidence-storage';

type Params = { params: Promise<{ id: string; versionNumber: string }> };

function parseVersionNumber(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new Error('evidence_version_not_found');
  return n;
}

function contentDisposition(filename: string, disposition: 'inline' | 'attachment'): string {
  const safe = filename.replace(/[\r\n"]/g, '_');
  const encoded = encodeURIComponent(safe);
  return `${disposition}; filename="${safe}"; filename*=UTF-8''${encoded}`;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { id, versionNumber: versionRaw } = await params;
    const url = new URL(request.url);
    const dispositionRaw = url.searchParams.get('disposition')?.trim() || 'attachment';
    const disposition = dispositionRaw === 'inline' ? 'inline' : 'attachment';
    const ctx = await requireRiContext('evidence:read');
    const versionNumber = parseVersionNumber(versionRaw);
    const file = await downloadTenantEvidenceVersionContent(ctx.supabase, {
      organisationId: ctx.organisationId,
      evidenceId: id,
      versionNumber,
      userId: ctx.userId,
    });
    return new NextResponse(new Uint8Array(file.bytes), {
      status: 200,
      headers: {
        'Content-Type': file.contentType,
        'Content-Length': String(file.bytes.length),
        'Content-Disposition': contentDisposition(file.filename, disposition),
        'Cache-Control': 'private, no-store',
        'X-Evidence-Source-Hash': file.sourceHash,
        'X-Evidence-Version': String(versionNumber),
      },
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
