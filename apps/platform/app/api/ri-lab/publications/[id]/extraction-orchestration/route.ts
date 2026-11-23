import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

async function loadOrganisationPublicationLink(
  ctx: Awaited<ReturnType<typeof requireRiContext>>,
  publicationId: string,
  options: { createIfMissing?: boolean } = {},
) {
  const { data: globalPub, error: globalErr } = await ctx.supabase
    .from('regulatory_publications')
    .select('id')
    .eq('id', publicationId)
    .maybeSingle();
  if (globalErr) throw new Error(globalErr.message);
  if (!globalPub) return { link: null, globalPub: null };

  const { data: initialLink, error: linkErr } = await ctx.supabase
    .from('organisation_publications')
    .select('id, metadata')
    .eq('organisation_id', ctx.organisationId)
    .eq('publication_id', publicationId)
    .maybeSingle();
  if (linkErr) throw new Error(linkErr.message);

  let link = initialLink;
  if (!link && options.createIfMissing) {
    const { data: created, error: insErr } = await ctx.supabase
      .from('organisation_publications')
      .insert({
        organisation_id: ctx.organisationId,
        publication_id: publicationId,
        metadata: {},
      })
      .select('id, metadata')
      .single();
    if (insErr) throw new Error(insErr.message);
    link = created;
  }

  return { link, globalPub };
}

