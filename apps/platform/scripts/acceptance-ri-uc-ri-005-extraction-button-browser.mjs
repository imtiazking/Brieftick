#!/usr/bin/env node
/**
 * Browser acceptance: UC-RI-005 extraction button on the connected publication AI Analysis tab.
 * The button needs a parent change and a run reference, stays disabled once a request has been sent
 * (including across re-renders and after failures), and stays disabled for run references already
 * attempted (any status). Backend simulated; no live staging calls and no AI calls.
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
const CHANGE = '0ffaad3f-9b83-4728-b991-9bfb5d50e632';
const SUFFIX = 'uat-fg24-6-001';
const RUN_ID = 'aaaa0000-0000-4000-8000-000000000001';

const failures = [];
const pass = (m) => console.log(`PASS: ${m}`);
const fail = (m) => {
  failures.push(m);
  console.error(`FAIL: ${m}`);
};
const check = (cond, m, detail) => (cond ? pass(m) : fail(detail ? `${m} — ${detail}` : m));

let aiRunReferences = [];
let uatRuns = [];
const uatRunView = (id, executionStatus, errorCode = null) => ({
  id,
  useCaseId: 'UC-RI-005',
  publicationId: PUB,
  executionStatus,
  errorCode,
  reviewStatus: 'Ai Draft',
  provider: 'AIPROV-ANTHROPIC-001',
  model: 'claude-sonnet-4-5',
  createdAt: '2026-11-21T01:41:45Z',
  completedAt: null,
  humanReviewRequired: false,
  labClassification: 'uat_authorised',
  labClassificationLabel: 'Authorised UAT / acceptance execution',
  findingsPreview: null,
  claimsCount: 0,
  tenantScope: true,
  _connected: true,
});
let nextExtraction = { status: 500, body: { ok: false, error: 'internal_error' }, delayMs: 1500, recordsRunAs: 'FAILED' };
const extractionPosts = [];

const labPublication = {
  id: PUB,
  title: 'FG24/6: Guidance for firms that enables a risk-based approach to payments',
  regulator: 'FCA',
  summary: 'FCA finalised guidance.',
  display: { reference: 'FG24/6', publicationType: 'Guidance', classification: 'UNASSESSED', aiPriority: '—', triage: 'TRACKED' },
};
const detail = {
  publication: { id: PUB, title: labPublication.title },
  applicability: { id: 'cfa8cb5b-4bd6-4b8e-bae0-6580f17d6238', status: 'APPROVED', recommendation: 'APPLICABLE' },
  changes: [{ id: CHANGE, title: 'UAT — FG24/6 Risk-based approach to payments', status: 'OPEN', change_type: 'Guidance' }],
  impacts: [],
  versions: [],
};

const json = (route, status, body, headers = {}) =>
  route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) });

async function handleApi(route) {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname;
  const method = request.method();
  if (process.env.DEBUG_API) console.log(`API ${method} ${path}${url.search}`);
  if (path === '/api/organisation/active') {
    if (method === 'POST') return json(route, 200, { ok: true, organisationId: AI_DEV }, { 'set-cookie': `forgeniq_active_org=${AI_DEV}; Path=/` });
    return json(route, 200, {
      ok: true,
      userId: 'user_maker_a',
      activeOrganisationId: AI_DEV,
      selectionRequired: false,
      memberships: [{ organisationId: AI_DEV, organisationName: 'AI Development', role: 'COMPLIANCE_MANAGER' }],
    });
  }
  if (!path.startsWith('/api/ri-lab/')) return route.continue();
  if (path === '/api/ri-lab/session') {
    return json(route, 200, {
      ok: true,
      userId: 'user_maker_a',
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
    return json(route, 200, { ok: true, labPublication, display: labPublication.display, detail });
  }
  if (path === '/api/ri-lab/tenant-governance') {
    return json(route, 200, { ok: true, organisationId: AI_DEV, aiAnalysisRuns: [], authorisedUatAiAnalysisRuns: uatRuns, aiRunReferences });
  }
  if (path === '/api/ri-lab/ai-analysis-runs' && method === 'POST') {
    const posted = JSON.parse(request.postData() || '{}');
    extractionPosts.push(posted);
    const { status, body, delayMs, recordsRunAs } = nextExtraction;
    if (recordsRunAs) {
      aiRunReferences = [
        { runId: RUN_ID, publicationId: PUB, idempotencySuffix: posted.idempotencyKeySuffix, executionStatus: recordsRunAs },
      ];
    }
    await new Promise((r) => setTimeout(r, delayMs || 0));
    return json(route, status, body);
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
async function openFresh(page, hash) {
  await page.goto(`${BASE}${hash}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const ok = await waitConnected(page);
  await page.waitForTimeout(900);
  return ok;
}
/** Follow the history link from the loaded publication page, as an operator would. */
async function goToRun(page, runId) {
  await page.evaluate((id) => {
    location.hash = `#/ai-analysis/${id}`;
  }, runId);
  await page.waitForSelector(`[data-connected-ai-run-detail="${runId}"]`, { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(300);
}
const disabled = (page) => page.$eval('button[data-connected-pub-ai-submit]', (b) => b.disabled);
const statusText = (page) => page.$eval('[data-connected-pub-ai-status]', (s) => s.textContent || '');
const rerender = (page) => page.evaluate(() => window.dispatchEvent(new HashChangeEvent('hashchange')));

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

async function main() {
  const browser = await chromium.launch({ headless: true });
  let page = await newConnectedPage(browser);
  const hash = `#/publication/${PUB}/ai-analysis`;
  check(await openFresh(page, hash), 'connected; publication AI Analysis tab opened');
  check(!!(await page.$('[data-connected-pub-ai-request]')), 'extraction panel shown for AI Development');
  check(await disabled(page), 'Extract disabled with empty fields');
  await page.fill('[data-connected-pub-ai-change-id]', CHANGE);
  check(await disabled(page), 'Extract disabled without a run reference');
  await page.fill('[data-connected-pub-ai-idempotency]', SUFFIX);
  check(!(await disabled(page)), 'Extract enabled once parent change and run reference are entered');

  await page.click('button[data-connected-pub-ai-submit]');
  await page.waitForTimeout(300);
  check(await disabled(page), 'Extract disabled immediately after the click');
  await page.click('button[data-connected-pub-ai-submit]', { force: true }).catch(() => {});
  await rerender(page);
  await page.waitForTimeout(300);
  check(await disabled(page), 'Extract still disabled after a re-render while the request is in flight');
  await page.waitForTimeout(2000);
  check(extractionPosts.length === 1, `exactly one extraction request sent (${extractionPosts.length})`);
  check(
    extractionPosts[0]?.idempotencyKeySuffix === SUFFIX && extractionPosts[0]?.targetEntityId === CHANGE,
    'request carries the run reference and parent change',
    JSON.stringify(extractionPosts[0]),
  );
  await page.waitForTimeout(800);
  const failedStatus = await statusText(page);
  check(await disabled(page), 'Extract stays disabled after a server failure', failedStatus);
  check(/Do not try again/.test(failedStatus), 'failure message tells the operator not to try again (survives the catalogue refresh)', failedStatus);
  let panelText = await page.$eval('[data-connected-pub-ai-request]', (el) => el.innerText);
  check(panelText.includes(SUFFIX) && /FAILED/.test(panelText), 'catalogue refreshed after the attempt: reference listed as FAILED without a reload', panelText);
  await rerender(page);
  await page.waitForTimeout(600);
  check(await disabled(page), 'after a re-render the attempted run reference keeps Extract disabled');

  check(await openFresh(page, hash), 'reload after the failed attempt');
  panelText = await page.$eval('[data-connected-pub-ai-request]', (el) => el.innerText);
  check(panelText.includes(SUFFIX) && /FAILED/.test(panelText), 'attempted run reference still listed after reload', panelText);
  await page.fill('[data-connected-pub-ai-change-id]', CHANGE);
  await page.fill('[data-connected-pub-ai-idempotency]', SUFFIX);
  check(await disabled(page), 'Extract disabled for an already attempted run reference (FAILED)');
  check(/already been attempted/.test(await page.$eval('[data-connected-pub-ai-reference-hint]', (h) => h.textContent)), 'hint explains a new authorised run reference is needed');

  // A different reference enables the button; the server decides whether it is authorised.
  nextExtraction = { status: 409, body: { ok: false, error: 'uc_ri_005_run_reference_not_authorised' }, delayMs: 200 };
  await page.fill('[data-connected-pub-ai-idempotency]', 'uat-fg24-6-002');
  check(!(await disabled(page)), 'a new run reference enables Extract (server checks authorisation)');
  await page.click('button[data-connected-pub-ai-submit]');
  await page.waitForTimeout(800);
  check(/not authorised/.test(await statusText(page)) && (await disabled(page)), 'unauthorised reference refused with a clear message; button stays disabled');

  // Another browser whose view does not list the reference: the server reports reuse, no new analysis.
  nextExtraction = { status: 200, body: { ok: true, reused: true, runId: RUN_ID, executionStatus: 'FAILED' }, delayMs: 200 };
  aiRunReferences = [];
  page = await newConnectedPage(browser);
  check(await openFresh(page, hash), 'second browser with no references listed (stale view)');
  await page.fill('[data-connected-pub-ai-change-id]', CHANGE);
  await page.fill('[data-connected-pub-ai-idempotency]', SUFFIX);
  await page.click('button[data-connected-pub-ai-submit]');
  await page.waitForTimeout(800);
  const toast = await page.evaluate(() => document.getElementById('ri-toast')?.textContent || '');
  check(/already attempted \(status FAILED\)\. No new analysis was started/.test(toast), 'reused FAILED run reported as no new analysis', toast);
  check(extractionPosts.length === 3, `total extraction requests ${extractionPosts.length} (one per distinct attempt)`);

  // Attempted runs appear in the history; only a COMPLETED run offers the review form.
  const STUCK = RUN_ID;
  const FAILED_RUN = 'bbbb0000-0000-4000-8000-000000000002';
  const DONE = 'cccc0000-0000-4000-8000-000000000003';
  uatRuns = [uatRunView(STUCK, 'Running'), uatRunView(FAILED_RUN, 'Failed', 'AI_RUN_FINALISATION_FAILED'), uatRunView(DONE, 'Completed')];
  page = await newConnectedPage(browser);
  check(await openFresh(page, hash), 'fresh browser with attempted runs in the authorised UAT history');
  const historyRows = await page.$$eval('table tr', (trs) =>
    trs.filter((tr) => tr.querySelector('a[href^="#/ai-analysis/"]')).map((tr) => ({ href: tr.querySelector('a').getAttribute('href'), text: tr.innerText })),
  );
  const rowFor = (id) => historyRows.find((r) => r.href === `#/ai-analysis/${id}`);
  check(/Running/i.test(rowFor(STUCK)?.text || '') && /Failed/i.test(rowFor(FAILED_RUN)?.text || ''), 'RUNNING and FAILED runs listed with their status in the publication analysis history', JSON.stringify(historyRows));
  for (const [id, label, expectCode] of [
    [STUCK, 'RUNNING', null],
    [FAILED_RUN, 'FAILED', 'AI_RUN_FINALISATION_FAILED'],
  ]) {
    await goToRun(page, id);
    const text = await page.evaluate(() => document.body.innerText);
    check(/did not complete/.test(text) && !(await page.$('[data-connected-ai-review-submit]')), `${label} run detail: no review form, explains it did not complete`, text.slice(0, 300));
    if (expectCode) check(text.includes(expectCode), `${label} run detail shows the error code`);
  }
  await goToRun(page, DONE);
  check(!!(await page.$('[data-connected-ai-review-submit]')), 'COMPLETED run detail still offers the review form');

  check(pageErrors.length === 0, 'no uncaught page errors', pageErrors.slice(0, 3).join(' | '));

  await browser.close();
  console.log(`acceptance-ri-uc-ri-005-extraction-button-browser: ${failures.length ? 'FAIL' : 'PASS'} (${failures.length} failures)`);
  if (failures.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
