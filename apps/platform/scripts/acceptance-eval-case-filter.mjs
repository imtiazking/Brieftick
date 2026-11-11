#!/usr/bin/env node
/**
 * Eval case filter — offline only (dry-run suite, no provider).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { EVAL_SUITE_V21_PATH } from '../lib/ri/eval/eval-paths.mjs';

const evalDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'ri', 'eval');
const { selectRunnableCases } = await import(pathToFileURL(join(evalDir, 'validate-eval-suite.mjs')).href);
const { buildPublicEvalAllowlist } = await import(
  pathToFileURL(join(evalDir, '..', 'reasoner', 'public-question-eligibility.mjs')).href
);
const { validateEvalCaseFilter, parseTestIdsArg } = await import(
  pathToFileURL(join(evalDir, 'eval-case-filter.mjs')).href
);
const { runEvalSuiteV2 } = await import(pathToFileURL(join(evalDir, 'run-eval-suite-v2.mjs')).href);

const failures = [];
const ok = (m) => console.log(`OK: ${m}`);
const fail = (m) => {
  failures.push(m);
  console.error(`FAIL: ${m}`);
};

const suite = JSON.parse(readFileSync(EVAL_SUITE_V21_PATH, 'utf8'));
const runnable = selectRunnableCases(suite, { includeOperatorHeldOut: false });
const allowlist = buildPublicEvalAllowlist(runnable);

const ids = parseTestIdsArg('EVAL-D-02,EVAL-C-01');
const picked = validateEvalCaseFilter(runnable, allowlist, { testIds: ids });
if (picked.ok && picked.filtered.length === 2) ok('test-ids filter selects two cases');
else fail('test-ids filter');

const pub = validateEvalCaseFilter(runnable, allowlist, { publicProviderOnly: true });
if (pub.ok && pub.filtered.length === allowlist.allowedTestIds.length) {
  ok(`public-provider-only selects ${pub.filtered.length} allowlisted cases`);
} else fail('public-provider-only count');

const bad = validateEvalCaseFilter(runnable, allowlist, { testIds: ['EVAL-NOPE'] });
if (!bad.ok && bad.errors.some((e) => e.includes('unknown'))) ok('rejects unknown test id');
else fail('unknown id rejection');

const dry = await runEvalSuiteV2({
  dryRun: true,
  skipEnvLoad: true,
  testIds: ['EVAL-D-02'],
});
if (dry.caseCount === 1 && dry.caseCountSelected === 1) ok('dry-run executes filtered single case');
else fail(`dry-run filter count ${dry.caseCount}`);

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, passed: 5 }));
