#!/usr/bin/env node
/**
 * Hosted obligation triage verification UI evidence (read-only).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { runAs, STAGING_ORIGIN } from '../uat/staging-user-sessions.mjs';

const LAB = `${STAGING_ORIGIN}/design-lab/regulatory-intelligence/index.html#/triage/obligations`;
const OUT = join(REPO_ROOT, 'docs', 'uat', 'evidence', 'triage-verification-2026-11-24');
mkdirSync(OUT, { recursive: true });

const hosted = await runAs('B', async ({ page }) => {
  page.setDefaultTimeout(120_000);
  const api = await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/triage?queue=OBLIGATION_TRIAGE`);
  const apiBody = await api.json().catch(() => null);
  await page.goto(LAB, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => {
      const filters = document.querySelector('[data-triage-verification-filters]');
      const badge = document.querySelector('.ri-triage-status-badge');
      return filters && filters.children.length > 0 && badge;
    },
    { timeout: 90_000 },
  );
  await page.screenshot({ path: join(OUT, 'obligation-triage-badges-and-filters.png'), fullPage: true });

  const verifiedBtn = page.locator('[data-triage-view-verification]').first();
  if (await verifiedBtn.count()) {
    await verifiedBtn.click();
    await page.waitForSelector('[data-triage-detail-dialog][open], dialog[data-triage-detail-dialog]:modal', {
      timeout: 15_000,
    }).catch(() => {});
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(OUT, 'verification-record-dialog.png'), fullPage: true });
  }

  const snap = await page.evaluate(() => ({
    filters: [...document.querySelectorAll('[data-triage-verification-filter]')].map((el) => el.textContent?.trim()),
    approvalFilters: [...document.querySelectorAll('[data-triage-approval-filter]')].map((el) => el.textContent?.trim()),
    badgeSample: document.querySelector('.ri-triage-status-badge')?.textContent?.trim(),
    headers: [...document.querySelectorAll('.ri-table thead th')].map((th) => th.textContent?.trim()),
  }));

  return { apiStatus: api.status, apiBody: apiBody ? {
    verificationCounts: apiBody.verificationCounts,
    approvalCounts: apiBody.approvalCounts,
    sample: (apiBody.items || []).slice(0, 3).map((i) => ({
      humanVerification: i.humanVerification,
      approvalStatus: i.approvalStatus,
      hasVerificationRecord: Boolean(i.verificationRecord),
    })),
  } : null, snap };
});

const report = {
  generatedAt: new Date().toISOString(),
  url: LAB,
  ...hosted,
};
writeFileSync(join(OUT, 'TRIAGE-VERIFICATION-EVIDENCE.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: true, out: OUT, verificationCounts: hosted.apiBody?.verificationCounts }, null, 2));