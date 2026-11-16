#!/usr/bin/env node
/**
 * Independent regulatory acceptance — refuses to run without protected store outside repo.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';

const store = process.env.FORGENIQ_INDEPENDENT_EVAL_PATH;
const out = join(REPO_ROOT, 'docs/eval/INDEPENDENT-REGULATORY-ACCEPTANCE-RESULT.json');

if (!store || !existsSync(store)) {
  const msg = {
    schemaVersion: 'forgeniq.independent.regulatory.acceptance.result.v1',
    capturedAt: new Date().toISOString(),
    executed: false,
    reason: 'FORGENIQ_INDEPENDENT_EVAL_PATH unset or missing',
    plan: 'docs/eval/INDEPENDENT-REGULATORY-ACCEPTANCE-PLAN.json',
    regulatoryAccuracyPass: false,
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(msg, null, 2));
  console.log(JSON.stringify({ ok: true, gated: true, executed: false, out }, null, 2));
  process.exit(0);
}

const pack = JSON.parse(readFileSync(store, 'utf8'));
if (!pack.scoringCriteriaFrozenAt) {
  console.error('Independent pack missing scoringCriteriaFrozenAt — freeze criteria before run');
  process.exit(1);
}

writeFileSync(
  out,
  JSON.stringify(
    {
      schemaVersion: 'forgeniq.independent.regulatory.acceptance.result.v1',
      capturedAt: new Date().toISOString(),
      executed: false,
      reason: 'Execution body not authorised in Phase 4 — SME + operator required',
      caseCount: (pack.cases || []).length,
      regulatoryAccuracyPass: false,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ ok: true, executed: false, caseCount: (pack.cases || []).length }, null, 2));