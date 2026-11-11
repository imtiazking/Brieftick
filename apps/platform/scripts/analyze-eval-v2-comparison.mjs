#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const LIVE = join(ROOT, 'docs/eval/runs/phase-2c2-ask-ri-v2-eval-live-claude-haiku-5-5-2026-11-10T22-17-34-994Z.json');
const BASE = join(ROOT, 'docs/eval/baseline/deterministic-v2.1-r2-2026-11-10.json');
const PRIOR = join(ROOT, 'docs/eval/runs/phase-2c2-ask-ri-v2-eval-live-claude-haiku-5-5-2026-11-10T20-34-11-382Z.json');

const live = JSON.parse(readFileSync(LIVE, 'utf8'));
const base = JSON.parse(readFileSync(BASE, 'utf8'));
const baseMap = new Map(base.results.map((r) => [r.testId, r]));
let prior = null;
try {
  prior = JSON.parse(readFileSync(PRIOR, 'utf8'));
} catch {}

const results = live.results || [];
const category = (id) => (id && id.includes('-') ? id.split('-')[1] : '?');

function pct(n, d) {
  return d ? Number(((n / d) * 100).toFixed(1)) : 0;
}

function latencyStats(rows) {
  const ms = rows.map((r) => r.timingMs ?? r.execution?.latencyMs).filter((x) => typeof x === 'number' && x > 0);
  ms.sort((a, b) => a - b);
  if (!ms.length) return null;
  const mean = ms.reduce((a, b) => a + b, 0) / ms.length;
  const mid = ms[Math.floor(ms.length / 2)];
  const p95 = ms[Math.floor(ms.length * 0.95)] ?? ms[ms.length - 1];
  return { count: ms.length, mean: Math.round(mean), median: mid, p95, min: ms[0], max: ms[ms.length - 1] };
}

const comparison = [];
let improved = 0;
let regressed = 0;
let unchanged = 0;
let notComparable = 0;
const outcomeRank = { FAIL: 0, PARTIAL_PASS: 1, RETRIEVAL_PASS: 2, CORRECT_INSUFFICIENT_EVIDENCE: 3, PASS: 4, NOT_RUN: -1 };

function isNotComparablePreReasoner(engineRow, scoredRow) {
  if (engineRow?.preReasonerBlock === 'reference_validation' && !engineRow?.providerInvoked) {
    return {
      notComparable: true,
      reason:
        'REFERENCE_REJECTED: publication identifier blocked before Anthropic invocation (reference validation).',
    };
  }
  if (engineRow?.testId === 'EVAL-I-01' && engineRow?.v2ExecutionStatus === 'BLOCKED_REFERENCE_VALIDATION') {
    return {
      notComparable: true,
      reason:
        'EVAL-I-01: reference validation blocked the request before Anthropic invocation; not comparable to R2 insufficient-evidence outcome.',
    };
  }
  return { notComparable: false, reason: null };
}

for (const r of results) {
  const det = baseMap.get(r.testId);
  const detOut = det?.outcome ?? null;
  const aiOut = r.outcome ?? null;
  const nc = isNotComparablePreReasoner(r, r);
  let delta = 'unchanged';
  let compareNote = null;
  if (nc.notComparable) {
    delta = 'NOT_COMPARABLE_PRE_REASONER';
    compareNote = nc.reason;
    notComparable += 1;
  } else if (detOut && aiOut && detOut !== aiOut) {
    const dr = outcomeRank[detOut] ?? -2;
    const ar = outcomeRank[aiOut] ?? -2;
    if (ar > dr) {
      improved += 1;
      delta = 'improved';
    } else if (ar < dr) {
      regressed += 1;
      delta = 'regressed';
    } else unchanged += 1;
  } else unchanged += 1;
  comparison.push({
    testId: r.testId,
    category: category(r.testId),
    deterministicOutcome: detOut,
    deterministicStatus: det?.engineStatus,
    aiOutcome: aiOut,
    aiStatus: r.status,
    v2ExecutionStatus: r.v2ExecutionStatus,
    harnessOutcome: r.harnessOutcome,
    delta,
    comparisonNote: compareNote,
    sufficiency: r.sufficiency ?? r.v2Diagnostics?.sufficiency,
    verificationOk: r.v2Diagnostics?.verificationOk,
    providerAttempts: r.execution?.providerAttempts,
    timingMs: r.timingMs,
    answer: r.answer,
    answerPreview: r.answerPreview,
  });
}

