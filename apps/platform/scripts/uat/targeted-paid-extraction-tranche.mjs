#!/usr/bin/env node
/**
 * Authorised targeted paid extractions (≤$2 combined, no retries).
 *   node scripts/uat/targeted-paid-extraction-tranche.mjs preflight-conc
 *   node scripts/uat/targeted-paid-extraction-tranche.mjs run-conc
 *   node scripts/uat/targeted-paid-extraction-tranche.mjs preflight-ps22-e
 *   node scripts/uat/targeted-paid-extraction-tranche.mjs run-ps22-e
 *   node scripts/uat/targeted-paid-extraction-tranche.mjs complete-conc <runId>
 *   node scripts/uat/targeted-paid-extraction-tranche.mjs complete-ps22-e <runId>
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runAs, STAGING_ORIGIN } from './staging-user-sessions.mjs';
import { estimateExtractionBatchTokens } from '../../lib/ri/ai/extraction-batch-plan.mjs';

const LAB = `${STAGING_ORIGIN}/design-lab/regulatory-intelligence/index.html`;
const EVIDENCE = resolve(process.cwd(), '..', '..', 'docs', 'eval', 'TARGETED-PAID-EXTRACTION-TRANCHE-2026-11-22.json');

const PS26 = {
  publicationId: '829c5472-953a-40ff-9628-947afbfe4e7a',
  suffix: 'uat-ps26-1-conc-7201r2-001',
  targetCores: ['7.20.1R', '7.20.3R'],
  requiredPages: [94, 95],
  maxSectionsPerBatch: 6,
};
const PS22 = {
  publicationId: '7a73ac4c-d6b4-4411-9f6d-1276053f2831',
  suffix: 'uat-ps22-9-e-35e-001',
  targetCores: ['2A.4.35E', '2A.4.13R'],
  requiredPages: [126],
  maxSectionsPerBatch: 6,
  bindingLinkObligationId: null,
  bindingProvision: 'PRIN 2A.4.13R',
};

const log = [];
const record = (step, payload) => {
  log.push({ step, at: new Date().toISOString(), ...payload });
  writeFileSync(EVIDENCE, JSON.stringify({ log, budgetUsdCeiling: 2 }, null, 2));
  return payload;
};

async function groundingPreview(page, pubId, targetCores) {
  return page.evaluate(
    async ({ pubId, targetCores, maxSections }) => {
      const res = await fetch('/api/ri-lab/ai-analysis-runs', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          publicationId: pubId,
          useCaseId: 'UC-RI-005',
          idempotencyKeySuffix: '__preflight_probe__',
          extractionBatchIndex: 0,
          maxSectionsPerBatch: maxSections,
          targetProvisionCores: targetCores,
        }),
      });
      const body = await res.json().catch(() => ({}));
      return { status: res.status, body };
    },
    { pubId, targetCores, maxSections: PS26.maxSectionsPerBatch },
  );
}

/** Dry-run cost from batch-plan API + local token estimate. */
async function preflightConc() {
  return runAs('A', async ({ page }) => {
    const cores = encodeURIComponent(PS26.targetCores.join(','));
    const planRes = await page.request.get(
      `${STAGING_ORIGIN}/api/ri-lab/publications/${PS26.publicationId}/extraction-batch-plan?maxSectionsPerBatch=${PS26.maxSectionsPerBatch}&maxBatches=4&targetProvisionCores=${cores}`,
    );
    const planBody = await planRes.json().catch(() => ({}));
    const batch0 = planBody.plan?.batches?.[0];
    const pages = new Set(batch0?.selection?.selectedPages || []);
    const tokens = estimateExtractionBatchTokens(batch0?.selection?.selectedCharacters || 8000);
    const estUsd = (tokens / 1000) * 0.015;
    const orch = await page.request.post(`${STAGING_ORIGIN}/api/ri-lab/publications/${PS26.publicationId}/extraction-orchestration`, {
      data: { spendCapUsd: 1, maxSectionsPerBatch: PS26.maxSectionsPerBatch, changeId: null },
    });
    const orchBody = await orch.json().catch(() => ({}));
    return record('preflight-conc', {
      planOk: planBody.ok,
      batch0Pages: [...pages].sort((a, b) => a - b),
      includesRequiredPages: PS26.requiredPages.every((p) => pages.has(p)),
      estimatedTokens: tokens,
      estimatedUsd: Math.round(estUsd * 1000) / 1000,
      orchestrationCreated: orchBody.created === true,
      targetCores: PS26.targetCores,
    });
  });
}

