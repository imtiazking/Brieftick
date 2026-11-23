#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';
import { extractRegulatoryPdfContent } from '../../../integrations/regulatory-sources/core/regulatory-pdf-extract.mjs';
import { buildPdfEvidenceBlocks } from '../../../integrations/regulatory-sources/core/pdf-evidence-blocks.mjs';
import { detectLegalInstrumentStartPage } from '../lib/ri/classification/provision-eligibility.mjs';
import { buildInstrumentProvisionInventory, PROVISION_TRACKING_STATUS } from '../lib/ri/classification/provision-inventory.mjs';
import { buildPublicationExtractionBatchPlan } from '../lib/ri/ai/extraction-batch-plan.mjs';
import {
  finalizeProvisionInventoryOutcomes,
  initPublicationExtractionOrchestration,
  markBatchOutcome,
} from '../lib/ri/ai/publication-extraction-orchestrator.mjs';

let failed = 0;
const check = (label, ok, d) => {
  if (!ok) failed += 1;
  console.log(ok ? 'PASS' : 'FAIL', label, d ? JSON.stringify(d) : '');
};

const pdf = readFileSync(join(REPO_ROOT, 'integrations/regulatory-sources/fixtures/fca-ps26-1-official.pdf'));
const extracted = await extractRegulatoryPdfContent(pdf);
const blocks = buildPdfEvidenceBlocks(
  { publicationId: '829c5472-953a-40ff-9628-947afbfe4e7a', extractionRevisionId: 'x', sourcePdfSha256: 'x', extractionProfile: 'pdf_primary_v1' },
  extracted.structured,
);
const start = detectLegalInstrumentStartPage(blocks);
const plan = buildPublicationExtractionBatchPlan(blocks, { instrumentStartPage: start, maxSectionsPerBatch: 18, fullPublicationCoverage: true });
const state = initPublicationExtractionOrchestration(plan, { publicationId: '829c5472-953a-40ff-9628-947afbfe4e7a', evidenceBlocks: blocks });
state._provisionInventory = buildInstrumentProvisionInventory(blocks, start);
for (const b of state.batches) {
  if (b.batchIndex === 0) markBatchOutcome(state, 0, { ok: true, newlySuppliedCores: b.instrumentProvisionsNewlySupplied || [] });
  if (b.batchIndex === 1) markBatchOutcome(state, 1, { ok: true, newlySuppliedCores: b.instrumentProvisionsNewlySupplied || [] });
}
finalizeProvisionInventoryOutcomes(state);
const rec = state.provisionInventoryReconciliation;
check('no UNRESOLVED cores after full simulated supply', (rec.unresolvedCores || []).length === 0, {
  unresolved: rec.unresolvedCores,
  exceptions: rec.exceptionCores,
  summary: rec.summary,
});
check('seven exception triage cores (amendment/TP)', (rec.exceptionCores || []).length >= 6, { n: rec.exceptionCores?.length });

console.log(failed ? 'FAIL acceptance-ri-provision-inventory-reconcile' : 'PASS acceptance-ri-provision-inventory-reconcile');
process.exit(failed ? 1 : 0);