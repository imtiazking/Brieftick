#!/usr/bin/env node
/**
 * Authorised PS26/1 five-operative accuracy test (≤$0.20, no retry).
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runAs, STAGING_ORIGIN } from './staging-user-sessions.mjs';
import {
  assertExtractionOutputBudget,
  estimateStructuredOutputTokens,
} from '../../lib/ri/ai/extraction-output-preflight.mjs';
import {
  assessBatchProvisionCompleteness,
  suppliedProvisionCoresFromGrounding,
} from '../../lib/ri/ai/provision-assessment-completeness.mjs';

const PUB = '829c5472-953a-40ff-9628-947afbfe4e7a';
const SUFFIX = process.env.PS26_LIVE_SUFFIX?.trim() || 'live-ps26-five-operative-v3-2026-11-23';
const TARGET_CORES = ['4.2A.3R', '4.2A.6R', '4.2A.7R', '7.20.3R', '7.20.1R'];
const MAX_USD = 0.2;
const MAX_SECTIONS = 6;
const EVIDENCE = resolve(process.cwd(), '..', '..', 'docs', 'eval', 'PS26-LIVE-FIVE-OPERATIVE-2026-11-23.json');
const MARKER = join(process.env.LOCALAPPDATA || '.', 'forgeniq-uat-sessions', `${SUFFIX}.started`);

if (existsSync(MARKER)) {
  console.error(JSON.stringify({ ok: false, code: 'no_retry', marker: MARKER }));
  process.exit(2);
}

const log = [];
const record = (step, payload) => {
  log.push({ step, at: new Date().toISOString(), ...payload });
  writeFileSync(EVIDENCE, JSON.stringify({ suffix: SUFFIX, targetCores: TARGET_CORES, maxUsd: MAX_USD, log }, null, 2));
};

await runAs('A', async ({ page }) => {
  const cores = encodeURIComponent(TARGET_CORES.join(','));
  const planRes = await page.request.get(
    `${STAGING_ORIGIN}/api/ri-lab/publications/${PUB}/extraction-batch-plan?maxSectionsPerBatch=${MAX_SECTIONS}&maxBatches=2&targetProvisionCores=${cores}&fullPublicationCoverage=false`,
  );
  const plan = (await planRes.json().catch(() => ({}))).plan;
  record('plan', { batches: plan?.batches?.length, batch0Provisions: plan?.batches?.[0]?.instrumentProvisionsNewlySupplied?.length });
  const provisionCount = TARGET_CORES.length;
  const preflight = assertExtractionOutputBudget({
    estimateTokens: estimateStructuredOutputTokens({ provisionCount, sectionCount: MAX_SECTIONS }),
    maxOutputTokens: 8192,
  });
  record('preflight', preflight);
  if (!preflight.ok) throw new Error(`preflight blocked: ${preflight.code}`);

  await page.goto(`${STAGING_ORIGIN}/design-lab/regulatory-intelligence/index.html#/changes`, { waitUntil: 'domcontentloaded' });
  const panel = page.locator('[data-connected-create-change]');
  await panel.waitFor({ timeout: 60_000 });
  await panel.locator('[data-create-change-mode][value="uat_authorised"]').check();
  await panel.locator('[data-create-change-pub-trigger]').click();
  await panel.locator('[data-create-change-publication-search]').fill('PS26/1');
  await panel.locator(`[data-create-change-pub-option][data-pub-id="${PUB}"]`).click();
  await panel.locator('[data-create-change-title]').fill(`PS26 five-operative accuracy — ${SUFFIX}`);
  await panel.locator('[data-create-change-type]').fill('Policy update');
  await panel.locator('[data-connected-create-change-submit]').click();
  await page.waitForURL(/#\/change\/[0-9a-f-]{36}/, { timeout: 90_000 });
  const changeId = page.url().match(/#\/change\/([0-9a-f-]{36})/)?.[1];
  record('change', { changeId });

  mkdirSync(join(MARKER, '..'), { recursive: true });
  const extract = await page.request.post(`${STAGING_ORIGIN}/api/ri-lab/ai-analysis-runs`, {
    timeout: 360_000,
    data: {
      publicationId: PUB,
      useCaseId: 'UC-RI-005',
      targetEntityId: changeId,
      idempotencyKeySuffix: SUFFIX,
      extractionBatchIndex: 0,
      maxSectionsPerBatch: MAX_SECTIONS,
      targetProvisionCores: TARGET_CORES,
    },
  });
  const exBody = await extract.json().catch(() => ({}));
  record('extract', { http: extract.status(), exBody });
  if (!exBody.runId) throw new Error(`extract failed: ${JSON.stringify(exBody)}`);
  if (exBody.reused) throw new Error('idempotency reuse — no retry');
  writeFileSync(MARKER, `${new Date().toISOString()} ${exBody.runId}\n`, { flag: 'wx' });

  const started = Date.now();
  let last;
  while (Date.now() - started < 360_000) {
    last = await (await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/ai-analysis-runs/${exBody.runId}`)).json().catch(() => ({}));
    const status = String(last?.aiAnalysisRun?.executionStatus || last?.detail?.execution_status || '').toUpperCase();
    if (['COMPLETED', 'FAILED', 'VALIDATION_FAILED'].includes(status)) break;
    await page.waitForTimeout(4000);
  }
  const status = String(last?.aiAnalysisRun?.executionStatus || last?.detail?.execution_status || '').toUpperCase();
  const out = last?.detail?.structured_output || {};
  const spend =
    out?._forgeniqLabSpendAudit?.calculatedUsd ?? out?._forgeniqLabSpendAudit?.actualUsd ?? out?._forgeniqSpend?.costUsdEstimate;
  const supplied = suppliedProvisionCoresFromGrounding(out._forgeniqGrounding || {});
  const completeness =
    out._forgeniqProvisionCompleteness ||
    assessBatchProvisionCompleteness({
      suppliedCores: supplied.length ? supplied : TARGET_CORES,
      candidates: out.candidates || [],
      claims: out.claims || [],
    });
  const assessmentRows = out._forgeniqProvisionAssessments || completeness.assessments || [];
  const structuredFive = TARGET_CORES.filter((core) => {
    const a = assessmentRows.find((x) => x.provisionCore === core);
    return a?.outcome === 'assessed_structured';
  });
  const gate = {
    schemaOk: status === 'COMPLETED',
    spendOk: Number(spend) <= MAX_USD + 0.02,
    batchCompletenessOk: completeness.batchCompletenessOk === true,
    regulatoryAccuracySuccess: completeness.regulatoryAccuracySuccess === true,
    fiveStructured: structuredFive.length,
    passesQualityGate:
      status === 'COMPLETED' &&
      completeness.regulatoryAccuracySuccess === true &&
      completeness.batchCompletenessOk === true &&
      structuredFive.length === TARGET_CORES.length,
  };
  record('terminal', { status, spend, runId: exBody.runId, completeness, gate, structuredFive });
  writeFileSync(
    EVIDENCE,
    JSON.stringify(
      {
        suffix: SUFFIX,
        targetCores: TARGET_CORES,
        maxUsd: MAX_USD,
        runId: exBody.runId,
        spendUsd: spend,
        gate,
        log,
      },
      null,
      2,
    ),
  );
  if (status !== 'COMPLETED') throw new Error(`run ${status}`);
  if (!gate.spendOk) throw new Error(`spend ${spend} exceeds cap`);
  console.log(JSON.stringify({ ok: true, runId: exBody.runId, spend, gate }, null, 2));
  if (!gate.passesQualityGate) process.exit(3);
});