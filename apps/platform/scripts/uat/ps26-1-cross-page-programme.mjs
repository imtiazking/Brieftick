#!/usr/bin/env node
/**
 * PS26/1 cross-page programme — authorised extraction uat-ps26-1-cross-page-002 (paid, no retry).
 *
 *   node scripts/uat/ps26-1-cross-page-programme.mjs run-all
 *   node scripts/uat/ps26-1-cross-page-programme.mjs extract <changeId>
 *   node scripts/uat/ps26-1-cross-page-programme.mjs review <runId>
 *   node scripts/uat/ps26-1-cross-page-programme.mjs approve-chain <obligationId>
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runAs, STAGING_ORIGIN } from './staging-user-sessions.mjs';

const PUBLICATION_ID = '829c5472-953a-40ff-9628-947afbfe4e7a';
const RUN_REFERENCE = 'uat-ps26-1-cross-page-002';
const CHANGE_TITLE = 'UAT — PS26/1 cross-page CONC 7.20.1R(2) (RI-CLS-009)';
const APPLICABILITY_RATIONALE =
  'Authorised UAT cross-page programme: staging test organisation treated as a consumer credit firm offering deferred payment credit; PS26/1 CONC Annex F applies. Single authorised extraction uat-ps26-1-cross-page-002 only.';
const APPROVAL_COMMENT =
  'Independent check: cross-page CONC 7.20.1R(2) UAT scope only. Approved for the authorised extraction reference uat-ps26-1-cross-page-002.';
const LAB = `${STAGING_ORIGIN}/design-lab/regulatory-intelligence/index.html`;
const EVIDENCE = resolve(process.cwd(), '..', '..', 'docs', 'eval', 'PS26-1-CROSS-PAGE-PROGRAMME.json');
const MARKER = join(process.env.LOCALAPPDATA || '.', 'forgeniq-uat-sessions', `extraction-${RUN_REFERENCE}.started`);
mkdirSync(resolve(process.cwd(), '..', '..', 'docs', 'eval', 'ps26-1-cross-page'), { recursive: true });

const CONC_BASIS = (ref) => `FCA Handbook ${ref}, Consumer Credit (Deferred Payment Credit) Instrument 2026 (FCA 2026/2), PS26/1 Annex F`;

const log = [];
const record = (step, payload) => {
  log.push({ step, at: new Date().toISOString(), ...payload });
  writeFileSync(EVIDENCE, JSON.stringify({ runReference: RUN_REFERENCE, log }, null, 2));
  return payload;
};

async function openApplicability(page) {
  await page.goto(`${LAB}#/applicability/${PUBLICATION_ID}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.querySelector('[data-connected-applicability-loading]') && document.querySelector('.ri-dl'), null, {
    timeout: 60_000,
  });
}

async function workflowStatus(page) {
  const dd = page.locator('.ri-dl dt', { hasText: 'Workflow status' }).locator('xpath=following-sibling::dd[1]');
  return (await dd.textContent().catch(() => '')) || '';
}

async function ensureApplicabilityApproved() {
  const a = await runAs('A', async ({ page, identity }) => {
    await openApplicability(page);
    const status = await workflowStatus(page);
    if (/APPROVED/i.test(status)) return record('applicability-skip', { actor: identity.userId, status });
    const panel = page.locator('[data-connected-applicability-panel]');
    if (!(await panel.count())) throw new Error(`applicability not editable; status=${status}`);
    await panel.locator('[data-connected-applicability-recommendation]').selectOption('APPLICABLE');
    await panel.locator('[data-connected-applicability-rationale]').fill(APPLICABILITY_RATIONALE);
    await panel.locator('[data-connected-applicability-save]').click();
    await page.waitForTimeout(800);
    await panel.locator('[data-connected-applicability-submit]').click();
    return record('submit-applicability', { actor: identity.userId, status });
  });
  if (/APPROVED/i.test(a.status || '')) return a;
  return runAs('C', async ({ page, identity, act }) => {
    await openApplicability(page);
    const checker = page.locator('[data-connected-applicability-checker]');
    if (!(await checker.count())) {
      const status = await workflowStatus(page);
      if (/APPROVED/i.test(status)) return record('applicability-already-approved', { actor: identity.userId, status });
      throw new Error('checker panel missing');
    }
    await checker.locator('[data-connected-applicability-decision-comments]').fill(APPROVAL_COMMENT);
    await act('approve applicability', () => checker.locator('[data-connected-applicability-approve]').click());
    return record('approve-applicability', { actor: identity.userId });
  });
}

async function createChange() {
  return runAs('A', async ({ page, identity, act }) => {
    await page.goto(`${LAB}#/changes`, { waitUntil: 'domcontentloaded' });
    const panel = page.locator('[data-connected-create-change]');
    await panel.waitFor({ timeout: 60_000 });
    await panel.locator('[data-create-change-mode][value="uat_authorised"]').check();
    await panel.locator('[data-create-change-pub-trigger]').click();
    await panel.locator('[data-create-change-publication-search]').fill('PS26/1');
    await panel.locator(`[data-create-change-pub-option][data-pub-id="${PUBLICATION_ID}"]`).click();
    await panel.locator('[data-create-change-title]').fill(CHANGE_TITLE);
    await panel.locator('[data-create-change-type]').fill('Policy update');
    await act('create cross-page UAT change', async () => {
      await panel.locator('[data-connected-create-change-submit]').click();
      await page.waitForURL(/#\/change\/[0-9a-f-]{36}/, { timeout: 60_000 });
    });
    const changeId = page.url().match(/#\/change\/([0-9a-f-]{36})/)?.[1];
    return record('create-change', { actor: identity.userId, changeId });
  });
}

async function extract(changeId) {
  if (existsSync(MARKER)) throw new Error(`${RUN_REFERENCE} already started — no retry`);
  return runAs('A', async ({ page, identity, act }) => {
    await page.goto(`${LAB}#/publication/${PUBLICATION_ID}/ai`, { waitUntil: 'domcontentloaded' });
    const wrap = page.locator(`[data-connected-pub-ai-request="${PUBLICATION_ID}"]`);
    await wrap.waitFor({ timeout: 60_000 });
    await wrap.locator('[data-connected-pub-ai-change-id]').fill(changeId);
    await wrap.locator('[data-connected-pub-ai-idempotency]').fill(RUN_REFERENCE);
    return act(`authorised extraction ${RUN_REFERENCE}`, async () => {
      const responsePromise = page.waitForResponse(
        (r) => r.url().endsWith('/api/ri-lab/ai-analysis-runs') && r.request().method() === 'POST',
        { timeout: 330_000 },
      );
      await wrap.locator('[data-connected-pub-ai-submit]').click();
      const response = await responsePromise;
      const body = await response.json().catch(() => ({}));
      if (body.ok === true && body.reused !== true) {
        writeFileSync(MARKER, `${new Date().toISOString()} ${body.runId || ''}\n`, { flag: 'wx' });
      }
      return record('extract', {
        actor: identity.userId,
        changeId,
        httpStatus: response.status(),
        ...body,
      });
    });
  });
}

async function inspectFindings(runId) {
  return runAs('B', async ({ page }) =>
    record(
      'inspect-findings',
      await page.evaluate(async (id) => {
        const res = await fetch(`/api/ri-lab/ai-analysis-runs/${id}/findings`, { credentials: 'same-origin', cache: 'no-store' });
        const body = await res.json();
        const f1 = (body.findings || []).find((f) => f.number === 1);
        return {
          status: res.status,
          reviewStatus: body.reviewStatus,
          finding1: f1
            ? {
                pages: f1.pages,
                queue: f1.triage?.queue,
                reasons: f1.triage?.exceptionReasons,
                conversionEligible: f1.triage?.conversionEligible,
                sections: (f1.sections || []).map((s) => ({ page: s.pageNumber, provisions: s.provisionsSetOut })),
              }
            : null,
        };
      }, runId),
    ),
  );
}

function buildReviewPlan() {
  const convert = (ref, page, quotation, comment) => ({
    decision: 'ACCEPTED',
    code: 'R',
    provisionFunction: 'OPERATIVE_REQUIREMENT',
    provisionReference: ref,
    disposition: 'CONVERT_TO_DRAFT_OBLIGATION',
    reclassificationEvidence: `Quoted text is ${ref} (R) on PDF p.${page}; provision set-out page cited via RI-CLS-009.`,
    legalBasis: CONC_BASIS(ref),
    quotation,
    page: String(page),
    comment,
  });
  const reject = (comment) => ({ decision: 'REJECTED', comment });
  return {
    1: convert(
      'CONC 7.20.1R',
      95,
      '(2) As soon as possible after a missed payment has occurred the firm must: (a) notify the borrower: (i) that the missed payment has occurred',
      'Cross-page RI-CLS-009: 7.20.1R set out on p.94, operative (2)–(4) on p.95 per FCA 2026/2 instrument text (not legacy narrative quote).',
    ),
  };
}

async function fillCard(page, number, d) {
  const card = page.locator(`[data-finding-review-item][data-finding-number="${number}"]`);
  await card.locator(`[data-finding-decision][value="${d.decision}"]`).check();
  if (d.decision === 'ACCEPTED') {
    await card.locator('[data-finding-code]').selectOption(d.code);
    if (d.provisionFunction) await card.locator('[data-finding-provision-function]').selectOption(d.provisionFunction);
    if (d.provisionReference) await card.locator('[data-finding-provision-reference]').fill(d.provisionReference);
    await card.locator('[data-finding-disposition]').selectOption(d.disposition);
    if (d.reclassificationEvidence) await card.locator('[data-finding-reclassification]').fill(d.reclassificationEvidence);
    if (d.legalBasis) await card.locator('[data-finding-legal-basis]').fill(d.legalBasis);
    if (d.quotation) await card.locator('[data-finding-quotation]').fill(d.quotation);
    if (d.page) await card.locator('[data-finding-page]').selectOption(d.page);
  }
  await card.locator('[data-finding-comment]').fill(d.comment);
}

async function review(runId) {
  const plan = buildReviewPlan();
  return runAs('B', async ({ page, identity, act }) => {
    await page.goto(`${LAB}#/ai-analysis/${runId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-connected-ai-finding-review] [data-finding-review-item]', { timeout: 120_000 });
    const count = await page.locator('[data-finding-review-item]').count();
    for (let n = 1; n <= count; n++) {
      const spec = plan[n] || {
        decision: 'REJECTED',
        comment: 'Rejected for focused cross-page CONC 7.20.1R UAT; other findings not in scope for this authorised run.',
      };
      await fillCard(page, n, spec);
    }
    await page.locator('[data-finding-review-notes]').fill(
      `Authorised cross-page extraction ${RUN_REFERENCE}: convert CONC 7.20.1R(2) only; reject remaining findings.`,
    );
    const result = await act('cross-page finding review', async () => {
      const responsePromise = page.waitForResponse(
        (r) => r.url().includes(`/ai-analysis-runs/${runId}/findings`) && r.request().method() === 'POST',
        { timeout: 120_000 },
      );
      await page.locator('[data-finding-review-submit]').click();
      const response = await responsePromise;
      const body = await response.json().catch(() => ({}));
      return { httpStatus: response.status(), ...body };
    });
    return record('review', { actor: identity.userId, runId, result });
  });
}

async function approveChain(obligationId) {
  await runAs('A', async ({ page, act }) => {
    await page.goto(`${LAB}#/obligation/${obligationId}`, { waitUntil: 'domcontentloaded' });
    const panel = page.locator(`[data-connected-obligation-panel="${obligationId}"]`);
    await panel.locator('[data-connected-obligation-field="status"]').fill('IN_REVIEW');
    await act('submit obligation', () => panel.locator('[data-connected-obligation-save]').click());
  });
  await runAs('B', async ({ page, act }) => {
    const btn = page.locator(`[data-connected-obligation-decision="OPEN"][data-obligation-id="${obligationId}"]`);
    if (await btn.count()) {
      const res = await act('SoD negative', async () => {
        const r = await page.request.patch(`/api/ri-lab/obligations/${obligationId}`, { data: { status: 'OPEN' } });
        return { status: r.status() };
      });
      record('refuse-approver-b', res);
    }
  });
  return runAs('C', async ({ page, identity, act }) => {
    await page.goto(`${LAB}#/obligation/${obligationId}`, { waitUntil: 'domcontentloaded' });
    const btn = page.locator(`[data-connected-obligation-decision="OPEN"][data-obligation-id="${obligationId}"]`);
    await btn.waitFor({ timeout: 60_000 });
    await act('approve obligation', () => btn.click());
    return record('approve', { actor: identity.userId, obligationId });
  });
}

async function runAll() {
  await ensureApplicabilityApproved();
  const { changeId } = await createChange();
  const ext = await extract(changeId);
  if (!ext.runId) throw new Error(`extraction failed: ${JSON.stringify(ext)}`);
  const insp = await inspectFindings(ext.runId);
  if (insp.finding1?.queue === 'EXCEPTION_TRIAGE' && !insp.finding1?.conversionEligible) {
    record('cross-page-precheck-warn', { finding1: insp.finding1 });
  }
  const rev = await review(ext.runId);
  const ob = (rev.result?.materialised || []).find((m) => m.classificationCode === 'R')?.obligationId;
  if (!ob) throw new Error('CONC 7.20.1R obligation not materialised');
  await approveChain(ob);
  return record('complete', { changeId, runId: ext.runId, obligationId: ob });
}

const [cmd, arg] = process.argv.slice(2);
const commands = {
  'run-all': runAll,
  'create-change': createChange,
  extract: () => extract(arg),
  'inspect-findings': () => inspectFindings(arg),
  review: () => review(arg),
  'approve-chain': () => approveChain(arg),
};
if (!commands[cmd]) {
  console.error(`usage: ${Object.keys(commands).join(' | ')}`);
  process.exit(2);
}
commands[cmd]().then(
  (r) => console.log(JSON.stringify(r, null, 2)),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);