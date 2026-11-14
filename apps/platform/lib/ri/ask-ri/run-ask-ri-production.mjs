/**
 * Unified production Ask RI entry — deterministic path + optional V2 reasoner (offline/mock by default).
 */
import { runAskRiDeterministic } from './run-ask-ri.mjs';

/**
 * @param {Record<string, unknown>} state
 * @param {string} question
 * @param {{ v2Options?: Record<string, unknown> }} [opts]
 */
export async function runAskRiProduction(state, question, opts = {}) {
  const v2Enabled = process.env.ASK_RI_V2_PRODUCTION_ENABLED === 'true';
  if (!v2Enabled) {
    return runAskRiDeterministic(state, question);
  }

  const { buildSemanticIndex } = await import('../semantic/semantic-retrieval-eval.mjs');
  const { AUTHENTIC_CORPUS_B2_DIR } = await import('../eval/eval-paths.mjs');
  const { runAskRiV2Pipeline } = await import('../reasoner/run-ask-ri-v2-pipeline.mjs');
  const { readFileSync } = await import('node:fs');
  const { EVAL_SUITE_V21_PATH } = await import('../eval/eval-paths.mjs');

  const index = await buildSemanticIndex(AUTHENTIC_CORPUS_B2_DIR);
  const suite = JSON.parse(readFileSync(EVAL_SUITE_V21_PATH, 'utf8'));
  const caseRow = suite.cases.find((c) => c.question === question) || {
    testId: 'PRODUCTION_ADHOC',
    question,
    questionCategory: 'J',
  };

  const providerDeps = {
    ...(opts.v2Options?.providerDeps || {}),
    skipExecutionGuard: true,
    fetchFn: opts.v2Options?.providerDeps?.fetchFn || null,
  };

  const dryRun = opts.v2Options?.dryRun !== false && !opts.v2Options?.providerDeps?.fetchFn;

  const v2 = await runAskRiV2Pipeline(index, question, caseRow, {
    dryRun,
    providerDeps,
    ...opts.v2Options,
  });

  return {
    question,
    interpretedAs: v2.eligibility?.classification || 'PUBLIC_REGULATORY_QUESTION',
    status: v2.status,
    answer: v2.answer,
    citations: v2.citations || [],
    records: [],
    recordCount: 0,
    queryPlan: { engine: 'ask_ri_v2', v2ExecutionStatus: v2.v2ExecutionStatus },
    execution: {
      ...(v2.execution || {}),
      engine: 'ask_ri_v2',
      stageC: {
        applied: true,
        renderedStatus: v2.status,
        sufficiency: v2.sufficiency,
        humanReviewRequired: v2.humanReviewRequired,
      },
    },
    stageC: { applied: true, path: 'v2_pipeline' },
    v2,
  };
}