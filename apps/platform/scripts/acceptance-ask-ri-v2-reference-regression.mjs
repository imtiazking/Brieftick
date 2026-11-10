#!/usr/bin/env node
/**
 * Phase 2C.2 — reference validation + pre-reasoner regression (no Anthropic).
 */
import { readFileSync } from 'node:fs';
import { AUTHENTIC_CORPUS_B2_DIR, EVAL_SUITE_V21_PATH } from '../lib/ri/eval/eval-paths.mjs';
import { buildSemanticIndex } from '../lib/ri/semantic/semantic-retrieval-eval.mjs';
import {
  diagnoseExplicitPublicationReferences,
  validateExplicitPublicationReferences,
} from '../lib/ri/semantic/publication-reference-validation.mjs';
import { evaluateSemanticRetrievalAuthorityGate } from '../lib/ri/semantic/semantic-retrieval-authority-gate.mjs';
import { runAskRiV2Pipeline } from '../lib/ri/reasoner/run-ask-ri-v2-pipeline.mjs';
import { v2StructuredOutputCompatibility, V2_DEFAULT_EVAL_MODEL } from '../lib/ri/reasoner/v2-eval-models.mjs';

const failures = [];
const ok = (m) => console.log(`OK: ${m}`);
const fail = (m) => {
  failures.push(m);
  console.error(`FAIL: ${m}`);
};

const suite = JSON.parse(readFileSync(EVAL_SUITE_V21_PATH, 'utf8'));
const byId = (id) => suite.cases.find((c) => c.testId === id);

const index = await buildSemanticIndex(AUTHENTIC_CORPUS_B2_DIR);

function assertRefNotBlocked(testId) {
  const c = byId(testId);
  const ref = validateExplicitPublicationReferences(c.question, index.catalogue, index.indexedPublicationIds);
  const auth = evaluateSemanticRetrievalAuthorityGate(c.question);
  if (ref.blockSemanticSelection) {
    fail(`${testId} ref blocked: ${ref.outcome} ${ref.blockingCondition}`);
    console.error(JSON.stringify(diagnoseExplicitPublicationReferences(c.question, index.catalogue, index.indexedPublicationIds), null, 2));
    return;
  }
  if (auth.blockSemanticSelection) {
    fail(`${testId} authority blocked: ${auth.abstainReason}`);
    return;
  }
  ok(`${testId} ref+authority open`);
}

function assertRefBlocked(testId) {
  const c = byId(testId);
  const ref = validateExplicitPublicationReferences(c.question, index.catalogue, index.indexedPublicationIds);
  if (!ref.blockSemanticSelection) fail(`${testId} must remain blocked by reference validation`);
  else ok(`${testId} ref blocked as expected (${ref.outcome})`);
}

assertRefNotBlocked('EVAL-B-01');
assertRefNotBlocked('EVAL-D-02');
assertRefNotBlocked('EVAL-G-02');
assertRefBlocked('EVAL-I-01');
assertRefBlocked('EVAL-J-03');

for (const id of ['EVAL-B-01', 'EVAL-D-02', 'EVAL-G-02']) {
  const c = byId(id);
  const dry = await runAskRiV2Pipeline(index, c.question, c, { dryRun: true });
  if (dry.preReasonerBlock) fail(`${id} pipeline preReasonerBlock=${dry.preReasonerBlock}`);
  else ok(`${id} pipeline dry-run proceeds`);
}

const b03 = byId('EVAL-B-03');
const b03pipe = await runAskRiV2Pipeline(index, b03.question, b03, { dryRun: true });
if (b03pipe.preReasonerBlock) fail(`EVAL-B-03 must not pre-block (got ${b03pipe.preReasonerBlock})`);
else ok('EVAL-B-03 handbook opens retrieval (insufficient evidence may follow)');

const g04 = byId('EVAL-G-04');
const g04pipe = await runAskRiV2Pipeline(index, g04.question, g04, { dryRun: true });
if (g04pipe.v2ExecutionStatus !== 'BLOCKED_EXPECTED') fail('EVAL-G-04 must be tenant-blocked');
else ok('EVAL-G-04 tenant-blocked before provider');

const prin = validateExplicitPublicationReferences(
  'How does SYSC 7 apply to outsourcing?',
  index.catalogue,
  index.indexedPublicationIds,
);
if (prin.blockSemanticSelection || prin.outcome !== 'handbook_open_retrieval') fail('SYSC handbook generic regression');
else ok('SYSC handbook generic (not publication id)');

const compat = v2StructuredOutputCompatibility(V2_DEFAULT_EVAL_MODEL);
if (!compat.modelId) fail('model compat metadata');
else ok(`structured output compat metadata for ${compat.modelId}`);

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, defaultModel: V2_DEFAULT_EVAL_MODEL }));
