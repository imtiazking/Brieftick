#!/usr/bin/env node
/**
 * Browser acceptance: multi-membership user selects AI Development, selection persists via
 * forgeniq_active_org cookie across reload and navigation, and a non-member cookie fails closed.
 * Backend is simulated with membership-checked route handlers (no live staging calls).
 */
import { chromium } from 'playwright';

const BASE =
  process.env.DESIGN_LAB_SMOKE_BASE ||
  'http://127.0.0.1:3001/design-lab/regulatory-intelligence/index.html';
const AI_DEV = 'b8f5e3a1-00ad-4000-8000-000000000001';
const PARTNER_UAT = '4d871541-e0d4-4581-828d-72073f763f85';
const NON_MEMBER = '22e46d56-1f6f-42c2-9424-b2e0a40df45a';
const COOKIE = 'forgeniq_active_org';
const USER = 'user_lab_org_selection_test';

const memberships = [
  { organisationId: AI_DEV, organisationName: 'AI Development', role: 'OWNER' },
  { organisationId: PARTNER_UAT, organisationName: 'Partner UAT', role: 'VIEWER' },
];

const failures = [];
const pass = (m) => console.log(`PASS: ${m}`);
const fail = (m) => {
  failures.push(m);
  console.error(`FAIL: ${m}`);
};

const tenantRequests = [];

function cookieOrg(request) {
  const header = request.headers().cookie || '';
  const m = header.match(new RegExp(`${COOKIE}=([0-9a-f-]{36})`, 'i'));
  return m ? m[1] : null;
}

function memberOrg(request) {
  const org = cookieOrg(request);
  return memberships.some((m) => m.organisationId === org) ? org : null;
}

const json = (route, status, body, headers = {}) =>
  route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) });

async function handleApi(route) {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname;

  if (path === '/api/organisation/active' && request.method() === 'GET') {
    const active = memberOrg(request);
    return json(route, 200, {
      ok: true,
      userId: USER,
      activeOrganisationId: active,
      selectionRequired: !active,
      reason: active ? null : 'organisation_selection_required',
      memberships,
    });
  }
  if (path === '/api/organisation/active' && request.method() === 'POST') {
    const { organisationId } = JSON.parse(request.postData() || '{}');
    if (!memberships.some((m) => m.organisationId === organisationId)) {
      return json(route, 403, { error: 'organisation_not_member' });
    }
    return json(route, 200, { ok: true, organisationId }, {
      'set-cookie': `${COOKIE}=${organisationId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`,
    });
  }

  if (path.startsWith('/api/ri-lab/')) {
    const active = memberOrg(request);
    tenantRequests.push({ path, org: cookieOrg(request), member: Boolean(active) });
    if (!active) return json(route, 409, { ok: false, error: 'organisation_selection_required' });
    if (path === '/api/ri-lab/session') {
      const m = memberships.find((x) => x.organisationId === active);
      return json(route, 200, {
        ok: true,
        userId: USER,
        userEmail: 'operator@forgeniq.test',
        organisationId: active,
        organisationName: m.organisationName,
        role: m.role,
        writesEnabled: false,
      });
    }
    if (path === '/api/ri-lab/readiness') {
      return json(route, 200, { ok: true, environment: 'staging', stagingProjectMatch: true, writesEnabled: false });
    }
    return json(route, 200, { ok: true, organisationId: active, items: [], data: [], publications: [] });
  }

  return route.continue();
}

async function diag(page) {
  return page.evaluate(() => window.__FORGENIQ_RI_CONNECTIVITY_DIAG__?.() ?? null);
}

