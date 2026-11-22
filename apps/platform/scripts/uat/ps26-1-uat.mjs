#!/usr/bin/env node
/**
 * PS26/1 authenticated UAT through the Design Lab UI, one step per command.
 *
 *   node scripts/uat/ps26-1-uat.mjs create-change          User A registers the authorised UAT change
 *   node scripts/uat/ps26-1-uat.mjs submit-applicability   User A saves and submits the applicability assessment
 *   node scripts/uat/ps26-1-uat.mjs approve-applicability  User C approves it
 *   node scripts/uat/ps26-1-uat.mjs extract <changeId>     User A starts the single authorised extraction (never retried)
 *   node scripts/uat/ps26-1-uat.mjs inspect-findings <runId>  read-only: User B's review form data
 *   node scripts/uat/ps26-1-uat.mjs review                 User B's single provision-level review
 *   node scripts/uat/ps26-1-uat.mjs submit-obligations <ids…>   User A moves the DRAFT obligations to IN_REVIEW
 *   node scripts/uat/ps26-1-uat.mjs approve-obligations <ids…>  User C approves them into the register
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runAs, STAGING_ORIGIN } from './staging-user-sessions.mjs';

const PUBLICATION_ID = '829c5472-953a-40ff-9628-947afbfe4e7a';
const RUN_REFERENCE = 'uat-ps26-1-001';
const CHANGE_TITLE = 'UAT — PS26/1 Regulating Buy Now Pay Later (Deferred Payment Credit)';
const APPLICABILITY_RATIONALE =
  'Authorised UAT: FORGENIQ AI Development is the staging test organisation and is treated as a consumer credit firm offering deferred payment credit, so the PS26/1 CONC instrument (Annex F) applies. Recorded solely for the single authorised UC-RI-005 extraction test.';
const APPROVAL_COMMENT =
  'Independent check: rationale is consistent with the UAT scope (test organisation treated as a DPC lender within the PS26/1 CONC instrument). Approved for the single authorised extraction only.';
const LAB = `${STAGING_ORIGIN}/design-lab/regulatory-intelligence/index.html`;
const EVIDENCE_DIR = resolve(process.cwd(), '..', '..', 'docs', 'eval', 'ps26-1-uat');
const EXTRACTION_MARKER = join(process.env.LOCALAPPDATA || '.', 'forgeniq-uat-sessions', `extraction-${RUN_REFERENCE}.started`);

mkdirSync(EVIDENCE_DIR, { recursive: true });
const shot = (page, name) => page.screenshot({ path: join(EVIDENCE_DIR, `${name}.png`), fullPage: false });

async function toastAfter(page, click) {
  await click();
  return page
    .waitForSelector('#ri-toast:not([hidden])', { timeout: 30_000 })
    .then((el) => el.textContent())
    .catch(() => null);
}

async function createChange() {
  return runAs('A', async ({ page, identity, act }) => {
    await page.goto(`${LAB}#/changes`, { waitUntil: 'domcontentloaded' });
    const panel = page.locator('[data-connected-create-change]');
    await panel.waitFor({ timeout: 60_000 });
    const uat = panel.locator('[data-create-change-mode][value="uat_authorised"]');
    if (!(await uat.count())) throw new Error('Authorised UAT creation mode is not offered to User A');
    await uat.check();
    await panel.locator('[data-create-change-pub-trigger]').click();
    await panel.locator('[data-create-change-publication-search]').fill('PS26/1');
    await panel.locator(`[data-create-change-pub-option][data-pub-id="${PUBLICATION_ID}"]`).click();
    if ((await panel.locator('[data-create-change-publication]').inputValue()) !== PUBLICATION_ID) throw new Error('PS26/1 publication not selected');
    await panel.locator('[data-create-change-title]').fill(CHANGE_TITLE);
    await panel.locator('[data-create-change-type]').fill('Policy update');
    await shot(page, '1-create-change-before');
    const toast = await act('PS26/1 register authorised UAT change', () =>
      toastAfter(page, () => panel.locator('[data-connected-create-change-submit]').click()),
    );
    await page.waitForURL(/#\/change\/[0-9a-f-]{36}/, { timeout: 30_000 }).catch(() => null);
    const changeId = page.url().match(/#\/change\/([0-9a-f-]{36})/)?.[1] ?? null;
    await page.waitForTimeout(1500);
    await shot(page, '1-create-change-after');
    return { step: 'create-change', actor: identity.userId, toast, changeId };
  });
}

async function openApplicability(page) {
  await page.goto(`${LAB}#/applicability/${PUBLICATION_ID}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.querySelector('[data-connected-applicability-loading]') && document.querySelector('.ri-dl'), null, { timeout: 60_000 });
}

async function submitApplicability() {
  return runAs('A', async ({ page, identity, act }) => {
    await openApplicability(page);
    const panel = page.locator('[data-connected-applicability-panel]');
    await panel.waitFor({ timeout: 30_000 });
    await panel.locator('[data-connected-applicability-recommendation]').selectOption('APPLICABLE');
    await panel.locator('[data-connected-applicability-rationale]').fill(APPLICABILITY_RATIONALE);
    const saveToast = await act('PS26/1 save applicability draft', () =>
      toastAfter(page, () => panel.locator('[data-connected-applicability-save]').click()),
    );
    await page.locator('[data-connected-applicability-submit]').waitFor({ timeout: 30_000 });
    await shot(page, '2-applicability-draft-saved');
    const submitToast = await act('PS26/1 submit applicability for approval', () =>
      toastAfter(page, () => page.locator('[data-connected-applicability-submit]').click()),
    );
    await page.waitForTimeout(1500);
    await shot(page, '2-applicability-submitted');
    return { step: 'submit-applicability', actor: identity.userId, saveToast, submitToast };
  });
}

async function approveApplicability() {
  return runAs('C', async ({ page, identity, act }) => {
    await openApplicability(page);
    const checker = page.locator('[data-connected-applicability-checker]');
    await checker.waitFor({ timeout: 30_000 });
    await checker.locator('[data-connected-applicability-decision-comments]').fill(APPROVAL_COMMENT);
    const toast = await act('PS26/1 approve applicability', () =>
      toastAfter(page, () => checker.locator('[data-connected-applicability-approve]').click()),
    );
    await page.waitForTimeout(1500);
    await shot(page, '3-applicability-approved');
    return { step: 'approve-applicability', actor: identity.userId, toast };
  });
}

async function extract(changeId) {
  if (!/^[0-9a-f-]{36}$/i.test(changeId || '')) throw new Error('usage: extract <changeId>');
  if (existsSync(EXTRACTION_MARKER)) throw new Error(`extraction for ${RUN_REFERENCE} was already started from this machine — never retried`);
  return runAs('A', async ({ page, identity, act }) => {
    await page.goto(`${LAB}#/publication/${PUBLICATION_ID}/ai`, { waitUntil: 'domcontentloaded' });
    const wrap = page.locator(`[data-connected-pub-ai-request="${PUBLICATION_ID}"]`);
    await wrap.waitFor({ timeout: 60_000 });
    const attempted = JSON.parse((await wrap.getAttribute('data-attempted-references')) || '[]');
    if (attempted.includes(RUN_REFERENCE)) throw new Error(`${RUN_REFERENCE} already attempted — not starting another run`);
    await wrap.locator('[data-connected-pub-ai-change-id]').fill(changeId);
    await wrap.locator('[data-connected-pub-ai-idempotency]').fill(RUN_REFERENCE);
    const button = wrap.locator('[data-connected-pub-ai-submit]');
    if (await button.isDisabled()) throw new Error(`Extract button disabled: ${await wrap.locator('[data-connected-pub-ai-reference-hint]').textContent()}`);
    await shot(page, '4-extract-before');

    return act(`PS26/1 single authorised extraction ${RUN_REFERENCE}`, async () => {
      writeFileSync(EXTRACTION_MARKER, `${new Date().toISOString()} ${identity.userId} change ${changeId}\n`, { flag: 'wx' });
      const started = Date.now();
      const responsePromise = page.waitForResponse(
        (r) => r.url().endsWith('/api/ri-lab/ai-analysis-runs') && r.request().method() === 'POST',
        { timeout: 330_000 },
      );
      await button.click();
      let response = null;
      let body = {};
      try {
        response = await responsePromise;
        body = await response.json().catch(() => ({}));
      } catch (err) {
        body = { clientWaitEnded: err.message };
      }
      const elapsedMs = Date.now() - started;
      const status = await wrap.locator('[data-connected-pub-ai-status]').textContent().catch(() => null);
      await page.waitForTimeout(2000);
      await shot(page, '4-extract-after');
      return {
        step: 'extract',
        actor: identity.userId,
        changeId,
        runReference: RUN_REFERENCE,
        httpStatus: response?.status() ?? null,
        ok: body.ok === true,
        runId: body.runId ?? null,
        reused: body.reused ?? null,
        executionStatus: body.executionStatus ?? null,
        error: body.error ?? body.reason ?? body.code ?? body.clientWaitEnded ?? null,
        uiStatus: status,
        clientElapsedMs: elapsedMs,
      };
    });
  });
}

const RUN_ID = 'c8cb095e-2d07-4236-970c-02db88592341';
const CONC_BASIS = (ref) => `FCA Handbook ${ref}, inserted by the Consumer Credit (Deferred Payment Credit) Instrument 2026 (FCA 2026/2), PS26/1 Annex F`;
const convert = (ref, page, quotation, comment) => ({
  decision: 'ACCEPTED',
  code: 'R',
  provisionFunction: 'OPERATIVE_REQUIREMENT',
  provisionReference: ref,
  disposition: 'CONVERT_TO_DRAFT_OBLIGATION',
  reclassificationEvidence: `Quoted text is ${ref}, a rule (R) set out as new text in the legal instrument on PDF p.${page}.`,
  legalBasis: CONC_BASIS(ref),
  quotation,
  page: String(page),
  comment,
});

/** Provision-level decisions; every quotation was matched word for word against the official PDF page text. */
const REVIEW_PLAN = {
  1: { decision: 'ACCEPTED', code: 'UNKNOWN', disposition: 'RECLASSIFICATION_REQUESTED',
    comment: 'Genuine binding duty in CONC 7.20.1R(2) (PDF p.95), but the extraction attributes CONC 7.20.1R only to p.94, where just its application paragraph (1) appears, so the duty cannot be grounded on its page. Held in Exception Triage for manual registration from the Handbook.' },
  2: convert('CONC 7.20.3R', 95, '(1) Before a firm takes any of the actions specified in (2), it must give the borrower reasonable notice of its intention to do so.',
    'Verified against PS26/1 Annex F p.95: CONC 7.20.3R(1) is new rule text imposing a duty to give reasonable notice before enforcement or termination; (4) on p.96 adds the debt-advice requirement.'),
  3: convert('CONC 4.2A.3R', 87, "(1) Before making an agreement, the firm must: (a) give to the customer the information set out in CONC 4.2A.5R(1) (referred to in this section as the 'key product information'); and (b) give, or make available, to the customer the information set out in CONC 4.2A.5R(2) (referred to in this section as the 'additional product information').",
    'Verified against PS26/1 Annex F p.87: CONC 4.2A.3R(1) is new rule text requiring key and additional product information before a DPC agreement is made.'),
  4: convert('CONC 4.2A.6R', 90, '(1) Immediately after an agreement has been made, the firm must give, or make available, to the customer in a durable medium: (a) a copy of the agreement; and (b) the key product information and the additional product information described in CONC 4.2A.5R.',
    'Verified against PS26/1 Annex F p.90: CONC 4.2A.6R(1) is new rule text; the exceptions in (2) are deliberately not quoted as they qualify, not create, the duty.'),
  5: convert('CONC 4.2A.7R', 90, '(2) The firm must, before making the agreement, provide the guarantor with the information in (3) in order to place the guarantor in a position to make an informed decision as to whether to act as the guarantor in relation to the agreement.',
    'Verified against PS26/1 Annex F p.90: CONC 4.2A.7R(2) is new rule text requiring adequate explanations and information for a guarantor before the agreement is made.'),
  6: { decision: 'ACCEPTED', code: 'UNKNOWN', disposition: 'RECLASSIFICATION_REQUESTED',
    comment: 'CONC 4.8.2R (PDF p.93) is amended existing text; the underlining and strike-through that distinguish new from deleted words cannot be verified from the extracted text. Held in Exception Triage for review against the Handbook.' },
  7: { decision: 'ACCEPTED', code: 'R', provisionFunction: 'APPLICATION', provisionReference: 'CONC 2.7.1R', disposition: 'ARCHIVE',
    comment: 'CONC 2.7.1R(4) (PDF p.86) disapplies the distance marketing section for DPC agreements. An application provision, not a standalone duty.' },
  8: { decision: 'ACCEPTED', code: 'EXPL', disposition: 'HORIZON_SCANNING',
    comment: 'Policy statement narrative (PDF p.40) on temporary permission registration; the requirements will be set by FCA Directions not yet published. Referred to horizon scanning.' },
  9: { decision: 'ACCEPTED', code: 'EXPL', disposition: 'HORIZON_SCANNING',
    comment: 'Policy statement narrative (PDF p.40) on preparing for Regulation Day and the 6-month authorisation window. Explanatory, not instrument text; referred to horizon scanning.' },
  10: { decision: 'ACCEPTED', code: 'R', provisionFunction: 'APPLICATION', provisionReference: 'SYSC TP 13.3R', disposition: 'SUPPORTING_INFORMATION',
    comment: 'SYSC TP 13.3R (PDF p.66) states that a firm with only a DPC temporary permission is not an SMCR firm. Scope of the SMCR, not a duty.' },
  11: { decision: 'ACCEPTED', code: 'R', provisionFunction: 'APPLICATION', provisionReference: 'GEN 2.3.1R', disposition: 'ARCHIVE',
    comment: 'GEN 2.3.1R(5) (PDF p.68) applies the Handbook DPC provisions to Gibraltar-based firms. Application provision; not relevant to this organisation.' },
  12: { decision: 'ACCEPTED', code: 'DEF', disposition: 'SUPPORTING_INFORMATION',
    comment: "DISP 1 Annex 1.9R (PDF p.81) adds DPC agreements to the 'service provided' definition for complaints returns; the PSD thresholds are narrative (p.29). Definition, recorded as supporting information." },
  13: { decision: 'ACCEPTED', code: 'EXPL', disposition: 'SUPPORTING_INFORMATION',
    comment: 'Policy statement narrative (PDF p.21) explaining that DPC lenders need not notify guarantors of missed payments (reflected in CONC 7.1.4R(3)). Explanatory.' },
};

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
  return (await card.locator('[data-finding-outcome]').textContent()).trim();
}

