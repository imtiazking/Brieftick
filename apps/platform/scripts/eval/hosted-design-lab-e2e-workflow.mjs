#!/usr/bin/env node
/**
 * Full authorised staging compliance workflow — Design Lab only, isolated UAT run 2c840c0b (PS26/1).
 * No paid AI. Does not touch PS22/9 assessments.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runAs, STAGING_ORIGIN } from '../uat/staging-user-sessions.mjs';

const REPO = resolve(process.cwd(), '..', '..');
const OUT = join(REPO, 'docs', 'uat', 'evidence', 'e2e-compliance-workflow-2026-11-24');
const REPORT_JSON = join(REPO, 'docs', 'uat', 'HOSTED-DESIGN-LAB-E2E-WORKFLOW-2026-11-24.json');
const REPORT_MD = join(REPO, 'docs', 'uat', 'HOSTED-DESIGN-LAB-E2E-WORKFLOW-2026-11-24.md');

mkdirSync(OUT, { recursive: true });

const LAB = `${STAGING_ORIGIN}/design-lab/regulatory-intelligence/index.html`;
const PREFIX = `UAT-E2E-${Date.now().toString(36).toUpperCase()}`;
const PUBLICATION_ID = '829c5472-953a-40ff-9628-947afbfe4e7a';
const RUN_ID = '2c840c0b-0534-4429-a02d-6db8850a3f91';
const CHANGE_ID = '6abee135-3ada-4a3e-ac35-c627e895dd36';

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

/** Finding numbers match run `2c840c0b` (12 findings) — not the older `c8cb095e` layout. */
function buildReviewPlan(prefix) {
  return {
    1: { decision: 'ACCEPTED', code: 'EXPL', disposition: 'HORIZON_SCANNING', comment: `${prefix}: TPR registration narrative p.40 — not instrument text.` },
    2: { decision: 'ACCEPTED', code: 'EXPL', disposition: 'HORIZON_SCANNING', comment: `${prefix}: Temporary permission / authorisation window narrative p.40.` },
    3: convert(
      'CONC 4.2A.3R',
      87,
      "(1) Before making an agreement, the firm must: (a) give to the customer the information set out in CONC 4.2A.5R(1) (referred to in this section as the 'key product information'); and (b) give, or make available, to the customer the information set out in CONC 4.2A.5R(2) (referred to in this section as the 'additional product information').",
      `${prefix}: Verified PS26/1 Annex F p.87 — CONC 4.2A.3R(1).`,
    ),
    4: convert(
      'CONC 4.2A.6R',
      90,
      '(1) Immediately after an agreement has been made, the firm must give, or make available, to the customer in a durable medium: (a) a copy of the agreement; and (b) the key product information and the additional product information described in CONC 4.2A.5R.',
      `${prefix}: Verified PS26/1 Annex F p.90 — CONC 4.2A.6R(1).`,
    ),
    5: convert(
      'CONC 4.2A.7R',
      90,
      '(2) The firm must, before making the agreement, provide the guarantor with the information in (3) in order to place the guarantor in a position to make an informed decision as to whether to act as the guarantor in relation to the agreement.',
      `${prefix}: Verified PS26/1 Annex F p.90 — CONC 4.2A.7R(2).`,
    ),
    6: { decision: 'ACCEPTED', code: 'UNKNOWN', disposition: 'RECLASSIFICATION_REQUESTED', comment: `${prefix}: CONC 4.8.2R amended markup on p.93 not verifiable from extraction.` },
    7: { decision: 'ACCEPTED', code: 'UNKNOWN', disposition: 'RECLASSIFICATION_REQUESTED', comment: `${prefix}: Missed-payment duties span pp.94–96; 7.20.1R(2) not grounded on cited pages (Exception Triage).` },
    8: convert(
      'CONC 7.20.3R',
      95,
      '(1) Before a firm takes any of the actions specified in (2), it must give the borrower reasonable notice of its intention to do so.',
      `${prefix}: Verified PS26/1 Annex F p.95 — CONC 7.20.3R(1); primary maker-checker test obligation.`,
    ),
    9: { decision: 'ACCEPTED', code: 'EXPL', disposition: 'HORIZON_SCANNING', comment: `${prefix}: PSD de minimis narrative p.29.` },
    10: { decision: 'ACCEPTED', code: 'R', provisionFunction: 'APPLICATION', provisionReference: 'SYSC TP 13.3R', disposition: 'SUPPORTING_INFORMATION', comment: `${prefix}: SMCR categorisation application provision.` },
    11: { decision: 'ACCEPTED', code: 'R', provisionFunction: 'APPLICATION', provisionReference: 'GEN 2.3.1R', disposition: 'ARCHIVE', comment: `${prefix}: Gibraltar application scope.` },
    12: { decision: 'ACCEPTED', code: 'R', provisionFunction: 'APPLICATION', provisionReference: 'CONC 2.7.1R', disposition: 'ARCHIVE', comment: `${prefix}: Distance marketing disapplication (CONC 2.7.1R(4)).` },
  };
}

