#!/usr/bin/env node
/**
 * RI-CLS-007 — simulated provider E2E: plan → automatic batches → consolidated review (no paid AI).
 */
import {
  buildPublicationExtractionBatchPlan,
} from '../lib/ri/ai/extraction-batch-plan.mjs';
import {
  buildConsolidatedHumanReview,
  initPublicationExtractionOrchestration,
  runOrchestrationBatchesAutomatic,
} from '../lib/ri/ai/publication-extraction-orchestrator.mjs';

/** PS26/1-shaped instrument pages incl. cross-page 7.20.1R */
const blocks = [
  { documentEvidenceId: 'n1', pageNumber: 60, extractedText: 'Policy narrative only — not instrument.' },
  { documentEvidenceId: 'i1', pageNumber: 94, extractedText: '7.20.1 R (1) Application text for arrears and payment shortfall.' },
  {
    documentEvidenceId: 'i2',
    pageNumber: 95,
    extractedText: '(2) A firm must contact the customer about the missed payment before taking further action.',
  },
  { documentEvidenceId: 'i3', pageNumber: 95, extractedText: '7.20.3 R (1) Notice requirements.' },
  { documentEvidenceId: 'i4', pageNumber: 96, extractedText: '7.20.3 R (4) Additional notice on debt advice.' },
  { documentEvidenceId: 'i5', pageNumber: 87, extractedText: '4.2A.3 R A firm must monitor customer outcomes.' },
  { documentEvidenceId: 'i6', pageNumber: 88, extractedText: '4.2A.6 R Reporting requirements apply.' },
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

const plan = buildPublicationExtractionBatchPlan(blocks, {
  instrumentStartPage: 87,
  maxSectionsPerBatch: 3,
  maxBatches: 8,
});
const state = initPublicationExtractionOrchestration(plan, {
  publicationId: 'pub-e2e-ps26-shaped',
  spendCapUsd: 0.25,
  maxBatches: 8,
});

check('plan inventories instrument provisions', plan.instrumentProvisionCount >= 3);
check('orchestration ready', state.status === 'READY');

const result = runOrchestrationBatchesAutomatic(state, {
  baseIdempotencySuffix: 'uat-orch-e2e',
  maxSteps: 12,
});

check('automatic batch steps executed', result.steps.length >= 1);
check('consolidated review present', result.review.consolidatedFindingCount >= 1);
check('coverage reconciliation recorded', Boolean(result.review.coverage?.instrumentProvisionCount));
check('spend batches attempted', result.review.spend.batchesAttempted >= 1);
check(
  'completion status accurate',
  result.review.publicationCoverageComplete === result.review.coverage.complete,
);

const human = buildConsolidatedHumanReview(state);
check('human review lists every batch', human.batches.length === state.batches.length);

console.log(`\nacceptance-ri-publication-extraction-e2e: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);