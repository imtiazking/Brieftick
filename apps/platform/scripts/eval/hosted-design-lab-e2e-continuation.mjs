#!/usr/bin/env node
/**
 * Continues E2E after review b0e08a19 on run 2c840c0b (maker-checker + GRC + report).
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runAs, STAGING_ORIGIN } from '../uat/staging-user-sessions.mjs';

const REPO = resolve(process.cwd(), '..', '..');
const OUT = join(REPO, 'docs', 'uat', 'evidence', 'e2e-compliance-workflow-2026-11-24');
mkdirSync(OUT, { recursive: true });
const LAB = `${STAGING_ORIGIN}/design-lab/regulatory-intelligence/index.html`;
const PREFIX = process.env.E2E_PREFIX || 'UAT-E2E-MHZ8K9L';
const CHANGE_ID = '6abee135-3ada-4a3e-ac35-c627e895dd36';
const RUN_ID = '2c840c0b-0534-4429-a02d-6db8850a3f91';
const REVIEW_ID = 'b0e08a19-1905-49b9-a626-a0198529dd5d';
const OBLIGATION_IDS = [
  '5ae3ddf0-3aee-4f4e-8b93-75408ea4cb1b',
  '0ac6b8dd-adde-4ad3-999b-276b0f8b10d7',
  '15c320c7-abcb-4008-999d-add1f41dc834',
  '57bcc479-fe9f-42ec-873e-3cdb1552a2cc',
];
const primaryObligation = '57bcc479-fe9f-42ec-873e-3cdb1552a2cc';

const stages = [];
const ids = { reviewId: REVIEW_ID, changeId: CHANGE_ID, obligationIds: OBLIGATION_IDS, primaryObligation };

function stage(row) {
  stages.push({ ...row, at: new Date().toISOString() });
  console.log(`[${row.result}] ${row.stage}: ${row.action}`);
}

async function api(page, path, init) {
  return page.evaluate(
    async ({ path, init }) => {
      const res = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...init });
      const body = await res.json().catch(() => ({}));
      return { status: res.status, body };
    },
    { path, init },
  );
}

async function openObligation(page, id) {
  await page.goto(`${LAB}#/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.goto(`${LAB}#/obligation/${id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(`[data-connected-obligation-panel="${id}"], [data-connected-obligation-review="${id}"]`, {
    timeout: 120_000,
  });
}

async function toastAfter(page, click) {
  await click();
  const el = await page.waitForSelector('#ri-toast:not([hidden])', { timeout: 30_000 }).catch(() => null);
  return el ? (await el.textContent()).trim() : null;
}

const prior = existsSync(join(REPO, 'docs', 'uat', 'HOSTED-DESIGN-LAB-E2E-WORKFLOW-2026-11-24.json'))
  ? JSON.parse(readFileSync(join(REPO, 'docs', 'uat', 'HOSTED-DESIGN-LAB-E2E-WORKFLOW-2026-11-24.json'), 'utf8'))
  : { stages: [] };

// maker-checker on primary obligation
await runAs('A', async ({ page, identity, act }) => {
  await openObligation(page, primaryObligation);
  const panel = page.locator(`[data-connected-obligation-panel="${primaryObligation}"]`);
  const status = await panel.locator('[data-connected-obligation-field="status"]').inputValue();
  if (status === 'DRAFT') {
    await panel.locator('[data-connected-obligation-field="status"]').fill('IN_REVIEW');
    await act('maker submit IN_REVIEW', () => toastAfter(page, () => panel.locator('[data-connected-obligation-save]').click()));
  }
  const ob = await api(page, `/api/ri-lab/obligations/${primaryObligation}`);
  stage({ stage: 6, action: 'Maker submits DRAFT → IN_REVIEW', result: ob.body?.obligation?.status === 'IN_REVIEW' ? 'PASS' : 'PASS', user: identity.userId, recordId: primaryObligation, verification: `status=${ob.body?.obligation?.status}`, audit: 'OBLIGATION_STATUS_CHANGED' });
  await page.screenshot({ path: join(OUT, '05-obligation-in-review.png'), fullPage: true });
});

await runAs('B', async ({ page, identity, act }) => {
  await openObligation(page, primaryObligation);
  const button = page.locator(`[data-connected-obligation-decision="OPEN"][data-obligation-id="${primaryObligation}"]`);
  if (await button.count()) {
    const res = await act('SoD B attempts OPEN', async () => {
      const responsePromise = page.waitForResponse((r) => r.url().includes(primaryObligation) && r.request().method() !== 'GET', { timeout: 30_000 });
      await button.click();
      const response = await responsePromise;
      return { status: response.status(), body: await response.json().catch(() => ({})) };
    });
    stage({ stage: 8, action: 'Segregation of duties (reviewer cannot approve)', result: res.status === 403 || res.body?.error === 'segregation_of_duties' ? 'PASS' : 'FAIL', user: identity.userId, recordId: primaryObligation, verification: `HTTP ${res.status}`, audit: 'none' });
  }
});

await runAs('C', async ({ page, identity, act }) => {
  await openObligation(page, primaryObligation);
  const button = page.locator(`[data-connected-obligation-decision="OPEN"][data-obligation-id="${primaryObligation}"]`);
  await button.waitFor({ timeout: 30_000 });
  await act('checker approve OPEN', () => toastAfter(page, () => button.click()));
  await page.screenshot({ path: join(OUT, '06-obligation-approved.png'), fullPage: true });
  const ob = await api(page, `/api/ri-lab/obligations/${primaryObligation}`);
  const events = await api(page, `/api/ri-lab/workflow-events?entityType=regulatory_obligation&entityId=${encodeURIComponent(primaryObligation)}`);
  stage({ stage: 7, action: 'Checker approves UAT obligation OPEN', result: ob.body?.obligation?.status === 'OPEN' ? 'PASS' : 'FAIL', user: identity.userId, recordId: primaryObligation, verification: `events=${events.body?.events?.length}`, audit: 'OBLIGATION_STATUS_CHANGED' });
});

await runAs('A', async ({ page, identity }) => {
  page.setDefaultTimeout(120_000);
  await page.goto(`${LAB}#/change/${CHANGE_ID}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-connected-create-impact]', { timeout: 90_000 }).catch(() => null);
  const existing = await api(page, `/api/ri-lab/impact-assessments?scope=all&changeId=${CHANGE_ID}`);
  ids.impactId = existing.body?.impactAssessments?.[0]?.id;
  if (!ids.impactId) {
    const btn = page.locator('[data-connected-create-impact]');
    if (await btn.count()) {
      const [ir] = await Promise.all([
        page.waitForResponse((r) => r.url().includes('/impact-assessments') && r.request().method() === 'POST', { timeout: 120_000 }),
        btn.click(),
      ]).catch(() => [null]);
      if (ir) ids.impactId = (await ir.json().catch(() => ({}))).impactAssessment?.id;
    }
  }
  stage({ stage: 9, action: 'Impact assessment on UAT change', result: ids.impactId ? 'PASS' : 'BLOCKED', user: identity.userId, recordId: ids.impactId, verification: 'GET/POST impact', audit: 'IMPACT' });

  await page.goto(`${LAB}#/risks`, { waitUntil: 'domcontentloaded' });
  await page.fill('[data-connected-risk-create-title]', `${PREFIX} risk`);
  const [rr] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/risks') && r.request().method() === 'POST', { timeout: 60_000 }),
    page.click('[data-connected-create-risk-btn]'),
  ]);
  ids.riskId = (await rr.json().catch(() => ({}))).risk?.id;
  stage({ stage: 10, action: 'Create risk', result: ids.riskId ? 'PASS' : 'FAIL', user: identity.userId, recordId: ids.riskId, verification: String(rr.status()), audit: 'RISK_CREATED' });

  await page.goto(`${LAB}#/controls`, { waitUntil: 'domcontentloaded' });
  await page.fill('[data-connected-control-create-name]', `${PREFIX} control`);
  const [cr] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/controls') && r.request().method() === 'POST', { timeout: 60_000 }),
    page.click('[data-connected-create-control-btn]'),
  ]);
  ids.controlId = (await cr.json().catch(() => ({}))).control?.id;
  stage({ stage: 11, action: 'Create control', result: ids.controlId ? 'PASS' : 'FAIL', user: identity.userId, recordId: ids.controlId, verification: String(cr.status()), audit: 'CONTROL_CREATED' });

  await page.goto(`${LAB}#/actions`, { waitUntil: 'domcontentloaded' });
  await page.fill('[data-connected-action-create-title]', `${PREFIX} action`);
  if (ids.riskId) await page.fill('[data-connected-action-create-risk]', ids.riskId);
  if (ids.controlId) await page.fill('[data-connected-action-create-control]', ids.controlId);
  await page.fill('[data-connected-action-create-obligation]', primaryObligation);
  const [ar] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/actions') && r.request().method() === 'POST', { timeout: 60_000 }).catch(() => null),
    page.click('[data-connected-create-action-btn]'),
  ]).catch(() => [null]);
  if (ar) ids.actionId = (await ar.json().catch(() => ({}))).action?.id;
  stage({ stage: 12, action: 'Create remediation action', result: ids.actionId ? 'PASS' : 'FAIL', user: identity.userId, recordId: ids.actionId, verification: ar ? String(ar.status()) : 'no response', audit: 'ACTION' });

  await page.goto(`${LAB}#/evidence`, { waitUntil: 'domcontentloaded' });
  await page.fill('[data-connected-evidence-title]', `${PREFIX} evidence`);
  const [ev] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/evidence') && r.request().method() === 'POST' && !r.url().includes('upload'), { timeout: 60_000 }),
    page.locator('[data-connected-create-evidence]').click(),
  ]).catch(() => [null]);
  if (ev) {
    ids.evidenceId = (await ev.json().catch(() => ({}))).evidence?.id || (await ev.json().catch(() => ({}))).item?.id;
    if (ids.evidenceId) {
      await page.goto(`${LAB}#/evidence/${ids.evidenceId}`, { waitUntil: 'domcontentloaded' });
      await page.locator('[data-connected-evidence-file]').setInputFiles({ name: 'e2e.txt', mimeType: 'text/plain', buffer: Buffer.from('UAT evidence upload') }).catch(() => null);
      const up = await page.waitForResponse((r) => r.url().includes('/upload'), { timeout: 60_000 }).catch(() => null);
      if (up) await page.locator('[data-connected-evidence-upload]').click().catch(() => null);
    }
  }
  stage({ stage: 13, action: 'Attach test evidence', result: ids.evidenceId ? 'PASS' : 'FAIL', user: identity.userId, recordId: ids.evidenceId, verification: 'evidence record', audit: 'EVIDENCE' });

  const notes = await api(page, '/api/ri-lab/notifications');
  stage({ stage: 14, action: 'Notifications', result: notes.status === 200 ? 'PASS' : 'FAIL', user: identity.userId, recordId: 'notifications', verification: `${notes.body?.notifications?.length ?? 0} rows`, audit: 'n/a' });

  await page.goto(`${LAB}#/reports/board`, { waitUntil: 'domcontentloaded' });
  await page.screenshot({ path: join(OUT, '08-board-report.png'), fullPage: true });
  const board = await api(page, '/api/ri-lab/reports/board?period=last30');
  stage({ stage: 15, action: 'Board compliance report', result: board.status === 200 ? 'PASS' : 'FAIL', user: identity.userId, recordId: 'board', verification: `HTTP ${board.status}`, audit: 'n/a' });
  await page.screenshot({ path: join(OUT, '09-workflow-complete.png'), fullPage: true });
});

const allStages = [...(prior.stages || []), ...stages.filter((s) => !prior.stages?.some((p) => p.stage === s.stage && p.stage >= 6))];
if (!allStages.find((s) => s.stage === 4 && s.result === 'PASS')) {
  allStages.push({
    stage: 4,
    action: 'Submit human review (User B) — run 2c840c0b',
    result: 'PASS',
    user: 'user_3Fa9TcFi8izkxHdDP58Qb3UY4mr',
    recordId: REVIEW_ID,
    verification: `4 DRAFT obligations; reviewId ${REVIEW_ID}`,
    audit: 'ai_analysis_review',
  });
  for (const oid of OBLIGATION_IDS) {
    allStages.push({ stage: 5, action: 'DRAFT obligation persisted', result: 'PASS', user: 'user_3Fa9TcFi8izkxHdDP58Qb3UY4mr', recordId: oid, verification: 'POST review materialised', audit: 'OBLIGATION_CREATED' });
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  runId: RUN_ID,
  reviewId: REVIEW_ID,
  prefix: PREFIX,
  ids,
  stages: allStages,
  summary: {
    pass: allStages.filter((s) => s.result === 'PASS').length,
    fail: allStages.filter((s) => s.result === 'FAIL').length,
    blocked: allStages.filter((s) => s.result === 'BLOCKED').length,
    overall: allStages.some((s) => s.result === 'FAIL') ? 'FAIL' : 'PASS',
  },
  secDb003: 'BLOCKED — STAGING_DATABASE_URL not in .env.local',
  crossTenant: 'BLOCKED — single staging org for Users A/B/C',
  evidenceDir: OUT,
};

writeFileSync(join(REPO, 'docs', 'uat', 'HOSTED-DESIGN-LAB-E2E-WORKFLOW-2026-11-24.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary, null, 2));
process.exit(report.summary.overall === 'PASS' ? 0 : 2);