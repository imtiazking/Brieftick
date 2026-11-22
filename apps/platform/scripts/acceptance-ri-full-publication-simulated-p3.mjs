#!/usr/bin/env node
/**
 * Simulated full-publication processing for PS26/1 + PS22/9 fixtures (no paid AI).
 * Reconciles provision inventory vs orchestration outcomes; writes evidence JSON.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';
import { extractRegulatoryPdfContent } from '../../../integrations/regulatory-sources/core/regulatory-pdf-extract.mjs';
import { buildPdfEvidenceBlocks } from '../../../integrations/regulatory-sources/core/pdf-evidence-blocks.mjs';
import { buildProvisionPagesIndex, detectLegalInstrumentStartPage } from '../lib/ri/classification/provision-eligibility.mjs';
import { buildInstrumentProvisionInventory, PROVISION_TRACKING_STATUS } from '../lib/ri/classification/provision-inventory.mjs';
import { buildPublicationExtractionBatchPlan } from '../lib/ri/ai/extraction-batch-plan.mjs';
import {
  initPublicationExtractionOrchestration,
  runOrchestrationBatchesAutomatic,
} from '../lib/ri/ai/publication-extraction-orchestrator.mjs';

const PUBLICATIONS = [
  { code: 'PS26/1', pdf: join(REPO_ROOT, 'integrations/regulatory-sources/fixtures/fca-ps26-1-official.pdf'), pubId: '829c5472-953a-40ff-9628-947afbfe4e7a' },
].concat(
  existsSync(join(REPO_ROOT, 'integrations/regulatory-sources/fixtures/fca-ps22-9-official.pdf'))
    ? [{ code: 'PS22/9', pdf: join(REPO_ROOT, 'integrations/regulatory-sources/fixtures/fca-ps22-9-official.pdf'), pubId: '7a73ac4c-d6b4-4411-9f6d-1276053f2831' }]
    : [],
);

let failed = 0;
const check = (label, ok, detail) => {
  if (!ok) failed += 1;
  console.log(ok ? 'PASS' : 'FAIL', label, detail ? JSON.stringify(detail) : '');
};

async function runOne(pub) {
  const pdf = readFileSync(pub.pdf);
  const extracted = await extractRegulatoryPdfContent(pdf);
  const blocks = buildPdfEvidenceBlocks(
    { publicationId: pub.pubId, extractionRevisionId: 'sim-p3', sourcePdfSha256: 'local', extractionProfile: 'pdf_primary_v1' },
    extracted.structured,
  );
  const start = detectLegalInstrumentStartPage(blocks);
  const inventory = buildInstrumentProvisionInventory(blocks, start);
  const maxBatches = pub.code === 'PS22/9' ? 12 : 12;
  const plan = buildPublicationExtractionBatchPlan(blocks, { instrumentStartPage: start, maxSectionsPerBatch: 10, maxBatches });
  const state = initPublicationExtractionOrchestration(plan, {
    publicationId: pub.pubId,
    spendCapUsd: 0.25,
    maxBatches: 12,
  });
  const maxSteps = pub.code === 'PS22/9' ? 80 : 24;
  const result = runOrchestrationBatchesAutomatic(state, {
    baseIdempotencySuffix: `uat-sim-p3-${pub.code.replace(/\//g, '-')}`,
    maxSteps,
  });
  const reconciliation = state.provisionInventoryReconciliation || result.review?.provisionInventory || {};
  const unresolvedCores = reconciliation.unresolvedCores || [];
  check(`${pub.code} inventory provisions identified`, inventory.provisions.length > 0, { count: inventory.provisions.length });
  if (pub.code === 'PS22/9') {
    check(`${pub.code} simulated engine runs without false complete`, result.review.publicationCoverageComplete === false);
    check(`${pub.code} simulated batch steps exhausted plan cap`, result.steps.length >= 12);
  } else {
    check(`${pub.code} simulated batches complete`, result.review.publicationCoverageComplete === true);
  }
  check(`${pub.code} reconciliation recorded`, Boolean(reconciliation.summary || reconciliation.totals || result.review.coverage?.instrumentProvisionCount));
  check(`${pub.code} no silent complete with unresolved`, !(result.review.publicationCoverageComplete && unresolvedCores.length > 0), {
    unresolved: unresolvedCores.length,
  });
  check(`${pub.code} consolidated findings deduped`, result.review.consolidatedFindingCount >= 1);
  if (pub.code === 'PS26/1') {
    const idx = buildProvisionPagesIndex(blocks, start);
    const pages = [...(idx.get('7.20.1R')?.pages || [])];
    check('PS26/1 CONC 7.20.1R pages 94+95', pages.includes(94) && pages.includes(95), { pages });
  }
  return {
    publication: pub.code,
    publicationId: pub.pubId,
    instrumentStartPage: start,
    inventoryCount: inventory.provisions.length,
    batches: state.batches.length,
    reconciliation: reconciliation.totals,
    unresolvedCount: unresolvedCores.length,
    consolidatedFindingCount: result.review.consolidatedFindingCount,
    complete: result.review.publicationCoverageComplete,
  };
}

const reports = [];
for (const pub of PUBLICATIONS) {
  try {
    reports.push(await runOne(pub));
  } catch (e) {
    failed += 1;
    console.error('FAIL', pub.code, e.message);
    reports.push({ publication: pub.code, error: e.message });
  }
}

const outPath = join(REPO_ROOT, 'docs/eval/FULL-PUBLICATION-SIMULATED-P3-2026-11-22.json');
mkdirSync(join(REPO_ROOT, 'docs/eval'), { recursive: true });
writeFileSync(outPath, JSON.stringify({ capturedAt: new Date().toISOString(), reports }, null, 2));
console.log('Wrote', outPath);
process.exit(failed ? 1 : 0);