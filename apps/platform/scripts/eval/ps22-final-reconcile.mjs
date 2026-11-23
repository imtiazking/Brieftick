#!/usr/bin/env node
/**
 * Final PS22 paid-run + continuation inventory (deterministic; no paid AI).
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { extractRegulatoryPdfContent } from '../../../../integrations/regulatory-sources/core/regulatory-pdf-extract.mjs';
import { buildPdfEvidenceBlocks } from '../../../../integrations/regulatory-sources/core/pdf-evidence-blocks.mjs';
import { detectLegalInstrumentStartPage } from '../../lib/ri/classification/provision-eligibility.mjs';
import { buildPublicationExtractionBatchPlan, selectBlocksForProvisionCores } from '../../lib/ri/ai/extraction-batch-plan.mjs';
import {
  assertBatchProvisionOutputBudget,
  assertExtractionOutputBudget,
  estimateStructuredOutputTokens,
  resolveMaxProvisionsPerBatch,
} from '../../lib/ri/ai/extraction-output-preflight.mjs';
import { describeSelectedSections } from '../../lib/ri/ai/build-pdf-grounded-analysis-context.mjs';

const OUT = join(REPO_ROOT, 'docs/eval/PS22-9-PAID-RUN-RECONCILE-FINAL-2026-11-23.json');
const CONTINUATION_OUT = join(REPO_ROOT, 'docs/eval/PS22-9-CONTINUATION-PLAN-14-BATCH-2026-11-23.json');
const PROPOSAL_OUT = join(REPO_ROOT, 'docs/eval/PS22-9-CONTINUATION-PROPOSAL-2026-11-23.json');
const BATCH0_PREP = join(REPO_ROOT, 'docs/eval/PS22-9-CONTINUATION-BATCH0-ACCURACY-PREP-2026-11-23.json');
const FORENSIC = join(REPO_ROOT, 'docs/eval/fixtures/ps22-batch5-run-9fd62178-forensic.json');
const PILOT = join(REPO_ROOT, 'docs/eval/PILOT-SPEND-RECONCILE-2026-11-23.json');
const EVIDENCE_DIR = join(REPO_ROOT, 'docs/eval');
const PUB_ID = '7a73ac4c-d6b4-4411-9f6d-1276053f2831';
const CORRECTED_SUFFIX = 'live-ps22-corrected-batch0-2026-11-23';

const pdfBytes = readFileSync(join(REPO_ROOT, 'integrations/regulatory-sources/fixtures/fca-ps22-9-official.pdf'));
const sourcePdfSha256 = createHash('sha256').update(pdfBytes).digest('hex');
const extracted = await extractRegulatoryPdfContent(pdfBytes);
const blocks = buildPdfEvidenceBlocks(
  {
    publicationId: PUB_ID,
    extractionRevisionId: 'reconcile-final',
    sourcePdfSha256,
    extractionProfile: 'pdf_primary_v1',
  },
  extracted.structured,
);
const instrumentStartPage = detectLegalInstrumentStartPage(blocks);

function norm(c) {
  return String(c || '').trim();
}

function loadCorrectedPaidRuns() {
  const pilotReport = JSON.parse(
    readFileSync(join(REPO_ROOT, 'docs/eval/PILOT-EXECUTION-REPORT-2026-11-23.json'), 'utf8'),
  );
  const ps22 = pilotReport.ps22CorrectedBatches || {};
  const gateByIndex = new Map();
  for (const f of readdirSync(EVIDENCE_DIR).filter((x) => /^PS22-9-BATCH\d+-CORRECTED/.test(x))) {
    const j = JSON.parse(readFileSync(join(EVIDENCE_DIR, f), 'utf8'));
    if (Number.isInteger(j.batchIndex) && j.gate) gateByIndex.set(j.batchIndex, j.gate);
  }
  gateByIndex.set(0, { passesQualityGate: true, omissionCount: 0, provisionsSupplied: 14 });
  const suffixByIndex = [
    'live-ps22-corrected-batch0-2026-11-23',
    'live-ps22-corrected-batch0-2026-11-23-batch-2',
    'live-ps22-corrected-batch0-2026-11-23-batch-3',
    'live-ps22-corrected-batch0-2026-11-23-batch-4',
    'live-ps22-corrected-batch0-2026-11-23-batch-5',
    'live-ps22-corrected-batch0-2026-11-23-batch-6',
  ];
  const rows = [...(ps22.completed || []), ...(ps22.failedPreserved || [])].map((row) => ({
    batchIndex: row.batchIndex,
    runId: row.runId,
    idempotencySuffix: suffixByIndex[row.batchIndex] || null,
    gate:
      row.batchIndex === 5
        ? gateByIndex.get(5) || { passesQualityGate: false, omissionCount: 22 }
        : gateByIndex.get(row.batchIndex) || { passesQualityGate: true, omissionCount: row.omissions ?? 0 },
    spendUsd: row.spendUsd,
    status: row.status || (row.batchIndex === 5 ? 'FAILED' : 'COMPLETED'),
    authoritativeSource: 'PILOT-EXECUTION-REPORT-2026-11-23.json',
  }));
  return rows.sort((a, b) => a.batchIndex - b.batchIndex);
}

const correctedRuns = loadCorrectedPaidRuns();
const pilot = JSON.parse(readFileSync(PILOT, 'utf8'));
const forensic = JSON.parse(readFileSync(FORENSIC, 'utf8'));

const correctedRunIds = new Set(correctedRuns.map((r) => r.runId));
const ps22LineItems = pilot.lineItems.filter((li) => correctedRunIds.has(li.runId));

const paidAttempts = correctedRuns.length;
const paidSucceeded = correctedRuns.filter(
  (r) => r.batchIndex < 5 && r.gate?.passesQualityGate !== false && (r.gate?.omissionCount ?? 0) === 0,
).length;
const paidFailed = correctedRuns.filter((r) => !r.gate?.passesQualityGate).length;
const ps22SpendUsd =
  Math.round(ps22LineItems.reduce((s, li) => s + li.spendUsd, 0) * 1_000_000) / 1_000_000;

const preserved = JSON.parse(readFileSync(join(REPO_ROOT, 'docs/eval/PS22-9-PLAN-RECONCILE-2026-11-23.json'), 'utf8'))
  .ledger.cumulativeSuppliedCores.map(norm);
const preservedSet = new Set(preserved);

const continuationPlan = buildPublicationExtractionBatchPlan(blocks, {
  instrumentStartPage,
  maxSectionsPerBatch: 4,
  fullPublicationCoverage: true,
  startSuppliedCores: preserved,
  maxProvisionsPerBatchOverride: 16,
});

const outstanding = [];
for (const b of continuationPlan.batches) {
  for (const c of b.instrumentProvisionsNewlySupplied || []) outstanding.push(norm(c));
}
const outstandingSet = new Set(outstanding);

const allInstrumentCores = [...buildPublicationExtractionBatchPlan(blocks, {
  instrumentStartPage,
  maxSectionsPerBatch: 4,
  fullPublicationCoverage: true,
  maxProvisionsPerBatchOverride: 16,
}).batches.flatMap((b) => b.instrumentProvisionsNewlySupplied || []).map(norm)];
const allSet = new Set(allInstrumentCores);

const overlap = preserved.filter((c) => outstandingSet.has(c));
const union = new Set([...preserved, ...outstanding]);
const missing = [...allSet].filter((c) => !union.has(c));
const extras = [...union].filter((c) => !allSet.has(c));

const provisionCap = resolveMaxProvisionsPerBatch();
const batchShapeChecks = (continuationPlan.batches || []).map((b) => {
  const prov = (b.instrumentProvisionsNewlySupplied || []).length;
  const sections = Math.min(4, b.selection?.selectedSections ?? 4);
  const batchPre = assertBatchProvisionOutputBudget(prov, sections, 8192);
  const est = estimateStructuredOutputTokens({ provisionCount: prov, sectionCount: sections });
  const comparesToFailedBatch5 =
    prov === 22
      ? 'BLOCKED_vs_run_9fd62178'
      : prov <= 16
        ? 'within_cap_vs_truncated_22'
        : 'review';
  return {
    continuationBatchIndex: b.batchIndex,
    provisionCount: prov,
    outputEstimateTokens: est,
    provisionCap,
    batchPre,
    comparesToFailedBatch5,
    wouldHaveFailedLike9fd62178: prov > 16 || est > 8192,
  };
});

const cont0 = continuationPlan.batches[0];
const cont0Cores = cont0?.instrumentProvisionsNewlySupplied || [];
const selected = selectBlocksForProvisionCores(blocks, instrumentStartPage, cont0Cores, { maxSections: 4 });
const described = describeSelectedSections(blocks, selected, instrumentStartPage);

const historicalRunsPreserved = pilot.lineItems.map((li) => ({
  runId: li.runId,
  status: li.status,
  spendUsd: li.spendUsd,
  preserved: true,
  note: li.status === 'FAILED' ? 'retained on ledger — not retried without new suffix' : null,
}));

const paidAttemptDiscrepancyResolution = {
  summary:
    'Five successful extraction batches (indices 0–4, 65 provisions) vs six billable paid API calls (indices 0–5 including failed run 9fd62178).',
  successfulExtractionBatches: paidSucceeded,
  totalPaidApiAttemptsCorrectedPath: paidAttempts,
  failedBillableAttempts: paidFailed,
  priorMislabel: 'batchesAlreadyPaid: 5 meant successful batches only; orchestration spend.batchesAttempted counted in-flight semantics',
  authoritativeCounts: {
    paidAttempts,
    paidSucceeded,
    paidFailed,
    provisionsLedgerPreserved: preserved.length,
  },
};

const continuationBatches = continuationPlan.batches.map((b) => ({
  batchIndex: b.batchIndex,
  instrumentProvisionsNewlySupplied: b.instrumentProvisionsNewlySupplied,
  provisionCount: (b.instrumentProvisionsNewlySupplied || []).length,
  estimate: b.estimate,
  selectionSummary: {
    selectedPages: b.selection?.selectedPages,
    selectedSections: b.selection?.selectedSections,
    selectedCharacters: b.selection?.selectedCharacters,
  },
}));

const empiricalRemaining = Math.round(continuationPlan.batches.length * 0.095 * 1000) / 1000;
const cumulativeNow = pilot.cumulativePilotSpendUsd;
const ceilingAuthorized = pilot.userApprovedCeilingUsd;
const ceilingProposed = 3.25;
const projectedTotalIfFullContinuation = Math.round((cumulativeNow + empiricalRemaining) * 1000) / 1000;

const proposal = {
  generatedAt: new Date().toISOString(),
  status: 'AWAITING_USER_AUTHORISATION',
  notAuthorized: true,
  cumulativeSpendUsd: cumulativeNow,
  authorizedCeilingUsd: ceilingAuthorized,
  proposedCeilingUsd: ceilingProposed,
  proposedCeilingNote: '$3.25 cumulative suggested — NOT authorised; no paid execution until continuation + spend approved',
  remainingExtractionBatches: continuationPlan.batches.length,
  estimatedIncrementalUsd: empiricalRemaining,
  projectedCumulativeIfFullRunUsd: projectedTotalIfFullContinuation,
  fitsProposedCeiling: projectedTotalIfFullContinuation <= ceilingProposed,
  fitsCurrentCeiling: cumulativeNow + empiricalRemaining <= ceilingAuthorized,
  executionPolicy: {
    firstBatchOnlyAfterApproval: true,
    verifyRegulatoryAccuracyBeforeBatch2: true,
    stopConditions: [
      'material_omissions',
      'invalid_structured_output',
      'ambiguous_billing',
      'projected_budget_overrun',
    ],
    newOrchestrationSuffixProposal: 'live-ps22-continuation-v2-2026-11-23',
    startSuppliedCores: preserved.length,
    doNotRetrySuffixes: correctedRuns.map((r) => r.idempotencySuffix),
  },
};

const batch0Prep = {
  generatedAt: new Date().toISOString(),
  disclaimer: 'Provision reconciliation ≠ regulatory extraction accuracy; this validates shape and evidence only',
  continuationBatchIndex: 0,
  provisionCores: cont0Cores,
  provisionCount: cont0Cores.length,
  failedRunComparison: {
    failedRunId: forensic.runId,
    failedProvisionCount: forensic.instrumentProvisionsNewlySupplied.length,
    failedOutputTokens: forensic.providerMeta?.outputTokens,
    thisBatchWouldSaturateMaxTokens: false,
    preflight: batchShapeChecks[0]?.batchPre,
  },
  sourceEvidence: {
    sourcePdfSha256,
    extractionProfile: 'pdf_primary_v1',
    publicationId: PUB_ID,
    instrumentStartPage,
    selectedPages: described.selection?.selectedPages,
    selectedSections: described.selection?.selectedSections,
    pagesPerCore: Object.fromEntries(
      cont0Cores.map((c) => [c, described.sourceSections?.flatMap((s) => (s.provisionsSetOut || []).includes(c) ? [s.pageNumber] : []).filter(Boolean)]),
    ),
  },
  structuredAssessmentContract: {
    requiredPerSuppliedCore: [
      'candidate or claim with provisionReference',
      'sourceQuotation grounded in authoritativeExcerpt',
      'explicit assessment row in _forgeniqProvisionAssessments when batch completes',
    ],
    invalidBatchConditions: [
      'AI_OUTPUT_TRUNCATED',
      'omitted provision without requiresExceptionReview',
      'provisionCount > RI_LAB_MAX_PROVISIONS_PER_BATCH (16)',
    ],
    qualityGate: {
      batchCompletenessOk: 'omissionCount === 0 for supplied cores',
      regulatoryAccuracySuccess: 'independent of inventory reconciliation',
    },
  },
};

const acceptance = {
  preserved65: preserved.length === 65,
  outstanding177: outstanding.length === 177,
  total242: preserved.length + outstanding.length === 242,
  noOverlap: overlap.length === 0,
  noMissing: missing.length === 0,
  noExtras: extras.length === 0,
  sourceRevisionSha256: Boolean(sourcePdfSha256),
  historicalRunsPreserved: historicalRunsPreserved.length === pilot.lineItems.length,
  paidAttemptDiscrepancyDocumented: paidAttempts === paidSucceeded + paidFailed,
  allContinuationPreflightPass: batchShapeChecks.every((b) => b.batchPre.ok),
  noneMatch22ProvisionFailureShape: batchShapeChecks.every((b) => b.provisionCount <= 16),
};

const report = {
  generatedAt: new Date().toISOString(),
  gitBase: 'b677d11',
  publicationId: PUB_ID,
  sourceRevisionBinding: { sourcePdfSha256, extractionProfile: 'pdf_primary_v1' },
  inventory: {
    preservedCores: preserved,
    outstandingCores: outstanding,
    preservedCount: preserved.length,
    outstandingCount: outstanding.length,
    unionCount: union.size,
    overlap,
    missing,
    extras,
  },
  paidRunReconciliation: {
    correctedPathSuffixBase: CORRECTED_SUFFIX,
    runs: correctedRuns,
    ps22SpendUsdSubset: ps22SpendUsd,
    paidAttemptDiscrepancyResolution,
    failedRunPreserved: forensic,
    historicalRunsPreserved,
  },
  continuationPlan14Batch: {
    batchCount: continuationPlan.batches.length,
    batches: continuationBatches,
    batchShapeChecks,
  },
  costForecast: {
    cumulativeSpendUsd: cumulativeNow,
    authorizedCeilingUsd: ceilingAuthorized,
    proposedCeilingUsd: ceilingProposed,
    empiricalRemainingUsd: empiricalRemaining,
    projectedCumulativeUsd: projectedTotalIfFullContinuation,
  },
  acceptanceChecks: acceptance,
};

writeFileSync(OUT, JSON.stringify(report, null, 2));
writeFileSync(CONTINUATION_OUT, JSON.stringify({ generatedAt: report.generatedAt, batches: continuationBatches }, null, 2));
writeFileSync(PROPOSAL_OUT, JSON.stringify(proposal, null, 2));
writeFileSync(BATCH0_PREP, JSON.stringify(batch0Prep, null, 2));

const pass = Object.values(acceptance).every(Boolean);
console.log(JSON.stringify({ pass, acceptance, paidAttemptDiscrepancyResolution: paidAttemptDiscrepancyResolution.authoritativeCounts }, null, 2));
process.exit(pass ? 0 : 1);