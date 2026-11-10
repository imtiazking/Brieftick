#!/usr/bin/env node
/**
 * Phase 2B.2 Step F — offline retrieval with corrected B1 index + development probes.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AUTHENTIC_CORPUS_B1_DIR,
  DEVELOPMENT_RETRIEVAL_PROBES_STEP_F,
  EVIDENCE_PACKS_DIR,
  REPO_ROOT,
} from '../lib/ri/eval/eval-paths.mjs';
import {
  buildSemanticIndex,
  runCorpusRetrievalEval,
  scoreQuestion,
} from '../lib/ri/semantic/semantic-retrieval-eval.mjs';

const SUITE = join(REPO_ROOT, 'docs', 'eval', 'ask-ri-v2-eval-suite-v2.1.json');
const OUT_JSON = join(REPO_ROOT, 'docs', 'eval', 'phase-2b2-step-f-retrieval-report.json');
const OUT_MD = join(REPO_ROOT, 'docs', 'eval', 'phase-2b2-step-f-retrieval-report.md');

function summariseGroup(results, { positive = false } = {}) {
  const total = results.length;
  if (!total) return { count: 0, recallTop1: null, abstainCorrect: null, falsePositives: 0 };
  if (positive) {
    const recall = results.filter((r) => {
      const expected = r.expectedPublicationIds || [];
      if (!expected.length) return r.noMatchDecision?.abstain;
      return expected.includes(r.publicationSelected);
    }).length;
    return {
      count: total,
      recallTop1: recall,
      recallTop1Rate: Number((recall / total).toFixed(4)),
      passageRelevant: results.filter((r) => r.passageRelevant).length,
      falseNegatives: results.filter((r) => {
        const expected = r.expectedPublicationIds || [];
        return expected.length && !expected.includes(r.publicationSelected) && !r.noMatchDecision?.abstain;
      }).length,
    };
  }
  const abstainCorrect = results.filter((r) => r.correctlyRejected).length;
  return {
    count: total,
    abstainCorrect,
    abstainRate: Number((abstainCorrect / total).toFixed(4)),
    falsePositives: results.filter((r) => !r.correctlyRejected).length,
  };
}

async function main() {
  const dev = JSON.parse(readFileSync(DEVELOPMENT_RETRIEVAL_PROBES_STEP_F, 'utf8'));

  const original = await runCorpusRetrievalEval({
    corpusLabel: 'original_three_publications',
    packsDirs: [EVIDENCE_PACKS_DIR],
    evalSuitePath: SUITE,
    extraNegativeProbes: [],
  });

  const correctedB1 = await runCorpusRetrievalEval({
    corpusLabel: 'authentic_b1_expanded_corrected_chunks',
    packsDirs: [AUTHENTIC_CORPUS_B1_DIR],
    evalSuitePath: SUITE,
    extraNegativeProbes: [],
  });

  const b1Index = await buildSemanticIndex(AUTHENTIC_CORPUS_B1_DIR);
  const threshold = correctedB1.provisionalThreshold;

  const devResults = [];
  for (const probe of dev.probes) {
    const result = await scoreQuestion(b1Index, probe.question, probe, threshold);
    const expected = probe.expectedPublicationIds || [];
    if (expected.length) {
      result.publicationRecallTop1 = expected.includes(result.publicationSelected);
      result.publicationRecallTop5 = expected.some((pid) =>
        result.rankedPublications.slice(0, 5).some((p) => p.publicationId === pid),
      );
      result.passageSectionHint =
        probe.expectedSectionHints?.includes(result.noMatchDecision?.selectedChunk?.chunk?.sectionReference) ||
        probe.expectedSectionHints?.some((h) =>
          String(result.noMatchDecision?.selectedChunk?.chunk?.sectionReference || '').includes(h),
        );
    } else {
      result.correctlyRejected = result.noMatchDecision.abstain;
    }
    result.category = probe.category;
    devResults.push(result);
  }

  const byCategory = {};
  for (const r of devResults) {
    byCategory[r.category] = byCategory[r.category] || [];
    byCategory[r.category].push(r);
  }

  const report = {
    phase: '2B.2-F',
    generatedAt: new Date().toISOString(),
    chunkCorrection: {
      priorIndexedChunks: 432,
      correctedIndexedChunks: correctedB1.chunkTokenStats.count,
      priorPageBoundarySignals: 6,
      correctedPageBoundaryViolations: correctedB1.chunkTokenStats.pageBoundaryViolations,
      overIndexLimit: correctedB1.chunkTokenStats.overIndexLimit,
      oversizedRejected: correctedB1.chunkTokenStats.oversizedChunksRejected,
    },
    originalCorpus: {
      chunkTokenStats: original.chunkTokenStats,
      metrics: original.metrics,
    },
    correctedB1Corpus: {
      chunkTokenStats: correctedB1.chunkTokenStats,
      metrics: correctedB1.metrics,
      distinctPublications: correctedB1.distinctPublications,
    },
    developmentProbes: {
      dataset: dev.datasetVersion,
      threshold,
      byCategory: Object.fromEntries(
        Object.entries(byCategory).map(([cat, rows]) => [cat, summariseGroup(rows, { positive: cat.includes('positive') || cat === 'original_frozen_suite' })]),
      ),
      results: devResults,
    },
  };

  writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));

  const b1Group = report.developmentProbes.byCategory.b1_positive || {};
  const nearMiss = report.developmentProbes.byCategory.near_miss_negative || {};
  const unrelated = report.developmentProbes.byCategory.unrelated_negative || {};

  writeFileSync(
    OUT_MD,
    [
      '# Phase 2B.2 Step F — retrieval evaluation',
      '',
      `Generated: ${report.generatedAt}`,
      '',
      '## Chunk index (corrected B1)',
      '',
      `| Chunks | max tok | >450 | page boundary signals | oversized rejected |`,
      `|-------:|--------:|-----:|----------------------:|-------------------:|`,
      `| ${correctedB1.chunkTokenStats.count} | ${correctedB1.chunkTokenStats.max} | ${correctedB1.chunkTokenStats.overIndexLimit} | ${correctedB1.chunkTokenStats.pageBoundaryViolations} | ${correctedB1.chunkTokenStats.oversizedChunksRejected || 0} |`,
      '',
      '## Frozen suite on corrected B1 corpus',
      '',
      `Recall@1: ${correctedB1.metrics.publicationRecallTop1}/${correctedB1.metrics.publicationRecallTop1Denom} | Neg reject: ${(correctedB1.metrics.negativeCorrectRejectionRate * 100).toFixed(0)}% | FP: ${(correctedB1.metrics.falsePositiveRate * 100).toFixed(0)}%`,
      '',
      '## Development probes (B1 index)',
      '',
      `| Group | n | Recall@1 / abstain | FP |`,
      `|-------|--:|-------------------|---:|`,
      `| B1 positives | ${b1Group.count || 0} | ${b1Group.recallTop1 ?? '—'}/${b1Group.count || 0} | ${b1Group.falseNegatives ?? 0} FN |`,
      `| Near-miss negatives | ${nearMiss.count || 0} | ${nearMiss.abstainCorrect ?? 0} correct | ${nearMiss.falsePositives ?? 0} |`,
      `| Unrelated negatives | ${unrelated.count || 0} | ${unrelated.abstainCorrect ?? 0} correct | ${unrelated.falsePositives ?? 0} |`,
      '',
    ].join('\n'),
  );

  console.log(
    JSON.stringify({
      ok: true,
      chunks: correctedB1.chunkTokenStats.count,
      pageBoundary: correctedB1.chunkTokenStats.pageBoundaryViolations,
      b1ProbeRecall: b1Group.recallTop1,
      b1ProbeN: b1Group.count,
      nearMissAbstain: nearMiss.abstainCorrect,
    }),
  );
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e.message }));
  process.exit(2);
});