/** User B's single provision-level review submission. */
async function review() {
  return runAs('B', async ({ page, identity, act }) => {
    await page.goto(`${LAB}#/ai-analysis/${RUN_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-connected-ai-finding-review] [data-finding-review-item]', { timeout: 60_000 });
    const outcomes = {};
    for (const n of Object.keys(REVIEW_PLAN).map(Number)) outcomes[n] = await fillCard(page, n, REVIEW_PLAN[n]);
    await page.locator('[data-finding-review-notes]').fill(
      'PS26/1 provision-level review (partial-document analysis: 18 of 108 pages, 40 of 47 instrument provisions). Four operative CONC rules converted to DRAFT; CONC 7.20.1R and 4.8.2R held in Exception Triage; remaining findings triaged.',
    );
    const progress = (await page.locator('[data-finding-review-progress]').textContent()).trim();
    const submit = page.locator('[data-finding-review-submit]');
    if (await submit.isDisabled()) throw new Error(`submit disabled — ${progress}; ${JSON.stringify(outcomes)}`);
    await page.screenshot({ path: join(EVIDENCE_DIR, '5-review-before-submit.png'), fullPage: true });
    const result = await act('PS26/1 provision-level review submission', async () => {
      const responsePromise = page.waitForResponse((r) => r.url().includes(`/ai-analysis-runs/${RUN_ID}/findings`) && r.request().method() === 'POST', { timeout: 90_000 });
      await submit.click();
      const response = await responsePromise;
      const body = await response.json().catch(() => ({}));
      return { httpStatus: response.status(), ok: body.ok === true, error: body.error ?? null, detail: body.detail ?? body.reason ?? null, reviewId: body.reviewId ?? null, materialised: body.materialised ?? null };
    });
    if (result.ok) {
      const panel = page.locator('[data-connected-ai-finding-review-recorded]');
      await panel.waitFor({ timeout: 60_000 }).catch(() => null);
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.setViewportSize({ width: 1600, height: Math.min(height, 12000) });
      await page.waitForTimeout(1500);
      await panel.screenshot({ path: join(EVIDENCE_DIR, '5-review-recorded-decisions.png') }).catch(() => null);
    }
    return { step: 'review', actor: identity.userId, role: identity.role, progress, outcomes, result };
  });
}

/** The SPA re-renders asynchronously on hash change, so wait for controls bound to this obligation id. */
async function openObligation(page, id) {
  await page.goto(`${LAB}#/obligation/${id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(`[data-connected-obligation-panel="${id}"], [data-connected-obligation-review="${id}"]`, { timeout: 60_000 });
  await page.waitForLoadState('networkidle').catch(() => null);
}

/** User A moves each DRAFT obligation from this run to IN_REVIEW via the Status field. */
async function submitObligations(ids) {
  return runAs('A', async ({ page, identity, act }) => {
    const results = [];
    for (const id of ids) {
      await openObligation(page, id);
      const panel = page.locator(`[data-connected-obligation-panel="${id}"]`);
      const status = panel.locator('[data-connected-obligation-field="status"]');
      if ((await status.inputValue()) !== 'DRAFT') {
        results.push({ id, skipped: `status is ${await status.inputValue()}` });
        continue;
      }
      await status.fill('IN_REVIEW');
      const toast = await act(`PS26/1 submit obligation ${id} for review`, () => toastAfter(page, () => panel.locator('[data-connected-obligation-save]').click()));
      await page.waitForTimeout(1500);
      results.push({ id, toast });
    }
    await shot(page, '6-obligation-submitted');
    return { step: 'submit-obligations', actor: identity.userId, results };
  });
}

/** Read-only evidence: the recorded per-finding decisions and an approved register entry. */
async function evidence(obligationId) {
  return runAs('B', async ({ page }) => {
    await page.goto(`${LAB}#/ai-analysis/${RUN_ID}`, { waitUntil: 'domcontentloaded' });
    const panel = page.locator('[data-connected-ai-finding-review-recorded]');
    await panel.waitFor({ timeout: 60_000 });
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: 1600, height: Math.min(height, 12000) });
    await page.waitForTimeout(1500);
    await panel.waitFor();
    await panel.screenshot({ path: join(EVIDENCE_DIR, '5-review-recorded-decisions.png') });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openObligation(page, obligationId);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await openObligation(page, obligationId);
    await page.waitForTimeout(3000);
    await shot(page, '8-obligation-open-in-register');
    return { step: 'evidence', files: ['5-review-recorded-decisions.png', '8-obligation-open-in-register.png'] };
  });
}

/** Negative control: User B accepted the AI output, so the server must refuse B's approval. */
async function refuseApprove(id) {
  return runAs('B', async ({ page, identity, act }) => {
    await openObligation(page, id);
    const button = page.locator(`[data-connected-obligation-decision="OPEN"][data-obligation-id="${id}"]`);
    if (!(await button.count())) return { step: 'refuse-approve', actor: identity.userId, result: 'approve control not offered to User B' };
    const result = await act(`PS26/1 negative control: User B attempts to approve ${id}`, async () => {
      const responsePromise = page.waitForResponse((r) => r.url().includes(id) && r.request().method() !== 'GET', { timeout: 30_000 });
      await button.click();
      const response = await responsePromise;
      const body = await response.json().catch(() => ({}));
      return { httpStatus: response.status(), error: body.error ?? null, detail: body.detail ?? body.reason ?? null };
    });
    await page.waitForTimeout(800);
    await shot(page, '6b-refuse-approve-user-b');
    return { step: 'refuse-approve', actor: identity.userId, role: identity.role, result };
  });
}

/** User C independently approves each IN_REVIEW obligation into the register. */
async function approveObligations(ids) {
  return runAs('C', async ({ page, identity, act }) => {
    const results = [];
    for (const [i, id] of ids.entries()) {
      await openObligation(page, id);
      const button = page.locator(`[data-connected-obligation-decision="OPEN"][data-obligation-id="${id}"]`);
      await button.waitFor({ timeout: 30_000 });
      const toast = await act(`PS26/1 approve obligation ${id}`, () => toastAfter(page, () => button.click()));
      await page.waitForTimeout(1500);
      if (i === 0) await shot(page, '7-obligation-approved');
      results.push({ id, toast });
    }
    return { step: 'approve-obligations', actor: identity.userId, results };
  });
}

/** Read-only: what User B's review form offers for each PS26/1 finding. */
async function inspectFindings(runId) {
  if (!/^[0-9a-f-]{36}$/i.test(runId || '')) throw new Error('usage: inspect-findings <runId>');
  return runAs('B', async ({ page, act }) => {
    await page.goto(`${LAB}#/dashboard`, { waitUntil: 'domcontentloaded' });
    return act('read PS26/1 finding review form data', () =>
      page.evaluate(async (id) => {
        const res = await fetch(`/api/ri-lab/ai-analysis-runs/${id}/findings`, { credentials: 'same-origin', cache: 'no-store' });
        const body = await res.json();
        return {
          status: res.status,
          enabled: body.enabled,
          reviewStatus: body.reviewStatus,
          publicationType: body.publicationType,
          policy: body.classificationPolicy && `${body.classificationPolicy.regulatorKey} v${body.classificationPolicy.policyVersion}`,
          pathway: body.evidence?.pathway,
          decisions: body.decisions?.length ?? 0,
          findings: (body.findings || []).map((f) => ({
            n: f.number,
            statement: f.statement,
            pages: f.pages,
            model: f.suggestion?.modelBindingNature ?? null,
            citation: f.suggestion?.citation ?? null,
            quotation: f.suggestion?.sourceQuotation ?? null,
            queue: f.triage?.queue,
            reasons: f.triage?.exceptionReasons,
            instrument: (f.sections || []).filter((s) => s.inLegalInstrument).map((s) => ({ page: s.pageNumber, provisions: s.provisionsSetOut, status: s.provisionTextStatus })),
          })),
        };
      }, runId),
    );
  });
}

const [command, arg] = process.argv.slice(2);
const commands = {
  'create-change': createChange,
  'submit-applicability': submitApplicability,
  'approve-applicability': approveApplicability,
  extract: () => extract(arg),
  'inspect-findings': () => inspectFindings(arg),
  review,
  'submit-obligations': () => submitObligations(process.argv.slice(3)),
  'refuse-approve': () => refuseApprove(arg),
  evidence: () => evidence(arg),
  'approve-obligations': () => approveObligations(process.argv.slice(3)),
};
try {
  if (!commands[command]) {
    console.log(`usage: ps26-1-uat.mjs ${Object.keys(commands).join(' | ')}`);
    process.exitCode = 2;
  } else {
    console.log(JSON.stringify(await commands[command](), null, 2));
  }
} catch (err) {
  console.error(`FAIL: ${err.message}`);
  process.exitCode = 1;
}
