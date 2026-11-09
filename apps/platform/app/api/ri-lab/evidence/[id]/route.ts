import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { mapEvidenceRowToLabView } from '@/lib/ri/lab-api/lab-governance-view';
import { getEvidenceDetail } from '@/lib/ri/services/evidence';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await requireRiContext('evidence:read');
    const detail = await getEvidenceDetail(ctx.supabase, ctx.organisationId, id);
    const evidence = mapEvidenceRowToLabView(detail.evidence as Record<string, unknown>);
    const linkedControls =
      detail.controls
        ?.map((c) => (c?.id ? { id: String(c.id), name: String((c as { name?: string }).name ?? '') } : null))
        .filter(Boolean) ?? [];
    const versions = (detail.versions ?? []).map((v) => {
      const row = v as Record<string, unknown>;
      const storagePath = typeof row.storage_path === 'string' ? row.storage_path : '';
      const filename = storagePath ? storagePath.split('/').pop() : null;
      return {
        id: row.id,
        versionNumber: row.version_number,
        filename,
        contentType: row.content_type,
        byteSize: row.byte_size,
        sourceHash: row.source_hash,
        uploadedAt: row.created_at,
      };
    });
    return NextResponse.json({
      ok: true,
      evidence: {
        ...evidence,
        obligationIds: detail.obligations?.map((o) => o?.id).filter(Boolean) ?? [],
        controlIds: detail.controls?.map((c) => c?.id).filter(Boolean) ?? [],
        actionIds: detail.actions?.map((a) => a?.id).filter(Boolean) ?? [],
        regulatoryChangeIds: detail.changes?.map((c) => c?.id).filter(Boolean) ?? [],
        linkedControls,
        versions,
      },
      linkedControls,
      versions,
      detail: detail.evidence,
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
