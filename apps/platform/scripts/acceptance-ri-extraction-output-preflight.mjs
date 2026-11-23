#!/usr/bin/env node
import {
  assertBatchProvisionOutputBudget,
  assertExtractionOutputBudget,
  estimateStructuredOutputTokens,
  resolveMaxProvisionsPerBatch,
  scaleMaxOutputTokensForBatch,
} from '../lib/ri/ai/extraction-output-preflight.mjs';

delete process.env.RI_LAB_MAX_PROVISIONS_PER_BATCH;

let failed = 0;
const check = (label, ok) => {
  if (!ok) failed += 1;
  console.log(ok ? 'PASS' : 'FAIL', label);
};

const huge = estimateStructuredOutputTokens({ provisionCount: 120, sectionCount: 18 });
const block = assertExtractionOutputBudget({ estimateTokens: huge, maxOutputTokens: 8192 });
check('large batch fails preflight', block.ok === false && block.code === 'extraction_output_preflight_exceeded');

const small = estimateStructuredOutputTokens({ provisionCount: 8, sectionCount: 8 });
const pass = assertExtractionOutputBudget({ estimateTokens: small, maxOutputTokens: 8192 });
check('small batch passes preflight', pass.ok === true);

const scaled = scaleMaxOutputTokensForBatch(8192, { provisionCount: 8, sectionCount: 8 });
check('scaled output cap bounded', scaled >= 2048 && scaled <= 8192);

check('default provision cap is 16', resolveMaxProvisionsPerBatch() === 16);
check('22 provisions blocked', assertBatchProvisionOutputBudget(22, 4, 8192).ok === false);

console.log(failed ? 'FAIL acceptance-ri-extraction-output-preflight' : 'PASS acceptance-ri-extraction-output-preflight');
process.exit(failed ? 1 : 0);