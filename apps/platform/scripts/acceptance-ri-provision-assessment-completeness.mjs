#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  assessBatchProvisionCompleteness,
  PROVISION_ASSESSMENT_OUTCOME,
  attachProvisionCompletenessToStructuredOutput,
} from '../lib/ri/ai/provision-assessment-completeness.mjs';

const supplied = ['4.2A.3R', '4.2A.6R', '4.2A.7R'];

const structured = {
  candidates: [
    {
      provisionReference: 'CONC 4.2A.3R',
      statement: 'Disclosure before agreement',
      sourceQuotation: '4.2A.3 R (1) Before making an agreement, the firm must',
    },
  ],
  claims: [],
};

const report = assessBatchProvisionCompleteness({
  suppliedCores: supplied,
  candidates: structured.candidates,
  claims: structured.claims,
  provisionScopedExtraction: {
    excerpts: supplied.map((c) => ({ provisionCore: c, authoritativeExcerpt: `${c} must` })),
  },
});

assert.equal(report.omissionCount, 2);
assert.deepEqual(report.omissionCores.sort(), ['4.2A.6R', '4.2A.7R']);
assert.equal(report.regulatoryAccuracySuccess, false);

const attached = { ...structured };
attachProvisionCompletenessToStructuredOutput(attached, {
  suppliedCores: supplied,
  candidates: structured.candidates,
  claims: [],
});
assert.equal(attached._forgeniqProvisionCompleteness.batchCompletenessOk, false);
assert.equal(
  attached._forgeniqProvisionAssessments.find((a) => a.provisionCore === '4.2A.3R')?.outcome,
  PROVISION_ASSESSMENT_OUTCOME.ASSESSED_STRUCTURED,
);

// JSON-only success must not imply regulatory accuracy
const jsonOnly = assessBatchProvisionCompleteness({
  suppliedCores: ['7.20.3R'],
  candidates: [],
  claims: [],
});
assert.equal(jsonOnly.omissionCount, 1);
assert.equal(jsonOnly.regulatoryAccuracySuccess, false);

console.log(JSON.stringify({ ok: true, test: 'acceptance-ri-provision-assessment-completeness' }));