const stages = [];
const ids = { publicationId: PUBLICATION_ID, runId: RUN_ID, changeId: CHANGE_ID, obligationIds: [], reviewId: null, impactId: null, riskId: null, controlId: null, actionId: null, evidenceId: null };

function stage(row) {
  stages.push({ ...row, at: new Date().toISOString() });
  console.log(`[${row.result}] ${row.stage}: ${row.action}`);
}

async function api(page, path, init) {
  return page.evaluate(
    async ({ path, init }) => {
      const res = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...init });
      const body = await res.json().catch(() => ({}));
      return { status: res.status, body };
    },
    { path, init },
  );
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
    if (d.disposition === 'CONVERT_TO_DRAFT_OBLIGATION') {
      await card.locator('details summary').click().catch(() => {});
      await card.locator('[data-finding-obligation-statement]').fill(d.quotation);
    }
  }
  await card.locator('[data-finding-comment]').fill(d.comment);
}

async function openObligation(page, id) {
  await page.goto(`${LAB}#/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.goto(`${LAB}#/obligation/${id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(`[data-connected-obligation-panel="${id}"], [data-connected-obligation-review="${id}"]`, { timeout: 120_000 });
}

async function toastAfter(page, click) {
  await click();
  const el = await page.waitForSelector('#ri-toast:not([hidden])', { timeout: 30_000 }).catch(() => null);
  return el ? (await el.textContent()).trim() : null;
}

// --- 1–3: publication + triage (User A) ---
await runAs('A', async ({ page, identity, act }) => {
  await act('open PS26/1 publication', async () => {
    await page.goto(`${LAB}#/publication/${PUBLICATION_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
  });
  await page.screenshot({ path: join(OUT, '01-publication.png'), fullPage: true });
  const pub = await api(page, `/api/ri-lab/publications/${PUBLICATION_ID}`);
  stage({
    stage: 1,
    action: 'Open existing FCA publication PS26/1 in Design Lab',
    result:
      pub.status === 200 &&
      (pub.body?.publication?.id === PUBLICATION_ID ||
        pub.body?.labPublication?.id === PUBLICATION_ID ||
        pub.body?.detail?.id === PUBLICATION_ID)
        ? 'PASS'
        : 'FAIL',
    user: identity.userId,
    recordId: PUBLICATION_ID,
    verification: `GET /api/ri-lab/publications/${PUBLICATION_ID} → ${pub.status}`,
    audit: 'n/a',
  });

  await act('open obligation triage', async () => {
    await page.goto(`${LAB}#/triage/obligations`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const s = document.querySelector('[data-triage-status]');
      return s && !s.textContent.includes('Loading');
    }, { timeout: 90_000 });
  });
  await page.screenshot({ path: join(OUT, '02-obligation-triage.png'), fullPage: true });
  const tri = await api(page, '/api/ri-lab/triage?queue=OBLIGATION_TRIAGE');
  const hasRun = (tri.body?.items || []).some((i) => i.runId === RUN_ID);
  stage({
    stage: 2,
    action: 'Locate verified UAT finding in Obligation Triage queue',
    result: hasRun ? 'PASS' : 'FAIL',
    user: identity.userId,
    recordId: RUN_ID,
    verification: `triage items include run ${RUN_ID}`,
    audit: 'n/a',
  });

  await act('open finding review from triage', async () => {
    await page.goto(`${LAB}#/ai-analysis/${RUN_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-connected-ai-finding-review] [data-finding-review-item]', { timeout: 90_000 });
  });
  await page.screenshot({ path: join(OUT, '03-finding-review-form.png'), fullPage: true });
  stage({
    stage: 3,
    action: 'Open per-finding review for UC-RI-005 run (from triage)',
    result: 'PASS',
    user: identity.userId,
    recordId: RUN_ID,
    verification: `#/ai-analysis/${RUN_ID} review panel rendered`,
    audit: 'n/a',
  });
});

// --- Negative: submit disabled with undecided findings ---
await runAs('B', async ({ page, identity, act }) => {
  await act('negative: mandatory decisions', async () => {
    await page.goto(`${LAB}#/ai-analysis/${RUN_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-finding-review-submit]', { timeout: 60_000 });
    const disabled = await page.$eval('[data-finding-review-submit]', (b) => b.disabled);
    stage({
      stage: '3N',
      action: 'Review cannot bypass undecided findings (submit disabled)',
      result: disabled ? 'PASS' : 'FAIL',
      user: identity.userId,
      recordId: RUN_ID,
      verification: 'data-finding-review-submit disabled before decisions',
      audit: 'n/a',
    });
  });
});

// --- 4–6: finding review → DRAFT (User B) ---
const runStatus = await runAs('A', async ({ page }) =>
  api(page, `/api/ri-lab/ai-analysis-runs/${RUN_ID}`).then((r) => r.body?.aiAnalysisRun?.reviewStatus || r.body?.detail?.review_status),
);
const alreadyReviewed = String(runStatus || '').toLowerCase().includes('accepted') || String(runStatus || '').toLowerCase().includes('rejected');

if (!alreadyReviewed) await runAs('B', async ({ page, identity, act }) => {
  await act('open review from obligation triage route', async () => {
    await page.goto(`${LAB}#/triage/obligations`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction((runId) => document.querySelector(`[data-triage-open-review="${runId}"]`), RUN_ID, { timeout: 60_000 });
    await page.screenshot({ path: join(OUT, '03b-triage-open-review.png'), fullPage: true });
    await page.goto(`${LAB}#/ai-analysis/${RUN_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-connected-ai-finding-review] [data-finding-review-item]', { timeout: 90_000 });
  });
  const reviewPlan = buildReviewPlan(PREFIX);
  for (const n of Object.keys(reviewPlan).map(Number)) await fillCard(page, n, reviewPlan[n]);
  await page.locator('[data-finding-review-notes]').fill(
    `${PREFIX}: Isolated staging E2E — four CONC operative conversions for maker-checker; remaining findings triaged or rejected.`,
  );
  const submitDisabled = await page.$eval('[data-finding-review-submit]', (b) => b.disabled);
  stage({
    stage: '4a',
    action: 'Complete mandatory finding-review fields for all 12 findings',
    result: !submitDisabled ? 'PASS' : 'FAIL',
    user: identity.userId,
    recordId: RUN_ID,
    verification: 'submit enabled after all decisions',
    audit: 'n/a',
  });

  const posted = await act('submit per-finding review', async () => {
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes(`/ai-analysis-runs/${RUN_ID}/findings`) && r.request().method() === 'POST',
      { timeout: 120_000 },
    );
    await page.click('[data-finding-review-submit]');
    const response = await responsePromise;
    const body = await response.json().catch(() => ({}));
    return { status: response.status(), body };
  });
  await page.screenshot({ path: join(OUT, '04-review-submitted.png'), fullPage: true });
  ids.reviewId = posted.body?.reviewId ?? null;
  ids.obligationIds = (posted.body?.materialised || []).map((m) => m.obligationId).filter(Boolean);
  const runAfter = await api(page, `/api/ri-lab/ai-analysis-runs/${RUN_ID}`);
  stage({
    stage: 4,
    action: 'Submit human-review test decision (User B)',
    result: posted.status === 200 && posted.body?.ok === true ? 'PASS' : 'FAIL',
    user: identity.userId,
    recordId: ids.reviewId,
    verification: `POST findings → ${posted.status}; reviewId=${ids.reviewId}; materialised=${ids.obligationIds.length}`,
    audit: ids.reviewId ? `ai_analysis_review ${ids.reviewId}` : 'pending',
  });
  for (const oid of ids.obligationIds) {
    const ob = await api(page, `/api/ri-lab/obligations/${oid}`);
    stage({
      stage: 5,
      action: 'Verify DRAFT obligation persisted',
      result: ob.status === 200 && ob.body?.obligation?.status === 'DRAFT' ? 'PASS' : 'FAIL',
      user: identity.userId,
      recordId: oid,
      verification: `GET obligation status=${ob.body?.obligation?.status}`,
      audit: 'OBLIGATION_CREATED',
    });
  }
});

// --- 7–8: maker-checker ---
if (alreadyReviewed && !ids.obligationIds.length) {
  ids.obligationIds = [
    '5ae3ddf0-3aee-4f4e-8b93-75408ea4cb1b',
    '0ac6b8dd-adde-4ad3-999b-276b0f8b10d7',
    '15c320c7-abcb-4008-999d-add1f41dc834',
    '57bcc479-fe9f-42ec-873e-3cdb1552a2cc',
  ];
  ids.reviewId = ids.reviewId || 'b0e08a19-1905-49b9-a626-a0198529dd5d';
}
const primaryObligation = ids.obligationIds.find((id) => id === '57bcc479-fe9f-42ec-873e-3cdb1552a2cc') || ids.obligationIds[0];
if (primaryObligation) {
  await runAs('A', async ({ page, identity, act }) => {
    await openObligation(page, primaryObligation);
    const panel = page.locator(`[data-connected-obligation-panel="${primaryObligation}"]`);
    await panel.locator('[data-connected-obligation-field="status"]').fill('IN_REVIEW');
    const toast = await act('submit obligation IN_REVIEW', () => toastAfter(page, () => panel.locator('[data-connected-obligation-save]').click()));
    await page.screenshot({ path: join(OUT, '05-obligation-in-review.png'), fullPage: true });
    const ob = await api(page, `/api/ri-lab/obligations/${primaryObligation}`);
    stage({
      stage: 6,
      action: 'Submit DRAFT through maker-checker (maker → IN_REVIEW)',
      result: ob.body?.obligation?.status === 'IN_REVIEW' ? 'PASS' : 'FAIL',
      user: identity.userId,
      recordId: primaryObligation,
      verification: `status IN_REVIEW; toast=${toast ?? ''}`,
      audit: 'OBLIGATION_STATUS_CHANGED',
    });
  });

  await runAs('B', async ({ page, identity, act }) => {
    await openObligation(page, primaryObligation);
    const button = page.locator(`[data-connected-obligation-decision="OPEN"][data-obligation-id="${primaryObligation}"]`);
    if (await button.count()) {
      const res = await act('SoD negative: acceptor attempts approve', async () => {
        const responsePromise = page.waitForResponse((r) => r.url().includes(primaryObligation) && r.request().method() !== 'GET', { timeout: 30_000 });
        await button.click();
        const response = await responsePromise;
        const body = await response.json().catch(() => ({}));
        return { status: response.status(), body };
      });
      stage({
        stage: 8,
        action: 'Segregation of duties — reviewer cannot approve own extraction path',
        result: res.status === 403 || res.body?.error === 'segregation_of_duties' ? 'PASS' : 'FAIL',
        user: identity.userId,
        recordId: primaryObligation,
        verification: `HTTP ${res.status} ${res.body?.error ?? ''}`,
        audit: 'no status change',
      });
    }
  });

  await runAs('C', async ({ page, identity, act }) => {
    await openObligation(page, primaryObligation);
    const button = page.locator(`[data-connected-obligation-decision="OPEN"][data-obligation-id="${primaryObligation}"]`);
    await button.waitFor({ timeout: 30_000 });
    await act('checker approves OPEN', () => toastAfter(page, () => button.click()));
    await page.screenshot({ path: join(OUT, '06-obligation-approved.png'), fullPage: true });
    const ob = await api(page, `/api/ri-lab/obligations/${primaryObligation}`);
    const events = await api(
      page,
      `/api/ri-lab/workflow-events?entityType=regulatory_obligation&entityId=${encodeURIComponent(primaryObligation)}`,
    );
    stage({
      stage: 7,
      action: 'Independent checker approves UAT obligation (OPEN)',
      result: ob.body?.obligation?.status === 'OPEN' ? 'PASS' : 'FAIL',
      user: identity.userId,
      recordId: primaryObligation,
      verification: `status OPEN; workflow events=${events.body?.events?.length ?? 0}`,
      audit: (events.body?.events || []).slice(-1)[0]?.eventType ?? 'OBLIGATION_STATUS_CHANGED',
    });
  });
}

// --- 9–15: GRC + reporting (User A) ---
await runAs('A', async ({ page, identity, act }) => {
  await act('open regulatory change', async () => {
    await page.goto(`${LAB}#/change/${CHANGE_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-connected-create-impact]', { timeout: 90_000 });
  });
  const impactsBefore = await api(page, '/api/ri-lab/impact-assessments?scope=all');
  const existing = (impactsBefore.body?.impactAssessments || []).find((i) => i.regulatoryChangeId === CHANGE_ID);
  if (existing) {
    ids.impactId = existing.id;
    stage({ stage: 9, action: 'Use existing impact assessment on UAT change', result: 'PASS', user: identity.userId, recordId: ids.impactId, verification: 'linked change', audit: 'existing' });
  } else {
    const [ir] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/ri-lab/impact-assessments') && r.request().method() === 'POST', { timeout: 60_000 }),
      page.locator('[data-connected-create-impact]').click(),
    ]).catch(() => [null]);
    const body = ir ? await ir.json().catch(() => ({})) : {};
    ids.impactId = body.impactAssessment?.id || body.id;
    stage({ stage: 9, action: 'Create impact assessment', result: ids.impactId ? 'PASS' : 'FAIL', user: identity.userId, recordId: ids.impactId, verification: `POST impact`, audit: 'IMPACT_CREATED' });
  }

  await page.goto(`${LAB}#/risks`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-connected-risk-create-title]', { timeout: 60_000 });
  await page.fill('[data-connected-risk-create-title]', `${PREFIX} operational risk`);
  const [rr] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/ri-lab/risks') && r.request().method() === 'POST', { timeout: 60_000 }),
    page.click('[data-connected-create-risk-btn]'),
  ]);
  const rrBody = await rr.json().catch(() => ({}));
  ids.riskId = rrBody.risk?.id || rrBody.id;
  stage({ stage: 10, action: 'Create associated risk', result: ids.riskId ? 'PASS' : 'FAIL', user: identity.userId, recordId: ids.riskId, verification: `POST risks ${rr.status()}`, audit: 'RISK_CREATED' });

  await page.goto(`${LAB}#/controls`, { waitUntil: 'domcontentloaded' });
  await page.fill('[data-connected-control-create-name]', `${PREFIX} control`);
  const [cr] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/ri-lab/controls') && r.request().method() === 'POST', { timeout: 60_000 }),
    page.click('[data-connected-create-control-btn]'),
  ]);
  const crBody = await cr.json().catch(() => ({}));
  ids.controlId = crBody.control?.id || crBody.id;
  stage({ stage: 11, action: 'Create associated control', result: ids.controlId ? 'PASS' : 'FAIL', user: identity.userId, recordId: ids.controlId, verification: `POST controls`, audit: 'CONTROL_CREATED' });

  await page.goto(`${LAB}#/actions`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-connected-action-create-title]', { timeout: 60_000 });
  await page.fill('[data-connected-action-create-title]', `${PREFIX} remediation`);
  if (ids.riskId) await page.fill('[data-connected-action-create-risk]', ids.riskId);
  if (ids.controlId) await page.fill('[data-connected-action-create-control]', ids.controlId);
  if (primaryObligation) await page.fill('[data-connected-action-create-obligation]', primaryObligation);
  const [ar] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/ri-lab/actions') && r.request().method() === 'POST', { timeout: 60_000 }),
    page.click('[data-connected-create-action-btn]'),
  ]).catch(() => [null]);
  const arBody = ar ? await ar.json().catch(() => ({})) : {};
  ids.actionId = arBody.action?.id || arBody.id;
  stage({ stage: 12, action: 'Create remediation action', result: ids.actionId ? 'PASS' : 'FAIL', user: identity.userId, recordId: ids.actionId, verification: ar ? `POST actions ${ar.status()}` : 'click failed', audit: 'ACTION_CREATED' });

  await page.goto(`${LAB}#/evidence`, { waitUntil: 'domcontentloaded' });
  await page.fill('[data-connected-evidence-title]', `${PREFIX} evidence`);
  await page.fill('[data-connected-evidence-type]', 'test_result');
  const [ev] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/ri-lab/evidence') && r.request().method() === 'POST' && !r.url().includes('/upload'), { timeout: 60_000 }),
    page.locator('[data-connected-create-evidence]').click(),
  ]);
  const evBody = await ev.json().catch(() => ({}));
  ids.evidenceId = evBody.evidence?.id || evBody.item?.id || evBody.id;
  await page.waitForURL(/#\/evidence\//, { timeout: 30_000 }).catch(() => null);
  if (ids.evidenceId) {
    await page.goto(`${LAB}#/evidence/${ids.evidenceId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(`[data-connected-evidence-upload-panel="${ids.evidenceId}"] input[type="file"]`, { timeout: 120_000 }).catch(() => null);
    await page.locator('[data-connected-evidence-file]').setInputFiles({
      name: `${PREFIX}.txt`,
      mimeType: 'text/plain',
      buffer: Buffer.from(`${PREFIX} permitted test evidence`),
    });
    const up = page.waitForResponse((r) => r.url().includes('/upload') && r.request().method() === 'POST');
    await page.locator('[data-connected-evidence-upload]').click();
    const upRes = await up;
    stage({ stage: 13, action: 'Attach permitted test evidence file', result: upRes.status() === 200 || upRes.status() === 201 ? 'PASS' : 'FAIL', user: identity.userId, recordId: ids.evidenceId, verification: `upload ${upRes.status()}`, audit: 'EVIDENCE_VERSION' });
  }

  const notes = await api(page, '/api/ri-lab/notifications');
  stage({ stage: 14, action: 'Verify notifications persisted', result: notes.status === 200 ? 'PASS' : 'FAIL', user: identity.userId, recordId: 'notifications', verification: `count=${notes.body?.notifications?.length ?? 'n/a'}`, audit: 'n/a' });

  await page.goto(`${LAB}#/audit`, { waitUntil: 'domcontentloaded' });
  await page.screenshot({ path: join(OUT, '07-audit-trail.png'), fullPage: true });

  await page.goto(`${LAB}#/reports/board`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-connected-reporting-refresh]').click().catch(() => null);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(OUT, '08-board-report.png'), fullPage: true });
  const board = await api(page, '/api/ri-lab/reports/board?period=last30');
  const sections = board.body?.report?.sections?.length ?? board.body?.sections?.length ?? 0;
  stage({
    stage: 15,
    action: 'Generate compliance board report',
    result: board.status === 200 ? 'PASS' : 'FAIL',
    user: identity.userId,
    recordId: 'board-report',
    verification: `GET board ${board.status}; sections=${sections}`,
    audit: 'n/a',
  });
  await page.screenshot({ path: join(OUT, '09-workflow-complete-dashboard.png'), fullPage: true });
});

const pass = stages.filter((s) => s.result === 'PASS').length;
const fail = stages.filter((s) => s.result === 'FAIL').length;
const blocked = stages.filter((s) => s.result === 'BLOCKED').length;
const overall = fail === 0 && ids.obligationIds.length > 0;

const report = {
  generatedAt: new Date().toISOString(),
  prefix: PREFIX,
  deployment: 'dpl_EQmJ39kpih36JA43ZeNH2mfsp9tZ',
  lab: LAB,
  ids,
  stages,
  summary: { pass, fail, blocked, overall: overall ? 'PASS' : 'FAIL' },
  secDb003: 'BLOCKED — STAGING_DATABASE_URL not in .env.local (restricted-role connection unavailable)',
  crossTenant: 'BLOCKED — Users A/B/C share org b8f5e3a1; no second staging organisation provisioned',
  screenshots: OUT,
};

writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));

const md = `# Hosted Design Lab E2E compliance workflow

Date: 2026-11-24. Prefix: **${PREFIX}**. Run: **${RUN_ID}** (PS26/1 authorised UAT, not PS22/9).

Overall: **${report.summary.overall}** (${pass} PASS, ${fail} FAIL, ${blocked} BLOCKED)

| Stage | Action | Result | Record ID | User | Verification | Audit |
|-------|--------|--------|-----------|------|--------------|-------|
${stages.map((s) => `| ${s.stage} | ${s.action} | ${s.result} | ${s.recordId ?? '—'} | ${s.user?.slice(0, 12)}… | ${s.verification} | ${s.audit} |`).join('\n')}

SEC-DB-003: ${report.secDb003}

Cross-tenant: ${report.crossTenant}

Evidence: \`${OUT}\`, JSON: \`${REPORT_JSON}\`
`;
writeFileSync(REPORT_MD, md);

console.log(JSON.stringify(report.summary, null, 2));
process.exit(overall ? 0 : 2);