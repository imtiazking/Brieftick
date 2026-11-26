#!/usr/bin/env node
/**
 * Fresh IN_REVIEW risk: maker self-approval toast, status unchanged, checker approval.
 * Also confirms an existing assurance review still links its finding.
 * Does not reuse a closed lifecycle as a negative test.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { STAGING_ORGANISATION_ID, STAGING_ORIGIN, requireUatPersonas, runAs } from './staging-user-sessions.mjs';

const OUT = join(REPO_ROOT, 'docs', 'uat', 'evidence', 'risk-sod-fresh-2026-11-26');
mkdirSync(OUT, { recursive: true });
const LAB = `${STAGING_ORIGIN}/design-lab/regulatory-intelligence/index.html`;
const ASSURANCE = '122e9511-323c-49e7-a023-1d54486a97c9';
const results = [];
const record = (id, status, detail = {}) => {
  results.push({ id, status, detail });
  console.log(`${status} ${id}`);
};

async function ensureLabReady(page) {
  await page.waitForFunction(() => document.documentElement.dataset.riMounted === '1', null, { timeout: 30_000 });
  const picker = page.locator('[data-ri-select-org]');
  if (await picker.isVisible().catch(() => false)) {
    await picker.selectOption(STAGING_ORGANISATION_ID);
    await page.locator('[data-ri-apply-org]').click();
  }
}

async function openHash(page, hash) {
  await page.goto(`${LAB}${hash}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await ensureLabReady(page);
}

async function toastMatching(page, pattern) {
  try {
    await page.waitForFunction(
      (source) => new RegExp(source, 'i').test(document.querySelector('#ri-toast')?.innerText || ''),
      pattern,
      { timeout: 12_000 },
    );
  } catch {
    return ((await page.locator('#ri-toast').innerText().catch(() => '')) || 'toast_timeout').trim();
  }
  return (await page.locator('#ri-toast').innerText()).trim();
}

await requireUatPersonas(['A', 'C']);

let riskId = null;
await runAs('A', async ({ page }) => {
  await openHash(page, '#/risks');
  const created = await page.evaluate(async () => {
    const res = await fetch('/api/ri-lab/risks', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `Fresh SoD risk ${new Date().toISOString()}`,
        description: 'Synthetic IN_REVIEW risk for maker-checker browser verification.',
        category: 'Compliance',
        status: 'DRAFT',
        creationMode: 'uat_authorised',
      }),
    });
    const body = await res.json().catch(() => ({}));
    return { http: res.status, id: body.risk?.id || null, error: body.error || body.message || null };
  });
  if (!created.id) {
    record('FRESH-RISK-CREATE', 'FAIL', created);
    return;
  }
  riskId = created.id;
  const submitted = await page.evaluate(async (id) => {
    const res = await fetch(`/api/ri-lab/risks/${id}`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'submit' }),
    });
    const body = await res.json().catch(() => ({}));
    return { http: res.status, status: body.risk?.status || null, error: body.error || body.reason || body.message || null };
  }, riskId);
  record('FRESH-RISK-IN-REVIEW', /in review/i.test(submitted.status || '') ? 'PASS' : 'FAIL', submitted);

  await openHash(page, `#/risk/${riskId}`);
  await page.locator('[data-connected-risk-action="approve"]').click();
  const toast = await toastMatching(page, 'segregation|different authorised|forbidden|failed|approved');
  const after = await page.evaluate(async (id) => {
    const body = await (await fetch(`/api/ri-lab/risks/${id}`, { credentials: 'same-origin' })).json();
    return body.risk?.status || null;
  }, riskId);
  const denied = /segregation|different authorised/i.test(toast) && !/Risk approved/i.test(toast);
  record('FRESH-RISK-SELF-APPROVE-TOAST', denied && /in review/i.test(after || '') ? 'PASS' : 'FAIL', { toast, status: after });
  await page.screenshot({ path: join(OUT, 'maker-self-approve.png') });
});

if (riskId) {
  await runAs('C', async ({ page }) => {
    await openHash(page, `#/risk/${riskId}`);
    await page.locator('[data-connected-risk-action="approve"]').click();
    const toast = await toastMatching(page, 'approved|segregation|failed');
    const after = await page.evaluate(async (id) => {
      const body = await (await fetch(`/api/ri-lab/risks/${id}`, { credentials: 'same-origin' })).json();
      return body.risk?.status || null;
    }, riskId);
    record('FRESH-RISK-CHECKER-APPROVE', /approved/i.test(toast) && /approved/i.test(after || '') ? 'PASS' : 'FAIL', {
      toast,
      status: after,
    });
  });
}

await runAs('A', async ({ page }) => {
  await openHash(page, `#/assurance/${ASSURANCE}`);
  const href = await page.locator('a[href^="#/finding/"]').first().getAttribute('href').catch(() => null);
  record('ASSURANCE-FINDING-LINK', href ? 'PASS' : 'FAIL', { href, assuranceId: ASSURANCE });
});

writeFileSync(join(OUT, 'RESULT.json'), JSON.stringify({ results, riskId }, null, 2));
process.exit(results.some((r) => r.status === 'FAIL') || !results.length ? 1 : 0);
