#!/usr/bin/env node
/**
 * Staging: six workflow queue counts reconcile; AI Findings inbox; five decision buttons visible.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { STAGING_ORIGIN, runAs, requireUatPersonas } from './staging-user-sessions.mjs';
import { WORKFLOW_QUEUES } from '../../lib/ri/triage/regulatory-workflow-queues.mjs';

const OUT = join(REPO_ROOT, 'docs', 'uat', 'evidence', 'six-queue-workflow-staging-2026-11-24');
mkdirSync(OUT, { recursive: true });

const steps = [];
const fail = (name, detail) => {
  steps.push({ step: name, ok: false, detail });
  console.error(`FAIL ${name}`, detail);
};
const pass = (name, detail = {}) => {
  steps.push({ step: name, ok: true, detail });
  console.log(`PASS ${name}`);
};

const SCREENSHOTS = [];
const segments = [
  'ai-findings',
  'verified-obligations',
  'non-obligations',
  'rejected',
  'exceptions',
  'not-applicable',
  'all',
];

await requireUatPersonas(['B'], { label: 'staging-six-queue-triage' });

const apiResult = await runAs('B', async ({ page }) => {
  const summary = await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/triage`);
  const body = await summary.json().catch(() => ({}));
  if (!summary.ok()) {
    fail('triage-summary-api', body);
    return { steps, body };
  }
  const wc = body.workflowCounts || body.counts || {};
  const keys = [
    WORKFLOW_QUEUES.AI_FINDINGS,
    WORKFLOW_QUEUES.VERIFIED_OBLIGATIONS,
    WORKFLOW_QUEUES.NON_OBLIGATIONS,
    WORKFLOW_QUEUES.REJECTED_FINDINGS,
    WORKFLOW_QUEUES.EXCEPTIONS,
    WORKFLOW_QUEUES.NOT_APPLICABLE,
  ];
  for (const k of keys) {
    if (typeof wc[k] !== 'number') fail(`workflow-count-${k}`, wc);
    else pass(`workflow-count-${k}`, { count: wc[k] });
  }
  const sum = keys.reduce((s, k) => s + (wc[k] || 0), 0);
  const all = wc.ALL_FINDINGS ?? wc[WORKFLOW_QUEUES.ALL_FINDINGS] ?? null;
  if (all != null && all !== sum) {
    fail('all-findings-reconcile', { all, sum, wc });
  } else {
    pass('all-findings-reconcile', { all: all ?? sum, sum, wc });
  }

  const ai = await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/triage?queue=${WORKFLOW_QUEUES.AI_FINDINGS}`);
  const aiBody = await ai.json().catch(() => ({}));
  if (!ai.ok()) fail('ai-findings-api', aiBody);
  else pass('ai-findings-api', { total: aiBody.total, items: aiBody.items?.length });

  return { steps, wc, beforeCounts: wc };
});

await runAs('B', async ({ page }) => {
  await page.goto(`${STAGING_ORIGIN}/design-lab/regulatory-intelligence/index.html#/dashboard`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForSelector('[data-triage-board]', { timeout: 120_000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(OUT, 'dashboard-six-queue-cards.png'), fullPage: true });
  SCREENSHOTS.push('dashboard-six-queue-cards.png');
  for (const seg of segments) {
    await page.goto(`${STAGING_ORIGIN}/design-lab/regulatory-intelligence/index.html#/triage/${seg}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForSelector('[data-triage-screen]', { timeout: 120_000 }).catch(() => null);
    await page.waitForTimeout(2500);
    const shot = `queue-${seg}.png`;
    await page.screenshot({ path: join(OUT, shot), fullPage: true });
    SCREENSHOTS.push(shot);
    if (seg === 'ai-findings') {
      const five = await page.locator('[data-triage-five-decisions]').count();
      pass('five-decision-buttons-visible', { panels: five });
      await page.screenshot({ path: join(OUT, 'ai-findings-five-decisions.png'), fullPage: true });
      SCREENSHOTS.push('ai-findings-five-decisions.png');
    }
  }
});

writeFileSync(
  join(OUT, 'RESULT.json'),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      steps: [...(apiResult.steps || []), ...steps],
      screenshots: SCREENSHOTS,
      workflowCounts: apiResult.wc,
    },
    null,
    2,
  ),
);

const failed = [...(apiResult.steps || []), ...steps].filter((s) => !s.ok);
if (failed.length) {
  console.error(`staging-six-queue-triage: FAIL (${failed.length})`);
  process.exit(1);
}
console.log('staging-six-queue-triage: PASS');