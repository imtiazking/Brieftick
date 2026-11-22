#!/usr/bin/env node
/**
 * FG24/6 authenticated UAT, Stage 3 — User B's per-finding review through the Design Lab UI.
 *
 *   node scripts/uat/fg24-6-stage3.mjs inspect          read-only: what the review form offers for each finding
 *   node scripts/uat/fg24-6-stage3.mjs refuse-convert   refusal test 1: Finding 2 coded R and converted (must be refused)
 *   node scripts/uat/fg24-6-stage3.mjs refuse-link      refusal test 2: Finding 2 linked to a non-existent obligation (must be refused)
 *   node scripts/uat/fg24-6-stage3.mjs submit           final review: Finding 2 linked to the registered reg. 86(2D) obligation
 *   node scripts/uat/fg24-6-stage3.mjs evidence         read-only: screenshot of the recorded decisions and queues
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runAs, STAGING_ORIGIN } from './staging-user-sessions.mjs';

const RUN_ID = 'cb124305-4a9e-4968-b1a2-1b36d819c2c7';
const REG_86_2D_OBLIGATION_ID = '36da0a55-a9b2-42f1-b1eb-5d4a5d13ec2b';
const NON_EXISTENT_OBLIGATION_ID = '00000000-0000-4000-8000-000000000000';
const EVIDENCE_DIR = resolve(process.cwd(), '..', '..', 'docs', 'eval', 'fg24-6-uat');
const RUN_URL = `${STAGING_ORIGIN}/design-lab/regulatory-intelligence/index.html#/ai-analysis/${RUN_ID}`;

/** Reviewer decisions checked against the FG24/6 PDF (pages as cited by each finding). */
const PLAN = {
  1: { decision: 'ACCEPTED', code: 'PERM', disposition: 'SUPPORTING_INFORMATION',
    comment: 'Accurate (pp.12, 14): a permission to delay up to four business days on reasonable grounds under reg. 86(2B). Not a duty, so no obligation.' },
  2: { decision: 'ACCEPTED', code: 'GBR', disposition: 'LINK_TO_EXISTING_OBLIGATION', linkedObligationId: REG_86_2D_OBLIGATION_ID,
    comment: 'FCA guidance (p.14) on the payer-notification duty in PSRs 2017 reg. 86(2D). Linked to the registered binding obligation verified against legislation.gov.uk; guidance does not create an obligation.' },
  3: { decision: 'ACCEPTED', code: 'GBR', disposition: 'SUPPORTING_INFORMATION',
    comment: 'FCA view (p.14) of how long a delay may last: it must end once execution is established. Guidance on a binding requirement; supporting information only.' },
  4: { decision: 'ACCEPTED', code: 'GBR', disposition: 'SUPPORTING_INFORMATION',
    comment: 'FCA explanation (p.16) of PSP liability for charges and interest caused by a reg. 86(2B) delay. Guidance text; the statutory provision itself must be registered manually from legislation.gov.uk.' },
  5: { decision: 'ACCEPTED', code: 'DEF', disposition: 'ARCHIVE',
    comment: 'Interpretive threshold for "reasonable grounds to suspect" (p.13). A definition, not an obligation.' },
  6: { decision: 'ACCEPTED', code: 'GBR', disposition: 'RECLASSIFICATION_REQUESTED',
    reclassificationEvidence: 'Source p.14 reads "We also expect PSPs to treat..." — an FCA expectation, not a rule.',
    comment: 'Reclassification requested: the source (p.14) says "We also expect PSPs to treat..." — an FCA expectation. The finding overstates it as "must".' },
  7: { decision: 'ACCEPTED', code: 'GP', disposition: 'SUPPORTING_INFORMATION',
    comment: 'Accurate (p.13): "PSPs should record..." — a record-keeping expectation supporting Consumer Duty monitoring. Good practice, not an obligation.' },
  8: { decision: 'REJECTED',
    comment: 'Rejected as overstated: the source (pp.15, 17) says "it is likely that the PSP will need" a real-time human interface. The Consumer Duty does not require this specific means.' },
  9: { decision: 'ACCEPTED', code: 'UNKNOWN', disposition: 'RECLASSIFICATION_REQUESTED',
    reclassificationEvidence: 'Source pp.10, 16 concern making funds available in breach of POCA Part 7 / TA 2000 Part 3, not delaying.',
    comment: 'Held for reclassification: FCA view on force majeure (reg. 96). The finding inverts the condition — the source concerns cases where making funds available would breach POCA or TA 2000. A liability safe harbour, not an obligation.' },
  10: { decision: 'ACCEPTED', code: 'EXEMPT', disposition: 'ARCHIVE',
    comment: 'Accurate (pp.4, 12): payee-initiated card payments are outside the scope of reg. 86(2A)-(2D). Scope exclusion, not an obligation.' },
  11: { decision: 'ACCEPTED', code: 'G', disposition: 'HORIZON_SCANNING',
    comment: 'Accurate (p.14): "We consider... should remain in the payer\'s account". FCA guidance; referred to horizon scanning.' },
  12: { decision: 'ACCEPTED', code: 'PERM', disposition: 'SUPPORTING_INFORMATION',
    comment: 'Accurate (pp.5, 14): reg. 86 does not prevent a PSP from deterring the payer from paying by other means. A permission, not an obligation.' },
};

