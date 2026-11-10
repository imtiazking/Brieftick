#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AUTHENTIC_CORPUS_B1_DIR, EVIDENCE_PACKS_DIR, REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';
import { runCorpusRetrievalEval } from '../lib/ri/semantic/semantic-retrieval-eval.mjs';

const SUITE = join(REPO_ROOT, 'docs', 'eval', 'ask-ri-v2-eval-suite-v2.1.json');
const OUT_JSON = join(REPO_ROOT, 'docs', 'eval', 'phase-2b2-step-e-b1-retrieval-report.json');
const OUT_MD = join(REPO_ROOT, 'docs', 'eval', 'phase-2b2-step-e-b1-retrieval-report.md');

const EXTRA_NEGATIVES = [
  { testId: 'PROBE-NEG-PS88-88', question: 'Summarise FCA Policy Statement PS88/88 on mortgage conduct rules.' },
  { testId: 'PROBE-NEG-DP99-99', question: 'What does FCA Discussion Paper DP99/99 require on operational resilience testing?' },
];

async function main() {
  const original = await runCorpusRetrievalEval({
    corpusLabel: 'original_three_publications',
    packsDirs: [EVIDENCE_PACKS_DIR],
    evalSuitePath: SUITE,
    extraNegativeProbes: EXTRA_NEGATIVES,
  });
  const expanded = await runCorpusRetrievalEval({
    corpusLabel: 'authentic_b1_expanded',
    packsDirs: [AUTHENTIC_CORPUS_B1_DIR],
    evalSuitePath: SUITE,
    extraNegativeProbes: EXTRA_NEGATIVES,
  });
  const report = {
    phase: '2B.2-E-B1',
    generatedAt: new Date().toISOString(),
    originalCorpus: original,
    expandedCorpus: expanded,
    chunkGate: {
      requiredMaxTokens: 450,
      originalOverIndexLimit: original.chunkTokenStats.overIndexLimit,
      expandedOverIndexLimit: expanded.chunkTokenStats.overIndexLimit,
    },
  };
  writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  writeFileSync(
    OUT_MD,
    [
      '# Phase 2B.2 Step E — B1 retrieval evaluation',
      '',
      `Generated: ${report.generatedAt}`,
      '',
      '| Corpus | Pubs | Chunks | max tok | >450 | Recall@1 | Neg reject | FP |',
      '|--------|-----:|-------:|--------:|-----:|---------:|-----------:|---:|',
      `| Original | ${original.distinctPublications} | ${original.chunkTokenStats.count} | ${original.chunkTokenStats.max} | ${original.chunkTokenStats.overIndexLimit} | ${original.metrics.publicationRecallTop1}/${original.metrics.publicationRecallTop1Denom} | ${(original.metrics.negativeCorrectRejectionRate * 100).toFixed(0)}% | ${(original.metrics.falsePositiveRate * 100).toFixed(0)}% |`,
      `| B1 expanded | ${expanded.distinctPublications} | ${expanded.chunkTokenStats.count} | ${expanded.chunkTokenStats.max} | ${expanded.chunkTokenStats.overIndexLimit} | ${expanded.metrics.publicationRecallTop1}/${expanded.metrics.publicationRecallTop1Denom} | ${(expanded.metrics.negativeCorrectRejectionRate * 100).toFixed(0)}% | ${(expanded.metrics.falsePositiveRate * 100).toFixed(0)}% |`,
      '',
    ].join('\n'),
  );
  console.log(
    JSON.stringify({
      ok: true,
      originalRecall: original.metrics.publicationRecallTop1,
      expandedRecall: expanded.metrics.publicationRecallTop1,
      expandedPubs: expanded.distinctPublications,
      over450: expanded.chunkTokenStats.overIndexLimit,
    }),
  );
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e.message }));
  process.exit(2);
});
