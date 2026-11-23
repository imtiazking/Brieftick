#!/usr/bin/env node
/**
 * Historical PS26 runs: deterministic completeness must flag omissions (not claim AI success).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';
import {
  assessBatchProvisionCompleteness,
  suppliedProvisionCoresFromGrounding,
} from '../lib/ri/ai/provision-assessment-completeness.mjs';
import { buildPublicationExtractionBatchPlan } from '../lib/ri/ai/extraction-batch-plan.mjs';
import { detectLegalInstrumentStartPage } from '../lib/ri/classification/provision-eligibility.mjs';
import { extractRegulatoryPdfContent } from '../../../integrations/regulatory-sources/core/regulatory-pdf-extract.mjs';
import { buildPdfEvidenceBlocks } from '../../../integrations/regulatory-sources/core/pdf-evidence-blocks.mjs';

const SNAPSHOT = join(REPO_ROOT, 'docs/eval/fixtures/PS26-HISTORICAL-RUNS-SNAPSHOT-2026-11-23.json');
const FIVE = ['4.2A.3R', '4.2A.6R', '4.2A.7R', '7.20.3R', '7.20.1R'];

let failed = 0;
const check = (label, ok, d) => {
  if (!ok) failed += 1;
  console.log(ok ? 'PASS' : 'FAIL', label, d ? JSON.stringify(d) : '');
};

const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
check('historical snapshot has PS26 runs', (snapshot.runs || []).length >= 2, { count: snapshot.runs?.length });
const pdf = readFileSync(join(REPO_ROOT, 'integrations/regulatory-sources/fixtures/fca-ps26-1-official.pdf'));
const extracted = await extractRegulatoryPdfContent(pdf);
const blocks = buildPdfEvidenceBlocks(
  { publicationId: 'x', extractionRevisionId: 'x', sourcePdfSha256: 'x', extractionProfile: 'pdf_primary_v1' },
  extracted.structured,
);
const plan = buildPublicationExtractionBatchPlan(blocks, {
  instrumentStartPage: detectLegalInstrumentStartPage(blocks),
  maxSectionsPerBatch: 18,
  fullPublicationCoverage: true,
});

/** Deterministic: each verified core appears in some batch plan. */
for (const core of FIVE) {
  const inPlan = plan.batches.some((b) => (b.instrumentProvisionsNewlySupplied || []).includes(core));
  check(`plan supplies batch for ${core}`, inPlan);
}

for (const run of snapshot.runs || []) {
  const out = run.structured_output || {};
  const supplied = suppliedProvisionCoresFromGrounding(out._forgeniqGrounding || {});
  if (!supplied.length) continue;
  const report = assessBatchProvisionCompleteness({
    suppliedCores: supplied,
    candidates: out.candidates || [],
    claims: out.claims || [],
  });
  check(`run ${run.runId.slice(0, 8)} regulatoryAccuracySuccess is false when omissions`, report.regulatoryAccuracySuccess === false, {
    omissions: report.omissionCores,
  });
  for (const core of FIVE.filter((c) => supplied.includes(c))) {
    const a = report.assessments.find((x) => x.provisionCore === core);
    check(`run ${run.runId.slice(0, 8)} explicit assessment row for supplied ${core}`, Boolean(a));
    if (core === '4.2A.3R' && a) {
      check('4.2A.3R historical: identified (not omitted)', a.identified === true, { outcome: a.outcome });
    }
    if (['4.2A.6R', '4.2A.7R', '7.20.3R', '7.20.1R'].includes(core) && a) {
      check(`${core} historical: completeness flags gap`, a.outcome === 'omitted' || a.requiresExceptionReview === true, {
        outcome: a.outcome,
      });
    }
  }
}

console.log(failed ? 'FAIL acceptance-ri-ps26-five-operative-historical' : 'PASS acceptance-ri-ps26-five-operative-historical');
process.exit(failed ? 1 : 0);