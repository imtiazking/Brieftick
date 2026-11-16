#!/usr/bin/env node
/**
 * Evidence-grounded reasoning — dispatches to policy unit + coverage integration (no manual KNOWN).
 */
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { EVAL_SUITE_V21_PATH, AUTHENTIC_CORPUS_B2_DIR } from '../lib/ri/eval/eval-paths.mjs';
import { buildSemanticIndex } from '../lib/ri/semantic/semantic-retrieval-eval.mjs';
import { runEvidenceGroundedScenario } from '../lib/ri/eval/run-evidence-grounded-scenario.mjs';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

for (const script of ['acceptance-evidence-coverage-policy-unit.mjs', 'acceptance-evidence-coverage-integration.mjs']) {
  const r = spawnSync(process.execPath, [join(platformRoot, 'scripts', script)], {
    cwd: platformRoot,
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    failures.push(`${script} failed`);
    console.error(r.stderr?.slice(0, 1500));
  }
}

const suite = JSON.parse(readFileSync(EVAL_SUITE_V21_PATH, 'utf8'));
const index = await buildSemanticIndex(AUTHENTIC_CORPUS_B2_DIR);
const pilots = ['EVAL-B-01', 'EVAL-D-02', 'EVAL-C-02'].map((id) => suite.cases.find((c) => c.testId === id));

for (const caseRow of pilots) {
  const sufficient = await runEvidenceGroundedScenario(index, caseRow, 'SUFFICIENT');
  if (sufficient.coverageReasons?.some((x) => x.includes('not_in_suite'))) {
    failures.push(`${caseRow.testId} unexpected NOT_IN_SUITE`);
  }
  console.log(
    `Pilot ${caseRow.testId} SUFFICIENT: coverage=${sufficient.questionCoverage} policy=${sufficient.applicationPolicyStatus} scorer=${sufficient.scorerOutcome}`,
  );
}

console.log(JSON.stringify({ ok: failures.length === 0, programmePass: false, failures }, null, 2));
process.exit(failures.length ? 1 : 0);