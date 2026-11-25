#!/usr/bin/env node
/**
 * Hosted Design Lab browser pass for a synthetic lifecycle.
 * Clicks the Design Lab controls. Does not print session material.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { STAGING_ORGANISATION_ID, STAGING_ORIGIN, requireUatPersonas, runAs } from './staging-user-sessions.mjs';

const RUN = `UAT-LIFECYCLE-BROWSER-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString(36)}`;
const OUT = join(REPO_ROOT, 'docs', 'uat', 'evidence', `compliance-lifecycle-${new Date().toISOString().slice(0, 10)}`);
mkdirSync(OUT, { recursive: true });
const LAB = `${STAGING_ORIGIN}/design-lab/regulatory-intelligence/index.html`;
const PRIOR = '0222809b-b74e-4577-88d4-e1d8701f5385';

const results = [];
const ids = { run: RUN };
const record = (id, status, detail = {}) => {
  results.push({ id, layer: 'hosted-browser', status, detail });
  console.log(`${status} ${id}`);
};

function watch(page, bag) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') bag.console.push(msg.text().slice(0, 240));
  });
  page.on('response', (res) => {
    if (res.status() >= 400 && res.url().includes('/api/ri-lab')) {
      bag.http.push(`${res.status()} ${new URL(res.url()).pathname}`);
    }
  });
}

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, name), fullPage: false });
  return name;
}

async function toastText(page) {
  const toast = page.locator('#ri-toast');
  await toast.waitFor({ state: 'visible', timeout: 20_000 });
  return (await toast.innerText()).trim();
}

/** Multi-membership users must choose the staging tenant before Design Lab loads registers. */
async function ensureLabReady(page) {
  await page.waitForFunction(() => document.documentElement.dataset.riMounted === '1', null, { timeout: 30_000 });
  const picker = page.locator('[data-ri-select-org]');
  if (await picker.isVisible().catch(() => false)) {
    await picker.selectOption(STAGING_ORGANISATION_ID);
    await page.locator('[data-ri-apply-org]').click();
  }
  await page.waitForFunction(
    () => {
      const heading = document.querySelector('h1')?.textContent || '';
      return !/Select organisation|Sign in required|Backend unavailable/i.test(heading);
    },
    null,
    { timeout: 45_000 },
  );
}

await requireUatPersonas(['A', 'B', 'C'], { label: 'hosted-design-lab-lifecycle-browser' });

const bag = { console: [], http: [] };

await runAs('A', async ({ page }) => {
  watch(page, bag);
  await page.goto(`${LAB}#/obligation/${PRIOR}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await ensureLabReady(page);
  const changeLink = page.locator('a[href^="#/change/"]').first();
  await changeLink.waitFor({ timeout: 30_000 });
  await changeLink.click();
  await page.locator('[data-connected-create-obligation]').first().waitFor({ timeout: 30_000 });
  await page.locator('[data-connected-obligation-create-statement]').fill(
    `${RUN} synthetic UAT obligation. Firms must retain labelled test evidence for this automated lifecycle and must not treat this statement as a live regulatory duty.`,
  );
  await page.locator('[data-connected-obligation-create-citation]').fill(`${RUN} synthetic citation`);
  await page.locator('[data-connected-obligation-create-code]').selectOption('R');
  await page.locator('[data-connected-obligation-create-legal-basis]').fill(`${RUN} synthetic legal basis for automated UAT only`);
  await page.locator('[data-connected-obligation-create-authority-reference]').fill(`${RUN}-SYN`);
  await page.locator('[data-connected-obligation-create-authority-url]').fill('https://www.handbook.fca.org.uk/handbook/CONC/4/2A.html');
  await page.locator('[data-connected-obligation-create-authority-quotation]').fill(
    `${RUN} synthetic quotation used only to satisfy hosted UAT provision requirements.`,
  );
  await page.locator('button[data-connected-create-obligation]').click();
  const created = await toastText(page);
  await page.waitForURL(/#\/obligation\//, { timeout: 20_000 });
  ids.obligationId = new URL(page.url()).hash.split('/obligation/')[1];
  record('BROWSER-S1-CREATE', ids.obligationId && /created/i.test(created) ? 'PASS' : 'FAIL', {
    toast: created,
    obligationId: ids.obligationId,
  });
  await shot(page, 'browser-obligation-draft.png');

  await page.locator('[data-connected-obligation-field="status"]').fill('IN_REVIEW');
  await page.locator('[data-connected-obligation-save]').click();
  const submitted = await toastText(page);
  record('BROWSER-S1-SUBMIT', /saved/i.test(submitted) ? 'PASS' : 'FAIL', { toast: submitted });

  await page.locator('[data-connected-obligation-field="status"]').fill('OPEN');
  await page.locator('[data-connected-obligation-save]').click();
  const self = await toastText(page);
  const statusValue = await page.locator('[data-connected-obligation-field="status"]').inputValue();
  const selfDenied = /fail|segregation|invalid|denied|error/i.test(self) || statusValue !== 'OPEN';
  record('BROWSER-S1-SELF-APPROVE', selfDenied ? 'PASS' : 'FAIL', { toast: self, statusValue });
  await shot(page, 'browser-obligation-self-approval.png');
});

if (ids.obligationId) {
  await runAs('B', async ({ page }) => {
    watch(page, bag);
    await page.goto(`${LAB}#/obligation/${ids.obligationId}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await ensureLabReady(page);
    const approve = page.locator('[data-connected-obligation-decision="OPEN"]');
    const visible = await approve.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
    if (!visible) {
      record('BROWSER-S1-REVIEWER', 'FAIL', { reason: 'approve control not shown' });
      await shot(page, 'browser-reviewer-obligation.png');
      return;
    }
    await approve.click();
    const decision = await toastText(page);
    await page.waitForTimeout(1500);
    const stage2 = await page.locator('[data-connected-obligation-stage2]').innerText().catch(() => '');
    const approved = /approved into register/i.test(decision);
    const linked = /Open impact assessment/i.test(stage2);
    record('BROWSER-S1-REVIEWER', approved && linked ? 'PASS' : approved ? 'FAIL' : 'FAIL', {
      toast: decision,
      stage2: stage2.slice(0, 240),
      linked,
    });
    await shot(page, 'browser-reviewer-approval.png');
  });

  await runAs('A', async ({ page }) => {
    watch(page, bag);
    await page.goto(`${LAB}#/obligations`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await ensureLabReady(page);
    const body = await page.locator('body').innerText();
    record('BROWSER-OBLIGATION-REGISTER', body.includes(RUN.slice(0, 24)) || body.includes(ids.obligationId.slice(0, 8)) ? 'PASS' : 'FAIL', {
      obligationId: ids.obligationId,
    });
    await shot(page, 'browser-obligations-register.png');
    await page.goto(`${LAB}#/obligation/${PRIOR}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await ensureLabReady(page);
    const prior = await page.locator('body').innerText();
    record('BROWSER-PRIOR-LIFECYCLE', /Linked risks|AI impact assessment|Compliance lifecycle/i.test(prior) ? 'PASS' : 'FAIL', {
      obligationId: PRIOR,
    });
    await shot(page, 'browser-prior-lifecycle.png');
  });
}

writeFileSync(join(OUT, 'BROWSER.json'), JSON.stringify({ run: RUN, ids, results, consoleErrors: bag.console.slice(0, 40), failedApi: bag.http.slice(0, 40) }, null, 2));
const failed = results.some((r) => r.status === 'FAIL');
process.exit(failed ? 1 : 0);
