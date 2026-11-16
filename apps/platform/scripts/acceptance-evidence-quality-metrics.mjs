#!/usr/bin/env node
/**
 * Engineering metrics — abstention / partial / answer buckets (not regulatory accuracy).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';
import { classifyPolicyOutcomeBucket } from '../lib/ri/reasoner/evidence-limitation-diagnostic.mjs';

const failures = [];
const integration = JSON.parse(readFileSync(join(REPO_ROOT, 'docs/eval/EVIDENCE-COVERAGE-INTEGRATION-RESULTS.json'), 'utf8'));
const missing = JSON.parse(readFileSync(join(REPO_ROOT, 'docs/eval/EVIDENCE-COVERAGE-MISSING-PROVISION-RESULTS.json'), 'utf8'));
const genuinePath = join(REPO_ROOT, 'docs/eval/GENUINE-PARTIAL-EVIDENCE-RESULTS.json');

const buckets = {
  correct_abstention_missing_source: 0,
  correct_partial: 0,
  partial_other: 0,
  abstention_other: 0,
  full_answer: 0,
  other: 0,
};

const rows = [];
for (const r of integration.results || []) {
  const code = r.evidenceLimitationCode || 'COVERAGE_UNCONFIRMED';
  const bucket = classifyPolicyOutcomeBucket(r.applicationPolicyStatus, code);
  buckets[bucket] = (buckets[bucket] || 0) + 1;
  rows.push({ testId: r.testId, scenario: r.scenario, evidenceCondition: r.evidenceCondition, status: r.applicationPolicyStatus, code, bucket });
}

const b03 = rows.filter((r) => r.testId === 'EVAL-B-03');
const falsePartial = b03.filter(
  (r) => r.scenario === 'PARTIAL' && r.status === 'PARTIAL_ANSWER',
).length;

if (falsePartial > 0) failures.push('EVAL-B-03 must not PARTIAL_ANSWER on missing COBS');

let genuine = null;
try {
  genuine = JSON.parse(readFileSync(genuinePath, 'utf8'));
  if (genuine.result?.policyStatus !== 'PARTIAL_ANSWER') failures.push('genuine partial test not PASS artifact');
} catch {
  failures.push('run acceptance-genuine-partial-evidence.mjs first');
}

const total = rows.length || 1;
const metrics = {
  answerRate: Number(((buckets.full_answer + buckets.correct_partial + buckets.partial_other) / total).toFixed(4)),
  abstentionRate: Number(((buckets.correct_abstention_missing_source + buckets.abstention_other) / total).toFixed(4)),
  falseAbstentionRate: null,
  correctAbstentionMissingSource: buckets.correct_abstention_missing_source,
  correctPartialConfirmed: buckets.correct_partial,
  note: 'falseAbstentionRate requires SME-labelled gold set — independent acceptance only',
};

const out = join(REPO_ROOT, 'docs/eval/EVIDENCE-QUALITY-METRICS.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify(
    {
      schemaVersion: 'forgeniq.evidence-quality-metrics.v1',
      capturedAt: new Date().toISOString(),
      suite: 'engineering_regression_not_independent_acceptance',
      buckets,
      metrics,
      b03Classification: 'MISSING_PRIMARY_HANDBOOK_NOT_GENUINE_PARTIAL',
      rowCount: rows.length,
      failures,
    },
    null,
    2,
  ),
);

console.log(JSON.stringify({ ok: failures.length === 0, out, metrics, failures }, null, 2));
process.exit(failures.length ? 1 : 0);