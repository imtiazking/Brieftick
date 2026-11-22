#!/usr/bin/env node
/**
 * PS22/9 comprehensive CLS-005 UAT — authorised extraction uat-ps22-9-001 (paid, single attempt).
 * Negative API probes run before the final review submission.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runAs, STAGING_ORIGIN } from './staging-user-sessions.mjs';

const PUBLICATION_ID = '7a73ac4c-d6b4-4411-9f6d-1276053f2831';
const RUN_REFERENCE = 'uat-ps22-9-001';
const LAB = `${STAGING_ORIGIN}/design-lab/regulatory-intelligence/index.html`;
const EVIDENCE = resolve(process.cwd(), '..', '..', 'docs', 'eval', 'PS22-9-COMPREHENSIVE-UAT.json');
const MARKER = join(process.env.LOCALAPPDATA || '.', 'forgeniq-uat-sessions', `extraction-${RUN_REFERENCE}.started`);
const CHANGE_TITLE = 'UAT — PS22/9 Consumer Duty R / E / G comprehensive (RI-CLS-005)';
mkdirSync(resolve(process.cwd(), '..', '..', 'docs', 'eval', 'ps22-9-uat'), { recursive: true });

const log = [];
const record = (step, payload) => {
  log.push({ step, at: new Date().toISOString(), ...payload });
  writeFileSync(EVIDENCE, JSON.stringify({ runReference: RUN_REFERENCE, log }, null, 2));
  return payload;
};

async function apiJson(page, path, { method = 'GET', body } = {}) {
  const res = await page.request.fetch(`${STAGING_ORIGIN}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    data: body,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status(), ...json };
}

async function createChange() {
  return runAs('A', async ({ page, identity, act }) => {
    await page.goto(`${LAB}#/changes`, { waitUntil: 'domcontentloaded' });
    const panel = page.locator('[data-connected-create-change]');
    await panel.locator('[data-create-change-mode][value="uat_authorised"]').check();
    await panel.locator('[data-create-change-pub-trigger]').click();
    await panel.locator('[data-create-change-publication-search]').fill('PS22/9');
    await panel.locator(`[data-create-change-pub-option][data-pub-id="${PUBLICATION_ID}"]`).click();
    await panel.locator('[data-create-change-title]').fill(CHANGE_TITLE);
    await panel.locator('[data-create-change-type]').fill('Policy update');
    await act('create PS22/9 change', async () => {
      await panel.locator('[data-connected-create-change-submit]').click();
      await page.waitForURL(/#\/change\/[0-9a-f-]{36}/, { timeout: 60_000 });
    });
    const changeId = page.url().match(/#\/change\/([0-9a-f-]{36})/)?.[1];
    return record('create-change', { actor: identity.userId, changeId });
  });
}

async function workflowStatus(page) {
  const dd = page.locator('.ri-dl dt', { hasText: 'Workflow status' }).locator('xpath=following-sibling::dd[1]');
  return (await dd.textContent().catch(() => '')) || '';
}

async function ensureApplicabilityApproved() {
  const first = await runAs('A', async ({ page, identity }) => {
    await page.goto(`${LAB}#/applicability/${PUBLICATION_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('.ri-dl'), null, { timeout: 60_000 });
    const status = await workflowStatus(page);
    if (/APPROVED/i.test(status)) return record('applicability-skip', { actor: identity.userId, status });
    if (/IN_REVIEW/i.test(status)) return record('applicability-awaiting-approval', { actor: identity.userId, status });
    const panel = page.locator('[data-connected-applicability-panel]');
    if (!(await panel.count())) throw new Error(`applicability panel missing; status=${status}`);
    await panel.locator('[data-connected-applicability-recommendation]').selectOption('APPLICABLE');
    await panel.locator('[data-connected-applicability-rationale]').fill(
      'PS22/9 UAT: authorised firm in scope of Consumer Duty; comprehensive R/E/G extraction test uat-ps22-9-001 only.',
    );
    await panel.locator('[data-connected-applicability-save]').click();
    await page.waitForTimeout(1000);
    await panel.locator('[data-connected-applicability-submit]').click();
    await page.waitForTimeout(1500);
    return record('submit-applicability', { actor: identity.userId, status: await workflowStatus(page) });
  });
  if (/APPROVED/i.test(first.status || '')) return first;
  if (first.step === 'applicability-awaiting-approval') {
    /* fall through to User C */
  } else if (/IN_REVIEW/i.test(first.status || '')) {
    /* fall through */
  } else if (first.step !== 'submit-applicability') {
    return first;
  }
  return runAs('C', async ({ page, identity }) => {
    await page.goto(`${LAB}#/applicability/${PUBLICATION_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('.ri-dl'), null, { timeout: 60_000 });
    const checker = page.locator('[data-connected-applicability-checker]');
    if (!(await checker.count())) {
      const status = await workflowStatus(page);
      if (/APPROVED/i.test(status)) return record('applicability-already-approved', { actor: identity.userId, status });
      throw new Error(`checker missing; status=${status}`);
    }
    await checker.locator('[data-connected-applicability-decision-comments]').fill('Approved for PS22/9 comprehensive UAT.');
    await checker.locator('[data-connected-applicability-approve]').click();
    await page.waitForTimeout(1500);
    return record('approve-applicability', { actor: identity.userId, status: await workflowStatus(page) });
  });
}

async function extract(changeId) {
  if (existsSync(MARKER)) throw new Error(`${RUN_REFERENCE} already started — no retry`);
  return runAs('A', async ({ page, identity, act }) => {
    await page.goto(`${LAB}#/publication/${PUBLICATION_ID}/ai`, { waitUntil: 'domcontentloaded' });
    const wrap = page.locator(`[data-connected-pub-ai-request="${PUBLICATION_ID}"]`);
    await wrap.locator('[data-connected-pub-ai-change-id]').fill(changeId);
    await wrap.locator('[data-connected-pub-ai-idempotency]').fill(RUN_REFERENCE);
    return act(`extract ${RUN_REFERENCE}`, async () => {
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
      return record('extract', { actor: identity.userId, httpStatus: response.status(), ...body });
    });
  });
}

