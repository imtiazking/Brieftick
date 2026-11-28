#!/usr/bin/env node
/**
 * Hosted standalone R&C: product shell, operational risk lifecycle, report API.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { STAGING_ORGANISATION_ID, STAGING_ORIGIN, requireUatPersonas, runAs } from './staging-user-sessions.mjs';

const OUT = join(REPO_ROOT, 'docs', 'uat', 'evidence', `standalone-rc-${new Date().toISOString().slice(0, 10)}`);
mkdirSync(OUT, { recursive: true });
const LAB = `${STAGING_ORIGIN}/design-lab/risk-controls/index.html`;
const results = [];
const record = (id, status, detail = {}) => {
  results.push({ id, status, at: new Date().toISOString(), detail });
  console.log(`${status} ${id}`);
};

async function ensureLabReady(page) {
  await page.waitForFunction(() => document.documentElement.dataset.riMounted === '1', null, { timeout: 45_000 });
  const product = await page.evaluate(
    () => document.querySelector('meta[name="forgeniq-product"]')?.content || '',
  );
  if (product !== 'risk_controls') record('PRODUCT-SHELL-META', 'FAIL', { product });
  else record('PRODUCT-SHELL-META', 'PASS', { product });
  const picker = page.locator('[data-ri-select-org]');
  if (await picker.isVisible().catch(() => false)) {
    await picker.selectOption(STAGING_ORGANISATION_ID);
    await page.locator('[data-ri-apply-org]').click();
  }
}

await requireUatPersonas(['A', 'C']);

await runAs('A', async ({ page, request }) => {
  await page.goto(LAB, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await ensureLabReady(page);
  const nav = await page.locator('.ri-sidebar__link, .ri-sidebar__sublink').count();
  record('PRODUCT-NAV-RENDER', nav >= 8 ? 'PASS' : 'FAIL', { navCount: nav });

  const ent = await request.get(`${STAGING_ORIGIN}/api/platform/entitlements`);
  const entBody = await ent.json().catch(() => ({}));
  record('ENTITLEMENTS-API', ent.ok() && entBody.ok ? 'PASS' : 'FAIL', { status: ent.status(), entitled: entBody.entitled });

  const report = await request.get(`${STAGING_ORIGIN}/api/ri-lab/reports/risk-controls`);
  const repBody = await report.json().catch(() => ({}));
  record('RC-REPORT-API', report.ok() && repBody.ok && repBody.report ? 'PASS' : 'FAIL', {
    status: report.status(),
    keys: repBody.report ? Object.keys(repBody.report) : [],
  });
});

let riskId = null;
await runAs('A', async ({ page }) => {
  await page.goto(`${LAB}#/risks`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await ensureLabReady(page);
  const created = await page.evaluate(async () => {
    const res = await fetch('/api/ri-lab/risks', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `Hosted standalone RC ${new Date().toISOString()}`,
        description: 'Operational lifecycle harness',
        category: 'Operational',
        status: 'DRAFT',
        creationMode: 'operational',
      }),
    });
    const body = await res.json().catch(() => ({}));
    return { http: res.status, id: body.risk?.id || null, error: body.error };
  });
  riskId = created.id;
  record('RC-RISK-CREATE', created.id ? 'PASS' : 'FAIL', created);
});

if (riskId) {
  await runAs('A', async ({ page }) => {
    await page.evaluate(async (id) => {
      await fetch(`/api/ri-lab/risks/${id}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit' }),
      });
    }, riskId);
    const denied = await page.evaluate(async (id) => {
      const res = await fetch(`/api/ri-lab/risks/${id}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });
      const body = await res.json().catch(() => ({}));
      return { http: res.status, ok: body.ok, status: body.risk?.status, error: body.error || body.reason };
    }, riskId);
    record(
      'RC-RISK-SELF-APPROVE-DENIED',
      !denied.ok || /segregation|forbidden|conflict/i.test(String(denied.error)) ? 'PASS' : 'FAIL',
      denied,
    );
  });
  await runAs('C', async ({ page }) => {
    const approved = await page.evaluate(async (id) => {
      const res = await fetch(`/api/ri-lab/risks/${id}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });
      const body = await res.json().catch(() => ({}));
      return { http: res.status, status: body.risk?.status, ok: body.ok };
    }, riskId);
    record('RC-RISK-CHECKER-APPROVE', approved.ok && /approved/i.test(approved.status || '') ? 'PASS' : 'FAIL', approved);
  });
}

const failed = results.filter((r) => r.status === 'FAIL').length;
writeFileSync(join(OUT, 'RESULT.json'), JSON.stringify({ lab: LAB, results, failed, pass: results.length - failed }, null, 2));
if (failed) process.exit(1);