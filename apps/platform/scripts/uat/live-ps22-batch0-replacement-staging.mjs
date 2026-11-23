#!/usr/bin/env node
/**
 * Authorised ONE replacement PS22/9 batch-0 (fresh suffix, ≤$0.25). Historical failed run preserved.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runAs, STAGING_ORIGIN } from './staging-user-sessions.mjs';
import {
  assertExtractionOutputBudget,
  estimateStructuredOutputTokens,
} from '../../lib/ri/ai/extraction-output-preflight.mjs';

const PUB_ID = '7a73ac4c-d6b4-4411-9f6d-1276053f2831';
const SUFFIX = 'live-ps22-corrected-batch0-2026-11-23';
const MAX_USD = 0.2;
const MAX_SECTIONS = 4;
const EVIDENCE = resolve(process.cwd(), '..', '..', 'docs', 'eval', 'PS22-9-BATCH0-REPLACEMENT-2026-11-23.json');
const FAILED_HISTORICAL = '147574c3-229a-42e3-9adb-fd480b905d3b';

const log = [];
const record = (step, payload) => {
  log.push({ step, at: new Date().toISOString(), ...payload });
  writeFileSync(EVIDENCE, JSON.stringify({ historicalFailedRunId: FAILED_HISTORICAL, suffix: SUFFIX, maxUsd: MAX_USD, log }, null, 2));
};

await runAs('A', async ({ page }) => {
  const planRes = await page.request.get(
    `${STAGING_ORIGIN}/api/ri-lab/publications/${PUB_ID}/extraction-batch-plan?fullPublicationCoverage=true&maxSectionsPerBatch=${MAX_SECTIONS}`,
  );
  const plan = (await planRes.json().catch(() => ({}))).plan;
  record('plan', { inventory: plan?.instrumentProvisionCount, batches: plan?.batches?.length });
  const provisionCount = plan?.batches?.[0]?.instrumentProvisionsNewlySupplied?.length ?? 0;
  const preflight = assertExtractionOutputBudget({
    estimateTokens: estimateStructuredOutputTokens({
      provisionCount,
      sectionCount: Math.min(MAX_SECTIONS, plan?.batches?.[0]?.selection?.selectedSections ?? MAX_SECTIONS),
    }),
    maxOutputTokens: 8192,
  });
  record('output-preflight', preflight);
  if (!preflight.ok) throw new Error(`output preflight blocked: ${preflight.code}`);

  await page.goto(`${STAGING_ORIGIN}/design-lab/regulatory-intelligence/index.html#/changes`, { waitUntil: 'domcontentloaded' });
  const panel = page.locator('[data-connected-create-change]');
  await panel.waitFor({ timeout: 60_000 });
  await panel.locator('[data-create-change-mode][value="uat_authorised"]').check();
  await panel.locator('[data-create-change-pub-trigger]').click();
  await panel.locator('[data-create-change-publication-search]').fill('PS22/9');
  await panel.locator(`[data-create-change-pub-option][data-pub-id="${PUB_ID}"]`).click();
  await panel.locator('[data-create-change-title]').fill(`PS22/9 replacement batch 0 — ${SUFFIX}`);
  await panel.locator('[data-create-change-type]').fill('Policy update');
  await panel.locator('[data-connected-create-change-submit]').click();
  await page.waitForURL(/#\/change\/[0-9a-f-]{36}/, { timeout: 90_000 });
  const changeId = page.url().match(/#\/change\/([0-9a-f-]{36})/)?.[1];
  record('change', { changeId });

  await page.request.post(`${STAGING_ORIGIN}/api/ri-lab/publications/${PUB_ID}/extraction-orchestration`, {
    data: {
      spendCapUsd: MAX_USD,
      maxSectionsPerBatch: MAX_SECTIONS,
      fullPublicationCoverage: true,
      changeId,
      baseIdempotencySuffix: SUFFIX,
    },
  });

  const adv = await page.request.post(`${STAGING_ORIGIN}/api/ri-lab/publications/${PUB_ID}/extraction-orchestration`, {
    data: { action: 'advance', baseIdempotencySuffix: SUFFIX },
  });
  const step = await adv.json().catch(() => ({}));
  record('advance', step);
  if (step.code !== 'awaiting_authorised_extraction') throw new Error(`advance: ${step.code || step.error}`);

  const orchSnap = await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/publications/${PUB_ID}/extraction-orchestration`);
  const cumulative =
    (await orchSnap.json().catch(() => ({}))).orchestration?.cumulativeSuppliedProvisionCores || [];
  const idem = step.idempotencySuffix || SUFFIX;
  const marker = join(process.env.LOCALAPPDATA || '.', 'forgeniq-uat-sessions', `${idem}.started`);
  mkdirSync(join(marker, '..'), { recursive: true });

  const extract = await page.request.post(`${STAGING_ORIGIN}/api/ri-lab/ai-analysis-runs`, {
    timeout: 120_000,
    data: {
      publicationId: PUB_ID,
      useCaseId: 'UC-RI-005',
      targetEntityId: changeId,
      idempotencyKeySuffix: idem,
      extractionBatchIndex: 0,
      maxSectionsPerBatch: MAX_SECTIONS,
      cumulativeSuppliedProvisionCores: cumulative,
    },
  });
  const exBody = await extract.json().catch(() => ({}));
  record('extract', { http: extract.status(), exBody });
  if (!exBody.runId) throw new Error(`extract failed: ${JSON.stringify(exBody)}`);
  writeFileSync(marker, `${new Date().toISOString()} ${exBody.runId}\n`, { flag: 'wx' });

  const started = Date.now();
  let last;
  while (Date.now() - started < 360_000) {
    const res = await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/ai-analysis-runs/${exBody.runId}`);
    last = await res.json().catch(() => ({}));
    const status = String(last?.aiAnalysisRun?.executionStatus || last?.detail?.execution_status || '').toUpperCase();
    if (['COMPLETED', 'FAILED', 'VALIDATION_FAILED'].includes(status)) break;
    await page.waitForTimeout(4000);
  }
  const status = String(last?.aiAnalysisRun?.executionStatus || last?.detail?.execution_status || '').toUpperCase();
  const spend = last?.detail?.structured_output?._forgeniqLabSpendAudit?.calculatedUsd;
  record('terminal', { status, spend, errorCode: last?.detail?.error_code, runId: exBody.runId });

  await page.request.post(`${STAGING_ORIGIN}/api/ri-lab/publications/${PUB_ID}/extraction-orchestration`, {
    data: {
      action: 'complete_live_batch',
      batchIndex: 0,
      runId: exBody.runId,
      executionOk: status === 'COMPLETED',
      errorCode: status !== 'COMPLETED' ? status : undefined,
      maxSectionsPerBatch: MAX_SECTIONS,
    },
  });

  if (status !== 'COMPLETED') throw new Error(`replacement batch ${status}`);
  if (Number(spend) > MAX_USD + 0.02) throw new Error(`spend ${spend} exceeds ${MAX_USD}`);
  console.log(JSON.stringify({ ok: true, runId: exBody.runId, spend }, null, 2));
});