async function waitForMode(page, modes, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    last = await diag(page);
    if (last?.connectivity && modes.includes(last.connectivity.mode) && !last.bootstrapInflight) return last;
    await page.waitForTimeout(250);
  }
  return last;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.route('**/api/**', handleApi);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto(`${BASE}#/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('forgeniq-ri-connected-mode', '1');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });

  const first = await waitForMode(page, ['org_selection_required', 'connected', 'connected_error']);
  if (first?.connectivity?.mode === 'org_selection_required') pass('multi-membership user gets org_selection_required (not connected_error)');
  else fail(`expected org_selection_required, got ${JSON.stringify(first?.connectivity)}`);

  const gateText = await page.evaluate(() => document.body.innerText);
  if (/Select organisation/i.test(gateText)) pass('organisation selection gate rendered');
  else fail('organisation selection gate not rendered');
  const options = await page.$$eval('[data-ri-select-org] option', (els) => els.map((e) => e.value).filter(Boolean));
  if (options.includes(AI_DEV) && options.includes(PARTNER_UAT)) pass('picker lists both memberships');
  else fail(`picker options: ${JSON.stringify(options)}`);

  await page.selectOption('[data-ri-select-org]', AI_DEV);
  await page.click('[data-ri-apply-org]');
  const afterSelect = await waitForMode(page, ['connected']);
  if (afterSelect?.connectivity?.mode === 'connected' && afterSelect.backendSessionOk) pass('AI Development selected -> connected');
  else fail(`after selection: ${JSON.stringify(afterSelect?.connectivity)}`);

  const accountBtn = await page.$('#ri-account-menu-btn');
  if (accountBtn) {
    pass('account menu trigger rendered for connected session');
    await accountBtn.click();
    const menu = await page.evaluate(() => {
      const el = document.getElementById('ri-account-menu');
      return el
        ? {
            hidden: el.hidden,
            text: el.innerText,
            signOut: el.querySelector('.ri-account__action--signout')?.getAttribute('href'),
          }
        : null;
    });
    if (menu && !menu.hidden && /AI Development/.test(menu.text) && /OWNER/.test(menu.text)) {
      pass('account menu opens with active organisation and role');
    } else fail(`account menu content: ${JSON.stringify(menu)}`);
    if (menu?.signOut === '/sign-out') pass('account menu exposes Sign out (/sign-out)');
    else fail(`sign out link: ${menu?.signOut}`);
    await page.click('.ri-main', { force: true }).catch(() => {});
    const closed = await page.evaluate(() => document.getElementById('ri-account-menu')?.hidden === true);
    if (closed) pass('account menu closes on outside click');
    else fail('account menu did not close on outside click');
  } else fail('account menu trigger missing after connect');

  const cookies = await context.cookies();
  const orgCookie = cookies.find((c) => c.name === COOKIE);
  if (orgCookie?.value === AI_DEV && orgCookie.httpOnly && orgCookie.expires > Date.now() / 1000 + 86_400) {
    pass('forgeniq_active_org cookie set to AI Development (httpOnly, persistent)');
  } else fail(`cookie state: ${JSON.stringify(orgCookie)}`);

  await page.reload({ waitUntil: 'domcontentloaded' });
  const afterReload = await waitForMode(page, ['connected', 'connected_error', 'org_selection_required']);
  if (afterReload?.connectivity?.mode === 'connected') pass('connection survives page refresh without re-selection');
  else fail(`after reload: ${JSON.stringify(afterReload?.connectivity)}`);

  for (const route of ['#/library', '#/obligations', '#/changes', '#/admin/platform', '#/dashboard']) {
    await page.evaluate((h) => {
      location.hash = h;
    }, route);
    await page.waitForTimeout(600);
    const d = await diag(page);
    const blocked = await page.evaluate(() => /Select organisation|CONNECTED STAGING ERROR/i.test(document.body.innerText));
    if (d?.connectivity?.mode === 'connected' && !blocked) pass(`navigation ${route} stays connected`);
    else fail(`navigation ${route}: mode=${d?.connectivity?.mode} blocked=${blocked}`);
  }

  const wrongTenant = tenantRequests.filter((r) => r.org && r.org !== AI_DEV);
  if (wrongTenant.length === 0) pass(`all ${tenantRequests.length} tenant API requests scoped to AI Development`);
  else fail(`requests carried other tenant: ${JSON.stringify(wrongTenant.slice(0, 3))}`);

  await context.addCookies([{ name: COOKIE, value: NON_MEMBER, url: new URL(BASE).origin, httpOnly: true }]);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const tampered = await waitForMode(page, ['org_selection_required', 'connected', 'connected_error']);
  if (tampered?.connectivity?.mode === 'org_selection_required' && !tampered.backendReady) {
    pass('non-member organisation cookie fails closed to selection gate');
  } else fail(`tampered cookie: ${JSON.stringify(tampered?.connectivity)} backendReady=${tampered?.backendReady}`);
  for (const route of ['#/dashboard', '#/library']) {
    await page.evaluate((h) => {
      location.hash = h;
    }, route);
    await page.waitForTimeout(600);
    const gated = await page.evaluate(() => /Select organisation/i.test(document.body.innerText));
    if (gated) pass(`non-member cookie: ${route} shows selection gate, not cached tenant views`);
    else fail(`non-member cookie: ${route} rendered without selection gate`);
  }
  const leaked = tenantRequests.filter((r) => r.org === NON_MEMBER && r.member);
  if (leaked.length === 0) pass('no tenant data served for non-member organisation');
  else fail('tenant data served for non-member organisation');

  if (pageErrors.length === 0) pass('no uncaught page errors');
  else fail(`page errors: ${pageErrors.slice(0, 3).join(' | ')}`);

  await browser.close();
  console.log(`acceptance-lab-org-selection-browser: ${failures.length ? 'FAIL' : 'PASS'} (${failures.length} failures)`);
  if (failures.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
