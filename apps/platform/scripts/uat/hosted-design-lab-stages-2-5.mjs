#!/usr/bin/env node
/**
 * Hosted Design Lab browser pass for stages 2–5 of an existing synthetic obligation.
 * Clicks Design Lab controls. Does not print session material.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { STAGING_ORGANISATION_ID, STAGING_ORIGIN, requireUatPersonas, runAs } from './staging-user-sessions.mjs';

const RUN = `UAT-LIFECYCLE-BROWSER-S25-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString(36)}`;
const OUT = join(REPO_ROOT, 'docs', 'uat', 'evidence', `compliance-lifecycle-${new Date().toISOString().slice(0, 10)}`);
mkdirSync(OUT, { recursive: true });
const LAB = `${STAGING_ORIGIN}/design-lab/regulatory-intelligence/index.html`;
const OBLIGATION = 'b330fc90-b16c-4dd0-947f-10a96c209efe';
const IMPACT = 'bfba3c56-6425-404c-a4fa-ad3834c46e5a';
const UNRELATED_EVIDENCE = '88b532f1-1747-426f-9544-b931346ff5d7';

const results = [];
const ids = { run: RUN, obligationId: OBLIGATION, impactId: IMPACT, deploymentId: 'dpl_83MfoihicphZm4hmbs5nMe7YTzia' };
const bag = { console: [], http: [] };

const record = (id, status, detail = {}) => {
  results.push({ id, layer: 'hosted-browser', status, detail });
  console.log(`${status} ${id}`);
};

function watch(page) {
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

async function ensureLabReady(page) {
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

async function openHash(page, hash) {
  await page.goto(`${LAB}${hash}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await ensureLabReady(page);
}

async function toastMatching(page, pattern, timeout = 25_000) {
  const toast = page.locator('#ri-toast');
  await page.waitForFunction(
    (source) => new RegExp(source, 'i').test(document.querySelector('#ri-toast')?.innerText || ''),
    pattern,
    { timeout },
  );
  return (await toast.innerText()).trim();
}

async function clickNamed(page, selector) {
  const button = page.locator(selector).first();
  await button.waitFor({ state: 'visible', timeout: 20_000 });
  await button.click();
}

function denied(text) {
  return /segregation|different authorised reviewer|forbidden|invalid|premature|evidence|denied|failed|error/i.test(text);
}

await requireUatPersonas(['A', 'B', 'C'], { label: 'hosted-design-lab-stages-2-5' });

await runAs('A', async ({ page }) => {
  watch(page);
  await openHash(page, `#/assessment/${IMPACT}`);
  const fixture = await page.locator('[data-connected-impact-field="business_impact"]').inputValue().catch(() => '');
  const obligationLink = await page.locator(`a[href="#/obligation/${OBLIGATION}"]`).count();
  record('BROWSER-S2-OPEN', fixture.trim().length > 20 && obligationLink > 0 ? 'PASS' : 'FAIL', {
    fixtureChars: fixture.trim().length,
    obligationLink,
  });
  await shot(page, 'browser-s2-impact-draft.png');

  await clickNamed(page, '[data-connected-impact-action="submit"]');
  const submitted = await toastMatching(page, 'submit');
  record('BROWSER-S2-SUBMIT', /submit/i.test(submitted) ? 'PASS' : 'FAIL', { toast: submitted });

  await clickNamed(page, '[data-connected-impact-action="approve"]');
  const self = await toastMatching(page, 'segregation|different authorised|forbidden|invalid|failed');
  record('BROWSER-S2-SELF-APPROVE', denied(self) ? 'PASS' : 'FAIL', { toast: self });
  await shot(page, 'browser-s2-self-approval.png');
});

await runAs('C', async ({ page }) => {
  watch(page);
  await openHash(page, `#/assessment/${IMPACT}`);
  await clickNamed(page, '[data-connected-impact-action="approve"]');
  const approved = await toastMatching(page, 'approve|segregation|invalid|failed');
  const riskLink = page.locator('a[href^="#/risk/"]').first();
  const linked = await riskLink.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
  if (linked) ids.riskId = (await riskLink.getAttribute('href')).split('/risk/')[1];
  record('BROWSER-S2-CHECKER', /approve/i.test(approved) && ids.riskId ? 'PASS' : 'FAIL', {
    toast: approved,
    riskId: ids.riskId || null,
  });
  await shot(page, 'browser-s2-approved.png');
  if (ids.riskId) await riskLink.click();
});

if (ids.riskId) {
  await runAs('A', async ({ page }) => {
    watch(page);
    await openHash(page, `#/risk/${ids.riskId}`);
    const body = await page.locator('body').innerText();
    const impactLinked = body.includes(IMPACT.slice(0, 8));
    record('BROWSER-S3-OPEN', impactLinked ? 'PASS' : 'FAIL', { riskId: ids.riskId, impactLinked });
    await shot(page, 'browser-s3-risk.png');
    await clickNamed(page, '[data-connected-risk-action="submit"]');
    const submitted = await toastMatching(page, 'submitted|segregation|invalid|failed');
    record('BROWSER-S3-SUBMIT', /submitted/i.test(submitted) ? 'PASS' : 'FAIL', { toast: submitted });
    await clickNamed(page, '[data-connected-risk-action="approve"]');
    const self = await toastMatching(page, 'segregation|different authorised|forbidden|invalid|failed');
    record('BROWSER-S3-SELF-APPROVE', denied(self) ? 'PASS' : 'FAIL', { toast: self });
    await shot(page, 'browser-s3-self-approval.png');
  });

  await runAs('C', async ({ page }) => {
    watch(page);
    await openHash(page, `#/risk/${ids.riskId}`);
    await clickNamed(page, '[data-connected-risk-action="approve"]');
    const approved = await toastMatching(page, 'approved|segregation|invalid|failed');
    await openHash(page, `#/risk/${ids.riskId}`);
    const controlLink = page.locator('a[href^="#/control/"]').first();
    const linked = await controlLink.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
    if (linked) ids.controlId = (await controlLink.getAttribute('href')).split('/control/')[1];
    record('BROWSER-S3-CHECKER', /approved/i.test(approved) && ids.controlId ? 'PASS' : 'FAIL', {
      toast: approved,
      controlId: ids.controlId || null,
    });
    await shot(page, 'browser-s3-approved.png');
  });
}

if (ids.controlId) {
  await runAs('A', async ({ page }) => {
    watch(page);
    await openHash(page, `#/control/${ids.controlId}`);
    const body = await page.locator('body').innerText();
    record('BROWSER-S4-OPEN', body.includes(ids.riskId.slice(0, 8)) ? 'PASS' : 'FAIL', { controlId: ids.controlId });
    await shot(page, 'browser-s4-control.png');
    await clickNamed(page, '[data-connected-control-action="submit"]');
    const submitted = await toastMatching(page, 'submitted|segregation|invalid|failed');
    record('BROWSER-S4-SUBMIT', /submitted/i.test(submitted) ? 'PASS' : 'FAIL', { toast: submitted });
    await clickNamed(page, '[data-connected-control-action="approve"]');
    const self = await toastMatching(page, 'segregation|different authorised|forbidden|invalid|failed');
    record('BROWSER-S4-SELF-APPROVE', denied(self) ? 'PASS' : 'FAIL', { toast: self });
    await shot(page, 'browser-s4-self-approval.png');
  });

  await runAs('C', async ({ page }) => {
    watch(page);
    await openHash(page, `#/control/${ids.controlId}`);
    await clickNamed(page, '[data-connected-control-action="approve"]');
    const approved = await toastMatching(page, 'approved|segregation|invalid|failed');
    await openHash(page, `#/control/${ids.controlId}`);
    const assuranceLink = page.locator('a[href^="#/assurance/"]').first();
    const linked = await assuranceLink.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
    if (linked) ids.assuranceId = (await assuranceLink.getAttribute('href')).split('/assurance/')[1];
    record('BROWSER-S4-CHECKER', /approved/i.test(approved) && ids.assuranceId ? 'PASS' : 'FAIL', {
      toast: approved,
      assuranceId: ids.assuranceId || null,
    });
    await shot(page, 'browser-s4-approved.png');
  });
}

async function registerEvidence(page, title) {
  await openHash(page, '#/evidence');
  await page.locator('[data-connected-evidence-title]').fill(title);
  await page.locator('[data-connected-evidence-type]').fill('uat_test_artifact');
  await page.locator('[data-connected-evidence-description]').fill(`${title}. Synthetic staging evidence only.`);
  await page.locator('[data-connected-evidence-create-control]').fill(ids.controlId);
  await page.locator('[data-connected-evidence-create-mode]').selectOption('uat_authorised');
  await clickNamed(page, '[data-connected-create-evidence]');
  const created = await toastMatching(page, 'registered|failed|requires');
  await page.waitForURL(/#\/evidence\//, { timeout: 20_000 }).catch(() => {});
  const evidenceId = page.url().includes('#/evidence/') ? page.url().split('#/evidence/')[1] : null;
  return { created, evidenceId };
}

if (ids.assuranceId) {
  await runAs('A', async ({ page }) => {
    watch(page);
    await openHash(page, `#/assurance/${ids.assuranceId}`);
    await shot(page, 'browser-s5-plan.png');
    await clickNamed(page, '[data-connected-assurance-action="submit"]');
    const submitted = await toastMatching(page, 'submit|invalid|failed');
    record('BROWSER-S5-SUBMIT', /submit/i.test(submitted) ? 'PASS' : 'FAIL', { toast: submitted });
    await clickNamed(page, '[data-connected-assurance-action="approve"]');
    const self = await toastMatching(page, 'segregation|different authorised|forbidden|invalid|failed');
    record('BROWSER-S5-SELF-APPROVE', denied(self) ? 'PASS' : 'FAIL', { toast: self });
  });

  await runAs('C', async ({ page }) => {
    watch(page);
    await openHash(page, `#/assurance/${ids.assuranceId}`);
    await clickNamed(page, '[data-connected-assurance-action="approve"]');
    const approved = await toastMatching(page, 'approve|segregation|premature|invalid|failed');
    const body = await page.locator('body').innerText();
    const testing = /TESTING_READY|testing/i.test(body);
    const closed = /COMPLIANCE_LIFECYCLE_CLOSED/.test(body);
    record('BROWSER-S5-PLAN-APPROVE', /approve/i.test(approved) && testing && !closed ? 'PASS' : 'FAIL', {
      toast: approved,
      testing,
      closed,
    });
    await shot(page, 'browser-s5-plan-approved.png');
    await clickNamed(page, '[data-connected-assurance-action="close_lifecycle"]');
    const premature = await toastMatching(page, 'premature|invalid|segregation|failed|forbidden');
    record('BROWSER-S5-PREMATURE-CLOSE', /premature/i.test(premature) ? 'PASS' : 'FAIL', { toast: premature });
  });

  await runAs('A', async ({ page }) => {
    watch(page);
    await openHash(page, `#/assurance/${ids.assuranceId}`);
    await page.locator('[data-connected-assurance-evidence-id]').fill(UNRELATED_EVIDENCE);
    await clickNamed(page, '[data-connected-assurance-action="record_test"][data-connected-assurance-test-result="FAIL"]');
    const unrelated = await toastMatching(page, 'evidence|binding|invalid|failed|forbidden');
    record('BROWSER-S5-UNRELATED-EVIDENCE', denied(unrelated) && !/Assurance: record_test/i.test(unrelated) ? 'PASS' : 'FAIL', {
      toast: unrelated,
    });

    const failEvidence = await registerEvidence(page, `${RUN} failed-test evidence`);
    ids.failEvidenceId = failEvidence.evidenceId;
    record('BROWSER-S5-EVIDENCE', failEvidence.evidenceId ? 'PASS' : 'FAIL', failEvidence);
    await shot(page, 'browser-s5-evidence.png');

    await openHash(page, `#/assurance/${ids.assuranceId}`);
    await page.locator('[data-connected-assurance-evidence-id]').fill(ids.failEvidenceId);
    await clickNamed(page, '[data-connected-assurance-action="record_test"][data-connected-assurance-test-result="FAIL"]');
    const failed = await toastMatching(page, 'record_test|evidence|invalid|failed');
    record('BROWSER-S5-FAIL-TEST', /record_test/i.test(failed) ? 'PASS' : 'FAIL', { toast: failed });
    await shot(page, 'browser-s5-failed-test.png');

    await clickNamed(page, '[data-connected-assurance-action="complete_remediation"]');
    const remediated = await toastMatching(page, 'complete_remediation|invalid|failed|missing');
    record('BROWSER-S5-REMEDIATION', /complete_remediation/i.test(remediated) ? 'PASS' : 'FAIL', { toast: remediated });

    const retestEvidence = await registerEvidence(page, `${RUN} retest evidence`);
    ids.retestEvidenceId = retestEvidence.evidenceId;
    await openHash(page, `#/assurance/${ids.assuranceId}`);
    await page.locator('[data-connected-assurance-evidence-id]').fill(ids.retestEvidenceId);
    await clickNamed(page, '[data-connected-assurance-retest="true"]');
    const retest = await toastMatching(page, 'record_test|evidence|invalid|failed');
    record('BROWSER-S5-RETEST', /record_test/i.test(retest) ? 'PASS' : 'FAIL', { toast: retest, evidenceId: ids.retestEvidenceId });
    await shot(page, 'browser-s5-retest.png');
  });

  await runAs('C', async ({ page }) => {
    watch(page);
    await openHash(page, `#/assurance/${ids.assuranceId}`);
    await clickNamed(page, '[data-connected-assurance-action="close_lifecycle"]');
    const closed = await toastMatching(page, 'close_lifecycle|premature|segregation|invalid|failed');
    record('BROWSER-S5-CLOSE', /close_lifecycle/i.test(closed) ? 'PASS' : 'FAIL', { toast: closed });
    await clickNamed(page, '[data-connected-assurance-action="close_lifecycle"]');
    const duplicate = await toastMatching(page, 'close_lifecycle|premature|invalid|failed');
    record('BROWSER-S5-DUPLICATE-CLOSE', /close_lifecycle/i.test(duplicate) ? 'PASS' : 'FAIL', { toast: duplicate });
    await shot(page, 'browser-s5-closed.png');
    const persisted = await page.evaluate(async (assuranceId) => {
      const res = await fetch(`/api/ri-lab/assurance-reviews/${assuranceId}`, { credentials: 'same-origin' });
      const body = await res.json();
      const review = body.assuranceReview || body.review || {};
      const events = await fetch(
        `/api/ri-lab/workflow-events?entityType=assurance_review&entityId=${assuranceId}&limit=40`,
        { credentials: 'same-origin' },
      );
      const ev = await events.json();
      const rows = ev.events || ev.workflowEvents || [];
      return {
        http: res.status,
        status: review.assuranceStatus || review.metadata?.assuranceStatus || review.status || null,
        eventTypes: rows.map((e) => e.eventType || e.event_type),
      };
    }, ids.assuranceId);
    ids.auditEventTypes = persisted.eventTypes;
    record(
      'BROWSER-S5-AUDIT',
      persisted.eventTypes.includes('COMPLIANCE_LIFECYCLE_CLOSED') ? 'PASS' : 'FAIL',
      persisted,
    );
  });
}

writeFileSync(
  join(OUT, 'BROWSER-S25.json'),
  JSON.stringify({ run: RUN, ids, results, consoleErrors: bag.console.slice(0, 40), failedApi: bag.http.slice(0, 40) }, null, 2),
);
process.exit(results.some((r) => r.status === 'FAIL') || results.length === 0 ? 1 : 0);
