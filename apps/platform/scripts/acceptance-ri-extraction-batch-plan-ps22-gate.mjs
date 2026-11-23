#!/usr/bin/env node
/** PS22 full-publication batch gate — 242 provisions, ≤16 provisions/batch, no overlap, preflight margin. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';
import { extractRegulatoryPdfContent } from '../../../integrations/regulatory-sources/core/regulatory-pdf-extract.mjs';
import { buildPdfEvidenceBlocks } from '../../../integrations/regulatory-sources/core/pdf-evidence-blocks.mjs';
import { detectLegalInstrumentStartPage } from '../lib/ri/classification/provision-eligibility.mjs';
import { buildPublicationExtractionBatchPlan } from '../lib/ri/ai/extraction-batch-plan.mjs';
import {
  estimateStructuredOutputTokens,
  resolveMaxProvisionsPerBatch,
} from '../lib/ri/ai/extraction-output-preflight.mjs';

const MAX_OUT = 8192;
const SAFETY_RATIO = 0.82;
const INPUT_CHARS_PER_TOKEN = 4;

delete process.env.RI_LAB_MAX_PROVISIONS_PER_BATCH;

let failed = 0;
const check = (label, ok, detail) => {
  if (!ok) failed += 1;
  console.log(ok ? 'PASS' : 'FAIL', label, detail ? JSON.stringify(detail) : '');
};

const pdf = readFileSync(join(REPO_ROOT, 'integrations/regulatory-sources/fixtures/fca-ps22-9-official.pdf'));
const extracted = await extractRegulatoryPdfContent(pdf);
const blocks = buildPdfEvidenceBlocks(
  { publicationId: '7a73ac4c-d6b4-4411-9f6d-1276053f2831', extractionRevisionId: 'gate', sourcePdfSha256: 'x', extractionProfile: 'pdf_primary_v1' },
  extracted.structured,
);
const start = detectLegalInstrumentStartPage(blocks);
const plan = buildPublicationExtractionBatchPlan(blocks, {
  instrumentStartPage: start,
  maxSectionsPerBatch: 4,
  fullPublicationCoverage: true,
});

check('instrument has 242 provisions', plan.instrumentProvisionCount === 242, { count: plan.instrumentProvisionCount });
const provisionCap = resolveMaxProvisionsPerBatch();
check('plan has 18 batches (post batch-5 cap split)', plan.batches.length === 18, {
  batches: plan.batches.length,
});
check('publication coverage complete', plan.publicationCoverageComplete === true);

const seen = new Set();
let duplicate = null;
for (const b of plan.batches) {
  for (const c of b.instrumentProvisionsNewlySupplied || []) {
    if (seen.has(c)) {
      duplicate = c;
      break;
    }
    seen.add(c);
  }
}
check('no duplicate provisions across batches', !duplicate, { duplicate });
check('all 242 provisions allocated once', seen.size === 242, { allocated: seen.size });

for (const b of plan.batches) {
  const pre = b.estimate?.outputPreflight;
  const sections = Math.min(4, b.selection?.selectedSections ?? 4);
  const prov = (b.instrumentProvisionsNewlySupplied || []).length;
  check(`batch ${b.batchIndex} provision count ≤ cap`, prov <= provisionCap, { prov, provisionCap });
  const est = estimateStructuredOutputTokens({ provisionCount: prov, sectionCount: sections });
  const marginOk = est <= MAX_OUT * SAFETY_RATIO;
  check(`batch ${b.batchIndex} output within safety margin`, pre?.ok === true && marginOk, {
    est,
    cap: MAX_OUT * SAFETY_RATIO,
    provisions: prov,
  });
  const inputEst = Math.ceil((b.selection?.selectedCharacters || 0) / INPUT_CHARS_PER_TOKEN);
  check(`batch ${b.batchIndex} input estimate bounded`, inputEst < 200_000, { inputEst });
}

console.log(`\nacceptance-ri-extraction-batch-plan-ps22-gate: ${failed ? 'FAIL' : 'PASS'}\n`);
process.exit(failed ? 1 : 0);