async function runConcExtract(changeId) {
  const marker = join(process.env.LOCALAPPDATA || '.', 'forgeniq-uat-sessions', `extraction-${PS26.suffix}.started`);
  if (existsSync(marker)) throw new Error(`${PS26.suffix} already started — no retry`);
  return runAs('A', async ({ page, identity, act }) => {
    await page.request.post(`${STAGING_ORIGIN}/api/ri-lab/publications/${PS26.publicationId}/extraction-orchestration`, {
      data: { spendCapUsd: 1, maxSectionsPerBatch: PS26.maxSectionsPerBatch, changeId },
    });
    const body = await act(`extract ${PS26.suffix}`, async () => {
      const response = await page.request.post(`${STAGING_ORIGIN}/api/ri-lab/ai-analysis-runs`, {
        timeout: 330_000,
        data: {
          publicationId: PS26.publicationId,
          useCaseId: 'UC-RI-005',
          targetEntityId: changeId,
          idempotencyKeySuffix: PS26.suffix,
          extractionBatchIndex: 0,
          maxSectionsPerBatch: PS26.maxSectionsPerBatch,
          targetProvisionCores: PS26.targetCores,
        },
      });
      const json = await response.json().catch(() => ({}));
      if (json.ok === true && json.reused !== true && json.runId) {
        writeFileSync(marker, `${new Date().toISOString()} ${json.runId}\n`, { flag: 'wx' });
      }
      return { httpStatus: response.status(), ...json };
    });
    return record('extract-conc', {
      actor: identity.userId,
      changeId,
      ...body,
      targetProvisionCores: PS26.targetCores,
    });
  });
}

