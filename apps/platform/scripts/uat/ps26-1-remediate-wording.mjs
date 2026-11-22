#!/usr/bin/env node
/**
 * Remediate OPEN PS26/1 obligations whose register wording exceeds verified quotations.
 * Workflow: independent return to DRAFT → maker corrects statement → submit IN_REVIEW → checker re-approves OPEN.
 * Preserves workflow_events history (no silent DB overwrite).
 */
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runAs, STAGING_ORIGIN } from './staging-user-sessions.mjs';

const LAB = `${STAGING_ORIGIN}/design-lab/regulatory-intelligence/index.html`;
const EVIDENCE = resolve(process.cwd(), '..', '..', 'docs', 'eval', 'PS26-1-REMEDIATION-EVIDENCE.json');

/** Grounded statements — verbatim from verified sourceQuotation metadata (authoritative evidence). */
const PLANS = {
  '63b84f23-9b4f-424a-96c9-f33eb3192779': {
    statement:
      '(1) Before a firm takes any of the actions specified in (2), it must give the borrower reasonable notice of its intention to do so.',
    note: 'Narrowed to verified 7.20.3R(1) quotation on p.95; debt-advice element from 7.20.3R(4) not asserted without p.96 evidence.',
  },
  'a0a7e64d-0cb4-406f-9ca4-484c91db348e': {
    statement:
      "(1) Before making an agreement, the firm must: (a) give to the customer the information set out in CONC 4.2A.5R(1) (referred to in this section as the 'key product information'); and (b) give, or make available, to the customer the information set out in CONC 4.2A.5R(2) (referred to in this section as the 'additional product information').",
    note: 'Statement matches verified 4.2A.3R(1) quotation only.',
  },
  'fdcf8241-608e-467d-a8f8-12a52c75b852': {
    statement:
      '(1) Immediately after an agreement has been made, the firm must give, or make available, to the customer in a durable medium: (a) a copy of the agreement; and (b) the key product information and the additional product information described in CONC 4.2A.5R.',
    note: 'Matches verified 4.2A.6R(1) quotation.',
  },
  'db123fac-c36c-4c0d-bb9e-54174ac15aa3': {
    statement:
      '(2) The firm must, before making the agreement, provide the guarantor with the information in (3) in order to place the guarantor in a position to make an informed decision as to whether to act as the guarantor in relation to the agreement.',
    note: 'Matches verified 4.2A.7R(2) quotation.',
  },
};

async function toastAfter(page, click) {
  await click();
  const el = await page.waitForSelector('#ri-toast:not([hidden])', { timeout: 30_000 }).catch(() => null);
  return el ? (await el.textContent()).trim() : null;
}

async function openObligation(page, id) {
  await page.goto(`${LAB}#/obligation/${id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => !document.querySelector('[data-connected-catalogue-loading]') && document.querySelector('.ri-dl'),
    null,
    { timeout: 90_000 },
  );
  await page.waitForSelector(`[data-connected-obligation-panel="${id}"], [data-connected-obligation-review="${id}"]`, {
    timeout: 90_000,
  });
  await page.waitForLoadState('networkidle').catch(() => null);
}

async function patchStatus(page, id, status, act, label) {
  const panel = page.locator(`[data-connected-obligation-panel="${id}"]`);
  await panel.locator('[data-connected-obligation-field="status"]').fill(status);
  const expected = await panel.locator('[data-connected-obligation-save]').getAttribute('data-expected-updated-at');
  return act(label, () => toastAfter(page, () => panel.locator('[data-connected-obligation-save]').click()));
}

async function remediateOne(id, plan) {
  const log = { id, steps: [] };

  await runAs('C', async ({ page, identity, act }) => {
    await openObligation(page, id);
    const panel = page.locator(`[data-connected-obligation-panel="${id}"]`);
    const current = await panel.locator('[data-connected-obligation-field="status"]').inputValue();
    if (current === 'OPEN') {
      const returnBtn = page.locator(`[data-connected-obligation-decision="DRAFT"][data-obligation-id="${id}"]`);
      if (await returnBtn.count()) {
        const toast = await act(`C return ${id} to DRAFT`, () => toastAfter(page, () => returnBtn.click()));
        log.steps.push({ actor: identity.userId, action: 'return_to_draft_via_review', toast, status: 'OPEN→DRAFT' });
      } else {
        const toast = await patchStatus(page, id, 'DRAFT', act, `C set ${id} DRAFT for remediation`);
        log.steps.push({ actor: identity.userId, action: 'status_draft', toast });
      }
    }
  });

  await runAs('A', async ({ page, identity, act }) => {
    await openObligation(page, id);
    const panel = page.locator(`[data-connected-obligation-panel="${id}"]`);
    const stmt = panel.locator('[data-connected-obligation-field="obligation_statement"]');
    await stmt.fill(plan.statement);
    const saveToast = await act(`A correct obligation statement ${id}`, () =>
      toastAfter(page, () => panel.locator('[data-connected-obligation-save]').click()),
    );
    log.steps.push({ actor: identity.userId, action: 'correct_statement', note: plan.note, toast: saveToast });
    const submitToast = await patchStatus(page, id, 'IN_REVIEW', act, `A submit ${id} for re-approval`);
    log.steps.push({ actor: identity.userId, action: 'submit_in_review', toast: submitToast });
  });

  await runAs('C', async ({ page, identity, act }) => {
    await openObligation(page, id);
    const button = page.locator(`[data-connected-obligation-decision="OPEN"][data-obligation-id="${id}"]`);
    await button.waitFor({ timeout: 30_000 });
    const toast = await act(`C re-approve ${id}`, () => toastAfter(page, () => button.click()));
    log.steps.push({ actor: identity.userId, action: 'approve_open', toast });
    const finalStmt = await page.locator(`[data-connected-obligation-panel="${id}"] [data-connected-obligation-field="obligation_statement"]`).inputValue();
    log.finalStatement = finalStmt.slice(0, 80);
    log.finalStatus = await page.locator(`[data-connected-obligation-panel="${id}"] [data-connected-obligation-field="status"]`).inputValue();
  });

  return log;
}

const out = { remediatedAt: new Date().toISOString(), obligations: [] };
for (const [id, plan] of Object.entries(PLANS)) {
  try {
    out.obligations.push(await remediateOne(id, plan));
  } catch (e) {
    out.obligations.push({ id, error: e.message });
  }
}
writeFileSync(EVIDENCE, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
const failed = out.obligations.filter((o) => o.error);
process.exit(failed.length ? 1 : 0);