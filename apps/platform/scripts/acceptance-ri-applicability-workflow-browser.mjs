#!/usr/bin/env node
/**
 * Browser acceptance: connected publication applicability workflow (draft → submit → independent approval).
 * Backend is simulated with stateful handlers that apply the server's rules (one live assessment per
 * organisation and publication, draft-only edits, submitter cannot approve). No live staging calls.
 */
import { chromium } from 'playwright';

const BASE =
  process.env.RI_APPLICABILITY_BROWSER_BASE ||
  'http://127.0.0.1:3001/design-lab/regulatory-intelligence/index.html';
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(BASE)) {
  console.error(`Refusing to run against ${BASE}: this test simulates writes and must target a local server.`);
  process.exit(2);
}
const AI_DEV = 'b8f5e3a1-00ad-4000-8000-000000000001';
const PUB = 'ec168f48-1717-4631-8e4a-a3e95df4d5ce';
const CHANGE = '0ffaad3f-9b83-4728-b991-9bfb5d50e632';
const USER_A = 'user_maker_a';
const USER_B = 'user_checker_b';
const COOKIE = 'forgeniq_active_org';
const RATIONALE = 'UAT — FG24/6: designated applicable to FORGENIQ AI Development for the controlled test.';

const failures = [];
const pass = (m) => console.log(`PASS: ${m}`);
const fail = (m) => {
  failures.push(m);
  console.error(`FAIL: ${m}`);
};
const check = (cond, m, detail) => (cond ? pass(m) : fail(detail ? `${m} — ${detail}` : m));

let currentUser = USER_A;
const assessments = [];
const writes = [];
let seq = 0;

const labPublication = {
  id: PUB,
  title: 'FG24/6: Guidance for firms that enables a risk-based approach to payments',
  regulator: 'FCA',
  summary: 'FCA finalised guidance.',
  display: {
    reference: 'FG24/6',
    publicationType: 'Guidance',
    classification: 'UNASSESSED',
    aiPriority: '—',
    triage: 'TRACKED',
  },
};

function latestAssessment() {
  return [...assessments].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] || null;
}

function touch(row) {
  seq += 1;
  row.updated_at = new Date(Date.UTC(2026, 10, 20, 18, 0, seq)).toISOString();
}

function publicationDetail() {
  return {
    publication: { id: PUB, title: labPublication.title },
    applicability: latestAssessment(),
    changes: [{ id: CHANGE, title: 'UAT — FG24/6 Risk-based approach to payments', status: 'OPEN', change_type: 'Guidance' }],
    impacts: [],
    versions: [],
  };
}

const json = (route, status, body, headers = {}) =>
  route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) });

function savePatch(body) {
  if (body.assessmentId) {
    const row = assessments.find((a) => a.id === body.assessmentId);
    if (!row) return [404, { ok: false, error: 'not_found' }];
    if (!['DRAFT', 'REJECTED'].includes(row.status)) return [409, { ok: false, error: 'applicability_locked' }];
    if (body.expectedUpdatedAt && body.expectedUpdatedAt !== row.updated_at) return [409, { ok: false, error: 'stale_record' }];
    Object.assign(row, { recommendation: body.recommendation, rationale: body.rationale ?? null, status: 'DRAFT' });
    touch(row);
    return [200, { ok: true }];
  }
  if (assessments.some((a) => a.status !== 'SUPERSEDED')) {
    return [409, { ok: false, error: 'applicability_assessment_exists' }];
  }
  const row = {
    id: `aa000000-0000-4000-8000-${String(assessments.length + 1).padStart(12, '0')}`,
    organisation_id: AI_DEV,
    publication_id: PUB,
    recommendation: body.recommendation,
    rationale: body.rationale ?? null,
    status: 'DRAFT',
    submitted_by: null,
    submitted_at: null,
    reviewed_by: null,
    reviewed_at: null,
  };
  touch(row);
  assessments.push(row);
  return [200, { ok: true }];
}

