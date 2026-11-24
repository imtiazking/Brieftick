#!/usr/bin/env node
/**
 * PS26 operative paid plan: 17 provisions cannot be one batch (cap 16). Not executed.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { assertBatchProvisionOutputBudget, resolveMaxProvisionsPerBatch } from '../../lib/ri/ai/extraction-output-preflight.mjs';
import { extractRegulatoryPdfContent } from '../../../../integrations/regulatory-sources/core/regulatory-pdf-extract.mjs';
import { buildPdfEvidenceBlocks } from '../../../../integrations/regulatory-sources/core/pdf-evidence-blocks.mjs';
import { buildProvisionPagesIndex, detectLegalInstrumentStartPage } from '../../lib/ri/classification/provision-eligibility.mjs';

const tax = JSON.parse(readFileSync(join(REPO_ROOT, 'docs/eval/FCA-PS26-OUTSTANDING-TAXONOMY-2026-11-23.json'), 'utf8'));
const cores = (tax.provisions || [])
  .filter((p) => p.operativeBinding && p.instrumentClass === 'operative_binding_requirement')
  .map((p) => p.core);
const cap = resolveMaxProvisionsPerBatch();
const batches = [];
for (let i = 0; i < cores.length; i += cap) batches.push(cores.slice(i, i + cap));

const pdf = readFileSync(join(REPO_ROOT, 'integrations/regulatory-sources/fixtures/fca-ps26-1-official.pdf'));
const extracted = await extractRegulatoryPdfContent(pdf);
const blocks = buildPdfEvidenceBlocks(
  { publicationId: '829c5472-953a-40ff-9628-947afbfe4e7a', extractionRevisionId: 'plan', sourcePdfSha256: 'x', extractionProfile: 'pdf_primary_v1' },
  extracted.structured,
);
const index = buildProvisionPagesIndex(blocks, detectLegalInstrumentStartPage(blocks));

const FIVE_USD = 0.060498;
const PER_PROVISION = FIVE_USD / 5;
const planned = batches.map((provisions, batchIndex) => {
  const preflight = assertBatchProvisionOutputBudget(provisions.length, 4, 8192);
  return {
    batchIndex,
    provisions,
    provisionCount: provisions.length,
    withinCap: provisions.length <= cap,
    pdfEvidence: provisions.map((core) => ({ core, pages: [...(index.get(core)?.pages || [])], inIndex: index.has(core) })),
    preflight,
    structuredAssessmentRequired: true,
    omissionDetection: 'assessBatchProvisionCompleteness after the run; truncated output fails preflight and completeness',
    estimatedUsd: Number((provisions.length * PER_PROVISION).toFixed(4)),
    duplicatePaidProcessing: false,
    historicalStructuredRecall: false,
  };
});

const report = {
  generatedAt: new Date().toISOString(),
  executed: false,
  provisionCap: cap,
  rejectedPlan: 'A single 17-provision batch exceeds resolveMaxProvisionsPerBatch() and is invalid.',
  provisionCount: cores.length,
  unique: new Set(cores).size === cores.length,
  batches: planned,
  estimatedUsd: Number(planned.reduce((s, b) => s + b.estimatedUsd, 0).toFixed(4)),
  costBasis: 'PS26 five-operative completed run 9b3bf495 at $0.060498 for 5 provisions, scaled per provision. Not a new charge for that run.',
  preserveHistoricalResults: 'docs/eval/fixtures/PS26-HISTORICAL-RUNS-SNAPSHOT-2026-11-23.json',
};
const out = join(REPO_ROOT, 'docs/eval/PS26-17-OPERATIVE-PAID-PLAN-2026-11-24.json');
writeFileSync(out, JSON.stringify(report, null, 2));
const ok = planned.every((b) => b.withinCap && b.preflight.ok && b.pdfEvidence.every((p) => p.inIndex));
console.log(JSON.stringify({ out, batches: planned.map((b) => b.provisionCount), estimatedUsd: report.estimatedUsd, ok }, null, 2));
if (!ok) process.exit(1);
