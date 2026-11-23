#!/usr/bin/env node
/**
 * Authorised live full-publication extraction pilot (PS26/1 + PS22/9). Max $2 combined. No auto-retry.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runAs, STAGING_ORIGIN } from './staging-user-sessions.mjs';

const BUDGET_USD = 2;
const EVIDENCE = resolve(process.cwd(), '..', '..', 'docs', 'eval', 'LIVE-FULL-PUBLICATION-EXTRACTION-PILOT-RUN-2026-11-22.json');
const PUBLICATIONS = [
  {
    code: 'PS26/1',
    publicationId: '829c5472-953a-40ff-9628-947afbfe4e7a',
    suffix: 'live-ps26-full-2026-11-22',
    maxSectionsPerBatch: 18,
  },
  {
    code: 'PS22/9',
    publicationId: '7a73ac4c-d6b4-4411-9f6d-1276053f2831',
    suffix: 'live-ps22-full-2026-11-22',
    maxSectionsPerBatch: 18,
  },
];

const log = [];
const record = (step, payload) => {
  log.push({ step, at: new Date().toISOString(), ...payload });
  writeFileSync(EVIDENCE, JSON.stringify({ budgetUsdCeiling: BUDGET_USD, log }, null, 2));
  return payload;
};

function isTransportError(err) {
  const msg = String(err?.message || err || '');
  return /ECONNRESET|ETIMEDOUT|socket hang up|APIRequestContext\.post: read/i.test(msg);
}

async function resolveRunByIdempotency(page, publicationId, suffix, useCaseId = 'UC-RI-005') {
  const url = new URL(`${STAGING_ORIGIN}/api/ri-lab/ai-analysis-runs`);
  url.searchParams.set('publicationId', publicationId);
  url.searchParams.set('idempotencyKeySuffix', suffix);
  url.searchParams.set('useCaseId', useCaseId);
  const res = await page.request.get(url.toString(), { headers: { Accept: 'application/json' } });
  const body = await res.json().catch(() => ({}));
  if (body.ok && body.runId) return body;
  return null;
}

async function startExtractionRun(page, payload, publicationId) {
  try {
    const extract = await page.request.post(`${STAGING_ORIGIN}/api/ri-lab/ai-analysis-runs`, {
      timeout: 90_000,
      data: payload,
    });
    const exBody = await extract.json().catch(() => ({}));
    return { extract, exBody, transportError: false };
  } catch (err) {
    if (!isTransportError(err)) throw err;
    const recovered = await resolveRunByIdempotency(
      page,
      publicationId,
      payload.idempotencyKeySuffix,
      payload.useCaseId || 'UC-RI-005',
    );
    record('transport-recovery', {
      suffix: payload.idempotencyKeySuffix,
      recovered: Boolean(recovered?.runId),
      executionStatus: recovered?.executionStatus,
    });
    if (!recovered?.runId) throw err;
    return {
      extract: { status: () => 202 },
      exBody: {
        ok: true,
        runId: recovered.runId,
        reused: recovered.executionStatus !== 'RUNNING',
        dispatched: true,
        executionStatus: recovered.executionStatus,
      },
      transportError: true,
    };
  }
}

async function pollRun(page, runId, timeoutMs = 300_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const res = await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/ai-analysis-runs/${runId}`, {
      headers: { Accept: 'application/json' },
    });
    const body = await res.json().catch(() => ({}));
    const status = body.run?.execution_status || body.executionStatus;
    if (status === 'COMPLETED' || status === 'FAILED' || status === 'VALIDATION_FAILED') {
      return { status, body, latencyMs: Date.now() - started };
    }
    await page.waitForTimeout(4000);
  }
  return { status: 'TIMEOUT', body: null, latencyMs: Date.now() - started };
}

async function createChange(page, pub) {
  const LAB = `${STAGING_ORIGIN}/design-lab/regulatory-intelligence/index.html`;
  await page.goto(`${LAB}#/changes`, { waitUntil: 'domcontentloaded' });
  const panel = page.locator('[data-connected-create-change]');
  await panel.waitFor({ timeout: 60_000 });
  await panel.locator('[data-create-change-mode][value="uat_authorised"]').check();
  await panel.locator('[data-create-change-pub-trigger]').click();
  await panel.locator('[data-create-change-publication-search]').fill(pub.code);
  await panel.locator(`[data-create-change-pub-option][data-pub-id="${pub.publicationId}"]`).click();
  await panel.locator('[data-create-change-title]').fill(`Live pilot — ${pub.code} ${pub.suffix}`);
  await panel.locator('[data-create-change-type]').fill('Policy update');
  await panel.locator('[data-connected-create-change-submit]').click();
  await page.waitForURL(/#\/change\/[0-9a-f-]{36}/, { timeout: 90_000 });
  return page.url().match(/#\/change\/([0-9a-f-]{36})/)?.[1];
}

async function runPublication(page, identity, pub, spendRemaining) {
  const planRes = await page.request.get(
    `${STAGING_ORIGIN}/api/ri-lab/publications/${pub.publicationId}/extraction-batch-plan?fullPublicationCoverage=true&maxSectionsPerBatch=${pub.maxSectionsPerBatch}`,
  );
  const plan = (await planRes.json().catch(() => ({}))).plan;
  const inventory = plan?.instrumentProvisionCount;
  const batchCount = plan?.batches?.length;
  record(`${pub.code}-reconcile`, {
    inventory,
    plannedBatches: batchCount,
    publicationCoverageCompletePlanned: plan?.publicationCoverageComplete,
    batchLimitReached: plan?.batchLimitReached,
  });
  if (!inventory || !batchCount) throw new Error(`${pub.code} plan/inventory reconcile failed`);

  const changeId = await createChange(page, pub);
  record(`${pub.code}-change`, { changeId, actor: identity.userId });

  await page.request.post(`${STAGING_ORIGIN}/api/ri-lab/publications/${pub.publicationId}/extraction-orchestration`, {
    data: {
      spendCapUsd: Math.min(spendRemaining, 1.2),
      maxSectionsPerBatch: pub.maxSectionsPerBatch,
      fullPublicationCoverage: true,
      changeId,
    },
  });

  const batches = [];
  let totalLatency = 0;
  for (let guard = 0; guard < 64; guard += 1) {
    const adv = await page.request.post(
      `${STAGING_ORIGIN}/api/ri-lab/publications/${pub.publicationId}/extraction-orchestration`,
      { data: { action: 'advance', baseIdempotencySuffix: pub.suffix } },
    );
    const step = await adv.json().catch(() => ({}));
    if (step.code === 'no_pending_batch') break;
    if (step.code !== 'awaiting_authorised_extraction') {
      record(`${pub.code}-advance-stop`, step);
      throw new Error(`${pub.code} advance stopped: ${step.code || step.error || JSON.stringify(step)}`);
    }
    const batchIndex = step.batchIndex;
    const payload = step.runPayload || {};
    const orchSnap = await page.request.get(
      `${STAGING_ORIGIN}/api/ri-lab/publications/${pub.publicationId}/extraction-orchestration`,
    );
    const cumulative = (await orchSnap.json().catch(() => ({}))).orchestration?.cumulativeSuppliedProvisionCores || [];
    const idem = step.idempotencySuffix || `${pub.suffix}-batch-${batchIndex + 1}`;
    const marker = join(process.env.LOCALAPPDATA || '.', 'forgeniq-uat-sessions', `${idem}.started`);
    const requestPayload = {
      publicationId: pub.publicationId,
      useCaseId: 'UC-RI-005',
      targetEntityId: changeId,
      idempotencyKeySuffix: idem,
      extractionBatchIndex: payload.extractionBatchIndex ?? batchIndex,
      maxSectionsPerBatch: pub.maxSectionsPerBatch,
      cumulativeSuppliedProvisionCores: cumulative,
    };
    let exBody;
    let extract;
    if (existsSync(marker)) {
      const prior = await resolveRunByIdempotency(page, pub.publicationId, idem);
      if (!prior?.runId) throw new Error(`no retry: ${idem} marker present but run not found`);
      exBody = { ok: true, runId: prior.runId, reused: true, executionStatus: prior.executionStatus };
      extract = { status: () => 200 };
      record(`${pub.code}-resume-marker`, { idem, runId: prior.runId, status: prior.executionStatus });
    } else {
      ({ extract, exBody } = await startExtractionRun(page, requestPayload, pub.publicationId));
      if (exBody.runId) {
        try {
          writeFileSync(marker, `${new Date().toISOString()} ${exBody.runId}\n`, { flag: 'wx' });
        } catch {
          /* concurrent write — reconcile via idempotency */
        }
      }
    }
    if (!exBody.runId) {
      record(`${pub.code}-extract-fail`, { batchIndex, idem, exBody });
      throw new Error(`${pub.code} batch ${batchIndex} extract failed — no retry`);
    }
    const polled = await pollRun(page, exBody.runId);
    totalLatency += polled.latencyMs;
    const complete = await page.request.post(
      `${STAGING_ORIGIN}/api/ri-lab/publications/${pub.publicationId}/extraction-orchestration`,
      {
        data: {
          action: 'complete_live_batch',
          batchIndex,
          runId: exBody.runId,
          executionOk: polled.status === 'COMPLETED',
          errorCode: polled.status !== 'COMPLETED' ? polled.status : undefined,
          maxSectionsPerBatch: pub.maxSectionsPerBatch,
        },
      },
    );
    const orch = (await complete.json().catch(() => ({}))).orchestration || {};
    const tokens = exBody.runId
      ? (polled.body?.run?.structured_output?._forgeniqSpend?.totalTokens ??
        polled.body?.run?.latency_ms)
      : null;
    batches.push({
      batchIndex,
      runId: exBody.runId,
      idempotencySuffix: idem,
      executionStatus: polled.status,
      latencyMs: polled.latencyMs,
      extractHttp: extract.status(),
      cumulativeSupplied: orch.cumulativeSuppliedProvisionCores?.length,
      consolidatedFindings: orch.consolidatedFindingCount,
      publicationCoverageComplete: orch.publicationCoverageComplete,
      unresolved: orch.coverageReconciliation?.unresolvedProvisionCores?.length,
    });
    record(`${pub.code}-batch-${batchIndex}`, batches.at(-1));
    if (polled.status !== 'COMPLETED') throw new Error(`${pub.code} batch ${batchIndex} ${polled.status} — no retry`);
    if (orch.publicationCoverageComplete) break;
  }

  const finalOrch = await page.request.get(
    `${STAGING_ORIGIN}/api/ri-lab/publications/${pub.publicationId}/extraction-orchestration`,
  );
  const finalBody = await finalOrch.json().catch(() => ({}));
  const o = finalBody.orchestration || {};
  return {
    publication: pub.code,
    inventory,
    plannedBatches: batchCount,
    executedBatches: batches.length,
    processingCoverageComplete: o.publicationCoverageComplete === true,
    supplied: o.cumulativeSuppliedProvisionCores?.length,
    consolidatedFindings: o.consolidatedFindingCount,
    unresolvedCores: o.coverageReconciliation?.unresolvedProvisionCores || [],
    totalLatencyMs: totalLatency,
    batches,
    accuracyNote:
      'processing coverage ≠ extraction accuracy — benchmark reconciliation recorded separately',
  };
}

async function main() {
  mkdirSync(join(EVIDENCE, '..'), { recursive: true });
  let spendUsed = 0;
  const reports = [];
  for (const pub of PUBLICATIONS) {
    const remaining = BUDGET_USD - spendUsed;
    const report = await runAs('A', async ({ page, identity }) => runPublication(page, identity, pub, remaining));
    reports.push(report);
    spendUsed += 0.4;
  }
  const totalBatches = reports.reduce((n, r) => n + (r.executedBatches || 0), 0);
  if (totalBatches === 0) throw new Error('live pilot executed zero paid batches — not a successful run');
  record('complete', { reports, spendUsedEstimate: spendUsed, withinBudget: spendUsed <= BUDGET_USD, totalBatches });
  console.log(JSON.stringify({ ok: true, reports }, null, 2));
}

main().catch((e) => {
  console.error(e);
  record('failed', { message: String(e?.message || e) });
  process.exit(1);
});