const SCENARIOS = {
  'refuse-convert': {
    label: 'refusal test 1 — convert Finding 2 under code R',
    finding2: { decision: 'ACCEPTED', code: 'R', provisionFunction: 'OPERATIVE_REQUIREMENT', provisionReference: 'PSRs 2017 reg. 86(2D)',
      disposition: 'CONVERT_TO_DRAFT_OBLIGATION', legalBasis: 'The Payment Services Regulations 2017, regulation 86(2D)', page: '14', useSuggestion: true,
      comment: 'Refusal test: attempting to convert FCA finalised guidance text into a binding R obligation. The server must refuse because the source is non-binding and outside any legal instrument.' },
    expectRefusal: true,
  },
  'refuse-link': {
    label: 'refusal test 2 — link Finding 2 to a non-existent obligation',
    finding2: { ...PLAN[2], linkedObligationId: NON_EXISTENT_OBLIGATION_ID,
      comment: 'Refusal test: linking to an obligation ID that does not exist in this organisation. The server must refuse the link.' },
    expectRefusal: true,
  },
  submit: {
    label: 'final FG24/6 per-finding review',
    finding2: PLAN[2],
    expectRefusal: false,
    notes: 'FG24/6 is finalised guidance: no finding is converted. Finding 2 is linked to the independently approved PSRs 2017 reg. 86(2D) obligation; the remaining findings are triaged or rejected.',
  },
};

async function openReview(page) {
  await page.goto(RUN_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-connected-ai-finding-review] [data-finding-review-item]', { timeout: 60_000 });
}

async function fillCard(page, number, d) {
  const card = page.locator(`[data-finding-review-item][data-finding-number="${number}"]`);
  await card.locator(`[data-finding-decision][value="${d.decision}"]`).check();
  if (d.decision === 'ACCEPTED') {
    await card.locator('[data-finding-code]').selectOption(d.code);
    if (d.provisionFunction) await card.locator('[data-finding-provision-function]').selectOption(d.provisionFunction);
    if (d.provisionReference) await card.locator('[data-finding-provision-reference]').fill(d.provisionReference);
    await card.locator('[data-finding-disposition]').selectOption(d.disposition);
    if (d.linkedObligationId) await card.locator('[data-finding-linked-obligation]').fill(d.linkedObligationId);
    if (d.reclassificationEvidence) await card.locator('[data-finding-reclassification]').fill(d.reclassificationEvidence);
    if (d.legalBasis) await card.locator('[data-finding-legal-basis]').fill(d.legalBasis);
    if (d.useSuggestion) {
      await card.locator('details summary').first().click();
      await card.locator('[data-finding-use-suggestion]').click();
      if (!(await card.locator('[data-finding-quotation]').inputValue()).trim()) throw new Error(`Finding ${number}: no model quotation to copy`);
    }
    if (d.page) await card.locator('[data-finding-page]').selectOption(d.page);
  }
  await card.locator('[data-finding-comment]').fill(d.comment);
  return (await card.locator('[data-finding-outcome]').textContent()).trim();
}

