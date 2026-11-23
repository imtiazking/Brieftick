#!/usr/bin/env node
/**
 * UC-RI-005 normalize: infer provisionReference + final-PS binding remap.
 */
import assert from 'node:assert/strict';
import { normalizeAnalysisStructuredOutput } from '../lib/ri/ai/normalize-structured-ai-output.mjs';

const allowed = new Set(['sec-a']);

const structured = {
  confidence: 80,
  candidates: [
    {
      statement: 'Firms must comply with CONC 4.2A.3R regarding minimum repayments.',
      sourceSectionIds: ['sec-a'],
      bindingNature: 'consultation_proposal',
      sourceQuotation: 'A firm must ensure the minimum repayment amount under CONC 4.2A.3R',
    },
  ],
};

const { structured: out, claims } = normalizeAnalysisStructuredOutput(
  structured,
  'ObligationExtractionResult',
  [...allowed],
  { isFinalisedGuidance: true },
);

assert.equal(out.candidates[0].provisionReference, 'CONC 4.2A.3R');
assert.equal(out.candidates[0].bindingNature, 'binding_requirement');
assert.equal(out.candidates[0]._bindingNatureRemappedFromConsultation, true);
assert.equal(claims.length, 1);
assert.equal(claims[0].provisionReference, 'CONC 4.2A.3R');

console.log(JSON.stringify({ ok: true, test: 'acceptance-ri-normalize-obligation-output' }));