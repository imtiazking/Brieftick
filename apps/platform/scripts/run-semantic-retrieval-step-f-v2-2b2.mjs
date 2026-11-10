#!/usr/bin/env node
/**
 * Phase 2B.2 Step F v2 — full-text index + authority gate + development probes v2.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AUTHENTIC_CORPUS_B1_DIR,
  DEVELOPMENT_RETRIEVAL_PROBES_STEP_F_V2,
  EVIDENCE_PACKS_DIR,
  REPO_ROOT,
} from '../lib/ri/eval/eval-paths.mjs';
import {
  buildSemanticIndex,
  runCorpusRetrievalEval,
  scoreQuestion,
} from '../lib/ri/semantic/semantic-retrieval-eval.mjs';
import { loadEvidencePacksFromDir } from '../lib/ri/semantic/semantic-retrieval-eval.mjs';
import { auditPackTextCoverage, normalizePackForFullSemanticIndex } from '../lib/ri/semantic/evidence-pack-full-text.mjs';

const SUITE = join(REPO_ROOT, 'docs', 'eval', 'ask-ri-v2-eval-suite-v2.1.json');
const OUT_JSON = join(REPO_ROOT, 'docs', 'eval', 'phase-2b2-step-f-v2-retrieval-report.json');
const OUT_MD = join(REPO_ROOT, 'docs', 'eval', 'phase-2b2-step-f-v2-retrieval-report.md');

function summariseGroup(results, { positive = false } = {}) {
  const total = results.length;
  if (!total) return { count: 0 };
  if (positive) {
    const recall = results.filter((r) => {
      const expected = r.expectedPublicationIds || [];
      if (!expected.length) return r.noMatchDecision?.abstain;
      return expected.includes(r.publicationSelected);
    }).length;
    return {
      count: total,
      recallTop1: recall,
      falseNegatives: results.filter((r) => {
        const expected = r.expectedPublicationIds || [];
        return expected.length && !expected.includes(r.publicationSelected) && !r.noMatchDecision?.abstain;
      }).length,
    };
  }
  return {
    count: total,
    abstainCorrect: results.filter((r) => r.correctlyRejected).length,
    falsePositives: results.filter((r) => !r.correctlyRejected).length,
  };
}

async function main() {
  const dev = JSON.parse(readFileSync(DEVELOPMENT_RETRIEVAL_PROBES_STEP_F_V2, 'utf8'));

  const exportAudit = [];
  for (const dir of [EVIDENCE_PACKS_DIR, AUTHENTIC_CORPUS_B1_DIR]) {
    for (const { file, pack } of loadEvidencePacksFromDir(dir)) {
      pack.packFile = file;
      const before = auditPackTextCoverage(pack);
      const after = auditPackTextCoverage(normalizePackForFullSemanticIndex(pack));
      exportAudit.push({ file, before, after });
    }
  }

  const original = await runCorpusRetrievalEval({
    corpusLabel: 'original_three_publications_fulltext',
    packsDirs: [EVIDENCE_PACKS_DIR],
    evalSuitePath: SUITE,
    extraNegativeProbes: [],
  });

  const correctedB1 = await runCorpusRetrievalEval({
    corpusLabel: 'authentic_b1_expanded_fulltext',
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
    phase: '2B.2-F-v2',
    generatedAt: new Date().toISOString(),
    features: ['full_text_pack_normalize', 'semantic_retrieval_authority_gate', 'dev_probes_v2'],
    evidenceExportAuditSummary: {
      packs: exportAudit.length,
      hadSampleGapBefore: exportAudit.filter((r) => r.before.missingBlocks > 0).length,
      fullAfterNormalize: exportAudit.filter((r) => r.after.fullExport).length,
    },
    originalCorpus: { chunkTokenStats: original.chunkTokenStats, metrics: original.metrics },
    correctedB1Corpus: {
      chunkTokenStats: correctedB1.chunkTokenStats,
      metrics: correctedB1.metrics,
      distinctPublications: correctedB1.distinctPublications,
    },
    developmentProbes: {
      dataset: dev.datasetVersion,
      threshold,
      byCategory: Object.fromEntries(
        Object.entries(byCategory).map(([cat, rows]) => [
          cat,
          summariseGroup(rows, { positive: cat.includes('positive') || cat === 'original_frozen_suite' }),
        ]),
      ),
      results: devResults,
    },
  };

  writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));

  const unrel = report.developmentProbes.byCategory.unrelated_negative || {};
  writeFileSync(
    OUT_MD,
    [
      '# Phase 2B.2 Step F v2 — retrieval evaluation',
      '',
      `Generated: ${report.generatedAt}`,
      '',
      `| Corpus | Chunks | max tok | >450 | Recall@1 (frozen) |`,
      `|--------|-------:|--------:|-----:|----------------:|`,
      `| Original | ${original.chunkTokenStats.count} | ${original.chunkTokenStats.max} | ${original.chunkTokenStats.overIndexLimit} | ${original.metrics.publicationRecallTop1}/${original.metrics.publicationRecallTop1Denom} |`,
      `| B1 full-text | ${correctedB1.chunkTokenStats.count} | ${correctedB1.chunkTokenStats.max} | ${correctedB1.chunkTokenStats.overIndexLimit} | ${correctedB1.metrics.publicationRecallTop1}/${correctedB1.metrics.publicationRecallTop1Denom} |`,
      '',
      `Unrelated authority negatives: ${unrel.abstainCorrect ?? 0}/${unrel.count ?? 0} abstain, FP ${unrel.falsePositives ?? 0}`,
      '',
    ].join('\n'),
  );

  console.log(
    JSON.stringify({
      ok: true,
      b1Chunks: correctedB1.chunkTokenStats.count,
      unrelFp: unrel.falsePositives,
      sampleGapsFixed: report.evidenceExportAuditSummary.hadSampleGapBefore,
    }),
  );
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e.message }));
  process.exit(2);
});
