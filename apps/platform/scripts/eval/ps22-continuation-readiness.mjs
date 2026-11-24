#!/usr/bin/env node
/**
 * Controlled PS22/9 continuation plan for the 145 unprocessed provisions. Not executed.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { assertBatchProvisionOutputBudget, resolveMaxProvisionsPerBatch } from '../../lib/ri/ai/extraction-output-preflight.mjs';
import { FCA_PS22_9_AUTHORITATIVE_METADATA as META } from '../../../../integrations/regulatory-sources/catalogue/fca-ps22-9-authoritative-metadata.mjs';

const EVAL = join(REPO_ROOT, 'docs/eval');
const plan = JSON.parse(readFileSync(join(EVAL, 'PS22-9-CONTINUATION-PLAN-14-BATCH-2026-11-23.json'), 'utf8'));
const recon = JSON.parse(readFileSync(join(EVAL, 'PS22-9-PAID-RUN-RECONCILE-FINAL-2026-11-23.json'), 'utf8'));
const b0 = JSON.parse(readFileSync(join(EVAL, 'PS22-9-CONTINUATION-V2-BATCH0-2026-11-23.json'), 'utf8'));
const b1 = JSON.parse(readFileSync(join(EVAL, 'PS22-9-CONTINUATION-V2-BATCH1-2026-11-23.json'), 'utf8'));
const done = new Set([
  ...recon.inventory.preservedCores,
  ...(b0.expectedBatch0 || b0.expectedBatch || []),
  ...(b1.expectedBatch || []),
]);
const cap = resolveMaxProvisionsPerBatch();
const remaining = (plan.batches || []).filter((b) => b.batchIndex >= 2);
const seen = new Set();
const batches = remaining.map((b) => {
  const provisions = b.instrumentProvisionsNewlySupplied || [];
  const overlap = provisions.filter((c) => done.has(c) || seen.has(c));
  provisions.forEach((c) => seen.add(c));
  const preflight = assertBatchProvisionOutputBudget(provisions.length, 4, 8192);
  return {
    batchIndex: b.batchIndex,
    provisionCount: provisions.length,
    provisions,
    withinCap: provisions.length <= cap && provisions.length > 0,
    overlapWithCompleted: overlap,
    preflight,
    sourcePdfSha256: META.sourcePdfSha256,
  };
});
const outstanding = recon.inventory.outstandingCores || [];
const stillOutstanding = outstanding.filter((c) => !done.has(c));
const missingFromPlan = stillOutstanding.filter((c) => !seen.has(c));
const extra = [...seen].filter((c) => !stillOutstanding.includes(c));
const MEAN = 0.103103;
const report = {
  generatedAt: new Date().toISOString(),
  executed: false,
  publication: {
    fcaReference: 'PS22/9',
    publicationType: 'policy_statement',
    consultationPreserved: false,
    publicationDate: META.publicationDate,
    sourcePdfSha256: META.sourcePdfSha256,
  },
  completedPreserved: done.size,
  staleOutstandingStillListingCompleted: outstanding.filter((c) => done.has(c)).length,
  remainingProvisionCount: seen.size,
  batchCount: batches.length,
  provisionCap: cap,
  allWithinCap: batches.every((b) => b.withinCap),
  preflightOk: batches.every((b) => b.preflight.ok),
  noOverlapWithCompleted: batches.every((b) => b.overlapWithCompleted.length === 0),
  coversOutstandingInventory: missingFromPlan.length === 0 && extra.length === 0 && seen.size === 145,
  missingFromPlan,
  extra,
  estimatedUsd: Number((batches.length * MEAN).toFixed(3)),
  costBasis: 'Empirical mean of continuation v2 batch 0 ($0.10542) and batch 1 ($0.100785). Completed spend is not charged again.',
  idempotency: 'Batches 0 and 1 run IDs 9b8fbd1f and ffb5ae47 remain the evidence for the 32 continuation provisions. Preserved 65 are not resupplied.',
  quotationVerification: 'Post-run ps22-continuation-batch-accuracy-report.mjs against the same SHA256 fixture.',
  batches,
};
const out = join(EVAL, 'PS22-9-CONTINUATION-READINESS-2026-11-24.json');
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      out,
      remaining: report.remainingProvisionCount,
      batches: report.batchCount,
      ready: report.coversOutstandingInventory && report.allWithinCap && report.preflightOk && report.noOverlapWithCompleted,
      estimatedUsd: report.estimatedUsd,
    },
    null,
    2,
  ),
);
if (!(report.coversOutstandingInventory && report.allWithinCap && report.preflightOk && report.noOverlapWithCompleted)) process.exit(1);
