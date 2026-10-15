import { createFreshState } from '../js/migrate.js';
import { askRi, resetProviderCallCount } from '../js/ai/intelligence-ai-service.js';
import { parseAskQuery } from '../js/ai/ri-retrieval.js';
import { ASK_RI_RESULT_STATES } from '../js/ai/ri-query-executor.js';
import {
  obligationTaxonomyFromRetrieval,
  validateAskRiAnswerAgainstRetrieval,
} from '../js/ai/ask-ri-answer-consistency.js';

const state = createFreshState();
let fail = 0;

function pass(label, ok) {
  if (!ok) {
    fail += 1;
    console.log(`FAIL: ${label}`);
  } else {
    console.log(`PASS: ${label}`);
  }
}

const bankingObligationQs = [
  'Which obligations are linked to Banking changes?',
  'What regulatory changes currently affect the Banking sector, and which obligations are linked?',
];

for (const q of bankingObligationQs) {
  const parsed = parseAskQuery(q, state);
  resetProviderCallCount();
  const r = await askRi(state, q);
  const retrieval = { ...r.retrieval, state };
  const ans = r.analysis?.workflowPayload?.answer || r.analysis?.originalAiOutput?.answer || '';
  const findings = (r.analysis?.workflowPayload?.keyFindings || []).join(' ');
  const tax = obligationTaxonomyFromRetrieval(state, r.retrieval);
  const ec = r.retrieval?.evaluatedCounts || {};
  const primary = parsed.plan?.primaryTargetType;

  pass(`${q} — resolves`, r.ok && !r.insufficient);
  pass(`${q} — not false insufficient`, r.retrieval?.resultState !== ASK_RI_RESULT_STATES.INSUFFICIENT_EVIDENCE);

  if (q.includes(' and which obligations')) {
    pass(`${q} — Change primary`, primary === 'Change');
    pass(`${q} — changes in evidence`, ec.Change?.evaluated && ec.Change.count > 0);
    pass(`${q} — obligations in evidence`, ec.Obligation?.evaluated && ec.Obligation.count > 0);
    pass(
      `${q} — evidence includes Change type`,
      (r.retrieval?.matchedRecordIdsAll || []).some((id) => r.retrieval?.recordTypes?.[id] === 'Change')
    );
  } else {
    pass(`${q} — Obligation primary`, primary === 'Obligation');
    pass(`${q} — no false primary Change in answer`, !/\bprimary\s+Change\s+record/i.test(ans));
  }

  pass(`${q} — OBL-0062 draft taxonomy`, tax.draft === 1 && tax.activeInReview === 4);
  pass(`${q} — draft in findings`, /Draft obligations:\s*1/i.test(findings));
  pass(`${q} — active+in-review not overstated`, !/Active \+ in-review Obligations retrieved:\s*5/i.test(findings));

  const consistency = validateAskRiAnswerAgainstRetrieval(retrieval, r.analysis?.originalAiOutput || {});
  pass(`${q} — answer/retrieval consistency`, consistency.ok);
}

if (fail > 0) process.exit(1);
console.log('Ask RI banking obligations acceptance: PASS');
