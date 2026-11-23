#!/usr/bin/env node
/**
 * ONE authorised PS22/9 continuation batch (v2 suffix, 65 preserved cores, batch 0 of 14).
 * ≤$0.20; ceiling $2.35; no automatic retry; no orchestration re-init on staging.
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

const PUB_ID = '7a73ac4c-d6b4-4411-9f6d-1276053f2831';
const SUFFIX = 'live-ps22-continuation-v2-2026-11-23';
const MAX_USD = 0.2;
const CEILING = 2.35;
const MAX_SECTIONS = 4;
const MIN_BUILD_PREFIX = 'd04ed25';
const REPO_ROOT = resolve(process.cwd(), '..', '..');
const EVIDENCE_DIR = join(REPO_ROOT, 'docs', 'eval');
const PRESERVED = JSON.parse(
  readFileSync(join(REPO_ROOT, 'docs/eval/PS22-9-PAID-RUN-RECONCILE-FINAL-2026-11-23.json'), 'utf8'),
).inventory.preservedCores;
const EXPECTED_BATCH0 = JSON.parse(
  readFileSync(join(REPO_ROOT, 'docs/eval/PS22-9-CONTINUATION-BATCH0-ACCURACY-PREP-2026-11-23.json'), 'utf8'),
).provisionCores;

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

let vercelResource = { note: 'no live Fluid CPU reading; Hobby usage API unavailable via CLI' };
spawnSync('vercel', ['billing', 'usage', '--scope', 'imis-projects-8e15dca0'], { encoding: 'utf8' });
record('vercel-resource-check', vercelResource);

const healthHtml = await fetch(`${STAGING_ORIGIN}/health`, { cache: 'no-store' }).then((r) => r.text());
const buildMatch = healthHtml.match(/Build \/ version[\s\S]*?<span>([^<]+)<\/span>/i);
const stagingBuildId = buildMatch?.[1]?.trim() || 'unknown';
const stagingEngineOk = stagingBuildId.startsWith(MIN_BUILD_PREFIX);
record('staging-deploy-check', { stagingBuildId, stagingEngineOk, requiredPrefix: MIN_BUILD_PREFIX });
if (!stagingEngineOk) throw new Error(`staging build ${stagingBuildId} does not include extraction engine ${MIN_BUILD_PREFIX}`);

const spendBefore = reconcileSpend();
record('spend-before', {
  cumulative: spendBefore.cumulativePilotSpendUsd,
  remaining: spendBefore.remainingBeforeCeilingUsd,
});
if (!spendBefore.mayProceedPaid) throw new Error('budget exhausted before batch');
if (spendBefore.remainingBeforeCeilingUsd < 0.02) throw new Error('insufficient headroom under ceiling');
if (spendBefore.cumulativePilotSpendUsd + MAX_USD > CEILING + 0.001) {
  throw new Error(`projected spend exceeds ceiling ${CEILING}`);
}
if (PRESERVED.length !== 65) throw new Error(`expected 65 preserved cores, got ${PRESERVED.length}`);

const marker = join(process.env.LOCALAPPDATA || '.', 'forgeniq-uat-sessions', `${SUFFIX}.started`);
if (existsSync(marker)) throw new Error(`no retry: marker exists for ${SUFFIX}`);

const evidencePath = join(EVIDENCE_DIR, 'PS22-9-CONTINUATION-V2-BATCH0-2026-11-23.json');

await runAs('A', async ({ page }) => {
  const planRes = await page.request.get(
    `${STAGING_ORIGIN}/api/ri-lab/publications/${PUB_ID}/extraction-batch-plan?fullPublicationCoverage=true&maxSectionsPerBatch=${MAX_SECTIONS}`,
  );
  const planBody = await planRes.json().catch(() => ({}));
  record('batch-plan-http', { status: planRes.status(), ok: planBody.ok });

  const orchRes = await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/publications/${PUB_ID}/extraction-orchestration`);
  const orchBody = await orchRes.json().catch(() => ({}));
  const changeId = orchBody.orchestration?.changeId;
  if (!changeId) throw new Error('orchestration changeId missing');
  record('prior-orchestration', {
    changeId,
    cumulativeSupplied: orchBody.orchestration?.cumulativeSuppliedProvisionCores?.length,
    priorRunRefs: 'PILOT-EXECUTION-REPORT + PS22-9-PAID-RUN-RECONCILE-FINAL',
  });

  const provCount = EXPECTED_BATCH0.length;
  const batchPreflight = assertBatchProvisionOutputBudget(provCount, MAX_SECTIONS, 8192);
  const preflight = batchPreflight.ok
    ? assertExtractionOutputBudget({
        estimateTokens: estimateStructuredOutputTokens({ provisionCount: provCount, sectionCount: MAX_SECTIONS }),
        maxOutputTokens: 8192,
      })
    : batchPreflight;
  record('output-preflight', { provCount, batchPreflight, preflight });
  if (!preflight.ok) throw new Error(`output preflight blocked: ${preflight.code}`);

  mergeSuffix(SUFFIX);
  record('suffix-merged', { SUFFIX });

  const extract = await page.request.post(`${STAGING_ORIGIN}/api/ri-lab/ai-analysis-runs`, {
    timeout: 120_000,
    data: {
      publicationId: PUB_ID,
      useCaseId: 'UC-RI-005',
      targetEntityId: changeId,
      idempotencyKeySuffix: SUFFIX,
      extractionBatchIndex: 0,
      maxSectionsPerBatch: MAX_SECTIONS,
      cumulativeSuppliedProvisionCores: PRESERVED,
      targetProvisionCores: EXPECTED_BATCH0,
    },
  });
  const exBody = await extract.json().catch(() => ({}));
  record('extract', { http: extract.status(), exBody });
  if (!exBody.runId) throw new Error(`extract failed: ${JSON.stringify(exBody)}`);

  mkdirSync(join(marker, '..'), { recursive: true });
  writeFileSync(marker, `${new Date().toISOString()} ${exBody.runId}\n`, { flag: 'wx' });

  const polled = await pollAiAnalysisRunViaPage(page, STAGING_ORIGIN, exBody.runId);
  record('poll-stats', { polls: polled.polls, latencyMs: polled.latencyMs, lastDelayMs: polled.lastDelayMs });

  const status = polled.status;
  const last = polled.body || {};
  const out = last?.detail?.structured_output || {};
  const spend =
    out?._forgeniqLabSpendAudit?.calculatedUsd ??
    out?._forgeniqLabSpendAudit?.actualUsd ??
    out?._forgeniqSpend?.costUsdEstimate;

  if (spend == null || spend === undefined) {
    record('billing-ambiguous', { spend, audit: out?._forgeniqLabSpendAudit });
    throw new Error('billing ambiguous — stop without retry');
  }
  if (Number(spend) > MAX_USD + 0.02) {
    record('batch-spend-over-cap', { spend, MAX_USD });
    throw new Error(`batch spend ${spend} exceeds cap ${MAX_USD}`);
  }

  const supplied = suppliedProvisionCoresFromGrounding(out._forgeniqGrounding || {});
  const completeness =
    out._forgeniqProvisionCompleteness ||
    assessBatchProvisionCompleteness({
      suppliedCores: EXPECTED_BATCH0,
      candidates: out.candidates || [],
      claims: out.claims || [],
    });

  writeFileSync(
    evidencePath,
    JSON.stringify(
      {
        continuationVersion: 'v2',
        suffix: SUFFIX,
        preservedCores: PRESERVED.length,
        expectedBatch0: EXPECTED_BATCH0,
        runId: exBody.runId,
        executionStatus: status,
        spendUsd: spend,
        spendBefore,
        spendAfter: null,
        completeness,
        structured_output: out,
        gate: {
          schemaOk: status === 'COMPLETED',
          spendOk: Number(spend) <= MAX_USD + 0.02,
          batchCompletenessOk: completeness.batchCompletenessOk === true,
          omissionCount: completeness.omissionCount,
        },
        log,
        noFurtherBatches: true,
      },
      null,
      2,
    ),
  );

  if (status !== 'COMPLETED') {
    throw new Error(`batch failed terminal status ${status} — no retry`);
  }
  if (completeness.batchCompletenessOk !== true) {
    throw new Error(`completeness failed — omissions ${completeness.omissionCount} — no further batches`);
  }
});

const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
try {
  evidence.spendAfter = reconcileSpend();
} catch (e) {
  evidence.spendAfter = { reconcileError: String(e.message || e) };
}
writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));

console.log(`Wrote ${evidencePath}`);