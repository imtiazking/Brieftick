#!/usr/bin/env node
/**
 * Phase 2B.2 Batch B2 — offline retrieval eval (original / B1 / B2 corpora).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AUTHENTIC_CORPUS_B1_DIR,
  AUTHENTIC_CORPUS_B2_DIR,
  DEVELOPMENT_RETRIEVAL_PROBES_STEP_B2_V3,
  DEVELOPMENT_RETRIEVAL_PROBES_STEP_F_V2,
  EVIDENCE_PACKS_DIR,
  REPO_ROOT,
} from '../lib/ri/eval/eval-paths.mjs';
import {
  buildSemanticIndex,
  runCorpusRetrievalEval,
  scoreQuestion,
  loadEvidencePacksFromDir,
} from '../lib/ri/semantic/semantic-retrieval-eval.mjs';
import { auditPackTextCoverage, normalizePackForFullSemanticIndex } from '../lib/ri/semantic/evidence-pack-full-text.mjs';

const SUITE = join(REPO_ROOT, 'docs', 'eval', 'ask-ri-v2-eval-suite-v2.1.json');
const OUT_JSON = join(REPO_ROOT, 'docs', 'eval', 'phase-2b2-b2-retrieval-report.json');
const OUT_MD = join(REPO_ROOT, 'docs', 'eval', 'phase-2b2-b2-retrieval-report.md');

function summariseGroup(results, { positive = false } = {}) {
  const total = results.length;
  if (!total) return { count: 0 };
  if (positive) {
    const recall = results.filter((r) => {
      const expected = r.expectedPublicationIds || [];
      if (!expected.length) return r.noMatchDecision?.abstain;
      if (r.allowMultiplePublications) {
        const selected = new Set([r.publicationSelected, ...r.rankedPublications.slice(0, 5).map((p) => p.publicationId)]);
        return expected.every((id) => selected.has(id));
      }
      return expected.includes(r.publicationSelected);
    }).length;
    return {
      count: total,
      recallTop1: recall,
      falseNegatives: results.filter((r) => {
        const expected = r.expectedPublicationIds || [];
        if (!expected.length) return false;
        if (r.allowMultiplePublications) {
          const selected = new Set([r.publicationSelected, ...r.rankedPublications.slice(0, 5).map((p) => p.publicationId)]);
          return !expected.every((id) => selected.has(id)) && !r.noMatchDecision?.abstain;
        }
        return !expected.includes(r.publicationSelected) && !r.noMatchDecision?.abstain;
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
  const devV3 = JSON.parse(readFileSync(DEVELOPMENT_RETRIEVAL_PROBES_STEP_B2_V3, 'utf8'));
  const devV2 = JSON.parse(readFileSync(DEVELOPMENT_RETRIEVAL_PROBES_STEP_F_V2, 'utf8'));

  const exportAudit = [];
  for (const dir of [EVIDENCE_PACKS_DIR, AUTHENTIC_CORPUS_B1_DIR, AUTHENTIC_CORPUS_B2_DIR]) {
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

  const corpusB1 = await runCorpusRetrievalEval({
    corpusLabel: 'authentic_b1_expanded_fulltext',
    packsDirs: [AUTHENTIC_CORPUS_B1_DIR],
    evalSuitePath: SUITE,
    extraNegativeProbes: [],
  });

  const corpusB2 = await runCorpusRetrievalEval({
    corpusLabel: 'authentic_b2_expanded_fulltext',
    packsDirs: [AUTHENTIC_CORPUS_B2_DIR],
    evalSuitePath: SUITE,
    extraNegativeProbes: [],
  });

  const b2Index = await buildSemanticIndex(AUTHENTIC_CORPUS_B2_DIR);
  const threshold = corpusB2.provisionalThreshold;

  const devResults = [];
  for (const probe of devV3.probes) {
    const result = await scoreQuestion(b2Index, probe.question, probe, threshold);
    const expected = probe.expectedPublicationIds || [];
    result.expectedPublicationIds = expected;
    result.allowMultiplePublications = probe.allowMultiplePublications === true;
    if (expected.length) {
      if (probe.allowMultiplePublications) {
        const top5 = new Set(result.rankedPublications.slice(0, 5).map((p) => p.publicationId));
        result.publicationRecallTop1 = expected.includes(result.publicationSelected);
        result.publicationRecallTop5 = expected.every((id) => top5.has(id));
      } else {
        result.publicationRecallTop1 = expected.includes(result.publicationSelected);
        result.publicationRecallTop5 = expected.some((id) =>
          result.rankedPublications.slice(0, 5).some((p) => p.publicationId === id),
        );
      }
    } else {
      result.correctlyRejected = result.noMatchDecision.abstain;
    }
    result.category = probe.category;
    result.testId = probe.testId;
    devResults.push(result);
  }

  const byCategory = {};
  for (const r of devResults) {
    byCategory[r.category] = byCategory[r.category] || [];
    byCategory[r.category].push(r);
  }

  const nearMissV2OnB2 = [];
  for (const probe of devV2.probes.filter((p) => p.category === 'near_miss_negative')) {
    const result = await scoreQuestion(b2Index, probe.question, probe, threshold);
    result.correctlyRejected = result.noMatchDecision.abstain;
    result.testId = probe.testId;
    nearMissV2OnB2.push(result);
  }

  const report = {
    phase: '2B.2-B2',
    generatedAt: new Date().toISOString(),
    features: ['full_text_pack_normalize', 'semantic_retrieval_authority_gate', 'dev_probes_v3', 'b2_corpus'],
    evidenceExportAuditSummary: {
      packs: exportAudit.length,
      hadSampleGapBefore: exportAudit.filter((r) => r.before.missingBlocks > 0).length,
      fullAfterNormalize: exportAudit.filter((r) => r.after.fullExport).length,
      totalIndexedBlocksAfterNormalize: exportAudit.reduce((a, r) => a + r.after.indexedBlocks, 0),
    },
    originalCorpus: { chunkTokenStats: original.chunkTokenStats, metrics: original.metrics },
    b1Corpus: { chunkTokenStats: corpusB1.chunkTokenStats, metrics: corpusB1.metrics, distinctPublications: corpusB1.distinctPublications },
    b2Corpus: {
      chunkTokenStats: corpusB2.chunkTokenStats,
      metrics: corpusB2.metrics,
      distinctPublications: corpusB2.distinctPublications,
    },
    developmentProbesV3: {
      dataset: devV3.datasetVersion,
      threshold,
      byCategory: Object.fromEntries(
        Object.entries(byCategory).map(([cat, rows]) => [
          cat,
          summariseGroup(rows, {
            positive:
              cat.includes('positive') ||
              cat === 'original_frozen_suite' ||
              cat === 'wholesale_banking_positive' ||
              cat === 'access_cash_temporal',
          }),
        ]),
      ),
      results: devResults,
    },
    nearMissComparison: {
      note: 'Threshold not tuned; frozen near-miss probes from step-f-v2 re-run on B2 corpus',
      falsePositives: nearMissV2OnB2.filter((r) => !r.correctlyRejected).length,
      abstainCorrect: nearMissV2OnB2.filter((r) => r.correctlyRejected).length,
      results: nearMissV2OnB2.map((r) => ({
        testId: r.testId,
        abstain: r.noMatchDecision?.abstain,
        publicationSelected: r.publicationSelected,
      })),
    },
  };

  writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));

  const b2Pos = report.developmentProbesV3.byCategory.b2_positive || {};
  const temporal = report.developmentProbesV3.byCategory.access_cash_temporal || {};
  writeFileSync(
    OUT_MD,
    [
      '# Phase 2B.2 Batch B2 — retrieval evaluation',
      '',
      `Generated: ${report.generatedAt}`,
      '',
      '| Corpus | Chunks | max tok | >450 | Recall@1 (frozen suite) |',
      '|--------|-------:|--------:|-----:|----------------------:|',
      `| Original (3) | ${original.chunkTokenStats.count} | ${original.chunkTokenStats.max} | ${original.chunkTokenStats.overIndexLimit} | ${original.metrics.publicationRecallTop1}/${original.metrics.publicationRecallTop1Denom} |`,
      `| B1 (8) | ${corpusB1.chunkTokenStats.count} | ${corpusB1.chunkTokenStats.max} | ${corpusB1.chunkTokenStats.overIndexLimit} | ${corpusB1.metrics.publicationRecallTop1}/${corpusB1.metrics.publicationRecallTop1Denom} |`,
      `| B2 (14) | ${corpusB2.chunkTokenStats.count} | ${corpusB2.chunkTokenStats.max} | ${corpusB2.chunkTokenStats.overIndexLimit} | ${corpusB2.metrics.publicationRecallTop1}/${corpusB2.metrics.publicationRecallTop1Denom} |`,
      '',
      `B2 development positives Recall@1 proxy: ${b2Pos.recallTop1 ?? 0}/${b2Pos.count ?? 0}`,
      `Access-to-cash temporal: ${temporal.recallTop1 ?? 0}/${temporal.count ?? 0}`,
      `Near-miss FPs on B2 corpus (v2 probes, no threshold tune): ${report.nearMissComparison.falsePositives}`,
      '',
    ].join('\n'),
  );

  console.log(
    JSON.stringify({
      ok: true,
      b2Chunks: corpusB2.chunkTokenStats.count,
      b2Publications: corpusB2.distinctPublications,
      b2PosRecall: b2Pos.recallTop1,
      nearMissFp: report.nearMissComparison.falsePositives,
    }),
  );
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e.message }));
  process.exit(2);
});
