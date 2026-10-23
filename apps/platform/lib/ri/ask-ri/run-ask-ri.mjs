/**
 * Production Ask RI — deterministic plan + execution (ported Design Lab semantics).
 */
import { parseAskQuery, retrieveRiRecords } from './port/ai/ri-retrieval.js';
import { ASK_RI_RESULT_STATES } from './port/ai/ri-query-executor.js';
import { buildInterpretedAsPlainEnglish } from './port/ai/ri-interpreted-as.js';

export { ASK_RI_RESULT_STATES };

function mapStatus(resultState) {
  if (resultState === ASK_RI_RESULT_STATES.UNRESOLVED_QUERY_SEMANTICS) return 'UNRESOLVED';
  if (resultState === ASK_RI_RESULT_STATES.INSUFFICIENT_EVIDENCE) return 'INSUFFICIENT_EVIDENCE';
  if (resultState === ASK_RI_RESULT_STATES.ZERO_QUALIFIERS) return 'ZERO_RESULTS';
  if (resultState === ASK_RI_RESULT_STATES.RESOLVED) return 'ANSWERED';
  return 'FAILED';
}

function deterministicAnswer(retrieval) {
  const primary = retrieval.requestedTargetType || retrieval.plan?.primaryTargetType || 'Record';
  const count = retrieval.primaryResultCount ?? retrieval.matchedRecordIds?.length ?? 0;
  const ids = (retrieval.primaryResultIds || retrieval.matchedRecordIds || []).slice(0, 20);
  if (retrieval.resultState === ASK_RI_RESULT_STATES.ZERO_QUALIFIERS) {
    return `No matching ${primary} records were found in your organisation's RI data.`;
  }
  if (count === 0) {
    return `No qualifying ${primary} records matched the interpreted query.`;
  }
  return `Found ${count} ${primary} record(s) matching the verified query plan${ids.length ? `: ${ids.join(', ')}` : ''}.`;
}

export function runAskRiDeterministic(state, question) {
  const parsed = parseAskQuery(question, state);
  const retrieval = retrieveRiRecords(state, question, { parsed });
  const status = mapStatus(retrieval.resultState);
  const interpretedAs =
    retrieval.interpretedAs ||
    buildInterpretedAsPlainEnglish(parsed.plan, parsed.filters, retrieval.resultState, {
      asOfDate: state.asOfDate,
    });

  const records = (retrieval.matchedRecordIdsAll || retrieval.matchedRecordIds || []).map((id) => ({
    id,
    type: retrieval.recordTypes?.[id] || 'Unknown',
    reason: retrieval.matchReasons?.[id] || null,
  }));

  return {
    question,
    interpretedAs,
    status,
    answer: deterministicAnswer(retrieval),
    records,
    recordCount: records.length,
    citations: retrieval.citations || [],
    evidence: retrieval.evidenceIds || [],
    queryPlan: parsed.plan,
    execution: {
      resultState: retrieval.resultState,
      evaluatedCounts: retrieval.evaluatedCounts || {},
      primaryResultCount: retrieval.primaryResultCount,
      providerUsed: false,
    },
    retrieval,
  };
}
