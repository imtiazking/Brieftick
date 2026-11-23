#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';

const OUT = join(REPO_ROOT, 'docs', 'eval', 'PILOT-SPEND-RECONCILE-2026-11-23.json');
const forensic = JSON.parse(readFileSync(join(REPO_ROOT, 'docs/eval/PS22-9-FAILED-RUNS-FORENSIC-2026-11-23.json'), 'utf8'));
const accuracy = JSON.parse(readFileSync(join(REPO_ROOT, 'docs/eval/FCA-EXTRACTION-ACCURACY-BENCHMARK-2026-11-23.json'), 'utf8'));

const lines = [];
for (const r of forensic.runs || []) {
  lines.push({ runId: r.runId, spendUsd: r.spendUsd, status: 'FAILED', source: 'PS22-9-FAILED-RUNS-FORENSIC' });
}
lines.push({
  label: 'PS26/1 batches 0-1 (provider audit in benchmark harness)',
  spendUsd: accuracy.actualSpendUsdFromProviderAudit,
  status: 'COMPLETED',
  source: 'FCA-EXTRACTION-ACCURACY-BENCHMARK',
});

const total = lines.reduce((s, x) => s + (Number(x.spendUsd) || 0), 0);
const payload = {
  generatedAt: new Date().toISOString(),
  cumulativePilotSpendUsd: Math.round(total * 1e6) / 1e6,
  priorEstimateUsd: 0.52,
  reconciledAgainst: 'provider audit fields on staging ai-analysis-runs + benchmark harness',
  absolutePilotCeilingUsd: 2.35,
  remainingBeforeCeilingUsd: Math.round((2.35 - total) * 1e6) / 1e6,
  lineItems: lines,
};
writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(JSON.stringify(payload, null, 2));