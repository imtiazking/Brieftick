#!/usr/bin/env node
/**
 * Harness safeguards and scorer regression checks (offline only).
 */
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  assertBaselineWriteAllowed,
  isProtectedBaselinePath,
  PROTECTED_HISTORICAL_BASELINES,
  sha256File,
  verifyProtectedBaselineHashes,
} from '../lib/ri/eval/baseline-protection.mjs';
import { scoreEvalCase } from '../lib/ri/eval/score-eval-case.mjs';
import { REPO_ROOT, BASELINE_DIR } from '../lib/ri/eval/eval-paths.mjs';

const failures = [];

function fail(msg) {
  failures.push(msg);
  console.error(`FAIL: ${msg}`);
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

const protectedHashes = {};
for (const p of PROTECTED_HISTORICAL_BASELINES) {
  if (existsSync(p)) protectedHashes[p] = sha256File(p);
}

for (const p of PROTECTED_HISTORICAL_BASELINES) {
  if (!isProtectedBaselinePath(p)) fail(`protected path not recognised: ${p}`);
  else ok(`protected baseline registered: ${p}`);
}

const blocked = assertBaselineWriteAllowed({
  outPath: PROTECTED_HISTORICAL_BASELINES[0],
  force: true,
});
if (blocked.ok) fail('--force must not allow protected overwrite');
else ok('protected baseline blocked even with --force');

const tmpExisting = join(BASELINE_DIR, '__eval_write_test__.json');
writeFileSync(tmpExisting, '{}');
const noForce = assertBaselineWriteAllowed({ outPath: tmpExisting, force: false });
if (noForce.ok) fail('existing output should require --force');
else ok('existing non-protected output blocked without --force');
unlinkSync(tmpExisting);

const withForce = assertBaselineWriteAllowed({ outPath: tmpExisting, force: true });
if (!withForce.ok) fail('non-protected should allow --force on new file');
else ok('non-protected new path allowed');

const harness = join(REPO_ROOT, 'apps/platform/scripts/run-ask-ri-eval-suite.mjs');
const blockRun = spawnSync(
  process.execPath,
  [harness, `--out=${PROTECTED_HISTORICAL_BASELINES[0]}`, '--quiet', '--force'],
  { encoding: 'utf8' },
);
if (blockRun.status === 0) fail('harness must exit non-zero when targeting protected baseline');
else ok('harness rejects protected --out even with --force');

const v21Suite = join(REPO_ROOT, 'docs/eval/ask-ri-v2-eval-suite-v2.1.json');
const suiteDoc = JSON.parse(readFileSync(v21Suite, 'utf8'));

function caseById(id) {
  return suiteDoc.cases.find((c) => c.testId === id);
}

function mockEngine({ testId, answer, status, citations, execution }) {
  return {
    status,
    answer,
    citations: citations || [],
    execution: execution || { evidenceSource: 'html_article_v2', evidenceSources: ['html_article_v2'] },
  };
}

// EVAL-C-01: retrieval without control-impact themes must not PASS
{
  const row = caseById('EVAL-C-01');
  const engine = mockEngine({
    testId: 'EVAL-C-01',
    status: 'ANSWERED',
    answer: 'CP26/38 is a consultation proposing updates to the Financial Crime Guide.',
    citations: [{ publicationId: '4d05b49b-a4a4-4101-8c87-7d3983315f25' }, { publicationId: '4d05b49b-a4a4-4101-8c87-7d3983315f25' }],
  });
  const scored = scoreEvalCase(row, engine, { simulateCatalogueAttach: true, evidenceAvailable: true });
  if (scored.outcome === 'PASS') fail('EVAL-C-01 mock must not PASS without control-impact themes');
  else ok(`EVAL-C-01 mock outcome=${scored.outcome} missingThemes=${scored.themeCoverage.themesMissing.length}`);
}

// EVAL-G-04: catalogue-only must not RETRIEVAL_PASS as fusion complete
{
  const row = caseById('EVAL-G-04');
  const engine = mockEngine({
    testId: 'EVAL-G-04',
    status: 'ANSWERED',
    answer: 'CP26/38 consultation cites financial crime updates.',
    citations: [{ publicationId: '4d05b49b-a4a4-4101-8c87-7d3983315f25' }, { publicationId: '4d05b49b-a4a4-4101-8c87-7d3983315f25' }],
    execution: { evidenceSource: 'html_article_v2', evidenceSources: ['html_article_v2'] },
  });
  const scored = scoreEvalCase(row, engine, { simulateCatalogueAttach: true, evidenceAvailable: true });
  if (scored.outcome === 'PASS' || scored.outcome === 'RETRIEVAL_PASS') {
    fail('EVAL-G-04 mock must not PASS/RETRIEVAL_PASS without tenant fusion');
  } else ok(`EVAL-G-04 mock outcome=${scored.outcome} fusion=${scored.catalogueTenantFusion.fusionSatisfied}`);
}

// EVAL-J-03: substantive ANSWERED with citations must FAIL
{
  const row = caseById('EVAL-J-03');
  const engine = mockEngine({
    testId: 'EVAL-J-03',
    status: 'ANSWERED',
    answer: 'FG22 fair value guidance explains outcomes monitoring with extended narrative content.',
    citations: [{ publicationId: 'a761cacc-8742-493d-b200-eb5d9a3ab884' }, { publicationId: 'a761cacc-8742-493d-b200-eb5d9a3ab884' }],
    execution: { evidenceSource: 'pdf_primary_v1', evidenceSources: ['pdf_primary_v1'] },
  });
  const scored = scoreEvalCase(row, engine, { simulateCatalogueAttach: true, evidenceAvailable: true });
  if (scored.outcome !== 'FAIL') fail(`EVAL-J-03 mock expected FAIL got ${scored.outcome}`);
  else ok('EVAL-J-03 mock FAIL on unsupported substantive answer');
}

for (const p of PROTECTED_HISTORICAL_BASELINES) {
  if (!existsSync(p)) continue;
  const now = sha256File(p);
  if (protectedHashes[p] && now !== protectedHashes[p]) fail(`protected baseline hash changed: ${p}`);
  else ok(`hash stable: ${p}`);
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, checks: 'acceptance-ask-ri-eval-harness' }));
