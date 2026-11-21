#!/usr/bin/env node
/**
 * Browser acceptance: UC-RI-005 per-finding review panel on a completed run.
 * Every finding needs an explicit decision and comment; obligation-class acceptances need a legal basis,
 * an exact quotation and a cited page; other classifications are recorded only; input survives
 * re-renders; the payload carries stable finding IDs; server refusals are shown and retryable.
 * Backend simulated; no live staging calls and no AI calls.
 */
import { chromium } from 'playwright';

const BASE =
  process.env.RI_EXTRACTION_BROWSER_BASE ||
  'http://127.0.0.1:3001/design-lab/regulatory-intelligence/index.html';
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(BASE)) {
  console.error(`Refusing to run against ${BASE}: this test simulates writes and must target a local server.`);
  process.exit(2);
}
const AI_DEV = 'b8f5e3a1-00ad-4000-8000-000000000001';
const PUB = 'ec168f48-1717-4631-8e4a-a3e95df4d5ce';
const RUN = 'cccc0000-0000-4000-8000-000000000003';
const IDS = ['f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000002', 'f3000000-0000-4000-8000-000000000003', 'f4000000-0000-4000-8000-000000000004'];
const QUOTE_2 =
  'A PSP that delays crediting the amount of a payment transaction under these provisions must notify the payer of the delay, the reason for the delay, and any information or action needed from the payer.';

const failures = [];
const pass = (m) => console.log(`PASS: ${m}`);
const fail = (m) => {
  failures.push(m);
  console.error(`FAIL: ${m}`);
};
const check = (cond, m, detail) => (cond ? pass(m) : fail(detail ? `${m} — ${detail}` : m));

const classifications = [
  { id: 'binding_requirement', label: 'Binding requirement', createsObligation: true },
  { id: 'guidance_on_requirement', label: 'Guidance on a binding requirement', createsObligation: true },
  { id: 'non_binding_guidance', label: 'Non-binding guidance / expectation', createsObligation: false },
  { id: 'permission', label: 'Permission', createsObligation: false },
  { id: 'scope_exclusion', label: 'Scope exclusion', createsObligation: false },
];
const finding = (i, statement, pages, suggestion = null) => ({
  findingId: IDS[i],
  number: i + 1,
  claimIndex: i,
  statement,
  claimTextSha256: `sha-${i}`,
  modelConfidence: 90,
  citationStatus: 'VERIFIED',
  sourceSectionIds: pages.map((p) => `S${p}`),
  pages,
  sections: [],
  suggestion,
});
const baseView = () => ({
  ok: true,
  runId: RUN,
  enabled: true,
  reviewStatus: 'HUMAN_REVIEW_REQUIRED',
  executionStatus: 'COMPLETED',
  classifications,
  evidence: { kind: 'pdf_primary_v1', extractionRevisionId: 'rev', obligationGradeSuitable: false, pathway: 'human_verified_uat' },
  findings: [
    finding(0, 'PSPs may delay processing payment transactions for up to 4 business days.', [1, 14]),
    finding(1, 'PSPs must notify payers of payment delays by the end of the next business day.', [14], {
      candidateIndex: 2,
      score: 0.6,
      modelBindingNature: 'binding_requirement',
      sourceQuotation: QUOTE_2,
      citation: 'PDF p.14',
    }),
    finding(2, 'PSPs may seek to deter payers from making payments by other means.', [5, 14]),
    finding(3, 'Payment delays must end as soon as the PSP establishes the payment should be executed.', [14]),
  ],
  decisions: [],
});
let findingView = { ...baseView(), enabled: false };
const reviewPosts = [];
let reviewResponses = [];

const runView = {
  id: RUN,
  useCaseId: 'UC-RI-005',
  publicationId: PUB,
  executionStatus: 'Completed',
  reviewStatus: 'Human Review Required',
  provider: 'AIPROV-ANTHROPIC-001',
  model: 'claude-sonnet-4-5',
  createdAt: '2026-11-21T09:00:00Z',
  completedAt: '2026-11-21T09:01:30Z',
  humanReviewRequired: true,
  labClassification: 'uat_authorised',
  labClassificationLabel: 'Authorised UAT / acceptance execution',
  findingsPreview: null,
  claimsCount: 4,
  tenantScope: true,
  _connected: true,
};
const labPublication = {
  id: PUB,
  title: 'FG24/6: Guidance for firms that enables a risk-based approach to payments',
  regulator: 'FCA',
  summary: 'FCA finalised guidance.',
  display: { reference: 'FG24/6', publicationType: 'Guidance', classification: 'UNASSESSED', aiPriority: '—', triage: 'TRACKED' },
};