async function createPs26Change() {
  return runAs('A', async ({ page, identity, act }) => {
    await page.goto(`${LAB}#/changes`, { waitUntil: 'domcontentloaded' });
    const panel = page.locator('[data-connected-create-change]');
    await panel.waitFor({ timeout: 60_000 });
    await panel.locator('[data-create-change-mode][value="uat_authorised"]').check();
    await panel.locator('[data-create-change-pub-trigger]').click();
    await panel.locator('[data-create-change-publication-search]').fill('PS26/1');
    await panel.locator(`[data-create-change-pub-option][data-pub-id="${PS26.publicationId}"]`).click();
    await panel.locator('[data-create-change-title]').fill('UAT — PS26/1 CONC 7.20.1R(2) targeted uat-ps26-1-conc-7201r2-001');
    await panel.locator('[data-create-change-type]').fill('Policy update');
    await act('create change', async () => {
      await panel.locator('[data-connected-create-change-submit]').click();
      await page.waitForURL(/#\/change\/[0-9a-f-]{36}/, { timeout: 60_000 });
    });
    const changeId = page.url().match(/#\/change\/([0-9a-f-]{36})/)?.[1];
    return record('create-change-conc', { actor: identity.userId, changeId });
  });
}

const CONC_BASIS = (ref) => `FCA Handbook ${ref}, Consumer Credit (Deferred Payment Credit) Instrument 2026 (FCA 2026/2), PS26/1 Annex F`;
const QUOTE_7201 =
  '(2) As soon as possible after a missed payment has occurred the firm must: (a) notify the borrower: (i) that the missed payment has occurred';
const STMT_7201 =
  'As soon as possible after a missed payment has occurred the firm must notify the borrower that the missed payment has occurred.';

async function completeConc(runId) {
  const review = await runAs('B', async ({ page, identity, act }) => {
    await page.goto(`${LAB}#/ai-analysis/${runId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-finding-review-item]', { timeout: 120_000 });
    const insp = await page.evaluate(async (id) => {
      const res = await fetch(`/api/ri-lab/ai-analysis-runs/${id}/findings`, { credentials: 'same-origin' });
      const body = await res.json();
      const findings = body.findings || [];
      const cross = findings.find(
        (f) =>
          (f.pages || []).includes(94) &&
          (f.pages || []).includes(95) &&
          (f.sections || []).some((s) => (s.provisionsSetOut || []).includes('7.20.1R')),
      );
      return {
        convertFindingNumber: cross?.number ?? null,
        crossPages: cross?.pages,
        sections: cross?.sections,
        findingCount: findings.length,
      };
    }, runId);
    record('inspect-conc', insp);
  const convertN = insp.convertFindingNumber;
    if (!convertN) throw new Error('No cross-page CONC 7.20.1R finding (pp.94–95) in run');
    const card = page.locator(`[data-finding-review-item][data-finding-number="${convertN}"]`);
    await card.locator('[data-finding-decision][value="ACCEPTED"]').check();
    await card.locator('[data-finding-code]').selectOption('R');
    await card.locator('[data-finding-provision-function]').selectOption('OPERATIVE_REQUIREMENT');
    await card.locator('[data-finding-provision-reference]').fill('CONC 7.20.1R');
    await card.locator('[data-finding-disposition]').selectOption('CONVERT_TO_DRAFT_OBLIGATION');
    await card.locator('[data-finding-reclassification]').fill(
      'RI-CLS-009: CONC 7.20.1R — (1) application on p.94; operative paras (2)–(4) on p.95 per FCA 2026/2 instrument; quotation from (2).',
    );
    await card.locator('[data-finding-legal-basis]').fill(CONC_BASIS('CONC 7.20.1R'));
    await card.locator('[data-finding-obligation-statement]').fill(STMT_7201);
    await card.locator('[data-finding-quotation]').fill(QUOTE_7201);
    const pageOpts = await card.locator('[data-finding-page] option').allTextContents();
    const p95 = pageOpts.find((o) => o.includes('95')) ? '95' : pageOpts[1];
    if (p95) await card.locator('[data-finding-page]').selectOption(p95);
    await card.locator('[data-finding-comment]').fill(
      `Targeted CONC 7.20.1R(2) ${PS26.suffix}; convert finding ${convertN} only.`,
    );
    const count = await page.locator('[data-finding-review-item]').count();
    for (let n = 1; n <= count; n++) {
      if (n === convertN) continue;
      const c = page.locator(`[data-finding-review-item][data-finding-number="${n}"]`);
      await c.locator('[data-finding-decision][value="REJECTED"]').check();
      await c.locator('[data-finding-comment]').fill('Out of scope for targeted CONC 7.20.1R(2) run.');
    }
    await page.locator('[data-finding-review-notes]').fill(`Targeted review ${PS26.suffix}`);
    const result = await act('review conc', async () => {
      const responsePromise = page.waitForResponse(
        (r) => r.url().includes(`/ai-analysis-runs/${runId}/findings`) && r.request().method() === 'POST',
        { timeout: 120_000 },
      );
      await page.locator('[data-finding-review-submit]').click();
      const response = await responsePromise;
      return { httpStatus: response.status(), ...(await response.json().catch(() => ({}))) };
    });
    return record('review-conc', { actor: identity.userId, runId, result });
  });
  const ob = (review.result?.materialised || []).find((m) => m.classificationCode === 'R')?.obligationId;
  if (!ob) throw new Error('CONC obligation not materialised');
  await runAs('A', async ({ page, act }) => {
    await page.goto(`${LAB}#/obligation/${ob}`, { waitUntil: 'domcontentloaded' });
    const panel = page.locator(`[data-connected-obligation-panel="${ob}"]`);
    await panel.locator('[data-connected-obligation-field="status"]').fill('IN_REVIEW');
    await act('submit', () => panel.locator('[data-connected-obligation-save]').click());
  });
  await runAs('C', async ({ page, identity, act }) => {
    await page.goto(`${LAB}#/obligation/${ob}`, { waitUntil: 'domcontentloaded' });
    const btn = page.locator(`[data-connected-obligation-decision="OPEN"][data-obligation-id="${ob}"]`);
    await btn.waitFor({ timeout: 60_000 });
    await act('approve', () => btn.click());
    record('approve-conc', { actor: identity.userId, obligationId: ob });
  });
  return record('complete-conc', { runId, obligationId: ob });
}

async function preflightPs22E() {
  return runAs('A', async ({ page }) => {
    const cores = encodeURIComponent(PS22.targetCores.join(','));
    const planRes = await page.request.get(
      `${STAGING_ORIGIN}/api/ri-lab/publications/${PS22.publicationId}/extraction-batch-plan?maxSectionsPerBatch=${PS22.maxSectionsPerBatch}&maxBatches=6&targetProvisionCores=${cores}`,
    );
    const planBody = await planRes.json().catch(() => ({}));
    const batch0 = planBody.plan?.batches?.[0];
    const tokens = estimateExtractionBatchTokens(batch0?.selection?.selectedCharacters || 9000);
    return record('preflight-ps22-e', {
      planOk: planBody.ok,
      instrumentProvisionCount: planBody.plan?.instrumentProvisionCount,
      estimatedTokens: tokens,
      estimatedUsd: Math.round((tokens / 1000) * 0.015 * 1000) / 1000,
      targetCores: PS22.targetCores,
      bindingProvision: PS22.bindingProvision,
      note: '35E evidential — link only to PRIN 2A.4.13R obligation from same rule block if materialised in run',
    });
  });
}

async function createPs22Change() {
  return runAs('A', async ({ page, identity, act }) => {
    await page.goto(`${LAB}#/changes`, { waitUntil: 'domcontentloaded' });
    const panel = page.locator('[data-connected-create-change]');
    await panel.waitFor({ timeout: 60_000 });
    await panel.locator('[data-create-change-mode][value="uat_authorised"]').check();
    await panel.locator('[data-create-change-pub-trigger]').click();
    await panel.locator('[data-create-change-publication-search]').fill('PS22/9');
    await panel.locator(`[data-create-change-pub-option][data-pub-id="${PS22.publicationId}"]`).click();
    await panel.locator('[data-create-change-title]').fill('UAT — PS22/9 PRIN 2A.4.35E evidential uat-ps22-9-e-35e-001');
    await act('create ps22 change', async () => {
      await panel.locator('[data-connected-create-change-submit]').click();
      await page.waitForURL(/#\/change\/[0-9a-f-]{36}/, { timeout: 60_000 });
    });
    const changeId = page.url().match(/#\/change\/([0-9a-f-]{36})/)?.[1];
    return record('create-change-ps22', { actor: identity.userId, changeId });
  });
}

async function runPs22Extract(changeId) {
  const marker = join(process.env.LOCALAPPDATA || '.', 'forgeniq-uat-sessions', `extraction-${PS22.suffix}.started`);
  if (existsSync(marker)) throw new Error(`${PS22.suffix} already started — no retry`);
  return runAs('A', async ({ page, identity, act }) => {
    await page.request.post(`${STAGING_ORIGIN}/api/ri-lab/publications/${PS22.publicationId}/extraction-orchestration`, {
      data: { spendCapUsd: 1, maxSectionsPerBatch: PS22.maxSectionsPerBatch, changeId },
    });
    const body = await act(`extract ${PS22.suffix}`, async () => {
      const response = await page.request.post(`${STAGING_ORIGIN}/api/ri-lab/ai-analysis-runs`, {
        timeout: 330_000,
        data: {
          publicationId: PS22.publicationId,
          useCaseId: 'UC-RI-005',
          targetEntityId: changeId,
          idempotencyKeySuffix: PS22.suffix,
          extractionBatchIndex: 0,
          maxSectionsPerBatch: PS22.maxSectionsPerBatch,
          targetProvisionCores: PS22.targetCores,
        },
      });
      const json = await response.json().catch(() => ({}));
      if (json.ok === true && json.reused !== true && json.runId) {
        writeFileSync(marker, `${new Date().toISOString()} ${json.runId}\n`, { flag: 'wx' });
      }
      return { httpStatus: response.status(), ...json };
    });
    return record('extract-ps22-e', { actor: identity.userId, changeId, ...body, targetProvisionCores: PS22.targetCores });
  });
}

async function completePs22E(runId) {
  throw new Error('Use scripts/uat/ps22-evidential-binding-correction.mjs for PRIN 2A.4.35E (do not link to 68051a63)');
}

async function runConcPipeline() {
  const pf = await preflightConc();
  if (!pf.includesRequiredPages) throw new Error(`pages ${PS26.requiredPages} not in batch0: ${pf.batch0Pages}`);
  const { changeId } = await createPs26Change();
  const ext = await runConcExtract(changeId);
  if (!ext.runId) throw new Error(JSON.stringify(ext));
  return completeConc(ext.runId);
}

async function runPs22Pipeline() {
  await preflightPs22E();
  const { changeId } = await createPs22Change();
  const ext = await runPs22Extract(changeId);
  if (!ext.runId) throw new Error(JSON.stringify(ext));
  return completePs22E(ext.runId);
}

mkdirSync(resolve(process.cwd(), '..', '..', 'docs', 'eval'), { recursive: true });
const [cmd, arg] = process.argv.slice(2);
const cmds = {
  'preflight-conc': preflightConc,
  'run-conc': runConcPipeline,
  'preflight-ps22-e': preflightPs22E,
  'run-ps22-e': runPs22Pipeline,
  'complete-conc': () => completeConc(arg),
  'complete-ps22-e': () => completePs22E(arg),
};
if (!cmds[cmd]) {
  console.error(`usage: ${Object.keys(cmds).join(' | ')}`);
  process.exit(2);
}
cmds[cmd]().then(
  (r) => console.log(JSON.stringify(r, null, 2)),
  (e) => {
    console.error(e);
    record('failed', { cmd, message: String(e?.message || e) });
    process.exit(1);
  },
);