import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createFreshState } from '../js/migrate.js';
import { retrieveRiRecords, parseAskQuery } from '../js/ai/ri-retrieval.js';
import { askRi, resetProviderCallCount, getLastProviderCallCount } from '../js/ai/intelligence-ai-service.js';
import { ASK_RI_RESULT_STATES } from '../js/ai/ri-query-executor.js';
import {
  expectedInterpretability,
  expectedPrimaryIds,
  expectedSecondaryIds,
  expectedTprLinkedChangeIds,
} from './lib/ri-eval-independent.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const set = JSON.parse(readFileSync(join(__dir, 'ask-ri-eval-set.json'), 'utf8'));

function actualPrimary(ret) {
  if (ret.primaryResultIds?.length) return [...new Set(ret.primaryResultIds)].sort();
  const type = ret.requestedTargetType || ret.plan?.primaryTargetType || 'Change';
  const ids = (ret.matchedRecordIdsAll || ret.matchedRecordIds || []).filter((id) => ret.recordTypes[id] === type);
  return [...new Set(ids)].sort();
}

function actualSecondary(ret, type) {
  const ids = (ret.matchedRecordIdsAll || ret.matchedRecordIds || []).filter((id) => ret.recordTypes[id] === type);
  return [...new Set(ids)].sort();
}

function arraysEqual(a, b) {
  if (!a && !b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function classifyQuestion(state, q) {
  const interpretable = expectedInterpretability(q);
  const parsed = parseAskQuery(q.question, state);
  const retrieval = retrieveRiRecords(state, q.question, { parsed });
  const stateActual = retrieval.resultState;

  let failReasons = [];
  const expPrimary = expectedPrimaryIds(state, q);
  const expSecondary = expectedSecondaryIds(state, q);
  const actPrimary = actualPrimary(retrieval);
  const actSecondaryRisk = actualSecondary(retrieval, 'Risk');
  const actSecondaryObl = actualSecondary(retrieval, 'Obligation');

  if (interpretable === 'UNRESOLVED') {
    if (stateActual !== ASK_RI_RESULT_STATES.UNRESOLVED_QUERY_SEMANTICS) {
      failReasons.push(`expected UNRESOLVED_QUERY_SEMANTICS got ${stateActual}`);
    }
    return { classification: failReasons.length ? 'FAIL' : 'HONEST_MISS', stateActual, failReasons };
  }

  if (stateActual === ASK_RI_RESULT_STATES.UNRESOLVED_QUERY_SEMANTICS) {
    return { classification: 'HONEST_MISS', stateActual, failReasons: [] };
  }

  if (stateActual === ASK_RI_RESULT_STATES.INSUFFICIENT_EVIDENCE && interpretable === 'INTERPRETABLE') {
    failReasons.push('false INSUFFICIENT_EVIDENCE for interpretable question');
  }

  if (expPrimary && expPrimary.length > 0 && !arraysEqual(expPrimary, actPrimary)) {
    failReasons.push(`primary mismatch expected ${expPrimary.join(',')} got ${actPrimary.join(',')}`);
  }
  if (expSecondary && q.id === 'Q02' && !arraysEqual(expSecondary, actSecondaryRisk)) {
    failReasons.push(`secondary risk mismatch`);
  }
  if (expSecondary && q.id === 'Q03' && !arraysEqual(expSecondary, actSecondaryObl)) {
    failReasons.push(`secondary obligation mismatch`);
  }

  const evaluatedCounts = retrieval.evaluatedCounts || {};
  for (const [key, meta] of Object.entries(evaluatedCounts)) {
    if (meta?.evaluated === false && meta?.count === 0) {
      failReasons.push(`false zero metadata on ${key}`);
    }
  }

  if (q.id === 'Q03' && Array.isArray(expPrimary) && expPrimary.length === 0) {
    if (stateActual === ASK_RI_RESULT_STATES.ZERO_QUALIFIERS && !failReasons.length) {
      return { classification: 'PASS', stateActual, failReasons: [], expPrimary, expSecondary };
    }
    if (stateActual !== ASK_RI_RESULT_STATES.ZERO_QUALIFIERS) {
      failReasons.push(`seed has no TPR-linked Changes; expected ZERO_QUALIFIERS got ${stateActual}`);
    }
  }

  if (failReasons.length) return { classification: 'FAIL', stateActual, failReasons, expPrimary, expSecondary };
  if (stateActual === ASK_RI_RESULT_STATES.ZERO_QUALIFIERS) {
    return { classification: 'HONEST_MISS', stateActual, failReasons: [], expPrimary, expSecondary };
  }
  return { classification: 'PASS', stateActual, failReasons: [], expPrimary, expSecondary };
}

const state = createFreshState();
let pass = 0;
let honest = 0;
let fail = 0;

console.log('Ask RI honest evaluation (12 questions)\n');

for (const q of set) {
  resetProviderCallCount();
  const result = await askRi(state, q.question);
  const retrieval = result.retrieval || retrieveRiRecords(state, q.question);
  const { classification, stateActual, failReasons, expPrimary, expSecondary } = classifyQuestion(state, q);
  if (classification === 'PASS') pass += 1;
  if (classification === 'HONEST_MISS') honest += 1;
  if (classification === 'FAIL') fail += 1;

  const providerCalls = result.providerCallCount ?? getLastProviderCallCount();
  console.log(`${q.id}: ${classification}`);
  console.log(`  QUESTION: ${q.question}`);
  console.log(`  EXPECTED INTERPRETABILITY: ${expectedInterpretability(q)}`);
  console.log(`  STATE: ${stateActual}`);
  console.log(`  INTERPRETED AS: ${retrieval.interpretedAs || '—'}`);
  if (q.id === 'Q03') {
    console.log(`  EXPECTED TPR-LINKED CHANGE IDS (raw): ${JSON.stringify(expectedTprLinkedChangeIds(state))}`);
    console.log(`  EXPECTED OBLIGATION IDS (raw): ${JSON.stringify(expSecondary || [])}`);
  }
  if (expPrimary) console.log(`  EXPECTED PRIMARY IDS: ${expPrimary.join(',') || '(none)'}`);
  console.log(`  PROVIDER CALLS: ${providerCalls}`);
  if (failReasons.length) console.log(`  FAIL REASONS: ${failReasons.join('; ')}`);
  console.log('');
}

console.log(`ANSWERED CORRECTLY: ${pass} / 12`);
console.log(`HONEST MISSES: ${honest} / 12`);
console.log(`FAILURES: ${fail} / 12`);

if (fail > 0) process.exit(1);