const json = (route, status, body, headers = {}) =>
  route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) });

async function handleApi(route) {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname;
  const method = request.method();
  if (path === '/api/organisation/active') {
    if (method === 'POST') return json(route, 200, { ok: true, organisationId: AI_DEV }, { 'set-cookie': `forgeniq_active_org=${AI_DEV}; Path=/` });
    return json(route, 200, {
      ok: true,
      userId: 'user_yahoo',
      activeOrganisationId: AI_DEV,
      selectionRequired: false,
      memberships: [{ organisationId: AI_DEV, organisationName: 'AI Development', role: 'COMPLIANCE_MANAGER' }],
    });
  }
  if (!path.startsWith('/api/ri-lab/')) return route.continue();
  if (path === '/api/ri-lab/session') {
    return json(route, 200, {
      ok: true,
      userId: 'user_yahoo',
      organisationId: AI_DEV,
      organisationName: 'AI Development',
      role: 'COMPLIANCE_MANAGER',
      writesEnabled: true,
      writeCapabilities: { aiRequest: true, aiReview: true },
    });
  }
  if (path === '/api/ri-lab/readiness') return json(route, 200, { ok: true, environment: 'staging', stagingProjectMatch: true, writesEnabled: true });
  if (path === '/api/ri-lab/publications' && method === 'GET') return json(route, 200, { ok: true, publications: [labPublication] });
  if (path === `/api/ri-lab/publications/${PUB}`) {
    return json(route, 200, { ok: true, labPublication, display: labPublication.display, detail: { publication: { id: PUB }, changes: [], impacts: [], versions: [] } });
  }
  if (path === '/api/ri-lab/tenant-governance') {
    return json(route, 200, { ok: true, organisationId: AI_DEV, aiAnalysisRuns: [], authorisedUatAiAnalysisRuns: [runView], aiRunReferences: [] });
  }
  if (path === `/api/ri-lab/ai-analysis-runs/${RUN}/findings`) {
    if (method === 'GET') return json(route, 200, findingView);
    reviewPosts.push(JSON.parse(request.postData() || '{}'));
    const next = reviewResponses.shift() ?? { status: 500, body: { ok: false, error: 'internal_error' } };
    return json(route, next.status, next.body);
  }
  if (path === `/api/ri-lab/ai-analysis-runs/${RUN}`) {
    return json(route, 200, { ok: true, aiAnalysisRun: runView, detail: { id: RUN }, citations: [], reviews: [] });
  }
  return json(route, 200, { ok: true, organisationId: AI_DEV, items: [], data: [], publications: [], events: [] });
}

