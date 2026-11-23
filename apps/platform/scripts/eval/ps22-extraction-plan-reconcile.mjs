#!/usr/bin/env node
/**
 * PS22 plan migration reconcile — legacy 17-batch vs capped 18-batch, preserve 65 succeeded cores,
 * reallocate failed batch 5 (run 9fd62178). No paid calls.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { extractRegulatoryPdfContent } from '../../../../integrations/regulatory-sources/core/regulatory-pdf-extract.mjs';
import { buildPdfEvidenceBlocks } from '../../../../integrations/regulatory-sources/core/pdf-evidence-blocks.mjs';
import { detectLegalInstrumentStartPage } from '../../lib/ri/classification/provision-eligibility.mjs';
import { buildPublicationExtractionBatchPlan } from '../../lib/ri/ai/extraction-batch-plan.mjs';
import {
  assertBatchProvisionOutputBudget,
  assertExtractionOutputBudget,
  estimateStructuredOutputTokens,
} from '../../lib/ri/ai/extraction-output-preflight.mjs';
import { estimateBatchCostUsd } from '../../lib/ri/ai/publication-extraction-orchestrator.mjs';

const OUT = join(REPO_ROOT, 'docs/eval/PS22-9-PLAN-RECONCILE-2026-11-23.json');
const FORENSIC = join(REPO_ROOT, 'docs/eval/fixtures/ps22-batch5-run-9fd62178-forensic.json');
const EVIDENCE_DIR = join(REPO_ROOT, 'docs/eval');
const PUB_ID = '7a73ac4c-d6b4-4411-9f6d-1276053f2831';
const PILOT_AVG_USD_PER_BATCH = 0.095;
const INSTRUMENT_TOTAL = 242;

function normalizeCore(core) {
  return String(core || '').replace(/\s+/g, '').replace(/^PRIN(?=2A\.)/i, '');
}

function planAllocationMap(plan) {
  const byCore = new Map();
  const byBatch = [];
  for (const b of plan.batches || []) {
    const cores = [...(b.instrumentProvisionsNewlySupplied || [])];
    byBatch.push({ batchIndex: b.batchIndex, cores, count: cores.length });
    for (const c of cores) byCore.set(normalizeCore(c), { batchIndex: b.batchIndex, raw: c });
  }
  return { byCore, byBatch, batchCount: plan.batches?.length ?? 0 };
}

function loadOrchestrationLedger() {
  const batchFiles = readdirSync(EVIDENCE_DIR)
    .filter((f) => /^PS22-9-BATCH\d+-CORRECTED/.test(f))
    .sort();
  const latest = batchFiles[batchFiles.length - 1];
  const raw = JSON.parse(readFileSync(join(EVIDENCE_DIR, latest), 'utf8'));
  const orch = raw.orchestration || raw.log?.find((l) => l.orchestration)?.orchestration;
  const nested = raw.log?.slice(-1)[0]?.orchestration;
  return { file: latest, state: orch || nested || null, gate: raw.gate, batchIndex: raw.batchIndex, runId: raw.runId };
}

function loadSucceededBatchGates() {
  const rows = [];
  for (const f of readdirSync(EVIDENCE_DIR).filter((x) => /^PS22-9-BATCH\d+-CORRECTED/.test(x))) {
    const j = JSON.parse(readFileSync(join(EVIDENCE_DIR, f), 'utf8'));
    const idx = j.batchIndex;
    if (!Number.isInteger(idx)) continue;
    rows.push({
      batchIndex: idx,
      runId: j.runId,
      idempotencySuffix: j.idempotencySuffix,
      gate: j.gate,
      succeeded: j.gate?.passesQualityGate === true && j.gate?.omissionCount === 0,
    });
  }
  return rows.sort((a, b) => a.batchIndex - b.batchIndex);
}

function parseDedupeKeys(keys) {
  const byCore = new Map();
  for (const key of keys || []) {
    const [corePart, stmtHash] = String(key).split(':');
    if (!corePart || !stmtHash) continue;
    const core = normalizeCore(corePart);
    const row = byCore.get(core) || { cores: new Set(), statementHashes: [] };
    row.cores.add(corePart);
    row.statementHashes.push(stmtHash);
    byCore.set(core, row);
  }
  return byCore;
}

const pdf = readFileSync(join(REPO_ROOT, 'integrations/regulatory-sources/fixtures/fca-ps22-9-official.pdf'));
const sourcePdfSha256 = 'fixture:fca-ps22-9-official.pdf';
const extracted = await extractRegulatoryPdfContent(pdf);
const blocks = buildPdfEvidenceBlocks(
  {
    publicationId: PUB_ID,
    extractionRevisionId: 'reconcile-local',
    sourcePdfSha256,
    extractionProfile: 'pdf_primary_v1',
  },
  extracted.structured,
);
const instrumentStartPage = detectLegalInstrumentStartPage(blocks);
const planOpts = { instrumentStartPage, maxSectionsPerBatch: 4, fullPublicationCoverage: true };

const legacyPlan = buildPublicationExtractionBatchPlan(blocks, {
  ...planOpts,
  maxProvisionsPerBatchOverride: 512,
});
const newPlan = buildPublicationExtractionBatchPlan(blocks, {
  ...planOpts,
  maxProvisionsPerBatchOverride: 16,
});

const legacy = planAllocationMap(legacyPlan);
const current = planAllocationMap(newPlan);

const ledger = loadOrchestrationLedger();
const batchGates = loadSucceededBatchGates();
const forensic = JSON.parse(readFileSync(FORENSIC, 'utf8'));
const failedBatch5Cores = (forensic.instrumentProvisionsNewlySupplied || []).map(normalizeCore);

const orchState = ledger.state;
const cumulativeSupplied = (orchState?.cumulativeSuppliedProvisionCores || []).map(normalizeCore);
const succeededBatches = (orchState?.batches || []).filter((b) => b.status === 'SUCCEEDED');
const failedBatches = (orchState?.batches || []).filter((b) => b.status === 'FAILED');
const dedupeByCore = parseDedupeKeys(orchState?.findingDedupeKeys);

const preservedSuccessfulCores = [...new Set(cumulativeSupplied)];
const check65 = preservedSuccessfulCores.length === 65;

const coresWithStructuredFindings = new Set();
for (const [core, meta] of dedupeByCore) {
  if (preservedSuccessfulCores.includes(core)) coresWithStructuredFindings.add(core);
}

const notMarkedSuccessful = failedBatch5Cores.filter((c) => !coresWithStructuredFindings.has(c));

const allCores = [...legacy.byCore.keys()].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
const moved = [];
const same = [];
for (const core of allCores) {
  const o = legacy.byCore.get(core);
  const n = current.byCore.get(core);
  if (!o || !n) continue;
  if (o.batchIndex === n.batchIndex) same.push(core);
  else moved.push({ core, legacyBatch: o.batchIndex, newBatch: n.batchIndex });
}

const planDiffOnlyInLegacyBatch5 = [];
const oldB5 = legacy.byBatch.find((b) => b.batchIndex === 5)?.cores?.map(normalizeCore) || [];
const newB5 = current.byBatch.find((b) => b.batchIndex === 5)?.cores?.map(normalizeCore) || [];
const newB6 = current.byBatch.find((b) => b.batchIndex === 6)?.cores?.map(normalizeCore) || [];
for (const c of failedBatch5Cores) {
  const inOld = oldB5.includes(c);
  const inNew5 = newB5.includes(c);
  const inNew6 = newB6.includes(c);
  planDiffOnlyInLegacyBatch5.push({
    core: c,
    legacyBatch5: inOld,
    newBatch5: inNew5,
    newBatch6: inNew6,
    reallocated: !inOld || inNew5 || inNew6,
  });
}

const continuationPlan = buildPublicationExtractionBatchPlan(blocks, {
  ...planOpts,
  startSuppliedCores: preservedSuccessfulCores,
  maxProvisionsPerBatchOverride: 16,
});

const remainingCores = [];
for (const b of continuationPlan.batches || []) {
  for (const c of b.instrumentProvisionsNewlySupplied || []) remainingCores.push(normalizeCore(c));
}

const overlapPaidRisk = remainingCores.filter((c) => preservedSuccessfulCores.includes(c));
const missingFromContinuation = failedBatch5Cores.filter((c) => !remainingCores.includes(c));

const preflightRows = [];
let preflightFail = 0;
for (const b of continuationPlan.batches || []) {
  const prov = (b.instrumentProvisionsNewlySupplied || []).length;
  const sections = Math.min(4, b.selection?.selectedSections ?? 4);
  const batchPre = assertBatchProvisionOutputBudget(prov, sections, 8192);
  const est = estimateStructuredOutputTokens({ provisionCount: prov, sectionCount: sections });
  const pre = batchPre.ok
    ? assertExtractionOutputBudget({ estimateTokens: est, maxOutputTokens: 8192 })
    : batchPre;
  if (!pre.ok) preflightFail += 1;
  preflightRows.push({
    continuationBatchIndex: b.batchIndex,
    provisionCount: prov,
    preflight: pre,
    estimateUsd: estimateBatchCostUsd(b),
  });
}

const empiricalRemainingUsd =
  Math.round(continuationPlan.batches.length * PILOT_AVG_USD_PER_BATCH * 1000) / 1000;
const tokenEstimateUsd =
  Math.round(
    continuationPlan.batches.reduce((s, b) => s + estimateBatchCostUsd(b), 0) * 1000,
  ) / 1000;

const spentSuffixes = succeededBatches.map((b) => b.idempotencySuffix).filter(Boolean);
const unprocessedCount = INSTRUMENT_TOTAL - preservedSuccessfulCores.length;

const report = {
  generatedAt: new Date().toISOString(),
  publicationId: PUB_ID,
  sourceRevisionBinding: {
    sourcePdfSha256,
    extractionProfile: 'pdf_primary_v1',
    note: 'Match paid runs by publicationId + sourcePdfSha256 / extraction revision hash — not batch index alone',
  },
  plans: {
    legacy: { batchCount: legacy.batchCount, label: 'pre-cap ~17 batch (provision override 512)' },
    current: { batchCount: current.batchCount, label: 'RI_LAB_MAX_PROVISIONS_PER_BATCH=16' },
    provisionsIdenticalSet: legacy.byCore.size === current.byCore.size,
    batchIndexMoves: moved.length,
    batchIndexUnchanged: same.length,
    movedSample: moved.slice(0, 24),
    failedLegacyBatch5: { provisionCount: oldB5.length, cores: oldB5 },
    splitNewBatches5and6: { batch5: newB5, batch6: newB6 },
  },
  ledger: {
    evidenceFile: ledger.file,
    batchesSucceeded: succeededBatches.length,
    batchesFailed: failedBatches.map((b) => ({
      batchIndex: b.batchIndex,
      runId: b.runId,
      errorCode: b.errorCode,
    })),
    preservedSuccessfulCores: preservedSuccessfulCores.length,
    preservedCountCheck65: check65,
    cumulativeSuppliedCores: preservedSuccessfulCores,
    structuredFindingCoresFromSucceededLedger: [...coresWithStructuredFindings].sort(),
    failedRun9fd62178: {
      runId: forensic.runId,
      executionStatus: forensic.executionStatus,
      mustNotCountAsSuccessful: true,
      provisionsAttempted: failedBatch5Cores,
      provisionsWithSuccessfulAssessment: notMarkedSuccessful.length === failedBatch5Cores.length ? 0 : null,
    },
    batchQualityGates: batchGates,
    spentIdempotencySuffixes: spentSuffixes,
  },
  failedBatch5Reallocation: planDiffOnlyInLegacyBatch5,
  continuation: {
    startSuppliedCores: preservedSuccessfulCores.length,
    remainingBatchCount: continuationPlan.batches.length,
    remainingProvisionCount: remainingCores.length,
    unprocessedInstrumentProvisions: unprocessedCount,
    duplicateSpendRiskOverlap: overlapPaidRisk,
    failedBatch5MissingFromContinuation: missingFromContinuation,
    preflightAllPass: preflightFail === 0,
    preflight: preflightRows,
    costEstimate: {
      empiricalUsdRemaining: empiricalRemainingUsd,
      tokenHeuristicUsdRemaining: tokenEstimateUsd,
      pilotAvgUsdPerBatch: PILOT_AVG_USD_PER_BATCH,
      batchesAlreadyPaid: succeededBatches.length,
      note: 'Do not re-pay batches 0–4; use new orchestration suffix + startSuppliedCores when authorised',
    },
  },
  acceptanceChecks: {
    preserve65: check65,
    noFailedBatch5MarkedSuccessful: notMarkedSuccessful.length === failedBatch5Cores.length,
    noDuplicateCoreInContinuation: overlapPaidRisk.length === 0,
    failedBatch5CoresScheduled: missingFromContinuation.length === 0,
    preflightPass: preflightFail === 0,
  },
};

writeFileSync(OUT, JSON.stringify(report, null, 2));
const ok = Object.values(report.acceptanceChecks).every(Boolean);
console.log(JSON.stringify({ out: OUT, pass: ok, acceptanceChecks: report.acceptanceChecks }, null, 2));
process.exit(ok ? 0 : 1);