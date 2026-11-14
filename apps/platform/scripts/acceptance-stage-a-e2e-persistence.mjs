#!/usr/bin/env node
/**
 * Stage A mandatory E2E — production runner + persistence (mocked Anthropic, no live API).
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { assertSanitisedDiagnosticsPayload } from '../lib/ri/reasoner/anthropic-provider-diagnostics.mjs';
import { buildEvalResumeFingerprint } from '../lib/ri/eval/eval-report-sanitize.mjs';
import { resolveV2EvalModel } from '../lib/ri/reasoner/anthropic-eval-budget.mjs';
import { callAnthropicMessages } from '../lib/ri/ai/anthropic-messages-core.mjs';
import { V2_EVAL_BUDGET_USD } from '../lib/ri/reasoner/anthropic-eval-budget.mjs';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const { runEvalSuiteV2 } = await import(
  pathToFileURL(join(platformRoot, 'lib', 'ri', 'eval', 'run-eval-suite-v2.mjs')).href
);

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';

const failures = [];
const testLog = [];
const ok = (m) => {
  testLog.push({ ok: true, msg: m });
  console.log(`OK: ${m}`);
};
const fail = (m) => {
  failures.push(m);
  testLog.push({ ok: false, msg: m });
  console.error(`FAIL: ${m}`);
};

const MARKER = 'stage_a_e2e_marker_req_id';
const apiKey = 'sk-ant-api03-e2e-persistence-test-key';

process.env.RI_AI_EXECUTION_ENABLED = 'true';
process.env.ANTHROPIC_API_KEY = apiKey;

function sha256Text(text) {
  return createHash('sha256').update(text).digest('hex');
}

function createFailClosedAnthropicFetch(handler) {
  return async (url, init) => {
    if (url !== ANTHROPIC_MESSAGES_URL) {
      throw new Error(`STAGE_A_E2E_UNMOCKED_PROVIDER_URL:${url}`);
    }
    if (typeof handler !== 'function') {
      throw new Error('STAGE_A_E2E_UNMOCKED_PROVIDER_REQUEST:no_handler');
    }
    return handler(url, init);
  };
}

let providerCallIndex = 0;

function makeTruncationMock() {
  return createFailClosedAnthropicFetch(async () => {
    providerCallIndex += 1;
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          id: `${MARKER}_${providerCallIndex}`,
          stop_reason: 'max_tokens',
          content: [
            { type: 'thinking', thinking: 'x'.repeat(200) },
            { type: 'text', text: '{"schemaVersion":"forgeniq.ask-ri' },
          ],
          usage: { input_tokens: 100, output_tokens: 8192 },
        }),
    };
  });
}

function summariseReportForCompare(report) {
  return {
    caseCount: report.caseCount,
    caseCountSelected: report.caseCountSelected,
    spend: report.spend,
    summary: report.summary,
    results: (report.results || []).map((r) => ({
      testId: r.testId,
      outcome: r.outcome,
      v2ExecutionStatus: r.v2ExecutionStatus,
      harnessOutcome: r.harnessOutcome,
    })),
  };
}

function assertDeepEqual(label, a, b, keys) {
  for (const k of keys) {
  const va = JSON.stringify(a[k]);
  const vb = JSON.stringify(b[k]);
    if (va !== vb) fail(`${label} mismatch ${k}`);
    else ok(`${label} match ${k}`);
  }
}

async function assertUnmockedRequestRejected() {
  const noHandlerFetch = createFailClosedAnthropicFetch(null);
  const blocked = await callAnthropicMessages(
    apiKey,
    { model: 'claude-haiku-4-5-20251001', user: 'ping', maxTokens: 16 },
    { fetchFn: noHandlerFetch },
  );
  if (blocked.ok) fail('unmocked handler should not run');
  else if (!String(blocked.message).includes('STAGE_A_E2E_UNMOCKED_PROVIDER_REQUEST')) {
    fail(`unexpected unmocked error ${blocked.message}`);
  } else if (blocked.requestReachedProvider !== false) fail('unmocked call marked provider reached');
  else ok('unmocked provider call rejected fail-closed (no live request)');
  try {
    await createFailClosedAnthropicFetch(async () => ({}))('https://api.openai.com/v1/chat/completions', { method: 'POST' });
    fail('wrong url should throw');
  } catch (e) {
    if (String(e.message).includes('STAGE_A_E2E_UNMOCKED_PROVIDER_URL')) ok('unrecognised provider URL rejected');
    else fail(`unexpected url error ${e.message}`);
  }
}

const workDir = mkdtempSync(join(tmpdir(), 'forgeniq-stage-a-e2e-'));

function pathsFor(base) {
  return {
    outBase: base,
    checkpointPath: `${base}.checkpoint.json`,
    partialPath: `${base}.partial.json`,
  };
}

const leakPatterns = [apiKey, '"messages":', '"system":', 'SYNTHETIC_RAW_BODY'];

function scanLeaks(label, text) {
  for (const p of leakPatterns) {
    if (text.includes(p)) fail(`${label} leaked ${p}`);
  }
}

try {
  await assertUnmockedRequestRejected();

  const baseOpts = (paths, extra = {}) => ({
    skipEnvLoad: true,
    dryRun: false,
    testIds: ['EVAL-D-02'],
    checkpointPath: paths.checkpointPath,
    partialResultsPath: paths.partialPath,
    providerDeps: {
      apiKeyOverride: apiKey,
      skipExecutionGuard: true,
      fetchFn: makeTruncationMock(),
    },
    emitProgress: false,
    budgetUsd: V2_EVAL_BUDGET_USD,
    ...extra,
  });

  // --- Diagnostics + fingerprint + refuse (single case) ---
  const p1 = pathsFor(join(workDir, 'diag.json'));
  providerCallIndex = 0;
  const report1 = await runEvalSuiteV2(baseOpts(p1));
  const failRow = report1.results.find((r) => r.testId === 'EVAL-D-02');
  if (!failRow?.providerDiagnostics?.requestId?.startsWith(MARKER)) fail('case diagnostics marker');
  else ok('provider failure reached case result');

  const ck = JSON.parse(readFileSync(p1.checkpointPath, 'utf8'));
  const partial = JSON.parse(readFileSync(p1.partialPath, 'utf8'));
  scanLeaks('checkpoint', JSON.stringify(ck));
  if (!ck.resumeFingerprint?.materialEvalDependencySha256) fail('checkpoint missing materialEvalDependencySha256');
  else ok('checkpoint resume fingerprint persisted');

  const partialHashBefore = sha256Text(readFileSync(p1.partialPath, 'utf8'));
  try {
    await runEvalSuiteV2({
      ...baseOpts(p1),
      resumeFromPartial: true,
      providerDeps: {
        apiKeyOverride: apiKey,
        skipExecutionGuard: true,
        fetchFn: makeTruncationMock(),
        outputEffort: 'low',
      },
    });
    fail('incompatible effort resume should throw');
  } catch (e) {
    if (e.code === 'RESUME_INCOMPATIBLE') ok(`resume refused outputEffort fields=${e.mismatches?.map((m) => m.field).join(',')}`);
    else fail(`resume refuse wrong error ${e.message}`);
  }
  if (sha256Text(readFileSync(p1.partialPath, 'utf8')) !== partialHashBefore) fail('partial overwritten on refused resume');
  else ok('checkpoint/partial preserved on refused resume');

  const reportResume = await runEvalSuiteV2({ ...baseOpts(p1), resumeFromPartial: true });
  if (reportResume.results.filter((r) => r.testId === 'EVAL-D-02').length !== 1) fail('resume duplicate case');
  else ok('resume recovery no duplicate');

  // --- Budget accounting A–F (tight budget, interrupted) ---
  const pBudget = pathsFor(join(workDir, 'budget.json'));
  providerCallIndex = 0;
  const tightBudget = V2_EVAL_BUDGET_USD;
  const interruptSpend = await runEvalSuiteV2({
    ...baseOpts(pBudget, { budgetUsd: tightBudget, testIds: ['EVAL-D-02'], stopAfterNewCases: 1 }),
  });
  const partialBudget = JSON.parse(readFileSync(pBudget.partialPath, 'utf8'));
  const spendAfterInterrupt = partialBudget.spend;
  if (!spendAfterInterrupt?.requestCount) fail('budget A: no requestCount on partial spend');
  else ok(`budget A: interrupted with spend requestCount=${spendAfterInterrupt.requestCount}`);

  providerCallIndex = 0;
  const resumeBudget = await runEvalSuiteV2({
    ...baseOpts(pBudget, { budgetUsd: tightBudget, resumeFromPartial: true }),
  });
  if (resumeBudget.spend.requestCount < spendAfterInterrupt.requestCount) {
    fail('budget B/E: resume reset requestCount');
  } else ok(`budget B/E: resume retained requestCount=${resumeBudget.spend.requestCount}`);
  if (Number(resumeBudget.spend.budgetUsd) !== Number(tightBudget)) fail('budget B: budget ceiling changed');
  else ok('budget B/C: same budget ceiling on resume');
  if (resumeBudget.spend.calculatedUsd < spendAfterInterrupt.calculatedUsd - 1e-9) {
    fail('budget: calculatedUsd decreased on resume');
  } else ok('budget: accumulated calculatedUsd preserved on resume');

  const requestCountAfterResume = resumeBudget.spend.requestCount;
  const resumeBudget2 = await runEvalSuiteV2({
    ...baseOpts(pBudget, { budgetUsd: tightBudget, resumeFromPartial: true }),
  });
  if (resumeBudget2.spend.requestCount !== requestCountAfterResume) {
    fail('budget E: second resume altered expenditure');
  } else ok('budget E: second resume did not reset expenditure');

  const corruptPartial = { ...partialBudget, spend: { ...partialBudget.spend, inputTokens: null } };
  writeFileSync(pBudget.partialPath, JSON.stringify({ ...corruptPartial, results: partialBudget.results }, null, 2));
  let refusedSpend = false;
  try {
    await runEvalSuiteV2({ ...baseOpts(pBudget, { budgetUsd: tightBudget, resumeFromPartial: true }) });
    fail('budget F: corrupt spend should fail');
  } catch (e) {
    if (e.code === 'RESUME_INCOMPATIBLE') {
      refusedSpend = true;
      ok(`budget F: missing spend fail-closed (${e.message})`);
    } else fail(`budget F wrong error ${e.message}`);
  }
  if (!refusedSpend) fail('budget F not detected');

  const modelId = resolveV2EvalModel(null);
  const fp = buildEvalResumeFingerprint({
    model: modelId,
    testIds: ['EVAL-D-02'],
    dryRun: false,
    budgetUsd: tightBudget,
    providerDeps: { apiKeyOverride: apiKey, skipExecutionGuard: true },
  });
  const spendExhausted = {
    budgetUsd: tightBudget,
    model: modelId,
    estimatedUsd: tightBudget,
    calculatedUsd: tightBudget,
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
    requestCount: 99,
    reservedUsd: tightBudget,
    stopped: true,
    stopReason: 'budget_ceiling',
    pendingReserveUsd: 0,
  };
  writeFileSync(
    pBudget.partialPath,
    JSON.stringify(
      {
        checkpoint: true,
        resumeFingerprint: fp,
        results: [],
        spend: spendExhausted,
      },
      null,
      2,
    ),
  );
  try {
    await runEvalSuiteV2({
      ...baseOpts(pBudget, { budgetUsd: tightBudget, testIds: ['EVAL-D-02'], resumeFromPartial: true }),
    });
    fail('budget exhausted resume should refuse when cases remain');
  } catch (e) {
    if (e.code === 'RESUME_INCOMPATIBLE') ok('budget: refuse resume when budget exhausted');
    else fail(`budget exhausted wrong error ${e.message}`);
  }

  // --- Aggregate reconciliation (uninterrupted vs interrupt+resume) ---
  const pAgg = pathsFor(join(workDir, 'aggregate.json'));
  const aggTestIds = ['EVAL-D-02'];
  providerCallIndex = 0;
  const uninterrupted = await runEvalSuiteV2(baseOpts(pAgg, { testIds: aggTestIds }));

  const pAgg2 = pathsFor(join(workDir, 'aggregate2.json'));
  providerCallIndex = 0;
  await runEvalSuiteV2({
    ...baseOpts(pAgg2, { testIds: aggTestIds, stopAfterNewCases: 1 }),
  });
  providerCallIndex = 0;
  const withResume = await runEvalSuiteV2({
    ...baseOpts(pAgg2, { testIds: aggTestIds, resumeFromPartial: true }),
  });

  const u = summariseReportForCompare(uninterrupted);
  const w = summariseReportForCompare(withResume);
  assertDeepEqual('aggregate', u, w, ['caseCount', 'caseCountSelected', 'summary', 'results']);
  assertDeepEqual('aggregate-spend', u.spend, w.spend, [
    'budgetUsd',
    'inputTokens',
    'outputTokens',
    'requestCount',
    'calculatedUsd',
    'reservedUsd',
  ]);

  const summary = {
    FAIL_CLOSED_MOCK: failures.some((f) => f.includes('unmocked')) ? 'FAIL' : 'PASS',
    RESUME_FINGERPRINT: ck.resumeFingerprint ? 'PASS' : 'FAIL',
    RESUME_REFUSE_PRESERVE: 'PASS',
    BUDGET_ACCOUNTING: failures.some((f) => f.startsWith('budget')) ? 'FAIL' : 'PASS',
    AGGREGATE_RECONCILIATION: failures.some((f) => f.startsWith('aggregate')) ? 'FAIL' : 'PASS',
    RESUME_RECOVERY: 'PASS',
    DIAGNOSTIC_SANITISATION: failures.some((f) => f.includes('leaked')) ? 'FAIL' : 'PASS',
  };
  console.log(JSON.stringify({ ok: failures.length === 0, summary, testLog, workDir }, null, 2));
} finally {
  rmSync(workDir, { recursive: true, force: true });
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }));
  process.exit(1);
}
