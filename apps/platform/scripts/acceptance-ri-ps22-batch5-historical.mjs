#!/usr/bin/env node
/**
 * Deterministic regression for PS22 batch 5 failure (9fd62178) — no paid provider call.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';
import {
  assertBatchProvisionOutputBudget,
  resolveMaxProvisionsPerBatch,
} from '../lib/ri/ai/extraction-output-preflight.mjs';
import { assessBatchProvisionCompleteness } from '../lib/ri/ai/provision-assessment-completeness.mjs';

const FIXTURE = join(REPO_ROOT, 'docs/eval/fixtures/ps22-batch5-run-9fd62178-forensic.json');
const raw = JSON.parse(readFileSync(FIXTURE, 'utf8'));
const supplied = raw.instrumentProvisionsNewlySupplied;

let failed = 0;
const check = (label, ok, detail) => {
  if (!ok) failed += 1;
  console.log(ok ? 'PASS' : 'FAIL', label, detail ? JSON.stringify(detail) : '');
};

const cap = resolveMaxProvisionsPerBatch();
check('historical batch provision count exceeds live cap', supplied.length > cap, {
  supplied: supplied.length,
  cap,
});
const blocked = assertBatchProvisionOutputBudget(supplied.length, 4, 8192);
check(
  '22-provision shape blocked by output budget gate',
  blocked.ok === false &&
    (blocked.code === 'extraction_batch_provision_cap_exceeded' ||
      blocked.code === 'extraction_output_preflight_exceeded'),
  blocked,
);
const allowed = assertBatchProvisionOutputBudget(16, 4, 8192);
check('16-provision shape allowed', allowed.ok === true, allowed);

const completeness = assessBatchProvisionCompleteness({
  suppliedCores: supplied,
  candidates: raw.structuredOutput.candidates,
  claims: raw.structuredOutput.claims,
});
check('truncated output yields explicit omissions', completeness.omissionCount === supplied.length, {
  omissions: completeness.omissionCount,
});
check('15.7.24R flagged for exception review', completeness.assessments.some(
  (a) => a.provisionCore === '15.7.24R' && a.requiresExceptionReview === true && a.outcome === 'omitted',
));
check('every supplied core has assessment row', completeness.assessments.length === supplied.length);

console.log(failed ? '\nFAIL acceptance-ri-ps22-batch5-historical\n' : '\nPASS acceptance-ri-ps22-batch5-historical\n');
process.exit(failed ? 1 : 0);