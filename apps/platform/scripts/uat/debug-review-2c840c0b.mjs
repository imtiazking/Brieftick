#!/usr/bin/env node
import { runAs, STAGING_ORIGIN } from './staging-user-sessions.mjs';

const LAB = `${STAGING_ORIGIN}/design-lab/regulatory-intelligence/index.html`;
const RUN_ID = '2c840c0b-0534-4429-a02d-6db8850a3f91';
const P = 'UAT-E2E-DEBUG';
const CONC_BASIS = (ref) =>
  `FCA Handbook ${ref}, inserted by the Consumer Credit (Deferred Payment Credit) Instrument 2026 (FCA 2026/2), PS26/1 Annex F`;
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

const REVIEW_PLAN = {
  1: { decision: 'ACCEPTED', code: 'EXPL', disposition: 'HORIZON_SCANNING', comment: `${P}: TPR narrative.` },
  2: { decision: 'ACCEPTED', code: 'EXPL', disposition: 'HORIZON_SCANNING', comment: `${P}: authorisation window narrative.` },
  3: convert('CONC 4.2A.3R', 87, "(1) Before making an agreement, the firm must: (a) give to the customer the information set out in CONC 4.2A.5R(1) (referred to in this section as the 'key product information'); and (b) give, or make available, to the customer the information set out in CONC 4.2A.5R(2) (referred to in this section as the 'additional product information').", `${P}: p.87.`),
  4: convert('CONC 4.2A.6R', 90, '(1) Immediately after an agreement has been made, the firm must give, or make available, to the customer in a durable medium: (a) a copy of the agreement; and (b) the key product information and the additional product information described in CONC 4.2A.5R.', `${P}: p.90.`),
  5: convert('CONC 4.2A.7R', 90, '(2) The firm must, before making the agreement, provide the guarantor with the information in (3) in order to place the guarantor in a position to make an informed decision as to whether to act as the guarantor in relation to the agreement.', `${P}: p.90.`),
  6: { decision: 'ACCEPTED', code: 'UNKNOWN', disposition: 'RECLASSIFICATION_REQUESTED', comment: `${P}: CONC 4.8.2R markup.` },
  7: { decision: 'ACCEPTED', code: 'UNKNOWN', disposition: 'RECLASSIFICATION_REQUESTED', comment: `${P}: missed payment cross-page.` },
  8: convert('CONC 7.20.3R', 95, '(1) Before a firm takes any of the actions specified in (2), it must give the borrower reasonable notice of its intention to do so.', `${P}: p.95.`),
  9: { decision: 'ACCEPTED', code: 'EXPL', disposition: 'HORIZON_SCANNING', comment: `${P}: PSD thresholds.` },
  10: { decision: 'ACCEPTED', code: 'R', provisionFunction: 'APPLICATION', provisionReference: 'SYSC TP 13.3R', disposition: 'SUPPORTING_INFORMATION', comment: `${P}: SMCR.` },
  11: { decision: 'ACCEPTED', code: 'R', provisionFunction: 'APPLICATION', provisionReference: 'GEN 2.3.1R', disposition: 'ARCHIVE', comment: `${P}: Gibraltar.` },
  12: { decision: 'ACCEPTED', code: 'R', provisionFunction: 'APPLICATION', provisionReference: 'CONC 2.7.1R', disposition: 'ARCHIVE', comment: `${P}: CONC 2.7.1R(4).` },
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
    if (d.disposition === 'CONVERT_TO_DRAFT_OBLIGATION') {
      await card.locator('details summary').click().catch(() => {});
      await card.locator('[data-finding-obligation-statement]').fill(d.quotation);
    }
  }
  await card.locator('[data-finding-comment]').fill(d.comment);
}

const out = await runAs('B', async ({ page }) => {
  page.setDefaultTimeout(60_000);
  await page.goto(`${LAB}#/ai-analysis/${RUN_ID}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-finding-review-item]', { timeout: 60_000 });
  for (const n of Object.keys(REVIEW_PLAN).map(Number)) await fillCard(page, n, REVIEW_PLAN[n]);
  const responsePromise = page.waitForResponse((r) => r.url().includes('/findings') && r.request().method() === 'POST', { timeout: 120_000 });
  await page.click('[data-finding-review-submit]');
  const response = await responsePromise;
  const body = await response.json();
  return { status: response.status(), body };
});

console.log(JSON.stringify(out, null, 2));