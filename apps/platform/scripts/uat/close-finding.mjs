import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { STAGING_ORGANISATION_ID, STAGING_ORIGIN, requireUatPersonas, runAs } from './staging-user-sessions.mjs';

const OUT = join(REPO_ROOT, 'docs', 'uat', 'evidence', 'compliance-lifecycle-2026-11-25');
mkdirSync(OUT, { recursive: true });
const LAB = `${STAGING_ORIGIN}/design-lab/regulatory-intelligence/index.html`;
const ASSURANCE = '122e9511-323c-49e7-a023-1d54486a97c9';
const FINDING = '3b98fa4f-06dd-437d-95db-49f04b024532';

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

async function changedToast(page, previous) {
  await page.waitForFunction(
    (prior) => {
      const text = (document.querySelector('#ri-toast')?.innerText || '').trim();
      return text && text !== prior;
    },
    previous,
    { timeout: 40_000 },
  );
  return (await page.locator('#ri-toast').innerText()).trim();
}

await requireUatPersonas(['A', 'C'], { label: 'close-finding' });

await runAs('A', async ({ page }) => {
  await page.goto(`${LAB}#/finding/${FINDING}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await ready(page);
  await page.locator('[data-connected-finding-status-select]').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  const prior = ((await page.locator('#ri-toast').innerText().catch(() => '')) || '').trim();
  await page.evaluate(() => {
    const select = document.querySelector('[data-connected-finding-status-select]');
    select.value = 'CLOSED';
    document.querySelector('[data-connected-finding-status-save]').click();
  });
  const toast = await changedToast(page, prior);
  console.log(toast.toLowerCase().includes('fail') ? `FAIL FINDING ${toast}` : `PASS FINDING ${toast}`);
  await page.screenshot({ path: join(OUT, 'browser-s5-finding-closed.png'), fullPage: false });
});

await runAs('C', async ({ page }) => {
  await page.goto(LAB, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${LAB}#/assurance/${ASSURANCE}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await ready(page);
  await page.locator('[data-connected-assurance-action="close_lifecycle"]').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  const prior = ((await page.locator('#ri-toast').innerText().catch(() => '')) || '').trim();
  await page.locator('[data-connected-assurance-action="close_lifecycle"]').click();
  const closed = await changedToast(page, prior);
  console.log(/close_lifecycle/i.test(closed) ? `PASS CLOSE ${closed}` : `FAIL CLOSE ${closed}`);
  await page.screenshot({ path: join(OUT, 'browser-s5-closed.png'), fullPage: false });
  const events = await page.evaluate(async (assuranceId) => {
    const res = await fetch(`/api/ri-lab/workflow-events?entityType=assurance_review&entityId=${assuranceId}&limit=20`, {
      credentials: 'same-origin',
    });
    const body = await res.json();
    return (body.events || body.workflowEvents || []).map((e) => e.eventType || e.event_type);
  }, ASSURANCE);
  console.log(events.includes('COMPLIANCE_LIFECYCLE_CLOSED') ? 'PASS AUDIT' : `FAIL AUDIT ${events.join(',')}`);
});
