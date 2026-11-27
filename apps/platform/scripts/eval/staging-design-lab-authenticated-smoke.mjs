#!/usr/bin/env node
/**
 * Authenticated Design Lab smoke for staging Users A, B and C.
 * Reads rendered screens and GET APIs. It does not approve obligations or submit reviews.
 *
 * Exit 0 PASS, 1 application FAIL, 2 AUTH_BLOCKED.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SessionExpiredError,
  requireUatPersonas,
  runAs,
} from '../uat/staging-user-sessions.mjs';
import { authOrigin, designLabEntry, isAuthorizedAuthHost } from '../staging/staging-release-hosts.mjs';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const repoRoot = join(platformRoot, '..', '..');
let origin;
try {
  origin = authOrigin();
} catch (err) {
  const host = new URL((process.env.FORGENIQ_AUTH_BASE || '').replace(/\/$/, '') || 'https://invalid').hostname;
  if (host.endsWith('.vercel.app')) {
    console.error(
      `AUTH_BLOCKED Clerk persona sessions require an authorised FORGENIQ staging host, not ${host}. Use candidate-staging.forgeniq.com or staging-app.forgeniq.com. This is not an application defect.`,
    );
    process.exit(2);
  }
  throw err;
}
const host = new URL(origin).hostname;
const LAB = designLabEntry(origin);

if (!isAuthorizedAuthHost(host)) {
  console.error(`AUTH_BLOCKED host ${host} is not an authorised auth host.`);
  process.exit(2);
}

const READS = [
  { name: 'Dashboard', hash: '#/dashboard', heading: /dashboard|regulatory|material|attention|publication/i, api: '/api/ri-lab/dashboard' },
  { name: 'AI Findings', hash: '#/triage/ai-findings', heading: /AI Findings/i, api: '/api/ri-lab/triage?queue=AI_FINDINGS&page=1&pageSize=25' },
  { name: 'Verified Obligations', hash: '#/triage/verified-obligations', heading: /Verified Obligations/i, api: '/api/ri-lab/triage?queue=VERIFIED_OBLIGATIONS&page=1&pageSize=25' },
  { name: 'Non-Obligations', hash: '#/triage/non-obligations', heading: /Non-Obligations/i, api: '/api/ri-lab/triage?queue=NON_OBLIGATIONS&page=1&pageSize=25' },
  { name: 'Rejected Findings', hash: '#/triage/rejected', heading: /Rejected Findings/i, api: '/api/ri-lab/triage?queue=REJECTED_FINDINGS&page=1&pageSize=25' },
  { name: 'Exceptions', hash: '#/triage/exceptions', heading: /Exceptions/i, api: '/api/ri-lab/triage?queue=EXCEPTIONS&page=1&pageSize=25' },
  { name: 'Not Applicable', hash: '#/triage/not-applicable', heading: /Not Applicable/i, api: '/api/ri-lab/triage?queue=NOT_APPLICABLE&page=1&pageSize=25' },
  { name: 'All Findings', hash: '#/triage/all', heading: /All Findings/i, api: '/api/ri-lab/triage?queue=ALL_FINDINGS&page=1&pageSize=25' },
  { name: 'My Tasks', hash: '#/work', heading: /My Tasks/i, api: '/api/ri-lab/my-tasks?scope=mine&page=1&pageSize=25' },
  { name: 'Attention Centre', hash: '#/notifications', heading: /Attention|notification|exception/i, api: '/api/ri-lab/notifications' },
  { name: 'Obligations', hash: '#/obligations', heading: /Obligation/i, api: '/api/ri-lab/obligations' },
  { name: 'Impact assessments', hash: '#/assessments', heading: /Impact/i, api: '/api/ri-lab/impact-assessments' },
  { name: 'Risks', hash: '#/risks', heading: /Risk/i, api: '/api/ri-lab/risks' },
  { name: 'Controls', hash: '#/controls', heading: /Control/i, api: '/api/ri-lab/controls' },
  { name: 'Assurance', hash: '#/assurance', heading: /Assurance/i, api: '/api/ri-lab/assurance-reviews' },
  { name: 'Quality assurance', hash: '#/admin/qa', heading: /Quality assurance/i, api: '/design-lab/regulatory-intelligence/qa/latest.json' },
];

const results = [];
const identities = [];

function record(row) {
  results.push(row);
  console.log(row.ok ? 'PASS' : 'FAIL', row.persona, row.name, row.detail || '');
}

async function openRoute(page, route) {
  const errors = [];
  const onError = (err) => errors.push(String(err?.message || err).slice(0, 240));
  page.on('pageerror', onError);
  await page.goto(`${LAB}${route.hash}`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForFunction(() => document.documentElement.dataset.riMounted === '1', null, { timeout: 20_000 }).catch(() => {});
  if (route.hash.startsWith('#/triage/')) {
    await page.waitForSelector('[data-triage-rows]', { timeout: 90_000 }).catch(() => {});
    await page
      .waitForFunction(
        () => {
          const status = document.querySelector('[data-triage-status]')?.textContent || '';
          if (status.includes('Loading')) return false;
          const rowCount = document.querySelectorAll(
            '[data-triage-rows] tbody tr, [data-triage-screen] tbody tr',
          ).length;
          if (rowCount === 0) return true;
          if (location.hash.includes('ai-findings')) {
            return document.querySelectorAll('[data-triage-five-decisions]').length > 0;
          }
          return true;
        },
        null,
        { timeout: 120_000 },
      )
      .catch(() => {});
  }
  let heading = '';
  for (let i = 0; i < 15; i += 1) {
    heading = await page.locator('h1').first().innerText().catch(() => '');
    if (heading && !/connecting/i.test(heading)) break;
    await page.waitForTimeout(1000);
  }
  const snapshot = await page.evaluate(() => ({
    mounted: document.documentElement.dataset.riMounted === '1',
    text: document.getElementById('ri-app')?.innerText?.length || 0,
    reviewButtons: document.querySelectorAll('[data-triage-five-decisions]').length,
    nav: document.querySelectorAll('nav.ri-topnav, nav.ri-sidebar__nav, aside.ri-sidebar nav').length,
  }));
  page.off('pageerror', onError);
  const signIn = /sign in required|backend unavailable|log in to vercel/i.test(heading);
  return {
    heading: heading.slice(0, 100),
    signIn,
    errors,
    ...snapshot,
    headingOk: route.heading.test(heading),
  };
}

async function sessionCaps(page) {
  return page.evaluate(async () => {
    const res = await fetch('/api/ri-lab/session', { credentials: 'same-origin', cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    return {
      aiReview: body.writeCapabilities?.aiReview === true,
      obligationReview: body.writeCapabilities?.obligationReview === true,
    };
  });
}

async function apiGet(page, path) {
  return page.evaluate(async (path) => {
    const res = await fetch(path, { credentials: 'same-origin', cache: 'no-store' });
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    const count = body && typeof body === 'object'
      ? body.total ?? body.count ?? body.items?.length ?? body.risks?.length ?? body.controls?.length ?? body.obligations?.length ?? body.assuranceReviews?.length ?? body.impactAssessments?.length ?? null
      : null;
    return { status: res.status, ok: res.ok, object: Boolean(body && typeof body === 'object'), count };
  }, path);
}

try {
  await requireUatPersonas(['A', 'B', 'C'], { label: 'authenticated-smoke' });
  await runAs('C', async ({ page, identity }) => {
    identities.push({ persona: 'C', userId: identity.userId, role: identity.role, organisationId: identity.organisationId });
    for (const route of READS) {
      const view = await openRoute(page, route);
      const api = await apiGet(page, route.api);
      const ok = view.mounted && view.nav > 0 && view.headingOk && !view.signIn && view.text > 40 && view.errors.length === 0 && api.ok && api.object;
      record({
        persona: 'C',
        name: route.name,
        ok,
        detail: `${view.heading} api ${api.status} count ${api.count ?? '-'}`,
        apiStatus: api.status,
        count: api.count,
      });
    }
    const caps = await sessionCaps(page);
    const pending = await apiGet(page, '/api/ri-lab/governance/pending');
    record({
      persona: 'C',
      name: 'Checker pending approvals',
      ok: caps.obligationReview && pending.ok && pending.object,
      detail: `obligationReview ${caps.obligationReview} api ${pending.status} count ${pending.count ?? '-'}`,
      apiStatus: pending.status,
      count: pending.count,
    });
  });

  await runAs('B', async ({ page, identity }) => {
    identities.push({ persona: 'B', userId: identity.userId, role: identity.role, organisationId: identity.organisationId });
    const caps = await sessionCaps(page);
    const view = await openRoute(page, READS[1]);
    const api = await apiGet(page, READS[1].api);
    const ok = identity.role === 'REVIEWER' && caps.aiReview && view.headingOk && !view.signIn && api.ok && view.reviewButtons > 0;
    record({
      persona: 'B',
      name: 'Reviewer human-review actions',
      ok,
      detail: `role ${identity.role} aiReview ${caps.aiReview} buttons ${view.reviewButtons} api ${api.status}`,
    });
  });

  await runAs('A', async ({ page, identity }) => {
    identities.push({ persona: 'A', userId: identity.userId, role: identity.role, organisationId: identity.organisationId });
    const caps = await sessionCaps(page);
    const view = await openRoute(page, READS[1]);
    const distinct = new Set(identities.map((row) => row.userId)).size === 3;
    const sameOrg = identities.every((row) => row.organisationId === identity.organisationId);
    const buttonsMatch = caps.aiReview ? view.reviewButtons > 0 : view.reviewButtons === 0;
    const ok = view.headingOk && !view.signIn && buttonsMatch && distinct && sameOrg;
    record({
      persona: 'A',
      name: 'User A actions match granted capabilities',
      ok,
      detail: `role ${identity.role} aiReview ${caps.aiReview} obligationReview ${caps.obligationReview} buttons ${view.reviewButtons} distinctUsers ${distinct}. Self-approval denial stays in the offline maker-checker test.`,
    });
  });
} catch (err) {
  if (err instanceof SessionExpiredError || err?.message === 'uat_personas_not_ready') {
    if (err?.code === 'clerk_or_host' || err?.personas?.some((p) => p.state === 'CLERK_NOT_CONFIGURED')) {
      console.error(`AUTH_BLOCKED clerk_or_host — fix deployment before renewing sessions (${err.message})`);
    } else {
      console.error(`AUTH_BLOCKED ${err.message}`);
    }
    process.exit(2);
  }
  throw err;
}

const evidenceDir = join(repoRoot, 'docs', 'uat', 'evidence', 'authenticated-qa-2026-11-25');
mkdirSync(evidenceDir, { recursive: true });
const failed = results.filter((row) => !row.ok);
writeFileSync(
  join(evidenceDir, 'RESULT.json'),
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    origin,
    identities: identities.map(({ persona, role, organisationId }) => ({ persona, role, organisationId })),
    passed: results.filter((row) => row.ok).length,
    failed: failed.length,
    results,
  }, null, 2),
);
if (failed.length) {
  console.error(`authenticated-smoke: FAIL ${failed.length}/${results.length}`);
  process.exit(1);
}
console.log(`authenticated-smoke: PASS ${results.length} checks @ ${origin}`);
