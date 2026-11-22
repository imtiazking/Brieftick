#!/usr/bin/env node
/**
 * Full simulated publication extraction — PS26/1 + PS22/9 with configurable batch limits and resumable sessions.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';
import { extractRegulatoryPdfContent } from '../../../integrations/regulatory-sources/core/regulatory-pdf-extract.mjs';
import { buildPdfEvidenceBlocks } from '../../../integrations/regulatory-sources/core/pdf-evidence-blocks.mjs';
import { buildProvisionPagesIndex, detectLegalInstrumentStartPage } from '../lib/ri/classification/provision-eligibility.mjs';
import { buildPublicationExtractionBatchPlan } from '../lib/ri/ai/extraction-batch-plan.mjs';
import {
  initPublicationExtractionOrchestration,
  runOrchestrationSession,
} from '../lib/ri/ai/publication-extraction-orchestrator.mjs';

const PUBLICATIONS = [
  { code: 'PS26/1', pdf: join(REPO_ROOT, 'integrations/regulatory-sources/fixtures/fca-ps26-1-official.pdf'), pubId: '829c5472-953a-40ff-9628-947afbfe4e7a' },
  { code: 'PS22/9', pdf: join(REPO_ROOT, 'integrations/regulatory-sources/fixtures/fca-ps22-9-official.pdf'), pubId: '7a73ac4c-d6b4-4411-9f6d-1276053f2831' },
];

let failed = 0;
const check = (label, ok, detail) => {
  if (!ok) failed += 1;
  console.log(ok ? 'PASS' : 'FAIL', label, detail ? JSON.stringify(detail) : '');
};

async function loadBlocks(pub) {
  const pdf = readFileSync(pub.pdf);
  const extracted = await extractRegulatoryPdfContent(pdf);
  return buildPdfEvidenceBlocks(
    { publicationId: pub.pubId, extractionRevisionId: 'sim-p3', sourcePdfSha256: 'local', extractionProfile: 'pdf_primary_v1' },
    extracted.structured,
  );
}

function runFullResumable(blocks, start, pub, { sessionBatchLimit = 8 } = {}) {
  const plan = buildPublicationExtractionBatchPlan(blocks, {
    instrumentStartPage: start,
    maxSectionsPerBatch: 10,
    fullPublicationCoverage: true,
  });
  const state = initPublicationExtractionOrchestration(plan, {
    publicationId: pub.pubId,
    spendCapUsd: 50,
    evidenceBlocks: blocks,
  });

  let sessions = 0;
  let totalSteps = 0;
  while (!state.publicationCoverageComplete && sessions < 120) {
    const session = runOrchestrationSession(state, blocks, {
      instrumentStartPage: start,
      maxSectionsPerBatch: 10,
      maxBatchesThisSession: sessionBatchLimit,
      fullPublicationCoverage: true,
      baseIdempotencySuffix: `uat-sim-p3-${pub.code.replace(/\//g, '-')}`,
    });
    sessions += 1;
    totalSteps += session.steps.length;
    if (!session.session.resumable) break;
    if (session.steps.length === 0) break;
  }
  return { state, plan, sessions, totalSteps };
}

async function runOne(pub) {
  const blocks = await loadBlocks(pub);
  const start = detectLegalInstrumentStartPage(blocks);
  const { state, plan, sessions, totalSteps } = runFullResumable(blocks, start, pub, {
    sessionBatchLimit: pub.code === 'PS22/9' ? 6 : 12,
  });
  const reconciliation = state.provisionInventoryReconciliation || {};
  const unresolved = reconciliation.unresolvedCores || [];
  const outcomeCount = state.provisionOutcomes?.length ?? 0;

  check(`${pub.code} plan version v2`, plan.planVersion === 'instrument_coverage_v2');
  check(`${pub.code} inventory provisions identified`, plan.instrumentProvisionCount > 0, { count: plan.instrumentProvisionCount });
  check(`${pub.code} full coverage complete`, state.publicationCoverageComplete === true, { sessions, totalSteps, batches: state.batches.length });
  check(`${pub.code} explicit provision outcomes`, outcomeCount === plan.instrumentProvisionCount, { outcomeCount });
  check(`${pub.code} inventory reconciled (no unresolved)`, unresolved.length === 0, { unresolved: unresolved.length });
  check(`${pub.code} dedupe recorded`, state.consolidatedFindingCount >= 1);
  check(`${pub.code} spend cap respected`, state.spend?.capUsd == null || state.spend.batchesAttempted <= state.batches.length + 1);

  if (pub.code === 'PS26/1') {
    const idx = buildProvisionPagesIndex(blocks, start);
    const pages = [...(idx.get('7.20.1R')?.pages || [])];
    check('PS26/1 CONC 7.20.1R pages 94+95', pages.includes(94) && pages.includes(95), { pages });
  }

  return {
    publication: pub.code,
    publicationId: pub.pubId,
    instrumentProvisionCount: plan.instrumentProvisionCount,
    batches: state.batches.length,
    sessions,
    totalSteps,
    complete: state.publicationCoverageComplete,
    outcomeCount,
    unresolved,
    consolidatedFindingCount: state.consolidatedFindingCount,
    summary: reconciliation.summary,
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