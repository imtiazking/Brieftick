#!/usr/bin/env node
/**
 * ONE authorised PS22/9 continuation batch (v2, batch index 1–13). ≤$0.20; ceiling $2.35; no automatic retry.
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
import { pollAiAnalysisRunViaPage } from './uat-poll-ai-run.mjs';

const BATCH_INDEX = Number(process.env.PS22_CONTINUATION_BATCH_INDEX ?? process.argv[2] ?? '1');
const PUB_ID = '7a73ac4c-d6b4-4411-9f6d-1276053f2831';
const SUFFIX =
  process.env.RI_LAB_TRIAL_IDEMPOTENCY_SUFFIX || `live-ps22-continuation-v2-batch${BATCH_INDEX}-2026-11-23`;
const MAX_USD = 0.2;
const CEILING = 2.35;
const MAX_SECTIONS = 4;
const MIN_BUILD_PREFIX = process.env.PS22_MIN_BUILD_PREFIX || 'd04ed25';
const REPO_ROOT = resolve(process.cwd(), '..', '..');
const EVIDENCE_DIR = join(REPO_ROOT, 'docs', 'eval');
const PLAN = JSON.parse(
  readFileSync(join(REPO_ROOT, 'docs/eval/PS22-9-CONTINUATION-PLAN-14-BATCH-2026-11-23.json'), 'utf8'),
);
const batchPlan = PLAN.batches.find((b) => b.batchIndex === BATCH_INDEX);
if (!batchPlan) throw new Error(`batch ${BATCH_INDEX} not in continuation plan`);
const EXPECTED = batchPlan.instrumentProvisionsNewlySupplied;
const PRESERVED = JSON.parse(
  readFileSync(join(REPO_ROOT, 'docs/eval/PS22-9-PAID-RUN-RECONCILE-FINAL-2026-11-23.json'), 'utf8'),
).inventory.preservedCores;
const BATCH0_CORES = JSON.parse(
  readFileSync(join(REPO_ROOT, 'docs/eval/PS22-9-CONTINUATION-BATCH0-ACCURACY-PREP-2026-11-23.json'), 'utf8'),
).provisionCores;

function cumulativeSuppliedForBatch(index) {
  const prior = PLAN.batches.filter((b) => b.batchIndex > 0 && b.batchIndex < index).flatMap((b) => b.instrumentProvisionsNewlySupplied);
  return [...PRESERVED, ...BATCH0_CORES, ...prior];
}

function reconcileSpend() {
  const r = spawnSync('node', ['scripts/uat/pilot-spend-reconcile-staging.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`spend reconcile failed: ${r.stderr || r.stdout}`);
  return JSON.parse(readFileSync(join(REPO_ROOT, 'docs/eval/PILOT-SPEND-RECONCILE-2026-11-23.json'), 'utf8'));
}

function mergeSuffix(suffix) {
  const r = spawnSync('node', [resolve(process.cwd(), 'scripts/staging/merge-staging-trial-suffixes.mjs'), suffix], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`suffix merge failed: ${r.stderr || r.stdout}`);
  return JSON.parse((r.stdout || '').trim());
}

const log = [];
const record = (step, payload) => log.push({ step, at: new Date().toISOString(), ...payload });
const cumulative = cumulativeSuppliedForBatch(BATCH_INDEX);

const healthHtml = await fetch(`${STAGING_ORIGIN}/health`, { cache: 'no-store' }).then((r) => r.text());
const buildMatch = healthHtml.match(/Build \/ version[\s\S]*?<span>([^<]+)<\/span>/i);
const stagingBuildId = buildMatch?.[1]?.trim() || 'unknown';
if (!stagingBuildId.startsWith(MIN_BUILD_PREFIX)) {
  throw new Error(`staging build ${stagingBuildId} does not include engine ${MIN_BUILD_PREFIX}`);
}
record('staging-deploy-check', { stagingBuildId, batchIndex: BATCH_INDEX });

const spendBefore = reconcileSpend();
record('spend-before', spendBefore);
if (!spendBefore.mayProceedPaid || spendBefore.remainingBeforeCeilingUsd < 0.02) {
  throw new Error('insufficient pilot budget headroom');
}
if (spendBefore.cumulativePilotSpendUsd + MAX_USD > CEILING + 0.001) {
  throw new Error(`projected spend exceeds ceiling ${CEILING}`);
}

const marker = join(process.env.LOCALAPPDATA || '.', 'forgeniq-uat-sessions', `${SUFFIX}.started`);
if (existsSync(marker)) throw new Error(`no retry: marker exists for ${SUFFIX}`);

const evidencePath = join(EVIDENCE_DIR, `PS22-9-CONTINUATION-V2-BATCH${BATCH_INDEX}-2026-11-23.json`);

await runAs('A', async ({ page }) => {
  const orchRes = await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/publications/${PUB_ID}/extraction-orchestration`);
  const orchBody = await orchRes.json().catch(() => ({}));
  const changeId = orchBody.orchestration?.changeId;
  if (!changeId) throw new Error('orchestration changeId missing');

  const provCount = EXPECTED.length;
  const batchPreflight = assertBatchProvisionOutputBudget(provCount, MAX_SECTIONS, 8192);
  const preflight = batchPreflight.ok
    ? assertExtractionOutputBudget({
        estimateTokens: estimateStructuredOutputTokens({ provisionCount: provCount, sectionCount: MAX_SECTIONS }),
        maxOutputTokens: 8192,
      })
    : batchPreflight;
  if (!preflight.ok) throw new Error(`output preflight blocked: ${preflight.code}`);

  mergeSuffix(SUFFIX);

  const extract = await page.request.post(`${STAGING_ORIGIN}/api/ri-lab/ai-analysis-runs`, {
    timeout: 120_000,
    data: {
      publicationId: PUB_ID,
      useCaseId: 'UC-RI-005',
      targetEntityId: changeId,
      idempotencyKeySuffix: SUFFIX,
      extractionBatchIndex: BATCH_INDEX,
      maxSectionsPerBatch: MAX_SECTIONS,
      cumulativeSuppliedProvisionCores: cumulative,
      targetProvisionCores: EXPECTED,
    },
  });
  const exBody = await extract.json().catch(() => ({}));
  if (!exBody.runId) throw new Error(`extract failed: ${JSON.stringify(exBody)}`);

  mkdirSync(join(marker, '..'), { recursive: true });
  writeFileSync(marker, `${new Date().toISOString()} ${exBody.runId}\n`, { flag: 'wx' });

  const polled = await pollAiAnalysisRunViaPage(page, STAGING_ORIGIN, exBody.runId);
  const last = polled.body || {};
  const out = last?.detail?.structured_output || {};
  const spend =
    out?._forgeniqLabSpendAudit?.calculatedUsd ??
    out?._forgeniqLabSpendAudit?.actualUsd ??
    out?._forgeniqSpend?.costUsdEstimate;
  if (spend == null) throw new Error('billing ambiguous — stop without retry');

  const completeness =
    out._forgeniqProvisionCompleteness ||
    assessBatchProvisionCompleteness({
      suppliedCores: EXPECTED,
      candidates: out.candidates || [],
      claims: out.claims || [],
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
        continuationVersion: 'v2',
        batchIndex: BATCH_INDEX,
        suffix: SUFFIX,
        preservedCores: PRESERVED.length,
        cumulativeSupplied: cumulative.length,
        expectedBatch: EXPECTED,
        runId: exBody.runId,
        executionStatus: polled.status,
        spendUsd: spend,
        spendBefore,
        spendAfter,
        completeness,
        structured_output: out,
        gate: {
          schemaOk: polled.status === 'COMPLETED',
          spendOk: Number(spend) <= MAX_USD + 0.02,
          batchCompletenessOk: completeness.batchCompletenessOk === true,
          omissionCount: completeness.omissionCount,
        },
        log,
      },
      null,
      2,
    ),
  );

  if (polled.status !== 'COMPLETED') throw new Error(`batch failed: ${polled.status}`);
  if (!completeness.batchCompletenessOk) throw new Error(`completeness failed omissions=${completeness.omissionCount}`);
  if (Number(spend) > MAX_USD + 0.02) throw new Error(`spend ${spend} over cap`);
});

console.log(JSON.stringify({ ok: true, evidencePath, batchIndex: BATCH_INDEX, suffix: SUFFIX }));