function workflowPatch(id, body) {
  const row = assessments.find((a) => a.id === id);
  if (!row) return [404, { ok: false, error: 'not_found' }];
  if (body.expectedUpdatedAt && body.expectedUpdatedAt !== row.updated_at) return [409, { ok: false, error: 'stale_record' }];
  if (body.action === 'submit') {
    if (!['DRAFT', 'REJECTED'].includes(row.status)) return [409, { ok: false, error: 'applicability_invalid_transition' }];
    Object.assign(row, { status: 'IN_REVIEW', submitted_by: currentUser, submitted_at: new Date().toISOString() });
  } else if (body.action === 'approve' || body.action === 'reject') {
    if (row.status !== 'IN_REVIEW') return [409, { ok: false, error: 'applicability_invalid_transition' }];
    if (body.action === 'approve' && row.submitted_by === currentUser) {
      return [403, { ok: false, error: 'forbidden', reason: 'segregation_of_duties' }];
    }
    Object.assign(row, {
      status: body.action === 'approve' ? 'APPROVED' : 'REJECTED',
      reviewed_by: currentUser,
      reviewed_at: new Date().toISOString(),
    });
  } else {
    return [400, { ok: false, error: 'invalid_action' }];
  }
  touch(row);
  return [200, { ok: true, assessment: row }];
}