async function loadFindings(page, runId) {
  const body = await apiJson(page, `/api/ri-lab/ai-analysis-runs/${runId}/findings`);
  return body.findings || [];
}

function pickFinding(findings, predicate) {
  return findings.find(predicate) || findings[0];
}

async function negativeProbes(runId) {
  return runAs('B', async ({ page, identity }) => {
    const findings = await loadFindings(page, runId);
    const f = findings[0];
    const base = {
      notes: 'Negative probe — must not persist',
      decisions: [
        {
          findingNumber: f?.number ?? 1,
          decision: 'ACCEPTED',
          classificationCode: 'R',
          disposition: 'CONVERT_TO_DRAFT_OBLIGATION',
          provisionReference: 'PRIN 2A.1.1G',
          provisionFunction: 'OPERATIVE_REQUIREMENT',
          quotation: 'This is guidance not a rule — negative G conversion test.',
          pageNumber: String(f?.pages?.[0] ?? 1),
          comment: 'G conversion refusal probe',
        },
      ],
    };
    const gRefusal = await apiJson(page, `/api/ri-lab/ai-analysis-runs/${runId}/findings`, { method: 'POST', body: base });
    const badCode = await apiJson(page, `/api/ri-lab/ai-analysis-runs/${runId}/findings`, {
      method: 'POST',
      body: {
        notes: 'bad class',
        decisions: [{ findingNumber: f?.number ?? 1, decision: 'ACCEPTED', classificationCode: 'FOO', disposition: 'CONVERT_TO_DRAFT_OBLIGATION', comment: 'x'.repeat(30) }],
      },
    });
    const badEvidence = await apiJson(page, `/api/ri-lab/ai-analysis-runs/${runId}/findings`, {
      method: 'POST',
      body: {
        notes: 'bad evidence',
        decisions: [
          {
            findingNumber: f?.number ?? 1,
            decision: 'ACCEPTED',
            classificationCode: 'R',
            disposition: 'CONVERT_TO_DRAFT_OBLIGATION',
            provisionReference: 'PRIN 2A.2.1R',
            quotation: 'too short',
            comment: 'invalid evidence probe',
          },
        ],
      },
    });
    const dup = await apiJson(page, `/api/ri-lab/ai-analysis-runs/${runId}/findings`, {
      method: 'POST',
      body: { notes: 'dup1', decisions: [{ findingNumber: f?.number ?? 1, decision: 'REJECTED', comment: 'first pass placeholder for duplicate test' }] },
    });
    const dup2 = await apiJson(page, `/api/ri-lab/ai-analysis-runs/${runId}/findings`, {
      method: 'POST',
      body: {
        notes: 'dup2',
        decisions: findings.map((x) => ({ findingNumber: x.number, decision: 'REJECTED', comment: `reject all probe ${x.number}` })),
      },
    });
    return record('negative-probes', {
      actor: identity.userId,
      gRefusal: { status: gRefusal.status, error: gRefusal.error || gRefusal.detail },
      badCode: { status: badCode.status, error: badCode.error || badCode.detail },
      badEvidence: { status: badEvidence.status, error: badEvidence.error || badEvidence.detail },
      dup: { status: dup.status },
      dup2: { status: dup2.status, error: dup2.error || dup2.detail },
      findingCount: findings.length,
    });
  });
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
    if (d.obligationStatement) await card.locator('[data-finding-obligation-statement]').fill(d.obligationStatement);
  }
  await card.locator('[data-finding-comment]').fill(d.comment);
}

