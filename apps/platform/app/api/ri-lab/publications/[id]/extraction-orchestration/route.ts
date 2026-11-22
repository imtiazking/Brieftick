import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

/** Create or read publication extraction orchestration ledger (RI-CLS-007). */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id: publicationId } = await params;
    const ctx = await requireRiContext('ri:read');
    const { data, error } = await ctx.supabase
      .from('regulatory_publications')
      .select('id, metadata')
      .eq('id', publicationId)
      .eq('organisation_id', ctx.organisationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ ok: false, code: 'not_found' }, { status: 404 });
    const orchestration = (data.metadata as Record<string, unknown>)?._extractionOrchestration ?? null;
    return NextResponse.json({ ok: true, publicationId, orchestration, tenantScope: true });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id: publicationId } = await params;
    const ctx = await requireRiContext('ai:request');
    const body = (await request.json()) as {
      action?: 'init' | 'advance' | 'advance_all_simulated' | 'advance_session';
      changeId?: string;
      spendCapUsd?: number;
      maxBatches?: number | null;
      maxSectionsPerBatch?: number;
      maxBatchesThisSession?: number;
      maxBatchesSafetyCap?: number;
      fullPublicationCoverage?: boolean;
      resume?: boolean;
      baseIdempotencySuffix?: string;
    };
    const { buildPublicationExtractionBatchPlan } = await import('@/lib/ri/ai/extraction-batch-plan.mjs');
    const {
      advanceOrchestrationBatch,
      initPublicationExtractionOrchestration,
      runOrchestrationBatchesAutomatic,
      runOrchestrationSession,
      snapshotOrchestration,
    } = await import('@/lib/ri/ai/publication-extraction-orchestrator.mjs');
    const { detectLegalInstrumentStartPage } = await import('@/lib/ri/classification/provision-eligibility.mjs');
    const { loadPublicationPdfEvidenceForAskRi } = await import('@/lib/ri/ask-ri/load-publication-pdf-evidence.mjs');

    const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!projectUrl || !serviceRoleKey) throw new Error('storage_credentials_unavailable');

    const { data: pub, error: pubErr } = await ctx.supabase
      .from('regulatory_publications')
      .select('id, metadata')
      .eq('id', publicationId)
      .eq('organisation_id', ctx.organisationId)
      .maybeSingle();
    if (pubErr) throw new Error(pubErr.message);
    if (!pub) return NextResponse.json({ ok: false, code: 'not_found' }, { status: 404 });

    const existing = (pub.metadata as Record<string, unknown>)?._extractionOrchestration as Record<
      string,
      unknown
    > | null;

    const persistOrchestration = async (orchestration: Record<string, unknown>) => {
      const metadata = {
        ...(typeof pub.metadata === 'object' && pub.metadata !== null ? pub.metadata : {}),
        _extractionOrchestration: orchestration,
      };
      const { error: updErr } = await ctx.supabase
        .from('regulatory_publications')
        .update({ metadata })
        .eq('id', publicationId)
        .eq('organisation_id', ctx.organisationId);
      if (updErr) throw new Error(updErr.message);
      return orchestration;
    };

    if (body.action === 'advance_session') {
      if (!existing) {
        return NextResponse.json({ ok: false, code: 'orchestration_not_initialised' }, { status: 409 });
      }
      if (process.env.RI_EXTRACTION_ORCHESTRATION_SIMULATE !== 'true') {
        return NextResponse.json(
          {
            ok: false,
            code: 'simulated_advance_disabled',
            detail: 'Set RI_EXTRACTION_ORCHESTRATION_SIMULATE=true on staging only for dry-run.',
          },
          { status: 403 },
        );
      }
      const loaded = await loadPublicationPdfEvidenceForAskRi(ctx.supabase, {
        projectUrl: projectUrl!,
        serviceRoleKey: serviceRoleKey!,
        publicationIds: [publicationId],
      });
      if (!loaded.evidence?.length) {
        return NextResponse.json({ ok: false, code: 'pdf_primary_not_found' }, { status: 404 });
      }
      const entry = loaded.evidence[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdf evidence block shape from loader
      const blocks = entry.evidenceBlocks as any[];
      const instrumentStartPage = detectLegalInstrumentStartPage(blocks);
      if (!Number.isInteger(instrumentStartPage)) {
        return NextResponse.json({ ok: false, code: 'instrument_start_unknown' }, { status: 409 });
      }
      const state = structuredClone(existing) as Record<string, unknown>;
      if (!state._provisionInventory) {
        const { buildInstrumentProvisionInventory } = await import('@/lib/ri/classification/provision-inventory.mjs');
        state._provisionInventory = buildInstrumentProvisionInventory(blocks, instrumentStartPage);
      }
      const fullCoverage = body.fullPublicationCoverage !== false;
      const result = runOrchestrationSession(state, blocks, {
        instrumentStartPage,
        maxSectionsPerBatch: body.maxSectionsPerBatch ?? 18,
        maxBatchesThisSession: body.maxBatchesThisSession ?? body.maxBatches ?? 12,
        fullPublicationCoverage: fullCoverage,
        maxBatchesSafetyCap: body.maxBatchesSafetyCap,
        baseIdempotencySuffix: body.baseIdempotencySuffix || 'orch-session',
      });
      await persistOrchestration(snapshotOrchestration(result.state) as Record<string, unknown>);
      return NextResponse.json({ ok: true, publicationId, ...result, simulated: true });
    }

    if (body.action === 'advance' || body.action === 'advance_all_simulated') {
      if (!existing) {
        return NextResponse.json({ ok: false, code: 'orchestration_not_initialised' }, { status: 409 });
      }
      const state = structuredClone(existing);
      if (body.action === 'advance_all_simulated') {
        if (process.env.RI_EXTRACTION_ORCHESTRATION_SIMULATE !== 'true') {
          return NextResponse.json(
            { ok: false, code: 'simulated_advance_disabled', detail: 'Set RI_EXTRACTION_ORCHESTRATION_SIMULATE=true on staging only for dry-run.' },
            { status: 403 },
          );
        }
        const result = runOrchestrationBatchesAutomatic(state, {
          baseIdempotencySuffix: body.baseIdempotencySuffix || 'orch-sim',
        });
        await persistOrchestration(result.state);
        return NextResponse.json({ ok: true, publicationId, ...result, simulated: true });
      }
      const step = advanceOrchestrationBatch(state, {
        simulate: false,
        baseIdempotencySuffix: body.baseIdempotencySuffix || 'orch-batch',
      });
      if (step.ok && step.code === 'awaiting_authorised_extraction') {
        return NextResponse.json({ publicationId, ...step, persisted: false });
      }
      await persistOrchestration(state);
      return NextResponse.json({ ok: true, publicationId, orchestration: state, step });
    }

    if (body.resume && existing) {
      return NextResponse.json({ ok: true, publicationId, orchestration: existing, resumed: true });
    }

    const loaded = await loadPublicationPdfEvidenceForAskRi(ctx.supabase, {
      projectUrl,
      serviceRoleKey,
      publicationIds: [publicationId],
    });
    if (!loaded.evidence?.length) {
      return NextResponse.json({ ok: false, code: 'pdf_primary_not_found' }, { status: 404 });
    }
    const entry = loaded.evidence[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdf evidence block shape from loader
    const blocks = entry.evidenceBlocks as any[];
    const instrumentStartPage = detectLegalInstrumentStartPage(blocks);
    if (!Number.isInteger(instrumentStartPage)) {
      return NextResponse.json({ ok: false, code: 'instrument_start_unknown' }, { status: 409 });
    }

    const fullCoverage = body.fullPublicationCoverage !== false;
    const plan = buildPublicationExtractionBatchPlan(blocks, {
      instrumentStartPage,
      maxSectionsPerBatch: body.maxSectionsPerBatch ?? 18,
      maxBatches: fullCoverage ? null : body.maxBatches ?? 12,
      maxBatchesSafetyCap: body.maxBatchesSafetyCap,
      fullPublicationCoverage: fullCoverage,
    });
    const orchestration = initPublicationExtractionOrchestration(plan, {
      publicationId,
      changeId: body.changeId,
      spendCapUsd: body.spendCapUsd,
      maxBatches: fullCoverage ? plan.batches.length : body.maxBatches ?? 12,
      evidenceBlocks: blocks,
    });

    await persistOrchestration(snapshotOrchestration(orchestration) as Record<string, unknown>);

    return NextResponse.json({ ok: true, publicationId, orchestration, created: true });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}