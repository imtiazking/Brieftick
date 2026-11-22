#!/usr/bin/env node
/**
 * Priority 2 — costed live pilot readiness (deterministic; no paid AI).
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { extractRegulatoryPdfContent } from '../../../../integrations/regulatory-sources/core/regulatory-pdf-extract.mjs';
import { buildPdfEvidenceBlocks } from '../../../../integrations/regulatory-sources/core/pdf-evidence-blocks.mjs';
import { detectLegalInstrumentStartPage } from '../../lib/ri/classification/provision-eligibility.mjs';
import { buildPublicationExtractionBatchPlan } from '../../lib/ri/ai/extraction-batch-plan.mjs';
import {
  buildConsolidatedHumanReview,
  initPublicationExtractionOrchestration,
  estimateBatchCostUsd,
} from '../../lib/ri/ai/publication-extraction-orchestrator.mjs';
import { buildPdfGroundedAnalysisContext } from '../../lib/ri/ai/build-pdf-grounded-analysis-context.mjs';

const USD_PER_1K_TOKENS = 0.015;
const PUBLICATIONS = [
  {
    code: 'PS26/1',
    publicationId: '829c5472-953a-40ff-9628-947afbfe4e7a',
    pdf: join(REPO_ROOT, 'integrations/regulatory-sources/fixtures/fca-ps26-1-official.pdf'),
  },
  {
    code: 'PS22/9',
    publicationId: '7a73ac4c-d6b4-4411-9f6d-1276053f2831',
    pdf: join(REPO_ROOT, 'integrations/regulatory-sources/fixtures/fca-ps22-9-official.pdf'),
  },
];

async function analyse(pub) {
  const pdf = readFileSync(pub.pdf);
  const extracted = await extractRegulatoryPdfContent(pdf);
  const blocks = buildPdfEvidenceBlocks(
    {
      publicationId: pub.publicationId,
      extractionRevisionId: 'pilot-readiness',
      sourcePdfSha256: 'local',
      extractionProfile: 'pdf_primary_v1',
    },
    extracted.structured,
  );
  const instrumentStartPage = detectLegalInstrumentStartPage(blocks);
  const plan = buildPublicationExtractionBatchPlan(blocks, {
    instrumentStartPage,
    maxSectionsPerBatch: 18,
    fullPublicationCoverage: true,
  });
  const orchestration = initPublicationExtractionOrchestration(plan, {
    publicationId: pub.publicationId,
    spendCapUsd: 50,
    evidenceBlocks: blocks,
  });
  const estimatedTokens = plan.batches.reduce((n, b) => n + (b.estimate?.estimatedTokens || 0), 0);
  const estimatedUsd = plan.batches.reduce(
    (n, b) => n + estimateBatchCostUsd(b, { usdPerThousandTokens: USD_PER_1K_TOKENS }),
    0,
  );
  const batch0Grounding = await buildPdfGroundedAnalysisContext({
    publicationId: pub.publicationId,
    useCaseId: 'UC-RI-005',
    extractionBatchIndex: 0,
    maxSectionsPerBatch: 18,
    fullPublicationCoverage: true,
  });
  const scoped = batch0Grounding.grounding?.provisionOutcomesSummary?.provisionScopedExtraction ?? null;
  return {
    publication: pub.code,
    publicationId: pub.publicationId,
    instrumentStartPage,
    provisionInventoryCount: plan.instrumentProvisionCount,
    plannedBatchCount: plan.batches.length,
    planBatchLimit: plan.planBatchLimit,
    publicationCoverageCompletePlanned: plan.publicationCoverageComplete,
    estimatedTokensTotal: estimatedTokens,
    estimatedUsdTotal: Math.round(estimatedUsd * 100) / 100,
    perBatch: plan.batches.map((b) => ({
      batchIndex: b.batchIndex,
      newlySupplied: b.instrumentProvisionsNewlySupplied?.length ?? 0,
      outstandingAfter: b.instrumentProvisionsOutstanding?.length ?? 0,
      estimatedTokens: b.estimate?.estimatedTokens,
      estimatedUsd: estimateBatchCostUsd(b, { usdPerThousandTokens: USD_PER_1K_TOKENS }),
    })),
    orchestrationReadiness: {
      spendCapUsd: orchestration.spend.capUsd,
      dedupeLedger: 'findingDedupeKeys on orchestration state',
      failedBatchRecovery: 'FAILED batches re-eligible via nextPendingBatchIndex',
      consolidatedHumanReview: buildConsolidatedHumanReview(orchestration),
    },
    provisionScopedGroundingSample: scoped ? { provisionCoresSampled: Object.keys(scoped).slice(0, 5) } : null,
    accuracyMeasurementPlan: {
      metrics: [
        'missed_provision_cores vs inventory',
        'incorrect_regulatory_classification_code',
        'quotation_not_on_page / provision_not_set_out',
        'reviewer_statement_edits vs claimText',
        'human_assisted_quote_correction_rate',
      ],
      noPaidExecutionWithoutApproval: true,
    },
  };
}

const reports = [];
for (const pub of PUBLICATIONS) {
  reports.push(await analyse(pub));
}

const out = {
  capturedAt: new Date().toISOString(),
  budgetRule: 'No paid AI execution from this script',
  usdPerThousandTokensAssumption: USD_PER_1K_TOKENS,
  combinedEstimatedUsd: Math.round(reports.reduce((n, r) => n + r.estimatedUsdTotal, 0) * 100) / 100,
  publications: reports,
  pilotGates: [
    'explicit_operator_approval',
    'RI_LAB_ANTHROPIC_MAX_USD within ceiling',
    'applicability_approved_for_parent_change',
    'per-batch idempotency suffix registered in spend guard',
  ],
};

const outPath = join(REPO_ROOT, 'docs/eval/LIVE-FULL-PUBLICATION-EXTRACTION-PILOT-READINESS-2026-11-22.json');
mkdirSync(join(REPO_ROOT, 'docs/eval'), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log('Wrote', outPath);
console.log(JSON.stringify({ combinedUsd: out.combinedEstimatedUsd, batches: reports.map((r) => ({ pub: r.publication, batches: r.plannedBatchCount, usd: r.estimatedUsdTotal })) }, null, 2));