const byCategory = {};
  for (const c of comparison) {
  const k = c.category;
  if (!byCategory[k]) {
    byCategory[k] = {
      total: 0,
      improved: 0,
      regressed: 0,
      unchanged: 0,
      notComparablePreReasoner: 0,
      outcomes: {},
    };
  }
  byCategory[k].total += 1;
  if (c.delta === 'NOT_COMPARABLE_PRE_REASONER') byCategory[k].notComparablePreReasoner += 1;
  else if (byCategory[k][c.delta] != null) byCategory[k][c.delta] += 1;
  byCategory[k].outcomes[c.aiOutcome] = (byCategory[k].outcomes[c.aiOutcome] || 0) + 1;
}

const fails = results.filter((r) => r.outcome === 'FAIL');
function failCause(r) {
  const causes = [];
  if (r.v2ExecutionStatus === 'BLOCKED_EXPECTED') causes.push('tenant_security_block');
  if (r.harnessOutcome === 'REFERENCE_REJECTED' || r.preReasonerBlock === 'reference_validation')
    causes.push('invalid_reference_rejection');
  if (r.v2ExecutionStatus === 'VERIFICATION_FAILED' || r.harnessOutcome === 'VERIFICATION_FAILURE')
    causes.push('citation_verification_failure');
  if (r.v2ExecutionStatus === 'OUTPUT_TRUNCATED') causes.push('output_truncation');
  if (r.v2ExecutionStatus === 'PUBLIC_ELIGIBLE_EXECUTED' && r.harnessOutcome === 'REGULATORY_MEASURED') {
    if (r.outcome === 'FAIL') causes.push('genuine_regulatory_reasoning_error');
  }
  if (!causes.length) causes.push('other');
  return causes;
}

const failBreakdown = {};
const failCases = fails.map((r) => {
  const causes = failCause(r);
  for (const c of causes) failBreakdown[c] = (failBreakdown[c] || 0) + 1;
  return {
    testId: r.testId,
    causes,
    v2ExecutionStatus: r.v2ExecutionStatus,
    harnessOutcome: r.harnessOutcome,
    sufficiency: r.sufficiency,
    verificationOk: r.v2Diagnostics?.verificationOk,
    answer: r.answer || r.answerPreview,
  };
});

const insuffCases = results.filter(
  (r) =>
    baseMap.get(r.testId)?.outcome === 'CORRECT_INSUFFICIENT_EVIDENCE' ||
    r.outcome === 'CORRECT_INSUFFICIENT_EVIDENCE' ||
    mapIdeal(baseMap.get(r.testId)) === 'INSUFFICIENT',
);

function mapIdeal(det) {
  if (!det) return null;
  if (det.outcome === 'CORRECT_INSUFFICIENT_EVIDENCE' || det.engineStatus === 'INSUFFICIENT_EVIDENCE')
    return 'INSUFFICIENT';
  return null;
}

const insuffInvestigation = results
  .map((r) => {
    const det = baseMap.get(r.testId);
    const detOut = det?.outcome;
    const expectsInsuff =
      detOut === 'CORRECT_INSUFFICIENT_EVIDENCE' ||
      det?.idealScoringClassification === 'INSUFFICIENT_EVIDENCE' ||
      det?.engineStatus === 'INSUFFICIENT_EVIDENCE';
    if (!expectsInsuff && r.outcome !== 'CORRECT_INSUFFICIENT_EVIDENCE') return null;
    const answeredWithoutSupport =
      r.outcome !== 'CORRECT_INSUFFICIENT_EVIDENCE' &&
      r.status !== 'INSUFFICIENT_EVIDENCE' &&
      (r.sufficiency === 'DIRECT_SUPPORT' || r.sufficiency === 'PARTIAL_SUPPORT' || r.outcome === 'FAIL' || r.outcome === 'RETRIEVAL_PASS');
    return {
      testId: r.testId,
      deterministicOutcome: detOut,
      aiOutcome: r.outcome,
      aiSufficiency: r.sufficiency,
      verificationOk: r.v2Diagnostics?.verificationOk,
      status: r.status,
      v2ExecutionStatus: r.v2ExecutionStatus,
      evidenceChunkIds: r.v2Diagnostics?.evidenceChunkIds,
      answer: r.answer || r.answerPreview,
      incorrectlyAnswered: answeredWithoutSupport,
      classification:
        r.outcome === 'CORRECT_INSUFFICIENT_EVIDENCE'
          ? 'scoring_aligned'
          : answeredWithoutSupport
            ? 'genuine_unsupported_answer'
            : r.outcome === 'FAIL' && r.harnessOutcome === 'VERIFICATION_FAILURE'
              ? 'citation_verification'
              : 'scoring_classification_difference',
    };
  })
  .filter(Boolean);

