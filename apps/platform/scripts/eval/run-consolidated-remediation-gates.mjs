#!/usr/bin/env node
/** Focused regression gate for consolidated remediation (fast path vs full master). */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const scripts = join(__dir, '..');

const suites = [
  'acceptance-ri-normalize-obligation-output',
  'acceptance-ri-extraction-output-preflight',
  'acceptance-ri-extraction-batch-plan-ps22-gate',
  'acceptance-ri-provision-assessment-completeness',
  'acceptance-ri-provision-source-verification-ps22',
  'acceptance-ri-provision-source-verification-ps26',
  'acceptance-ri-provision-inventory',
  'acceptance-ri-provision-inventory-reconcile',
  'acceptance-ri-ps22-final-reconcile',
  'acceptance-ri-classification-policy-core',
  'acceptance-ri-ps26-five-operative-historical',
  'acceptance-ri-security-db-local-db',
  'acceptance-ri-provision-eligibility-local-db',
  'acceptance-ri-ai-finding-review-service',
  'acceptance-ri-classification-triage-local-db',
  'acceptance-ri-ai-finding-review-local-db',
  'acceptance-ri-role-aware-rls-local-db',
  'acceptance-ri-guards-and-scheduler-local-db',
  'acceptance-ri-lab-ai-analysis-post-guard',
  'acceptance-ri-uc-ri-005-run-idempotency',
  'acceptance-ri-extraction-continuation-batch-index',
  'acceptance-ri-resource-optimisations',
  'acceptance-ri-regulatory-pdf-analysis-ps22',
  'acceptance-ri-ps22-publication-dates',
  'acceptance-ri-ps26-seventeen-operative-omissions',
];

const results = [];
let failed = 0;
const childEnv = { ...process.env };
delete childEnv.RI_LAB_MAX_PROVISIONS_PER_BATCH;
for (const s of suites) {
  const r = spawnSync('node', [join(scripts, `${s}.mjs`)], { encoding: 'utf8', cwd: join(__dir, '..', '..'), env: childEnv });
  const ok = r.status === 0;
  if (!ok) failed += 1;
  results.push({ suite: s, ok, exit: r.status, tail: (r.stdout || r.stderr || '').trim().split('\n').slice(-2).join(' | ') });
}

const report = { generatedAt: new Date().toISOString(), passed: results.filter((x) => x.ok).length, failed, suites: results };
console.log(JSON.stringify(report));
process.exit(failed ? 1 : 0);