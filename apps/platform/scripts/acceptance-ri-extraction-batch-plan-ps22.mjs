#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';
import { extractRegulatoryPdfContent } from '../../../integrations/regulatory-sources/core/regulatory-pdf-extract.mjs';
import { buildPdfEvidenceBlocks } from '../../../integrations/regulatory-sources/core/pdf-evidence-blocks.mjs';
import { detectLegalInstrumentStartPage } from '../lib/ri/classification/provision-eligibility.mjs';
import { buildPublicationExtractionBatchPlan } from '../lib/ri/ai/extraction-batch-plan.mjs';

let failed = 0;
const check = (label, ok, detail) => {
  if (!ok) failed += 1;
  console.log(ok ? 'PASS' : 'FAIL', label, detail ? JSON.stringify(detail) : '');
};

const pdf = readFileSync(join(REPO_ROOT, 'integrations/regulatory-sources/fixtures/fca-ps22-9-official.pdf'));
const extracted = await extractRegulatoryPdfContent(pdf);
const blocks = buildPdfEvidenceBlocks(
  { publicationId: '7a73ac4c-d6b4-4411-9f6d-1276053f2831', extractionRevisionId: 'x', sourcePdfSha256: 'x', extractionProfile: 'pdf_primary_v1' },
  extracted.structured,
);
const start = detectLegalInstrumentStartPage(blocks);
const plan = buildPublicationExtractionBatchPlan(blocks, {
  instrumentStartPage: start,
  maxSectionsPerBatch: 4,
  fullPublicationCoverage: true,
});

check('PS22 inventory 242 provisions', plan.instrumentProvisionCount === 242);
check('plan completes within safety cap', plan.publicationCoverageComplete === true);
const preflightFails = plan.batches.filter((b) => b.estimate?.outputPreflight?.ok === false);
check('every batch passes output preflight', preflightFails.length === 0, {
  failedIndexes: preflightFails.map((b) => b.batchIndex),
});
const batch0 = plan.batches[0];
check('batch 0 avoids historical 69-provision overshoot', (batch0?.instrumentProvisionsNewlySupplied?.length ?? 99) <= 58, {
  count: batch0?.instrumentProvisionsNewlySupplied?.length,
});
check('batch 0 under historical failure token estimate', (batch0?.estimate?.outputPreflight?.estimateTokens ?? 99999) < 6720, {
  estimate: batch0?.estimate?.outputPreflight?.estimateTokens,
});

console.log(`\nacceptance-ri-extraction-batch-plan-ps22: ${failed ? 'FAIL' : 'PASS'}\n`);
process.exit(failed ? 1 : 0);