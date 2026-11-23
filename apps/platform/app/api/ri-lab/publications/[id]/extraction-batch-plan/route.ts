import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

/** Deterministic multi-batch extraction plan (RI-CLS-007) — no paid AI call. */
export async function GET(request: Request, { params }: RouteParams) {
  const { startLabResourceTimer } = await import('@/lib/ri/observability/lab-resource-metrics.mjs');
  const timer = startLabResourceTimer();
  try {
    const { id: publicationId } = await params;
    if (!publicationId?.trim()) throw new Error('publication_id_required');
    const ctx = await requireRiContext('ri:read');
    const url = new URL(request.url);
    const fullPublicationCoverage = url.searchParams.get('fullPublicationCoverage') !== 'false';
    const maxBatchesParam = url.searchParams.get('maxBatches');
    const maxBatches =
      maxBatchesParam != null && maxBatchesParam !== ''
        ? Number(maxBatchesParam)
        : fullPublicationCoverage
          ? null
          : 12;
    const maxBatchesSafetyCap = url.searchParams.get('maxBatchesSafetyCap')
      ? Number(url.searchParams.get('maxBatchesSafetyCap'))
      : undefined;
    const maxSectionsPerBatch = Number(url.searchParams.get('maxSectionsPerBatch') || 18);
    const targetProvisionCores = url.searchParams
      .get('targetProvisionCores')
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const includeGroundingSample = url.searchParams.get('includeGroundingSample') === 'true';

    const { buildPdfGroundedAnalysisContext } = await import(
      '@/lib/ri/ai/build-pdf-grounded-analysis-context.mjs'
    );
    const { buildPublicationExtractionBatchPlan } = await import('@/lib/ri/ai/extraction-batch-plan.mjs');
    const { detectLegalInstrumentStartPage } = await import('@/lib/ri/classification/provision-eligibility.mjs');
    const { loadPublicationPdfEvidenceForAskRi } = await import('@/lib/ri/ask-ri/load-publication-pdf-evidence.mjs');

    const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!projectUrl || !serviceRoleKey) throw new Error('storage_credentials_unavailable');

    const loaded = await loadPublicationPdfEvidenceForAskRi(ctx.supabase, {
      projectUrl,
      serviceRoleKey,
      publicationIds: [publicationId],
      organisationId: ctx.organisationId,
    });
    if (!loaded.evidence?.length) {
      return NextResponse.json({ ok: false, code: 'pdf_primary_not_found' }, { status: 404 });
    }
    const entry = loaded.evidence[0];
    const structured = entry.structured as { pageBoundaryConfirmed?: boolean } | undefined;
    if (structured?.pageBoundaryConfirmed !== true) {
      return NextResponse.json({ ok: false, code: 'pdf_page_boundaries_not_confirmed' }, { status: 409 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdf evidence block shape from loader
    const blocks = entry.evidenceBlocks as any[];
    const instrumentStartPage = detectLegalInstrumentStartPage(blocks);
    if (!Number.isInteger(instrumentStartPage)) {
      return NextResponse.json({ ok: false, code: 'instrument_start_unknown' }, { status: 409 });
    }

    const plan = buildPublicationExtractionBatchPlan(blocks, {
      instrumentStartPage,
      maxSectionsPerBatch,
      maxBatches,
      maxBatchesSafetyCap,
      fullPublicationCoverage,
      targetProvisionCores: targetProvisionCores?.length ? targetProvisionCores : undefined,
    });

    let firstBatchGrounding = null;
    if (includeGroundingSample) {
      const sampleCtx = await buildPdfGroundedAnalysisContext({
        publicationId,
        adminSupabase: ctx.supabase,
        useCaseId: 'UC-RI-005',
        extractionBatchIndex: 0,
        maxSectionsPerBatch,
        targetProvisionCores: targetProvisionCores?.length ? targetProvisionCores : undefined,
      });
      firstBatchGrounding = sampleCtx.ok ? sampleCtx.grounding?.extractionBatchPlanSummary : null;
    }

    const res = NextResponse.json({
      ok: true,
      publicationId,
      plan,
      firstBatchGrounding,
      tenantScope: true,
      includeGroundingSample,
    });
    timer.end({
      route: 'extraction-batch-plan',
      includeGroundingSample,
      batchCount: plan?.batches?.length ?? 0,
    });
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'extraction_batch_plan_failed';
    timer.end({ route: 'extraction-batch-plan', error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}