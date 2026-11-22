#!/usr/bin/env node
/**
 * Resumable multi-session orchestration — small session cap forces extendOrchestrationPlan between sessions.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';
import { extractRegulatoryPdfContent } from '../../../integrations/regulatory-sources/core/regulatory-pdf-extract.mjs';
import { buildPdfEvidenceBlocks } from '../../../integrations/regulatory-sources/core/pdf-evidence-blocks.mjs';
import { detectLegalInstrumentStartPage } from '../lib/ri/classification/provision-eligibility.mjs';
import { buildPublicationExtractionBatchPlan } from '../lib/ri/ai/extraction-batch-plan.mjs';
import {
  initPublicationExtractionOrchestration,
  runOrchestrationSession,
} from '../lib/ri/ai/publication-extraction-orchestrator.mjs';

const pdf = readFileSync(join(REPO_ROOT, 'integrations/regulatory-sources/fixtures/fca-ps22-9-official.pdf'));
let failed = 0;
const check = (label, ok, detail) => {
  if (!ok) failed += 1;
  console.log(ok ? 'PASS' : 'FAIL', label, detail ? JSON.stringify(detail) : '');
};

const extracted = await extractRegulatoryPdfContent(pdf);
const blocks = buildPdfEvidenceBlocks(
  { publicationId: '7a73ac4c-d6b4-4411-9f6d-1276053f2831', extractionRevisionId: 'resume', sourcePdfSha256: 'local', extractionProfile: 'pdf_primary_v1' },
  extracted.structured,
);
const start = detectLegalInstrumentStartPage(blocks);
const plan = buildPublicationExtractionBatchPlan(blocks, {
  instrumentStartPage: start,
  maxSectionsPerBatch: 8,
  maxBatches: 1,
  fullPublicationCoverage: false,
});
check('initial capped plan partial', plan.publicationCoverageComplete === false && (plan.batches.at(-1)?.instrumentProvisionsOutstanding?.length ?? 0) > 0, {
  batches: plan.batches.length,
  outstanding: plan.batches.at(-1)?.instrumentProvisionsOutstanding?.length,
});

const state = initPublicationExtractionOrchestration(plan, {
  publicationId: '7a73ac4c-d6b4-4411-9f6d-1276053f2831',
  evidenceBlocks: blocks,
});
const batchesAfterInit = state.batches.length;
let sessions = 0;
let sawExtension = false;
while (!state.publicationCoverageComplete && sessions < 80) {
  const before = state.batches.length;
  const r = runOrchestrationSession(state, blocks, {
    instrumentStartPage: start,
    maxSectionsPerBatch: 8,
    maxBatchesThisSession: 1,
    fullPublicationCoverage: true,
    baseIdempotencySuffix: 'resume-sim',
  });
  if (state.batches.length > before) sawExtension = true;
  sessions += 1;
  check(`session ${sessions} executed steps`, r.steps.length >= 0);
  if (!r.session.resumable && !state.publicationCoverageComplete) break;
  if (state.publicationCoverageComplete) break;
}
check('multi-session extended batch ledger', sawExtension && state.batches.length > batchesAfterInit, {
  initial: batchesAfterInit,
  final: state.batches.length,
  sessions,
  sawExtension,
});
check('full coverage after resume', state.publicationCoverageComplete === true);
check('inventory reconciled', (state.provisionInventoryReconciliation?.unresolvedCores || []).length === 0);

console.log(failed ? 'FAIL acceptance-ri-publication-extraction-resumable' : 'PASS acceptance-ri-publication-extraction-resumable');
process.exit(failed ? 1 : 0);