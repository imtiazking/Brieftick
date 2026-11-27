#!/usr/bin/env node
/**
 * Hosted Ask RI browser baseline — deterministic/fixture-backed (no paid AI).
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const STAGING_ORIGIN = process.env.FORGENIQ_STAGING_ORIGIN || 'https://staging-app.forgeniq.com';
const outDir = process.env.ASK_RI_BASELINE_OUT || join(root, '..', '..', 'docs', 'uat', 'evidence', 'ask-ri-browser-baseline-2026-11-27');

const checks = [];

async function main() {
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: process.env.STAGING_AUTH_STATE });
  const page = await context.newPage();
  await page.goto(`${STAGING_ORIGIN}/ri-lab`, { waitUntil: 'domcontentloaded' });
  await page.goto(`${STAGING_ORIGIN}/ri-lab#/ask-ri`, { waitUntil: 'networkidle' });

  const submitOk = await page.locator('[data-ask-ri-submit], button[type="submit"]').first().isVisible().catch(() => false);
  checks.push({ id: 'ask-ri-ui-visible', ok: submitOk });

  const apiProbe = await page.request.post(`${STAGING_ORIGIN}/api/ri-lab/ask-ri`, {
    data: { question: 'List open obligations' },
    headers: { 'Content-Type': 'application/json' },
  });
  const body = await apiProbe.json().catch(() => ({}));
  checks.push({ id: 'ask-ri-api', ok: apiProbe.status() === 200 && body.ok === true, status: body.status });
  checks.push({
    id: 'ask-ri-tenant-retrieval',
    ok: typeof body.recordCount === 'number' || body.lastAsk?.recordCount != null,
  });

  await browser.close();
  const failed = checks.filter((c) => !c.ok).length;
  const result = { generatedAt: new Date().toISOString(), staging: STAGING_ORIGIN, failed, checks };
  writeFileSync(join(outDir, 'RESULT.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});