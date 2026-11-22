#!/usr/bin/env node
/**
 * RI-CLS-007 acceptance — deterministic multi-batch plan (no paid extraction).
 */
import { buildPublicationExtractionBatchPlan, crossBatchFindingDedupeKey } from '../lib/ri/ai/extraction-batch-plan.mjs';
import { sha256Hex } from '../lib/ri/ai/finding-review-core.mjs';

const blocks = [
  {
    documentEvidenceId: 'p80',
    pageNumber: 80,
    extractedText: 'Annex F Amendments to CONC. 4.2.1 R applies. 4.2A.3 R A firm must give information.',
  },
  {
    documentEvidenceId: 'p81',
    pageNumber: 81,
    extractedText: '4.2A.4 R A firm must verify. 4.2A.5 R Information requirements.',
  },
  {
    documentEvidenceId: 'p82',
    pageNumber: 82,
    extractedText: '4.8.2 R A firm must not unfairly encourage. 4.8.3 G guidance only.',
  },
  {
    documentEvidenceId: 'p83',
    pageNumber: 83,
    extractedText: '7.20.1 R applies. (1) application text only.',
  },
];

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond) {
    pass += 1;
    console.log(`PASS: ${name}`);
  } else {
    fail += 1;
    console.log(`FAIL: ${name}`);
  }
};

const plan = buildPublicationExtractionBatchPlan(blocks, { instrumentStartPage: 80, maxSectionsPerBatch: 2, maxBatches: 6 });
check('plan has at least one batch', plan.batches.length >= 1);
check('batch 0 reports selection scope', plan.batches[0].selection.scope === 'PARTIAL_DOCUMENT' || plan.batches[0].selection.scope === 'WHOLE_DOCUMENT');
check(
  'coverage ledger tracks outstanding provisions when not complete',
  !plan.publicationCoverageComplete ? (plan.batches[0].instrumentProvisionsOutstanding?.length ?? 0) > 0 : plan.batches.length >= 1,
);
check(
  'dedupe key stable',
  crossBatchFindingDedupeKey({ provisionReference: 'CONC 7.20.1R', obligationStatement: 'Must contact customer' }, sha256Hex) ===
    crossBatchFindingDedupeKey({ provisionReference: 'CONC 7.20.1R', obligationStatement: 'Must contact customer' }, sha256Hex),
);

const last = plan.batches[plan.batches.length - 1];
if (last && !last.stalled) {
  check('final batch reports coverage state consistently', typeof plan.publicationCoverageComplete === 'boolean');
}

console.log(`\nacceptance-ri-extraction-batch-plan: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);