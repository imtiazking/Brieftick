#!/usr/bin/env node
/** Continue the hosted assurance browser path from the testing-ready plan. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { STAGING_ORGANISATION_ID, STAGING_ORIGIN, requireUatPersonas, runAs } from './staging-user-sessions.mjs';

const OUT = join(REPO_ROOT, 'docs', 'uat', 'evidence', `compliance-lifecycle-${new Date().toISOString().slice(0, 10)}`);
mkdirSync(OUT, { recursive: true });
const LAB = `${STAGING_ORIGIN}/design-lab/regulatory-intelligence/index.html`;
const ASSURANCE = '122e9511-323c-49e7-a023-1d54486a97c9';
const CONTROL = '01319003-c940-400b-ba90-59cba49f78b5';
const UNRELATED = '88b532f1-1747-426f-9544-b931346ff5d7';
const FAIL_EVIDENCE = '542b7437-f56e-4f5a-92b2-56e9771f2e99';
const RETEST_EVIDENCE = '2e55036b-2c04-43ec-9d61-c152aecff579';
const results = [];
const record = (id, status, detail = {}) => {
  results.push({ id, status, detail });
  console.log(`${status} ${id}`);
};

async function ready(page) {
  await page.waitForFunction(() => document.documentElement.dataset.riMounted === '1', null, { timeout: 30_000 });
  const picker = page.locator('[data-ri-select-org]');
  if (await picker.isVisible().catch(() => false)) {
    await picker.selectOption(STAGING_ORGANISATION_ID);
    await page.locator('[data-ri-apply-org]').click();
  }
  await page.waitForFunction(
    () => !/Select organisation|Sign in required|Backend unavailable/i.test(document.querySelector('h1')?.textContent || ''),
    null,
    { timeout: 45_000 },
  );
}

async function openAssurance(page) {
  const detail = page.waitForResponse(
    (res) => res.url().includes(`/api/ri-lab/assurance-reviews/${ASSURANCE}`) && res.request().method() === 'GET',
    { timeout: 45_000 },
  );
  await page.goto(`${LAB}#/assurance/${ASSURANCE}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await ready(page);
  await detail.catch(() => {});
  await page.locator('[data-connected-assurance-execution]').waitFor({ timeout: 30_000 });
}

async function clickFresh(page, selector) {
  const previous = ((await page.locator('#ri-toast').innerText().catch(() => '')) || '').trim();
  const button = page.locator(selector).first();
  await button.waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      return el && !el.disabled;
    },
    selector,
    { timeout: 20_000 },
  );
  await button.scrollIntoViewIfNeeded();
  await button.click();
  try {
    await page.waitForFunction(
      (prior) => {
        const text = (document.querySelector('#ri-toast')?.innerText || '').trim();
        return text && text !== prior;
      },
      previous,
      { timeout: 60_000 },
    );
  } catch {
    return 'toast_timeout';
  }
  return (await page.locator('#ri-toast').innerText()).trim();
}

await requireUatPersonas(['A', 'C'], { label: 'hosted-design-lab-stage5-continue' });

await runAs('A', async ({ page }) => {
  await openAssurance(page);
  await page.locator('[data-connected-assurance-evidence-id]').fill(UNRELATED);
  const unrelated = await clickFresh(
    page,
    '[data-connected-assurance-action="record_test"][data-connected-assurance-test-result="FAIL"]:not([data-connected-assurance-retest])',
  );
  record('BROWSER-S5-UNRELATED-EVIDENCE', /wrong_control|evidence|invalid|binding|failed/i.test(unrelated) && !/record_test/i.test(unrelated) ? 'PASS' : 'FAIL', {
    toast: unrelated,
  });

  await openAssurance(page);
  await page.locator('[data-connected-assurance-evidence-id]').fill(FAIL_EVIDENCE);
  const failed = await clickFresh(
    page,
    '[data-connected-assurance-action="record_test"][data-connected-assurance-test-result="FAIL"]:not([data-connected-assurance-retest])',
  );
  record('BROWSER-S5-FAIL-TEST', /record_test/i.test(failed) ? 'PASS' : 'FAIL', { toast: failed, evidenceId: FAIL_EVIDENCE, controlId: CONTROL });
  await page.screenshot({ path: join(OUT, 'browser-s5-failed-test.png'), fullPage: false });

  await openAssurance(page);
  const remediated = await clickFresh(page, '[data-connected-assurance-action="complete_remediation"]');
  record('BROWSER-S5-REMEDIATION', /complete_remediation/i.test(remediated) ? 'PASS' : 'FAIL', { toast: remediated });

  await openAssurance(page);
  await page.locator('[data-connected-assurance-evidence-id]').fill(RETEST_EVIDENCE);
  const retest = await clickFresh(page, '[data-connected-assurance-retest="true"]');
  record('BROWSER-S5-RETEST', /record_test/i.test(retest) ? 'PASS' : 'FAIL', { toast: retest, evidenceId: RETEST_EVIDENCE });
  await page.screenshot({ path: join(OUT, 'browser-s5-retest.png'), fullPage: false });
});

await runAs('C', async ({ page }) => {
  await openAssurance(page);
  const closed = await clickFresh(page, '[data-connected-assurance-action="close_lifecycle"]');
  record('BROWSER-S5-CLOSE', /close_lifecycle/i.test(closed) ? 'PASS' : 'FAIL', { toast: closed });
  await openAssurance(page);
  const duplicate = await clickFresh(page, '[data-connected-assurance-action="close_lifecycle"]');
  record('BROWSER-S5-DUPLICATE-CLOSE', /close_lifecycle/i.test(duplicate) ? 'PASS' : 'FAIL', { toast: duplicate });
  await page.screenshot({ path: join(OUT, 'browser-s5-closed.png'), fullPage: false });
  const persisted = await page.evaluate(async (assuranceId) => {
    const events = await fetch(`/api/ri-lab/workflow-events?entityType=assurance_review&entityId=${assuranceId}&limit=40`, {
      credentials: 'same-origin',
    });
    const ev = await events.json();
    const rows = ev.events || ev.workflowEvents || [];
    return rows.map((e) => e.eventType || e.event_type);
  }, ASSURANCE);
  record('BROWSER-S5-AUDIT', persisted.includes('COMPLIANCE_LIFECYCLE_CLOSED') ? 'PASS' : 'FAIL', { eventTypes: persisted });
});

writeFileSync(join(OUT, 'BROWSER-S5-CONTINUE.json'), JSON.stringify({ assuranceId: ASSURANCE, results }, null, 2));
process.exit(results.some((r) => r.status === 'FAIL') ? 1 : 0);
