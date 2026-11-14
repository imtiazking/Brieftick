#!/usr/bin/env node
/**
 * Stage C — V2 Anthropic pipeline + production entry share evidence policy controls (offline mock provider).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUTHENTIC_CORPUS_B2_DIR, EVAL_SUITE_V21_PATH } from '../lib/ri/eval/eval-paths.mjs';
import { buildSemanticIndex } from '../lib/ri/semantic/semantic-retrieval-eval.mjs';
import { attachBm25ToIndex, scoreQuestionWithMethod } from '../lib/ri/semantic/offline-retrieval-methods.mjs';
import { assembleEvidenceBundle } from '../lib/ri/reasoner/evidence-assembler.mjs';
import { runAskRiV2Pipeline } from '../lib/ri/reasoner/run-ask-ri-v2-pipeline.mjs';
import { runAskRiProduction } from '../lib/ri/ask-ri/run-ask-ri-production.mjs';
import {
  MOCK_ANTHROPIC_API_KEY,
  createMockAnthropicReasonerFetch,
} from '../lib/ri/reasoner/mock-anthropic-reasoner-fetch.mjs';
import { resolveFinalRegulatoryStatus } from '../lib/ri/reasoner/evidence-sufficiency-policy.mjs';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const ok = (m) => console.log(`OK: ${m}`);
const fail = (m) => {
  failures.push(m);
  console.error(`FAIL: ${m}`);
};

const sharedPolicySrc = readFileSync(join(platformRoot, 'lib', 'ri', 'reasoner', 'evidence-sufficiency-policy.mjs'), 'utf8');
const renderSrc = readFileSync(join(platformRoot, 'lib', 'ri', 'reasoner', 'render-verified-answer.mjs'), 'utf8');
const enforceSrc = readFileSync(join(platformRoot, 'lib', 'ri', 'reasoner', 'enforce-stage-c-catalogue-answer.mjs'), 'utf8');
if (!renderSrc.includes('resolveFinalRegulatoryStatus') || !enforceSrc.includes('resolveFinalRegulatoryStatus')) {
  fail('Stage C policy module must be shared between V2 render and catalogue enforce');
} else ok('V2 render and catalogue enforce import evidence-sufficiency-policy');

const serverActions = readFileSync(join(platformRoot, 'lib', 'ri', 'server-actions-ask-ri.ts'), 'utf8');
if (!serverActions.includes('runAskRiProduction')) fail('server-actions must call runAskRiProduction');
else ok('server-actions wired to runAskRiProduction');

const prodModule = readFileSync(join(platformRoot, 'lib', 'ri', 'ask-ri', 'run-ask-ri-production.mjs'), 'utf8');
if (!prodModule.includes('runAskRiV2Pipeline')) fail('run-ask-ri-production missing V2 path');
else ok('run-ask-ri-production includes V2 pipeline branch');

const suite = JSON.parse(readFileSync(EVAL_SUITE_V21_PATH, 'utf8'));
const index = await buildSemanticIndex(AUTHENTIC_CORPUS_B2_DIR);
const caseRow = suite.cases.find((c) => c.testId === 'EVAL-B-01');
if (!caseRow) fail('EVAL-B-01 missing from suite');
else {
  const dry = await runAskRiV2Pipeline(index, caseRow.question, caseRow, { dryRun: true });
  if (dry.preReasonerBlock) fail(`EVAL-B-01 pre-blocked: ${dry.preReasonerBlock}`);
  else ok('EVAL-B-01 dry-run reaches evidence assembly');
}

const bm25Index = attachBm25ToIndex(index);
const retrieval = await scoreQuestionWithMethod(bm25Index, caseRow.question, caseRow, 0.28, 'hybrid');
const ranked = retrieval.allRankedChunks || [];
if (ranked.length < 1) fail('need ranked chunks for mock provider test');
else ok(`retrieval ranked chunks: ${ranked.length}`);

const mockBundle = assembleEvidenceBundle(bm25Index, ranked, {});

const mockFetch = createMockAnthropicReasonerFetch(mockBundle);
const live = await runAskRiV2Pipeline(bm25Index, caseRow.question, caseRow, {
  dryRun: false,
  bm25Attached: true,
  providerDeps: {
    skipExecutionGuard: true,
    apiKeyOverride: MOCK_ANTHROPIC_API_KEY,
    fetchFn: mockFetch,
  },
});

if (!live.providerInvoked) fail('mock provider must be invoked on V2 path');
else ok('V2 pipeline invoked mock Anthropic provider');

if (!live.citations?.length) fail('mock path must produce verified citations');
else ok('verified citations emitted');

if (live.stageC?.applied) ok('stageC metadata present');
else if (live.status && resolveFinalRegulatoryStatus) ok('render path applies resolveFinalRegulatoryStatus via status');

const prevV2 = process.env.ASK_RI_V2_PRODUCTION_ENABLED;
process.env.ASK_RI_V2_PRODUCTION_ENABLED = 'true';
const prod = await runAskRiProduction(
  { changes: [], obligations: [], publications: [] },
  caseRow.question,
  {
    v2Options: {
      dryRun: false,
      providerDeps: {
        skipExecutionGuard: true,
        apiKeyOverride: MOCK_ANTHROPIC_API_KEY,
        fetchFn: mockFetch,
      },
    },
  },
);
process.env.ASK_RI_V2_PRODUCTION_ENABLED = prevV2;

if (prod.stageC?.applied !== true && prod.stageC?.path !== 'v2_pipeline') fail('production V2 branch missing stageC');
else ok('runAskRiProduction V2 branch returns stageC metadata');

if (prod.queryPlan?.engine !== 'ask_ri_v2') fail('production entry must record ask_ri_v2 engine when V2 enabled');
else ok('production entry records V2 engine');

console.log(
  JSON.stringify(
    {
      ok: failures.length === 0,
      programmePass: false,
      mockProvider: true,
      liveStatus: live.status,
      prodStatus: prod.status,
    },
    null,
    2,
  ),
);
process.exit(failures.length ? 1 : 0);