const criticalIds = [
  'EVAL-C-01',
  'EVAL-C-02',
  'EVAL-C-03',
  'EVAL-C-04',
  'EVAL-C-05',
  'EVAL-I-02',
  'EVAL-I-01',
  'EVAL-J-01',
  'EVAL-J-02',
  'EVAL-J-03',
  'EVAL-J-04',
];
const critical = comparison.filter((c) => criticalIds.includes(c.testId));

const providerCases = results.filter((r) => r.providerInvoked);
const tokensPerCase = providerCases.map((r) => ({
  testId: r.testId,
  input: r.execution?.usage?.inputTokens,
  output: r.execution?.usage?.outputTokens,
  attempts: r.execution?.providerAttempts ?? 0,
  timingMs: r.timingMs,
}));
const retries = results.reduce((n, r) => n + Math.max(0, (r.execution?.providerAttempts ?? 1) - 1), 0);
const completedAnswers = results.filter((r) => r.v2ExecutionStatus === 'PUBLIC_ELIGIBLE_EXECUTED').length;

const priorInsuff =
  prior?.summary?.outcomes?.CORRECT_INSUFFICIENT_EVIDENCE ??
  prior?.results?.filter((r) => r.outcome === 'CORRECT_INSUFFICIENT_EVIDENCE').length;

const analysis = {
  meta: { liveReport: LIVE, baseline: BASE, priorLive: prior ? PRIOR : null },
  comparisonSummary: { improved, regressed, unchanged, notComparablePreReasoner: notComparable, total: results.length },
  byCategory,
  failBreakdown,
  failCases,
  insuffInvestigation,
  priorCorrectInsufficientCount: priorInsuff,
  currentCorrectInsufficientCount: results.filter((r) => r.outcome === 'CORRECT_INSUFFICIENT_EVIDENCE').length,
  performance: {
    timingAllCases: latencyStats(results),
    timingProviderCases: latencyStats(providerCases),
    totalOutputTokens: live.spend?.outputTokens,
    totalInputTokens: live.spend?.inputTokens,
    requestCount: live.spend?.requestCount,
    retries,
    calculatedUsd: live.spend?.calculatedUsd,
    estimatedUsd: live.spend?.estimatedUsd,
    costPerCompletedAnswer:
      completedAnswers > 0 ? Number((live.spend?.calculatedUsd / completedAnswers).toFixed(4)) : null,
    avgOutputTokensPerProviderCase:
      providerCases.length > 0
        ? Math.round(
            providerCases.reduce((s, r) => s + (r.execution?.usage?.outputTokens || 0), 0) / providerCases.length,
          )
        : null,
    avgRequestsPerProviderCase:
      providerCases.length > 0
        ? Number(
            (
              providerCases.reduce((s, r) => s + (r.execution?.providerAttempts ?? 1), 0) / providerCases.length
            ).toFixed(2),
          )
        : null,
  },
  criticalCases: critical,
  comparison,
};

const outDir = join(ROOT, 'docs/eval/runs');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'phase-2c2-ask-ri-v2-eval-analysis-public-2026-11-10.json');
writeFileSync(outPath, JSON.stringify(analysis, null, 2));
console.log(JSON.stringify({ outPath, ...analysis.comparisonSummary, failBreakdown, performance: analysis.performance }));
