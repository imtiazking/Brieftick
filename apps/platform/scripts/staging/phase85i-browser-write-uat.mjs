#!/usr/bin/env node
/**
 * Phase 85I — Original Design Lab browser write UAT (Playwright + Clerk User A).
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { loadPlatformEnv, resolvePlatformRoot } from './load-platform-env.mjs';
import {
  createLabClerkClient,
  mintLabBrowserAuth,
  refreshLabBrowserAuth,
  probeRiLabSession,
} from './clerk-lab-browser-auth.mjs';
import {
  stagingPgClientOptions,
  validateStagingDatabaseUrl,
} from '../../lib/ri/ingestion/snapshot/staging-database-config.mjs';

const platformRoot = resolvePlatformRoot(import.meta.url);
loadPlatformEnv(platformRoot);
const outDir = join(platformRoot, 'docs', 'visual-review', 'phase-85i-browser-writes');
const ONLY_BW = process.env.FORGENIQ_UAT_BW?.trim().toUpperCase() || '';
mkdirSync(outDir, { recursive: true });

const BASE = (process.env.FORGENIQ_STAGING_BASE_URL || process.env.LOCAL_APP_URL || 'http://localhost:3000').replace(
  /\/$/,
  '',
);
const LAB = `${BASE}/design-lab/regulatory-intelligence/`;
const ORG_A = 'cd25bb17-d575-4109-8432-4b63c75f9617';
const USER_A = process.env.FORGENIQ_PROBE_CLERK_USER_ID?.trim() || 'user_3LIQIZlXNWBFEvSKabAYIUhhNdi';
const PUBLICATION_ID = process.env.FORGENIQ_UAT_85H_PUBLICATION_ID || '4d05b49b-a4a4-4101-8c87-7d3983315f25';
const PREFIX = `UAT-85I-${Date.now().toString(36).toUpperCase()}`;
const JSON_OUT = join(platformRoot, 'docs', 'STAGING-PHASE85I-BROWSER-WRITE-UAT.json');

const results = [];

function record(id, pass, detail, extra = {}) {
  results.push({ id, pass: Boolean(pass), detail, ...extra });
}

function shouldRun(stepId) {
  if (!ONLY_BW) return true;
  return ONLY_BW === stepId || ONLY_BW.startsWith(`${stepId}-`);
}

async function apiGet(jwt, orgCookie, path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${jwt}`,
      Cookie: `forgeniq_active_org=${orgCookie}`,
    },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function pgRow(sql, params) {
  const raw = process.env.FORGENIQ_LOCAL_PG_URL || process.env.DATABASE_URL;
  const urlStr = typeof raw === 'string' ? raw : raw ? String(raw) : '';
  if (!urlStr) return null;
  validateStagingDatabaseUrl(urlStr);
  const client = new pg.Client(stagingPgClientOptions(urlStr));
  await client.connect();
  try {
    const r = await client.query(sql, params);
    return r.rows[0] || null;
  } finally {
    await client.end();
  }
}

async function main() {
  if (process.env.RI_LAB_CONNECTED_WRITES_ENABLED !== 'true') {
    throw new Error('RI_LAB_CONNECTED_WRITES_ENABLED must be true on dev server');
  }

  const clerk = createLabClerkClient(process.env.CLERK_SECRET_KEY);
  let jwt;
  let orgCookieValue;
  let clerkSessionId;
  ({ jwt, orgCookieValue, sessionId: clerkSessionId } = await mintLabBrowserAuth({
    clerk,
    userId: USER_A,
    baseUrl: BASE,
    organisationId: ORG_A,
  }));
  const changeTitle = `${PREFIX} Regulatory change browser test`;

  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHROME_CHANNEL || 'chrome',
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { Authorization: `Bearer ${jwt}` },
  });
  await context.addInitScript(() => {
    localStorage.setItem('forgeniq-ri-connected-mode', '1');
  });
  await context.addCookies([
    {
      name: 'forgeniq_active_org',
      value: orgCookieValue,
      domain: new URL(BASE).hostname,
      path: '/',
    },
  ]);

  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  const apiLog = [];
  page.on('response', (res) => {
    const u = res.url();
    if (u.includes('/api/ri-lab/session')) {
      res
        .json()
        .then((b) => apiLog.push({ session: b }))
        .catch(() => {});
    }
  });
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    await route.continue({ headers: { ...req.headers(), Authorization: `Bearer ${jwt}` } });
  });

  async function refreshBrowserAuth(stepLabel = '') {
    try {
      const fresh = await refreshLabBrowserAuth({
        clerk,
        sessionId: clerkSessionId,
        baseUrl: BASE,
        organisationId: ORG_A,
      });
      jwt = fresh.jwt;
      orgCookieValue = fresh.orgCookieValue;
    } catch (e) {
      if (e.code === 'CLERK_SESSION_EXPIRED' || e.code === 'NO_CLERK_SESSION') {
        const err = new Error(
          `clerk_session_blocked${stepLabel ? `_${stepLabel}` : ''}: sign in User A at ${BASE}/sign-in`,
        );
        err.code = 'BLOCKED';
        throw err;
      }
      throw e;
    }
    await context.setExtraHTTPHeaders({ Authorization: `Bearer ${jwt}` });
    await context.addCookies([
      {
        name: 'forgeniq_active_org',
        value: orgCookieValue,
        domain: new URL(BASE).hostname,
        path: '/',
      },
    ]);
    await page.unroute('**/api/**').catch(() => {});
    await page.route('**/api/**', async (route) => {
      const req = route.request();
      await route.continue({ headers: { ...req.headers(), Authorization: `Bearer ${jwt}` } });
    });
    return { jwt, orgCookieValue };
  }

  let changeId = null;
  let impactId = null;
  let obligationId = null;
  let riskId = null;
  let controlId = null;
  let evidenceId = null;

  await page.goto(`${LAB}#/dashboard`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForFunction(
    () => /Connected \(writes\)/i.test(document.getElementById('ri-mode-pill')?.textContent || ''),
    { timeout: 180000 },
  );

  const sessionProbe = await apiGet(jwt, orgCookieValue, '/api/ri-lab/session');
  if (!sessionProbe.body?.writeCapabilities?.changeManagement) {
    throw new Error(
      `session_missing_change_write_cap: ${JSON.stringify(sessionProbe.body?.writeCapabilities || sessionProbe.body)}`,
    );
  }

  async function ensureRiSession(stepLabel) {
    await refreshBrowserAuth(stepLabel);
    const probe = await probeRiLabSession({ baseUrl: BASE, jwt, orgCookieValue });
    if (probe.unauthorized) {
      const err = new Error(`ri_session_401_${stepLabel}`);
      err.code = 'BLOCKED';
      throw err;
    }
    return probe;
  }

  // --- BW-01 Create regulatory change ---
  if (shouldRun('BW-01')) {
  await ensureRiSession('BW-01');
  await page.goto(`${LAB}#/changes`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForSelector('[data-connected-create-change]', { timeout: 120000 });
  await page.selectOption('[data-create-change-publication]', PUBLICATION_ID);
  await page.fill('[data-create-change-title]', changeTitle);
  const createChangeResp = page.waitForResponse(
    (r) => r.url().includes('/api/ri-lab/changes') && r.request().method() === 'POST',
  );
  await page.click('[data-connected-create-change-submit]');
  const cr = await createChangeResp;
  const crBody = await cr.json().catch(() => ({}));
  changeId = crBody.change?.id || crBody.id;
  await page.waitForURL(/#\/change\//, { timeout: 30000 });
  if (!changeId) {
    const hash = page.url().split('#/change/')[1];
    changeId = hash?.split(/[?#/]/)[0];
  }
  record(
    'BW-01-create-change',
    (cr.status() === 200 || cr.status() === 201) && changeId,
    `POST changes status=${cr.status()} id=${changeId}`,
    { apiStatus: cr.status(), changeId },
  );
  await page.screenshot({ path: join(outDir, '01-change-created.png'), fullPage: true });
  }

  if (changeId && shouldRun('BW-02')) {
  await ensureRiSession('BW-02');
  await page.goto(`${LAB}#/change/${changeId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body?.innerText?.includes('TENANT REGULATORY CHANGE'),
    { timeout: 120000 },
  );
  await page.waitForSelector('[data-connected-create-impact]', { timeout: 120000 });
  await page.waitForSelector('[data-connected-change-metadata-panel]', { timeout: 120000 }).catch(() => null);
  await page
    .waitForResponse(
      (r) => r.url().includes(`/api/ri-lab/changes/${changeId}`) && r.request().method() === 'GET',
      { timeout: 60000 },
    )
    .catch(() => null);
  await page.waitForLoadState('networkidle').catch(() => null);
  await page.waitForSelector('[data-connected-change-metadata-save]', { timeout: 60000 });
  await page.waitForFunction(
    () => document.querySelector('[data-connected-change-metadata-save]')?.dataset?.riBoundMetadataSave === '1',
    { timeout: 60000 },
  ).catch(() => null);
  await page
    .waitForFunction(
      (id) => {
        const btn = document.querySelector(
          `section[data-connected-change-metadata-panel="${id}"] [data-connected-change-metadata-save]`,
        );
        return Boolean(btn?.dataset?.expectedUpdatedAt || btn?.getAttribute('data-expected-updated-at'));
      },
      changeId,
      { timeout: 60000 },
    )
    .catch(() => null);

  const hasMetadataPanel = (await page.locator('[data-connected-change-metadata-panel]').count()) > 0;
  if (hasMetadataPanel) {
    await ensureRiSession('BW-02-save');
    const metaPanel = page.locator(`[data-connected-change-metadata-panel="${changeId}"]`);
    await metaPanel.locator('[data-connected-change-materiality]').scrollIntoViewIfNeeded();
    await metaPanel.locator('[data-connected-change-materiality]').fill('HIGH');
    const saveBtn = metaPanel.locator('[data-connected-change-metadata-save]');
    const [pc] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes('/api/ri-lab/changes/') &&
          r.request().method() === 'PATCH' &&
          r.url().includes(changeId),
        { timeout: 60000 },
      ),
      saveBtn.dispatchEvent('click'),
    ]).catch(() => [null]);
    record(
      'BW-02-edit-change',
      pc?.status() === 200,
      pc ? `PATCH change status=${pc.status()}` : 'PATCH timeout or skipped',
      { changeId },
    );
    if (!pc || pc.status() !== 200) {
      await page.evaluate(() => {
        document.querySelector('[data-connected-change-metadata-save]')?.click();
      });
      const retry = await page
        .waitForResponse(
          (r) =>
            r.url().includes('/api/ri-lab/changes/') &&
            r.request().method() === 'PATCH' &&
            r.url().includes(changeId),
          { timeout: 30000 },
        )
        .catch(() => null);
      if (retry?.status() === 200) {
        record('BW-02-edit-change', true, `PATCH change status=${retry.status()} (evaluate click)`, { changeId });
      }
    }
    const lastBw02 = results.filter((r) => r.id === 'BW-02-edit-change').pop();
    if (lastBw02?.pass) {
      await ensureRiSession('BW-02b');
      await page.reload({ waitUntil: 'networkidle' });
      await page
        .waitForResponse(
          (r) => r.url().includes(`/api/ri-lab/changes/${changeId}`) && r.request().method() === 'GET',
          { timeout: 60000 },
        )
        .catch(() => null);
      const detail = await apiGet(jwt, orgCookieValue, `/api/ri-lab/changes/${changeId}`);
      const mat =
        detail.body?.change?.materiality ??
        detail.body?.detail?.materiality ??
        detail.body?.detail?.change?.materiality;
      const dbMat = await pgRow(`select materiality from regulatory_changes where id = $1`, [changeId]);
      record(
        'BW-02b-change-refresh',
        String(dbMat?.materiality || '').toUpperCase() === 'HIGH' ||
          (detail.status === 200 && /^high$/i.test(String(mat || ''))),
        `GET materiality=${mat} db=${dbMat?.materiality} apiStatus=${detail.status}`,
        { changeId },
      );
    }
  } else {
    record('BW-02-edit-change', false, 'metadata panel not rendered (connected change detail)', { changeId });
  }
  }

  if (changeId && shouldRun('BW-03')) {
  try {
  await ensureRiSession('BW-03');
  await page.goto(`${LAB}#/change/${changeId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-connected-create-impact]', { timeout: 120000 });

  const [ir] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/api/ri-lab/impact-assessments') && r.request().method() === 'POST',
      { timeout: 60000 },
    ),
    page.click('[data-connected-create-impact]'),
  ]).catch(() => [null]);
  const irBody = ir ? await ir.json().catch(() => ({})) : {};
  impactId = irBody.assessment?.id || irBody.impactAssessment?.id || irBody.id;
  await page.waitForURL(/#\/assessment\//, { timeout: 60000 }).catch(() => null);
  if (!impactId) {
    const hash = page.url().split('#/assessment/')[1];
    impactId = hash?.split(/[?#/]/)[0];
  }
  record(
    'BW-03-create-impact',
    ir && (ir.status() === 200 || ir.status() === 201) && impactId,
    `impact POST status=${ir?.status()} id=${impactId}`,
    { impactId },
  );
  if (impactId) {
    await page.waitForURL(new RegExp(`#/assessment/${impactId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), {
      timeout: 60000,
    }).catch(() => null);
    await page.goto(`${LAB}#/assessment/${impactId}`, { waitUntil: 'networkidle' });
  }
  } catch (e) {
    record('BW-03-create-impact', false, e.message || String(e));
  }
  }

  if (impactId && shouldRun('BW-04')) {
  try {
  await ensureRiSession('BW-04');
  await page.goto(`${LAB}#/assessment/${impactId}`, { waitUntil: 'networkidle' });
  await page
    .waitForResponse(
      (r) =>
        r.url().includes(`/api/ri-lab/impact-assessments/${impactId}`) &&
        r.request().method() === 'GET',
      { timeout: 60000 },
    )
    .catch(() => null);
  await page.waitForSelector('[data-connected-impact-panel]', { timeout: 120000 });
  await page.fill('[data-connected-impact-field="business_impact"]', `${PREFIX} business impact`);
  await page.click('[data-connected-impact-save]');
  await page.waitForResponse(
    (r) => r.url().includes(`/api/ri-lab/impact-assessments/${impactId}`) && r.request().method() === 'PATCH',
    { timeout: 60000 },
  ).catch(() => null);

  await ensureRiSession('BW-04-submit');
  const [si] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes(`/api/ri-lab/impact-assessments/${impactId}`) &&
        r.request().method() === 'PATCH',
      { timeout: 60000 },
    ),
    page.locator('[data-connected-impact-action="submit"]').click(),
  ]).catch(() => [null]);
  record('BW-04-submit-impact', si?.status() === 200, `submit status=${si?.status()}`, { impactId });
  } catch (e) {
    record('BW-04-submit-impact', false, e.message || String(e), { impactId });
  }
  }

  if (changeId && shouldRun('BW-05')) {
  try {
  await ensureRiSession('BW-05');
  await page.goto(`${LAB}#/change/${changeId}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => /Connected \(writes\)/i.test(document.getElementById('ri-mode-pill')?.textContent || ''),
    { timeout: 120000 },
  );
  await page.waitForSelector(`[data-connected-create-obligation="${changeId}"]`, { timeout: 120000 });
  const oblPanel = page.locator(`[data-connected-create-obligation="${changeId}"]`);
  await oblPanel.locator('[data-connected-obligation-create-statement]').fill(`${PREFIX} obligation statement`);
  const [ob] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/api/ri-lab/obligations') && r.request().method() === 'POST',
      { timeout: 60000 },
    ),
    oblPanel.locator('button[data-connected-create-obligation]').click(),
  ]).catch(() => [null]);
  const obBody = ob ? await ob.json().catch(() => ({})) : {};
  obligationId = obBody.obligation?.id || obBody.id;
  if (!obligationId) {
    const hash = page.url().split('#/obligation/')[1];
    obligationId = hash?.split(/[?#/]/)[0];
  }
  record(
    'BW-05-create-obligation',
    ob && (ob.status() === 200 || ob.status() === 201) && obligationId,
    `obligation id=${obligationId} status=${ob?.status()}`,
  );
  } catch (e) {
    record('BW-05-create-obligation', false, e.message || String(e));
  }
  }

  if (shouldRun('BW-06')) {
  try {
  await ensureRiSession('BW-06');
  await page.goto(`${LAB}#/risks`, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => /Connected \(writes\)/i.test(document.getElementById('ri-mode-pill')?.textContent || ''),
    { timeout: 120000 },
  );
  await page.waitForSelector('[data-connected-risk-create-title]', { timeout: 60000 });
  await page.fill('[data-connected-risk-create-title]', `${PREFIX} risk`);
  const [rr] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/api/ri-lab/risks') && r.request().method() === 'POST',
      { timeout: 60000 },
    ),
    page.click('[data-connected-create-risk-btn]'),
  ]).catch(() => [null]);
  const rrBody = rr ? await rr.json().catch(() => ({})) : {};
  riskId = rrBody.risk?.id || rrBody.id;
  if (riskId) {
    await page.goto(`${LAB}#/risk/${riskId}`, { waitUntil: 'networkidle' });
    await page.fill('[data-connected-risk-field="residual_risk"]', 'LOW');
    const riskPatch = page.waitForResponse(
      (r) => r.url().includes(`/api/ri-lab/risks/${riskId}`) && r.request().method() === 'PATCH',
    );
    await page.click('[data-connected-risk-save]');
    const rp = await riskPatch;
    record('BW-06-risk', rp.status() === 200, `risk create+update id=${riskId}`, { riskId });
  } else record('BW-06-risk', false, `risk create failed status=${rr?.status()}`);
  } catch (e) {
    record('BW-06-risk', false, e.message || String(e));
  }
  }

  if (shouldRun('BW-07')) {
  try {
  await ensureRiSession('BW-07');
  await page.goto(`${LAB}#/controls`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-connected-control-create-name]', { timeout: 60000 });
  await page.fill('[data-connected-control-create-name]', `${PREFIX} control`);
  const [crl] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/api/ri-lab/controls') && r.request().method() === 'POST',
      { timeout: 60000 },
    ),
    page.click('[data-connected-create-control-btn]'),
  ]).catch(() => [null]);
  const crlBody = crl ? await crl.json().catch(() => ({})) : {};
  controlId = crlBody.control?.id || crlBody.id;
  if (controlId) {
    await page.goto(`${LAB}#/control/${controlId}`, { waitUntil: 'networkidle' });
    await page.fill('[data-connected-control-field="effectiveness"]', 'Effective');
    const [cp] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes(`/api/ri-lab/controls/${controlId}`) && r.request().method() === 'PATCH',
        { timeout: 60000 },
      ),
      page.click('[data-connected-control-save]'),
    ]).catch(() => [null]);
    record('BW-07-control', cp?.status() === 200, `control id=${controlId}`, { controlId });
  } else record('BW-07-control', false, `control create status=${crl?.status()}`);
  } catch (e) {
    record('BW-07-control', false, e.message || String(e));
  }
  }

  if (obligationId && controlId && shouldRun('BW-08')) {
  await ensureRiSession('BW-08');
  await page.goto(`${LAB}#/obligation/${obligationId}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-ri-post-link][data-link-type="obligation_control"]', { timeout: 60000 });
  await page.locator('[data-connected-link-control-target]').fill(controlId);
  const [linkRes] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/api/ri-lab/links') && r.request().method() === 'POST',
      { timeout: 60000 },
    ),
    page.locator('[data-ri-post-link][data-link-type="obligation_control"]').click(),
  ]).catch(() => [null]);
  record(
    'BW-08-link-evidence',
    linkRes?.status() === 200,
    `obligation→control link status=${linkRes?.status()}`,
    { obligationId, controlId },
  );
  }

  if (shouldRun('BW-09')) {
  try {
  await ensureRiSession('BW-09');
  // --- Evidence create + upload ---
  await page.goto(`${LAB}#/evidence`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-connected-evidence-title]', { timeout: 60000 });
  await page.fill('[data-connected-evidence-title]', `${PREFIX} evidence`);
  await page.fill('[data-connected-evidence-type]', 'test_result');
  const [ev] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes('/api/ri-lab/evidence') &&
        r.request().method() === 'POST' &&
        !r.url().includes('/upload'),
      { timeout: 60000 },
    ),
    page.locator('[data-connected-create-evidence]').click(),
  ]).catch(() => [null]);
  const evBody = ev ? await ev.json().catch(() => ({})) : {};
  evidenceId = evBody.evidence?.id || evBody.item?.id || evBody.id;
  await page.waitForURL(/#\/evidence\//, { timeout: 30000 }).catch(() => null);
  if (!evidenceId) {
    const hash = page.url().split('#/evidence/')[1];
    evidenceId = hash?.split(/[?#/]/)[0];
  }
  if (evidenceId) {
    await page.goto(`${LAB}#/evidence/${evidenceId}`, { waitUntil: 'networkidle' });
    await page
      .waitForResponse(
        (r) => r.url().includes(`/api/ri-lab/evidence/${evidenceId}`) && r.request().method() === 'GET',
        { timeout: 60000 },
      )
      .catch(() => null);
    await page.waitForSelector(`[data-connected-evidence-upload-panel="${evidenceId}"]`, {
      state: 'attached',
      timeout: 120000,
    });
    await page.waitForFunction(
      (id) => Boolean(document.querySelector(`[data-connected-evidence-upload-panel="${id}"] input[type="file"]`)),
      evidenceId,
      { timeout: 120000 },
    );
    await page.locator('[data-connected-evidence-file]').setInputFiles({
      name: `${PREFIX}.txt`,
      mimeType: 'text/plain',
      buffer: Buffer.from(`${PREFIX} upload content`),
    });
    await ensureRiSession('BW-09-upload');
    const up = page.waitForResponse((r) => r.url().includes('/upload') && r.request().method() === 'POST');
    await page.locator('[data-connected-evidence-upload]').click();
    const upRes = await up;
    record(
      'BW-09-evidence-upload',
      upRes.status() === 200 || upRes.status() === 201,
      `upload status=${upRes.status()} evidence id=${evidenceId}`,
      { evidenceId },
    );
    await ensureRiSession('BW-09-download');
    const [dl] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/download') && r.request().method() === 'GET'),
      page.locator('[data-connected-evidence-download]').click(),
    ]).catch(() => [null]);
    record('BW-09-evidence-download', dl?.status() === 200, `download status=${dl?.status()}`);
  } else record('BW-09-evidence', false, `evidence create status=${ev?.status()}`);
  } catch (e) {
    record('BW-09-evidence', false, e.message || String(e));
  }
  }

  if (shouldRun('BW-10')) {
  try {
  await ensureRiSession('BW-10');
  // --- Report ---
  await page.goto(`${LAB}#/reports/board`, { waitUntil: 'networkidle' });
  await page.locator('[data-connected-reporting-refresh]').click({ timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const board = await apiGet(jwt, orgCookieValue, '/api/ri-lab/reports/board?period=last30');
  record('BW-10-report', board.status === 200 && board.body?.ok !== false, `board API status=${board.status}`);
  } catch (e) {
    record('BW-10-report', false, e.message || String(e));
  }
  }

  if (shouldRun('DR-01')) {
  try {
  await ensureRiSession('DR-01');
  // --- Dashboard refresh (operational still excludes UAT) ---
  const dashOpBefore = await apiGet(jwt, orgCookieValue, '/api/ri-lab/dashboard?dataScope=operational');
  await page.goto(`${LAB}#/dashboard`, { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  const dashOpAfter = await apiGet(jwt, orgCookieValue, '/api/ri-lab/dashboard?dataScope=operational');
  record(
    'DR-01-dashboard-operational-stable',
    dashOpBefore.body?.summary?.changesOpen === dashOpAfter.body?.summary?.changesOpen,
    `operational changesOpen=${dashOpAfter.body?.summary?.changesOpen}`,
  );
  } catch (e) {
    record('DR-01-dashboard-operational-stable', false, e.message || String(e));
  }
  }

  // DB persistence
  let dbChange = null;
  if (changeId) {
    try {
      dbChange = await pgRow(
        `select id, title, organisation_id from regulatory_changes where id = $1`,
        [changeId],
      );
    } catch (e) {
      record('BW-11-db-persistence', false, `db query failed: ${e.message || e}`);
    }
  }
  if (changeId && !results.some((r) => r.id === 'BW-11-db-persistence')) {
    record(
      'BW-11-db-persistence',
      dbChange?.organisation_id === ORG_A && dbChange?.title === changeTitle,
      dbChange ? `db title=${dbChange.title}` : 'no db row',
    );
  }

  await page.screenshot({ path: join(outDir, '99-dashboard-after.png'), fullPage: true });
  await browser.close();

  const passCount = results.filter((r) => r.pass).length;
  const report = {
    capturedAt: new Date().toISOString(),
    phase: '85I',
    prefix: PREFIX,
    baseUrl: BASE,
    ids: { changeId, impactId, obligationId, riskId, controlId, evidenceId },
    results,
    passCount,
    failCount: results.filter((r) => !r.pass).length,
    pass: results.every((r) => r.pass),
  };

  writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ pass: report.pass, passCount, failCount: report.failCount, prefix: PREFIX }, null, 2));
  if (!report.pass) process.exit(2);
}

main().catch((e) => {
  console.error(e.message || e);
  const failReport = {
    capturedAt: new Date().toISOString(),
    phase: '85I',
    pass: false,
    error: e.message || String(e),
    code: e.code || null,
    results,
  };
  try {
    writeFileSync(JSON_OUT, JSON.stringify(failReport, null, 2));
  } catch {
    /* ignore */
  }
  process.exit(e.code === 'BLOCKED' ? 3 : 1);
});
