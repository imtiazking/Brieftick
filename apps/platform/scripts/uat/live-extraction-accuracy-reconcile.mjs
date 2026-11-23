#!/usr/bin/env node
/**
 * Compare live pilot orchestration + findings against independent provision verification benchmarks.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { runAs, STAGING_ORIGIN } from './staging-user-sessions.mjs';

const EVAL = resolve(process.cwd(), '..', '..', 'docs', 'eval');
const PILOT = resolve(EVAL, 'LIVE-FULL-PUBLICATION-EXTRACTION-PILOT-RUN-2026-11-22.json');
const PS26_BENCH = resolve(EVAL, 'PS26-1-PROVISION-SOURCE-VERIFICATION-2026-11-22.json');
const PS22_BENCH = resolve(EVAL, 'PS22-9-PROVISION-SOURCE-VERIFICATION-2026-11-22.json');
const OUT = resolve(EVAL, 'LIVE-EXTRACTION-ACCURACY-METRICS-2026-11-23.json');

const PUBS = [
  { code: 'PS26/1', id: '829c5472-953a-40ff-9628-947afbfe4e7a', bench: PS26_BENCH },
  { code: 'PS22/9', id: '7a73ac4c-d6b4-4411-9f6d-1276053f2831', bench: PS22_BENCH },
];

function loadJson(p) {
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}

const metrics = {
  generatedAt: new Date().toISOString(),
  pilotLog: loadJson(PILOT)?.log ?? [],
  publications: [],
  spendUsdEstimate: 0,
  acceptance: {
    processingCoverageComplete: false,
    accuracyMeasured: false,
    withinBudgetUsd: 2,
  },
};

await runAs('A', async ({ page }) => {
  for (const pub of PUBS) {
    const bench = loadJson(pub.bench);
    const orch = await (
      await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/publications/${pub.id}/extraction-orchestration`)
    )
      .json()
      .catch(() => ({}));
    const o = orch.orchestration || {};
    const instrumentCount = bench?.inventoryProvisionCount ?? o.planSnapshot?.instrumentProvisionCount ?? null;
    const supplied = o.cumulativeSuppliedProvisionCores?.length ?? 0;
    const unresolved = o.coverageReconciliation?.unresolvedProvisionCores ?? [];
    const outstanding = Math.max(0, (instrumentCount ?? 0) - supplied);
    const recallProxy = instrumentCount ? supplied / instrumentCount : null;
    metrics.publications.push({
      code: pub.code,
      publicationId: pub.id,
      benchmarkProvisionCount: instrumentCount,
      orchestrationSuppliedCount: supplied,
      unresolvedProvisionCores: unresolved,
      outstandingProvisionEstimate: outstanding,
      publicationCoverageComplete: o.publicationCoverageComplete === true,
      batches: o.batches?.map((b) => ({
        batchIndex: b.batchIndex,
        status: b.status,
        runId: b.runId,
      })),
      recallProxy,
      precisionRecallNote:
        'Full precision/recall requires claim-level reconciliation against benchmark cores; proxy uses supplied/total instrument provisions.',
    });
    for (const b of o.batches || []) {
      if (!b.runId) continue;
      const run = await (
        await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/ai-analysis-runs/${b.runId}`)
      )
        .json()
        .catch(() => ({}));
      const spend = run.detail?.structured_output?._forgeniqSpend;
      if (spend?.costUsdEstimate) metrics.spendUsdEstimate += Number(spend.costUsdEstimate) || 0;
    }
  }
});

metrics.acceptance.processingCoverageComplete = metrics.publications.every((p) => p.publicationCoverageComplete);
metrics.acceptance.accuracyMeasured = metrics.publications.every((p) => p.benchmarkProvisionCount != null);
metrics.acceptance.withinBudget = metrics.spendUsdEstimate <= metrics.acceptance.withinBudgetUsd;

writeFileSync(OUT, JSON.stringify(metrics, null, 2));
console.log(JSON.stringify(metrics, null, 2));