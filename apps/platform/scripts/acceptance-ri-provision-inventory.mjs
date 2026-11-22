#!/usr/bin/env node
import {
  PROVISION_TRACKING_STATUS,
  buildInstrumentProvisionInventory,
  markProvisionsSuppliedForAnalysis,
  reconcileFindingsWithProvisionInventory,
} from '../lib/ri/classification/provision-inventory.mjs';
import { initPublicationExtractionOrchestration } from '../lib/ri/ai/publication-extraction-orchestrator.mjs';
import { buildPublicationExtractionBatchPlan } from '../lib/ri/ai/extraction-batch-plan.mjs';

let failed = 0;
const check = (label, ok) => {
  if (!ok) failed += 1;
  console.log(ok ? 'PASS' : 'FAIL', label);
};

const blocks = [
  { pageNumber: 94, documentEvidenceId: 'a', extractedText: '7.20.1 R (1) Application rule for missed payments.' },
  {
    pageNumber: 95,
    documentEvidenceId: 'b',
    extractedText:
      '(2) As soon as possible after a missed payment has occurred the firm must notify the borrower. 7.20.2 G Guidance. 7.20.3 R (1) Before taking action the firm must give notice.',
  },
];
const inv = buildInstrumentProvisionInventory(blocks, 94);
check('inventory identifies 7.20.1R', inv.byCore.has('7.20.1R'));
check('7.20.1R spans pages 94-95', inv.byCore.get('7.20.1R')?.pages?.includes(95));

markProvisionsSuppliedForAnalysis(inv, ['7.20.1R'], 0);
const rec = reconcileFindingsWithProvisionInventory(inv, [
  { provisionCore: '7.20.1R', provisionReference: 'CONC 7.20.1R', findingId: 'f1' },
]);
check('reconcile marks finding for 7.20.1R', inv.byCore.get('7.20.1R')?.trackingStatus === PROVISION_TRACKING_STATUS.FINDING);
check('3.20.3R unresolved when never supplied', inv.byCore.get('7.20.3R')?.trackingStatus === PROVISION_TRACKING_STATUS.UNRESOLVED);

const plan = buildPublicationExtractionBatchPlan(blocks, { instrumentStartPage: 94, maxSectionsPerBatch: 2, maxBatches: 2 });
const state = initPublicationExtractionOrchestration(plan, { publicationId: 'pub', evidenceBlocks: blocks });
check('orchestration carries provision inventory', state.provisionInventory?.provisionCount >= 2);

console.log(failed ? `acceptance-ri-provision-inventory: ${failed} failed` : 'acceptance-ri-provision-inventory: all passed');
process.exit(failed);