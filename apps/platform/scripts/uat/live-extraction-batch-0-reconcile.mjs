#!/usr/bin/env node
/**
 * Reconcile PS26/1 batch 0 run without starting a duplicate paid extraction.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import '../staging/load-platform-env.mjs';
import { runAs, STAGING_ORIGIN } from './staging-user-sessions.mjs';

const OUT = resolve(process.cwd(), '..', '..', 'docs', 'eval', 'PS26-1-BATCH-0-RUN-RECONCILIATION-2026-11-23.json');
const PUBLICATION_ID = '829c5472-953a-40ff-9628-947afbfe4e7a';
const BATCH0_RUN_ID = '2c840c0b-0534-4429-a02d-6db8850a3f91';
const BATCH0_SUFFIX = 'live-ps26-full-2026-11-22';

const report = await runAs('A', async ({ page }) => {
  const runRes = await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/ai-analysis-runs/${BATCH0_RUN_ID}`);
  const runBody = await runRes.json().catch(() => ({}));
  const idemUrl = new URL(`${STAGING_ORIGIN}/api/ri-lab/ai-analysis-runs`);
  idemUrl.searchParams.set('publicationId', PUBLICATION_ID);
  idemUrl.searchParams.set('idempotencyKeySuffix', BATCH0_SUFFIX);
  idemUrl.searchParams.set('useCaseId', 'UC-RI-005');
  const idemRes = await page.request.get(idemUrl.toString());
  const idemBody = await idemRes.json().catch(() => ({}));
  const orchRes = await page.request.get(
    `${STAGING_ORIGIN}/api/ri-lab/publications/${PUBLICATION_ID}/extraction-orchestration`,
  );
  const orch = (await orchRes.json().catch(() => ({}))).orchestration || {};
  const detail = runBody.detail || {};
  const spend =
    detail.structured_output?._forgeniqSpend ??
    runBody.aiAnalysisRun?.structuredOutput?._forgeniqSpend ??
    null;
  return {
    reconciledAt: new Date().toISOString(),
    batchIndex: 0,
    runId: BATCH0_RUN_ID,
    idempotencySuffix: BATCH0_SUFFIX,
    idempotencyLookup: { http: idemRes.status(), ...idemBody },
    executionStatus:
      runBody.aiAnalysisRun?.executionStatus || detail.execution_status || idemBody.executionStatus,
    claimsCount: runBody.aiAnalysisRun?.claimsCount ?? null,
    completedAt: detail.completed_at ?? runBody.aiAnalysisRun?.completedAt ?? null,
    spend,
    orchestration: {
      batches: orch.batches?.map((b) => ({
        batchIndex: b.batchIndex,
        status: b.status,
        runId: b.runId,
        idempotencySuffix: b.idempotencySuffix,
      })),
      cumulativeSupplied: orch.cumulativeSuppliedProvisionCores?.length,
      publicationCoverageComplete: orch.publicationCoverageComplete,
      unresolved: orch.coverageReconciliation?.unresolvedProvisionCores,
    },
    notes: [
      'Batch 0 run reused via idempotency; no duplicate POST for this suffix.',
      'consolidatedFindings on run may be zero when review not submitted — orchestration ledger is authoritative for coverage.',
    ],
  };
});

writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: true, out: OUT, executionStatus: report.executionStatus, spend: report.spend }, null, 2));