async function finalReview(runId) {
  return runAs('B', async ({ page, identity, act }) => {
    const findings = await loadFindings(page, runId);
    const pageFor = (n) => String(findings.find((f) => f.number === n)?.pages?.[0] ?? findings[n - 1]?.pages?.[0] ?? '');
    await page.goto(`${LAB}#/ai-analysis/${runId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-finding-review-item]', { timeout: 120_000 });
    const count = await page.locator('[data-finding-review-item]').count();
    for (let n = 1; n <= count; n++) {
      if (n === 6) {
        await fillCard(page, n, {
          decision: 'ACCEPTED',
          code: 'R',
          provisionFunction: 'OPERATIVE_REQUIREMENT',
          provisionReference: 'PRIN 2A.4.13R',
          disposition: 'CONVERT_TO_DRAFT_OBLIGATION',
          reclassificationEvidence: 'Collaboration rule on cited page 122.',
          legalBasis: 'FCA Handbook PRIN 2A.4.13R, PS22/9',
          quotation: 'Where firms collaborate to manufacture a product, they must set out in a writte',
          obligationStatement: 'Where firms collaborate to manufacture a product, they must set out in a writte',
          page: pageFor(6),
          comment: 'Second operative R conversion; no evidential (E) provision appeared in this partial extraction.',
        });
      } else {
        await fillCard(page, n, {
          decision: 'REJECTED',
          comment: 'Rejected for focused PS22/9 UAT; triage queues validated via negative probes.',
        });
      }
    }
    await page.locator('[data-finding-review-notes]').fill(`PS22/9 comprehensive review after negative probes — ${RUN_REFERENCE}`);
    const result = await act('final review', async () => {
      const responsePromise = page.waitForResponse(
        (r) => r.url().includes(`/ai-analysis-runs/${runId}/findings`) && r.request().method() === 'POST',
        { timeout: 120_000 },
      );
      await page.locator('[data-finding-review-submit]').click();
      const response = await responsePromise;
      return { httpStatus: response.status(), ...(await response.json().catch(() => ({}))) };
    });
    return record('final-review', { actor: identity.userId, result });
  });
}

async function runAll() {
  await ensureApplicabilityApproved();
  const { changeId } = await createChange();
  const ext = await extract(changeId);
  if (!ext.runId) throw new Error(`extraction failed: ${JSON.stringify(ext)}`);
  const negatives = await negativeProbes(ext.runId);
  const review = await finalReview(ext.runId);
  return record('complete', { changeId, runId: ext.runId, negatives, review });
}

const [cmd, arg] = process.argv.slice(2);
const commands = { 'run-all': runAll, extract: () => extract(arg), 'negative-probes': () => negativeProbes(arg), 'final-review': () => finalReview(arg) };
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