async function handleApi(route) {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname;
  const method = request.method();

  if (path === '/api/organisation/active') {
    if (method === 'POST') {
      return json(route, 200, { ok: true, organisationId: AI_DEV }, { 'set-cookie': `${COOKIE}=${AI_DEV}; Path=/` });
    }
    return json(route, 200, {
      ok: true,
      userId: currentUser,
      activeOrganisationId: AI_DEV,
      selectionRequired: false,
      memberships: [{ organisationId: AI_DEV, organisationName: 'AI Development', role: 'COMPLIANCE_MANAGER' }],
    });
  }
  if (!path.startsWith('/api/ri-lab/')) return route.continue();

  if (path === '/api/ri-lab/session') {
    return json(route, 200, {
      ok: true,
      userId: currentUser,
      organisationId: AI_DEV,
      organisationName: 'AI Development',
      role: 'COMPLIANCE_MANAGER',
      writesEnabled: true,
      writeCapabilities: { applicabilityWorkflow: true, impactAssessments: true },
    });
  }
  if (path === '/api/ri-lab/readiness') {
    return json(route, 200, { ok: true, environment: 'staging', stagingProjectMatch: true, writesEnabled: true });
  }
  if (path === '/api/ri-lab/publications' && method === 'GET') {
    return json(route, 200, { ok: true, publications: [labPublication] });
  }
  if (path === `/api/ri-lab/publications/${PUB}`) {
    if (method === 'PATCH') {
      const body = JSON.parse(request.postData() || '{}');
      const [status, out] = savePatch(body);
      writes.push({ user: currentUser, kind: body.assessmentId ? 'update' : 'insert', status });
      if (status !== 200) return json(route, status, out);
      return json(route, 200, { ok: true, labPublication, detail: publicationDetail() });
    }
    return json(route, 200, { ok: true, labPublication, display: labPublication.display, detail: publicationDetail() });
  }
  const wf = path.match(/^\/api\/ri-lab\/applicability\/([^/]+)$/);
  if (wf && method === 'PATCH') {
    const body = JSON.parse(request.postData() || '{}');
    const [status, out] = workflowPatch(decodeURIComponent(wf[1]), body);
    writes.push({ user: currentUser, kind: body.action, id: wf[1], status });
    return json(route, status, out);
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

const text = (page) => page.evaluate(() => document.querySelector('.ri-main')?.innerText || document.body.innerText);

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.route('**/api/**', handleApi);
  await context.route('https://clerk.forgeniq.com/**', (route) => route.abort());
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(`${BASE}#/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('forgeniq-ri-connected-mode', '1');
  });

  const injected = await page.evaluate(
    () => document.querySelector('meta[name="forgeniq-clerk-publishable-key"]')?.getAttribute('content') || null,
  );
  check(injected === 'pk_live_Y2xlcmsuZm9yZ2VuaXEuY29tJA', 'Clerk publishable key injected into Design Lab HTML', String(injected));

  check(await openFresh(page, `#/publication/${PUB}/applicability`), 'connected as maker A (Clerk SDK blocked — page still works)');
  let t = await text(page);
  check(!/FORGENIQ AI · DEMO/.test(t) && !/ABC Financial/.test(t), 'publication Applicability tab shows no DEMO AI box or demo reasoning');
  check(
    /NOT_STARTED/.test(t) && /UAT — FG24\/6 Risk-based approach to payments/.test(t),
    'tab shows tenant status and the tenant change',
    t.slice(t.indexOf('Publication-level'), t.indexOf('Publication-level') + 400),
  );

  check(await openFresh(page, `#/applicability/${PUB}`), 'direct load of #/applicability route connects');
  t = await text(page);
  check(!/View unavailable|could not load this view/i.test(t), 'applicability view renders (no View unavailable)', t.slice(0, 200));
  check(/NOT_STARTED/.test(t), 'no assessment yet → status NOT_STARTED');
  check(!(await page.$('button[data-connected-applicability-submit]')), 'Submit hidden until a draft exists');

  await page.selectOption('[data-connected-applicability-recommendation]', 'APPLICABLE');
  await page.fill('[data-connected-applicability-rationale]', RATIONALE);
  await page.click('button[data-connected-applicability-save]');
  await page.waitForTimeout(900);
  t = await text(page);
  check(assessments.length === 1 && /DRAFT/.test(t), 'Save draft creates exactly one DRAFT assessment');
  const rationaleShown = await page.inputValue('[data-connected-applicability-rationale]');
  check(rationaleShown === RATIONALE, 'saved rationale is shown back in the form');

  await page.click('button[data-connected-applicability-save]');
  await page.waitForTimeout(900);
  check(assessments.length === 1 && writes.filter((w) => w.kind === 'update' && w.status === 200).length === 1, 'second Save updates the same assessment (no duplicate)');

  const staleInsert = await page.evaluate(async (pub) => {
    const r = await fetch(`/api/ri-lab/publications/${pub}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recommendation: 'APPLICABLE', rationale: 'stale client' }),
    });
    return { status: r.status, body: await r.json() };
  }, PUB);
  check(staleInsert.status === 409 && staleInsert.body.error === 'applicability_assessment_exists' && assessments.length === 1, 'insert without id is refused when an assessment exists');

  await page.click('button[data-connected-applicability-submit]');
  await page.waitForTimeout(900);
  t = await text(page);
  check(latestAssessment()?.status === 'IN_REVIEW' && /IN_REVIEW/.test(t), 'Submit for approval → IN_REVIEW shown without manual reload');
  check(!(await page.$('button[data-connected-applicability-save]')), 'draft editing hidden once submitted');
  check(!(await page.$('button[data-connected-applicability-approve]')) && /You submitted this assessment/.test(t), 'maker A sees segregation-of-duties note, no Approve button');

  const lockedEdit = await page.evaluate(async ({ pub, id }) => {
    const r = await fetch(`/api/ri-lab/publications/${pub}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assessmentId: id, recommendation: 'NOT_APPLICABLE' }),
    });
    return { status: r.status, body: await r.json() };
  }, { pub: PUB, id: latestAssessment().id });
  check(lockedEdit.status === 409 && lockedEdit.body.error === 'applicability_locked' && latestAssessment().recommendation === 'APPLICABLE', 'submitted assessment cannot be edited back to draft');

  currentUser = USER_B;
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('forgeniq-ri-connected-mode', '1');
  });
  check(await openFresh(page, `#/applicability/${PUB}`), 'connected as checker B (fresh browser state, deep link)');
  t = await text(page);
  check(/IN_REVIEW/.test(t) && !!(await page.$('button[data-connected-applicability-approve]')), 'checker B sees IN_REVIEW and Approve');
  const writesBefore = writes.length;
  await page.click('[data-connected-applicability-decision-comments]');
  await page.fill('[data-connected-applicability-decision-comments]', 'UAT — FG24/6 applicability approved for controlled test.');
  await page.waitForTimeout(300);
  check(writes.length === writesBefore, 'clicking the comments box sends no request');
  await page.click('button[data-connected-applicability-approve]');
  await page.waitForTimeout(900);
  t = await text(page);
  const a = latestAssessment();
  check(a?.status === 'APPROVED' && a.reviewed_by === USER_B && a.submitted_by === USER_A, 'B approves: APPROVED, submitted_by A, reviewed_by B');
  check(/APPROVED/.test(t) && !(await page.$('button[data-connected-applicability-approve]')), 'page shows APPROVED and no further checker actions');
  check(!(await page.$('button[data-connected-applicability-save]')), 'approved assessment is not editable');

  await page.evaluate((h) => {
    location.hash = h;
  }, `#/publication/${PUB}/applicability`);
  await page.waitForTimeout(900);
  t = await text(page);
  check(/APPROVED/.test(t) && !/FORGENIQ AI · DEMO/.test(t), 'publication Applicability tab reflects APPROVED');

  check(assessments.length === 1, `exactly one assessment overall (${assessments.length})`);
  check(pageErrors.length === 0, 'no uncaught page errors', pageErrors.slice(0, 3).join(' | '));

  await browser.close();
  console.log(`acceptance-ri-applicability-workflow-browser: ${failures.length ? 'FAIL' : 'PASS'} (${failures.length} failures)`);
  if (failures.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
