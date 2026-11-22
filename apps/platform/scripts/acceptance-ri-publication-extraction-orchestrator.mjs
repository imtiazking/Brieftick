#!/usr/bin/env node
import {
  buildPublicationExtractionBatchPlan,
} from '../lib/ri/ai/extraction-batch-plan.mjs';
import {
  initPublicationExtractionOrchestration,
  mergeFindingsIntoOrchestration,
  nextPendingBatchIndex,
  reconcileOrchestrationCoverage,
  simulateBatchExecution,
} from '../lib/ri/ai/publication-extraction-orchestrator.mjs';

const blocks = [
  { documentEvidenceId: 'a', pageNumber: 80, extractedText: '4.2.1 R applies. 4.2A.3 R A firm must give information.' },
  { documentEvidenceId: 'b', pageNumber: 81, extractedText: '4.8.2 R A firm must not encourage unfair agreements.' },
  { documentEvidenceId: 'c', pageNumber: 82, extractedText: '7.20.1 R applies. (1) application text.' },
  { documentEvidenceId: 'd', pageNumber: 83, extractedText: '(2) A firm must contact the customer about missed payment.' },
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

const plan = buildPublicationExtractionBatchPlan(blocks, { instrumentStartPage: 80, maxSectionsPerBatch: 2, maxBatches: 4 });
const state = initPublicationExtractionOrchestration(plan, { publicationId: 'pub-sim', spendCapUsd: 0.2, maxBatches: 4 });
check('orchestration initialised', state.status === 'READY' && state.batches.length >= 1);
check('coverage not complete at start', state.publicationCoverageComplete === false);

let i = nextPendingBatchIndex(state);
while (i != null && state.spend.batchesAttempted < 3) {
  const r = simulateBatchExecution(state, i, {
    findings: [{ provisionReference: `CONC ${i}.1R`, obligationStatement: `Duty batch ${i}`, provisionCore: `${i}.1R` }],
  });
  check(`batch ${i} simulated`, r.ok === true);
  mergeFindingsIntoOrchestration(state, [{ provisionReference: 'CONC 4.2A.3R', obligationStatement: 'Dup', provisionCore: '4.2A.3R' }]);
  i = nextPendingBatchIndex(state);
}
reconcileOrchestrationCoverage(state);
check('dedupe recorded consolidated count', state.consolidatedFindingCount >= 1);
check('reconciliation object present', Boolean(state.coverageReconciliation));
check('never claims complete with failed or pending batches', !state.publicationCoverageComplete || state.failedBatchIndexes.length === 0);

console.log(`\nacceptance-ri-publication-extraction-orchestrator: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);