async function waitConnected(page, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const d = await page.evaluate(() => window.__FORGENIQ_RI_CONNECTIVITY_DIAG__?.() ?? null);
    if (d?.connectivity?.mode === 'connected' && !d.bootstrapInflight) return true;
    await page.waitForTimeout(250);
  }
  return false;
}
async function openRun(page) {
  await page.goto(`${BASE}#/publication/${PUB}/ai-analysis`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const ok = await waitConnected(page);
  await page.waitForTimeout(900);
  await page.evaluate((id) => {
    location.hash = `#/ai-analysis/${id}`;
  }, RUN);
  await page.waitForSelector('[data-connected-ai-finding-review], [data-connected-ai-finding-review-recorded]', { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(300);
  return ok;
}
const pageErrors = [];
async function newConnectedPage(browser) {
  const context = await browser.newContext();
  await context.route('**/api/**', handleApi);
  await context.route('https://clerk.forgeniq.com/**', (route) => route.abort());
  const page = await context.newPage();
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(`${BASE}#/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('forgeniq-ri-connected-mode', '1');
  });
  return page;
}
const card = (i) => `[data-finding-review-item="${IDS[i]}"]`;
const outcome = (page, i) => page.$eval(`${card(i)} [data-finding-outcome]`, (el) => el.textContent || '');
const submitDisabled = (page) => page.$eval('[data-finding-review-submit]', (b) => b.disabled);
const toast = (page) => page.evaluate(() => document.getElementById('ri-toast')?.textContent || '');

async function main() {
  const browser = await chromium.launch({ headless: true });

  // Not enabled: findings are visible read-only and nothing can be submitted.
  let page = await newConnectedPage(browser);
  check(await openRun(page), 'connected; completed UC-RI-005 run opened');
  check(!!(await page.$('[data-finding-review-disabled]')), 'disabled environment shows the not-enabled notice');
  check(!(await page.$('[data-finding-review-submit]')), 'no submit button while per-finding review is disabled');
  check(await page.$eval(`${card(1)} [data-finding-decision]`, (el) => el.disabled), 'decision inputs disabled while not enabled');
  check(!!(await page.$('[data-connected-ai-review-suspended]')), 'whole-run Accept still unavailable (Reject-only form with notice)');

  findingView = baseView();
  page = await newConnectedPage(browser);
  check(await openRun(page), 'enabled environment: per-finding review loaded');
  const cardText = await page.$eval(card(1), (el) => el.innerText);
  check(
    /Statement:.*notify payers/s.test(cardText) && /VERIFIED/i.test(cardText) && /p\.14/.test(cardText) && /verify against the PDF/.test(cardText),
    'finding card shows statement, citation status, cited page and the verify-against-PDF warning',
    cardText.slice(0, 300),
  );
  check(!!(await page.$('[data-finding-review-uat-pathway]')), 'human-verified UAT pathway notice shown (obligationGradeSuitable=false)');
  check(await submitDisabled(page), 'submit disabled before any decision');
  check(
    (await page.$eval(`${card(1)} [data-finding-classification]`, (s) => s.value)) === '',
    'classification is not pre-selected from the model suggestion',
  );

  // Finding 1: reject.
  await page.check(`${card(0)} [data-finding-decision][value="REJECTED"]`);
  await page.fill(`${card(0)} [data-finding-comment]`, 'Permission to delay, not an obligation.');
  check(/Rejected — no obligation/.test(await outcome(page, 0)), 'rejected finding: no obligation');

  // Finding 2: binding requirement with the copied quotation.
  await page.check(`${card(1)} [data-finding-decision][value="ACCEPTED"]`);
  await page.selectOption(`${card(1)} [data-finding-classification]`, 'binding_requirement');
  check(/Missing: legal basis, exact quotation, PDF page, comment/.test(await outcome(page, 1)), 'obligation-class acceptance lists missing evidence', await outcome(page, 1));
  await page.click(`${card(1)} details summary`);
  await page.click(`${card(1)} [data-finding-use-suggestion]`);
  await page.fill(`${card(1)} [data-finding-legal-basis]`, 'PSRs 2017 regulation 86(2C)');
  await page.selectOption(`${card(1)} [data-finding-page]`, '14');
  await page.fill(`${card(1)} [data-finding-comment]`, 'ok');
  check(/justification \(20\+ characters\)/.test(await outcome(page, 1)), 'short comment flagged as insufficient UAT justification', await outcome(page, 1));
  await page.fill(`${card(1)} [data-finding-comment]`, 'Verified against FG24/6 p.14 para 3.13 in the FCA PDF.');
  check(/will create a DRAFT obligation/.test(await outcome(page, 1)), 'complete binding acceptance will create a DRAFT obligation');

  // Finding 3: permission — evidence fields disabled, recorded only.
  await page.check(`${card(2)} [data-finding-decision][value="ACCEPTED"]`);
  await page.selectOption(`${card(2)} [data-finding-classification]`, 'permission');
  await page.fill(`${card(2)} [data-finding-comment]`, 'Accurate, but a permission.');
  check(/recorded as a finding, not an obligation/.test(await outcome(page, 2)), 'accepted permission recorded, not an obligation');
  check(await page.$eval(`${card(2)} [data-finding-quotation]`, (el) => el.disabled), 'quotation field disabled for a non-obligation classification');
  check(await submitDisabled(page), 'submit stays disabled while finding 4 is undecided');

  // Re-render: unsubmitted input survives.
  await page.evaluate(() => window.dispatchEvent(new HashChangeEvent('hashchange')));
  await page.waitForSelector(card(1), { timeout: 10_000 });
  await page.waitForTimeout(400);
  check(
    (await page.$eval(`${card(1)} [data-finding-quotation]`, (el) => el.value)) === QUOTE_2 &&
      (await page.$eval(`${card(1)} [data-finding-page]`, (el) => el.value)) === '14' &&
      (await page.$eval(`${card(0)} [data-finding-decision][value="REJECTED"]`, (el) => el.checked)),
    'reviewer input preserved across a re-render',
  );

  // Finding 4: reject.
  await page.check(`${card(3)} [data-finding-decision][value="REJECTED"]`);
  await page.fill(`${card(3)} [data-finding-comment]`, 'Duplicate of finding 2 for this test.');
  check(!(await submitDisabled(page)), 'submit enabled once every finding is decided');
  check(/4 of 4 findings decided · 1 DRAFT obligation/.test(await page.$eval('[data-finding-review-progress]', (p) => p.textContent)), 'progress shows all decided and one DRAFT obligation');

  // Server refusal is shown and the reviewer can resubmit.
  reviewResponses = [
    { status: 400, body: { ok: false, error: 'validation_error', detail: 'finding_quotation_not_found_on_page:2' } },
    { status: 200, body: { ok: true, reviewId: 'r1', decision: 'PARTIALLY_ACCEPTED', evidencePathway: 'human_verified_uat', materialised: [{ findingId: IDS[1], claimIndex: 1, obligationId: 'o1' }], skipped: [] } },
  ];
  await page.click('[data-finding-review-submit]');
  await page.waitForTimeout(700);
  check(/Finding 2: the quotation was not found word for word on the selected PDF page/.test(await toast(page)), 'server quotation refusal shown in plain language', await toast(page));
  check(!(await submitDisabled(page)), 'submit re-enabled after a refusal');
  const posted = reviewPosts[0];
  check(
    posted?.decisions?.length === 4 && posted.decisions.map((d) => d.findingId).join() === IDS.join() && posted.decisions.every((d, i) => d.claimTextSha256 === `sha-${i}`),
    'payload has one decision per finding keyed by stable finding ID and text hash',
    JSON.stringify(posted?.decisions?.map((d) => d.findingId)),
  );
  const d2 = posted?.decisions?.[1];
  const d3 = posted?.decisions?.[2];
  check(
    d2?.decision === 'ACCEPTED' && d2.classification === 'binding_requirement' && d2.quotation === QUOTE_2 && d2.quotationPage === 14 && d2.legalBasis === 'PSRs 2017 regulation 86(2C)',
    'binding acceptance carries classification, legal basis, quotation and page',
    JSON.stringify(d2),
  );
  check(d3?.decision === 'ACCEPTED' && d3.classification === 'permission' && d3.quotation === null && d3.legalBasis === null, 'permission acceptance carries no obligation evidence', JSON.stringify(d3));

  findingView = {
    ...baseView(),
    reviewStatus: 'PARTIALLY_ACCEPTED',
    decisions: [
      { finding_id: IDS[0], claim_index: 0, decision: 'REJECTED', classification: null, quotation_page: null, reviewer_comment: 'Permission to delay, not an obligation.', evidence_pathway: 'human_verified_uat', obligation_id: null, skip_reason: null },
      { finding_id: IDS[1], claim_index: 1, decision: 'ACCEPTED', classification: 'binding_requirement', quotation_page: 14, reviewer_comment: 'Verified.', evidence_pathway: 'human_verified_uat', obligation_id: 'o1000000-0000-4000-8000-000000000001', skip_reason: null },
      { finding_id: IDS[2], claim_index: 2, decision: 'ACCEPTED', classification: 'permission', quotation_page: null, reviewer_comment: 'Permission.', evidence_pathway: 'human_verified_uat', obligation_id: null, skip_reason: 'classification_not_obligation:permission' },
      { finding_id: IDS[3], claim_index: 3, decision: 'REJECTED', classification: null, quotation_page: null, reviewer_comment: 'Duplicate.', evidence_pathway: 'human_verified_uat', obligation_id: null, skip_reason: null },
    ],
  };
  await page.click('[data-finding-review-submit]');
  await page.waitForSelector('[data-connected-ai-finding-review-recorded]', { timeout: 10_000 }).catch(() => {});
  check(reviewPosts.length === 2, `exactly two review submissions sent (${reviewPosts.length})`);
  check(/1 DRAFT obligation\(s\) created/.test(await toast(page)), 'success toast reports the DRAFT obligations created', await toast(page));
  const recorded = await page.$eval('[data-connected-ai-finding-review-recorded]', (el) => el.innerText).catch(() => '');
  check(
    /DRAFT obligation/.test(recorded) && /Not an obligation \(permission\)/.test(recorded) && /independent approval/.test(recorded),
    'recorded decisions shown with obligation link, skip reason and approval reminder',
    recorded.slice(0, 300),
  );
  check(!(await page.$('[data-finding-review-submit]')), 'no review form once the run is reviewed');

  check(pageErrors.length === 0, 'no uncaught page errors', pageErrors.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`acceptance-ri-uc-ri-005-finding-review-browser: ${failures.length ? 'FAIL' : 'PASS'} (${failures.length} failures)`);
  if (failures.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
