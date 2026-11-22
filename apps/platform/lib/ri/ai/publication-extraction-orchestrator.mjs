/**
 * RI-CLS-007 — publication-level extraction orchestration (plan → batches → consolidated review).
 */
import { createHash } from 'node:crypto';
import {
  buildPublicationExtractionBatchPlan,
  crossBatchFindingDedupeKey,
  estimateExtractionBatchTokens,
  mergeCumulativeProvisionCoverage,
} from './extraction-batch-plan.mjs';
import {
  buildInstrumentProvisionInventory,
  markProvisionsSuppliedForAnalysis,
  reconcileFindingsWithProvisionInventory,
} from '../classification/provision-inventory.mjs';

export const ORCHESTRATION_VERSION = 'publication_extraction_v1';

export function sha256Hex(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

/**
 * @param {ReturnType<typeof buildPublicationExtractionBatchPlan>} plan
 * @param {{ publicationId: string, changeId?: string, spendCapUsd?: number, maxBatches?: number }} options
 */
export function initPublicationExtractionOrchestration(plan, options) {
  const cap = Number(options.spendCapUsd);
  const spendCapUsd = Number.isFinite(cap) && cap > 0 ? cap : null;
  const batches = (plan.batches || []).map((b) => ({
    batchIndex: b.batchIndex,
    status: 'PENDING',
    runId: null,
    idempotencySuffix: null,
    errorCode: null,
    selection: b.selection,
    estimate: b.estimate,
    instrumentProvisionsOutstanding: b.instrumentProvisionsOutstanding,
    instrumentProvisionsNewlySupplied: b.instrumentProvisionsNewlySupplied || [],
  }));
  const estimatedTokens = batches.reduce((n, b) => n + (b.estimate?.estimatedTokens || 0), 0);
  const provisionInventory = Array.isArray(options.evidenceBlocks)
    ? buildInstrumentProvisionInventory(options.evidenceBlocks, plan.instrumentStartPage)
    : null;
  return {
    version: ORCHESTRATION_VERSION,
    publicationId: options.publicationId,
    changeId: options.changeId ?? null,
    status: batches.length ? 'READY' : 'UNPLANNABLE',
    planVersion: plan.planVersion,
    instrumentProvisionCount: plan.instrumentProvisionCount,
    provisionInventory: provisionInventory
      ? { instrumentStartPage: provisionInventory.instrumentStartPage, provisionCount: provisionInventory.provisions.length }
      : null,
    _provisionInventory: provisionInventory,
    maxBatches: options.maxBatches ?? batches.length,
    batches,
    cumulativeSuppliedProvisionCores: [],
    findingDedupeKeys: [],
    consolidatedFindingCount: 0,
    failedBatchIndexes: [],
    spend: {
      capUsd: spendCapUsd,
      estimatedTokens,
      batchesAttempted: 0,
      batchesSucceeded: 0,
    },
    publicationCoverageComplete: false,
    analysisScope: 'PARTIAL_INSTRUMENT_PROVISIONS',
    updatedAt: new Date().toISOString(),
  };
}

export function orchestrationBatchIdempotencySuffix(baseSuffix, batchIndex) {
  const base = String(baseSuffix || '').trim();
  if (!base) return null;
  return batchIndex === 0 ? base : `${base}-batch-${batchIndex + 1}`;
}

export function assertOrchestrationSpendCap(state, batchEstimateUsd = 0) {
  const cap = state.spend?.capUsd;
  if (cap == null) return { ok: true };
  const projected = (state.spend.batchesAttempted + 1) * batchEstimateUsd;
  if (projected > cap + 1e-6) {
    return { ok: false, code: 'extraction_spend_cap_exceeded', capUsd: cap, projectedUsd: projected };
  }
  return { ok: true };
}

/** Mark batch RUNNING — single-flight per orchestration. */
export function markBatchRunning(state, batchIndex, { runId, idempotencySuffix }) {
  const batch = state.batches.find((b) => b.batchIndex === batchIndex);
  if (!batch) return { ok: false, code: 'batch_not_found' };
  if (state.batches.some((b) => b.status === 'RUNNING')) return { ok: false, code: 'batch_already_running' };
  if (batch.status === 'SUCCEEDED') return { ok: false, code: 'batch_already_succeeded' };
  batch.status = 'RUNNING';
  batch.runId = runId;
  batch.idempotencySuffix = idempotencySuffix;
  state.status = 'RUNNING';
  state.spend.batchesAttempted += 1;
  state.updatedAt = new Date().toISOString();
  return { ok: true, batch };
}

export function markBatchOutcome(state, batchIndex, outcome) {
  const batch = state.batches.find((b) => b.batchIndex === batchIndex);
  if (!batch) return { ok: false, code: 'batch_not_found' };
  if (outcome.ok) {
    batch.status = 'SUCCEEDED';
    state.spend.batchesSucceeded += 1;
    const supplied = batch.instrumentProvisionsOutstanding
      ? state.instrumentProvisionCount - batch.instrumentProvisionsOutstanding.length
      : 0;
    if (state._provisionInventory && Array.isArray(batch.instrumentProvisionsNewlySupplied)) {
      markProvisionsSuppliedForAnalysis(state._provisionInventory, batch.instrumentProvisionsNewlySupplied, batchIndex);
    }
    if (Array.isArray(outcome.newlySuppliedCores)) {
      for (const c of outcome.newlySuppliedCores) {
        if (!state.cumulativeSuppliedProvisionCores.includes(c)) state.cumulativeSuppliedProvisionCores.push(c);
      }
    } else if (batch.selection?.instrumentProvisionsSupplied) {
      const fromPlan = mergeCumulativeProvisionCoverage([
        { instrumentProvisionsSuppliedCores: state.cumulativeSuppliedProvisionCores },
        { instrumentProvisionsSuppliedCores: [] },
      ]);
      state.cumulativeSuppliedProvisionCores = fromPlan;
    }
    void supplied;
  } else {
    batch.status = 'FAILED';
    batch.errorCode = outcome.code || 'batch_failed';
    if (!state.failedBatchIndexes.includes(batchIndex)) state.failedBatchIndexes.push(batchIndex);
  }
  const pending = state.batches.some((b) => b.status === 'PENDING' || b.status === 'RUNNING');
  const failed = state.failedBatchIndexes.length;
  state.status = pending ? (failed ? 'PARTIAL_PAUSED' : 'RUNNING') : failed ? 'PARTIAL_COMPLETE' : 'COMPLETE';
  reconcileOrchestrationCoverage(state);
  state.updatedAt = new Date().toISOString();
  return { ok: true, batch, state: snapshotOrchestration(state) };
}

export function mergeFindingsIntoOrchestration(state, findings) {
  let added = 0;
  let skipped = 0;
  if (state._provisionInventory && findings?.length) {
    state.provisionInventoryReconciliation = reconcileFindingsWithProvisionInventory(state._provisionInventory, findings);
  }
  for (const f of findings || []) {
    const key = crossBatchFindingDedupeKey(f, sha256Hex);
    if (!key) continue;
    if (state.findingDedupeKeys.includes(key)) {
      skipped += 1;
      continue;
    }
    state.findingDedupeKeys.push(key);
    added += 1;
  }
  state.consolidatedFindingCount = state.findingDedupeKeys.length;
  state.updatedAt = new Date().toISOString();
  return { added, skipped, total: state.consolidatedFindingCount };
}

export function reconcileOrchestrationCoverage(state) {
  const total = state.instrumentProvisionCount || 0;
  const supplied = state.cumulativeSuppliedProvisionCores.length;
  const outstanding = Math.max(0, total - supplied);
  const batchesDone = state.batches.every((b) => b.status === 'SUCCEEDED');
  state.publicationCoverageComplete = outstanding === 0 && batchesDone && !state.failedBatchIndexes.length;
  state.analysisScope = state.publicationCoverageComplete
    ? 'FULL_INSTRUMENT_PROVISIONS'
    : 'PARTIAL_INSTRUMENT_PROVISIONS';
  state.coverageReconciliation = {
    instrumentProvisionCount: total,
    supplied,
    outstanding,
    batchesSucceeded: state.batches.filter((b) => b.status === 'SUCCEEDED').length,
    batchesFailed: state.failedBatchIndexes.length,
    complete: state.publicationCoverageComplete,
    provisionInventory: state.provisionInventoryReconciliation?.summary ?? null,
    unresolvedProvisionCores: state.provisionInventoryReconciliation?.unresolvedCores ?? [],
  };
  return state.coverageReconciliation;
}

export function snapshotOrchestration(state) {
  const copy = JSON.parse(JSON.stringify(state));
  delete copy._provisionInventory;
  return copy;
}

export function nextPendingBatchIndex(state) {
  const batch = state.batches.find((b) => b.status === 'PENDING' || b.status === 'FAILED');
  return batch ? batch.batchIndex : null;
}

/** Est. USD per batch from token estimate (deterministic; not provider billing). */
export function estimateBatchCostUsd(batch, { usdPerThousandTokens = 0.015 } = {}) {
  const tokens = batch?.estimate?.estimatedTokens || 0;
  return Math.round((tokens / 1000) * usdPerThousandTokens * 10000) / 10000;
}

export function buildConsolidatedHumanReview(state) {
  reconcileOrchestrationCoverage(state);
  return {
    orchestrationStatus: state.status,
    publicationCoverageComplete: state.publicationCoverageComplete,
    analysisScope: state.analysisScope,
    consolidatedFindingCount: state.consolidatedFindingCount,
    dedupeKeysRecorded: state.findingDedupeKeys.length,
    coverage: state.coverageReconciliation,
    spend: state.spend,
    batches: (state.batches || []).map((b) => ({
      batchIndex: b.batchIndex,
      status: b.status,
      runId: b.runId,
      idempotencySuffix: b.idempotencySuffix,
      errorCode: b.errorCode,
      provisionsNewlySupplied: b.instrumentProvisionsNewlySupplied?.length ?? 0,
      provisionsOutstanding: b.instrumentProvisionsOutstanding?.length ?? 0,
    })),
    failedBatchIndexes: state.failedBatchIndexes,
  };
}

/**
 * Advance one batch without a provider call (acceptance / dry-run ledger).
 * Returns the next paid-run payload when simulate=false.
 */
export function advanceOrchestrationBatch(state, options = {}) {
  const {
    baseIdempotencySuffix = 'orch-batch',
    simulate = true,
    batchEstimateUsd = 0.05,
    findings = [],
  } = options;
  const batchIndex = Number.isInteger(options.batchIndex) ? options.batchIndex : nextPendingBatchIndex(state);
  if (batchIndex == null) {
    return { ok: false, code: 'no_pending_batch', review: buildConsolidatedHumanReview(state) };
  }
  const cap = assertOrchestrationSpendCap(state, batchEstimateUsd);
  if (!cap.ok) return { ...cap, review: buildConsolidatedHumanReview(state) };

  const batch = state.batches[batchIndex];
  const idempotencySuffix = orchestrationBatchIdempotencySuffix(baseIdempotencySuffix, batchIndex);

  if (!simulate) {
    return {
      ok: true,
      code: 'awaiting_authorised_extraction',
      batchIndex,
      idempotencySuffix,
      runPayload: {
        extractionBatchIndex: batchIndex,
        selection: batch.selection,
        instrumentProvisionsNewlySupplied: batch.instrumentProvisionsNewlySupplied,
      },
      review: buildConsolidatedHumanReview(state),
    };
  }

  const runId = `sim-run-${batchIndex}-${Date.now()}`;
  const start = markBatchRunning(state, batchIndex, { runId, idempotencySuffix });
  if (!start.ok) return start;

  const autoFindings =
    findings.length > 0
      ? findings
      : (batch.instrumentProvisionsNewlySupplied || []).map((core) => ({
          provisionReference: `SIM ${core}`,
          obligationStatement: `Simulated extraction for ${core}`,
          provisionCore: core,
        }));
  if (autoFindings.length) mergeFindingsIntoOrchestration(state, autoFindings);

  const outcome = markBatchOutcome(state, batchIndex, {
    ok: true,
    newlySuppliedCores: batch.instrumentProvisionsNewlySupplied || [],
  });
  return {
    ...outcome,
    review: buildConsolidatedHumanReview(state),
    simulated: true,
  };
}

/** Run pending/failed batches in simulate mode until complete, spend cap, or step limit. */
export function runOrchestrationBatchesAutomatic(state, options = {}) {
  const maxSteps = options.maxSteps ?? state.batches.length + 2;
  const steps = [];
  for (let i = 0; i < maxSteps; i += 1) {
    if (nextPendingBatchIndex(state) == null) break;
    const batch = state.batches[nextPendingBatchIndex(state)];
    const step = advanceOrchestrationBatch(state, {
      ...options,
      simulate: true,
      batchEstimateUsd: estimateBatchCostUsd(batch),
    });
    steps.push({ step: i, code: step.code, batchIndex: step.batch?.batchIndex, ok: step.ok !== false });
    if (!step.ok && step.code !== 'no_pending_batch') break;
    if (step.code === 'no_pending_batch') break;
  }
  reconcileOrchestrationCoverage(state);
  return { steps, review: buildConsolidatedHumanReview(state), state: snapshotOrchestration(state) };
}

/** Deterministic simulated batch (no provider call) for acceptance. */
export function simulateBatchExecution(state, batchIndex, { findings = [] } = {}) {
  const batch = state.batches[batchIndex];
  return advanceOrchestrationBatch(state, {
    batchIndex,
    simulate: true,
    batchEstimateUsd: estimateBatchCostUsd(batch),
    findings,
  });
}