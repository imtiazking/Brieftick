import { createFreshState } from '../js/migrate.js';
import {
  buildRiEntityCatalog,
  evaluateEntityConstraints,
  resolveFrameworksInQuestion,
} from '../js/ai/ri-entity-catalog.js';
import { askRi, resetProviderCallCount } from '../js/ai/intelligence-ai-service.js';
import { ASK_RI_RESULT_STATES } from '../js/ai/ri-query-executor.js';

const state = createFreshState();
const catalog = buildRiEntityCatalog(state);
let fail = 0;

function pass(label, ok) {
  if (!ok) {
    fail += 1;
    console.log(`FAIL: ${label}`);
  } else {
    console.log(`PASS: ${label}`);
  }
}

const known = [
  { q: 'What does COBS require for suitability?', fw: 'FWK-COBS' },
  { q: 'What does SYSC 8 require?', fw: null },
  { q: 'What does UK CRR require?', fw: 'FWK-UK-CRR' },
];

for (const { q, fw } of known) {
  const ev = evaluateEntityConstraints(state, q);
  const frameworks = resolveFrameworksInQuestion(q, catalog);
  pass(`${q} not false insufficient`, !ev.insufficient);
  if (fw) pass(`${q} resolves framework`, frameworks.some((f) => f.id === fw));
  resetProviderCallCount();
  const r = await askRi(state, q);
  pass(`${q} not INSUFFICIENT_EVIDENCE`, r.retrieval?.resultState !== ASK_RI_RESULT_STATES.INSUFFICIENT_EVIDENCE);
  pass(`${q} zero provider calls`, (r.providerCallCount ?? 0) === 0);
}

const unknown = ['What does OSFI require?', 'What does APRA require?', 'What does FINMA require?', 'What does BaFin require?'];
for (const q of unknown) {
  resetProviderCallCount();
  const r = await askRi(state, q);
  const st = r.retrieval?.resultState;
  pass(
    `${q} blocked safely`,
    (st === ASK_RI_RESULT_STATES.INSUFFICIENT_EVIDENCE || st === ASK_RI_RESULT_STATES.UNRESOLVED_QUERY_SEMANTICS) &&
      (r.retrieval?.matchedRecordIds?.length ?? 0) === 0 &&
      (r.providerCallCount ?? 0) === 0 &&
      st !== ASK_RI_RESULT_STATES.RESOLVED &&
      st !== ASK_RI_RESULT_STATES.ZERO_QUALIFIERS
  );
}

if (fail > 0) process.exit(1);
console.log('Ask RI entity freeze acceptance: PASS');