async function runScenario(name) {
  const scenario = SCENARIOS[name];
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  return runAs('B', async ({ page, identity, act }) => {
    await openReview(page);
    const outcomes = {};
    for (const n of Object.keys(PLAN).map(Number)) {
      outcomes[n] = await fillCard(page, n, n === 2 ? scenario.finding2 : PLAN[n]);
    }
    if (scenario.notes) await page.locator('[data-finding-review-notes]').fill(scenario.notes);
    const progress = (await page.locator('[data-finding-review-progress]').textContent()).trim();
    const submit = page.locator('[data-finding-review-submit]');
    if (await submit.isDisabled()) throw new Error(`submit is disabled — ${progress}; outcomes ${JSON.stringify(outcomes)}`);
    await page.screenshot({ path: join(EVIDENCE_DIR, `3-${name}-before-submit.png`), fullPage: true });

    const result = await act(`FG24/6 ${scenario.label}`, async () => {
      const responsePromise = page.waitForResponse(
        (r) => r.url().includes(`/ai-analysis-runs/${RUN_ID}/findings`) && r.request().method() === 'POST',
        { timeout: 60_000 },
      );
      await submit.click();
      const response = await responsePromise;
      const body = await response.json().catch(() => ({}));
      const toast = await page
        .waitForSelector('#ri-toast:not([hidden])', { timeout: 10_000 })
        .then((el) => el.textContent())
        .catch(() => null);
      await page.screenshot({ path: join(EVIDENCE_DIR, `3-${name}-after-submit.png`), fullPage: false });
      return { httpStatus: response.status(), ok: body.ok === true, error: body.error ?? null, detail: body.detail ?? body.reason ?? null, reviewId: body.reviewId ?? null, materialised: body.materialised?.length ?? null, toast };
    });

    if (!scenario.expectRefusal && result.ok) {
      await page.waitForSelector('[data-connected-ai-finding-review-recorded]', { timeout: 60_000 }).catch(() => null);
      await page.screenshot({ path: join(EVIDENCE_DIR, '3-submit-recorded-decisions.png'), fullPage: true });
    }
    const passed = scenario.expectRefusal ? !result.ok && result.httpStatus >= 400 : result.ok;
    return { scenario: name, label: scenario.label, actor: identity.userId, role: identity.role, progress, outcomes, result, passed };
  });
}

async function inspect() {
  return runAs('B', async ({ page, act }) =>
    act('read FG24/6 finding review form data', () =>
      page.evaluate(async (runId) => {
        const res = await fetch(`/api/ri-lab/ai-analysis-runs/${runId}/findings`, { credentials: 'same-origin', cache: 'no-store' });
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
            id: f.findingId,
            pages: f.pages,
            model: f.suggestion?.modelBindingNature ?? null,
            queue: f.triage?.queue,
            provisional: f.triage?.provisional,
            instrument: (f.sections || []).filter((s) => s.inLegalInstrument).map((s) => s.pageNumber),
          })),
        };
      }, RUN_ID),
    ),
  );
}

/** Read-only: screenshot of the recorded decisions table (triage queue, outcome and reviewer comment per finding). */
async function evidence() {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  return runAs('B', async ({ page, act }) =>
    act('capture FG24/6 recorded decisions', async () => {
      await page.goto(RUN_URL, { waitUntil: 'domcontentloaded' });
      const panel = page.locator('[data-connected-ai-finding-review-recorded]');
      await panel.waitFor({ timeout: 60_000 });
      await page.setViewportSize({ width: 1600, height: 900 });
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.setViewportSize({ width: 1600, height: Math.min(height, 12000) });
      await page.waitForTimeout(1500);
      await panel.waitFor({ timeout: 60_000 });
      await panel.screenshot({ path: join(EVIDENCE_DIR, '3-recorded-decisions-queues.png') });
      return panel.locator('[data-finding-decision-row]').evaluateAll((rows) =>
        rows.map((r) => [...r.querySelectorAll('td')].slice(0, 7).map((td) => td.textContent.replace(/\s+/g, ' ').trim().slice(0, 60))),
      );
    }),
  );
}

const [command] = process.argv.slice(2);
try {
  if (command === 'inspect') console.log(JSON.stringify(await inspect(), null, 2));
  else if (command === 'evidence') console.log(JSON.stringify(await evidence(), null, 2));
  else if (SCENARIOS[command]) {
    const outcome = await runScenario(command);
    console.log(JSON.stringify(outcome, null, 2));
    if (!outcome.passed) process.exitCode = 1;
  } else {
    console.log(`usage: fg24-6-stage3.mjs inspect | ${Object.keys(SCENARIOS).join(' | ')}`);
    process.exitCode = 2;
  }
} catch (err) {
  console.error(`FAIL: ${err.message}`);
  process.exitCode = 1;
}
