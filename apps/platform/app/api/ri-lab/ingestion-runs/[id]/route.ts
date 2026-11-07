import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { mapIngestionRunRowToLabView } from '@/lib/ri/lab-api/lab-operations-view';
import { getIngestionRunDetail } from '@/lib/ri/services/ingestion-admin';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await requireRiContext('ingestion:read');
    const detail = await getIngestionRunDetail(ctx.supabase, id);
    const run = mapIngestionRunRowToLabView(detail.run as Record<string, unknown>);
    const items = (detail.items ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      canonicalUrl: item.canonical_url,
      normalisationStatus: item.normalisation_status,
      retrievalStatus: item.retrieval_status,
      publicationId: item.publication_id,
      errorDetail: item.error_detail ? String(item.error_detail).slice(0, 500) : null,
      _connected: true,
    }));
    return NextResponse.json({
      ok: true,
      run,
      items,
      detail: {
        id: detail.run.id,
        status: detail.run.status,
        errorSummary: detail.run.error_summary,
      },
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
