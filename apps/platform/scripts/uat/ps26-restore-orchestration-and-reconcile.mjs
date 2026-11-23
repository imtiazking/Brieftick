#!/usr/bin/env node
/**
 * Restore PS26/1 live pilot orchestration from completed runs (no new paid POSTs), then reconcile inventory.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runAs, STAGING_ORIGIN } from './staging-user-sessions.mjs';

const PUB = '829c5472-953a-40ff-9628-947afbfe4e7a';
const SUFFIX = 'live-ps26-full-2026-11-22';
const BATCH0_RUN = '2c840c0b-0534-4429-a02d-6db8850a3f91';
const BATCH1_RUN = '6f05a9eb-8984-4a2b-8b78-2e7effbf8892';
const CHANGE_ID = '2bd27e90-0f27-40e3-bf6c-6837a62fa64f';
const EXCEPTION_CORES = ['16.1.6R', '2.7.19GG', '2.7.19HG', '2.7.7FG', '2.8.6CG', '8.12.11AG', 'TP 13.5G'];
const OUT = resolve(process.cwd(), '..', '..', 'docs', 'eval', 'PS26-1-HOSTED-PROVISION-RECONCILE-2026-11-23.json');

const pilot = JSON.parse(
  readFileSync(resolve(process.cwd(), '..', '..', 'docs', 'eval', 'LIVE-FULL-PUBLICATION-EXTRACTION-PILOT-RUN-2026-11-22.json'), 'utf8'),
);

await runAs('A', async ({ page }) => {
  const orchUrl = `${STAGING_ORIGIN}/api/ri-lab/publications/${PUB}/extraction-orchestration`;
  const init = await page.request.post(orchUrl, {
    data: {
      spendCapUsd: 2,
      maxSectionsPerBatch: 18,
      fullPublicationCoverage: true,
      changeId: CHANGE_ID,
      baseIdempotencySuffix: SUFFIX,
      resume: true,
    },
  });
  const initBody = await init.json().catch(() => ({}));
  if (!init.ok()) throw new Error(`init failed ${init.status()} ${JSON.stringify(initBody)}`);

  for (const [batchIndex, runId] of [
    [0, BATCH0_RUN],
    [1, BATCH1_RUN],
  ]) {
    const complete = await page.request.post(orchUrl, {
      data: {
        action: 'complete_live_batch',
        batchIndex,
        runId,
        executionOk: true,
        maxSectionsPerBatch: 18,
      },
    });
    const body = await complete.json().catch(() => ({}));
    if (!complete.ok()) throw new Error(`complete batch ${batchIndex} ${complete.status()} ${JSON.stringify(body)}`);
  }

  const reconcile = await page.request.post(orchUrl, { data: { action: 'reconcile_provision_inventory' } });
  const recBody = await reconcile.json().catch(() => ({}));
  const orch = recBody.orchestration || {};
  const rec = orch.coverageReconciliation || {};
  const invRec = orch.provisionInventoryReconciliation || {};
  const outcomes = orch.provisionOutcomes || [];
  const exceptions = outcomes.filter((o) => o.trackingStatus === 'exception');
  const unresolvedCores = invRec.unresolvedCores?.length
    ? invRec.unresolvedCores
    : rec.unresolvedProvisionCores || [];
  const payload = {
    generatedAt: new Date().toISOString(),
    pilotSteps: pilot.log?.length,
    cumulativeSupplied: orch.cumulativeSuppliedProvisionCores?.length,
    unresolvedCores,
    exceptionCores: exceptions.map((e) => e.core),
    exceptionPreserved: EXCEPTION_CORES.every((c) => exceptions.some((e) => e.core === c)),
    provisionInventorySummary: invRec.summary || rec.provisionInventory,
    actualSpendFromPilot: pilot.log,
  };
  writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(payload, null, 2));
  if (unresolvedCores.length > 0) process.exit(1);
  if (!payload.exceptionPreserved) process.exit(1);
});