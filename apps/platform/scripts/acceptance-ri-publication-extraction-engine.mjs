#!/usr/bin/env node
/**
 * RI-CLS-007 — multi-batch extraction engine (simulated provider only, no paid AI).
 */
import {
  buildPublicationExtractionBatchPlan,
  crossBatchFindingDedupeKey,
} from '../lib/ri/ai/extraction-batch-plan.mjs';
import {
  assertOrchestrationSpendCap,
  initPublicationExtractionOrchestration,
  markBatchOutcome,
  markBatchRunning,
  mergeFindingsIntoOrchestration,
  nextPendingBatchIndex,
  orchestrationBatchIdempotencySuffix,
  reconcileOrchestrationCoverage,
  buildConsolidatedHumanReview,
  runOrchestrationBatchesAutomatic,
  simulateBatchExecution,
  snapshotOrchestration,
} from '../lib/ri/ai/publication-extraction-orchestrator.mjs';
import { createHash } from 'node:crypto';

const sha = (t) => createHash('sha256').update(t).digest('hex');

/** Cross-page CONC-shaped fixture: provision set-out on p.82, duty on p.83 */
const crossPageBlocks = [
  { documentEvidenceId: 'p82', pageNumber: 82, extractedText: '7.20.1 R (1) Application paragraph only on this page.' },
  {
    documentEvidenceId: 'p83',
    pageNumber: 83,
    extractedText: '(2) A firm must contact the customer about the missed payment before taking any further action.',
  },
  { documentEvidenceId: 'p84', pageNumber: 84, extractedText: '7.20.2 G guidance text.' },
  { documentEvidenceId: 'p85', pageNumber: 85, extractedText: '7.20.3 R A firm must give notice.' },
];

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond) {
    pass++;
    console.log(`PASS: ${name}`);
  } else {
    fail++;
    console.log(`FAIL: ${name}`);
  }
};

const plan = buildPublicationExtractionBatchPlan(crossPageBlocks, {
  instrumentStartPage: 82,
  maxSectionsPerBatch: 2,
  maxBatches: 6,
});
const state = initPublicationExtractionOrchestration(plan, {
  publicationId: 'pub-engine-fixture',
  spendCapUsd: 0.12,
  maxBatches: 6,
});

check('batch plan spans cross-page sections', plan.batches.length >= 2);
check('partial at start', state.publicationCoverageComplete === false && state.analysisScope === 'PARTIAL_INSTRUMENT_PROVISIONS');

const suffix0 = orchestrationBatchIdempotencySuffix('sim-orch-e2e', 0);
const suffix1 = orchestrationBatchIdempotencySuffix('sim-orch-e2e', 1);
check('idempotency suffixes differ per batch', suffix0 !== suffix1 && suffix0 === 'sim-orch-e2e');

let batchIdx = nextPendingBatchIndex(state);
const simFindings = [
  { provisionReference: 'CONC 7.20.1R', obligationStatement: 'Contact customer about missed payment.', provisionCore: '7.20.1R' },
  { provisionReference: 'CONC 7.20.3R', obligationStatement: 'Give notice.', provisionCore: '7.20.3R' },
];
let r = simulateBatchExecution(state, batchIdx, { findings: [simFindings[0]] });
check('batch 0 simulated success', r.ok === true && state.batches[batchIdx].status === 'SUCCEEDED');

const dup = mergeFindingsIntoOrchestration(state, [simFindings[0]]);
check('cross-batch dedupe skips duplicate', dup.added === 0 && dup.skipped === 1);

r = simulateBatchExecution(state, nextPendingBatchIndex(state), { findings: [simFindings[1]] });
check('batch 1 simulated success', r.ok === true);

const spendBlock = assertOrchestrationSpendCap(state, 0.5);
check('spend cap blocks excess batch', spendBlock.ok === false);

{
  const failState = snapshotOrchestration(state);
  const fi = failState.batches.find((b) => b.status === 'PENDING');
  if (fi) {
    const idx = fi.batchIndex;
    markBatchRunning(failState, idx, { runId: 'fail-run', idempotencySuffix: 'sim-fail' });
    markBatchOutcome(failState, idx, { ok: false, code: 'simulated_provider_error' });
    check('failed batch recorded', failState.failedBatchIndexes.includes(idx));
    failState.batches[idx].status = 'PENDING';
    check('resume picks failed/pending', nextPendingBatchIndex(failState) === idx);
    simulateBatchExecution(failState, idx, { findings: [{ provisionReference: 'CONC 7.20.2G', provisionCore: '7.20.2G' }] });
    check('recovery batch succeeds', failState.batches[idx].status === 'SUCCEEDED');
  }
}

while (nextPendingBatchIndex(state) != null && state.spend.batchesAttempted < 10) {
  const i = nextPendingBatchIndex(state);
  simulateBatchExecution(state, i, { findings: [] });
}

reconcileOrchestrationCoverage(state);
const snap = snapshotOrchestration(state);
check('coverage reconciliation totals', snap.coverageReconciliation.instrumentProvisionCount >= 1);
check(
  'complete only when all batches succeeded',
  !snap.publicationCoverageComplete || snap.batches.every((b) => b.status === 'SUCCEEDED'),
);
check('consolidated findings count', snap.consolidatedFindingCount >= 2);
check('dedupe key stable', typeof crossBatchFindingDedupeKey(simFindings[0], sha) === 'string');

const autoState = initPublicationExtractionOrchestration(plan, {
  publicationId: 'pub-auto',
  spendCapUsd: 0.5,
  maxBatches: 6,
});
const auto = runOrchestrationBatchesAutomatic(autoState, { baseIdempotencySuffix: 'engine-auto' });
check('automatic run produces consolidated review', auto.review.consolidatedFindingCount >= 1);
check('human review summary', buildConsolidatedHumanReview(autoState).batches.length >= 2);

console.log(`\nacceptance-ri-publication-extraction-engine: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);