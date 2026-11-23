#!/usr/bin/env node
/**
 * End-to-end pipeline trace for five verified PS26/1 operatives (no paid AI).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { extractRegulatoryPdfContent } from '../../../../integrations/regulatory-sources/core/regulatory-pdf-extract.mjs';
import { buildPdfEvidenceBlocks } from '../../../../integrations/regulatory-sources/core/pdf-evidence-blocks.mjs';
import { buildPublicationExtractionBatchPlan } from '../../lib/ri/ai/extraction-batch-plan.mjs';
import { detectLegalInstrumentStartPage } from '../../lib/ri/classification/provision-eligibility.mjs';
import {
  assessBatchProvisionCompleteness,
  suppliedProvisionCoresFromGrounding,
} from '../../lib/ri/ai/provision-assessment-completeness.mjs';
import { orchestrationFindingsFromStructuredOutput } from '../../lib/ri/ai/publication-extraction-orchestrator.mjs';

const TARGETS = ['4.2A.3R', '4.2A.6R', '4.2A.7R', '7.20.3R', '7.20.1R'];
const RUNS = ['2c840c0b-0534-4429-a02d-6db8850a3f91', '6f05a9eb-8984-4a2b-8b78-2e7effbf8892'];
const OUT = join(REPO_ROOT, 'docs/eval/PS26-PROVISION-PIPELINE-TRACE-2026-11-23.json');
const SNAPSHOT = join(REPO_ROOT, 'docs/eval/fixtures/PS26-HISTORICAL-RUNS-SNAPSHOT-2026-11-23.json');

const pdf = readFileSync(join(REPO_ROOT, 'integrations/regulatory-sources/fixtures/fca-ps26-1-official.pdf'));
const extracted = await extractRegulatoryPdfContent(pdf);
const blocks = buildPdfEvidenceBlocks(
  { publicationId: 'ps26', extractionRevisionId: 'trace', sourcePdfSha256: 'x', extractionProfile: 'pdf_primary_v1' },
  extracted.structured,
);
const start = detectLegalInstrumentStartPage(blocks);
const plan = buildPublicationExtractionBatchPlan(blocks, { instrumentStartPage: start, maxSectionsPerBatch: 18, fullPublicationCoverage: true });

function batchForCore(core) {
  for (const b of plan.batches) {
    if ((b.instrumentProvisionsNewlySupplied || []).includes(core)) {
      return {
        batchIndex: b.batchIndex,
        inNewlySupplied: true,
        instrumentProvisionsSuppliedCount: b.selection?.instrumentProvisionsSupplied ?? null,
      };
    }
  }
  return { batchIndex: null, inNewlySupplied: false, inSections: false };
}

let snapshot = { runs: [] };
try {
  snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
} catch {
  const { runAs, STAGING_ORIGIN } = await import('../uat/staging-user-sessions.mjs');
  await runAs('A', async ({ page }) => {
    for (const runId of RUNS) {
      const run = await (await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/ai-analysis-runs/${runId}`)).json().catch(() => ({}));
      snapshot.runs.push({
        runId,
        structured_output: run.detail?.structured_output || null,
        execution_status: run.detail?.execution_status,
      });
    }
  });
  mkdirSync(dirname(SNAPSHOT), { recursive: true });
  writeFileSync(SNAPSHOT, JSON.stringify({ capturedAt: new Date().toISOString(), runs: snapshot.runs }, null, 2));
}

const pipeline = TARGETS.map((core) => {
  const batch = batchForCore(core);
  const runTraces = [];
  for (const r of snapshot.runs || []) {
    const out = r.structured_output || {};
    const grounding = out._forgeniqGrounding || {};
    const supplied = suppliedProvisionCoresFromGrounding(grounding);
    const inContext = supplied.includes(core);
    const completeness =
      supplied.length > 0
        ? assessBatchProvisionCompleteness({
            suppliedCores: supplied,
            candidates: out.candidates || [],
            claims: out.claims || [],
          })
        : null;
    const perCore = completeness?.assessments?.find((a) => a.provisionCore === core) || null;
    const findings = orchestrationFindingsFromStructuredOutput(out);
    const mergedFinding = findings.some((f) => f.provisionCore === core || String(f.provisionReference || '').includes(core));
    runTraces.push({
      runId: r.runId,
      suppliedInBatch: inContext,
      orchestrationWouldMergeFinding: mergedFinding,
      requiresStructuredRefForMerge:
        !findings.find((f) => f.provisionCore === core || String(f.provisionReference || '').includes(core))?.provisionReference,
      assessment: perCore,
      rootCause:
        !inContext
          ? 'not_in_batch_instrumentProvisionsNewlySupplied'
          : perCore?.outcome === 'omitted'
            ? 'supplied_ignored_by_model'
            : perCore?.outcome === 'assessed_text_only'
              ? 'present_without_structured_provision_reference'
              : perCore?.outcome === 'assessed_structured'
                ? 'assessed'
                : 'unknown',
    });
  }
  return {
    core,
    subParagraphNote: core === '7.20.1R' ? 'Operative duty verified at 7.20.1R(2) p.95 (cross-page RI-CLS-009)' : null,
    deterministicBatchPlan: batch,
    runTraces,
  };
});

const payload = {
  generatedAt: new Date().toISOString(),
  publication: 'PS26/1',
  snapshot: SNAPSHOT,
  verifiedOperatives: TARGETS,
  pipeline,
  aggregateRootCauses: {
    '4.2A.3R': 'assessed_text_only / partial — text hits; orchestration merge blocked without provisionReference',
    '4.2A.6R': 'supplied_ignored_by_model when in batch',
    '4.2A.7R': 'supplied_ignored_by_model when in batch',
    '7.20.3R': 'supplied_ignored_by_model when in batch',
    '7.20.1R(2)': 'parser scoped excerpt weak; cross-page duty; model omission when supplied',
  },
  safeguardsImplemented: [
    'provision-assessment-completeness.mjs',
    'provisionScopedExtraction for every batch',
    'ai_assessment_omission_requires_review inventory outcome',
    'regulatoryExtractionAccuracyComplete on orchestration',
  ],
};
writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(JSON.stringify({ out: OUT, pipeline: pipeline.map((p) => ({ core: p.core, runs: p.runTraces.length })) }));