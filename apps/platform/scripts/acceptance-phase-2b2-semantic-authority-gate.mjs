#!/usr/bin/env node
import { evaluateSemanticRetrievalAuthorityGate } from '../lib/ri/semantic/semantic-retrieval-authority-gate.mjs';

function assert(name, cond, detail) {
  if (!cond) {
    console.error('FAIL:', name, detail || '');
    process.exit(1);
  }
  console.log('PASS:', name);
}

const fda = evaluateSemanticRetrievalAuthorityGate(
  'What are FDA adverse event reporting timelines for medical devices?',
);
assert('FDA question blocks semantic', fda.blockSemanticSelection === true, fda);

const basel = evaluateSemanticRetrievalAuthorityGate('Explain Basel III output floor requirements for UK banks.');
assert('Basel-as-authority blocks without FCA', basel.blockSemanticSelection === true, basel);

const fcaBasel = evaluateSemanticRetrievalAuthorityGate(
  'How does FCA finalised guidance discuss Basel capital principles for UK banks?',
);
assert('FCA + Basel discussion allowed', fcaBasel.blockSemanticSelection === false, fcaBasel);

const fairValue = evaluateSemanticRetrievalAuthorityGate(
  'How does the FCA expect firms to monitor customer outcomes for fair value?',
);
assert('FCA fair value allowed', fairValue.blockSemanticSelection === false, fairValue);

console.log(JSON.stringify({ ok: true, acceptance: 'phase-2b2-semantic-authority-gate' }));
