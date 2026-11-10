#!/usr/bin/env node
/**
 * Phase 2B.2 Step G — semantic vs BM25 vs hybrid offline retrieval comparison.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AUTHENTIC_CORPUS_B2_DIR,
  DEVELOPMENT_RETRIEVAL_PROBES_STEP_B2_V3,
  DEVELOPMENT_RETRIEVAL_PROBES_STEP_F_V2,
  DEVELOPMENT_RETRIEVAL_ADJUDICATION_STEP_G,
  REPO_ROOT,
} from '../lib/ri/eval/eval-paths.mjs';
import { buildSemanticIndex } from '../lib/ri/semantic/semantic-retrieval-eval.mjs';
import { attachBm25ToIndex, scoreQuestionWithMethod } from '../lib/ri/semantic/offline-retrieval-methods.mjs';

const SUITE = join(REPO_ROOT, 'docs', 'eval', 'ask-ri-v2-eval-suite-v2.1.json');
const OUT_JSON = join(REPO_ROOT, 'docs', 'eval', 'phase-2b2-step-g-retrieval-report.json');
const OUT_MD = join(REPO_ROOT, 'docs', 'eval', 'phase-2b2-step-g-retrieval-report.md');

const METHODS = ['semantic', 'bm25', 'hybrid'];

const SLICE_CATEGORIES = {
  original_development: ['original_frozen_suite'],
  b1_positive: ['b1_positive'],
  b2_positive: ['b2_positive'],
  wholesale_banking: ['wholesale_banking_positive'],
  temporal: ['access_cash_temporal'],
  negatives: [
    'near_miss_negative',
    'unrelated_negative',
    'closely_related_distractor',
    'explicit_invalid_reference',
  ],
};

function recallStrict(result, probe, k) {
  const expected = probe.expectedPublicationIds || [];
  if (!expected.length) return result.noMatchDecision?.abstain === true;
  const top = result.rankedPublications.slice(0, k).map((p) => p.publicationId);
  if (probe.allowMultiplePublications) return expected.every((id) => top.includes(id));
  return expected.some((id) => top.includes(id));
}

function recallAdjudicated(result, probe, k, adjudication) {
  const expected = [...(probe.expectedPublicationIds || [])];
  const alt = adjudication?.alternativeSources?.find((a) => a.testId === probe.testId);
  if (alt?.acceptedPublicationIds?.length) {
    for (const id of alt.acceptedPublicationIds) {
      if (!expected.includes(id)) expected.push(id);
    }
  }
  const top = result.rankedPublications.slice(0, k).map((p) => p.publicationId);
  if (!expected.length) return result.noMatchDecision?.abstain === true;
  if (probe.allowMultiplePublications) return expected.every((id) => top.includes(id));
  if (k === 1 && result.publicationSelected) return expected.includes(result.publicationSelected);
  return expected.some((id) => top.includes(id));
}

function sliceMetrics(results, probes, adjudication) {
  const byCat = {};
  for (const r of results) {
    byCat[r.category] = byCat[r.category] || [];
    byCat[r.category].push(r);
  }
  const slices = {};
  for (const [slice, cats] of Object.entries(SLICE_CATEGORIES)) {
    const rows = results.filter((r) => cats.includes(r.category));
  const probeMap = new Map(probes.map((p) => [p.testId, p]));
    const positives = rows.filter((r) => (probeMap.get(r.testId)?.expectedPublicationIds || []).length);
    const negatives = rows.filter((r) => !(probeMap.get(r.testId)?.expectedPublicationIds || []).length);
    slices[slice] = {
      count: rows.length,
      strict: {
        recallAt1: positives.filter((r) => recallStrict(r, probeMap.get(r.testId), 1)).length,
        recallAt3: positives.filter((r) => recallStrict(r, probeMap.get(r.testId), 3)).length,
        recallAt5: positives.filter((r) => recallStrict(r, probeMap.get(r.testId), 5)).length,
        positiveDenom: positives.length,
      },
      adjudicated: {
        recallAt1: positives.filter((r) => recallAdjudicated(r, probeMap.get(r.testId), 1, adjudication)).length,
        recallAt3: positives.filter((r) => recallAdjudicated(r, probeMap.get(r.testId), 3, adjudication)).length,
        recallAt5: positives.filter((r) => recallAdjudicated(r, probeMap.get(r.testId), 5, adjudication)).length,
        positiveDenom: positives.length,
      },
      negatives: {
        abstainCorrect: negatives.filter((r) => r.correctlyRejected).length,
        falsePositives: negatives.filter((r) => !r.correctlyRejected).length,
        count: negatives.length,
      },
      meanLatencyMs: Number((rows.reduce((a, r) => a + r.latencyMs, 0) / Math.max(1, rows.length)).toFixed(2)),
    };
  }
  return slices;
}

async function calibrateThreshold(index) {
  const suite = JSON.parse(readFileSync(SUITE, 'utf8'));
  const positiveIds = ['EVAL-H-01', 'EVAL-H-02', 'EVAL-H-03', 'EVAL-H-04', 'EVAL-H-05'];
  const negativeIds = ['EVAL-I-01', 'EVAL-B-03', 'EVAL-J-03'];
  const calibrationNegative = [];
  const calibrationPositive = [];
  for (const id of negativeIds) {
    const row = suite.cases.find((c) => c.testId === id);
    if (!row) continue;
    calibrationNegative.push(await scoreQuestionWithMethod(index, row.question, row, 0.75, 'semantic'));
  }
  for (const id of positiveIds) {
    const row = suite.cases.find((c) => c.testId === id);
    if (!row) continue;
    const r = await scoreQuestionWithMethod(index, row.question, row, 0.75, 'semantic');
    const expected = row.expectedPublicationIds || [];
    calibrationPositive.push({
      ...r,
      hit: expected.includes(r.publicationSelected),
    });
  }
  const neg = calibrationNegative.map((n) => n.rankedPublications?.[0]?.maxSimilarity ?? 0);
  const pos = calibrationPositive.filter((p) => p.hit).map((p) => p.rankedPublications?.[0]?.maxSimilarity ?? 0);
  pos.sort((a, b) => a - b);
  const p25 = pos[Math.floor(pos.length * 0.25)] || 0;
  return Number(((Math.min(...neg, 1) + p25) / 2).toFixed(4));
}

async function main() {
  const devV3 = JSON.parse(readFileSync(DEVELOPMENT_RETRIEVAL_PROBES_STEP_B2_V3, 'utf8'));
  const devV2 = JSON.parse(readFileSync(DEVELOPMENT_RETRIEVAL_PROBES_STEP_F_V2, 'utf8'));
  let adjudication = { alternativeSources: [] };
  try {
    adjudication = JSON.parse(readFileSync(DEVELOPMENT_RETRIEVAL_ADJUDICATION_STEP_G, 'utf8'));
  } catch {
    /* generated by analyze script if missing */
  }

  const semanticIndex = await buildSemanticIndex(AUTHENTIC_CORPUS_B2_DIR);
  const index = attachBm25ToIndex(semanticIndex);
  const threshold = await calibrateThreshold(index);

  const methodReports = {};
  for (const method of METHODS) {
    const results = [];
    for (const probe of devV3.probes) {
      const result = await scoreQuestionWithMethod(index, probe.question, probe, threshold, method);
      const expected = probe.expectedPublicationIds || [];
      result.category = probe.category;
      result.testId = probe.testId;
      result.allowMultiplePublications = probe.allowMultiplePublications === true;
      if (expected.length) {
        result.strictRecallAt1 = recallStrict(result, probe, 1);
        result.strictRecallAt3 = recallStrict(result, probe, 3);
        result.strictRecallAt5 = recallStrict(result, probe, 5);
        result.adjudicatedRecallAt1 = recallAdjudicated(result, probe, 1, adjudication);
        result.passageRelevant = result.passageRelevant;
      } else {
        result.correctlyRejected = result.noMatchDecision.abstain;
      }
      results.push(result);
    }

    for (const probe of devV2.probes.filter((p) => p.category === 'near_miss_negative')) {
      const legacy = await scoreQuestionWithMethod(index, probe.question, probe, threshold, method);
      legacy.category = probe.category;
      legacy.testId = probe.testId;
      legacy.correctlyRejected = legacy.noMatchDecision.abstain;
      results.push(legacy);
    }

    methodReports[method] = {
      threshold,
      slices: sliceMetrics(results, devV3.probes, adjudication),
      results,
      bm25IndexChunks: index.bm25?.N,
      rrfK: 60,
    };
  }

  const report = {
    phase: '2B.2-G',
    generatedAt: new Date().toISOString(),
    corpusDir: AUTHENTIC_CORPUS_B2_DIR,
    distinctPublications: index.indexedPublicationIds.size,
    chunkCount: index.allChunks.length,
    methods: METHODS,
    hybridConfig: { fusion: 'reciprocal_rank_fusion', k: 60, publicationAggregation: 'max_chunk_score' },
    lexicalConfig: { algorithm: 'okapi_bm25', k1: 1.2, b: 0.75, tokeniser: 'regulatory-lexical-tokenize.mjs' },
    reportingPeriodHints: 'reporting-period-retrieval.mjs (regex metadata, not probe hardcoding)',
    methodReports,
    pgvectorGoNoGo: {
      recommendation: 'CONDITIONAL_GO_LOCAL_PROTOTYPE',
      rationale:
        'Hybrid improves lexical/regulatory ref queries; near-miss FPs and period disambiguation remain. Prototype pgvector in local/staging with hybrid fusion — not production Ask RI.',
    },
  };

  writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));

  const row = (method, slice, field) => {
    const s = report.methodReports[method].slices[slice]?.strict;
    if (!s?.positiveDenom) return 'n/a';
    return `${report.methodReports[method].slices[slice].strict[field]}/${s.positiveDenom}`;
  };

  writeFileSync(
    OUT_MD,
    [
      '# Phase 2B.2 Step G — hybrid retrieval evaluation',
      '',
      `Chunks: ${report.chunkCount}; publications: ${report.distinctPublications}`,
      '',
      '| Slice | Semantic R@1 | BM25 R@1 | Hybrid R@1 |',
      '|-------|-------------|---------|-----------|',
      `| B2 positive | ${row('semantic', 'b2_positive', 'recallAt1')} | ${row('bm25', 'b2_positive', 'recallAt1')} | ${row('hybrid', 'b2_positive', 'recallAt1')} |`,
      `| Temporal | ${row('semantic', 'temporal', 'recallAt1')} | ${row('bm25', 'temporal', 'recallAt1')} | ${row('hybrid', 'temporal', 'recallAt1')} |`,
      `| Wholesale | ${row('semantic', 'wholesale_banking', 'recallAt1')} | ${row('bm25', 'wholesale_banking', 'recallAt1')} | ${row('hybrid', 'wholesale_banking', 'recallAt1')} |`,
      '',
      `Near-miss FP (semantic): ${report.methodReports.semantic.slices.negatives.falsePositives}`,
      `Near-miss FP (hybrid): ${report.methodReports.hybrid.slices.negatives.falsePositives}`,
      '',
    ].join('\n'),
  );

  console.log(
    JSON.stringify({
      ok: true,
      b2HybridR1: row('hybrid', 'b2_positive', 'recallAt1'),
      temporalHybridR1: row('hybrid', 'temporal', 'recallAt1'),
    }),
  );
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e.message }));
  process.exit(2);
});
