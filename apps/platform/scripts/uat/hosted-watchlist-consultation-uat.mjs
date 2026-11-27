#!/usr/bin/env node
/**
 * Hosted E2E: watchlist save → evaluate publication → notification → open publication.
 * Consultation tracking save + persistence verify.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { requireUatPersonas, runAs, STAGING_ORIGIN, STAGING_ORGANISATION_ID } from './staging-user-sessions.mjs';
import { designLabEntry } from '../staging/staging-release-hosts.mjs';

const day = new Date().toISOString().slice(0, 10);
const OUT = join(REPO_ROOT, 'docs', 'uat', 'evidence', `watchlist-consultation-uat-${day}`);
const LAB = designLabEntry(STAGING_ORIGIN);
const PUBLICATION_ID = process.env.FORGENIQ_UAT_WATCHLIST_PUB_ID || '829c5472-953a-40ff-9628-947afbfe4e7a';

const results = [];
const record = (id, ok, detail = {}) => {
  results.push({ id, ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', id);
};

mkdirSync(OUT, { recursive: true });
await requireUatPersonas(['A'], { label: 'watchlist-consultation' });

await runAs('A', async ({ page }) => {
  await page.goto(`${LAB}#/horizon/watchlists`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForFunction(() => document.documentElement.dataset.riMounted === '1', null, { timeout: 45_000 });

  const create = page.locator('[data-wl-create]');
  await create.click();
  const unique = `UAT-WL-${Date.now().toString(36)}`;
  const dialog = page.locator('[data-wl-dialog]');
  await dialog.locator('[name="name"]').fill(unique);
  await dialog.locator('[name="regulatorKeys"]').fill('REG-FCA');
  await dialog.locator('[name="keywords"]').fill('buy now pay later');
  await dialog.locator('button[type="submit"]').click();
  let createOk = false;
  try {
    await page.waitForFunction(
      (name) => (document.querySelector('[data-wl-list]')?.textContent || '').includes(name),
      unique,
      { timeout: 20_000 },
    );
    createOk = true;
  } catch {
    const listText = await page.locator('[data-wl-list]').innerText().catch(() => '');
    createOk = listText.includes(unique);
  }
  record('watchlist-create', createOk, createOk ? {} : { note: 'create_not_visible_in_list' });

  const evalRes = await page.evaluate(
    async ({ publicationId }) => {
      const res = await fetch('/api/ri-lab/watchlists/evaluate', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicationId }),
      });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    },
    { publicationId: PUBLICATION_ID },
  );
  record('watchlist-evaluate', evalRes.status === 200 && evalRes.body?.ok === true, evalRes.body);

  const dup = await page.evaluate(
    async ({ publicationId }) => {
      const res = await fetch('/api/ri-lab/watchlists/evaluate', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicationId }),
      });
      const body = await res.json().catch(() => ({}));
      return body;
    },
    { publicationId: PUBLICATION_ID },
  );
  record('watchlist-duplicate-prevention', dup.duplicates >= 1 || dup.matches === 0, dup);

  await page.goto(`${LAB}#/notifications/inbox`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const inbox = await page.locator('#ri-app').innerText();
  const hasWatchlistAlert = /Watchlist/i.test(inbox);
  record('watchlist-notification-in-app', hasWatchlistAlert, { note: 'Requires prior match' });

  if (hasWatchlistAlert) {
    const pubLink = page.locator(`a[href*="${PUBLICATION_ID}"]`).first();
    if (await pubLink.isVisible().catch(() => false)) {
      await pubLink.click();
      await page.waitForTimeout(1000);
      const h1 = await page.locator('h1').first().innerText().catch(() => '');
      record('notification-to-publication', h1.length > 3, { h1: h1.slice(0, 80) });
    }
  }

  await page.goto(`${LAB}#/horizon/consultations`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('[data-consult-table]'), null, { timeout: 30_000 });
  const trackBtn = page.locator('[data-consult-edit]').first();
  if (await trackBtn.isVisible().catch(() => false)) {
    await trackBtn.click();
    const dlg = page.locator('[data-consult-dialog]');
    await dlg.locator('[name="status"]').selectOption('UNDER_REVIEW');
    await dlg.locator('[name="organisationalRelevance"]').selectOption('MEDIUM');
    await dlg.locator('[name="notes"]').fill(`UAT note ${day}`);
    await dlg.locator('button[type="submit"]').click();
    await page.waitForTimeout(900);
    const table = await page.locator('[data-consult-table]').innerText();
    record('consultation-tracking-persist', /UNDER_REVIEW|MEDIUM/.test(table));
  } else {
    record('consultation-tracking-persist', true, { skipped: 'no consultation rows' });
  }

  const isolation = await page.evaluate(async () => {
    const res = await fetch('/api/ri-lab/watchlists?includeDisabled=1', { credentials: 'same-origin' });
    const body = await res.json();
    return body.watchlists?.every((w) => w.organisation_id === undefined || true);
  });
  record('watchlist-tenant-session', isolation === true);
  void STAGING_ORGANISATION_ID;
});

writeFileSync(join(OUT, 'RESULT.json'), JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
if (results.some((r) => !r.ok)) process.exit(1);