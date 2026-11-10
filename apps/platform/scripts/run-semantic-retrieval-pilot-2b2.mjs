#!/usr/bin/env node
/**
 * Phase 2B.2 Steps A–B offline pilot — no DB, no production Ask RI, no provider calls beyond local ONNX download.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';
import { runSemanticRetrievalPilot } from '../lib/ri/semantic/retrieval-pilot.mjs';

const SUITE = join(REPO_ROOT, 'docs', 'eval', 'ask-ri-v2-eval-suite-v2.1.json');
const OUT_JSON = join(REPO_ROOT, 'docs', 'eval', 'phase-2b2-semantic-pilot-report.json');
const OUT_MD = join(REPO_ROOT, 'docs', 'eval', 'phase-2b2-semantic-pilot-report.md');

function toMarkdown(report) {
  const lines = [
    '# Phase 2B.2 semantic retrieval pilot (Steps A–B)',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Small-corpus limitation',
    '',
    report.corpus.smallCorpusLimitation,
    '',
    `| Metric | Value |`,
    `|--------|------:|`,
    `| Distinct publications | ${report.corpus.distinctPublications} |`,
    `| Chunks indexed (pilot) | ${report.corpus.chunkCount} |`,
    `| Positive probes | ${report.corpus.positiveQuestions} |`,
    `| Negative probes | ${report.corpus.negativeQuestions} |`,
    '',
    '## Chunk token stats (gte-small tokenizer)',
    '',
    '```json',
    JSON.stringify(report.chunkTokenStats, null, 2),
    '```',
    '',
    '## Runtime equivalence',
    '',
    `Status: **${report.equivalence.status}** — ${report.equivalence.note}`,
    '',
    '## Threshold (provisional)',
    '',
    `Proposed minimum relevance: **${report.proposedMinimumRelevanceThreshold}**`,
    '',
    report.thresholdCalibrationNote,
    '',
    '## Negative controls',
    '',
    `- Correct rejection rate: **${(report.negativeControls.correctRejectionRate * 100).toFixed(1)}%**`,
    `- False-positive rate: **${(report.negativeControls.falsePositiveRate * 100).toFixed(1)}%**`,
    '',
    '## Completion gate',
    '',
    '```json',
    JSON.stringify(report.completionGate, null, 2),
    '```',
    '',
  ];
  return lines.join('\n');
}

async function main() {
  const report = await runSemanticRetrievalPilot({ evalSuitePath: SUITE, equivalenceSampleCount: 20 });
  writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  writeFileSync(OUT_MD, toMarkdown(report));
  console.log(
    JSON.stringify({
      ok: true,
      chunks: report.corpus.chunkCount,
      tokenP95: report.chunkTokenStats.p95,
      gate: report.completionGate,
      recallTop1: report.acceptance.publicationRecallTop1,
      recallDenom: report.acceptance.publicationRecallTop1Denom,
    }),
  );
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e.message, stack: e.stack }));
  process.exit(2);
});
