#!/usr/bin/env node
/**
 * The 17 PS26 operative gaps are deterministic omissions, not live AI recall.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';

const tax = JSON.parse(readFileSync(join(REPO_ROOT, 'docs/eval/FCA-PS26-OUTSTANDING-TAXONOMY-2026-11-23.json'), 'utf8'));
const operative = (tax.provisions || []).filter(
  (p) => p.operativeBinding && p.instrumentClass === 'operative_binding_requirement',
);
let failed = 0;
const check = (l, ok, d) => {
  if (!ok) failed += 1;
  console.log(ok ? 'PASS' : 'FAIL', l, d ? JSON.stringify(d) : '');
};
check('seventeen operative gaps', operative.length === 17, { n: operative.length });
check('none counted as live structured recall', operative.every((p) => p.liveAiStructuredRecall === false));
check('deterministic signal is separate from live recall', operative.every((p) => p.mustNotCountAsUnattendedAiRecall === true));
check('summary does not claim live recall', tax.summary.liveStructuredRecallAmongOutstanding === 0);
if (failed) process.exit(1);
console.log('PASS acceptance-ri-ps26-seventeen-operative-omissions');
