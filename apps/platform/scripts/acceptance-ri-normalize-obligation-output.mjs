#!/usr/bin/env node
/**
 * UC-RI-005 normalize + regulatory guards (positive and negative).
 */
import assert from 'node:assert/strict';
import { normalizeAnalysisStructuredOutput } from '../lib/ri/ai/normalize-structured-ai-output.mjs';
import {
  applyObligationCandidateRegulatoryGuard,
  resolvePublicationRegulatoryContext,
} from '../lib/ri/ai/obligation-extraction-regulatory-guard.mjs';
import { parseProvisionReference } from '../lib/ri/classification/provision-eligibility.mjs';

const sectionCatalog = [
  {
    sourceSectionId: 'sec-instrument',
    inLegalInstrument: true,
    provisionsSetOut: ['4.2A.3R'],
    provisionTextStatus: { '4.2A.3R': 'NEW_TEXT' },
  },
  {
    sourceSectionId: 'sec-guidance',
    inLegalInstrument: false,
    provisionsSetOut: [],
  },
];

const instrumentCtx = resolvePublicationRegulatoryContext({
  regulatoryStatus: 'policy_statement',
  isFinalisedGuidance: false,
  consultationPreserved: false,
});

// Positive: unique set-out R rule in quotation → infer ref; model binding retained when instrument section matches.
{
  const structured = {
    confidence: 80,
    candidates: [
      {
        statement: 'Minimum repayment information duty.',
        sourceSectionIds: ['sec-instrument'],
        bindingNature: 'binding_requirement',
        sourceQuotation:
          '4.2A.3 R (1) Before making an agreement, the firm must: (a) give to the customer the information set out in',
      },
    ],
  };
  const { structured: out } = normalizeAnalysisStructuredOutput(structured, 'ObligationExtractionResult', [
    'sec-instrument',
  ], { regulatoryAnalysis: { regulatoryStatus: 'policy_statement' }, sectionCatalog });
  assert.equal(out.candidates[0].provisionReference, 'CONC 4.2A.3R');
  assert.equal(out.candidates[0].bindingNature, 'binding_requirement');
  assert.equal(out.candidates[0]._provisionReferenceInference, 'verified_unique_set_out');
}

// Negative: do NOT remap consultation_proposal → binding on “final instrument” (d545cad defect).
{
  const c = {
    statement: 'CONC 4.2A.3R requires disclosures.',
    sourceSectionIds: ['sec-instrument'],
    bindingNature: 'consultation_proposal',
    sourceQuotation: '4.2A.3 R (1) Before making an agreement, the firm must give information',
    provisionReference: 'CONC 4.2A.3R',
  };
  applyObligationCandidateRegulatoryGuard(c, ['sec-instrument'], sectionCatalog, instrumentCtx);
  assert.equal(c.bindingNature, 'consultation_proposal');
  assert.notEqual(c._bindingNatureRemappedFromConsultation, true);
}

// Negative: finalised guidance must not stay binding_requirement.
{
  const guidanceCtx = resolvePublicationRegulatoryContext({ isFinalisedGuidance: true });
  const c = {
    statement: 'Firms should note CONC 4.2A.3R',
    sourceSectionIds: ['sec-guidance'],
    bindingNature: 'binding_requirement',
    sourceQuotation: 'Firms should consider the rule in CONC 4.2A.3R when designing products.',
    provisionReference: 'CONC 4.2A.3R',
  };
  applyObligationCandidateRegulatoryGuard(c, ['sec-guidance'], sectionCatalog, guidanceCtx);
  assert.equal(c.bindingNature, 'finalised_guidance_expectation');
  assert.equal(c._bindingNatureGuarded, 'must_not_present_as_independent_binding');
}

// Negative: cross-reference only → no provisionReference inference.
{
  const c = {
    statement: 'See CONC 4.2A.6R for post-agreement duties.',
    sourceSectionIds: ['sec-guidance'],
    bindingNature: 'guidance',
    sourceQuotation: 'As set out in CONC 4.2A.6R, firms must provide a copy of the agreement.',
  };
  applyObligationCandidateRegulatoryGuard(c, ['sec-guidance'], sectionCatalog, instrumentCtx);
  assert.equal(c.provisionReference, undefined);
  assert.equal(c._provisionReferenceInference, 'cross_reference_only_not_inferred');
}

// PS22 batch-0: parenthetical provision labels must parse; consultation guards must not upgrade binding.
{
  const consultationCtx = resolvePublicationRegulatoryContext({ consultationPreserved: true });
  const c = {
    statement: 'A firm must act to deliver good outcomes for retail customers.',
    sourceSectionIds: ['sec-instrument'],
    bindingNature: 'binding_requirement',
    sourceQuotation:
      '2.1.1 R The Principles ... 12 Consumer Duty A firm must act to deliver good outcomes for retail customers.',
    provisionReference: 'PRIN 2.1.1R (Principle 12)',
  };
  applyObligationCandidateRegulatoryGuard(c, ['sec-instrument'], sectionCatalog, consultationCtx);
  assert.equal(parseProvisionReference(c.provisionReference)?.core, '2.1.1R');
  assert.equal(c.regulatoryClassificationCode, 'R');
  assert.notEqual(c.bindingNature, 'binding_requirement');
  assert.equal(c._bindingNatureGuarded, 'must_not_present_as_independent_binding');
}

console.log(JSON.stringify({ ok: true, test: 'acceptance-ri-normalize-obligation-output' }));