/** Create or read publication extraction orchestration ledger (RI-CLS-007). */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id: publicationId } = await params;
    const ctx = await requireRiContext('ri:read');
    const { link } = await loadOrganisationPublicationLink(ctx, publicationId);
    if (!link) return NextResponse.json({ ok: false, code: 'not_found' }, { status: 404 });
    const orchestration = (link.metadata as Record<string, unknown>)?._extractionOrchestration ?? null;
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
      action?:
        | 'init'
        | 'advance'
        | 'advance_all_simulated'
        | 'advance_session'
        | 'complete_live_batch'
        | 'reconcile_provision_inventory';
      batchIndex?: number;
      runId?: string;
      executionOk?: boolean;
      errorCode?: string;
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
      completeLiveOrchestrationBatch,
      buildConsolidatedHumanReview,
      extendOrchestrationPlan,
      finalizeProvisionInventoryOutcomes,
    } = await import('@/lib/ri/ai/publication-extraction-orchestrator.mjs');
    const { detectLegalInstrumentStartPage } = await import('@/lib/ri/classification/provision-eligibility.mjs');
    const { loadPublicationPdfEvidenceForAskRi } = await import('@/lib/ri/ask-ri/load-publication-pdf-evidence.mjs');

    const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!projectUrl || !serviceRoleKey) throw new Error('storage_credentials_unavailable');

    const isInit = body.action == null && body.resume !== true;
    const loadedLink = await loadOrganisationPublicationLink(ctx, publicationId, { createIfMissing: isInit });
    if (!loadedLink.globalPub) {
      return NextResponse.json({ ok: false, code: 'not_found' }, { status: 404 });
    }
    if (!loadedLink.link) {
      return NextResponse.json({ ok: false, code: 'organisation_publication_not_found' }, { status: 404 });
    }

    const orgPub = loadedLink.link;
    const existing = (orgPub.metadata as Record<string, unknown>)?._extractionOrchestration as Record<
      string,
      unknown
    > | null;

    const persistOrchestration = async (orchestration: Record<string, unknown>) => {
      const metadata = {
        ...(typeof orgPub.metadata === 'object' && orgPub.metadata !== null ? orgPub.metadata : {}),
        _extractionOrchestration: orchestration,
      };
      const { data: updated, error: updErr } = await ctx.supabase
        .from('organisation_publications')
        .update({ metadata })
        .eq('id', orgPub.id)
        .eq('organisation_id', ctx.organisationId)
        .select('metadata')
        .single();
      if (updErr) throw new Error(updErr.message);
      orgPub.metadata = updated.metadata;
      return orchestration;
    };

    /* eslint-disable @typescript-eslint/no-explicit-any -- orchestration ledger is persisted JSON metadata */
    if (body.action === 'reconcile_provision_inventory') {
      if (!existing) {
        return NextResponse.json({ ok: false, code: 'orchestration_not_initialised' }, { status: 409 });
      }
      const ledger = structuredClone(existing) as Record<string, unknown>;
      const loaded = await loadPublicationPdfEvidenceForAskRi(ctx.supabase, {
        projectUrl: projectUrl!,
        serviceRoleKey: serviceRoleKey!,
        publicationIds: [publicationId],
      });
      if (!loaded.evidence?.[0]) {
        return NextResponse.json({ ok: false, code: 'pdf_evidence_unavailable' }, { status: 422 });
      }
      const blocks = loaded.evidence[0].evidenceBlocks as Array<{
        pageNumber?: number;
        extractedText?: string;
        documentEvidenceId?: string;
      }>;
      const instrumentStartPage = detectLegalInstrumentStartPage(blocks);
      if (!ledger._provisionInventory && Number.isInteger(instrumentStartPage)) {
        const { buildInstrumentProvisionInventory } = await import('@/lib/ri/classification/provision-inventory.mjs');
        ledger._provisionInventory = buildInstrumentProvisionInventory(blocks, instrumentStartPage);
      }
      finalizeProvisionInventoryOutcomes(ledger as any);
      const snapshot = snapshotOrchestration(ledger as any) as Record<string, unknown>;
      await persistOrchestration(snapshot);
      return NextResponse.json({
        ok: true,
        publicationId,
        orchestration: snapshot,
        review: buildConsolidatedHumanReview(ledger as any),
      });
    }

    if (body.action === 'complete_live_batch') {
      if (!existing) {
        return NextResponse.json({ ok: false, code: 'orchestration_not_initialised' }, { status: 409 });
      }
      const batchIndex = Number(body.batchIndex);
      const runId = body.runId?.trim();
      if (!Number.isInteger(batchIndex) || batchIndex < 0 || !runId) {
        return NextResponse.json({ ok: false, code: 'batch_index_and_run_required' }, { status: 400 });
      }
      const { data: runRow, error: runErr } = await ctx.supabase
        .from('ai_analysis_runs')
        .select('id, execution_status, structured_output, organisation_id')
        .eq('id', runId)
        .eq('organisation_id', ctx.organisationId)
        .maybeSingle();
      if (runErr) throw new Error(runErr.message);
      if (!runRow) return NextResponse.json({ ok: false, code: 'run_not_found' }, { status: 404 });
      const state = structuredClone(existing);
      const executionOk =
        body.executionOk !== false &&
        runRow.execution_status === 'COMPLETED' &&
        runRow.structured_output != null;
      const batchOutcome = {
        runId,
        structuredOutput: runRow.structured_output as Record<string, unknown> | null,
        ok: executionOk,
        ...(executionOk ? {} : { code: body.errorCode ?? 'live_batch_incomplete' }),
      };
      const result = completeLiveOrchestrationBatch(state as any, batchIndex, batchOutcome as any);
      const ledger = state as Record<string, unknown>;
      if (ledger.cumulativeSuppliedProvisionCores && Array.isArray(ledger.cumulativeSuppliedProvisionCores)) {
        const loaded = await loadPublicationPdfEvidenceForAskRi(ctx.supabase, {
          projectUrl: projectUrl!,
          serviceRoleKey: serviceRoleKey!,
          publicationIds: [publicationId],
        });
        if (loaded.evidence?.[0]) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const blocks = loaded.evidence[0].evidenceBlocks as any[];
          const instrumentStartPage = detectLegalInstrumentStartPage(blocks);
          if (!ledger._provisionInventory && Number.isInteger(instrumentStartPage)) {
            const { buildInstrumentProvisionInventory } = await import('@/lib/ri/classification/provision-inventory.mjs');
            ledger._provisionInventory = buildInstrumentProvisionInventory(blocks, instrumentStartPage);
          }
          if (
            !ledger.publicationCoverageComplete &&
            (ledger.batches as Array<{ status: string }> | undefined)?.every((b) => b.status === 'SUCCEEDED') &&
            Number.isInteger(instrumentStartPage)
          ) {
            extendOrchestrationPlan(ledger as any, blocks, {
              instrumentStartPage,
              maxSectionsPerBatch: body.maxSectionsPerBatch ?? 18,
              fullPublicationCoverage: true,
            });
          }
          finalizeProvisionInventoryOutcomes(ledger as any);
        }
      }
      const snapshot = snapshotOrchestration(ledger as any) as Record<string, unknown>;
      await persistOrchestration(snapshot);
      return NextResponse.json({
        publicationId,
        ...result,
        review: buildConsolidatedHumanReview(ledger as any),
        orchestration: snapshot,
      });
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */

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