#!/usr/bin/env node
/**
 * Live pilot spend vs $2.35 ceiling (before each paid call).
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { runAs, STAGING_ORIGIN } from './staging-user-sessions.mjs';

const CEILING = 2.35;
const OUT = join(REPO_ROOT, 'docs/eval/PILOT-SPEND-RECONCILE-2026-11-23.json');
const KNOWN = [
  '147574c3-229a-42e3-9adb-fd480b905d3b',
  '3872aebf-cdab-4367-8fa9-c5c1ddd0e08e',
  '2c840c0b-0534-4429-a02d-6db8850a3f91',
  '6f05a9eb-8984-4a2b-8b78-2e7effbf8892',
  '038f5ae0-56ed-4961-9d1c-f2953a15e741',
  'd76b60f2-276b-48f2-ab78-fd449bca55b6',
  '9b3bf495-9c55-428f-81bd-d786f8d9a3ee',
  '063a2e9f-8279-4310-9341-354110d5e675',
];

function spendFromOutput(out) {
  return (
    Number(
      out?._forgeniqSpend?.costUsdEstimate ??
        out?._forgeniqLabSpendAudit?.calculatedUsd ??
        out?._forgeniqLabSpendAudit?.actualUsd,
    ) || 0
  );
}

const lines = [];

await runAs('A', async ({ page }) => {
  for (const runId of KNOWN) {
    const run = await (await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/ai-analysis-runs/${runId}`)).json().catch(() => ({}));
    const out = run.detail?.structured_output;
    const status = run.detail?.execution_status || run.aiAnalysisRun?.executionStatus;
    lines.push({ runId, spendUsd: spendFromOutput(out), status, source: 'staging_fetch' });
  }
});

const total = Math.round(lines.reduce((s, x) => s + x.spendUsd, 0) * 1e6) / 1e6;
const remaining = Math.round((CEILING - total) * 1e6) / 1e6;
const payload = {
  generatedAt: new Date().toISOString(),
  cumulativePilotSpendUsd: total,
  absolutePilotCeilingUsd: CEILING,
  userApprovedCeilingUsd: CEILING,
  remainingBeforeCeilingUsd: remaining,
  lineItems: lines,
  mayProceedPaid: remaining > 0.019,
};
writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(JSON.stringify(payload, null, 2));
if (!payload.mayProceedPaid) process.exit(2);