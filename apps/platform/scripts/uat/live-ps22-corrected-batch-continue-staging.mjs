#!/usr/bin/env node
/**
 * Run the next pending PS22/9 orchestration batch (batch 0 must already be COMPLETED).
 * ≤$0.20/batch; reconcile spend before extract; no retry on failure.
 *
 * Idempotency: base `live-ps22-corrected-batch0-2026-11-23` → batch n>0 suffix `…-batch-${n+1}`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runAs, STAGING_ORIGIN } from './staging-user-sessions.mjs';
import {
  assertBatchProvisionOutputBudget,
  assertExtractionOutputBudget,
  estimateStructuredOutputTokens,
} from '../../lib/ri/ai/extraction-output-preflight.mjs';
import {
  assessBatchProvisionCompleteness,
  suppliedProvisionCoresFromGrounding,
} from '../../lib/ri/ai/provision-assessment-completeness.mjs';
import { orchestrationBatchIdempotencySuffix } from '../../lib/ri/ai/publication-extraction-orchestrator.mjs';
import { pollAiAnalysisRunViaPage } from './uat-poll-ai-run.mjs';

const PUB_ID = '7a73ac4c-d6b4-4411-9f6d-1276053f2831';
const BASE_SUFFIX = 'live-ps22-corrected-batch0-2026-11-23';
const MAX_USD = 0.2;
const MAX_SECTIONS = 4;
const CEILING = 2.35;
const REPO_ROOT = resolve(process.cwd(), '..', '..');
const EVIDENCE_DIR = join(REPO_ROOT, 'docs', 'eval');

function reconcileSpend() {
  const r = spawnSync('node', ['scripts/uat/pilot-spend-reconcile-staging.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`spend reconcile failed: ${r.stderr || r.stdout}`);
  const outFile = join(REPO_ROOT, 'docs/eval/PILOT-SPEND-RECONCILE-2026-11-23.json');
  return JSON.parse(readFileSync(outFile, 'utf8'));
}

function mergeSuffix(suffix) {
  const merge = resolve(process.cwd(), 'scripts', 'staging', 'merge-staging-trial-suffixes.mjs');
  const r = spawnSync('node', [merge, suffix], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`suffix merge failed: ${r.stderr || r.stdout}`);
  return JSON.parse((r.stdout || '').trim());
}

const spendBefore = reconcileSpend();
if (!spendBefore.mayProceedPaid) throw new Error('budget exhausted before batch');
if (spendBefore.remainingBeforeCeilingUsd < 0.02) throw new Error('insufficient headroom under ceiling');

const log = [];
let evidencePath = '';
const record = (step, payload) => {
  log.push({ step, at: new Date().toISOString(), ...payload });
  if (evidencePath) writeFileSync(evidencePath, JSON.stringify({ spendBefore, log }, null, 2));
};

await runAs('A', async ({ page }) => {
  const orchRes = await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/publications/${PUB_ID}/extraction-orchestration`);
  const orchBody = await orchRes.json().catch(() => ({}));
  const orch = orchBody.orchestration;
  if (!orch?.changeId) throw new Error('orchestration missing — batch 0 must complete first');
  const succeeded = (orch.batches || []).filter((b) => b.status === 'SUCCEEDED').length;
  const nextBatch = (orch.batches || []).find((b) => b.status === 'PENDING')?.batchIndex;
  if (nextBatch == null) throw new Error('no_pending_batch');
  const idem = orchestrationBatchIdempotencySuffix(BASE_SUFFIX, nextBatch);
  evidencePath = join(EVIDENCE_DIR, `PS22-9-BATCH${nextBatch}-CORRECTED-2026-11-23.json`);
  record('orchestration', { changeId: orch.changeId, nextBatch, succeededBatches: succeeded, idempotencySuffix: idem });

  const planRes = await page.request.get(
    `${STAGING_ORIGIN}/api/ri-lab/publications/${PUB_ID}/extraction-batch-plan?fullPublicationCoverage=true&maxSectionsPerBatch=${MAX_SECTIONS}`,
  );
  const plan = (await planRes.json().catch(() => ({}))).plan;
  const batchPlan = plan?.batches?.[nextBatch];
  const provisionCount = batchPlan?.instrumentProvisionsNewlySupplied?.length ?? 0;
  const sections = Math.min(MAX_SECTIONS, batchPlan?.selection?.selectedSections ?? MAX_SECTIONS);
  const batchPreflight = assertBatchProvisionOutputBudget(provisionCount, sections, 8192);
  const preflight = batchPreflight.ok
    ? assertExtractionOutputBudget({
        estimateTokens: estimateStructuredOutputTokens({ provisionCount, sectionCount: sections }),
        maxOutputTokens: 8192,
      })
    : batchPreflight;
  record('output-preflight', { provisionCount, batchPreflight, preflight });
  if (!preflight.ok) throw new Error(`output preflight blocked: ${preflight.code}`);

  const projectedTotal = spendBefore.cumulativePilotSpendUsd + MAX_USD;
  if (projectedTotal > CEILING + 0.001) throw new Error(`projected ${projectedTotal} exceeds ceiling ${CEILING}`);

  const capPatch = await page.request.post(`${STAGING_ORIGIN}/api/ri-lab/publications/${PUB_ID}/extraction-orchestration`, {
    data: { action: 'patch_spend_cap', spendCapUsd: CEILING },
  });
  const capBody = await capPatch.json().catch(() => ({}));
  record('spend-cap-patch', capBody);
  if (!capBody.ok) record('spend-cap-patch-failed', capBody);

  if (process.env.SKIP_SUFFIX_MERGE !== '1') {
    mergeSuffix(idem);
    record('suffix-merged', { idem });
  }

  const adv = await page.request.post(`${STAGING_ORIGIN}/api/ri-lab/publications/${PUB_ID}/extraction-orchestration`, {
    data: { action: 'advance', baseIdempotencySuffix: BASE_SUFFIX },
  });
  const step = await adv.json().catch(() => ({}));
  record('advance', step);
  if (step.code !== 'awaiting_authorised_extraction') throw new Error(`advance: ${step.code || step.error}`);
  const batchIndex = step.batchIndex;
  const idempotencySuffix = step.idempotencySuffix || idem;
  if (idempotencySuffix !== idem) record('idem-mismatch', { expected: idem, actual: idempotencySuffix });

  const orchSnap = await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/publications/${PUB_ID}/extraction-orchestration`);
  const cumulative =
    (await orchSnap.json().catch(() => ({}))).orchestration?.cumulativeSuppliedProvisionCores || [];
  const marker = join(process.env.LOCALAPPDATA || '.', 'forgeniq-uat-sessions', `${idempotencySuffix}.started`);
  mkdirSync(join(marker, '..'), { recursive: true });
  if (existsSync(marker)) throw new Error(`no retry: marker exists for ${idempotencySuffix}`);

  const extract = await page.request.post(`${STAGING_ORIGIN}/api/ri-lab/ai-analysis-runs`, {
    timeout: 120_000,
    data: {
      publicationId: PUB_ID,
      useCaseId: 'UC-RI-005',
      targetEntityId: orch.changeId,
      idempotencyKeySuffix: idempotencySuffix,
      extractionBatchIndex: batchIndex,
      maxSectionsPerBatch: MAX_SECTIONS,
      cumulativeSuppliedProvisionCores: cumulative,
    },
  });
  const exBody = await extract.json().catch(() => ({}));
  record('extract', { http: extract.status(), exBody });
  if (!exBody.runId) throw new Error(`extract failed: ${JSON.stringify(exBody)}`);
  writeFileSync(marker, `${new Date().toISOString()} ${exBody.runId}\n`, { flag: 'wx' });

  const polled = await pollAiAnalysisRunViaPage(page, STAGING_ORIGIN, exBody.runId);
  record('poll-stats', { polls: polled.polls, latencyMs: polled.latencyMs, lastDelayMs: polled.lastDelayMs });
  const status = polled.status;
  const last = polled.body || {};
  const out = last?.detail?.structured_output || {};
  const spend =
    out?._forgeniqLabSpendAudit?.calculatedUsd ?? out?._forgeniqLabSpendAudit?.actualUsd ?? out?._forgeniqSpend?.costUsdEstimate;
  const supplied = suppliedProvisionCoresFromGrounding(out._forgeniqGrounding || {});
  const expectedCores = batchPlan?.instrumentProvisionsNewlySupplied || supplied;
  const completeness =
    out._forgeniqProvisionCompleteness ||
    assessBatchProvisionCompleteness({
      suppliedCores: expectedCores.length ? expectedCores : supplied,
      candidates: out.candidates || [],
      claims: out.claims || [],
    });
  const gate = {
    schemaOk: status === 'COMPLETED',
    spendOk: Number(spend) <= MAX_USD + 0.02,
    batchCompletenessOk: completeness.batchCompletenessOk === true,
    regulatoryAccuracySuccess: completeness.regulatoryAccuracySuccess !== false,
    omissionCount: completeness.omissionCount ?? completeness.omissions?.length ?? null,
    provisionsSupplied: expectedCores.length,
    candidates: (out.candidates || []).length,
  };
  gate.passesQualityGate =
    gate.schemaOk && gate.spendOk && gate.batchCompletenessOk && (gate.omissionCount === 0 || gate.omissionCount == null);
  record('terminal', { status, spend, runId: exBody.runId, completeness, gate });

  await page.request.post(`${STAGING_ORIGIN}/api/ri-lab/publications/${PUB_ID}/extraction-orchestration`, {
    data: {
      action: 'complete_live_batch',
      batchIndex,
      runId: exBody.runId,
      executionOk: status === 'COMPLETED' && gate.passesQualityGate,
      errorCode: status !== 'COMPLETED' ? status : gate.passesQualityGate ? undefined : 'accuracy_gate_failed',
      maxSectionsPerBatch: MAX_SECTIONS,
    },
  });

  let spendAfter;
  try {
    spendAfter = reconcileSpend();
  } catch (e) {
    spendAfter = { reconcileError: String(e.message || e) };
  }
  writeFileSync(
    evidencePath,
    JSON.stringify(
      {
        batchIndex,
        idempotencySuffix,
        runId: exBody.runId,
        spendUsd: spend,
        spendAfter,
        gate,
        log,
      },
      null,
      2,
    ),
  );

  if (status !== 'COMPLETED') throw new Error(`batch ${batchIndex} ${status}`);
  if (!gate.passesQualityGate) throw new Error(`batch ${batchIndex} accuracy gate failed`);
  if (Number(spend) > MAX_USD + 0.02) throw new Error(`spend ${spend} exceeds ${MAX_USD}`);
  console.log(JSON.stringify({ ok: true, batchIndex, runId: exBody.runId, spend, spendAfter }, null, 2));
});