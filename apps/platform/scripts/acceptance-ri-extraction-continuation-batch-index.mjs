#!/usr/bin/env node
/**
 * Regression: orchestration batchIndex>0 with cumulative supply must resolve continuation plan batch 0,
 * not extraction_batch_out_of_range from maxBatches=batchIndex+1.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';
import { extractRegulatoryPdfContent } from '../../../integrations/regulatory-sources/core/regulatory-pdf-extract.mjs';
import { buildPdfEvidenceBlocks } from '../../../integrations/regulatory-sources/core/pdf-evidence-blocks.mjs';
import { detectLegalInstrumentStartPage } from '../lib/ri/classification/provision-eligibility.mjs';
import { buildPublicationExtractionBatchPlan } from '../lib/ri/ai/extraction-batch-plan.mjs';

const pdf = readFileSync(join(REPO_ROOT, 'integrations/regulatory-sources/fixtures/fca-ps26-1-official.pdf'));
const extracted = await extractRegulatoryPdfContent(pdf);
const blocks = buildPdfEvidenceBlocks(
  { publicationId: '829c5472-953a-40ff-9628-947afbfe4e7a', extractionRevisionId: 'idx', sourcePdfSha256: 'local', extractionProfile: 'pdf_primary_v1' },
  extracted.structured,
);
const start = detectLegalInstrumentStartPage(blocks);
const initial = buildPublicationExtractionBatchPlan(blocks, {
  instrumentStartPage: start,
  maxSectionsPerBatch: 4,
  maxBatches: 1,
  fullPublicationCoverage: false,
});
const supplied = initial.batches[0]?.instrumentProvisionsNewlySupplied || [];
let failed = 0;
const check = (label, ok, d) => {
  if (!ok) failed += 1;
  console.log(ok ? 'PASS' : 'FAIL', label, d ? JSON.stringify(d) : '');
};

const brokenPlan = buildPublicationExtractionBatchPlan(blocks, {
  instrumentStartPage: start,
  maxSectionsPerBatch: 4,
  startSuppliedCores: supplied,
  maxBatches: 2,
  fullPublicationCoverage: true,
});
const fixedPlan = buildPublicationExtractionBatchPlan(blocks, {
  instrumentStartPage: start,
  maxSectionsPerBatch: 4,
  startSuppliedCores: supplied,
  fullPublicationCoverage: true,
});
const planBatchIndex = supplied.length > 0 ? 0 : 1;
const active = fixedPlan.batches[planBatchIndex];
check('continuation plan batch resolves', Boolean(active), {
  planBatchIndex,
  batches: fixedPlan.batches.length,
  outstanding: active?.instrumentProvisionsOutstanding?.length,
});
check('outstanding provisions remain', (active?.instrumentProvisionsOutstanding?.length ?? 0) > 0);

console.log(failed ? 'FAIL acceptance-ri-extraction-continuation-batch-index' : 'PASS acceptance-ri-extraction-continuation-batch-index');
process.exit(failed ? 1 : 0);