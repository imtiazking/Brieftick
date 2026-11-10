#!/usr/bin/env node
/**
 * Phase 2B.2 Step C — offline retrieval hardening comparison.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVIDENCE_PACKS_DIR, SUPPLEMENTAL_CORPUS_2B2_DIR, REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';
import { runStepC2b2Comparison } from '../lib/ri/semantic/semantic-retrieval-eval.mjs';

const SUITE = join(REPO_ROOT, 'docs', 'eval', 'ask-ri-v2-eval-suite-v2.1.json');
const OUT_JSON = join(REPO_ROOT, 'docs', 'eval', 'phase-2b2-step-c-retrieval-report.json');
const OUT_MD = join(REPO_ROOT, 'docs', 'eval', 'phase-2b2-step-c-retrieval-report.md');

const EXTRA_NEGATIVES = [
  {
    testId: 'PROBE-NEG-PS88-88',
    question: 'Summarise FCA Policy Statement PS88/88 on mortgage conduct rules.',
  },
  {
    testId: 'PROBE-NEG-DP99-99',
    question: 'What does FCA Discussion Paper DP99/99 require on operational resilience testing?',
  },
  {
    testId: 'PROBE-NEG-CRYPTO-TR',
    question: 'Under TR24/99, what cryptoasset marketing rules apply to retail clients?',
  },
];

function toMarkdown(report) {
  const h01 = report.requiredCases['EVAL-H-01'];
  const i01 = report.requiredCases['EVAL-I-01'];
  const j03 = report.requiredCases['EVAL-J-03'];
  return [
    '# Phase 2B.2 Step C — retrieval safety and expanded corpus',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Embedding runtime (local pilot)',
    '',
    '```json',
    JSON.stringify(report.embeddingRuntime, null, 2),
    '```',
    '',
    '## Reference validation',
    '',
    '```json',
    JSON.stringify(report.referenceValidation, null, 2),
    '```',
    '',
    '## Chunk statistics (original corpus)',
    '',
    '```json',
    JSON.stringify(report.originalCorpus.chunkTokenStats, null, 2),
    '```',
    '',
    '## Chunk statistics (expanded corpus)',
    '',
    '```json',
    JSON.stringify(report.expandedCorpus.chunkTokenStats, null, 2),
    '```',
    '',
    '## EVAL-I-01',
    '',
    '```json',
    JSON.stringify(
      {
        correctlyRejected: i01?.correctlyRejected,
        referenceValidation: i01?.referenceValidation,
        noMatchReasons: i01?.noMatchDecision?.reasons,
        topPublication: i01?.rankedPublications?.[0],
      },
      null,
      2,
    ),
    '```',
    '',
    '## EVAL-J-03',
    '',
    '```json',
    JSON.stringify(
      {
        correctlyRejected: j03?.correctlyRejected,
        referenceValidation: j03?.referenceValidation,
        noMatchReasons: j03?.noMatchDecision?.reasons,
        semanticTop: j03?.rankedPublications?.[0],
      },
      null,
      2,
    ),
    '```',
    '',
    '## EVAL-H-01 passage quality',
    '',
    '```json',
    JSON.stringify(
      {
        passageRelevant: h01?.passageRelevant,
        topChunk: h01?.topChunks?.[0],
        publicationRecallTop1: h01?.publicationRecallTop1,
      },
      null,
      2,
    ),
    '```',
    '',
    '## Original vs expanded metrics',
    '',
    '| Corpus | Distinct pubs | Chunks | Recall@1 | Recall@5 | Passage relevance | Neg. rejection | FP rate | Mean latency ms |',
    '|--------|--------------:|-------:|---------:|---------:|------------------:|---------------:|--------:|----------------:|',
    `| Original | ${report.originalCorpus.distinctPublications} | ${report.originalCorpus.chunkTokenStats.count} | ${report.originalCorpus.metrics.publicationRecallTop1}/${report.originalCorpus.metrics.publicationRecallTop1Denom} | ${report.originalCorpus.metrics.publicationRecallTop5}/${report.originalCorpus.metrics.publicationRecallTop1Denom} | ${report.originalCorpus.metrics.passageRelevanceRate}/${report.originalCorpus.metrics.publicationRecallTop1Denom} | ${(report.originalCorpus.metrics.negativeCorrectRejectionRate * 100).toFixed(1)}% | ${(report.originalCorpus.metrics.falsePositiveRate * 100).toFixed(1)}% | ${report.originalCorpus.metrics.meanLatencyMs} |`,
    `| Expanded | ${report.expandedCorpus.distinctPublications} | ${report.expandedCorpus.chunkTokenStats.count} | ${report.expandedCorpus.metrics.publicationRecallTop1}/${report.expandedCorpus.metrics.publicationRecallTop1Denom} | ${report.expandedCorpus.metrics.publicationRecallTop5}/${report.expandedCorpus.metrics.publicationRecallTop1Denom} | ${report.expandedCorpus.metrics.passageRelevanceRate}/${report.expandedCorpus.metrics.publicationRecallTop1Denom} | ${(report.expandedCorpus.metrics.negativeCorrectRejectionRate * 100).toFixed(1)}% | ${(report.expandedCorpus.metrics.falsePositiveRate * 100).toFixed(1)}% | ${report.expandedCorpus.metrics.meanLatencyMs} |`,
    '',
    '## Completion gate',
    '',
    '```json',
    JSON.stringify(report.completionGate, null, 2),
    '```',
    '',
    '## pgvector readiness',
    '',
    '```json',
    JSON.stringify(report.readinessForPgvector, null, 2),
    '```',
    '',
  ].join('\n');
}

async function main() {
  const report = await runStepC2b2Comparison({
    evalSuitePath: SUITE,
    originalPacksDir: EVIDENCE_PACKS_DIR,
    expandedPacksDirs: [EVIDENCE_PACKS_DIR, SUPPLEMENTAL_CORPUS_2B2_DIR],
    extraNegativeProbes: EXTRA_NEGATIVES,
  });

  report.supplementalCorpus = {
    directory: SUPPLEMENTAL_CORPUS_2B2_DIR,
    additionalDistinctPublications: Math.max(
      0,
      report.expandedCorpus.distinctPublications - report.originalCorpus.distinctPublications,
    ),
  };

  writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  writeFileSync(OUT_MD, toMarkdown(report));
  console.log(
    JSON.stringify({
      ok: true,
      i01Rejected: report.requiredCases['EVAL-I-01']?.correctlyRejected,
      j03Rejected: report.requiredCases['EVAL-J-03']?.correctlyRejected,
      h01PassageRelevant: report.requiredCases['EVAL-H-01']?.passageRelevant,
      originalRecallAt1: report.originalCorpus.metrics.publicationRecallTop1,
      expandedRecallAt1: report.expandedCorpus.metrics.publicationRecallTop1,
      expandedPubs: report.expandedCorpus.distinctPublications,
    }),
  );
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e.message, stack: e.stack }));
  process.exit(2);
});
